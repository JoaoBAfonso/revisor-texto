// Importa a legislação consolidada em vigor do Diário da República Eletrónico (DRE) para o «cérebro jurídico».
//
// O DRE é uma aplicação OutSystems: o que o site mostra vem de «screenservices» JSON, que se podem chamar sem
// navegador. Dois passos:
//   1. listar: percorre todos os temas de «Legislação por tema» e guarda os diplomas com consolidação concluída;
//   2. descarregar: pede o texto consolidado (artigo a artigo) de cada um e grava data/lei/d<id>.json.
//
//   node corpus/dre.mjs             lista (se preciso) e descarrega o que falta
//   node corpus/dre.mjs --list      refaz a lista de diplomas
//   node corpus/dre.mjs --force     volta a descarregar tudo
//   node corpus/dre.mjs --limit 20  só os primeiros N (ensaio)
//
// Depois: node corpus/build.mjs --index. Se o DRE mudar a aplicação, as respostas trazem hasApiVersionChanged: refazer
// os modelos dre/tema.json e dre/detalhe.json copiando um pedido real do navegador (separador Rede).
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOPICS } from '../guia.js';
import { CATALOG } from './catalog.mjs';
import { parseFragments, parseOriginal, clean } from './dre-parse.mjs';

const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'data', 'lei');
const DOCS = join(HERE, 'dre', 'docs.json');
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const LIMIT = args.includes('--limit') ? Number(args[args.indexOf('--limit') + 1]) : Infinity;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const template = (n) => JSON.parse(readFileSync(join(HERE, 'dre', `${n}.json`), 'utf8'));

const API = 'https://diariodarepublica.pt/dr/screenservices/dr/';
const HEADERS = { 'content-type': 'application/json; charset=UTF-8', accept: 'application/json', 'outsystems-locale': 'pt-PT', 'x-csrftoken': 'T6C+9iB49TLra4jEsMeSckDMNhQ=' };
const TEMAS_VERSION = 'W6Z88O2FRdSYvj7pz0TVlg';

async function call(path, body, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(API + path, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.versionInfo?.hasApiVersionChanged || json.versionInfo?.hasModuleVersionChanged) throw Object.assign(new Error('O DRE mudou a aplicação: refazer os modelos dre/*.json'), { fatal: true });
      return json;
    } catch (e) {
      if (e.fatal || i >= tries) throw e;
      await sleep(1500 * (i + 1));
    }
  }
}

// ── Classificação ────────────────────────────────────────────────────────────────────────────────
// 0 Constituição · 2 valor reforçado · 3 códigos · 4 leis e decretos-leis · 5 regional e regulamentar · 6 portarias e afins
const RANK_BY_TYPE = [
  [/^Decreto de Aprova[çc][ãa]o da Constitui/i, 0],
  [/^(Lei Constitucional|Lei Org[âa]nica|Lei de Bases|Regimento)/i, 2],
  [/^(Lei|Decreto-Lei|Decreto|Resolu[çc][ãa]o da Assembleia da Rep[úu]blica)$/i, 4],
  [/^(Decreto Legislativo Regional|Decreto Regulamentar|Decreto Regional|Decreto do Presidente)/i, 5],
];
function rankOf(d) {
  if (/^C[óo]digo\b/i.test(d.designacao || '')) return 3;
  if (/^(Estatuto|Lei de Bases|Bases Gerais|Regime Geral)\b/i.test(d.designacao || '') && /^(Lei|Decreto-Lei)$/i.test(d.tipo)) return 2;
  return RANK_BY_TYPE.find(([re]) => re.test(d.tipo))?.[1] ?? 6;
}

const TOPIC_KEYS = TOPICS.map((t) => ({ id: t.id, keys: t.keys.map(plain).filter((k) => k.length >= 5) }));
function areasOf(d) {
  const hay = ` ${plain(`${d.designacao || ''} ${d.temas.join(' ')}`)} `;
  return TOPIC_KEYS.map((t) => ({ id: t.id, n: t.keys.filter((k) => hay.includes(k)).length })).filter((t) => t.n).sort((a, b) => b.n - a.n).slice(0, 3).map((t) => t.id);
}

const SLUG = (s) => plain(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const SIGLA = /^(.*?)\s+-\s+[A-Za-zÇç]{2,12}$/;
const shortOf = (d) => {
  const base = (d.designacao || '').replace(SIGLA, '$1').trim();
  if (base && base.length <= 70) return base;
  return d.numero ? `${d.tipo} n.º ${d.numero}` : `${d.tipo} de ${d.ano}`;
};

// Diplomas que o catálogo manual (PGDL) já cobre: ficam com a versão do catálogo para não duplicar.
const norm = (s) => plain(s).replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const CAT = CATALOG.map((c) => ({ id: c.id, keys: [norm(c.name), norm(c.short)].filter((k) => k.length >= 12) }));
const coveredBy = (d) => {
  const n = norm((d.designacao || '').replace(SIGLA, '$1'));
  return n.length >= 12 ? CAT.find((c) => c.keys.some((k) => k === n || k.startsWith(n) || n.startsWith(k)))?.id : null;
};

// ── 1b. Completar: diplomas citados no guia que os temas do DRE não listam ───────────────────────
const CITED = /(Lei Org[âa]nica|Lei Constitucional|Lei|Decreto-Lei|Decreto Legislativo Regional|Decreto Regulamentar|Decreto)\s+n\.?º\s*(\d+(?:-[A-Z])?\/\d{2,4})/gi;
async function complete(all) {
  const metaFile = join(OUT, 'meta.json');
  const known = existsSync(metaFile) ? JSON.parse(readFileSync(metaFile, 'utf8')).docs.map((d) => d.title.replace(/[º°]/g, 'º')).join('\n') : '';
  const cited = new Set();
  for (const t of TOPICS) for (const text of [...(t.refs || []), ...(t.deadlines || []).map((d) => d.base)]) for (const m of text.matchAll(CITED)) cited.add(`${m[1]}|${m[2]}`);
  const base = template('pesquisa');
  for (const c of cited) {
    const [tipo, num] = c.split('|');
    if ([...all.values()].some((d) => d.numero === num && plain(d.tipo) === plain(tipo))) continue;
    // Os títulos do PGDL abreviam «Decreto-Lei» para «DL»: aceitam-se as duas formas.
    const t = /^decreto-lei$/i.test(tipo) ? '(?:Decreto-Lei|DL)' : tipo;
    if (new RegExp(`(?<![-\\w])${t}\\s+n\\.?º\\s*${num.replace('/', '\\/')}\\b`, 'i').test(known)) continue;
    const body = structuredClone(base);
    const v = body.screenData.variables;
    Object.assign(v, { Pesquisa: { List: [`${tipo} ${num}`] }, PesquisaSimplesFiltro: `${tipo} ${num}`, StartIndex: 0, MaxRecordsPerPage: 25, ResultadosPorPaginaId: 25, MostarApenasVigentes: false });
    const hits = JSON.parse((await call('Pesquisas/PesquisaResultado/DataActionGetPesquisas', body)).data.Resultado).hits.hits;
    const x = hits.map((h) => h._source).find((s) => s.numero === num && plain(s.tipo) === plain(tipo));
    if (x?.consolidacaoEstado === 'CONCLUDED' && x.vigencia === 'VIGENTE' && x.DiplomaFragmentadoId) {
      all.set(x.dbId, { dbId: x.dbId, frag: x.DiplomaFragmentadoId, tipo: x.tipo, numero: x.numero, ano: x.ano, designacao: x.designacao || '', title: x.title, emissor: x.emissor || '', data: x.dataPublicacao, temas: ['Citado no guia'] });
      console.log(`+ ${tipo} n.º ${num}`);
    } else if (x?.vigencia === 'VIGENTE') {
      // Vigente mas sem consolidação no DRE: o texto original do ato é a versão corrente e importa-se tal e qual.
      const sumario = clean(x.sumario || '').split('\n')[0];
      all.set(x.dbId, { dbId: x.dbId, frag: '', original: true, tipo: x.tipo, numero: x.numero, ano: x.ano, designacao: x.designacao || sumario, title: x.title, emissor: x.emissor || '', data: x.dataPublicacao, temas: ['Citado no guia'] });
      console.log(`+ ${tipo} n.º ${num} (texto original, sem consolidação)`);
    } else console.log(`? ${tipo} n.º ${num}: ${x ? `sem vigência (${x.vigencia})` : 'não encontrado'}`);
    await sleep(150);
  }
}


async function list() {
  const base = template('tema');
  const temas = (await call('MenusParaPesquisa/LegislacaoPorTema/DataActionGetTemas', {
    versionInfo: { ...base.versionInfo, apiVersion: TEMAS_VERSION }, viewName: 'MenusParaPesquisa.LegislacaoPorTema',
    screenData: { variables: { SearchText: '', TagId: '0', IsLoadingThemes: true, _tagIdInDataFetchStatus: 1, TemasListParteI: { List: [], EmptyListItem: {} }, TemasListParteII: { List: [], EmptyListItem: {} }, TemasListForMobile: { List: [], EmptyListItem: {} } } },
    clientVariables: base.clientVariables,
  })).data.TemasList.List;
  const all = new Map();
  for (const t of temas) {
    for (let start = 0; ; start += 100) {
      const body = structuredClone(base);
      const v = body.screenData.variables;
      Object.assign(v, { AreaTematica: t.Titulo, StartIndex: start, MaxRecordsPerPage: 100, ResultadosPorPaginaId: 100, MostarApenasVigentes: false });
      v.VarsForPesquisaPorTema.AreaTematica = t.Titulo;
      const hits = JSON.parse((await call('Pesquisas/PesquisaResultado/DataActionGetPesquisaByTema', body)).data.Resultados).hits.hits;
      for (const { _source: x } of hits) {
        if (x.consolidacaoEstado !== 'CONCLUDED' || x.vigencia !== 'VIGENTE' || !x.DiplomaFragmentadoId) continue;
        if (!all.has(x.dbId)) all.set(x.dbId, { dbId: x.dbId, frag: x.DiplomaFragmentadoId, tipo: x.tipo, numero: x.numero || '', ano: x.ano, designacao: x.designacao || '', title: x.title, emissor: x.emissor || '', data: x.dataPublicacao, temas: [] });
        all.get(x.dbId).temas.push(t.Titulo);
      }
      if (hits.length < 100) break;
      await sleep(150);
    }
    console.log(`${t.Titulo.padEnd(40)} ${String(all.size).padStart(5)}`);
  }
  await complete(all);
  const docs = [...all.values()].flatMap((d) => {
    const c = coveredBy(d);
    const cat = c && CATALOG.find((x) => x.id === c);
    // O catálogo (PGDL) manda quando já tem o texto; se falhou (EOA, segurança interna…), o DRE entra com os dados do catálogo.
    if (cat && existsSync(join(OUT, `${cat.id}.json`))) return [];
    return [{ d, cat }];
  }).map(({ d, cat }) => ({
    id: cat ? cat.id : `d${d.dbId}`, dbId: d.dbId, frag: d.frag, tipo: d.tipo, numero: d.numero, ano: d.ano, data: d.data, emissor: d.emissor,
    ...(d.original ? { original: true } : {}),
    name: cat ? cat.name : d.designacao || d.title.replace(/\s+-\s+Di[áa]rio.*$/, '').trim(),
    short: cat ? cat.short : shortOf(d), rank: cat ? cat.rank : rankOf(d), area: cat ? cat.area : areasOf(d), temas: d.temas,
    url: d.original
      ? `https://diariodarepublica.pt/dr/detalhe/${SLUG(d.tipo)}/${String(d.numero).replace('/', '-')}-${d.dbId}`
      : `https://diariodarepublica.pt/dr/legislacao-consolidada/${SLUG(d.tipo)}/${d.ano}-${d.frag}`,
  })).sort((a, b) => a.rank - b.rank || a.ano - b.ano);
  // Mantém diplomas de listas anteriores já descarregados (p. ex. os que o complete() acrescentou e que
  // o filtro do meta.json agora salta): sem isto, refazer a lista expulsava-os do corpus.
  const prev = existsSync(DOCS) ? JSON.parse(readFileSync(DOCS, 'utf8')) : [];
  for (const d of prev) if (!docs.some((x) => x.id === d.id) && existsSync(join(OUT, `${d.id}.json`))) docs.push(d);
  docs.sort((a, b) => a.rank - b.rank || a.ano - b.ano);
  writeFileSync(DOCS, JSON.stringify(docs));
  return docs;
}

// ── 2. Descarregar ───────────────────────────────────────────────────────────────────────────────
// Atos vigentes sem consolidação: o texto original (Conteudo_Detalhe) é a versão corrente.
async function fetchOriginalDoc(d) {
  const body = template('original');
  Object.assign(body.screenData.variables, { Tipo: SLUG(d.tipo), Key: `${String(d.numero).replace('/', '-')}-${d.dbId}` });
  const det = (await call('Legislacao_Conteudos/Conteudo_Detalhe/DataActionGetAllConteudoDetalheData', body)).data?.DetalheConteudo;
  const parsed = parseOriginal(det?.Texto || '');
  if (!parsed.arts.length) throw new Error('sem artigos no texto original');
  const doc = { id: d.id, name: d.name, short: d.short, rank: d.rank, area: d.area, url: d.url, title: d.name, secs: parsed.secs, arts: parsed.arts };
  writeFileSync(join(OUT, `${d.id}.json`), JSON.stringify(doc));
  return doc;
}

async function fetchDoc(d) {
  if (d.original) return fetchOriginalDoc(d);
  const body = template('detalhe');
  const v = body.screenData.variables;
  Object.assign(v, { DiplomaLegisId: String(d.dbId), DiplomaFragId: String(d.frag), DataSelecionada: new Date().toISOString().slice(0, 10), DataAux: new Date().toISOString().slice(0, 10), FragmentoVersaoId: '0', ELI_HTML: '', Ano: Number(d.ano), Tipo: SLUG(d.tipo), Key: `${d.ano}-${d.frag}` });
  const list = (await call('LegislacaoConsolidada/LegCons_Detalhe/DataActionGetData', body)).data?.LegConsBase?.List || [];
  const parsed = parseFragments(list, d.id);
  if (!parsed.arts.length) throw new Error('sem artigos');
  const doc = { id: d.id, name: d.name, short: d.short, rank: d.rank, area: d.area, url: d.url, title: d.name, secs: parsed.secs, arts: parsed.arts };
  writeFileSync(join(OUT, `${d.id}.json`), JSON.stringify(doc));
  return doc;
}

const docs = !args.includes('--list') && existsSync(DOCS) ? JSON.parse(readFileSync(DOCS, 'utf8')) : await list();
console.log(`\n${docs.length} diplomas consolidados em vigor.\n`);
let done = 0;
let failed = 0;
for (const d of docs) {
  if (done >= LIMIT) break;
  if (!FORCE && existsSync(join(OUT, `${d.id}.json`))) continue;
  try {
    const doc = await fetchDoc(d);
    done++;
    if (done % 25 === 0) console.log(`  ${done} descarregados… (${d.short})`);
  } catch (e) {
    if (e.fatal) { console.error(e.message); process.exit(1); }
    failed++;
    console.log(`✗ ${d.id} ${d.short}: ${e.message}`);
  }
  await sleep(120);
}
console.log(`\nConcluído: ${done} descarregados, ${failed} falhados.`);

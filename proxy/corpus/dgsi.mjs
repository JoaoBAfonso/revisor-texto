// Importa jurisprudência do DGSI (www.dgsi.pt) para o «cérebro jurídico»: percorre as bases de acórdãos
// (Lotus Domino, listas paginadas por ?OpenDatabase&Start=N), guarda os metadados e o sumário de cada
// acórdão e liga cada sumário aos artigos do corpus que cita («art. 483.º do CC» → cc:483).
//
// O texto integral fica no DGSI (só se guarda a ligação): o sumário é a unidade útil — curto, citável
// e redigido pelo próprio tribunal.
//
//   node corpus/dgsi.mjs                      atualiza as bases (para em DESDE ou no já conhecido)
//   node corpus/dgsi.mjs --desde 2023-01-01   recua o limite temporal
//   node corpus/dgsi.mjs --base jstj,jsta     só estas bases
//   node corpus/dgsi.mjs --emit               só regenera data/juris (sem rede)
//
// O estado fica em corpus/dgsi/<base>.json (unid → acórdão, ou 0 se visto sem sumário aproveitável);
// a saída é data/juris/<diploma>.json: { arts: { '483': [índices] }, acs: [{ t, p, d, u, s, … }] }.
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ALIASES } from './catalog.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const LEI = join(HERE, '..', '..', 'data', 'lei');
const OUT = join(HERE, '..', '..', 'data', 'juris');
const STATE = join(HERE, 'dgsi');
mkdirSync(OUT, { recursive: true });
mkdirSync(STATE, { recursive: true });

const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const DESDE = opt('--desde', '2025-01-01');
const EMIT_ONLY = args.includes('--emit');
const BASES = [
  ['jstj', 'STJ'],
  ['jsta', 'STA'],
  ['jtrl', 'TRL'],
  ['jtrp', 'TRP'],
  ['jtrc', 'TRC'],
  ['jtrg', 'TRG'],
  ['jtre', 'TRE'],
].filter(([b]) => !opt('--base') || opt('--base').split(',').includes(b));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36' };

async function get(url, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { headers: UA });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // O DGSI serve em ISO-8859-1.
      return Buffer.from(await res.arrayBuffer()).toString('latin1');
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(1200 * (i + 1));
    }
  }
}

// ── HTML → linhas de texto ───────────────────────────────────────────────────────────────────────
const ENT = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ordm: 'º', ordf: 'ª' };
const toLines = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, '')
  .replace(/<br\s*\/?>/gi, '\n')
  .replace(/<\/(tr|p|div|td|h\d|li)>/gi, '\n')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&([a-z]+);/gi, (m, e) => ENT[e.toLowerCase()] ?? m)
  .split('\n').map((l) => l.replace(/\s+/g, ' ').trim());

// ── Campos do documento ──────────────────────────────────────────────────────────────────────────
const LABEL = /^(Processo|N[ºo] Convencional|N[ºo] do Documento|Relator|Adjunt[oa]s?|Descritores|Data d[oa] Acord[ãa]o|Data da Decis[ãa]o(?: Sum[áa]ria)?|Data|Vota[çc][ãa]o|Tribunal(?: Recorrido)?|Texto Integral|Privacidade|Meio Processual|Decis[ãa]o|Sum[áa]rio|Decis[ãa]o Texto Integral|Legisla[çc][ãa]o Nacional|Legisla[çc][ãa]o Comunit[áa]ria|Legisla[çc][ãa]o Estrangeira|Jurisprud[êe]ncia (?:Nacional|Internacional|Comunit[áa]ria|Estrangeira)|Refer[êe]ncia a Doutrina|Refer[êe]ncias Internacionais|Outras Fontes|Indica[çc][õo]es Eventuais|[ÁA]rea Tem[áa]tica\s*\d*|Aditamento|Recorrente|Recorrid[oa]s?\s*\d*|Recursos?|Requerente|Requerido|Apelante|Apelado|Objec?to|Quest[õo]es|Observa[çc][õo]es)\s*:\s*(.*)$/i;

function parseDoc(html) {
  const fields = {};
  let cur = null;
  for (const line of toLines(html)) {
    if (!line) continue;
    const m = LABEL.exec(line);
    if (m) {
      cur = m[1].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ');
      fields[cur] = m[2] ? [m[2]] : [];
      continue;
    }
    if (cur) fields[cur].push(line);
  }
  const f = (k) => (fields[k] || []).join('\n').trim();
  const date = /(\d{2})\/(\d{2})\/(\d{4})/.exec(f('data do acordao') || f('data da decisao') || f('data da decisao sumaria') || f('data'));
  return {
    proc: f('processo').split('\n')[0],
    date: date ? `${date[3]}-${date[1]}-${date[2]}` : '',
    desc: (fields.descritores || []).slice(0, 6),
    meio: f('meio processual').split('\n')[0],
    dec: f('decisao').split('\n')[0],
    vot: f('votacao').split('\n')[0],
    sum: f('sumario'),
    legis: f('legislacao nacional'),
  };
}

// ── Citações de artigos no sumário ───────────────────────────────────────────────────────────────
// Alias do catálogo + abreviaturas típicas da jurisprudência + siglas do direito da UE.
const DOC_ALIASES = [...ALIASES];
const add = (id, re) => { if (existsSync(join(LEI, `${id}.json`))) DOC_ALIASES.push([id, re]); };
add('crpred', /^(?:CRgP|CRPred\.?|C[óo]d(?:igo)?\.?\s*(?:d[oe])?\s*Reg(?:isto)?\.?\s*Predial)/i);
add('crciv', /^(?:CRCiv\.?|C[óo]d(?:igo)?\.?\s*(?:d[oe])?\s*Reg(?:isto)?\.?\s*Civil)/i);
add('cnot', /^(?:CNot\.?|C[óo]d(?:igo)?\.?\s*(?:d[oe])?\s*Notariado)/i);
add('cest', /^C[óo]d(?:igo)?\.?\s*da\s*Estrada/i);
add('d376273', /^(?:RGCO|RGCOC|Regime Geral das Contra-?[Oo]rdena[çc][õo]es)\b/i);
add('cepmpl', /^CEPMPL\b/i);
const EU_DOCS = join(HERE, 'eu', 'docs.json');
if (existsSync(EU_DOCS)) for (const d of JSON.parse(readFileSync(EU_DOCS, 'utf8'))) if (d.alias?.length) DOC_ALIASES.push([d.id, new RegExp(`^(?:${d.alias.join('|')})\\b`, 'i')]);

const NUM = /(\d{1,4})(?:\.?\s*[º°o])?(?:\s*-\s*([A-Z]{1,2})\b)?/gi;
// Entre a lista de artigos e o «do <diploma>» admitem-se números, alíneas e conectores («n.º 2, al. b), do CPC»).
const GAP = /^((?:\s*(?:,|;|e|ou|n\.?[ºo]s?\.?\s*[\d\s,e.()a-z-]*?|al(?:[íi]neas?)?\.?\s*(?:[a-z]{1,2}\)\s*)+|ambos|todos|ss\.?|segs?\.?|seguintes|ex vi|conjugad[oa]s?(?:\s+com)?|aplic[áa]vel(?:\s+ex vi)?))*?)\s*d[oa]s?\s+(.{1,90})/i;

export function refsIn(text) {
  const out = new Set();
  const re = /\bart(?:igos?|s?\.|º|\.?º)\s*((?:\d{1,4}(?:\.?\s*[º°o])?(?:\s*-\s*[A-Z]{1,2}\b)?(?:\s*(?:,|\be\b|\bou\b|\ba\b|\bao\b)\s*)?)+)/gi;
  for (const m of String(text).matchAll(re)) {
    const tail = text.slice(m.index + m[0].length, m.index + m[0].length + 120);
    const gap = GAP.exec(tail);
    if (!gap) continue;
    const hit = DOC_ALIASES.find(([, a]) => a.test(gap[2]));
    if (!hit) continue;
    let previous;
    for (const n of m[1].matchAll(NUM)) {
      const connector = previous ? m[1].slice(previous.index + previous[0].length, n.index).trim() : '';
      if (previous && !previous[2] && !n[2] && /^(a|ao)$/i.test(connector)) {
        const from = Number(previous[1]), to = Number(n[1]);
        for (let k = from + 1; k < to; k++) out.add(`${hit[0]}:${k}`);
      }
      out.add(`${hit[0]}:${n[2] ? `${n[1]}-${n[2].toUpperCase()}` : n[1]}`);
      previous = n;
    }
  }
  return [...out];
}

// Só se guardam ligações a artigos que existem mesmo no corpus.
const artKeys = new Map();
function validRefs(refs) {
  return refs.filter((r) => {
    const [id, k] = r.split(':');
    if (!artKeys.has(id)) {
      const file = join(LEI, `${id}.json`);
      artKeys.set(id, existsSync(file) ? new Set(JSON.parse(readFileSync(file, 'utf8')).arts.map((a) => a.k)) : null);
    }
    return artKeys.get(id)?.has(k) || false;
  });
}

// ── Listagem e descarga ──────────────────────────────────────────────────────────────────────────
const ROW = /(\d{2})\/(\d{2})\/(\d{4})<\/font>[\s\S]*?href="(\/[^"]+\?OpenDocument)">([^<]+)<\/a>/gi;

async function crawl(base, sigla) {
  const stateFile = join(STATE, `${base}.json`);
  const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, 'utf8')) : {};
  const save = () => writeFileSync(stateFile, JSON.stringify(state));
  let added = 0;
  let listed = 0;
  for (let start = 1; ; ) {
    const html = await get(`http://www.dgsi.pt/${base}.nsf?OpenDatabase&Start=${start}`);
    const rows = [...html.matchAll(ROW)].map((m) => ({ date: `${m[3]}-${m[1]}-${m[2]}`, url: m[4], unid: m[4].split('/').pop().split('?')[0] }));
    if (!rows.length) break;
    const batch = rows.filter((r) => r.date >= DESDE && !(r.unid in state));
    for (let i = 0; i < batch.length; i += 4) {
      await Promise.all(batch.slice(i, i + 4).map(async (r) => {
        try {
          const d = parseDoc(await get(`http://www.dgsi.pt${r.url}`));
          const refs = validRefs(refsIn(`${d.sum}\n${d.legis}`));
          state[r.unid] = d.sum && refs.length ? { p: d.proc, d: d.date || r.date, u: r.url, m: d.meio, dec: d.dec, v: d.vot, desc: d.desc, s: d.sum, refs } : 0;
          if (state[r.unid]) added++;
        } catch (e) { console.warn(`${sigla}: falhou ${r.url}: ${e.message}; será tentado na próxima execução.`); }
      }));
      await sleep(250);
      if ((i / 4) % 50 === 49) save();
    }
    listed += rows.length;
    if (listed % 1000 < rows.length) { save(); console.log(`  ${sigla}: ${listed} listados, ${added} com sumário ligado ao corpus`); }
    if (rows.every((r) => r.date < DESDE)) break;
    start += rows.length;
    await sleep(200);
  }
  save();
  console.log(`${sigla}: ${Object.keys(state).length} no estado, +${added} novos com ligações`);
}

// ── Emissão: data/juris/<diploma>.json ───────────────────────────────────────────────────────────
function emit() {
  const byDoc = new Map();
  for (const file of readdirSync(STATE).filter((f) => f.endsWith('.json'))) {
    const base = file.replace('.json', '');
    const sigla = BASES.find(([b]) => b === base)?.[1] || [['jstj', 'STJ'], ['jsta', 'STA'], ['jtrl', 'TRL'], ['jtrp', 'TRP'], ['jtrc', 'TRC'], ['jtrg', 'TRG'], ['jtre', 'TRE']].find(([b]) => b === base)?.[1] || base.toUpperCase();
    const state = JSON.parse(readFileSync(join(STATE, file), 'utf8'));
    for (const rec of Object.values(state)) {
      if (!rec) continue;
      for (const ref of rec.refs) {
        const [id] = ref.split(':');
        if (!byDoc.has(id)) byDoc.set(id, []);
      }
      for (const id of new Set(rec.refs.map((r) => r.split(':')[0]))) {
        byDoc.get(id).push({ t: sigla, p: rec.p, d: rec.d, u: rec.u, m: rec.m, dec: rec.dec, s: rec.s, ks: rec.refs.filter((r) => r.startsWith(`${id}:`)).map((r) => r.split(':')[1]) });
      }
    }
  }
  let total = 0;
  for (const [id, acs] of byDoc) {
    acs.sort((a, b) => (a.d < b.d ? 1 : -1));
    // Limite por diploma: os mais recentes; o DGSI tem sempre o resto.
    const keep = acs.slice(0, 400);
    const arts = {};
    keep.forEach((a, i) => { for (const k of a.ks) (arts[k] ||= []).push(i); });
    writeFileSync(join(OUT, `${id}.json`), JSON.stringify({ arts, acs: keep.map(({ ks, ...a }) => a) }));
    total += keep.length;
  }
  console.log(`\ndata/juris: ${byDoc.size} diplomas, ${total} acórdãos ligados.`);
}

// Só executa quando chamado diretamente (o refsIn também se importa em testes).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!EMIT_ONLY) for (const [base, sigla] of BASES) await crawl(base, sigla);
  emit();
}

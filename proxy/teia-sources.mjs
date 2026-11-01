// Fontes consultadas pela Teia através do Worker. Cada resposta é pequena, normalizada e traz a proveniência
// (fonte, natureza, endereço público e momento da recolha). Os índices de contratos e do Parlamento não passam
// por aqui: o navegador lê-os diretamente de https://joaobafonso.github.io/fumaca-dados/.

export const TEIA_PAGE = 10;
export const TEIA_MAX_OFFSET = 200;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_ARTICLE_CHARS = 60000;
const USER_AGENT = 'FumacaTeia/1.0 (https://github.com/JoaoBAfonso/revisor-texto)';

export const TEIA_SOURCES = {
  'wikidata-pesquisa': { nome: 'Wikidata', natureza: 'secundaria' },
  wikidata: { nome: 'Wikidata', natureza: 'secundaria' },
  dr: { nome: 'Diário da República', natureza: 'primaria' },
  arquivo: { nome: 'Arquivo.pt', natureza: 'secundaria' },
  'arquivo-site': { nome: 'Arquivo.pt', natureza: 'secundaria' },
  wikipedia: { nome: 'Wikipédia', natureza: 'secundaria' },
};

// Propriedades do Wikidata usadas no perfil. Laços familiares ficam de fora de propósito: na Teia só aparecem
// quando constam de uma declaração oficial de um titular de cargo público.
const FORWARD = ['P31', 'P18', 'P569', 'P570', 'P39', 'P102', 'P108', 'P106', 'P69', 'P463', 'P1830', 'P112', 'P127',
  'P749', 'P355', 'P488', 'P169', 'P3320', 'P159', 'P452', 'P571', 'P576', 'P856', 'P1448'];
const REVERSE = ['P112', 'P127', 'P488', 'P169', 'P3320', 'P1037', 'P749'];

// Modelo do pedido de pesquisa do DR (aplicação OutSystems), reduzido às variáveis necessárias. Com este conjunto o
// DR pesquisa todos os conteúdos: diplomas das 1.ª e 2.ª séries, atos societários da 3.ª série (até 2006) e
// jurisprudência. Se o DR mudar a aplicação, atualizar a versão a partir de proxy/corpus/dre/pesquisa.json.
const DR_API = 'https://diariodarepublica.pt/dr/screenservices/dr/Pesquisas/PesquisaResultado/DataActionGetPesquisas';
const DR_VERSION = { moduleVersion: '3RLECzcfCngi2cX7om1Amw', apiVersion: 'PRsQKjEXDVBC3ZSqkS8k6A' };
const DR_HEADERS = { 'content-type': 'application/json; charset=UTF-8', accept: 'application/json', 'outsystems-locale': 'pt-PT', 'x-csrftoken': 'T6C+9iB49TLra4jEsMeSckDMNhQ=' };
const EMPTY_LIST = { List: [], EmptyListItem: '' };
const NO_DATE = '1900-01-01';
const DR_FILTERS = {
  tipoConteudo: EMPTY_LIST, serie: EMPTY_LIST, numero: '', ano: '0', suplemento: '0', dataPublicacao: '',
  dataPublicacaoDe: NO_DATE, dataPublicacaoAte: NO_DATE, parte: '', apendice: '', fasciculo: '', tipo: EMPTY_LIST,
  emissor: EMPTY_LIST, texto: '', sumario: '', entidadeProponente: EMPTY_LIST, numeroDR: '', paginaInicial: '0',
  paginaFinal: '0', dataAssinatura: '', dataDistribuicao: '', entidadePrincipal: EMPTY_LIST, entidadeEmitente: EMPTY_LIST,
  docType: '', proferido: '', processo: '', assunto: '', recorrente: '', recorrido: '', relator: '', empresa: '',
  concelho: '', nif: '', anuncio: '', numeroDoc: '', DataAssinaturaDe: NO_DATE, DataAssinaturaAte: NO_DATE,
  DataDistribuicaoDe: NO_DATE, DataDistribuicaoAte: NO_DATE, semestre: '', IsLegConsolidadaSelected: false,
  IsFromData: false, DescritorList: EMPTY_LIST,
};
const DR_CONTENT = { DiplomaLegis: 'Diploma', ActoSocietario: 'Ato societário', AcordaoSTADiploma: 'Acórdão', DiplomaRegTrab: 'Regulamentação do trabalho' };

const plain = (value) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const slug = (value) => plain(value).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const decode = (value) => value.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m, e) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' }[e]));
const stripTags = (value) => decode(String(value || '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();

// Excerto com destaques → segmentos alternados [texto, destaque, texto, …], para o cliente desenhar sem HTML.
const HIGHLIGHT = /<(?:span[^>]*class=['"](?:highlight|searchmatch)['"][^>]*|em|b|strong)>([\s\S]*?)<\/(?:span|em|b|strong)>/gi;
export function highlightSegments(html) {
  const source = String(html || '');
  const loose = (value) => decode(value.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ');
  const segments = [];
  let last = 0;
  for (const match of source.matchAll(HIGHLIGHT)) {
    segments.push(loose(source.slice(last, match.index)), loose(match[1]));
    last = match.index + match[0].length;
  }
  segments.push(loose(source.slice(last)));
  segments[0] = segments[0].trimStart();
  segments[segments.length - 1] = segments[segments.length - 1].trimEnd();
  return segments;
}

function text(value, label, max = 120) {
  if (typeof value !== 'string') throw new Error(`Falta ${label}.`);
  const clean = value.replace(/\s+/g, ' ').trim();
  if (clean.length < 2 || clean.length > max || /[\u0000-\u001f]/.test(value)) throw new Error(`${label[0].toUpperCase()}${label.slice(1)} entre 2 e ${max} caracteres.`);
  return clean;
}

function domainOf(value) {
  const raw = text(value, 'o site', 200).replace(/^https?:\/\//i, '').split(/[/?#]/)[0].replace(/^www\./i, '').toLowerCase();
  if (!/^(?=.{4,100}$)([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/.test(raw)) throw new Error('Domínio inválido.');
  return raw;
}

// Valida os parâmetros recebidos pelo Worker e devolve um pedido normalizado.
export function teiaRequest(params) {
  const get = (key) => (typeof params.get === 'function' ? params.get(key) : params[key]) ?? null;
  const fonte = get('fonte');
  if (!TEIA_SOURCES[fonte]) throw new Error('Fonte da Teia não suportada.');
  const offset = Number(get('offset') || 0);
  if (!Number.isInteger(offset) || offset < 0 || offset >= TEIA_MAX_OFFSET || offset % TEIA_PAGE) throw new Error('Página de resultados inválida.');
  if (fonte === 'wikidata') {
    const id = String(get('id') || '');
    if (!/^Q[1-9]\d{0,11}$/.test(id)) throw new Error('Identificador Wikidata inválido.');
    return { fonte, id };
  }
  if (fonte === 'arquivo-site') return { fonte, site: domainOf(get('site')) };
  if (fonte === 'wikipedia' && get('titulo')) return { fonte, titulo: text(get('titulo'), 'o título', 200) };
  return { fonte, q: text(get('q'), 'a pesquisa'), offset };
}

async function readLimited(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) throw new Error('A resposta da fonte excede 2 MiB.');
      chunks.push(value);
    }
  } finally { reader.releaseLock?.(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function fetchText(url, init, fetchImpl) {
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(15000), redirect: 'follow', ...init,
    headers: { 'User-Agent': USER_AGENT, ...(init?.headers || {}) } });
  if (response.status === 429) throw new Error('A fonte limitou os pedidos (429). Tenta daqui a pouco.');
  if (!response.ok) throw new Error(`A fonte respondeu com HTTP ${response.status}.`);
  return readLimited(response);
}

async function fetchJson(url, init, fetchImpl) {
  const body = await fetchText(url, init, fetchImpl);
  try { return JSON.parse(body); } catch { throw new Error('A fonte não devolveu JSON válido.'); }
}

const qid = (iri) => /\/(Q\d+)$/.exec(iri || '')?.[1] || null;
const day = (value) => (/^[+-]?\d{4}-\d{2}-\d{2}/.test(value || '') ? value.replace(/^\+/, '').slice(0, 10) : '');

export function wikidataProfileQuery(id) {
  if (!/^Q[1-9]\d{0,11}$/.test(id)) throw new Error('Identificador Wikidata inválido.');
  const forward = FORWARD.map((p) => `("${p}" p:${p} ps:${p})`).join(' ');
  const reverse = REVERSE.map((p) => `("~${p}" p:${p} ps:${p})`).join(' ');
  return `SELECT ?p ?v ?vLabel ?start ?end ?of ?ofLabel WHERE {
  { VALUES (?p ?pp ?ps) { ${forward} }
    wd:${id} ?pp ?st . ?st ?ps ?v . MINUS { ?st wikibase:rank wikibase:DeprecatedRank }
    OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end } OPTIONAL { ?st pq:P642 ?of } }
  UNION { VALUES (?p ?pp ?ps) { ${reverse} }
    ?v ?pp ?st . ?st ?ps wd:${id} . MINUS { ?st wikibase:rank wikibase:DeprecatedRank }
    OPTIONAL { ?st pq:P580 ?start } OPTIONAL { ?st pq:P582 ?end } }
  UNION { BIND("ptwiki" AS ?p) ?v schema:about wd:${id} ; schema:isPartOf <https://pt.wikipedia.org/> }
  UNION { BIND("label" AS ?p) wd:${id} rdfs:label ?v FILTER(LANG(?v) IN ("pt", "en")) }
  UNION { BIND("description" AS ?p) wd:${id} schema:description ?v FILTER(LANG(?v) IN ("pt", "en")) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "pt,pt-br,en". }
} LIMIT 400`;
}

export function normalizeWikidataProfile(id, bindings) {
  const pick = (p) => bindings.filter((b) => b.p?.value === p);
  const byLang = (rows) => rows.find((b) => b.v['xml:lang'] === 'pt')?.v.value || rows[0]?.v.value || '';
  const seen = new Set();
  const afirmacoes = [];
  for (const b of bindings) {
    const p = b.p?.value;
    if (!p || ['ptwiki', 'label', 'description'].includes(p)) continue;
    const valorId = qid(b.v?.value);
    const isDate = b.v?.datatype === 'http://www.w3.org/2001/XMLSchema#dateTime';
    const statement = {
      p,
      valor: isDate ? day(b.v.value) : (b.vLabel?.value || b.v?.value || '').slice(0, 200),
      ...(valorId ? { valorId } : {}),
      ...(day(b.start?.value) ? { inicio: day(b.start.value) } : {}),
      ...(day(b.end?.value) ? { fim: day(b.end.value) } : {}),
      ...(b.ofLabel?.value ? { de: b.ofLabel.value.slice(0, 200), deId: qid(b.of.value) } : {}),
    };
    const key = JSON.stringify(statement);
    if (seen.has(key)) continue;
    seen.add(key);
    afirmacoes.push(statement);
  }
  const image = pick('P18')[0]?.v.value || '';
  const article = pick('ptwiki')[0]?.v.value || '';
  return {
    id,
    nome: byLang(pick('label')),
    descricao: byLang(pick('description')),
    url: `https://www.wikidata.org/wiki/${id}`,
    ...(article.startsWith('https://pt.wikipedia.org/') ? { artigo: article, tituloArtigo: decodeURIComponent(article.split('/wiki/')[1] || '').replace(/_/g, ' ') } : {}),
    ...(image ? { imagem: `${image.replace(/^http:/, 'https:')}?width=240` } : {}),
    afirmacoes: afirmacoes.filter((a) => a.p !== 'P18'),
  };
}

export function drRequestBody(q, offset = 0, size = TEIA_PAGE) {
  return {
    versionInfo: DR_VERSION, viewName: 'Pesquisas.PesquisaResultado',
    screenData: { variables: {
      FiltrosDePesquisa: DR_FILTERS, TipoOrdenacaoId: 9, OcultarRevogados: false, IsPesquisaSimples: true, Texto: '',
      ComRevogados: false, ComRevogadosAux: false, DataDe: '', DataAte: '', ListaFiltrosEscolhidosParaQuery: EMPTY_LIST,
      TermoPesquisaAvancadaByConteudo: '', PesquisaAvancadaResultadoTexto: '', IsFromData: false,
      Pesquisa: { List: [q] }, PesquisaSimplesFiltro: q, StartIndex: offset, MaxRecordsPerPage: size, ResultadosPorPaginaId: size,
      MostarApenasVigentes: false, DestaqueExcertos: true,
    } },
  };
}

export function drDocumentUrl(source) {
  const content = source.tipoConteudo || source.type;
  if (content === 'DiplomaLegis' && source.tipo && source.numero && source.dbId) {
    return `https://diariodarepublica.pt/dr/detalhe/${slug(source.tipo)}/${String(source.numero).replace(/\//g, '-')}-${source.dbId}`;
  }
  if (source.fileId) return `https://dre.pt/application/file/${source.fileId}`;
  return 'https://diariodarepublica.pt/dr/home';
}

export function normalizeDrHit(hit) {
  const s = hit._source || {};
  const content = s.tipoConteudo || s.type || '';
  const excerpts = (hit.highlight?.texto || hit.highlight?.sumario || []).slice(0, 3).map((h) => highlightSegments(h)).filter((seg) => seg.length > 1);
  return {
    id: String(s.dbId || hit._id || ''),
    conteudo: DR_CONTENT[content] || 'Documento',
    tipo: s.tipo || (content === 'ActoSocietario' ? 'Ato societário' : ''),
    numero: s.numero || '',
    data: s.dataPublicacao || '',
    serie: s.serie || '',
    emissor: s.emissor || '',
    ...(s.empresa ? { empresa: s.empresa } : {}),
    ...(s.concelho ? { concelho: s.concelho } : {}),
    sumario: stripTags(s.sumario).slice(0, 400),
    titulo: stripTags(s.title).slice(0, 200),
    excertos: excerpts,
    url: drDocumentUrl(s),
  };
}

function arquivoDate(stamp) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(stamp || '');
  return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
}

const INTERESTING_PAGE = /client|equipa|team|sobre|about|quem-somos|empresa|socios|parceir|portfolio|servic|contact|projet/i;

export async function teiaCollect(request, fetchImpl = fetch) {
  const fonte = request.fonte;
  const meta = { fonte, ...TEIA_SOURCES[fonte], recolhidoEm: new Date().toISOString() };

  if (fonte === 'wikidata-pesquisa') {
    const url = new URL('https://www.wikidata.org/w/api.php');
    for (const [k, v] of Object.entries({ action: 'wbsearchentities', search: request.q, language: 'pt', uselang: 'pt', type: 'item', limit: '8', continue: String(request.offset), format: 'json' })) url.searchParams.set(k, v);
    const data = await fetchJson(url, { headers: { Accept: 'application/json' } }, fetchImpl);
    if (!Array.isArray(data.search)) throw new Error('Formato inesperado do Wikidata.');
    return { ...meta, url: `https://www.wikidata.org/w/index.php?search=${encodeURIComponent(request.q)}`,
      itens: data.search.slice(0, 8).map((item) => ({ id: String(item.id), nome: String(item.label || item.id), descricao: String(item.description || ''), url: `https://www.wikidata.org/wiki/${item.id}` })) };
  }

  if (fonte === 'wikidata') {
    const url = `https://query.wikidata.org/sparql?format=json&query=${encodeURIComponent(wikidataProfileQuery(request.id))}`;
    const data = await fetchJson(url, { headers: { Accept: 'application/sparql-results+json' } }, fetchImpl);
    if (!Array.isArray(data.results?.bindings)) throw new Error('Formato inesperado do Wikidata.');
    return { ...meta, url: `https://www.wikidata.org/wiki/${request.id}`, perfil: normalizeWikidataProfile(request.id, data.results.bindings) };
  }

  if (fonte === 'dr') {
    const data = await fetchJson(DR_API, { method: 'POST', headers: DR_HEADERS, body: JSON.stringify(drRequestBody(request.q, request.offset)) }, fetchImpl);
    if (data.versionInfo?.hasApiVersionChanged || data.versionInfo?.hasModuleVersionChanged) throw new Error('O Diário da República mudou a aplicação; a pesquisa precisa de ser atualizada.');
    if (data.data?.HasErrorPesquisa || typeof data.data?.Resultado !== 'string') throw new Error('O Diário da República não aceitou a pesquisa.');
    let result;
    try { result = JSON.parse(data.data.Resultado); } catch { throw new Error('Resultado do Diário da República ilegível.'); }
    const hits = result.hits?.hits;
    if (!Array.isArray(hits)) throw new Error('Formato inesperado do Diário da República.');
    const total = Number(result.hits.total?.value ?? result.hits.total ?? 0);
    return { ...meta, url: 'https://diariodarepublica.pt/dr/pesquisa-avancada', q: request.q, total, offset: request.offset,
      haMais: request.offset + hits.length < Math.min(total, TEIA_MAX_OFFSET), itens: hits.slice(0, TEIA_PAGE).map(normalizeDrHit) };
  }

  if (fonte === 'arquivo') {
    const url = new URL('https://arquivo.pt/textsearch');
    for (const [k, v] of Object.entries({ q: request.q, maxItems: String(TEIA_PAGE), offset: String(request.offset), prettyPrint: 'false', fields: 'title,originalURL,linkToArchive,tstamp,snippet' })) url.searchParams.set(k, v);
    const data = await fetchJson(url, { headers: { Accept: 'application/json' } }, fetchImpl);
    if (!Array.isArray(data.response_items)) throw new Error('Formato inesperado do Arquivo.pt.');
    const total = Number(data.estimated_nr_results || 0);
    return { ...meta, url: `https://arquivo.pt/page/search?q=${encodeURIComponent(request.q)}`, q: request.q, total, offset: request.offset,
      haMais: request.offset + data.response_items.length < Math.min(total, TEIA_MAX_OFFSET),
      itens: data.response_items.slice(0, TEIA_PAGE).map((item) => ({
        titulo: stripTags(item.title).slice(0, 200) || String(item.originalURL || ''), url: String(item.originalURL || ''),
        arquivo: String(item.linkToArchive || ''), data: arquivoDate(item.tstamp), excerto: highlightSegments(item.snippet),
      })).filter((item) => item.arquivo.startsWith('https://arquivo.pt/')) };
  }

  if (fonte === 'arquivo-site') {
    const url = new URL('https://arquivo.pt/wayback/cdx');
    for (const [k, v] of [['url', request.site], ['matchType', 'domain'], ['output', 'json'], ['filter', 'mime:text/html'], ['filter', 'status:200'], ['collapse', 'urlkey'], ['fl', 'url,timestamp'], ['limit', '300']]) url.searchParams.append(k, v);
    const body = await fetchText(url, { headers: { Accept: 'application/json' } }, fetchImpl);
    const pages = [];
    for (const line of body.split('\n')) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      if (!/^https?:\/\//.test(row.url || '') || !/^\d{14}$/.test(row.timestamp || '')) continue;
      pages.push({ url: row.url, data: arquivoDate(row.timestamp), arquivo: `https://arquivo.pt/wayback/${row.timestamp}/${row.url}`, relevante: INTERESTING_PAGE.test(new URL(row.url).pathname) });
    }
    pages.sort((a, b) => Number(b.relevante) - Number(a.relevante) || a.url.length - b.url.length);
    return { ...meta, url: `https://arquivo.pt/url/search/${request.site}`, site: request.site, total: pages.length, itens: pages.slice(0, 60) };
  }

  if (fonte === 'wikipedia' && request.titulo) {
    const url = new URL('https://pt.wikipedia.org/w/api.php');
    for (const [k, v] of Object.entries({ action: 'query', prop: 'extracts|revisions|info', inprop: 'url', rvprop: 'ids|timestamp', explaintext: '1', exsectionformat: 'plain', redirects: '1', format: 'json', formatversion: '2', titles: request.titulo })) url.searchParams.set(k, v);
    const data = await fetchJson(url, { headers: { Accept: 'application/json' } }, fetchImpl);
    const page = data.query?.pages?.[0];
    if (!page || page.missing || typeof page.extract !== 'string') throw new Error('Artigo da Wikipédia não encontrado.');
    const revision = page.revisions?.[0] || {};
    return { ...meta, url: String(page.fullurl || ''), titulo: String(page.title),
      revisao: revision.revid ? `https://pt.wikipedia.org/w/index.php?oldid=${revision.revid}` : '', dataRevisao: day(revision.timestamp),
      texto: page.extract.slice(0, MAX_ARTICLE_CHARS), truncado: page.extract.length > MAX_ARTICLE_CHARS };
  }

  if (fonte === 'wikipedia') {
    const url = new URL('https://pt.wikipedia.org/w/api.php');
    for (const [k, v] of Object.entries({ action: 'query', list: 'search', srsearch: request.q, srlimit: String(TEIA_PAGE), sroffset: String(request.offset), format: 'json', formatversion: '2' })) url.searchParams.set(k, v);
    const data = await fetchJson(url, { headers: { Accept: 'application/json' } }, fetchImpl);
    if (!Array.isArray(data.query?.search)) throw new Error('Formato inesperado da Wikipédia.');
    const total = Number(data.query.searchinfo?.totalhits || data.query.search.length);
    return { ...meta, url: `https://pt.wikipedia.org/w/index.php?search=${encodeURIComponent(request.q)}&fulltext=1`, q: request.q, total, offset: request.offset,
      haMais: request.offset + data.query.search.length < Math.min(total, TEIA_MAX_OFFSET),
      itens: data.query.search.slice(0, TEIA_PAGE).map((item) => ({ titulo: String(item.title), url: `https://pt.wikipedia.org/wiki/${encodeURIComponent(String(item.title).replace(/ /g, '_'))}`, excerto: highlightSegments(item.snippet), data: day(item.timestamp) })) };
  }

  throw new Error('Fonte da Teia não suportada.');
}

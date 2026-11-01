// Pesquisa jurídica: interpreta o termo (área do direito, diplomas relevantes, citações como «Lei n.º 2/99»),
// junta o guia jurídico (direitos, passos, prazos, entidades) e procura em fontes oficiais.
import { toText, decode } from './ciberduvidas.js';
import { TOPICS, ENTITIES, TOOLKIT, CRP, TOPIC_CRP } from './guia.js';

const PER_SOURCE = 10;

export const LAW_SOURCES = {
  dre: { name: 'Diário da República', kind: 'Legislação', domains: ['diariodarepublica.pt', 'dre.pt'] },
  pgdl: { name: 'PGDL', kind: 'Legislação anotada', domains: ['pgdlisboa.pt'] },
  dgsi: { name: 'DGSI (tribunais)', kind: 'Jurisprudência', domains: ['dgsi.pt'] },
  tc: { name: 'Tribunal Constitucional', kind: 'Jurisprudência', domains: ['tribunalconstitucional.pt'] },
  erc: { name: 'ERC', kind: 'Regulação dos media', domains: ['erc.pt'] },
  cnpd: { name: 'CNPD', kind: 'Proteção de dados', domains: ['cnpd.pt'] },
  cada: { name: 'CADA', kind: 'Acesso à informação', domains: ['cada.pt'] },
  provedor: { name: 'Provedor de Justiça', kind: 'Recomendações', domains: ['provedor-jus.pt'] },
  mp: { name: 'Ministério Público', kind: 'Pareceres e orientações', domains: ['ministeriopublico.pt'] },
  eurlex: { name: 'EUR-Lex', kind: 'Direito da UE', domains: ['eur-lex.europa.eu'] },
  tedh: { name: 'TEDH (HUDOC)', kind: 'Direitos humanos', domains: ['hudoc.echr.coe.int'] },
};

const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

const CODES = {
  penal: 'Código Penal', civil: 'Código Civil', 'de processo penal': 'Código de Processo Penal',
  'de processo civil': 'Código de Processo Civil', 'do trabalho': 'Código do Trabalho',
  'das sociedades comerciais': 'Código das Sociedades Comerciais', cooperativo: 'Código Cooperativo',
  'do procedimento administrativo': 'Código do Procedimento Administrativo',
  'de processo nos tribunais administrativos': 'CPTA',
  'de procedimento e de processo tributario': 'CPPT',
};
const CODE_SHORT = {
  cpp: 'Código de Processo Penal', cpc: 'Código de Processo Civil', cp: 'Código Penal', cc: 'Código Civil',
  crp: 'Constituição da República Portuguesa', rgpd: 'RGPD', cpa: 'Código do Procedimento Administrativo',
  cpta: 'CPTA', cppt: 'CPPT', ct: 'Código do Trabalho',
};

// Reconhece citações diretas: «Lei n.º 2/99», «Decreto-Lei 63/85», «artigo 180.º do Código Penal».
function parseCitation(term) {
  const law = /\b(lei org[aâ]nica|lei|decreto[- ]lei|dec\.?[- ]lei|decreto|portaria)\s*(?:n\.?\s*[ºo°]?\s*)?(\d{1,3}(?:-[a-z])?\/\d{2,4})/i.exec(term);
  if (law) {
    const type = /org/i.test(law[1]) ? 'Lei Orgânica' : /dec/i.test(law[1]) ? (/lei/i.test(law[1]) ? 'Decreto-Lei' : 'Decreto') : /port/i.test(law[1]) ? 'Portaria' : 'Lei';
    const label = `${type} n.º ${law[2]}`;
    return { label, query: `"${label}"` };
  }
  const art = /\bart(?:igos?)?s?\.?\s*(\d{1,4}(?:\.?[ºo°])?(?:-[a-z])?)(?!\d)/i.exec(term);
  const code = /c[oó]digo\s+(penal|civil|de processo penal|de processo civil|do trabalho|das sociedades comerciais|cooperativo|do procedimento administrativo)|\b(cpp|cpc|cp|cc|crp|rgpd|cpa|cpta|cppt|ct)\b/i.exec(norm(term));
  if (art && code) {
    const name = code[1] ? CODES[code[1].toLowerCase()] : CODE_SHORT[code[2].toLowerCase()];
    const n = art[1].replace(/[ºo°.]/g, '').toUpperCase().replace(/^(\d+)(.*)$/, '$1.º$2');
    return { label: `${name}, art. ${n}`, query: `"${name}" "artigo ${n}"` };
  }
  return null;
}

// Pontua um termo contra uma lista de chaves (prefixos de palavras; «!» no fim exige palavra inteira).
function keyScore(keys, text) {
  return keys.reduce((s, k) => {
    const whole = k.endsWith('!');
    const src = (whole ? k.slice(0, -1) : k).replace(/ /g, '\\s+');
    return new RegExp(`\\b${src}${whole ? '\\b' : ''}`).test(text) ? s + 1 + k.length / 100 : s;
  }, 0);
}

// Artigos da Constituição por relevância: os ligados à área jurídica identificada pesam mais,
// mas qualquer artigo cujas palavras-chave apareçam no termo também entra.
function rankCrp(text, linked) {
  return CRP.map((c) => {
    const idx = linked.indexOf(c.art);
    const score = keyScore(c.keys, text) * 2 + (idx >= 0 ? 4 - idx * 0.5 : 0);
    return { c, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5)
    .map(({ c }) => ({ art: c.art, title: c.title, text: c.text }));
}

export function interpret(term) {
  const text = ` ${norm(term)} `;
  const hits = TOPICS.map((t) => ({ t, score: keyScore(t.keys, text) }))
    .filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, 3).map((h) => h.t);
  return {
    citation: parseCitation(term),
    constitution: rankCrp(text, []),
    topics: hits.map((t) => ({
      id: t.id, area: t.area, note: t.note, rights: t.rights, steps: t.steps, deadlines: t.deadlines,
      arguments: t.arguments, refs: t.refs, expand: t.expand, also: t.also || [],
      ...(t.guidance ? { guidance: t.guidance } : {}),
      crp: rankCrp(text, TOPIC_CRP[t.id] || []),
      entities: (t.entities || []).map((k) => ENTITIES[k]).filter(Boolean),
    })),
    toolkit: TOOLKIT.map(({ title, text, ent }) => ({ title, text, entities: ent.map((k) => ENTITIES[k]).filter(Boolean) })),
  };
}

const siteOf = (host) => Object.keys(LAW_SOURCES)
  .find((k) => LAW_SOURCES[k].domains.some((d) => host === d || host.endsWith(`.${d}`)));
export const isLawHost = (host) => Boolean(siteOf(host));

const SUFFIX = /\s*(?:[-–|]|\.{3}|…)\s*(?:DR|Di[aá]rio da Rep[uú]blica(?: Eletr[oó]nico)?|DGSI|PGDL|IGFEJ(?: - Bases Jur[ií]dico[^|]*)?|Bases Jur[ií]dico[^|]*)\s*$/i;

// Os sites usam títulos genéricos («Acórdão do Tribunal da Relação de Lisboa»); junta-se o início do excerto.
function cleanTitle(title, description) {
  let t = title;
  for (let prev = ''; prev !== t;) { prev = t; t = t.replace(SUFFIX, ''); }
  t = t.replace(/^:+\s*/, '').replace(/^TC\s*>\s*Jurisprud[eê]ncia\s*>\s*Acord[aã]os\s*>\s*/i, '').replace(/[\s.]+$/, '');
  if (/^(mostradoc|acórdão do )/i.test(t) && description) {
    const snippet = description.replace(/\s+/g, ' ').slice(0, 90).replace(/\s+\S*$/, '');
    t = /^mostradoc/i.test(t) ? `${snippet}…` : `${t} — ${snippet}…`;
  }
  return t || 'Sem título';
}

// Os resultados do Bing são redirecionamentos (bing.com/ck/a?...&u=a1<base64url>); o endereço real está em «u».
function realUrl(href) {
  const u = new URL(decode(href)).searchParams.get('u');
  if (!u || !u.startsWith('a1')) return decode(href);
  const b64 = u.slice(2).replace(/-/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0)));
}

function toItem(url, title, description, allowed) {
  const key = siteOf(url.hostname);
  if (!key || !allowed.includes(key)) return null;
  return { title: cleanTitle(title, description), description, url: url.href, site: key, source: LAW_SOURCES[key].name, kind: LAW_SOURCES[key].kind };
}

function parseSerp(html, allowed) {
  const items = [];
  for (const part of html.split('class="b_algo"').slice(1)) {
    const h = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(part);
    if (!h) continue;
    let url;
    try { url = new URL(realUrl(h[1])); } catch { continue; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    const p = /<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(part) || /<p[^>]*>([\s\S]*?)<\/p>/.exec(part);
    const description = toText(p?.[1] || '').replace(/\u00ad/g, '').replace(/^\d{1,2} de \S+ de \d{4}\s*·\s*/, '');
    const item = toItem(url, toText(h[2]), description, allowed);
    if (item) items.push(item);
  }
  return items;
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Google via Serper.dev (chave SERPER_API_KEY): respeita bem o filtro «site:». É o motor preferido.
async function serper(query, allowed, env) {
  const sites = allowed.flatMap((k) => LAW_SOURCES[k].domains).map((d) => `site:${d}`).join(' OR ');
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': env.SERPER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: `${query} (${sites})`, gl: 'pt', hl: 'pt-pt', num: 10 }),
  });
  if (!res.ok) throw new Error(`Serper respondeu ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  return (data.organic || []).flatMap((o) => {
    try { return [toItem(new URL(o.link), o.title || '', o.snippet || '', allowed)].filter(Boolean); } catch { return []; }
  });
}

// Reserva sem chave: o Bing respeita o «site:» a partir de alguns IPs, mas não a partir da Cloudflare.
async function bing(query, allowed, perSite = false) {
  const domains = perSite ? [LAW_SOURCES[allowed[0]].domains[0]] : allowed.flatMap((k) => LAW_SOURCES[k].domains);
  const sites = domains.map((d) => `site:${d}`).join(' OR ');
  const q = encodeURIComponent(perSite ? `${query} ${sites}` : `${query} (${sites})`);
  const res = await fetch(`https://www.bing.com/search?q=${q}&setmkt=pt-PT&setlang=pt-PT&count=20`, {
    headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'pt-PT,pt;q=0.9' },
  });
  if (!res.ok) throw new Error(`Bing respondeu ${res.status}`);
  return parseSerp(await res.text(), allowed);
}

// Relevância: palavras da pesquisa no título pesam mais do que no excerto.
function relevance(r, tokens) {
  const title = norm(r.title), desc = norm(r.description);
  return tokens.reduce((s, t) => s + (title.includes(t) ? 3 : 0) + (desc.includes(t) ? 1 : 0), 0);
}

export async function searchLaw(term, keys, env = {}) {
  const chosen = keys.filter((k) => LAW_SOURCES[k]);
  const interpretation = interpret(term);
  const useSerper = Boolean(env.SERPER_API_KEY);
  const run = (j) => (useSerper ? serper(j.query, j.keys, env) : bing(j.query, j.keys, j.perSite));
  const jobs = [];
  if (useSerper) {
    jobs.push({ keys: chosen, query: `"${term}"`, related: false });
    if (/\s/.test(term)) jobs.push({ keys: chosen, query: term, related: false });
  } else {
    chosen.forEach((k) => jobs.push({ keys: [k], query: term, perSite: true, related: false }));
    jobs.push({ keys: chosen, query: `"${term}"`, related: false });
  }
  if (interpretation.citation) jobs.push({ keys: chosen, query: interpretation.citation.query, related: false });
  const main = interpretation.topics[0];
  if (main) {
    jobs.push({ keys: chosen, query: main.expand, related: true });
    // Fontes que a área recomenda, mesmo que o utilizador não as tenha marcado.
    const extra = main.also.filter((k) => LAW_SOURCES[k] && !chosen.includes(k));
    if (extra.length) jobs.push({ keys: extra, query: `${term} ${main.expand}`, related: true, perSite: true });
    // Jurisprudência constitucional sobre o artigo mais relevante da Constituição.
    const lead = main.crp?.[0];
    if (lead) jobs.push({ keys: chosen, query: `"artigo ${lead.art}.º da Constituição" ${term}`, related: true });
  }

  const settled = await Promise.allSettled(jobs.map(run));
  const tokens = [...new Set(norm(term).split(/[^a-z0-9]+/).filter((t) => t.length > 2))];
  const seen = new Set(), results = [], perSource = {};
  settled.forEach((s, i) => {
    if (s.status !== 'fulfilled') return;
    for (const r of s.value) {
      const url = new URL(r.url);
      url.hash = '';
      url.searchParams.sort();
      const id = url.href.replace(/^https?:\/\/(www\.)?/, '');
      if (seen.has(id) || (perSource[r.site] = (perSource[r.site] || 0) + 1) > PER_SOURCE) continue;
      seen.add(id);
      results.push({ ...r, related: jobs[i].related, score: relevance(r, tokens) });
    }
  });
  const failed = [...new Set(jobs.flatMap((job, i) => settled[i].status === 'rejected' ? job.keys : []))];
  // Diretos primeiro, os alargados (por área do direito) depois; em cada grupo, por relevância.
  results.sort((a, b) => Number(a.related) - Number(b.related) || b.score - a.score);
  const more = `${term} (${chosen.flatMap((k) => LAW_SOURCES[k].domains).map((d) => `site:${d}`).join(' OR ')})`;
  return { term, interpretation, results, failed, provider: useSerper ? 'Google (Serper)' : 'Bing', moreUrl: `https://www.google.com/search?q=${encodeURIComponent(more)}` };
}

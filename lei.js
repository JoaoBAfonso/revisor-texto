// Cérebro jurídico: navega e pesquisa o corpus de legislação (data/lei) no browser, sem servidor.
import { tokens } from './proxy/corpus/tokens.mjs';
import { openReading } from './reading-dialog.js';
import { findNumberedDoc, numberedArticleKey } from './proxy/corpus/numbered-doc.mjs';

const root = document.getElementById('brain');
const DATA = 'data/lei';
const REV = '8';

const h = (tag, props, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid);
  return el;
};

const cache = new Map();
const load = (name) => {
  if (!cache.has(name)) {
    cache.set(name, fetch(`${DATA}/${name}.json?v=${REV}`).then((r) => {
      if (!r.ok) throw new Error(`Não foi possível carregar ${name}.`);
      return r.json();
    }).catch((e) => { cache.delete(name); throw e; }));
  }
  return cache.get(name);
};

const undelta = (list) => { let a = 0; return list.map((d) => (a += d)); };

// Jurisprudência (data/juris/<diploma>.json, gerada por corpus/dgsi.mjs); nem todos os diplomas têm.
const jurisCache = new Map();
const juris = (id) => {
  if (!jurisCache.has(id)) {
    jurisCache.set(id, fetch(`data/juris/${id}.json?v=${REV}`).then((r) => {
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`Não foi possível carregar a jurisprudência (HTTP ${r.status}).`);
      return r.json();
    }).catch((e) => { jurisCache.delete(id); throw e; }));
  }
  return jurisCache.get(id);
};
const hashFor = (...parts) => `#/direito/lei${parts.length ? `/${parts.map(encodeURIComponent).join('/')}` : ''}`;
const art = (id, k) => hashFor(id, k);
const ask = (q) => window.dispatchEvent(new CustomEvent('law-ask', { detail: q }));
const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim();

// Princípios de raciocínio que aparecem em qualquer argumentação (fontes: CRP e Código Civil).
const METHOD = [
  ['Lei superior', 'Uma norma não pode contrariar outra de grau superior (CRP, art. 3.º, n.º 3, e art. 277.º). O direito da UE e as convenções prevalecem sobre a lei ordinária (CRP, art. 8.º).'],
  ['Lei especial', 'A lei geral não revoga a lei especial, salvo intenção inequívoca do legislador (Código Civil, art. 7.º, n.º 3).'],
  ['Lei posterior', 'A lei nova revoga a anterior que a contrarie (Código Civil, art. 7.º). Confirma sempre se a versão lida está em vigor.'],
  ['Interpretação', 'Parte-se da letra, mas procura-se o pensamento legislativo e presume-se um resultado razoável (Código Civil, art. 9.º).'],
  ['Procedimento', 'Identifica a entidade competente, o prazo e a forma do pedido. Muitos direitos perdem-se por prazos curtos ou por via errada.'],
];

let meta;
let index;
let refs;
let heads;
const ready = async () => {
  [meta, index, refs, heads] = await Promise.all([load('meta'), load('index'), load('refs'), load('heads')]);
  meta.byId = Object.fromEntries(meta.docs.map((d) => [d.id, d]));
  meta.byShort = Object.fromEntries(meta.docs.map((d) => [d.short.toLowerCase(), d]));
};
const docOf = (gid) => {
  let lo = 0;
  let hi = meta.docs.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (meta.docs[mid].off <= gid) lo = mid; else hi = mid - 1;
  }
  const d = meta.docs[lo];
  return { d, i: gid - d.off };
};

// ── Pesquisa ────────────────────────────────────────────────────────────────────────────────────
// areaId: área jurídica já identificada; reforça os diplomas dessa área.
function search(q, areaId) {
  const terms = [...new Set(tokens(q))];
  const score = new Map();
  for (const t of terms) {
    for (const [key, weight] of [['b', 1], ['h', 4]]) {
      const raw = index[key][t];
      if (!raw) continue;
      const idf = Math.log(index.n / (raw.length + 1)) + 1;
      for (const g of undelta(raw)) {
        const s = score.get(g) || { n: new Set(), v: 0 };
        s.n.add(t);
        s.v += idf * weight;
        score.set(g, s);
      }
    }
  }
  const best = Math.max(0, ...[...score.values()].map((s) => s.n.size));
  return [...score]
    .filter(([, s]) => s.n.size >= Math.max(1, best - (best > 2 ? 1 : 0)))
    .map(([g, s]) => { const x = docOf(g); return { g, ...x, n: s.n.size, v: s.v * (areaId && x.d.area.includes(areaId) ? 1.5 : 1) }; })
    .sort((a, b) => b.n - a.n || b.v - a.v)
    .slice(0, 120);
}

function diplomasFor(q) {
  const terms = new Set(tokens(q));
  if (!terms.size) return [];
  return meta.docs.filter((d) => {
    const own = new Set(tokens(`${d.name} ${d.short} ${d.title}`));
    return [...terms].every((t) => own.has(t));
  }).sort((a, b) => a.rank - b.rank).slice(0, 40);
}

// "artigo 65 CRP", "65.º do CRP", "CRP, art. 65.º", "Código Civil, art. 483.º"; sem artigo, o diploma ("Lei n.º 2/99").
function parseRef(q) {
  const s = q.trim().replace(/\s+/g, ' ');
  let m = /^(.+?),?\s+art(?:igo)?s?\.?\s*(\d+)\s*\.?\s*[º°o]?(?:\s*-\s*([A-Z]{1,2}))?(?![\d-])/i.exec(s);
  if (m) return { name: plain(m[1].replace(/,$/, '')), k: `${m[2]}${m[3] ? `-${m[3].toUpperCase()}` : ''}` };
  m = /^(?:art(?:igo)?s?\.?\s*)?(\d+)\s*\.?\s*[º°o]?(?:\s*-\s*([A-Z]{1,2}))?\s+(?:n\.?º?\s*\d+\s*)?(?:d[oae]s?\s+)?(.+)$/i.exec(s);
  if (m) return { name: plain(m[3]), k: `${m[1]}${m[2] ? `-${m[2].toUpperCase()}` : ''}` };
  return { name: plain(s), k: null };
}

function findDoc(name) {
  if (name.length < 2) return null;
  return meta.byShort[name] || meta.byId[name]
    || meta.docs.find((d) => plain(d.short) === name || plain(d.name) === name)
    || (name.length > 6 && meta.docs.find((d) => plain(d.name).startsWith(name) || plain(d.title).startsWith(name)))
    || null;
}

// Devolve a ligação interna para um artigo ou diploma, ou null se não estiver no corpus.
function resolveRef(text, { needArticle = false } = {}) {
  const { name, k } = parseRef(text);
  const numbered = /\b(Lei Orgânica|Lei Constitucional|Decreto-Lei|Decreto Legislativo Regional|Decreto Regulamentar|Decreto|Portaria|Regulamento|Lei)\s+n\.?º\s*(\d+(?:-[A-Z])?\/\d{2,4})/i.exec(text);
  const d = numbered ? findNumberedDoc(meta.docs, numbered[1], numbered[2]) : findDoc(name);
  if (!d) return null;
  if (!k) return needArticle ? null : hashFor(d.id);
  if (numbered) {
    const articles = heads.slice(d.off, d.off + d.n).map(([key, , , part]) => ({ k: key, part }));
    const key = numberedArticleKey(articles, k);
    return key ? art(d.id, key) : needArticle ? null : hashFor(d.id);
  }
  for (let i = 0; i < d.n; i++) if (heads[d.off + i][0] === k.toLowerCase() || heads[d.off + i][0] === k) return art(d.id, heads[d.off + i][0]);
  return needArticle ? null : hashFor(d.id);
}

// ── Peças de interface ─────────────────────────────────────────────────────────────────────────
const rankName = (r) => meta.ranks.find((x) => x.rank === r)?.name || '';
const badge = (d) => h('span', { class: 'brain-rank', 'data-rank': d.rank }, `Grau ${d.rank}`);

function articleText(a) {
  const paragraphs = () => h('div', { class: 'brain-text' }, a.x.split(/\n+/).map((line) => {
    const item = /^([a-z]\)|\d+[.)º]|[ivx]+\))\s/i.test(line);
    return h('p', { class: item ? 'item' : '' }, line);
  }));
  if (a.x.length <= 1200) return paragraphs();
  return h('div', { class: 'brain-text' },
    h('p', null, `${a.x.slice(0, 420).trimEnd()}…`),
    h('button', { type: 'button', class: 'brain-more', onclick: () => openReading(`Artigo ${a.n}${a.t ? ` — ${a.t}` : ''}`, paragraphs()) }, 'Ler artigo completo'));
}

function searchBox(value = '') {
  const input = h('input', { type: 'search', maxlength: '80', value, placeholder: 'Tema, palavra ou artigo (ex.: despejo, artigo 65 CRP)…', 'aria-label': 'Perguntar ao guia jurídico', autocomplete: 'off' });
  const go = (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (q) ask(q);
  };
  return h('form', { class: 'doubts-form brain-search', onsubmit: go }, input, h('button', { type: 'submit' }, 'Pesquisar'));
}

function loading(text = 'A carregar a legislação…') { return h('p', { class: 'brain-empty', role: 'status' }, text); }

function method() {
  return h('section', { class: 'brain-block' },
    h('h3', null, 'Como raciocina um jurista'),
    h('ol', { class: 'brain-method' }, METHOD.map(([t, d]) => h('li', null, h('strong', null, t), ' ', d))));
}

function disclaimer() {
  return h('p', { class: 'brain-note' }, 'Texto consolidado do Diário da República Eletrónico (DRE) e do PGDL, guardado neste site. Pode estar desatualizado e não substitui o Diário da República nem um advogado. Confirma sempre a versão em vigor.');
}

// ── Vistas ──────────────────────────────────────────────────────────────────────────────────────
const docList = (docs) => h('ul', { class: 'brain-docs' }, docs.map((d) => h('li', null,
  h('a', { href: hashFor(d.id) }, d.name), h('span', null, `${d.n} artigos`))));
// Os graus baixos têm centenas de diplomas: a página mostra os primeiros e liga a uma página própria com todos.
const TIER_PREVIEW = 8;
const tierDocs = (docs) => (docs.length <= TIER_PREVIEW + 2 ? docList(docs)
  : [docList(docs.slice(0, TIER_PREVIEW)),
    h('a', { class: 'brain-more-docs', href: hashFor('grau', docs[0].rank) }, `Ver os ${docs.length} diplomas deste grau →`)]);

// Lista filtrável: o texto escrito esconde as linhas que não coincidem.
function filterable(list, label, placeholder) {
  const input = h('input', { type: 'search', maxlength: '80', placeholder, 'aria-label': label, autocomplete: 'off', class: 'brain-filter' });
  const empty = h('p', { class: 'brain-empty', hidden: true }, 'Nada encontrado.');
  input.addEventListener('input', () => {
    const words = plain(input.value).split(' ').filter(Boolean);
    let shown = 0;
    for (const li of list.children) { const ok = words.every((w) => li.dataset.k.includes(w)); li.hidden = !ok; if (ok) shown++; }
    empty.hidden = shown > 0;
  });
  return h('div', { class: 'brain-filterable' }, input, list, empty);
}
function viewTier(rank) {
  const r = meta.ranks.find((x) => x.rank === rank);
  if (!r) return [h('p', { class: 'brain-empty' }, 'Grau não encontrado.'), h('a', { href: hashFor() }, '← Legislação')];
  const docs = meta.docs.filter((d) => d.rank === rank);
  const list = h('ul', { class: 'brain-docs' }, docs.map((d) => h('li', { 'data-k': plain(`${d.name} ${d.title}`) },
    h('a', { href: hashFor(d.id) }, d.name), h('span', null, `${d.n} artigos`))));
  return [
    searchBox(),
    h('header', { class: 'brain-dochead', 'data-rank': rank },
      h('span', { class: 'brain-rank' }, `Grau ${rank}`), h('h3', null, r.name), h('p', { class: 'brain-tier-note' }, `${r.note} · ${docs.length} diplomas`)),
    filterable(list, 'Filtrar diplomas', 'Filtrar estes diplomas por nome ou número…'),
    h('nav', { class: 'brain-pager' }, h('a', { href: hashFor() }, '← Hierarquia')),
    disclaimer(),
  ];
}
function viewHome() {
  const byRank = meta.ranks.map((r) => ({ ...r, docs: meta.docs.filter((d) => d.rank === r.rank) })).filter((r) => r.docs.length);
  return [
    h('p', { class: 'brain-lead' }, `${meta.total.toLocaleString('pt-PT')} artigos de ${meta.docs.length} diplomas, ordenados pela hierarquia das normas. Escolhe um tema, ou percorre a lei da Constituição às leis especiais.`),
    h('section', { class: 'brain-block' },
      h('h3', null, 'Explorar por tema'),
      h('div', { class: 'brain-chips' }, meta.topics.map((t) => h('button', { type: 'button', class: 'chip', onclick: () => ask(t.area) }, t.area)))),
    method(),
    h('section', { class: 'brain-block' },
      h('h3', null, 'A hierarquia das normas'),
      byRank.map((r) => h('div', { class: 'brain-tier', 'data-rank': r.rank },
        h('h4', null, h('span', null, `Grau ${r.rank}`), ' ', r.name),
        h('p', { class: 'brain-tier-note' }, r.note),
        tierDocs(r.docs)))),
    disclaimer(),
  ];
}

function viewSearch(q) {
  const results = search(q);
  const docs = diplomasFor(q);
  const groups = meta.ranks.map((r) => ({ ...r, items: results.filter((x) => x.d.rank === r.rank) })).filter((g) => g.items.length);
  const out = [searchBox(q)];
  if (docs.length) {
    out.push(h('section', { class: 'brain-block' }, h('h3', null, 'Diplomas'),
      h('ul', { class: 'brain-docs' }, docs.map((d) => h('li', null, h('a', { href: hashFor(d.id) }, d.name), h('span', null, `Grau ${d.rank} · ${d.n} artigos`))))));
  }
  if (!results.length && !docs.length) {
    out.push(h('p', { class: 'brain-empty' }, 'Sem artigos para esta pesquisa. Experimenta uma palavra mais geral (ex.: “habitação”, “despedimento”, “privacidade”).'));
    return out;
  }
  if (groups.length) {
    out.push(h('p', { class: 'brain-lead' }, `${results.length} artigos relevantes em ${new Set(results.map((x) => x.d.id)).size} diplomas, por ordem hierárquica.`));
    out.push(h('div', { class: 'brain-ladder' }, groups.map((g) => h('span', { 'data-rank': g.rank }, `${g.name} · ${g.items.length}`))));
    for (const g of groups) out.push(group(g));
    out.push(method());
  }
  out.push(disclaimer());
  return out;
}

// ── Integração com o guia: o que a lei diz sobre o termo pesquisado ──────────────────────────────────
async function section(q, topic) {
  await ready();
  const results = search(q, topic?.id);
  const docs = diplomasFor(q);
  const areaDocs = topic ? meta.docs.filter((d) => d.area.includes(topic.id)).sort((a, b) => a.rank - b.rank) : [];
  const groups = meta.ranks.map((r) => ({ ...r, items: results.filter((x) => x.d.rank === r.rank) })).filter((g) => g.items.length);
  const refs = (topic?.refs || []).map((text) => ({ text, href: resolveRef(text) }));
  if (!groups.length && !areaDocs.length && !docs.length && !refs.length) return null;
  const chip = ({ text, href }) => (href
    ? h('a', { class: 'brain-chip', href }, text)
    : h('button', { type: 'button', class: 'chip', onclick: () => ask(text) }, text));
  return [
    refs.length ? h('section', { class: 'brain-block' }, h('h3', null, 'Normas-chave'),
      h('p', { class: 'meta' }, 'Do topo da hierarquia para baixo. Cada ligação abre o artigo completo, com as remissões para outras leis.'),
      h('div', { class: 'brain-chips' }, [...refs].sort((a, b) => (a.href ? 0 : 1) - (b.href ? 0 : 1)).map(chip))) : null,
    areaDocs.length || docs.length ? h('section', { class: 'brain-block' }, h('h3', null, 'Diplomas desta matéria'),
      h('ul', { class: 'brain-docs' }, [...new Map([...docs, ...areaDocs].map((d) => [d.id, d])).values()].slice(0, 8).map((d) => h('li', null,
        h('a', { href: hashFor(d.id) }, d.name), h('span', null, `Grau ${d.rank} · ${d.n} artigos`))))) : null,
    groups.length ? h('div', { class: 'brain-ladder' }, groups.map((g) => h('span', { 'data-rank': g.rank }, `${g.name} · ${g.items.length}`))) : null,
    ...groups.map((g) => group(g, 3)),
    groups.length ? h('p', { class: 'brain-more-link' }, h('a', { href: hashFor('busca', q) }, `Ver os ${results.length} artigos encontrados →`)) : null,
    method(),
  ].filter(Boolean);
}

function group(g, shown = 6) {
  const list = h('ul', { class: 'brain-hits' });
  const row = (x) => h('li', { class: 'brain-hit' }, hitCard(x));
  let count = 0;
  const more = h('button', { type: 'button', class: 'brain-more', onclick: () => step() });
  const step = () => {
    const batch = g.items.slice(count, count + shown);
    batch.forEach((x) => list.append(row(x)));
    count += batch.length;
    more.hidden = count === g.items.length;
    more.textContent = `Mostrar mais artigos (${g.items.length - count} restantes)`;
  };
  step();
  return h('section', { class: 'brain-block brain-group', 'data-rank': g.rank },
    h('h3', null, h('span', null, `Grau ${g.rank}`), ' ', g.name),
    h('p', { class: 'brain-tier-note' }, g.note),
    list, more);
}

function hitCard({ g, d, i }) {
  const [k, n, t, part] = heads[g];
  return h('a', { class: 'brain-hit-link', href: art(d.id, k) },
    h('span', { class: 'brain-ref' }, `${d.short} · artigo ${n}`),
    t ? h('span', { class: 'brain-title' }, t) : null,
    part ? h('span', { class: 'brain-tier-note' }, part) : null,
    h('span', { class: 'brain-go', 'aria-hidden': 'true' }, '→'));
}

function viewDoc(id, k) {
  const d = meta.byId[id];
  if (!d) return [h('p', { class: 'brain-empty' }, 'Diploma não encontrado.'), h('a', { href: hashFor() }, '← Legislação')];
  const wrap = h('div', { class: 'brain-doc' }, loading('A abrir o diploma…'));
  load(id).then((doc) => {
    const sec = /^sec-(\d+)$/.exec(k || '');
    const idx = k && !sec ? doc.arts.findIndex((a) => a.k === k) : -1;
    wrap.replaceChildren(...(idx >= 0 ? viewArticle(d, doc, idx) : sec ? viewSection(d, doc, +sec[1]) : viewToc(d, doc, k)).filter(Boolean));
  }).catch((e) => wrap.replaceChildren(h('p', { class: 'brain-empty' }, e.message)))
    .finally(() => { if (wrap.isConnected) root.style.minHeight = ''; });
  return [searchBox(), wrap];
}

function docHeader(d) {
  return h('header', { class: 'brain-dochead', 'data-rank': d.rank },
    badge(d),
    h('h3', null, d.name),
    h('p', { class: 'brain-tier-note' }, `${rankName(d.rank)} · ${d.title}`),
    h('a', { class: 'brain-open', href: d.url, target: '_blank', rel: 'noopener noreferrer' }, `Fonte: ${/eur-lex/.test(d.url) ? 'EUR-Lex' : /diariodarepublica/.test(d.url) ? 'DRE' : 'PGDL'} ↗`));
}

// Estrutura de um diploma: filhos de cada secção, artigos por secção e contagens/intervalos da subárvore.
function structure(doc) {
  if (doc._st) return doc._st;
  const kids = new Map();
  doc.secs.forEach((s, i) => { const p = s.u ?? -1; (kids.get(p) || kids.set(p, []).get(p)).push(i); });
  const arts = new Map();
  doc.arts.forEach((a) => { const p = a.s ?? -1; (arts.get(p) || arts.set(p, []).get(p)).push(a); });
  const span = new Map();
  const walk = (i) => {
    const own = arts.get(i) || [];
    let n = own.length, first = own[0], last = own[own.length - 1];
    for (const c of kids.get(i) || []) {
      const r = walk(c);
      n += r.n;
      if (r.first && (!first || doc.arts.indexOf(r.first) < doc.arts.indexOf(first))) first = r.first;
      if (r.last && (!last || doc.arts.indexOf(r.last) > doc.arts.indexOf(last))) last = r.last;
    }
    const r = { n, first, last };
    span.set(i, r);
    return r;
  };
  (kids.get(-1) || []).forEach(walk);
  return (doc._st = { kids, arts, span });
}

const artList = (d, list) => h('ul', { class: 'brain-arts' }, list.map((a) => h('li', { 'data-k': plain(`${a.n} ${a.t || ''} ${a.part || ''}`) },
  h('a', { href: art(d.id, a.k) }, h('b', null, a.n), a.t ? h('span', null, a.t) : null,
    a.part ? h('small', null, a.part) : null))));

function secCards(d, doc, ids) {
  const { span } = structure(doc);
  return h('ol', { class: 'brain-cards' }, ids.map((i, pos) => {
    const s = doc.secs[i], r = span.get(i);
    const range = r.first ? (r.first === r.last ? r.first.n : `${r.first.n} a ${r.last.n}`) : '';
    return h('li', null, h('a', { class: 'brain-card', href: hashFor(d.id, `sec-${i}`) },
      h('span', { class: 'brain-card-n' }, String(pos + 1).padStart(2, '0')),
      h('strong', null, s.n),
      h('small', null, r.n ? `${r.n} artigos · ${range}` : 'Sem artigos')));
  }));
}

function viewToc(d, doc, missing) {
  const { kids, arts } = structure(doc);
  const top = kids.get(-1) || [];
  const loose = arts.get(-1) || [];
  const firstSec = top.length ? doc.arts.indexOf(structure(doc).span.get(top[0]).first) : -1;
  const head = firstSec < 0 ? [] : loose.filter((a) => doc.arts.indexOf(a) < firstSec);
  const tail = loose.filter((a) => !head.includes(a));
  const first = doc.arts[0];
  const searchList = filterable(artList(d, doc.arts), 'Filtrar artigos', `Procurar entre os ${doc.arts.length} artigos (número ou palavra)…`);
  return [
    docHeader(d),
    missing ? h('p', { class: 'brain-empty' }, `O artigo ${missing} não existe neste diploma.`) : null,
    first ? h('a', { class: 'brain-start', href: art(d.id, first.k) }, `Começar a ler no ${first.n} →`) : null,
    top.length && head.length ? h('section', { class: 'brain-block' }, h('h3', null, 'Artigos iniciais'), artList(d, head)) : null,
    top.length ? h('section', { class: 'brain-block' }, h('h3', null, 'Estrutura'), secCards(d, doc, top)) : null,
    top.length && tail.length ? h('section', { class: 'brain-block' }, h('h3', null, 'Outros artigos'), artList(d, tail)) : null,
    top.length ? null : h('section', { class: 'brain-block' }, h('h3', null, `${doc.arts.length} artigos`), searchList),
    h('nav', { class: 'brain-pager' }, h('a', { href: hashFor() }, '← Hierarquia')),
    disclaimer(),
  ];
}

function viewSection(d, doc, i) {
  const s = doc.secs[i];
  if (!s) return viewToc(d, doc, null);
  const { kids, arts, span } = structure(doc);
  const sub = kids.get(i) || [];
  const own = arts.get(i) || [];
  const sibs = kids.get(s.u ?? -1) || [];
  const at = sibs.indexOf(i);
  const link = (j, dir) => (j == null ? h('span') : h('a', { href: hashFor(d.id, `sec-${j}`) }, dir < 0 ? `← ${doc.secs[j].n}` : `${doc.secs[j].n} →`));
  const total = span.get(i)?.n || 0;
  const all = doc.arts.filter((a) => { for (let p = a.s; p != null && p >= 0; p = doc.secs[p]?.u) if (p === i) return true; return false; });
  return [
    docHeader(d),
    h('nav', { class: 'brain-crumbs', 'aria-label': 'Localização' }, h('a', { href: hashFor(d.id) }, d.short),
      sectionPath(doc, { s: i }).map((p, n, arr) => (n === arr.length - 1 ? h('span', null, p.n) : h('a', { class: 'crumb', href: hashFor(d.id, `sec-${p.i}`) }, p.n)))),
    h('header', { class: 'brain-sechead' }, h('small', null, `${total} artigos`), h('h3', null, s.n),
      all[0] ? h('a', { class: 'brain-start', href: art(d.id, all[0].k) }, `Começar a ler no ${all[0].n} →`) : null),
    sub.length ? h('section', { class: 'brain-block' }, h('h3', null, 'Divisões'), secCards(d, doc, sub)) : null,
    own.length ? h('section', { class: 'brain-block' }, h('h3', null, sub.length ? 'Artigos desta divisão' : 'Artigos'), artList(d, own)) : null,
    h('nav', { class: 'brain-pager', 'aria-label': 'Divisões vizinhas' }, link(sibs[at - 1], -1), h('a', { href: hashFor(d.id) }, 'Estrutura'), link(sibs[at + 1], 1)),
    disclaimer(),
  ];
}

function sectionPath(doc, a) {
  const path = [];
  for (let i = a.s; i != null && i >= 0; i = doc.secs[i]?.u) path.unshift({ n: doc.secs[i].n, i });
  return path;
}

function jurisBlock(d, a) {
  const box = h('section', { class: 'brain-block brain-juris', hidden: true });
  const populate = async () => {
    const j = await juris(d.id);
    const items = (j?.arts?.[a.k] || []).map((i) => j.acs[i]);
    if (!items.length) { box.hidden = true; box.replaceChildren(); return; }
    const pt = (iso) => iso.split('-').reverse().join('/');
    const list = h('div', { class: 'brain-ac-list' });
    let shown = 0;
    const more = h('button', { type: 'button', class: 'brain-more', onclick: () => showMore() });
    const showMore = () => {
      const batch = items.slice(shown, shown + 8);
      for (const ac of batch) {
        const details = h('article', { class: 'brain-ac' },
          h('div', { class: 'brain-ac-heading' },
            h('div', { class: 'brain-ac-top' },
              h('b', { class: 'brain-ac-court' }, ac.t),
              h('time', { class: 'brain-ac-date', datetime: ac.d }, pt(ac.d))),
            h('span', { class: 'brain-ac-process' }, `Processo ${ac.p}`),
            ac.m ? h('span', { class: 'brain-ac-meta' }, ac.m) : null,
            ac.dec ? h('div', { class: 'brain-ac-decision' }, h('strong', null, 'Decisão'), ac.dec) : null));
        details.append(h('button', { type: 'button', class: 'brain-ac-read', onclick: () => openReading(`${ac.t} · ${pt(ac.d)} · Processo ${ac.p}`, [
            h('blockquote', { class: 'brain-ac-summary' }, ac.s.split('\n').filter(Boolean).map((p) => h('p', null, p))),
            h('p', { class: 'brain-ac-src' }, h('a', { href: `http://www.dgsi.pt${ac.u}`, target: '_blank', rel: 'noopener' }, `Texto integral no DGSI — proc. ${ac.p}`)),
          ]) }, 'Ler sumário'));
        list.append(details);
      }
      shown += batch.length;
      more.hidden = shown === items.length;
      more.textContent = `Mostrar mais acórdãos (${items.length - shown} restantes)`;
    };
    box.hidden = false;
    box.replaceChildren(
      h('h3', null, 'Jurisprudência'),
      h('p', { class: 'brain-juris-note' }, `${items.length === 1 ? '1 acórdão associado' : `${items.length} acórdãos associados`} a este artigo (sumário ou legislação indicada no DGSI). Do mais recente para o mais antigo.`),
      h('p', { class: 'brain-juris-note' }, 'Uma citação não significa concordância nem aplicação ao teu caso. Confirma o contexto no texto integral.'),
      list, more);
    showMore();
  };
  const refresh = () => populate().catch((e) => {
    box.hidden = false;
    box.replaceChildren(
      h('h3', null, 'Jurisprudência'),
      h('p', { class: 'brain-juris-note', role: 'alert' }, `Não foi possível apresentar a jurisprudência. ${e.message}`),
      h('button', { type: 'button', class: 'brain-more', onclick: refresh }, 'Tentar novamente'));
  });
  refresh();
  return box;
}

function viewArticle(d, doc, i) {
  const a = doc.arts[i];
  const prev = doc.arts[i - 1];
  const next = doc.arts[i + 1];
  const key = `${d.id}:${a.k}`;
  const chip = (ref) => {
    const [rid, rk] = ref.split(':');
    const rd = meta.byId[rid];
    return h('a', { class: 'brain-chip', href: art(rid, rk), 'data-rank': rd?.rank }, `${rd?.short || rid}, art. ${rk}.º`);
  };
  const cited = (refs[key] || []).filter((r) => r !== key);
  return [
    docHeader(d),
    h('nav', { class: 'brain-crumbs', 'aria-label': 'Localização' }, h('a', { href: hashFor(d.id) }, d.short),
      sectionPath(doc, a).map((s) => h('a', { class: 'crumb', href: hashFor(d.id, `sec-${s.i}`) }, s.n))),
    h('article', { class: 'brain-article' },
      h('h4', null, h('small', null, `${d.short} · Artigo`), ' ', a.n),
      a.t ? h('p', { class: 'brain-epigraph' }, a.t) : null,
      a.part ? h('p', { class: 'brain-note' }, a.part) : null,
      a.refNote ? h('p', { class: 'brain-note', role: 'note' }, a.refNote) : null,
      articleText(a)),
    a.r.length ? h('section', { class: 'brain-block' }, h('h3', null, 'Este artigo remete para'), h('div', { class: 'brain-chips' }, a.r.map(chip))) : null,
    cited.length ? h('section', { class: 'brain-block' }, h('h3', null, 'Citado por'), h('div', { class: 'brain-chips' }, cited.map(chip))) : null,
    jurisBlock(d, a),
    h('nav', { class: 'brain-pager', 'aria-label': 'Artigos vizinhos' },
      prev ? h('a', { href: art(d.id, prev.k) }, `← ${prev.n}`) : h('span'),
      h('a', { href: hashFor(d.id) }, 'Índice'),
      next ? h('a', { href: art(d.id, next.k) }, `${next.n} →`) : h('span')),
    disclaimer(),
  ];
}

// ── Router ──────────────────────────────────────────────────────────────────────────────────────
let token = 0;
const guide = document.getElementById('law');
const shell = document.getElementById('brain-shell');
const modes = { guide: document.getElementById('modeGuide'), search: document.getElementById('modeSearch'), law: document.getElementById('modeLaw') };
async function render() {
  const analysing = location.hash === '#/direito/caso';
  const searching = location.hash === '#/direito/pesquisa';
  const situations = location.hash === '#/direito';
  document.getElementById('legal-situations').hidden = !situations;
  modes.guide.setAttribute('aria-current', String(situations));
  modes.search.setAttribute('aria-current', String(searching));
  guide.hidden = !searching;
  document.getElementById('case-shell').hidden = !analysing;
  document.getElementById('modeCase').setAttribute('aria-current', String(analysing));
  if (analysing || searching || situations) {
    ++token;
    shell.hidden = true;
    modes.law.setAttribute('aria-current', 'false');
    return;
  }
  const m = /^#\/direito(?:\/lei(?:\/(.*))?)?$/.exec(location.hash);
  const browsing = !!m && location.hash.startsWith('#/direito/lei');
  if (!m) return;
  shell.hidden = !browsing;
  modes.law.setAttribute('aria-current', String(browsing));
  if (!browsing) return;
  const mine = ++token;
  root.style.minHeight = `${root.getBoundingClientRect().height}px`;
  root.replaceChildren(loading());
  try {
    let parts;
    try { parts = (m[1] || '').split('/').filter(Boolean).map(decodeURIComponent); }
    catch { throw new Error('Endereço da legislação inválido. Volta à hierarquia e escolhe um diploma.'); }
    await ready();
    if (mine !== token) return;
    let content;
    if (!parts.length) content = viewHome();
    else if (parts[0] === 'busca') content = viewSearch(parts.slice(1).join('/'));
    else if (parts[0] === 'grau') content = viewTier(Number(parts[1]));
    else content = viewDoc(parts[0], parts[1]);
    root.replaceChildren(...content.filter(Boolean));
    if (!parts.length || ['busca', 'grau'].includes(parts[0]) || !meta.byId[parts[0]]) root.style.minHeight = '';
  } catch (e) {
    if (mine !== token) return;
    root.style.minHeight = '';
    root.replaceChildren(h('p', { class: 'brain-empty' }, `${e.message} Abre a página através de um servidor.`));
  }
}
window.addEventListener('hashchange', render);
render();

window.brain = {
  section,
  async references(queries) {
    await ready();
    return queries.map(({ text, article }) => {
      const reference = parseRef(text);
      if (reference.name === 'lada' && meta.byId.d75177807) {
        if (!reference.k) return hashFor('d75177807');
        const doc = meta.byId.d75177807;
        return heads.slice(doc.off, doc.off + doc.n).some(([key]) => key === reference.k) ? art(doc.id, reference.k) : null;
      }
      const european = /^(Regulamento|Diretiva)\s*\((UE|CE)\)\s*(?:n\.?\s*º\s*)?(\d{2,4}\/\d+)/i.exec(text);
      if (european) {
        const name = plain(`${european[1]} (${european[2]}) ${european[3]}`);
        const matches = meta.docs.filter((doc) => [doc.title, doc.name, doc.short].some((value) =>
          plain(value || '').replace(/\bn\s+/, '').startsWith(name)));
        if (matches.length !== 1) return null;
        const doc = matches[0];
        if (!reference.k) return hashFor(doc.id);
        return heads.slice(doc.off, doc.off + doc.n).some(([key]) => key === reference.k) ? art(doc.id, reference.k) : null;
      }
      // Inline links require an exact article; never silently redirect a missing article to its law.
      return resolveRef(text, { needArticle: article });
    });
  },
  // Ligação interna para "artigo 37 CRP" e semelhantes; null se não for uma citação de artigo do corpus.
  async link(q) { await ready(); return resolveRef(q, { needArticle: true }); },
  async ref(q) { await ready(); return resolveRef(q); },
};
window.dispatchEvent(new Event('brain-ready'));

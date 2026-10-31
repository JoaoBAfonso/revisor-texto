// Cérebro jurídico: navega e pesquisa o corpus de legislação (data/lei) no browser, sem servidor.
import { tokens } from './proxy/corpus/tokens.mjs';

const root = document.getElementById('brain');
const DATA = 'data/lei';
const REV = '4';

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
  let m = /^(.+?),?\s+art(?:igo)?s?\.?\s*(\d+(?:-[A-Z])?)\s*\.?\s*º?\b/i.exec(s);
  if (m) return { name: plain(m[1]), k: m[2].toUpperCase() };
  m = /^(?:art(?:igo)?s?\.?\s*)?(\d+(?:-[A-Z])?)\s*\.?\s*º?\s*(?:n\.?º?\s*\d+\s*)?(?:d[oae]s?\s+)?(.+)$/i.exec(s);
  if (m) return { name: plain(m[2]), k: m[1].toUpperCase() };
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
  const d = findDoc(name);
  if (!d) return null;
  if (!k) return needArticle ? null : hashFor(d.id);
  for (let i = 0; i < d.n; i++) if (heads[d.off + i][0] === k.toLowerCase() || heads[d.off + i][0] === k) return art(d.id, heads[d.off + i][0]);
  return needArticle ? null : hashFor(d.id);
}

// ── Peças de interface ─────────────────────────────────────────────────────────────────────────
const rankName = (r) => meta.ranks.find((x) => x.rank === r)?.name || '';
const badge = (d) => h('span', { class: 'brain-rank', 'data-rank': d.rank }, `Grau ${d.rank}`);

function articleText(a) {
  return h('div', { class: 'brain-text' }, a.x.split(/\n+/).map((line) => {
    const item = /^([a-z]\)|\d+[.)º]|[ivx]+\))\s/i.test(line);
    return h('p', { class: item ? 'item' : '' }, line);
  }));
}

function searchBox(value = '') {
  const input = h('input', { type: 'search', maxlength: '120', value, placeholder: 'Tema, palavra ou artigo (ex.: despejo, artigo 65 CRP)…', 'aria-label': 'Perguntar ao guia jurídico', autocomplete: 'off' });
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
// Os graus baixos têm centenas de diplomas: ficam recolhidos, por ordem cronológica inversa.
const tierDocs = (docs) => (docs.length <= 12 ? docList(docs)
  : h('details', { class: 'brain-fold' }, h('summary', null, `Ver os ${docs.length} diplomas`), docList(docs)));
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
  g.items.forEach((x, i) => { const li = row(x); if (i >= shown) li.hidden = true; list.append(li); });
  const more = g.items.length > shown ? h('button', {
    type: 'button', class: 'brain-more',
    onclick: (e) => { for (const li of list.querySelectorAll('li[hidden]')) li.hidden = false; e.target.remove(); },
  }, `Mostrar mais ${g.items.length - shown}`) : null;
  return h('section', { class: 'brain-block brain-group', 'data-rank': g.rank },
    h('h3', null, h('span', null, `Grau ${g.rank}`), ' ', g.name),
    h('p', { class: 'brain-tier-note' }, g.note),
    list, more);
}

function hitCard({ g, d, i }) {
  const [, n, t] = heads[g];
  const holder = h('div', { class: 'brain-inline' });
  const det = h('details', { class: 'brain-hit-body' },
    h('summary', null, h('span', { class: 'brain-ref' }, `${d.short}, art. `), h('span', { class: 'brain-art' }, n), ' ', h('span', { class: 'brain-title' }, t || '')),
    holder);
  let filled = false;
  det.addEventListener('toggle', async () => {
    if (!det.open || filled) return;
    filled = true;
    holder.append(loading('A abrir o artigo…'));
    try {
      const doc = await load(d.id);
      const a = doc.arts[i];
      holder.replaceChildren(articleText(a), h('a', { class: 'brain-open', href: art(d.id, a.k) }, 'Abrir no contexto do diploma →'));
    } catch (e) { holder.replaceChildren(h('p', { class: 'brain-empty' }, e.message)); filled = false; }
  });
  return det;
}

function viewDoc(id, k) {
  const d = meta.byId[id];
  if (!d) return [h('p', { class: 'brain-empty' }, 'Diploma não encontrado.'), h('a', { href: hashFor() }, '← Legislação')];
  const wrap = h('div', { class: 'brain-doc' }, loading('A abrir o diploma…'));
  load(id).then((doc) => {
    const idx = k ? doc.arts.findIndex((a) => a.k === k) : -1;
    wrap.replaceChildren(...(idx >= 0 ? viewArticle(d, doc, idx) : viewToc(d, doc, k)).filter(Boolean));
    window.scrollTo(0, 0);
  }).catch((e) => wrap.replaceChildren(h('p', { class: 'brain-empty' }, e.message)));
  return [searchBox(), wrap];
}

function docHeader(d) {
  return h('header', { class: 'brain-dochead', 'data-rank': d.rank },
    badge(d),
    h('h3', null, d.name),
    h('p', { class: 'brain-tier-note' }, `${rankName(d.rank)} · ${d.title}`),
    h('a', { class: 'brain-open', href: d.url, target: '_blank', rel: 'noopener noreferrer' }, `Fonte: ${/diariodarepublica/.test(d.url) ? 'DRE' : 'PGDL'} ↗`));
}

function viewToc(d, doc, missing) {
  const kids = new Map();
  doc.secs.forEach((s, i) => { const p = s.u; (kids.get(p) || kids.set(p, []).get(p)).push(i); });
  const arts = new Map();
  doc.arts.forEach((a) => { (arts.get(a.s) || arts.set(a.s, []).get(a.s)).push(a); });
  const artList = (list) => h('ul', { class: 'brain-arts' }, list.map((a) => h('li', null,
    h('a', { href: art(d.id, a.k) }, h('b', null, a.n), a.t ? ` ${a.t}` : ''))));
  const node = (i) => {
    const s = doc.secs[i];
    const inner = [...(kids.get(i) || []).map(node), arts.get(i) ? artList(arts.get(i)) : null];
    return h('details', { class: 'brain-sec', 'data-l': s.l }, h('summary', null, s.n), inner);
  };
  const top = (kids.get(-1) || []).map(node);
  return [
    docHeader(d),
    missing ? h('p', { class: 'brain-empty' }, `O artigo ${missing} não existe neste diploma.`) : null,
    top.length ? h('div', { class: 'brain-toc' }, top) : null,
    arts.get(undefined) || arts.get(-1) ? artList(arts.get(undefined) || arts.get(-1)) : null,
    !top.length ? artList(doc.arts) : null,
    disclaimer(),
  ];
}

function sectionPath(doc, a) {
  const path = [];
  for (let i = a.s; i != null && i >= 0; i = doc.secs[i]?.u) path.unshift(doc.secs[i].n);
  return path;
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
    h('nav', { class: 'brain-crumbs', 'aria-label': 'Localização' }, h('a', { href: hashFor(d.id) }, d.short), sectionPath(doc, a).map((s) => h('span', null, s))),
    h('article', { class: 'brain-article' },
      h('h4', null, h('small', null, `${d.short} · Artigo`), ' ', a.n),
      a.t ? h('p', { class: 'brain-epigraph' }, a.t) : null,
      articleText(a)),
    a.r.length ? h('section', { class: 'brain-block' }, h('h3', null, 'Este artigo remete para'), h('div', { class: 'brain-chips' }, a.r.map(chip))) : null,
    cited.length ? h('section', { class: 'brain-block' }, h('h3', null, 'Citado por'), h('div', { class: 'brain-chips' }, cited.map(chip))) : null,
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
const modes = { guide: document.getElementById('modeGuide'), law: document.getElementById('modeLaw') };
async function render() {
  const m = /^#\/direito(?:\/lei(?:\/(.*))?)?$/.exec(location.hash);
  const browsing = !!m && location.hash.startsWith('#/direito/lei');
  if (!m) return;
  guide.hidden = browsing;
  shell.hidden = !browsing;
  modes.guide.setAttribute('aria-current', String(!browsing));
  modes.law.setAttribute('aria-current', String(browsing));
  if (!browsing) return;
  const parts = (m[1] || '').split('/').filter(Boolean).map(decodeURIComponent);
  const mine = ++token;
  root.replaceChildren(loading());
  try {
    await ready();
    if (mine !== token) return;
    let content;
    if (!parts.length) content = viewHome();
    else if (parts[0] === 'busca') content = viewSearch(parts.slice(1).join('/'));
    else content = viewDoc(parts[0], parts[1]);
    root.replaceChildren(...content.filter(Boolean));
    window.scrollTo(0, 0);
  } catch (e) {
    root.replaceChildren(h('p', { class: 'brain-empty' }, `${e.message} Abre a página através de um servidor.`));
  }
}
window.addEventListener('hashchange', render);
render();

window.brain = {
  section,
  // Ligação interna para "artigo 37 CRP" e semelhantes; null se não for uma citação de artigo do corpus.
  async link(q) { await ready(); return resolveRef(q, { needArticle: true }); },
  async ref(q) { await ready(); return resolveRef(q); },
};
window.dispatchEvent(new Event('brain-ready'));

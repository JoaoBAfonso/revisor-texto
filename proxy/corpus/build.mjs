// Constrói o corpus do «cérebro jurídico»: descarrega os diplomas do catálogo (texto consolidado do PGDL),
// separa-os em artigos com a sua estrutura (livro, título, capítulo…), extrai as remissões entre artigos
// e gera os ficheiros em data/lei/ que o site lê.
//
//   node corpus/build.mjs            descarrega o que falta e reconstrói o índice
//   node corpus/build.mjs --force    volta a descarregar tudo
//   node corpus/build.mjs --only cc,ct
//   node corpus/build.mjs --index    só reconstrói o índice (sem rede)
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CATALOG, RANKS, ALIASES } from './catalog.mjs';
import { readHtml, extractText } from '../texto.js';
import { tokens } from './tokens.mjs';
import { TOPICS } from '../guia.js';
import { makeResolver, compileGuide } from './procedures.mjs';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data', 'lei');
mkdirSync(OUT, { recursive: true });
const args = process.argv.slice(2);
const FORCE = args.includes('--force');
const INDEX_ONLY = args.includes('--index');
const ONLY = args.includes('--only') ? new Set(args[args.indexOf('--only') + 1].split(',')) : null;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const BASE = 'https://www.pgdlisboa.pt/leis';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const file = (id) => join(OUT, `${id}.json`);

const latin1 = (s) => [...Buffer.from(s, 'latin1')].map((b) => `%${b.toString(16).padStart(2, '0')}`).join('');

async function resolveNid(name) {
  const url = `${BASE}/lei_busca.php?busca=codigo&buscacodigo=${latin1(name)}&pagina=1&ficha=1&so_miolo=`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  return /lei_mostra_estrutura\.php\?[^"']*?nid=(\d+)/.exec(await readHtml(res))?.[1] || null;
}

// ── Estrutura ────────────────────────────────────────────────────────────────────────────────────
const LEVEL = [/^PARTE\b/i, /^LIVRO\b/i, /^T[IÍ]TULO\b/i, /^CAP[IÍ]TULO\b/i, /^SEC[CÇ][AÃ]O\b/i, /^SUBSEC[CÇ][AÃ]O\b/i];
const ARTICLE = /^## Artigo\s+(\d+)\.?\s*[º°o]?(?:\s*-?\s*([A-Za-z]{1,3}))?\.?(?:\s+—\s+(.*))?$/i;

export function parse(text) {
  const lines = text.split('\n\n');
  const secs = [];
  const stack = [];
  const arts = [];
  let cur = null;
  let docTitle = '';
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^# /.test(line)) { docTitle ||= line.slice(2); continue; }
    const art = ARTICLE.exec(line);
    if (art) {
      cur = { k: art[2] ? `${art[1]}-${art[2].toUpperCase()}` : art[1], n: `${art[1]}.º${art[2] ? `-${art[2].toUpperCase()}` : ''}`, t: (art[3] || '').trim(), s: stack.length ? stack[stack.length - 1] : -1, x: [] };
      arts.push(cur);
      continue;
    }
    const lvl = line.startsWith('## ') ? LEVEL.findIndex((re) => re.test(line.slice(3))) : -1;
    if (lvl >= 0) {
      let name = line.slice(3).trim();
      const next = lines[i + 1];
      if (next && !next.startsWith('#') && next.length < 120 && !/^(\d+|[a-z])\s*[-–).]/.test(next)) { name += ` — ${next.trim()}`; i++; }
      while (stack.length && secs[stack[stack.length - 1]].l >= lvl) stack.pop();
      secs.push({ n: name, l: lvl, u: stack.length ? stack[stack.length - 1] : -1 });
      stack.push(secs.length - 1);
      cur = null;
      continue;
    }
    if (cur && !line.startsWith('## ')) cur.x.push(line);
  }
  for (const a of arts) {
    a.x = a.x.join('\n');
    if (/^\(?revogado\)?\.?$/i.test(a.x.trim()) || /^\(?revogado\)?$/i.test(a.t)) a.v = 0;
  }
  return { title: docTitle, secs, arts };
}

// ── Remissões ────────────────────────────────────────────────────────────────────────────────────
const NUM = /(\d{1,4})(?:\.?\s*[º°o])?(?:-([A-Z]{1,2}))?/g;
const OTHER_ACT = /^[^.;]{0,50}?\bd[oa]s?\s+(?:Decreto|Lei\b|Portaria|Regulamento|Diretiva|Directiva|Conven[çc][ãa]o|Tratado|Carta|Resolu[çc][ãa]o|Despacho|DL\b)/i;

export function refsOf(text, self) {
  const out = new Set();
  const re = /\bartigos?\s+((?:\d{1,4}(?:\.?\s*[º°o])?(?:-[A-Z]{1,2})?(?:\s*(?:,|\be\b|\bou\b|\ba\b|\bao\b)\s*)?)+)/gi;
  for (const m of text.matchAll(re)) {
    const after = text.slice(m.index + m[0].length, m.index + m[0].length + 110);
    let target = self;
    if (OTHER_ACT.test(after)) continue;
    const named = /^[^.;]{0,50}?\bd[oa]s?\s+(?:presente\s+|mesmo\s+)?(.{1,80})/i.exec(after)?.[1];
    if (named) {
      const hit = ALIASES.find(([, a]) => a.test(named));
      if (hit) target = hit[0];
    }
    const nums = [];
    let prevEnd = 0;
    let range = false;
    for (const n of m[1].matchAll(NUM)) {
      const k = n[2] ? `${n[1]}-${n[2]}` : n[1];
      if (range && nums.length) {
        const from = Number(nums[nums.length - 1].split('-')[0]);
        const to = Number(n[1]);
        if (to > from && to - from <= 30) for (let x = from + 1; x < to; x++) nums.push(String(x));
      }
      nums.push(k);
      const gap = m[1].slice(n.index + n[0].length).match(/^\s*(\ba\b|\bao\b)\s*\d/i);
      range = Boolean(gap);
      prevEnd = n.index + n[0].length;
    }
    for (const k of nums) out.add(`${target}:${k}`);
  }
  return [...out];
}

// ── Descarregar ──────────────────────────────────────────────────────────────────────────────────
async function fetchDoc(d) {
  const nid = d.nid || (await resolveNid(d.name));
  if (!nid) throw new Error('nid não encontrado');
  // O PGDL mostra 100 artigos por página.
  const pages = [];
  let title = '';
  let firstOfPrevious = '';
  for (let p = 1; p <= 90; p++) {
    await sleep(300);
    const url = p === 1 ? `${BASE}/lei_mostra_articulado.php?nid=${nid}&tabela=leis`
      : `${BASE}/lei_mostra_articulado.php?ficha=${(p - 1) * 100 + 1}&artigo_id=&nid=${nid}&pagina=${p}&tabela=leis&nversao=&so_miolo=`;
    const html = await readHtml(await fetch(url, { headers: { 'User-Agent': UA } }), Infinity);
    const page = extractText(html, 'pgdlisboa.pt', '', Infinity);
    const first = /^## Artigo[^\n]*/m.exec(page.text)?.[0] || '';
    if (!first || first === firstOfPrevious) break;
    firstOfPrevious = first;
    title ||= page.title;
    pages.push(page.text);
  }
  const text = pages.join('\n\n');
  const parsed = parse(text);
  if (!parsed.arts.length) throw new Error('sem artigos');
  const doc = {
    id: d.id, name: d.name, short: d.short, rank: d.rank, area: d.area, nid,
    url: `${BASE}/lei_mostra_articulado.php?nid=${nid}&tabela=leis`,
    title: parsed.title || title.replace(/^:+\s*/, ''),
    secs: parsed.secs,
    arts: parsed.arts.map((a) => ({ ...a, r: refsOf(a.x, d.id).filter((r) => r !== `${d.id}:${a.k}`) })),
  };
  writeFileSync(file(d.id), JSON.stringify(doc));
  return doc;
}

if (!INDEX_ONLY) {
  for (const d of CATALOG) {
    if (ONLY && !ONLY.has(d.id)) continue;
    if (!FORCE && existsSync(file(d.id))) continue;
    try {
      const doc = await fetchDoc(d);
      console.log(`✓ ${d.id.padEnd(14)} ${String(doc.arts.length).padStart(5)} artigos  ${doc.title.slice(0, 60)}`);
    } catch (e) { console.log(`✗ ${d.id.padEnd(14)} ${e.message}`); }
    await sleep(400);
  }
}

// ── Índice ───────────────────────────────────────────────────────────────────────────────────────
const DRE_DOCS = join(dirname(fileURLToPath(import.meta.url)), 'dre', 'docs.json');
const dreDocs = existsSync(DRE_DOCS) ? JSON.parse(readFileSync(DRE_DOCS, 'utf8')) : [];
const entries = [...CATALOG, ...dreDocs.filter((d) => !CATALOG.some((c) => c.id === d.id))].filter((d) => existsSync(file(d.id)));
const entryOf = new Map(entries.map((e) => [e.id, e]));
const docs = entries.map((d) => JSON.parse(readFileSync(file(d.id), 'utf8')));
// Texto integral só nos diplomas até à lei ordinária; os restantes (portarias, resoluções…) pesquisam-se por título e epígrafe.
const FULLTEXT_MAX_RANK = 4;
const keys = new Set(docs.flatMap((d) => d.arts.map((a) => `${d.id}:${a.k}`)));
const gids = [];
const meta = { rev: new Date().toISOString().slice(0, 10), ranks: RANKS, docs: [] };
const body = new Map();
const head = new Map();
const inbound = {};

let off = 0;
// O PGDL acrescenta a cada artigo a lista de alterações e de versões anteriores: não é texto da lei.
const NOTE = /^(Cont[ée]m as altera[çc][õo]es|Consultar vers[õo]es anteriores|Aditado pelo|P[áa]ginas:|Seguinte\s*>|<\s*Anterior|Texto (inicial|original)|Artigo (revogado|alterado) pel)/i;
const trimNotes = (x) => { const lines = x.split('\n'); const i = lines.findIndex((l) => NOTE.test(l.trim())); return (i < 0 ? lines : lines.slice(0, i)).join('\n').trim(); };
for (const d of docs) {
  let dirty = false;
  const c = entryOf.get(d.id);
  if (c.tipo) {
    const title = `${c.tipo}${c.numero ? ` n.º ${c.numero}` : ` de ${c.ano}`} — ${c.name}`;
    if (d.title !== title) { d.title = title; dirty = true; }
  }
  d.arts.forEach((a, i) => {
    const clean = trimNotes(a.x);
    if (clean !== a.x && clean) { a.x = clean; dirty = true; }
    if (!a.r) { a.r = refsOf(a.x, d.id).filter((r) => r !== `${d.id}:${a.k}`); dirty = true; }
    const valid = a.r.filter((r) => keys.has(r));
    if (valid.length !== a.r.length) { a.r = valid; dirty = true; }
    for (const r of a.r) (inbound[r] ||= new Set()).add(`${d.id}:${a.k}`);
    const gid = off + i;
    if (c.rank <= FULLTEXT_MAX_RANK) for (const t of new Set(tokens(a.x))) (body.get(t) || body.set(t, []).get(t)).push(gid);
    for (const t of new Set(tokens(`${a.t} ${d.short}`))) (head.get(t) || head.set(t, []).get(t)).push(gid);
  });
  if (dirty) writeFileSync(file(d.id), JSON.stringify(d));
  meta.docs.push({ id: d.id, name: c.name, short: c.short, rank: c.rank, area: c.area, url: d.url, title: d.title, off, n: d.arts.length, secs: d.secs.length, ...(c.ano ? { ano: c.ano } : {}) });
  off += d.arts.length;
}
meta.total = off;
meta.topics = TOPICS.map((t) => ({ id: t.id, area: t.area }));

// Palavras presentes em mais de 20% dos artigos não distinguem nada. Listas ordenadas, em deltas.
const delta = (list) => list.map((g, i) => (i ? g - list[i - 1] : g));
const pack = (map, max) => Object.fromEntries([...map].filter(([, l]) => l.length <= max).map(([t, l]) => [t, delta(l)]));
const index = { n: off, b: pack(body, off * 0.2), h: pack(head, off * 0.2) };
const refs = Object.fromEntries(Object.entries(inbound).map(([k, v]) => [k, [...v].slice(0, 60)]));

writeFileSync(join(OUT, 'meta.json'), JSON.stringify(meta));
writeFileSync(join(OUT, 'index.json'), JSON.stringify(index));
writeFileSync(join(OUT, 'refs.json'), JSON.stringify(refs));
writeFileSync(join(OUT, 'heads.json'), JSON.stringify(docs.flatMap((d) => d.arts.map((a) => [a.k, a.n, a.t]))));

const guide = compileGuide(makeResolver(entryOf, docs, ALIASES));
writeFileSync(join(OUT, 'guia.json'), JSON.stringify(guide.out));
console.log(`\nProcedimentos: ${guide.stats.topics} áreas, ${guide.stats.deadlines} prazos, ${guide.stats.refs} normas citadas; ${guide.unresolved.length} citações sem ligação exata ao corpus:`);
for (const u of guide.unresolved) console.log(`  ! ${u}`);
console.log(`\n${docs.length} diplomas, ${off} artigos, ${Object.keys(index.b).length} termos, ${Object.keys(refs).length} artigos citados.`);

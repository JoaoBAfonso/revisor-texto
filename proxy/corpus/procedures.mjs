// Compila os procedimentos, prazos, direitos, entidades e argumentos de proxy/guia.js para o corpus
// (data/lei/guia.json), ligando cada citação («Código Penal, art. 115.º», «Lei n.º 26/2016») ao artigo ou
// diploma do corpus. Citações que não se resolvem ficam sem ligação e são listadas no build: um prazo sem
// artigo verificável não pode ser dado como certo.
import { ENTITIES, TOOLKIT, TOPICS } from '../guia.js';

const plain = (s) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
const TYPES = 'Lei Org[âa]nica|Lei Constitucional|Lei|Decreto-Lei|Decreto Legislativo Regional|Decreto Regulamentar|Decreto|Portaria|Regulamento';

export function makeResolver(entries, docs, aliases) {
  const keys = new Set(docs.flatMap((d) => d.arts.map((a) => `${d.id}:${a.k}`)));
  const byText = docs.map((d) => ({ id: d.id, text: `${d.title} ${entries.get(d.id).short} ${entries.get(d.id).name}`.replace(/[º°]/g, 'º') }));

  const docByName = (name) => {
    const n = plain(name);
    const hit = aliases.find(([, re]) => re.test(name));
    if (hit && entries.has(hit[0])) return hit[0];
    return [...entries.values()].find((e) => plain(e.short) === n || plain(e.name) === n)?.id
      || (n.length > 8 ? [...entries.values()].find((e) => plain(e.name).startsWith(n))?.id : null) || null;
  };
  const docByNumber = (type, num) => {
    // Os títulos do PGDL abreviam «Decreto-Lei» para «DL»: aceitam-se as duas formas.
    const t = /^decreto-lei$/i.test(type) ? '(?:Decreto-Lei|DL)' : type;
    const re = new RegExp(`(?<![-\\w])${t}\\s+n\\.?º\\s*${num.replace('/', '\\/')}\\b`, 'i');
    return byText.find((d) => re.test(d.text))?.id || null;
  };

  // → { to: 'doc:artigo' | 'doc' | null, why? }
  return (text) => {
    const art = /^(.+?),?\s+art(?:igo)?s?\.?\s*(\d+(?:-[A-Za-z]{1,2})?)\s*\.?\s*º?/i.exec(text.trim());
    if (art) {
      const id = docByName(art[1]);
      const k = art[2].toUpperCase();
      if (!id) return { to: null, why: `diploma «${art[1]}» não está no corpus` };
      return keys.has(`${id}:${k}`) ? { to: `${id}:${k}` } : { to: id, why: `art. ${k}.º não existe em ${id}` };
    }
    const num = new RegExp(`(${TYPES})\\s+n\\.?º\\s*(\\d+(?:-[A-Z])?/\\d{2,4})`, 'i').exec(text);
    if (num) {
      const id = docByNumber(num[1], num[2]);
      return id ? { to: id } : { to: null, why: `${num[1]} n.º ${num[2]} não está no corpus` };
    }
    const id = docByName(text.replace(/\s*\(.*?\)\s*$/, ''));
    return id ? { to: id } : { to: null, why: 'sem artigo nem diploma identificável' };
  };
}

export function compileGuide(resolve) {
  const unresolved = [];
  const link = (topic, kind, text) => {
    const r = resolve(text);
    if (!r.to || r.why) unresolved.push(`${topic} · ${kind} · ${text} — ${r.why}`);
    return r.to;
  };
  const topics = TOPICS.map((t) => ({
    id: t.id, area: t.area, note: t.note, rights: t.rights, steps: t.steps, arguments: t.arguments, entities: t.entities,
    deadlines: (t.deadlines || []).map((d) => ({ ...d, to: link(t.id, 'prazo', d.base) })),
    refs: (t.refs || []).map((text) => ({ text, to: link(t.id, 'norma', text) })),
  }));
  const withDeadlines = topics.reduce((n, t) => n + t.deadlines.length, 0);
  const out = { topics, entities: ENTITIES, toolkit: TOOLKIT };
  return { out, unresolved, stats: { topics: topics.length, deadlines: withDeadlines, refs: topics.reduce((n, t) => n + t.refs.length, 0) } };
}

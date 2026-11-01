// Converte os fragmentos consolidados do DRE (um por artigo, capítulo, título…) no formato do corpus:
// { secs: [{ n, l, u }], arts: [{ k, n, t, s, x, v? }] } — o mesmo que o parse do PGDL em build.mjs.
const LEVEL = [/^PARTE\b/i, /^LIVRO\b/i, /^T[IÍ]TULO\b/i, /^CAP[IÍ]TULO\b/i, /^SEC[CÇ][AÃ]O\b/i, /^SUBSEC[CÇ][AÃ]O\b/i];
const ARTICLE = /^Artigo\s+(\d+)\.?\s*[º°o]?(?:\s*-?\s*([A-Za-z]{1,3}))?\b/i;
const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ordm: 'º', ordf: 'ª' };

export function clean(html) {
  return String(html ?? '')
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|tr|li|h\d)\s*>/gi, '\n')
    .replace(/<\/\s*t[dh]\s*>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/[ \t\u00a0]+\n/g, '\n')
    .replace(/[ \t\u00a0]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const epigraph = (s) => clean(s).replace(/^\((.*)\)$/s, '$1').trim();

export function parseFragments(list, docId) {
  const secs = [];
  const arts = [];
  const stack = []; // { index, nivel }
  const seen = new Map();
  const unique = (k) => { const c = (seen.get(k) || 0) + 1; seen.set(k, c); return c > 1 ? `${k}_${c}` : k; };
  const parent = (nivel) => { while (stack.length && stack[stack.length - 1].nivel >= nivel) stack.pop(); return stack.length ? stack[stack.length - 1].index : -1; };

  list.forEach((item, i) => {
    const frag = item.ConsolidacaoFragmento || {};
    const ver = item.FragmentoVersao || {};
    const nivel = Number(item.Nivel) || 0;
    const name = clean(frag.Name);
    const text = clean(ver.Texto);
    const title = epigraph(frag.Epigrafe);

    if (nivel === 0) {
      if (text) arts.push({ k: 'preambulo', n: 'Preâmbulo', t: '', s: -1, x: text });
      return;
    }
    const art = ARTICLE.exec(name);
    if (art || (!item.HasFilhos && (text || /^Artigo\b/i.test(name)))) {
      let k;
      let n = name;
      if (art) { k = art[2] ? `${art[1]}-${art[2].toUpperCase()}` : art[1]; n = `${art[1]}.º${art[2] ? `-${art[2].toUpperCase()}` : ''}`; }
      else if (/^Artigo\s+[úu]nico/i.test(name)) k = 'unico';
      else k = `x${i}`;
      const a = { k: unique(k), n, t: title, s: parent(nivel), x: text };
      if (/^\(?revogad[oa]s?\)?\.?$/i.test(text) || /^\(?revogad[oa]s?\)?$/i.test(title)) a.v = 0;
      arts.push(a);
      return;
    }
    const lvl = LEVEL.findIndex((re) => re.test(name));
    const label = title && title.toLowerCase() !== name.toLowerCase() ? `${name} — ${title}` : name;
    const u = parent(nivel);
    secs.push({ n: label, l: lvl >= 0 ? lvl : Math.min(nivel - 1, 5), u });
    stack.push({ index: secs.length - 1, nivel });
    if (text) arts.push({ k: unique(`s${i}`), n: name, t: title, s: secs.length - 1, x: text });
  });
  return { secs, arts };
}

// Converte o texto original de um ato (DetalheConteudo.Texto) no mesmo formato. Para diplomas vigentes
// sem consolidação no DRE, a atualidade do texto original deve ser confirmada na fonte.
const ART_LINE = /^Artigo\s+(?:(\d+)\.?\s*[º°o]?(?:\s*-\s*([A-Za-z]{1,3}))?|([úu]nico))\.?\s*$/i;
const HEADING = /^(PARTE|LIVRO|T[IÍ]TULO|CAP[IÍ]TULO|SEC[CÇ][AÃ]O|SUBSEC[CÇ][AÃ]O)\s+[IVXLCD\dÚ]/i;
const BODY = /^(\d+\s*-|[a-z]\)\s)/i;

export function parseOriginal(text) {
  const lines = String(text ?? '').split(/\r\n?|\n/).map((l) => l.replace(/\s+/g, ' ').trim());
  // Epígrafes e nomes de divisões não terminam em pontuação de frase; o corpo dos artigos termina.
  const label = (s) => s && s.length < 120 && !ART_LINE.test(s) && !HEADING.test(s) && !BODY.test(s) && !/[.;:]$/.test(s);
  const secs = [];
  const stack = [];
  const arts = [];
  const seen = new Map();
  const unique = (k) => { const c = (seen.get(k) || 0) + 1; seen.set(k, c); return c > 1 ? `${k}_${c}` : k; };
  let cur = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const art = ART_LINE.exec(line);
    if (art) {
      const k = art[3] ? 'unico' : art[2] ? `${art[1]}-${art[2].toUpperCase()}` : art[1];
      const n = art[3] ? 'Artigo único' : `${art[1]}.º${art[2] ? `-${art[2].toUpperCase()}` : ''}`;
      cur = { k: unique(k), n, t: '', s: stack.length ? stack[stack.length - 1] : -1, x: [] };
      arts.push(cur);
      const next = (lines[i + 1] || '').trim();
      if (label(next)) { cur.t = next.replace(/^\((.*)\)$/s, '$1'); i++; }
      continue;
    }
    const lvl = HEADING.test(line) ? LEVEL.findIndex((re) => re.test(line)) : -1;
    if (lvl >= 0) {
      let name = line;
      const next = (lines[i + 1] || '').trim();
      if (label(next)) { name += ` — ${next}`; i++; }
      while (stack.length && secs[stack[stack.length - 1]].l >= lvl) stack.pop();
      secs.push({ n: name, l: lvl, u: stack.length ? stack[stack.length - 1] : -1 });
      stack.push(secs.length - 1);
      cur = null;
      continue;
    }
    if (cur) cur.x.push(line);
  }
  for (const a of arts) {
    a.x = a.x.join('\n');
    if (/^\(?revogad[oa]\)?\.?$/i.test(a.x.trim()) || /^\(?revogad[oa]\)?$/i.test(a.t)) a.v = 0;
  }
  return { secs, arts };
}

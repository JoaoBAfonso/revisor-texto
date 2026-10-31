// Converte o texto de um ato da UE (XHTML do Jornal Oficial ou HTML antigo do Cellar) no formato do corpus:
// { secs: [{ n, l, u }], arts: [{ k, n, t, s, x, v? }] } — o mesmo que o parse do PGDL e do DRE.
const LEVEL = [/^PARTE\b/i, /^LIVRO\b/i, /^T[IÍ]TULO\b/i, /^CAP[IÍ]TULO\b/i, /^SEC[CÇ][AÃ]O\b/i, /^SUBSEC[CÇ][AÃ]O\b/i];
const ENTITIES = { nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ordm: 'º', ordf: 'ª', laquo: '«', raquo: '»' };
const EPI = '\u0001';

export function toLines(html) {
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html)?.[1] ?? html;
  return body
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    // Índices dos Tratados: tabelas com o número da página na última coluna.
    .replace(/<table[\s\S]*?<\/table>/gi, (t) => (/class="normal"\s*>\s*\d{1,3}\s*<\/td>/.test(t) ? '' : t))
    .replace(/<p[^>]*class="[^"]*(?:oj-)?note[^"]*"[^>]*>[\s\S]*?<\/p>/gi, '')
    .replace(/<a[^>]*href="#(?:ntr|ntc)[^"]*"[^>]*>[\s\S]*?<\/a>/gi, '')
    .replace(/<span class="(?:oj-)?super">\s*o\s*<\/span>/gi, 'º')
    .replace(/<span class="(?:oj-)?super">\s*a\s*<\/span>/gi, 'ª')
    .replace(/<p[^>]*class="[^"]*(?:oj-)?sti-art[^"]*"[^>]*>/gi, `\n${EPI}`)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|tr|li|h\d|table)\s*>/gi, '\n')
    .replace(/<\/\s*t[dh]\s*>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, e) => ENTITIES[e.toLowerCase()] ?? m)
    .replace(/(\d)\.o(?![\p{L}\d])/gu, '$1.º')
    .split('\n')
    .map((l) => l.replace(/[ \t\u00a0\u2009]+/g, ' ').trim())
    .filter(Boolean)
    .reduce((out, l) => {
      // Alíneas em tabela chegam como duas linhas («a)» e o texto): juntam-se.
      if (out.length && /^(\(?[a-z0-9]{1,4}\)|\d{1,3}\.|[—–-])$/i.test(out[out.length - 1]) && !ARTICLE_LINE.test(l)) out[out.length - 1] += ` ${l}`;
      else out.push(l);
      return out;
    }, []);
}

const ARTICLE_LINE = /^(Artigo\s+\d|ANEXO\b|\u0001)/i;

const ARTICLE = /^Artigo\s+(\d+)\.?\s*[º°]?(?:\s*-?\s*([A-Za-z]{1,2}))?$/i;
const ANNEX = /^ANEXO\b/i;
// Os Tratados trazem protocolos e declarações depois do articulado: ficam de fora.
const STOP = /^(DECLARA[ÇC][ÕO]ES\b|PROTOCOLOS?\s*(\(|N\.)|PROTOCOLOS$|PROTOCOLOS ANEXADOS|ACTO FINAL|ATO FINAL)/;
const END = /^(ADOT|ADOP|APROV|DECID|TOMOU|ACORD)[A-ZÁÉÍÓÚÃÕÇ]*\b/;
const looksLikeBody = (l) => /^(\d+[.)]|\(\d+\)|[a-z]\)|[ivx]+\))\s/i.test(l);

export function parseEu(html) {
  const lines = toLines(html);
  const secs = [];
  const arts = [];
  const stack = [];
  let cur = null;
  let recitals = false;
  let sec = -1;
  const legacy = !/class="(?:oj-)?sti-art"/.test(html);
  const seen = new Map();
  const unique = (k) => { const c = (seen.get(k) || 0) + 1; seen.set(k, c); return c > 1 ? `${k}_${c}` : k; };
  const sticky = () => (stack.length ? stack[stack.length - 1] : -1);

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (arts.length && STOP.test(line)) break;
    const art = ARTICLE.exec(line);
    if (art || ANNEX.test(line)) {
      recitals = false;
      const k = art ? (art[2] ? `${art[1]}-${art[2].toUpperCase()}` : art[1]) : `anexo${arts.filter((a) => a.k.startsWith('anexo')).length + 1}`;
      const n = art ? `${art[1]}.º${art[2] ? `-${art[2].toUpperCase()}` : ''}` : line;
      cur = { k: unique(k), n, t: '', s: sticky(), x: [] };
      const next = lines[i + 1] || '';
      const epi = next.startsWith(EPI) ? next.slice(1) : (legacy && art && next.length <= 110 && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(next) && !/[.:;]$/.test(next) && !looksLikeBody(next) ? next : '');
      if (epi || next.startsWith(EPI)) { cur.t = epi; i++; }
      else if (!art && next && !looksLikeBody(next) && next.length <= 160) { cur.t = next; i++; }
      arts.push(cur);
      continue;
    }
    if (line.startsWith(EPI)) line = line.slice(1);
    if (/^Considerando\b/i.test(line) && line.length < 60 && !arts.length) { recitals = true; sec = secs.push({ n: 'Considerandos', l: 0, u: -1 }) - 1; stack.length = 0; cur = null; continue; }
    if (recitals) {
      if (END.test(line)) { recitals = false; cur = null; continue; }
      const m = /^\((\d+)\)\s*(.*)$/.exec(line);
      if (m) { cur = { k: `c${m[1]}`, n: `Considerando ${m[1]}`, t: '', s: sec, x: [m[2]] }; arts.push(cur); }
      else if (cur) cur.x.push(line);
      continue;
    }
    const lvl = LEVEL.findIndex((re) => re.test(line));
    if (lvl >= 0 && line.length < 80 && /^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]+\s+[\dIVXLC]+(\s|$)/.test(line)) {
      let name = line;
      const next = lines[i + 1];
      if (next && !ARTICLE.test(next) && !LEVEL.some((re) => re.test(next)) && next.length < 140 && !looksLikeBody(next)) { name += ` — ${next.replace(EPI, '')}`; i++; }
      while (stack.length && secs[stack[stack.length - 1]].l >= lvl) stack.pop();
      secs.push({ n: name, l: lvl, u: stack.length ? stack[stack.length - 1] : -1 });
      stack.push(secs.length - 1);
      cur = null;
      continue;
    }
    if (cur) {
      if (/^Feito em\b/.test(line) && !cur.k.startsWith('anexo')) { cur = null; continue; }
      cur.x.push(line);
    }
  }
  for (const a of arts) {
    a.x = a.x.join('\n').trim();
    if (/^\(?revogad[oa]s?\)?\.?$/i.test(a.x) || /^\(?revogad[oa]s?\)?$/i.test(a.t)) a.v = 0;
  }
  return { secs, arts: arts.filter((a) => a.x || a.t) };
}

// Extrai as definições da página do Dicionário Priberam. Sem dependências: corre em Node e em Cloudflare Workers.

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Remove <span class="..."> com o conteúdo, respeitando spans aninhados.
function removeSpans(html, cls) {
  const open = new RegExp(`<span[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, 'g');
  let m;
  while ((m = open.exec(html))) {
    let depth = 1;
    const tag = /<(\/?)span\b[^>]*>/g;
    tag.lastIndex = m.index + m[0].length;
    let t;
    while (depth && (t = tag.exec(html))) depth += t[1] ? -1 : 1;
    const end = t ? t.index + t[0].length : html.length;
    html = html.slice(0, m.index) + html.slice(end);
    open.lastIndex = m.index;
  }
  return html;
}

function toText(html) {
  html = removeSpans(html, 'varpb'); // variante brasileira
  return decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').replace(/\s+([,.;:)\]])/g, '$1').replace(/([(\[])\s+/g, '$1').trim();
}

export function parsePriberam(html, word) {
  const start = html.indexOf('id="resultados"');
  if (start < 0) return { word, found: false, entries: [] };
  const endArticle = html.indexOf('</article>', start);
  const region = html.slice(start, endArticle < 0 ? undefined : endArticle);

  if (/Palavra não encontrada/i.test(region)) return { word, found: false, entries: [] };

  const entries = [];
  let current = null;
  const token = /<p class="ml-12 pt-12 pb-4[^"]*"[^>]*>([\s\S]*?)<\/p>|<div class="py-4 dp-definicao-linha">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = token.exec(region))) {
    if (m[1] !== undefined) {
      current = { category: toText(m[1]), definitions: [] };
      entries.push(current);
    } else {
      const text = toText(m[2]);
      if (!text) continue;
      if (!current) { current = { category: '', definitions: [] }; entries.push(current); }
      current.definitions.push(text);
    }
  }

  const formMatch = region.match(/<p class="dp-forma[^"]*"[^>]*>([\s\S]*?)<\/p>/);
  return {
    word,
    found: entries.some((e) => e.definitions.length) || !!formMatch,
    forms: formMatch ? toText(formMatch[1]) : null,
    entries: entries.filter((e) => e.definitions.length),
  };
}

export async function lookupPriberam(word, fetchFn = fetch) {
  const res = await fetchFn(`https://dicionario.priberam.org/${encodeURIComponent(word)}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; revisor-texto)', 'Accept-Language': 'pt-PT' },
    redirect: 'follow',
  });
  if (res.status === 404) return { word, found: false, entries: [] };
  if (!res.ok) throw new Error(`Priberam respondeu ${res.status}`);
  return parsePriberam(await res.text(), word);
}

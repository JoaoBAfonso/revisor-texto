// Pesquisa no consultório do Ciberdúvidas. Sem dependências: corre em Node e em Cloudflare Workers.
// O formulário exige um token CSRF e o cookie de sessão que o acompanha, por isso são precisos dois pedidos.

const BASE = 'https://ciberduvidas.iscte-iul.pt';
const UA = 'Mozilla/5.0 (compatible; RevisorDeTexto/1.0)';
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#x2F': '/',
  laquo: '«', raquo: '»', ndash: '–', mdash: '—', hellip: '…', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”',
  ordm: 'º', ordf: 'ª', euro: '€', shy: '',
};
for (const [base, accents] of Object.entries({
  a: 'acute grave circ tilde uml ring', e: 'acute grave circ uml', i: 'acute grave circ uml',
  o: 'acute grave circ tilde uml', u: 'acute grave circ uml', n: 'tilde', c: 'cedil', y: 'acute',
})) {
  const marks = { acute: '\u0301', grave: '\u0300', circ: '\u0302', tilde: '\u0303', uml: '\u0308', ring: '\u030a', cedil: '\u0327' };
  for (const acc of accents.split(' ')) {
    ENTITIES[base + acc] = (base + marks[acc]).normalize('NFC');
    ENTITIES[base.toUpperCase() + acc] = (base.toUpperCase() + marks[acc]).normalize('NFC');
  }
}

export function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

// O site entrega alguns títulos com entidades duplamente codificadas (&amp;lt;i&amp;gt;).
export function toText(html) {
  const once = decode(html);
  const noTags = once.replace(/<[^>]+>/g, '');
  return decode(noTags).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

const grab = (html, re) => {
  const m = re.exec(html);
  return m ? toText(m[1]) : '';
};

const clip = (s, n) => (s.length > n ? `${s.slice(0, n).replace(/\s+\S*$/, '')}…` : s);

export function parseCiberduvidas(html) {
  const results = [];
  for (const part of html.split('<article>').slice(1)) {
    const article = part.split('</article>')[0];
    const link = /<a class="title" href="(\/consultorio\/perguntas\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(article);
    if (!link) continue;
    results.push({
      title: toText(link[2]),
      url: BASE + decode(link[1]),
      summary: clip(grab(article, /<div class="description">([\s\S]*?)<\/div>/), 280),
      author: grab(article, /<span class="author">([\s\S]*?)<\/span>/),
      location: grab(article, /<span\s+class="location">([\s\S]*?)<\/span>/),
      date: grab(article, /<span\s+class="date">([\s\S]*?)<\/span>/),
    });
  }
  return results;
}

const ALLOWED_TAGS = new Set(['p', 'strong', 'b', 'em', 'i', 'br', 'ul', 'ol', 'li', 'blockquote', 'sup', 'sub']);

// Só passam tags inofensivas, sem atributos; o texto é sempre escapado.
function cleanHtml(html) {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .split(/(<[^>]*>)/)
    .map((part) => {
      const tag = /^<(\/?)([a-z0-9]+)/i.exec(part);
      if (part.startsWith('<')) {
        if (!tag || !ALLOWED_TAGS.has(tag[2].toLowerCase())) return '';
        const name = tag[2].toLowerCase();
        return name === 'br' ? '<br>' : `<${tag[1]}${name}>`;
      }
      return esc(decode(part));
    })
    .join('')
    .replace(/<p>\s*<\/p>/g, '')
    .trim();
}

export function parseAnswer(html) {
  const block = (cls) => {
    const m = new RegExp(`<div class="[^"]*${cls}[^"]*">([\\s\\S]*?)</div>\\s*(?:</div>|<div class="articleInfo")`).exec(html);
    return m ? cleanHtml(m[1]) : '';
  };
  const question = block('description');
  const answer = block('answerContent');
  return {
    title: grab(html, /<h3>\s*([\s\S]*?)\s*<\/h3>/),
    question,
    answer,
    author: grab(html, /<a class="author"[^>]*>([\s\S]*?)<\/a>/),
    date: grab(html, /<div class="date"[^>]*>([\s\S]*?)<\/div>/),
  };
}

export async function fetchAnswer(url) {
  if (!url.startsWith(`${BASE}/consultorio/perguntas/`)) throw new Error('URL inválida');
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Ciberdúvidas respondeu ${res.status}`);
  const data = parseAnswer(await res.text());
  if (!data.answer) throw new Error('Resposta não encontrada');
  return { ...data, url };
}

function cookiesFrom(res) {
  const list = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') || '').split(/,(?=\s*[\w-]+=)/);
  return list.map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

export async function searchCiberduvidas(term, page = 1) {
  const start = await fetch(`${BASE}/consultorio`, { headers: { 'User-Agent': UA } });
  if (!start.ok) throw new Error(`Ciberdúvidas respondeu ${start.status}`);
  const cookie = cookiesFrom(start);
  const token = /name="csrfToken" value="([^"]+)"/.exec(await start.text())?.[1];
  if (!token) throw new Error('Token CSRF não encontrado');

  const res = await fetch(`${BASE}/pesquisa`, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: new URLSearchParams({ csrfToken: token, searchTerm: term, page: String(page) }),
  });
  if (!res.ok) throw new Error(`Ciberdúvidas respondeu ${res.status}`);
  const results = parseCiberduvidas(await res.text());
  return { term, page, results, moreUrl: `${BASE}/consultorio` };
}

// Pesquisa no consultório do Ciberdúvidas. Sem dependências: corre em Node e em Cloudflare Workers.
// O formulário exige um token CSRF e o cookie de sessão que o acompanha, por isso são precisos dois pedidos.

const BASE = 'https://ciberduvidas.iscte-iul.pt';
const UA = 'Mozilla/5.0 (compatible; RevisorDeTexto/1.0)';
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#x2F': '/' };

function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

// O site entrega alguns títulos com entidades duplamente codificadas (&amp;lt;i&amp;gt;).
function toText(html) {
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

function cookiesFrom(res) {
  const list = typeof res.headers.getSetCookie === 'function'
    ? res.headers.getSetCookie()
    : (res.headers.get('set-cookie') || '').split(/,(?=\s*[\w-]+=)/);
  return list.map((c) => c.split(';')[0].trim()).filter(Boolean).join('; ');
}

export async function searchCiberduvidas(term) {
  const page = await fetch(`${BASE}/consultorio`, { headers: { 'User-Agent': UA } });
  if (!page.ok) throw new Error(`Ciberdúvidas respondeu ${page.status}`);
  const cookie = cookiesFrom(page);
  const token = /name="csrfToken" value="([^"]+)"/.exec(await page.text())?.[1];
  if (!token) throw new Error('Token CSRF não encontrado');

  const res = await fetch(`${BASE}/pesquisa`, {
    method: 'POST',
    headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Cookie: cookie },
    body: new URLSearchParams({ csrfToken: token, searchTerm: term, page: '1' }),
  });
  if (!res.ok) throw new Error(`Ciberdúvidas respondeu ${res.status}`);
  const results = parseCiberduvidas(await res.text());
  return { term, results, moreUrl: `${BASE}/consultorio` };
}

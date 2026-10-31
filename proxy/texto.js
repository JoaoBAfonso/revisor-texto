// Obtém o texto integral de documentos jurídicos públicos (legislação, acórdãos, deliberações),
// para serem lidos dentro do site. Só aceita os domínios das fontes jurídicas.
import { toText, decode } from './ciberduvidas.js';

const MAX_HTML = 2_000_000;
const MAX_CHARS = 150_000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// O DGSI e outros sites antigos servem ISO-8859-1/Windows-1252; ler como UTF-8 estragaria os acentos.
export async function readHtml(res) {
  const buf = await res.arrayBuffer();
  const head = new TextDecoder('latin1').decode(buf.slice(0, 4096));
  const charset = /charset=["']?([\w-]+)/i.exec(res.headers.get('content-type') || '')?.[1]
    || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] || 'utf-8';
  let label = charset.toLowerCase();
  if (/^(iso-8859-1|latin1)$/.test(label)) label = 'windows-1252';
  try { return new TextDecoder(label).decode(buf.slice(0, MAX_HTML)); } catch { return new TextDecoder('utf-8').decode(buf.slice(0, MAX_HTML)); }
}

const BLOCK = /<\/?(?:p|div|br|li|ul|ol|tr|table|h[1-6]|section|article|blockquote|dd|dt|center)\b[^>]*>/gi;

// Remove o cabeçalho e o rodapé de navegação de sites que não têm um contentor semântico.
const TRIMMERS = {
  'pgdlisboa.pt': (lines) => {
    const head = lines.findIndex((l) => /^Início legislação/i.test(l));
    const title = head >= 0 ? lines.slice(head + 1).filter((l) => !/^Legislação$/i.test(l)).slice(0, 2) : [];
    const start = lines.findIndex((l, i) => i > head && /^(LIVRO|T[IÍ]TULO|CAP[IÍ]TULO|SEC[CÇ][AÃ]O|Artigo\s+\d)/i.test(l));
    return start >= 0 ? [...title.map((l) => `# ${l}`), ...lines.slice(start)] : lines;
  },
};

// Escolhe o contentor com mais texto (main, article ou body) e converte-o em parágrafos.
export function extractText(html, host = '') {
  const clean = html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|noscript|nav|header|footer|aside|form|select|button|svg|iframe)\b[\s\S]*?<\/\1>/gi, '');
  const title = toText(/<title[^>]*>([\s\S]*?)<\/title>/i.exec(clean)?.[1] || '');
  const containers = [...(clean.match(/<(main|article)\b[\s\S]*?<\/\1>/gi) || []), /<body[\s\S]*<\/body>/i.exec(clean)?.[0] || clean];
  const toParagraphs = (scope) => decode(scope.replace(BLOCK, '\n').replace(/<[^>]+>/g, ''))
    .replace(/\u00ad/g, '').replace(/[ \t\u00a0]+/g, ' ')
    .split(/\n+/).map((l) => l.trim()).filter((l) => l && !/^[\W_]+$/.test(l));
  const best = containers.map(toParagraphs).sort((a, b) => b.join('').length - a.join('').length)[0] || [];
  // Remove repetições consecutivas (menus, botões) mantendo a ordem.
  const trim = Object.entries(TRIMMERS).find(([d]) => host === d || host.endsWith(`.${d}`))?.[1];
  const lines = (trim ? trim(best) : best).filter((l, i, arr) => l !== arr[i - 1]);
  let text = lines.join('\n\n');
  const truncated = text.length > MAX_CHARS;
  if (truncated) text = `${text.slice(0, MAX_CHARS).replace(/\s+\S*$/, '')}…`;
  return { title, text, truncated };
}

// Páginas do EUR-Lex em PDF têm uma versão HTML com o mesmo conteúdo.
function normalizeUrl(u) {
  if (/eur-lex\.europa\.eu$/.test(u.hostname)) u.pathname = u.pathname.replace('/TXT/PDF/', '/TXT/HTML/');
  return u;
}

export async function fetchLawText(url, isAllowed) {
  const u = normalizeUrl(new URL(url));
  if (!/^https?:$/.test(u.protocol) || !isAllowed(u.hostname)) throw new Error('Fonte não permitida');
  const res = await fetch(u.href, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-PT,pt;q=0.9' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`A fonte respondeu ${res.status}`);
  if (!isAllowed(new URL(res.url).hostname)) throw new Error('Redirecionamento não permitido');
  const type = res.headers.get('content-type') || '';
  if (!/html|text/i.test(type)) return { url: res.url, title: '', text: '', unsupported: type.split(';')[0] || 'ficheiro' };
  const { title, text, truncated } = extractText(await readHtml(res), new URL(res.url).hostname);
  return { url: res.url, title, text, truncated };
}

// Obtém o texto integral de documentos jurídicos públicos (legislação, acórdãos, deliberações),
// para serem lidos dentro do site. Só aceita os domínios das fontes jurídicas.
import { toText, decode } from './ciberduvidas.js';

const MAX_HTML = 2_000_000;
const MAX_CHARS = 150_000;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// O DGSI e outros sites antigos servem ISO-8859-1/Windows-1252; ler como UTF-8 estragaria os acentos.
export async function readHtml(res, max = MAX_HTML) {
  const buf = await res.arrayBuffer();
  const head = new TextDecoder('latin1').decode(buf.slice(0, 4096));
  const charset = /charset=["']?([\w-]+)/i.exec(res.headers.get('content-type') || '')?.[1]
    || /<meta[^>]+charset=["']?([\w-]+)/i.exec(head)?.[1] || 'utf-8';
  let label = charset.toLowerCase();
  if (/^(iso-8859-1|latin1)$/.test(label)) label = 'windows-1252';
  try { return new TextDecoder(label).decode(buf.slice(0, max)); } catch { return new TextDecoder('utf-8').decode(buf.slice(0, max)); }
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

// ── Arrumação do texto ────────────────────────────────────────────────────────
// Convenções que o cliente interpreta: «# » título do documento, «## » cabeçalho, «- » item de lista
// e «| Rótulo | valor » linha de metadados.
const END = /[.:;!?)»”"…\]]$/;
const DGSI_LABELS = [
  'Processo', 'Nº Convencional', 'N.º Convencional', 'Relator', 'Descritores', 'Data do Acordão', 'Data do Acórdão', 'Votação',
  'Texto Integral', 'Privacidade', 'Meio Processual', 'Decisão', 'Área Temática', 'Doutrina', 'Legislação Nacional',
  'Legislação Comunitária', 'Legislação Estrangeira', 'Jurisprudência Nacional', 'Jurisprudência Internacional',
  'Referências Internacionais', 'Nº do Documento', 'Recorrente', 'Recorrido', 'Tribunal Recorrido', 'Apenso', 'Acórdão',
];
const BODY_LABELS = ['Sumário', 'Decisão Texto Integral', 'Texto Integral Parcial', 'Relatório', 'Fundamentação', 'Acórdão'];
const labelOf = (line, list) => list.find((l) => new RegExp(`^${l}\\s*:`, 'i').test(line));

export function fixSpacing(s) {
  return s
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\s+([,;:.!?»)\]])(?=\s|$)/g, '$1')
    .replace(/([«(\[])\s+/g, '$1')
    .trim();
}

// Junta linhas partidas a meio de uma frase (texto «hard-wrapped» ou com <br>).
function reflow(lines) {
  const out = [];
  for (const line of lines) {
    const prev = out[out.length - 1];
    const broken = prev && prev.length >= 55 && !END.test(prev) && /^[a-zà-ÿ(]/.test(line)
      && !/^(##? |- |\| )/.test(prev) && !/^[a-z]\)\s/.test(line);
    if (broken) out[out.length - 1] = `${prev}${prev.endsWith('-') ? '' : ' '}${line}`;
    else out.push(line);
  }
  return out;
}

// Os acórdãos do DGSI vêm como pares «Rótulo:» / valores em parágrafos soltos; junta-os em metadados legíveis.
function tidyDgsi(lines) {
  const out = [];
  let i = 0;
  const head = [];
  while (i < lines.length && !labelOf(lines[i], DGSI_LABELS) && head.length < 3) head.push(lines[i++]);
  head.forEach((l) => out.push(`# ${l}`));
  while (i < lines.length) {
    const line = lines[i];
    const body = labelOf(line, BODY_LABELS);
    const meta = labelOf(line, DGSI_LABELS);
    if (body && !(meta && body === 'Acórdão')) {
      out.push(`## ${line.replace(/\s*:\s*$/, '').replace(/^([^:]+):\s*/, '$1')}`);
      i++;
      continue;
    }
    if (!meta) { out.push(line); i++; continue; }
    const items = [];
    const first = line.replace(new RegExp(`^${meta}\\s*:\\s*`, 'i'), '').trim();
    if (first) items.push(first);
    i++;
    while (i < lines.length && !labelOf(lines[i], DGSI_LABELS) && !labelOf(lines[i], BODY_LABELS)) items.push(lines[i++]);
    const label = meta.replace('Nº', 'N.º');
    if (/^(Texto Integral|Privacidade)$/i.test(meta)) continue;
    if (items.length <= 1) out.push(`| ${label} | ${items[0] || '—'}`);
    else if (items.length <= 12 && items.every((t) => t.length < 45)) out.push(`| ${label} | ${items.join(' · ')}`);
    else { out.push(`## ${label}`); items.forEach((t) => out.push(`- ${t.replace(/^-\s*/, '')}`)); }
  }
  return out;
}

const ARTICLE = /^Artigo\s+\d+\.?\s*[º°o]?(?:-[A-Za-z]+)?\.?$/i;
const SECTION = /^(PARTE|LIVRO|T[IÍ]TULO|CAP[IÍ]TULO|SEC[CÇ][AÃ]O|SUBSEC[CÇ][AÃ]O)\b/i;
const NOISE = /^(Consultar vers[õo]es anteriores|-?\s*\d+[ªa]\s*vers[ãa]o\b|Imprimir|Voltar ao topo)/i;

// Cabeçalhos legais, epígrafes ligadas ao artigo e ruído de navegação removido.
function tidyLegal(lines) {
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (NOISE.test(line) || /^#+ /.test(line)) { out.push(line); continue; }
    if (ARTICLE.test(line)) {
      const next = lines[i + 1] || '';
      const epigraph = /^\(.{2,100}\)$/.test(next) || (next.length < 90 && !END.test(next) && !/^(\d+|[a-z])\s*[-–).]/.test(next) && !ARTICLE.test(next) && !NOISE.test(next));
      if (epigraph) { out.push(`## ${line.replace(/\.$/, '')} — ${next.replace(/^\(|\)$/g, '')}`); i++; } else out.push(`## ${line}`);
    } else if (SECTION.test(line) && line.length < 90) out.push(`## ${line}`);
    else if (line.length < 70 && /^[IVXL]+\s*[-–.)]\s*\S/.test(line) && line === line.toUpperCase()) out.push(`## ${line}`);
    else out.push(line);
  }
  return out;
}

export function tidy(lines, host = '') {
  const cleaned = lines.map(fixSpacing).filter(Boolean);
  const body = /(^|\.)dgsi\.pt$/.test(host) ? tidyDgsi(cleaned) : cleaned;
  return tidyLegal(reflow(body)).filter((l, i, arr) => l !== arr[i - 1]);
}

// Extrai um artigo (com o seu cabeçalho) de um diploma já arrumado.
export function sliceArticle(lines, n) {
  const wanted = /^(\d+)(?:\.?\s*[º°o])?(?:\s*-\s*([A-Za-z]+))?$/i.exec(String(n).trim());
  if (!wanted) throw new Error('Número de artigo inválido');
  const start = lines.findIndex((l) => {
    const m = /^## Artigo\s+(\d+)\.?\s*[º°o]?(?:\s*-\s*([A-Za-z]+)\b)?/i.exec(l);
    return m && m[1] === wanted[1] && (m[2] || '').toUpperCase() === (wanted[2] || '').toUpperCase();
  });
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && /^## (Artigo|PARTE|LIVRO|T[IÍ]TULO|CAP[IÍ]TULO|SEC[CÇ][AÃ]O|SUBSEC[CÇ][AÃ]O|ANEXO)\b/i.test(l));
  return lines.slice(start, end < 0 ? undefined : end);
}

// Escolhe o contentor com mais texto (main, article ou body) e converte-o em parágrafos.
export function extractText(html, host = '', artigo = '', limit = MAX_CHARS) {
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
  const all = tidy(trim ? trim(best) : best, host);
  const lines = artigo ? sliceArticle(all, artigo) : all;
  let text = lines.join('\n\n');
  const truncated = text.length > limit;
  if (truncated) text = `${text.slice(0, limit).replace(/\s+\S*$/, '')}…`;
  return { title, text, truncated };
}

// Páginas do EUR-Lex em PDF têm uma versão HTML com o mesmo conteúdo.
function normalizeUrl(u) {
  if (/eur-lex\.europa\.eu$/.test(u.hostname)) u.pathname = u.pathname.replace('/TXT/PDF/', '/TXT/HTML/');
  return u;
}

export async function fetchLawText(url, isAllowed, artigo = '') {
  const u = normalizeUrl(new URL(url));
  if (!/^https?:$/.test(u.protocol) || !isAllowed(u.hostname)) throw new Error('Fonte não permitida');
  const res = await fetch(u.href, { headers: { 'User-Agent': UA, 'Accept-Language': 'pt-PT,pt;q=0.9' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`A fonte respondeu ${res.status}`);
  if (!isAllowed(new URL(res.url).hostname)) throw new Error('Redirecionamento não permitido');
  const type = res.headers.get('content-type') || '';
  if (!/html|text/i.test(type)) return { url: res.url, title: '', text: '', unsupported: type.split(';')[0] || 'ficheiro' };
  const { title, text, truncated } = extractText(await readHtml(res), new URL(res.url).hostname, artigo);
  return { url: res.url, title, text, truncated };
}

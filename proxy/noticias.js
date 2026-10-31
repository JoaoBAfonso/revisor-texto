// Pesquisa em sites de notícias através do RSS do Bing Notícias, que dá o endereço direto e um resumo.
// Devolve títulos e resumos, nunca o artigo completo.
import { toText, decode } from './ciberduvidas.js';
import { readHtml, fixSpacing } from './texto.js';

const UA = 'Mozilla/5.0 (compatible; RevisorDeTexto/1.0)';
const PER_SITE = 6;

export const NEWS_SITES = {
  publico: { name: 'Público', domains: ['publico.pt'] },
  expresso: { name: 'Expresso', domains: ['expresso.pt'] },
  rtp: { name: 'RTP', domains: ['rtp.pt'] },
  sic: { name: 'SIC Notícias', domains: ['sic.pt', 'sicnoticias.pt'] },
  tvi: { name: 'TVI', domains: ['tvi.iol.pt'] },
  cm: { name: 'Correio da Manhã', domains: ['cmjornal.pt'] },
  mensagem: { name: 'A Mensagem', domains: ['amensagem.pt'] },
  observador: { name: 'Observador', domains: ['observador.pt'] },
  dn: { name: 'Diário de Notícias', domains: ['dn.pt'] },
  jn: { name: 'Jornal de Notícias', domains: ['jn.pt'] },
  eco: { name: 'ECO', domains: ['eco.sapo.pt'] },
  poligrafo: { name: 'Polígrafo (verificação)', domains: ['poligrafo.sapo.pt'] },
  lusa: { name: 'Lusa', domains: ['lusa.pt'] },
};

const siteOf = (host) => Object.keys(NEWS_SITES)
  .find((k) => NEWS_SITES[k].domains.some((d) => host === d || host.endsWith(`.${d}`)));

function parseRss(xml, key) {
  const items = [];
  for (const part of xml.split('<item>').slice(1)) {
    const link = /<link>([\s\S]*?)<\/link>/.exec(part)?.[1];
    const target = link && new URLSearchParams(decode(link).split('?')[1] || '').get('url');
    let url;
    try { url = new URL(target); } catch { continue; }
    if (siteOf(url.hostname) !== key) continue;
    const date = /<pubDate>([\s\S]*?)<\/pubDate>/.exec(part)?.[1];
    items.push({
      title: toText(/<title>([\s\S]*?)<\/title>/.exec(part)?.[1] || ''),
      description: toText(/<description>([\s\S]*?)<\/description>/.exec(part)?.[1] || '').replace(/\u00ad/g, ''),
      url: url.href,
      site: key,
      source: NEWS_SITES[key].name,
      date: date ? new Date(date).toISOString() : '',
    });
    if (items.length >= PER_SITE) break;
  }
  return items;
}

async function searchSite(term, key) {
  const sites = NEWS_SITES[key].domains.map((d) => `site:${d}`).join(' OR ');
  const q = encodeURIComponent(`"${term}" (${sites})`);
  const res = await fetch(`https://www.bing.com/news/search?q=${q}&format=rss&setmkt=pt-PT&setlang=pt-PT&qft=sortbydate%3d%221%22`, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Bing respondeu ${res.status}`);
  return parseRss(await res.text(), key);
}

const MAX_CHARS = 80000;
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const metaContent = (html, name) => {
  const a = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*?content=["']([^"']*)["']`, 'i').exec(html);
  const b = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*?(?:property|name)=["']${name}["']`, 'i').exec(html);
  return toText((a || b)?.[1] || '');
};

function namesOf(author) {
  if (!author) return [];
  if (typeof author === 'string') return [author];
  if (Array.isArray(author)) return author.flatMap(namesOf);
  return namesOf(author.name);
}

function jsonLdArticle(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1]);
      const nodes = [data, ...(Array.isArray(data) ? data : []), ...(data['@graph'] || [])];
      const art = nodes.find((n) => n && /Article|Posting/i.test([n['@type']].flat().join(' ')));
      if (art) return art;
    } catch { /* JSON-LD inválido */ }
  }
  return null;
}

// Devolve o texto completo que o site serve publicamente (autor, descrição e todos os parágrafos).
// Em páginas com paywall, o site só entrega o que mostra a qualquer visitante.
export async function fetchArticle(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol) || !siteOf(u.hostname)) throw new Error('Site não permitido');
  const res = await fetch(u.href, { headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'pt-PT,pt;q=0.9' }, redirect: 'follow' });
  if (!res.ok) throw new Error(`O site respondeu ${res.status}`);
  if (!siteOf(new URL(res.url).hostname)) throw new Error('Redirecionamento não permitido');
  const html = await readHtml(res);
  const ld = jsonLdArticle(html);

  const authors = [...new Set([
    ...namesOf(ld?.author),
    ...[metaContent(html, 'author'), metaContent(html, 'article:author'), metaContent(html, 'sailthru.author')]
      .filter((a) => a && !/^https?:/.test(a)),
  ].map((a) => toText(a)).filter((a) => a && a.length < 80))];

  const description = toText(ld?.description || '') || metaContent(html, 'og:description') || metaContent(html, 'description');

  const body = html.replace(/<(script|style|noscript|nav|header|footer|aside|form)[\s\S]*?<\/\1>/gi, '');
  // Várias páginas têm muitos <article> (cartões de outras notícias): escolhe o bloco com mais texto corrido.
  const blocks = [...(body.match(/<article[\s\S]*?<\/article>/gi) || []), body];
  const extract = (scope) => {
    const out = [];
    let sum = 0;
    const pre = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let p;
    while ((p = pre.exec(scope)) && sum < MAX_CHARS) {
      const t = decode(toText(p[1])).replace(/\u00ad/g, '').trim();
      if (t.length < 25 || (t.length < 70 && !/[.!?…»”"):]$/.test(t)) || out.includes(t)) continue;
      out.push(t);
      sum += t.length;
    }
    return { out, sum };
  };
  const best = blocks.map(extract).sort((a, b) => b.sum - a.sum)[0];
  const paragraphs = best.out;

  let text = paragraphs.join('\n\n');
  const fullBody = ld?.articleBody ? toText(ld.articleBody) : '';
  if (fullBody.length > text.length) text = fullBody.split(/\n+/).join('\n\n');
  text = text.split('\n\n').map(fixSpacing).filter(Boolean).join('\n\n');
  if (text.length > MAX_CHARS) text = `${text.slice(0, MAX_CHARS).replace(/\s+\S*$/, '')}…`;
  return { url: res.url, authors, description, text };
}

export async function searchNews(term, keys) {
  const chosen = keys.filter((k) => NEWS_SITES[k]);
  const settled = await Promise.allSettled(chosen.map((k) => searchSite(term, k)));
  const results = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  const failed = chosen.filter((_, i) => settled[i].status === 'rejected');
  results.sort((a, b) => b.date.localeCompare(a.date));
  return { term, results, failed };
}


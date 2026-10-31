// Pesquisa em sites de notícias através do RSS do Bing Notícias, que dá o endereço direto e um resumo.
// Devolve títulos e resumos, nunca o artigo completo.
import { toText, decode } from './ciberduvidas.js';

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

export async function searchNews(term, keys) {
  const chosen = keys.filter((k) => NEWS_SITES[k]);
  const settled = await Promise.allSettled(chosen.map((k) => searchSite(term, k)));
  const results = settled.flatMap((s) => (s.status === 'fulfilled' ? s.value : []));
  const failed = chosen.filter((_, i) => settled[i].status === 'rejected');
  results.sort((a, b) => b.date.localeCompare(a.date));
  return { term, results, failed };
}

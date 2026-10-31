// Cloudflare Worker:
//   GET  /?word=casa   -> JSON com a definição obtida no Priberam.
//   POST /translate    -> tradução via DeepL (a chave DEEPL_API_KEY fica só aqui, como segredo).
//   GET  /duvidas?q=   -> dúvidas do consultório do Ciberdúvidas.
import { lookupPriberam } from './priberam.js';
import { searchCiberduvidas, fetchAnswer } from './ciberduvidas.js';
import { searchNews, NEWS_SITES } from './noticias.js';

// Origens autorizadas a usar o proxy. Substituir pelo endereço do GitHub Pages.
const ALLOWED_ORIGINS = ['https://joaobafonso.github.io', 'http://localhost:8765', 'http://localhost:8000'];
const CACHE_SECONDS = 86400;
const MAX_TRANSLATE_CHARS = 5000;
const DEEPL_SOURCE = { 'pt-PT': 'PT', en: 'EN' };
const DEEPL_TARGET = { 'pt-PT': 'PT-PT', 'en-GB': 'EN-GB', 'en-US': 'EN-US' };

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

const json = (body, status, headers) => new Response(JSON.stringify(body), { status, headers });

async function translate(request, env, headers) {
  if (!env?.DEEPL_API_KEY) return json({ error: 'Tradução não configurada (falta a chave DeepL no servidor).' }, 503, headers);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Pedido inválido' }, 400, headers); }
  const { text, source, target } = body || {};
  if (typeof text !== 'string' || !text.trim() || text.length > MAX_TRANSLATE_CHARS) {
    return json({ error: `Texto inválido (máximo ${MAX_TRANSLATE_CHARS} caracteres).` }, 400, headers);
  }
  if (!DEEPL_SOURCE[source] || !DEEPL_TARGET[target]) return json({ error: 'Idioma inválido' }, 400, headers);

  const key = env.DEEPL_API_KEY;
  const host = key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com';
  let res;
  try {
    res = await fetch(`https://${host}/v2/translate`, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: [text], source_lang: DEEPL_SOURCE[source], target_lang: DEEPL_TARGET[target] }),
    });
  } catch {
    return json({ error: 'Não foi possível contactar o DeepL.' }, 502, headers);
  }
  if (res.status === 456) return json({ error: 'Quota de tradução do DeepL esgotada.' }, 429, headers);
  if (res.status === 403) return json({ error: 'Chave DeepL inválida.' }, 502, headers);
  if (!res.ok) return json({ error: `O DeepL respondeu com o erro ${res.status}.` }, 502, headers);
  const data = await res.json();
  return json({ text: data.translations?.[0]?.text ?? '' }, 200, headers);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const headers = { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' };
    if (request.method === 'OPTIONS') return new Response(null, { headers });
    if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'Origem não autorizada' }, 403, headers);

    const url = new URL(request.url);
    if (url.pathname === '/translate') {
      if (request.method !== 'POST') return json({ error: 'Método não permitido' }, 405, headers);
      return translate(request, env, headers);
    }
    if (url.pathname === '/duvidas') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q || q.length > 80) return json({ error: 'Pesquisa inválida' }, 400, headers);
      try {
        const result = await searchCiberduvidas(q);
        return json(result, 200, { ...headers, 'Cache-Control': 'public, max-age=3600' });
      } catch {
        return json({ error: 'Não foi possível consultar o Ciberdúvidas' }, 502, headers);
      }
    }

    if (url.pathname === '/resposta') {
      const target = url.searchParams.get('url') || '';
      if (target.length > 300) return json({ error: 'URL inválido' }, 400, headers);
      try {
        const result = await fetchAnswer(target);
        return json(result, 200, { ...headers, 'Cache-Control': 'public, max-age=86400' });
      } catch {
        return json({ error: 'Não foi possível obter a resposta' }, 502, headers);
      }
    }

    if (url.pathname === '/noticias') {
      const q = (url.searchParams.get('q') || '').trim();
      if (!q || q.length > 80) return json({ error: 'Pesquisa inválida' }, 400, headers);
      const sites = (url.searchParams.get('sites') || '').split(',').filter((k) => NEWS_SITES[k]);
      try {
        const result = await searchNews(q, sites.length ? sites : Object.keys(NEWS_SITES));
        const cache = result.results.length && !result.failed.length ? 'public, max-age=900' : 'no-store';
        return json(result, 200, { ...headers, 'Cache-Control': cache });
      } catch {
        return json({ error: 'Não foi possível pesquisar notícias' }, 502, headers);
      }
    }

    const word = (url.searchParams.get('word') || '').trim();
    if (!word || word.length > 60 || !/^[\p{L}\p{M}'’-]+$/u.test(word)) {
      return json({ error: 'Palavra inválida' }, 400, headers);
    }

    try {
      const result = await lookupPriberam(word.toLowerCase());
      return json(result, 200, { ...headers, 'Cache-Control': `public, max-age=${CACHE_SECONDS}` });
    } catch (e) {
      return json({ error: 'Não foi possível consultar o Priberam' }, 502, headers);
    }
  },
};

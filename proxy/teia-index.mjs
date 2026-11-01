// Cliente do repositório público de dados fumaca-dados (formato 1). Corre no navegador e nos testes.
// A normalização, os termos e o hash têm de coincidir exatamente com scripts/lib/text.mjs desse repositório.

export const DATA_BASE = 'https://joaobafonso.github.io/fumaca-dados/';
export const DATA_REPOSITORY = 'https://github.com/JoaoBAfonso/fumaca-dados';
export const SUPPLIER_BUCKETS = 4096;
export const BUYER_BUCKETS = 1024;
export const MAX_DATA_BYTES = 8 * 1024 * 1024;
const FALLBACK_ENTITY_COUNT = 200000;
const CACHE_LIMIT = 80;

const ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };

export function decodeEntities(text) {
  return String(text ?? '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) => {
    if (code[0] === '#') {
      const value = code[1] === 'x' || code[1] === 'X' ? Number.parseInt(code.slice(2), 16) : Number(code.slice(1));
      return Number.isFinite(value) && value > 0 && value < 0x110000 ? String.fromCodePoint(value) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

export function cleanText(text, max = Infinity) {
  const value = decodeEntities(text).replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max - 1).trimEnd()}…` : value;
}

export function normalizeName(text) {
  return cleanText(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export const STOPWORDS = new Set([
  'a', 'as', 'o', 'os', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'no', 'na', 'nos', 'nas', 'para', 'por', 'com',
  'the', 'and', 'of', 'sa', 'lda', 'ld', 'limitada', 'unipessoal', 'sociedade', 'anonima', 'rl', 'crl', 'sgps',
  'ltd', 'sl', 'slu', 'srl', 'gmbh', 'inc', 'ag', 'bv', 'nv', 'spa', 'sas', 'ip', 'epe', 'em', 'cipl', 'ace',
]);

export function spellingFold(token) {
  return token.replace(/c(?=[ct])/g, '').replace(/p(?=t)/g, '');
}

export function nameTokens(text) {
  return [...new Set(normalizeName(text).split(' ').map(spellingFold).filter((token) => token.length >= 2 && !STOPWORDS.has(token)))];
}

export function tokenShard(token) {
  return token.slice(0, 3);
}

export function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function bucketOf(id, buckets) {
  return (fnv1a(id) % buckets).toString(16).padStart(3, '0');
}

// Palavras frequentes em denominações: não identificam uma entidade e geram listas enormes.
export const GENERIC_TOKENS = new Set([
  'grupo', 'portugal', 'portuguesa', 'portugues', 'nacional', 'internacional', 'instituto', 'empresa', 'empresas', 'servicos',
  'comercio', 'industria', 'industrias', 'investimentos', 'gestao', 'consultoria', 'consultores', 'imobiliaria', 'advogados',
  'associados', 'associacao', 'holding', 'global', 'solucoes', 'sistemas', 'tecnologia', 'tecnologias', 'engenharia',
  'construcoes', 'construcao', 'participacoes', 'companhia', 'centro', 'geral', 'municipio', 'camara', 'municipal',
  'freguesia', 'junta', 'uniao', 'ministerio', 'direcao', 'escola', 'escolas', 'agrupamento', 'hospital', 'saude',
  'cooperativa', 'fundacao', 'clube', 'desportivo', 'universidade', 'irmaos', 'filhos', 'comercial', 'industrial',
  'transportes', 'obras', 'publicas', 'equipamentos', 'material', 'materiais', 'produtos', 'distribuicao', 'norte', 'sul',
]);

export const PROCEDURES = {
  AD: 'Ajuste direto', ADS: 'Ajuste direto simplificado', CP: 'Consulta prévia', CPS: 'Consulta prévia simplificada',
  CPUB: 'Concurso público', CPUBU: 'Concurso público urgente', CLPQ: 'Concurso limitado por prévia qualificação',
  AQ: 'Ao abrigo de acordo-quadro', NEG: 'Procedimento de negociação', DC: 'Diálogo concorrencial', PI: 'Parceria para a inovação',
  CC: 'Concurso de conceção', EXC: 'Contratação excluída', SE: 'Setores especiais', SS: 'Serviços sociais e outros serviços específicos', OUT: 'Outro',
};
export const DIRECT_AWARD = new Set(['AD', 'ADS']);
export const PRIOR_CONSULTATION = new Set(['CP', 'CPS']);

export function contractUrl(id) {
  return `https://www.base.gov.pt/Base4/pt/detalhe/?type=contratos&id=${encodeURIComponent(id)}`;
}

export function parliamentBiographyUrl(id) {
  return `https://www.parlamento.pt/DeputadoGP/Paginas/Biografia.aspx?BID=${encodeURIComponent(id)}`;
}

export function unpackContract(row, fundamentos = []) {
  if (!Array.isArray(row)) throw new Error('Contrato em formato desconhecido.');
  const [id, data, adjudicantes = [], adjudicatarios = [], objeto = '', valor = 0, procedimento = 'OUT', tipo = 'X', cpv = '', local = '',
    fundamento = -1, sinais = 0, concorrentes = [], valorEfetivo = null] = row;
  return {
    id: String(id), data: String(data || ''), adjudicantes, adjudicatarios, objeto: String(objeto || ''), valor: Number(valor) || 0,
    procedimento, procedimentoNome: PROCEDURES[procedimento] || PROCEDURES.OUT, tipo, cpv, local,
    fundamento: Number.isInteger(fundamento) && fundamento >= 0 ? String(fundamentos[fundamento] || '') : '',
    criteriosMateriais: Boolean(sinais & 1), dataPublicacao: Boolean(sinais & 2), concorrentes, valorEfetivo,
    url: contractUrl(id),
  };
}

// Pontua candidatos pela fração do peso dos termos pesquisados que contêm. Termos com listas truncadas
// (o índice guarda as 300 entidades com mais contratos) contam metade quando o candidato não aparece.
export function scoreCandidates(queryTokens, lists, entityCount = FALLBACK_ENTITY_COUNT) {
  const weights = new Map();
  const truncated = new Set();
  const candidates = new Map();
  for (const token of queryTokens) {
    const list = lists.get(token) || [];
    const tail = list.at(-1);
    const isTruncated = tail?.[0] === '+';
    const entries = isTruncated ? list.slice(0, -1) : list;
    const df = entries.length + (isTruncated ? Number(tail[3]) || 0 : 0);
    if (isTruncated) truncated.add(token);
    weights.set(token, Math.log(1 + entityCount / Math.max(1, df)));
    for (const [id, name, roles, count] of entries) {
      const entry = candidates.get(id) || { id, nome: name, papeis: roles, contratos: count, termos: [] };
      entry.termos.push(token);
      candidates.set(id, entry);
    }
  }
  const total = [...weights.values()].reduce((sum, value) => sum + value, 0) || 1;
  return [...candidates.values()].map((entry) => {
    let score = 0;
    for (const token of queryTokens) {
      if (entry.termos.includes(token)) score += weights.get(token);
      else if (truncated.has(token) && nameTokens(entry.nome).includes(token)) score += weights.get(token);
      else if (truncated.has(token)) score += weights.get(token) / 2;
    }
    return { ...entry, nif: /^\d{9}$/.test(entry.id) ? entry.id : '', pontuacao: Math.round((score / total) * 100) / 100 };
  }).sort((a, b) => b.pontuacao - a.pontuacao || b.contratos - a.contratos);
}

// Ordena os termos de uma denominação pelos mais distintivos: sem palavras genéricas, os mais longos primeiro.
export function distinctiveTokens(name, limit = 4) {
  const tokens = nameTokens(name);
  const specific = tokens.filter((token) => !GENERIC_TOKENS.has(token) && (token.length >= 3 || /^\d{9}$/.test(token)));
  const pool = specific.length ? specific : tokens;
  return pool.map((token, index) => ({ token, index }))
    .sort((a, b) => (/^\d{9}$/.test(b.token) - /^\d{9}$/.test(a.token)) || b.token.length - a.token.length || a.index - b.index)
    .slice(0, limit).map((entry) => entry.token);
}

// «SP&M» declarado e «Sousa Pinheiro & Montenegro» noutro campo da mesma declaração: procura, nos textos dados,
// uma sequência de palavras com maiúscula cujas iniciais formem a sigla.
export function expandAcronym(name, texts = []) {
  const first = cleanText(name).split(/[\s,]+/)[0] || '';
  const letters = first.replace(/[^A-Za-zÀ-ÿ]/g, '');
  if (letters.length < 2 || letters.length > 6 || letters !== letters.toUpperCase()) return [];
  const target = letters.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
  const found = new Set();
  for (const text of texts) {
    const words = cleanText(text).split(/\s+/);
    for (let start = 0; start < words.length; start += 1) {
      let initials = '';
      const picked = [];
      for (let index = start; index < words.length && initials.length < target.length; index += 1) {
        const word = words[index] === '&' ? '&' : words[index].replace(/^[^\p{L}&]+|[^\p{L}]+$/gu, '');
        if (!word) break;
        if (word === '&' || /^(e|de|da|do|dos|das)$/.test(word)) { if (picked.length) picked.push(word); continue; }
        if (!/^\p{Lu}/u.test(word)) break;
        initials += word[0].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
        picked.push(word);
      }
      if (initials === target && picked.length >= 2 && picked.join(' ').toUpperCase() !== first.toUpperCase()) found.add(picked.join(' '));
    }
  }
  return [...found];
}

async function readLimited(response, maxBytes) {
  const declared = Number(response.headers?.get?.('content-length'));
  if (declared && declared > maxBytes) throw new Error('O ficheiro de dados excede o limite desta ferramenta.');
  if (!response.body?.getReader) return response.text();
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error('O ficheiro de dados excede o limite desta ferramenta.');
      chunks.push(value);
    }
  } finally { reader.releaseLock?.(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export function createDataClient({ baseUrl = DATA_BASE, fetchImpl = globalThis.fetch?.bind(globalThis), maxBytes = MAX_DATA_BYTES } = {}) {
  const base = new URL(baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('A base de dados tem de usar HTTPS.');
  const cache = new Map();

  function load(path, { optional = false } = {}) {
    if (cache.has(path)) {
      const hit = cache.get(path);
      cache.delete(path);
      cache.set(path, hit);
      return hit;
    }
    const url = new URL(path, base).href;
    const promise = (async () => {
      const response = await fetchImpl(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
      if (response.status === 404 && optional) return null;
      if (!response.ok) throw new Error(`Os dados públicos responderam com HTTP ${response.status}.`);
      const text = await readLimited(response, maxBytes);
      try { return JSON.parse(text); } catch { throw new Error('Os dados públicos não devolveram JSON válido.'); }
    })();
    promise.catch(() => cache.delete(path));
    cache.set(path, promise);
    while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return promise;
  }

  const client = {
    baseUrl: base.href,
    url: (path) => new URL(path, base).href,
    manifest: () => load('manifest.json'),
    fundamentos: () => load('contratos/fundamentos.json'),
    async entityCount() {
      try { return (await client.manifest())?.contratos?.entidades || FALLBACK_ENTITY_COUNT; } catch { return FALLBACK_ENTITY_COUNT; }
    },
    async names(kind, token) {
      if (!['contratos', 'parlamento'].includes(kind)) throw new Error('Índice de nomes desconhecido.');
      const shard = tokenShard(token);
      if (!/^[a-z0-9]{2,3}$/.test(shard)) return [];
      const data = await load(`${kind}/nomes/${shard}.json`, { optional: true });
      return Array.isArray(data?.[token]) ? data[token] : [];
    },
    async searchEntities(name, { limit = 8 } = {}) {
      const digits = String(name).replace(/\D/g, '');
      const tokens = /^\d{9}$/.test(digits) && String(name).replace(/[\s.PTpt-]/g, '') === digits ? [digits] : distinctiveTokens(name);
      if (!tokens.length) return { termos: [], candidatos: [] };
      const lists = new Map(await Promise.all(tokens.map(async (token) => [token, await client.names('contratos', token)])));
      const candidatos = scoreCandidates(tokens, lists, await client.entityCount()).filter((entry) => entry.pontuacao >= 0.5).slice(0, limit);
      return { termos: tokens, candidatos };
    },
    async supplier(id) {
      const file = await load(`contratos/f/${bucketOf(id, SUPPLIER_BUCKETS)}.json`, { optional: true });
      const perfil = file?.entidades?.[id];
      return perfil ? { id, perfil, nomes: file.nomes || {}, url: client.url(`contratos/f/${bucketOf(id, SUPPLIER_BUCKETS)}.json`) } : null;
    },
    async buyer(id) {
      const file = await load(`contratos/a/${bucketOf(id, BUYER_BUCKETS)}.json`, { optional: true });
      const perfil = file?.entidades?.[id];
      return perfil ? { id, perfil, nomes: file.nomes || {}, url: client.url(`contratos/a/${bucketOf(id, BUYER_BUCKETS)}.json`) } : null;
    },
    people: () => load('parlamento/pessoas.json'),
    async person(id) {
      if (!/^\d{1,7}$/.test(String(id))) throw new Error('Identificador parlamentar inválido.');
      const data = await load(`parlamento/p/${id}.json`, { optional: true });
      return data ? { ...data, ficheiro: client.url(`parlamento/p/${id}.json`) } : null;
    },
    async searchPeople(name, { limit = 6 } = {}) {
      const query = nameTokens(name).filter((token) => token.length >= 3);
      if (!query.length) return [];
      const people = await client.people();
      return people.map((person) => {
        const civil = new Set(nameTokens(person.nome));
        const short = new Set(nameTokens(person.np || ''));
        const hits = query.filter((token) => civil.has(token) || short.has(token)).length;
        const exact = normalizeName(person.np || '') === normalizeName(name) || normalizeName(person.nome) === normalizeName(name);
        return { ...person, pontuacao: exact ? 1 : hits / query.length };
      }).filter((person) => person.pontuacao >= 0.99 || (query.length >= 3 && person.pontuacao >= 0.66))
        .sort((a, b) => b.pontuacao - a.pontuacao || b.legs.length - a.legs.length).slice(0, limit);
    },
    // Quem declarou ao Parlamento uma ligação a uma entidade com este nome (índice inverso das declarações).
    async declaredBy(name, { limit = 12 } = {}) {
      const tokens = distinctiveTokens(name, 3).filter((token) => token.length >= 3);
      if (!tokens.length) return [];
      const lists = await Promise.all(tokens.map((token) => client.names('parlamento', token)));
      const byKey = new Map();
      lists.forEach((list, index) => {
        for (const [personId, label, tipo, leg, data] of list) {
          const key = `${personId}|${label}|${leg}`;
          const entry = byKey.get(key) || { pessoa: personId, entidade: label, tipo, leg, data, termos: new Set() };
          entry.termos.add(tokens[index]);
          byKey.set(key, entry);
        }
      });
      return [...byKey.values()].filter((entry) => entry.termos.size === tokens.length)
        .map(({ termos, ...entry }) => entry).sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, limit);
    },
  };
  return client;
}

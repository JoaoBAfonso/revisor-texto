import { validateHypotheses } from './investigation-hypotheses.mjs';
import { validateTrail } from './investigation-discovery.mjs';

export const PAGE_SIZE = 50;
export const MAX_REMOTE_ROWS = 200;
export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;
export const MAX_ROWS = 5000;
export const MAX_DOSSIER_BYTES = 24 * 1024 * 1024;
export const REVIEW_STATES = ['unverified', 'source-checked', 'corroborated', 'contradicted', 'ambiguous'];
const TED_FIELDS = ['publication-number', 'title-proc', 'buyer-name', 'buyer-identifier', 'buyer-country', 'publication-date', 'notice-type'];

export function tedRequest(query, offset = 0) {
  collectionUrl('ted', query, offset);
  // A phrase is literal input, never expert-search syntax supplied by the user.
  if (/["\\\u0000-\u001f]/.test(query)) throw new Error('Na pesquisa TED não uses aspas, barras invertidas ou caracteres de controlo.');
  return { query: `buyer-country=PRT AND FT~"${query.trim()}"`, fields: TED_FIELDS, limit: PAGE_SIZE,
    page: offset / PAGE_SIZE + 1, scope: 'ALL', paginationMode: 'PAGE_NUMBER' };
}

export function publicUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function collectionUrl(source, query, offset = 0) {
  if (typeof query !== 'string' || query.trim().length < 2 || query.length > 120) throw new Error('Pesquisa entre 2 e 120 caracteres.');
  if (!Number.isInteger(offset) || offset < 0 || offset >= MAX_REMOTE_ROWS || offset % PAGE_SIZE) throw new Error('Lote de recolha inválido.');
  if (source === 'catalog') {
    if (offset) throw new Error('O catálogo disponibiliza apenas a primeira página nesta versão.');
    const url = new URL('https://dados.gov.pt/api/1/datasets/');
    url.searchParams.set('q', query.trim());
    url.searchParams.set('page_size', '10');
    return url;
  }
  if (source === 'ted') return new URL('https://api.ted.europa.eu/v3/notices/search');
  if (source !== 'sns') throw new Error('Fonte de recolha não suportada.');
  const url = new URL('https://transparencia.sns.gov.pt/api/explore/v2.1/catalog/datasets/portal-base/records');
  const fields = ['objeto_do_contrato', 'entidades_adjudicantes_normalizado', 'entidades_adjudicatarias_normalizado', 'nifs_dos_adjudicantes', 'nifs_das_adjudicatarias'];
  url.searchParams.set('where', fields.map((field) => `search(${field}, ${JSON.stringify(query.trim())})`).join(' OR '));
  url.searchParams.set('limit', String(PAGE_SIZE));
  url.searchParams.set('offset', String(offset));
  url.searchParams.set('order_by', 'data_de_publicacao desc');
  return url;
}

async function limitedText(response) {
  if (!response.body) throw new Error('A fonte devolveu uma resposta sem conteúdo.');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMPORT_BYTES) throw new Error('A resposta excede o limite de 2 MiB.');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

export async function fetchPublicJson(url, requestBody = null) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15000), redirect: 'error',
    headers: { Accept: 'application/json', ...(requestBody ? { 'Content-Type': 'application/json' } : {}) },
    ...(requestBody ? { method: 'POST', body: JSON.stringify(requestBody) } : {}) });
  if (response.status === 429) throw new Error('A fonte limitou os pedidos (429). Aguarda antes de repetir; não há repetição automática.');
  if (!response.ok) throw new Error(`A fonte respondeu com HTTP ${response.status}; nenhum registo foi recolhido.`);
  const rawText = await limitedText(response);
  let data;
  try { data = JSON.parse(rawText); } catch { throw new Error('A fonte não devolveu JSON válido.'); }
  const collectedAt = new Date().toISOString();
  return { data, rawText, collectedAt };
}

export async function collectPublic(source, query, offset = 0) {
  const url = collectionUrl(source, query, offset);
  const requestBody = source === 'ted' ? tedRequest(query, offset) : null;
  const { data, rawText, collectedAt } = await fetchPublicJson(url, requestBody);
  if (source === 'catalog') {
    if (!Array.isArray(data.data) || data.data.length > 10) throw new Error('Formato inesperado do catálogo.');
    return { source, collectedAt, url: url.href, items: data.data.map((item) => ({
      title: String(item.title || 'Sem título'), url: publicUrl(item.page),
      publisher: String(item.organization?.name || 'Editor não indicado'), license: String(item.license_title || item.license || 'Licença não indicada'),
      updatedAt: String(item.last_update || item.last_modified || ''),
      resources: (Array.isArray(item.resources) ? item.resources : []).slice(0, 20).map((resource) => ({
        format: String(resource.format || ''), url: publicUrl(resource.url),
      })).filter((resource) => resource.url),
    })) };
  }
  if (source === 'ted') {
    if (data.timedOut !== false || !Array.isArray(data.notices) || data.notices.length > PAGE_SIZE ||
        !Number.isInteger(data.totalNoticeCount) || data.totalNoticeCount < 0) throw new Error('Resposta TED incompleta ou formato inesperado; o lote não foi importado.');
    return { source, collectedAt, url: url.href, rawText, requestBody, format: 'ted-json', total: data.totalNoticeCount,
      offset, count: data.notices.length,
      hasMore: data.notices.length === PAGE_SIZE && offset + data.notices.length < Math.min(data.totalNoticeCount, MAX_REMOTE_ROWS) };
  }
  if (!Array.isArray(data.results) || data.results.length > PAGE_SIZE || !Number.isInteger(data.total_count) || data.total_count < 0) throw new Error('Formato inesperado da API de contratos.');
  return { source, collectedAt, url: url.href, rawText, total: data.total_count, offset, count: data.results.length,
    hasMore: offset + data.results.length < Math.min(data.total_count, MAX_REMOTE_ROWS) && data.results.length === PAGE_SIZE };
}

const norm = (value) => value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const COLUMNS = {
  title: ['objeto_do_contrato', 'objeto', 'object', 'title', 'titulo'],
  buyer: ['entidades_adjudicantes_normalizado', 'adjudicante', 'buyer'],
  supplier: ['entidades_adjudicatarias_normalizado', 'adjudicataria', 'adjudicatario', 'supplier'],
  buyerId: ['nifs_dos_adjudicantes', 'nif_adjudicante', 'buyer_id'],
  supplierId: ['nifs_das_adjudicatarias', 'nif_adjudicatario', 'nif_adjudicataria', 'supplier_id'],
  amount: ['preco_contratual', 'preco', 'valor', 'amount'],
  date: ['data_de_celebracao_do_contrato', 'data_contrato', 'date', 'data'],
  published: ['data_de_publicacao', 'published'],
  procedure: ['tipo_de_procedimento', 'procedimento', 'procedure'],
};

function csvRows(text) {
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = [';', ',', '\t'].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows = [];
  let row = [], value = '', quoted = false, closed = false;
  const cell = () => { row.push(value); value = ''; closed = false; };
  const finish = () => {
    cell();
    if (row.some((value) => value !== '')) rows.push(row);
    row = [];
    if (rows.length > MAX_ROWS + 1) throw new Error('O ficheiro excede 5000 registos.');
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; }
        else { quoted = false; closed = true; }
      } else value += char;
    } else if (char === delimiter) cell();
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[i + 1] === '\n') i++; finish(); }
    else if (char === '"' && !value && !closed) quoted = true;
    else {
      if (closed || char === '"') throw new Error('CSV inválido: aspas ou conteúdo após uma célula citada.');
      value += char;
    }
  }
  if (quoted) throw new Error('CSV inválido: aspas não terminadas.');
  if (value || row.length || closed) finish();
  if (rows.length < 2) throw new Error('O CSV precisa de cabeçalhos e pelo menos um registo.');
  const headers = rows.shift().map((value) => value.trim());
  if (headers.some((value) => !value) || new Set(headers.map(norm)).size !== headers.length) throw new Error('Cabeçalhos vazios ou repetidos no CSV.');
  return rows.map((row, index) => {
    if (row.length !== headers.length) throw new Error(`Número de colunas incorreto no registo ${index + 1}.`);
    return Object.fromEntries(headers.map((key, i) => [key, row[i]]));
  });
}

export function parseRecords(text, format) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new Error('Limite de importação: 2 MiB.');
  text = text.replace(/^\uFEFF/, '');
  let rows;
  if (format === 'csv') rows = csvRows(text);
  else if (format === 'json' || format === 'ted-json') {
    let parsed;
    try { parsed = JSON.parse(text); } catch { throw new Error('JSON inválido.'); }
    rows = format === 'ted-json' ? parsed?.notices : Array.isArray(parsed) ? parsed : parsed?.results;
  } else throw new Error('Formato suportado: CSV ou JSON.');
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_ROWS) throw new Error('São necessários entre 1 e 5000 registos numa lista JSON ou CSV.');
  if (format === 'ted-json') {
    for (const row of rows) {
      if (!row || typeof row !== 'object' || Array.isArray(row) || typeof row['publication-number'] !== 'string' || !/^\d{1,8}-\d{4}$/.test(row['publication-number']) ||
          !Array.isArray(row['buyer-country']) || !row['buyer-country'].includes('PRT')) throw new Error('Anúncio TED sem identificador ou comprador em Portugal.');
      for (const field of ['buyer-identifier']) {
        if (row[field] !== undefined && (!Array.isArray(row[field]) || row[field].some((value) => typeof value !== 'string'))) throw new Error('Identificadores TED com formato inesperado.');
      }
      for (const field of ['buyer-name', 'title-proc']) {
        if (row[field] !== undefined && (!row[field] || typeof row[field] !== 'object' || Array.isArray(row[field]) ||
            Object.values(row[field]).some((values) => !Array.isArray(values) || values.some((value) => typeof value !== 'string')))) throw new Error('Texto multilingue TED com formato inesperado.');
      }
      for (const field of ['publication-date', 'notice-type']) {
        if (row[field] !== undefined && typeof row[field] !== 'string') throw new Error('Metadados TED com formato inesperado.');
      }
    }
    return rows;
  }
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || Object.keys(row).length > 100) throw new Error('Cada registo tem de ser um objeto com até 100 colunas.');
    if (Object.values(row).some((value) => value !== null && !['string', 'number', 'boolean'].includes(typeof value))) throw new Error('Colunas aninhadas não são suportadas; usa registos planos.');
  }
  if (!rows.some((row) => Object.keys(row).some((key) => COLUMNS.title.some((alias) => norm(alias) === norm(key))))) {
    throw new Error('Falta uma coluna de objeto/título: objeto_do_contrato, objeto, titulo ou title.');
  }
  return rows;
}

export function normalizeRecord(raw, format) {
  if (format === 'ted-json') {
    const text = (value) => (value?.por || value?.eng || Object.values(value || {})[0] || []).join(' | ');
    return { title: text(raw['title-proc']) || `Anúncio TED ${raw['publication-number']} (objeto não indicado nestes campos)`,
      buyer: text(raw['buyer-name']), buyerId: (raw['buyer-identifier'] || []).join(' | '),
      supplier: '', supplierId: '', amount: '', date: '', published: raw['publication-date'] || '',
      procedure: raw['notice-type'] || '' };
  }
  const fields = Object.entries(raw).map(([key, value]) => [norm(key), value]);
  const get = (name) => {
    const aliases = COLUMNS[name].map(norm);
    const value = fields.find(([key]) => aliases.includes(key))?.[1];
    return value == null ? '' : String(value).trim();
  };
  return Object.fromEntries(Object.keys(COLUMNS).map((field) => [field, get(field)]));
}

export async function sha256(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function newDossier(question) {
  if (typeof question !== 'string' || question.trim().length < 5 || question.length > 500) throw new Error('Formula uma pergunta entre 5 e 500 caracteres.');
  return { version: 1, question: question.trim(), createdAt: new Date().toISOString(), sources: [], records: [], notes: '' };
}

export function dossierJson(dossier) {
  if (Object.hasOwn(dossier, 'hypotheses')) validateHypotheses(dossier.hypotheses, dossier.records);
  if (Object.hasOwn(dossier, 'trail')) validateTrail(dossier.trail, dossier.records);
  const text = JSON.stringify(dossier);
  if (new TextEncoder().encode(text).length > MAX_DOSSIER_BYTES) throw new Error('O dossiê excederia 24 MiB. Reduz o volume ou divide a investigação antes de continuar.');
  return text;
}

export async function addSource(dossier, { name, url, rawText, format, collectedAt, query = '', total = null, requestBody }) {
  if (typeof name !== 'string' || !name.trim() || name.length > 200 || !publicUrl(url)) throw new Error('Indica um nome e uma ligação HTTPS para a origem.');
  if (!Number.isFinite(Date.parse(collectedAt)) || typeof query !== 'string' || query.length > 120 ||
      (total !== null && (!Number.isInteger(total) || total < 0))) throw new Error('Metadados de origem inválidos.');
  if (dossier.sources.length >= 100) throw new Error('Limite de 100 lotes por dossiê.');
  if (format === 'ted-json') {
    if (!requestBody || publicUrl(url) !== collectionUrl('ted', query).href || !Number.isInteger(requestBody.page) ||
        JSON.stringify(requestBody) !== JSON.stringify(tedRequest(query, (requestBody.page - 1) * PAGE_SIZE))) throw new Error('Pedido TED de origem inválido.');
  } else if (requestBody !== undefined) throw new Error('Metadados de pedido incompatíveis com o formato.');
  const rows = parseRecords(rawText, format);
  if (dossier.records.length + rows.length > MAX_ROWS) throw new Error('O dossiê não pode exceder 5000 registos.');
  const hash = await sha256(rawText);
  if (dossier.sources.some((source) => source.hash === hash && source.url === publicUrl(url))) throw new Error('Este lote já existe no dossiê; não foi duplicado.');
  const id = crypto.randomUUID();
  const source = { id, name: name.trim(), url: publicUrl(url), rawText, format, collectedAt, query, total, hash,
    method: format === 'ted-json' ? 'ted-search-v1' : 'structured-import-v1', ...(format === 'ted-json' ? { requestBody } : {}) };
  const records = rows.map((raw, index) => ({ id: `${id}:${index}`, sourceId: id, row: index + 1,
    raw, fields: normalizeRecord(raw, format), status: 'unverified', note: '' }));
  const added = { ...dossier, sources: [...dossier.sources, source], records: [...dossier.records, ...records] };
  dossierJson(added);
  return added;
}

export function duplicateKeys(records) {
  const counts = new Map();
  const key = (record) => JSON.stringify(Object.entries(record.raw).sort(([a], [b]) => a.localeCompare(b)));
  for (const record of records) counts.set(key(record), (counts.get(key(record)) || 0) + 1);
  return new Set(records.filter((record) => counts.get(key(record)) > 1).map((record) => record.id));
}

export async function restoreDossier(text) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_DOSSIER_BYTES) throw new Error('O dossiê excede o limite de 24 MiB.');
  let saved;
  try { saved = JSON.parse(text); } catch { throw new Error('Ficheiro de dossiê inválido.'); }
  if (saved?.version !== 1 || !Array.isArray(saved.sources) || !Array.isArray(saved.records) || saved.sources.length > 100 ||
      saved.records.length > MAX_ROWS || typeof saved.notes !== 'string' || saved.notes.length > 20000 ||
      !Number.isFinite(Date.parse(saved.createdAt))) throw new Error('Estrutura ou versão do dossiê inválida.');
  let rebuilt = newDossier(saved.question);
  const ids = new Set();
  for (const source of saved.sources) {
    if (!source || typeof source.id !== 'string' || !source.id || ids.has(source.id) || !Number.isFinite(Date.parse(source.collectedAt)) ||
        typeof source.query !== 'string' || source.query.length > 120 || await sha256(source.rawText) !== source.hash) throw new Error('Fonte inválida ou conteúdo original alterado.');
    ids.add(source.id);
    const added = await addSource(rebuilt, source);
    const newSource = added.sources.at(-1);
    added.sources[added.sources.length - 1] = { ...newSource, id: source.id };
    added.records = added.records.map((record) => record.sourceId === newSource.id
      ? { ...record, id: `${source.id}:${record.row - 1}`, sourceId: source.id } : record);
    rebuilt = added;
  }
  if (rebuilt.records.length !== saved.records.length) throw new Error('Registos não correspondem aos originais.');
  const byId = new Map(saved.records.map((record) => [record?.id, record]));
  if (byId.size !== saved.records.length) throw new Error('Identificadores repetidos no dossiê.');
  rebuilt.records = rebuilt.records.map((record) => {
    const review = byId.get(record.id);
    if (!review || review.sourceId !== record.sourceId || review.row !== record.row ||
        !REVIEW_STATES.includes(review.status) || typeof review.note !== 'string' || review.note.length > 5000 ||
        (review.status !== 'unverified' && !review.note.trim()) ||
        JSON.stringify(review.raw) !== JSON.stringify(record.raw) || JSON.stringify(review.fields) !== JSON.stringify(record.fields)) throw new Error('Registo, transformação ou revisão inválidos.');
    return { ...record, status: review.status, note: review.note };
  });
  if (Object.hasOwn(saved, 'hypotheses')) validateHypotheses(saved.hypotheses, rebuilt.records);
  if (Object.hasOwn(saved, 'trail')) validateTrail(saved.trail, rebuilt.records);
  return { ...rebuilt, createdAt: saved.createdAt, notes: saved.notes,
    ...(Object.hasOwn(saved, 'hypotheses') ? { hypotheses: saved.hypotheses } : {}),
    ...(Object.hasOwn(saved, 'trail') ? { trail: saved.trail } : {}) };
}

export function csvTable(headers, rows) {
  const cell = (value) => {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(cell).join(';')).join('\r\n');
}

export function recordUrl(record, source) {
  return source.format === 'ted-json' ? `https://ted.europa.eu/pt/notice/-/detail/${record.raw['publication-number']}` : source.url;
}

export function recordsCsv(dossier) {
  const fields = ['title', 'buyer', 'buyerId', 'supplier', 'supplierId', 'amount', 'date', 'published', 'procedure'];
  const headers = [...fields, 'status', 'note', 'source_url', 'collected_at', 'original_row', 'sha256', 'record_kind', 'record_url', 'request_body'];
  const sources = new Map(dossier.sources.map((source) => [source.id, source]));
  return csvTable(headers, dossier.records.map((record) => {
    const source = sources.get(record.sourceId);
    return [...fields.map((field) => record.fields[field]), record.status, record.note, source.url, source.collectedAt, record.row, source.hash,
      source.format === 'ted-json' ? 'notice' : 'imported-record', recordUrl(record, source), source.requestBody ? JSON.stringify(source.requestBody) : ''];
  }));
}

import test from 'node:test';
import assert from 'node:assert/strict';
import { collectionUrl, collectPublic, parseRecords, normalizeRecord, newDossier, addSource, restoreDossier,
  recordsCsv, duplicateKeys, publicUrl, dossierJson, tedRequest, recordUrl, MAX_IMPORT_BYTES, MAX_ROWS, MAX_DOSSIER_BYTES } from './investigation.mjs';
import worker from './worker.js';

const row = { objeto: 'Contrato de teste', adjudicante: 'Entidade A', adjudicataria: 'Empresa A', valor: '1.234,56', data: '2026-01-01' };
const metadata = { name: 'Fonte de teste', url: 'https://example.org/dataset', format: 'json', collectedAt: '2026-11-01T00:00:00Z', rawText: JSON.stringify([row]) };

test('Collection is bound to fixed official destinations and capped pages; query cannot inject ODS syntax', () => {
  const query = '") OR 1=1 --';
  const url = collectionUrl('sns', query, 150);
  assert.equal(url.hostname, 'transparencia.sns.gov.pt');
  assert.equal(url.searchParams.get('limit'), '50');
  assert.equal(url.searchParams.get('offset'), '150');
  assert.match(url.searchParams.get('where'), /\\"/);
  assert.equal(collectionUrl('catalog', 'contratos').hostname, 'dados.gov.pt');
  for (const offset of [-1, 1, 200, NaN]) assert.throws(() => collectionUrl('sns', 'contratos', offset));
  assert.throws(() => collectionUrl('https://localhost', 'contratos'));
  assert.throws(() => collectionUrl('catalog', 'contratos', 50));
  assert.throws(() => collectionUrl('sns', 'x'));
  assert.throws(() => collectionUrl('sns', 'x'.repeat(121)));
  for (const url of ['http://example.org', 'https://user:pass@example.org', 'javascript:alert(1)', '/relative']) assert.equal(publicUrl(url), null);
});

test('CSV handles delimiters, BOM, quotes, newlines and preserves values without monetary guesses', () => {
  const records = parseRecords('\uFEFFobjeto;adjudicante;valor\r\n"Contrato; especial\nnova linha";"Entidade ""A""";1.234,56\r\n', 'csv');
  assert.equal(records[0].objeto, 'Contrato; especial\nnova linha');
  assert.equal(normalizeRecord(records[0]).amount, '1.234,56');
  assert.equal(normalizeRecord(records[0]).buyer, 'Entidade "A"');
  assert.equal(normalizeRecord(records[0]).supplierId, '');
  assert.equal(parseRecords('title,buyer\nTeste,Empresa', 'csv')[0].buyer, 'Empresa');
  assert.equal(parseRecords('title\tbuyer\nTeste\tEmpresa', 'csv')[0].buyer, 'Empresa');
  for (const text of ['objeto;objeto\nA;B', 'objeto;valor\nA', 'objeto\n"não fechado', 'objeto\n"A"fora', 'nome\nA']) {
    assert.throws(() => parseRecords(text, 'csv'));
  }
  assert.throws(() => parseRecords('x'.repeat(MAX_IMPORT_BYTES + 1), 'csv'));
  assert.throws(() => parseRecords(JSON.stringify(Array(MAX_ROWS + 1).fill(row)), 'json'));
  assert.throws(() => parseRecords('[{"objeto":{"nested":true}}]', 'json'));
  assert.throws(() => parseRecords('[]', 'json'));
  assert.throws(() => parseRecords('invalid', 'json'));
  assert.deepEqual(parseRecords(JSON.stringify({ results: [row] }), 'json'), [row]);
});

test('Provenance, exact duplicates and hashes survive a dossier round trip without auto-verification', async () => {
  let dossier = await addSource(newDossier('Que contratos existem?'), metadata);
  assert.equal(dossier.records[0].status, 'unverified');
  assert.equal(dossier.sources[0].hash.length, 64);
  assert.equal(dossier.records[0].raw.valor, '1.234,56');
  await assert.rejects(addSource(dossier, metadata), /já existe/);
  dossier = await addSource(dossier, { ...metadata, url: 'https://example.org/other' });
  assert.equal(duplicateKeys(dossier.records).size, 2);
  dossier.records[0].status = 'ambiguous';
  dossier.records[0].note = 'Entidades homónimas; identidade por confirmar.';
  assert.deepEqual(await restoreDossier(JSON.stringify(dossier)), dossier);
  for (const mutate of [
    (copy) => { copy.sources[0].rawText += ' '; },
    (copy) => { copy.records[0].fields.amount = '999'; },
    (copy) => { copy.records[0].raw.valor = '999'; },
    (copy) => { copy.records[0].status = 'verified-by-ai'; },
    (copy) => { copy.records[0].status = 'corroborated'; copy.records[0].note = ''; },
    (copy) => { copy.records[0].sourceId = 'wrong-origin'; },
    (copy) => { copy.records.push(copy.records[0]); },
    (copy) => { copy.sources[0].url = 'javascript:alert(1)'; },
  ]) {
    const copy = structuredClone(dossier); mutate(copy);
    await assert.rejects(restoreDossier(JSON.stringify(copy)));
  }
});

test('Dossier size is bounded so exported work remains restorable', () => {
  assert.throws(() => dossierJson({ notes: 'x'.repeat(MAX_DOSSIER_BYTES) }), /24 MiB/);
  assert.throws(() => newDossier('x'), /pergunta/);
});

test('CSV neutralises spreadsheet formulas while JSON keeps exact originals and provenance', async () => {
  const dangerous = { objeto: '=HYPERLINK("https://example.org")', adjudicante: '\t+SUM(1)', valor: '-1', data: '@payload' };
  const dossier = await addSource(newDossier('Que dados são seguros?'), { ...metadata, rawText: JSON.stringify([dangerous]) });
  const csv = recordsCsv(dossier);
  assert.ok(csv.startsWith('\uFEFF'));
  for (const value of ["'=HYPERLINK", "'+SUM", "'-1", "'@payload", 'source_url', 'sha256']) assert.ok(csv.includes(value), value);
  assert.deepEqual(dossier.records[0].raw, dangerous);
});

test('Source API errors, excessive responses and changed schema are explicit, not empty success', async (t) => {
  let mode = 'valid';
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal);
    if (mode === '429') return new Response('', { status: 429 });
    if (mode === 'html') return new Response('<html>');
    if (mode === 'schema') return Response.json({ results: [], total_count: 'wrong' });
    if (mode === 'size') return new Response('x'.repeat(MAX_IMPORT_BYTES + 1));
    return Response.json({ results: Array(50).fill(row), total_count: 500 });
  });
  assert.equal((await collectPublic('sns', 'contratos', 100)).hasMore, true);
  assert.equal((await collectPublic('sns', 'contratos', 150)).hasMore, false);
  for (mode of ['429', 'html', 'schema', 'size']) await assert.rejects(collectPublic('sns', 'contratos'));
});

test('Catalogue discovery remains metadata, sanitises links and does not collect resources', async (t) => {
  let count = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    count++;
    return Response.json({ data: [{ title: 'Dados', page: 'javascript:alert(1)', organization: { name: 'Editor' },
      license: 'cc-by', resources: [{ format: 'csv', url: 'https://example.org/file.csv' }, { url: 'http://private' }] }] });
  });
  const result = await collectPublic('catalog', 'contratos');
  assert.equal(count, 1);
  assert.equal(result.items[0].url, null);
  assert.equal(result.items[0].resources.length, 1);
  assert.equal('rawText' in result, false);
});

test('TED uses literal Portugal text search and fixed POST, rejecting incomplete results', async (t) => {
    let timedOut = false;
    const notice = { 'publication-number': '123456-2026', 'buyer-name': { por: ['Hospital fictício'] },
      'buyer-country': ['PRT'], 'buyer-identifier': ['508085888'], 'publication-date': '2026-10-01', 'notice-type': 'cn-standard' };
    for (const query of ['" OR buyer-country=FRA', 'abc\\def', 'abc\nx']) assert.throws(() => tedRequest(query));
    const expected = tedRequest('hospital', 150);
    assert.equal(expected.page, 4);
    assert.equal(expected.query, 'buyer-country=PRT AND FT~"hospital"');
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      assert.equal(url.href, 'https://api.ted.europa.eu/v3/notices/search');
      assert.equal(options.method, 'POST');
      assert.equal(options.redirect, 'error');
      assert.deepEqual(JSON.parse(options.body), expected);
      return Response.json({ notices: [notice], totalNoticeCount: 1000, timedOut });
    });
    const result = await collectPublic('ted', 'hospital', 150);
    assert.equal(result.hasMore, false);
    let dossier = await addSource(newDossier('Que anúncios existem?'), {
      name: 'TED', url: result.url, rawText: result.rawText, format: result.format, requestBody: result.requestBody,
      collectedAt: result.collectedAt, query: 'hospital', total: result.total,
    });
    assert.equal(dossier.sources[0].method, 'ted-search-v1');
    assert.deepEqual(dossier.records[0].raw, notice);
    assert.equal(dossier.records[0].fields.supplier, '');
    assert.equal(dossier.records[0].fields.amount, '');
    assert.equal(dossier.records[0].fields.date, '');
    assert.match(dossier.records[0].fields.title, /Anúncio TED/);
    assert.equal(recordUrl(dossier.records[0], dossier.sources[0]), 'https://ted.europa.eu/pt/notice/-/detail/123456-2026');
    assert.deepEqual(await restoreDossier(JSON.stringify(dossier)), dossier);
    assert.ok(recordsCsv(dossier).includes('notice'));
    const tampered = structuredClone(dossier);
    tampered.sources[0].requestBody.query = 'buyer-country=FRA';
    await assert.rejects(restoreDossier(JSON.stringify(tampered)), /Pedido TED/);
    timedOut = true;
    await assert.rejects(collectPublic('ted', 'hospital', 150), /incompleta/);
    for (const change of [
      (row) => { row['buyer-country'] = ['FRA']; },
      (row) => { row['publication-number'] = '../bad'; },
      (row) => { row['buyer-name'] = { por: 'wrong shape' }; },
    ]) {
      const row = structuredClone(notice); change(row);
      assert.throws(() => parseRecords(JSON.stringify({ notices: [row] }), 'ted-json'));
    }
});

test('Worker preserves origin and method guards, validates scope and surfaces upstream failure', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('Source offline'); });
  t.mock.method(console, 'error', () => {});
  const request = (query, method = 'GET', origin = 'https://joaobafonso.github.io') => new Request(
    `https://proxy.example/investigar?${query}`, { method, headers: { Origin: origin } });
  assert.equal((await worker.fetch(request('source=sns&q=contratos', 'POST'), {})).status, 405);
  assert.equal((await worker.fetch(request('source=sns&q=contratos', 'GET', 'https://untrusted.example'), {})).status, 403);
  assert.equal((await worker.fetch(request('source=unknown&q=contratos'), {})).status, 400);
  assert.equal((await worker.fetch(request('source=sns&q=contratos&offset=200'), {})).status, 400);
  assert.equal((await worker.fetch(request('source=ted&q=%22%20OR%20x'), {})).status, 400);
  const failure = await worker.fetch(request('source=sns&q=contratos'), {});
  assert.equal(failure.status, 502);
  assert.match((await failure.json()).error, /Source offline/);
});

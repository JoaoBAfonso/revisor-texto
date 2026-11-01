import test from 'node:test';
import assert from 'node:assert/strict';
import { collectFunding, fundingUrl, FUNDING_SOURCES } from './investigation-funding.mjs';
import { sha256 } from './investigation.mjs';
import worker from './worker.js';

const dataset = (source) => ({ id: source.id, title: source.title,
  organization: { id: source.editor, name: 'Editor oficial' }, page: `https://dados.gov.pt/datasets/${source.key}`,
  license: 'notspecified', last_modified: '2026-10-30T12:00:00Z',
  resources: [{ title: 'Projetos atuais', format: 'xlsx', url: 'https://dados.gov.pt/s/current.xlsx', last_modified: '2026-10-30T12:00:00Z' }] });

test('Funding destinations are fixed verified datasets, not arbitrary URLs or beneficiary search', () => {
  assert.equal(FUNDING_SOURCES.length, 6);
  for (const source of FUNDING_SOURCES) assert.equal(fundingUrl(source.key).href, `https://dados.gov.pt/api/1/datasets/${source.id}/`);
  for (const key of ['https://example.org', '../secret', 'hospital', '', null]) assert.throws(() => fundingUrl(key), /inválida/);
  assert.throws(() => fundingUrl('prr-projects', 50), /paginação/);
});

test('Funding collection preserves metadata provenance and current resource links without downloading files', async (t) => {
  for (const source of FUNDING_SOURCES) {
    const data = dataset(source);
    let calls = 0;
    t.mock.method(globalThis, 'fetch', async (url, options) => {
      calls++;
      assert.equal(url.href, fundingUrl(source.key).href);
      assert.equal(options.redirect, 'error');
      return Response.json(data);
    });
    const result = await collectFunding(source.key);
    assert.equal(calls, 1);
    assert.equal(result.scope, 'metadata-only');
    assert.equal(result.license, 'notspecified');
    assert.equal(result.resources[0].url, data.resources[0].url);
    assert.deepEqual(JSON.parse(result.rawText), data);
    assert.equal(result.hash, await sha256(result.rawText));
    assert.equal('records' in result, false);
    assert.equal('total' in result, false);
    t.mock.restoreAll();
  }
});

test('Funding rejects changed publisher, dataset identity and unsafe resources explicitly', async (t) => {
  const source = FUNDING_SOURCES[0];
  for (const change of [
    (data) => { data.id = 'wrong'; },
    (data) => { data.organization.id = 'wrong'; },
    (data) => { data.page = 'javascript:alert(1)'; },
    (data) => { data.resources = {}; },
    (data) => { data.resources[0].url = 'http://example.org'; },
    (data) => { data.resources[0].title = null; },
  ]) {
    const data = dataset(source); change(data);
    t.mock.method(globalThis, 'fetch', async () => Response.json(data));
    await assert.rejects(collectFunding(source.key), /inesperados|inválidos/);
    t.mock.restoreAll();
  }
  t.mock.method(globalThis, 'fetch', async () => new Response('', { status: 429 }));
  await assert.rejects(collectFunding(source.key), /429/);
});

test('Funding Worker retains guards and no-store, validating selection before upstream access', async (t) => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return Response.json(dataset(FUNDING_SOURCES[0])); });
  const req = (query, method = 'GET', origin = 'http://localhost:8000') =>
    new Request(`https://proxy.example/investigar?source=funding&${query}`, { method, headers: { Origin: origin } });
  assert.equal((await worker.fetch(req('q=prr-projects', 'POST'), {})).status, 405);
  assert.equal((await worker.fetch(req('q=prr-projects', 'GET', 'https://example.org'), {})).status, 403);
  assert.equal((await worker.fetch(req('q=https://example.org'), {})).status, 400);
  assert.equal((await worker.fetch(req('q=prr-projects&offset=50'), {})).status, 400);
  assert.equal(calls, 0);
  const response = await worker.fetch(req('q=prr-projects'), {});
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store');
  assert.equal((await response.json()).scope, 'metadata-only');
  assert.equal(calls, 1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { organizationalNif, entityIndex, entitiesCsv, relationshipMap, relationshipsCsv, MAP_PAGE_SIZE } from './investigation-entities.mjs';
import { newDossier, addSource, restoreDossier, tedRequest } from './investigation.mjs';

const metadata = { name: 'Fixture', url: 'https://example.org/a', format: 'json', collectedAt: '2026-11-01T00:00:00Z' };
const row = (buyer, buyerId, supplier = '', supplierId = '') => ({ title: 'Registo fictício', buyer, buyer_id: buyerId, supplier, supplier_id: supplierId });

test('Only a single organizational NIF with valid check digit becomes an indexing key', () => {
  assert.equal(organizationalNif('508085888'), '508085888');
  assert.equal(organizationalNif(' PT 508085888 '), '508085888');
  for (const value of ['', '508085889', '508085888 | 508080827', '508085888,508080827', '123456789',
    'PT-508085888', '508 085 888', '508085888abc', null, 508085888]) assert.equal(organizationalNif(value), null, String(value));
});

test('Index groups occurrences by declared NIF without merging names or changing record verification', async () => {
  let dossier = await addSource(newDossier('Que entidades aparecem?'), { ...metadata, rawText: JSON.stringify([
    row('Hospital A', '508085888', 'Empresa B', '508080827'),
    row('HOSPITAL Á', 'PT508085888'),
    row('Outra designação', '508085888'),
    row('Hospital A', '508080827'),
    row('Hospital A', ''),
    row('Hospital A', ''),
    row('Hospital A | Hospital B', '508085888'),
    row('Hospital C', '508085888 | 508080827'),
  ]) });
  dossier = await addSource(dossier, { ...metadata, url: 'https://example.org/b', rawText: JSON.stringify([row('Hospital A', '508085888')]) });
  const before = JSON.stringify(dossier);
  const index = entityIndex(dossier);
  assert.equal(JSON.stringify(dossier), before);
  const group = index.find(({ nif }) => nif === '508085888');
  assert.equal(group.occurrences.length, 4);
  assert.equal(group.sourceCount, 2);
  assert.ok(group.warnings.some((text) => text.includes('designações diferentes')));
  assert.ok(group.warnings.some((text) => text.includes('homónimo')));
  assert.equal(index.filter(({ nif }) => !nif).length, 4);
  assert.equal(index.find(({ nif }) => nif === '508080827').occurrences.length, 2);
  assert.ok(index.flatMap(({ occurrences }) => occurrences).every(({ recordStatus }) => recordStatus === 'unverified'));
  assert.ok(index.flatMap(({ occurrences }) => occurrences).every(({ sourceId, row, url }) => sourceId && row && url.startsWith('https://')));
  assert.deepEqual(entityIndex(await restoreDossier(JSON.stringify(dossier))), index);
});

test('Large homonym sets remain isolated and candidate lists bounded rather than quadratic output', async () => {
  const dossier = await addSource(newDossier('Que homónimos aparecem?'), {
    ...metadata, rawText: JSON.stringify(Array.from({ length: 5000 }, () => row('Entidade homónima', ''))),
  });
  const index = entityIndex(dossier);
  assert.equal(index.length, 5000);
  assert.ok(index.every(({ occurrences, candidateKeys, candidatesTruncated }) => occurrences.length === 1 &&
    candidateKeys.length === 20 && candidatesTruncated));
});

test('Entity export retains each role and source; cells with formulas are neutralised', async () => {
  const dossier = await addSource(newDossier('Que entidades aparecem?'), {
    ...metadata, rawText: JSON.stringify([row('=FORMULA', '508085888', 'Empresa B', '508085888')]),
  });
  const index = entityIndex(dossier);
  assert.equal(index.length, 1);
  assert.equal(index[0].recordCount, 1);
  assert.equal(index[0].occurrences.length, 2);
  const csv = entitiesCsv(dossier);
  assert.equal(csv.split('\r\n').length, 3);
  for (const text of ["'=FORMULA", 'organizational-nif-checksum-only', 'buyer', 'supplier', 'https://example.org/a',
    dossier.sources[0].hash, 'unverified']) assert.ok(csv.includes(text), text);
});

test('Relationship map is bipartite, retains duplicate records and never invents entity links', async () => {
  const dossier = await addSource(newDossier('Que ligações são declaradas?'), {
    ...metadata, rawText: JSON.stringify([
      row('Comprador', '508085888', 'Empresa', '508080827'),
      row('Comprador', '508085888', 'Empresa', '508080827'),
      row('Comprador', '', 'Várias | Empresas', '508080827'),
      row('Comprador', '508085888'),
    ]),
  });
  const original = JSON.stringify(dossier);
  const map = relationshipMap(dossier, 'nif:508085888');
  assert.equal(map.totalRecords, 3);
  assert.equal(map.edges.length, 5);
  assert.equal(map.entities.length, 2);
  for (const edge of map.edges) {
    assert.ok(map.records.some(({ id }) => id === edge.recordId));
    assert.ok(map.entities.some(({ key }) => key === edge.groupKey));
    assert.ok(['buyer', 'supplier'].includes(edge.role));
    assert.equal(edge.recordStatus, 'unverified');
    assert.equal(edge.sourceId, dossier.sources[0].id);
    assert.equal(edge.url, metadata.url);
  }
  const isolated = entityIndex(dossier).find(({ nif, occurrences }) => !nif && occurrences[0].role === 'buyer');
  assert.equal(relationshipMap(dossier, isolated.key).totalRecords, 1);
  assert.equal(JSON.stringify(dossier), original);
  assert.deepEqual(relationshipMap(await restoreDossier(original), map.focus.key), map);
  assert.throws(() => relationshipMap(dossier, 'missing'), /não existe/);
  assert.throws(() => relationshipMap(dossier, map.focus.key, -1), /inválida/);
});

test('Large relationship maps show bounded pages and preserve both roles for the same entity', async () => {
  const dossier = await addSource(newDossier('Que ocorrências se repetem?'), {
    ...metadata, rawText: JSON.stringify(Array.from({ length: 5000 },
      () => row('Entidade', '508085888', 'Entidade', '508085888'))),
  });
  const first = relationshipMap(dossier, 'nif:508085888');
  assert.equal(first.records.length, MAP_PAGE_SIZE);
  assert.equal(first.edges.length, MAP_PAGE_SIZE * 2);
  const map = relationshipMap(dossier, 'nif:508085888', 9999);
  assert.equal(map.totalRecords, 5000);
  assert.equal(map.pageCount, Math.ceil(5000 / MAP_PAGE_SIZE));
  assert.equal(map.page, map.pageCount - 1);
  assert.equal(map.records.length, 5000 % MAP_PAGE_SIZE);
  assert.equal(map.edges.length, map.records.length * 2);
  assert.equal(map.entities.length, 1);
});

test('Relationship CSV contains every declared edge, provenance and protected formulas', async () => {
  const dossier = await addSource(newDossier('Que ligações exportar?'), {
    ...metadata, rawText: JSON.stringify([row('=FORMULA', '508085888', 'Empresa', '')]),
  });
  const csv = relationshipsCsv(dossier);
  assert.equal(csv.split('\r\n').length, 3);
  for (const text of ['record_node', `record:${dossier.records[0].id}`, "'=FORMULA", 'isolated-occurrence',
    'buyer', 'supplier', metadata.url, dossier.sources[0].hash, 'unverified', 'imported-record', 'review_note']) assert.ok(csv.includes(text), text);
});

test('Mixed-source map labels TED as notices and preserves links without inventing supplier edges', async () => {
  let dossier = await addSource(newDossier('Que registos e anúncios aparecem?'), {
    ...metadata, rawText: JSON.stringify([row('Comprador', '508085888', 'Empresa', '508080827')]),
  });
  dossier = await addSource(dossier, { ...metadata, name: 'TED', format: 'ted-json',
    url: 'https://api.ted.europa.eu/v3/notices/search', query: 'hospital', requestBody: tedRequest('hospital'),
    rawText: JSON.stringify({ notices: [{ 'publication-number': '123456-2026', 'buyer-name': { por: ['Comprador'] },
      'buyer-country': ['PRT'], 'buyer-identifier': ['508085888'] }] }),
  });
  const map = relationshipMap(dossier, 'nif:508085888');
  assert.equal(map.records.length, 2);
  assert.equal(map.edges.length, 3);
  const noticeEdges = map.edges.filter(({ sourceId }) => sourceId === dossier.sources[1].id);
  assert.equal(noticeEdges.length, 1);
  assert.equal(noticeEdges[0].role, 'buyer');
  assert.equal(noticeEdges[0].url, 'https://ted.europa.eu/pt/notice/-/detail/123456-2026');
  assert.ok(relationshipsCsv(dossier).includes('"notice"'));
  assert.deepEqual(relationshipMap(await restoreDossier(JSON.stringify(dossier)), map.focus.key), map);
});

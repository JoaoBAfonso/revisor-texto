import test from 'node:test';
import assert from 'node:assert/strict';
import { timelineDate, timelineEvents, timelinePage, timelineCsv, TIMELINE_PAGE_SIZE } from './investigation-timeline.mjs';
import { newDossier, addSource, restoreDossier, tedRequest } from './investigation.mjs';

const metadata = { name: 'Fonte fictícia', url: 'https://example.org/timeline', format: 'json', collectedAt: '2026-11-01T00:00:00Z' };
const make = (rows) => addSource(newDossier('Que datas são declaradas?'), { ...metadata, rawText: JSON.stringify(rows) });

test('Timeline validates calendar days strictly, retains original precision and never converts timezones', () => {
  for (const [value, expected] of [
    ['2024-02-29', '2024-02-29'], ['29/02/2024', '2024-02-29'], ['2000-02-29', '2000-02-29'],
    ['2016-11-02+01:00', '2016-11-02'], ['2026-01-01T00:30:00+02:00', '2026-01-01'],
    ['2026-11-01T23:59:59.123Z', '2026-11-01'],
  ]) {
    const result = timelineDate(value);
    assert.equal(result.day, expected);
    assert.equal(result.original, value);
    assert.equal(result.state, 'dated');
  }
  for (const value of ['1900-02-29', '2026-02-29', '2026-04-31', '0000-01-01', '2026-00-01', '2026-13-01', '2026-01-00',
    '2026-01-01+14:30']) assert.equal(timelineDate(value).state, 'invalid', value);
  for (const value of ['2026', '2026-02', '01/02/26', '02-03-2026', 'cerca de 2026', '2026-01-01T24:00:00Z',
    '2026-01-01T12:00:00', '2026-01-01 garbage']) {
    assert.equal(timelineDate(value).day, '', value);
    assert.equal(timelineDate(value).state, 'unresolved', value);
  }
  assert.equal(timelineDate('').state, 'missing');
  assert.throws(() => timelineDate(null), /texto/);
});

test('Events distinguish date from publication, flag reversed dates and missing fields without using collection time', async () => {
  const dossier = await make([
    { title: 'A', data: '2026-02-01', data_de_publicacao: '2026-01-01' },
    { title: 'B', data: '2026-02' }, { title: 'C', data: '2026-02-30' },
  ]);
  const original = JSON.stringify(dossier);
  const events = timelineEvents(dossier);
  assert.equal(events.length, 6);
  assert.equal(events.filter(({ state }) => state === 'missing').length, 2);
  assert.ok(events.slice(0, 2).every(({ warnings }) => warnings.some((warning) => warning.includes('anterior'))));
  assert.equal(events[0].kind, 'date');
  assert.equal(events[1].kind, 'published');
  assert.ok(events.every(({ collectedAt, sourceUrl, hash, status }) => collectedAt === metadata.collectedAt &&
    sourceUrl === metadata.url && hash === dossier.sources[0].hash && status === 'unverified'));
  assert.equal(JSON.stringify(dossier), original);
  assert.deepEqual(timelineEvents(await restoreDossier(original)), events);
});

test('TED contributes publication only, including missing publication, with the exact notice link', async () => {
  const dossier = await addSource(newDossier('Quando foram publicados anúncios?'), {
    ...metadata, format: 'ted-json', url: 'https://api.ted.europa.eu/v3/notices/search',
    query: 'hospital', requestBody: tedRequest('hospital'),
    rawText: JSON.stringify({ notices: [
      { 'publication-number': '123456-2026', 'buyer-country': ['PRT'], 'publication-date': '2026-10-01+01:00' },
      { 'publication-number': '123457-2026', 'buyer-country': ['PRT'] },
    ] }),
  });
  const events = timelineEvents(dossier);
  assert.equal(events.length, 2);
  assert.ok(events.every(({ kind, recordKind, label }) => kind === 'published' && recordKind === 'notice' && label.includes('TED')));
  assert.equal(events[0].sourceUrl, 'https://ted.europa.eu/pt/notice/-/detail/123456-2026');
  assert.equal(events[1].state, 'missing');
  assert.deepEqual(timelineEvents(await restoreDossier(JSON.stringify(dossier))), events);
});

test('Timeline ordering is stable within days, bounded, filterable and leaves undated gaps last in both directions', async () => {
  const dossier = await make(Array.from({ length: 5000 }, (_, index) => ({
    title: `Registo ${index}`, buyer: 'Entidade Á', data: index % 2 ? '2026-02-01' : '2026-01-01',
  })));
  const events = timelineEvents(dossier);
  const first = timelinePage(events);
  assert.equal(first.total, 10000);
  assert.equal(first.events.length, TIMELINE_PAGE_SIZE);
  assert.equal(first.dated, 5000);
  assert.equal(first.undated, 5000);
  assert.equal(first.events[0].title, 'Registo 0');
  assert.equal(first.events[1].title, 'Registo 2');
  assert.equal(timelinePage(events, { direction: 'desc' }).events[0].day, '2026-02-01');
  const last = timelinePage(events, { direction: 'desc', page: 9999 });
  assert.equal(last.page, last.pageCount - 1);
  assert.ok(last.events.every(({ day }) => !day));
  assert.equal(timelinePage(events, { term: 'entidade a', kind: 'published', state: 'undated' }).total, 5000);
  assert.equal(timelinePage(events, { term: 'não existe' }).total, 0);
  assert.equal(timelinePage(events, { state: 'dated', kind: 'published' }).total, 0);
  for (const options of [{ page: -1 }, { direction: 'bad' }, { kind: 'bad' }, { state: 'bad' }]) {
    assert.throws(() => timelinePage(events, options), /inválido/);
  }
});

test('Timeline CSV exports gaps, provenance, originals and review notes with formula protection', async () => {
  const dossier = await make([{ title: '=FORMULA', buyer: '+buyer', data: '01/02/2026' }]);
  dossier.records[0].note = '@note';
  const csv = timelineCsv(dossier);
  assert.equal(csv.split('\r\n').length, 3);
  for (const value of ["'=FORMULA", "'+buyer", "'@note", '01/02/2026', '2026-02-01', 'missing',
    metadata.url, dossier.sources[0].hash, 'unverified', 'review_note']) assert.ok(csv.includes(value), value);
});

test('Timeline export uses ascending declared days and retains all gaps after dates', async () => {
  const dossier = await make([
    { title: 'Mais recente', data: '2026-02-01' },
    { title: 'Mais antigo', data: '2026-01-01' },
  ]);
  const csv = timelineCsv(dossier);
  assert.ok(csv.indexOf('2026-01-01') < csv.indexOf('2026-02-01'));
  assert.ok(csv.indexOf('"missing"') > csv.indexOf('2026-02-01'));
  assert.equal(csv.split('\r\n').length, 5);
});

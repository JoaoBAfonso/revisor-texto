import test from 'node:test';
import assert from 'node:assert/strict';
import { discoveryPage, chooseTrail, validateTrail } from './investigation-discovery.mjs';
import { newDossier, addSource, dossierJson, restoreDossier } from './investigation.mjs';

async function fixture() {
  let dossier = newDossier('Que pistas quero seguir?');
  for (const name of ['A', 'B']) dossier = await addSource(dossier, {
    name, url: `https://example.org/${name}`, format: 'json', collectedAt: '2026-11-01T00:00:00Z',
    rawText: JSON.stringify(Array.from({ length: 10 }, (_, i) => ({ title: `Manutenção ${name} ${i}`, buyer: 'Entidade' }))),
  });
  return dossier;
}
test('Discovery exposes at most three matching records, alternates lots without scoring and keeps all originals', async () => {
  const dossier = await fixture(), original = JSON.stringify(dossier);
  const result = discoveryPage(dossier, 'manutencao');
  assert.equal(result.records.length, 3);
  assert.deepEqual(result.records.map(({ fields }) => fields.title), ['Manutenção A 0', 'Manutenção B 0', 'Manutenção A 1']);
  assert.equal(result.total, 20);
  assert.equal(result.pageCount, 7);
  assert.equal(discoveryPage(dossier, 'absent').records.length, 0);
  assert.equal(discoveryPage(dossier, '', 999).records.length, 2);
  assert.equal(JSON.stringify(dossier), original);
});
test('Choices persist with reasons, leave reviews untouched and can revisit excluded clues', async () => {
  const original = await fixture();
  const recordId = original.records[0].id;
  const saved = chooseTrail(original, recordId, 'aside', 'Não responde à pergunta, por agora.');
  assert.equal(discoveryPage(saved).aside, 1);
  assert.ok(!discoveryPage(saved).records.some(({ id }) => id === recordId));
  const revised = chooseTrail(saved, recordId, 'question', 'Preciso de contexto que contrarie a intuição.');
  assert.equal(revised.trail.length, 1);
  assert.equal(discoveryPage(revised).aside, 0);
  assert.deepEqual(revised.records, original.records);
  assert.deepEqual(await restoreDossier(dossierJson(revised)), revised);
  assert.deepEqual(await restoreDossier(dossierJson(original)), original);
  assert.equal(Object.hasOwn(original, 'trail'), false);
});
test('Export and restoration reject dangling, duplicate, unsupported or unjustified choices', async () => {
  const dossier = await fixture();
  for (const item of [
    { recordId: 'missing', state: 'follow', note: 'Motivo' },
    { recordId: dossier.records[0].id, state: 'confirmed', note: 'Motivo' },
    { recordId: dossier.records[0].id, state: 'follow', note: '' },
    { recordId: dossier.records[0].id, state: 'follow', note: 'x'.repeat(3001) },
  ]) {
    assert.throws(() => validateTrail([item], dossier.records));
    await assert.rejects(restoreDossier(JSON.stringify({ ...dossier, trail: [item] })));
  }
  const item = { recordId: dossier.records[0].id, state: 'follow', note: 'Motivo' };
  assert.throws(() => validateTrail([item, item], dossier.records));
  assert.throws(() => dossierJson({ ...dossier, trail: null }));
  assert.throws(() => discoveryPage(dossier, '', -1));
});

test('Large discovery retains 5000 records while displaying only three and exposing exclusions', () => {
  const dossier = { records: Array.from({ length: 5000 }, (_, i) =>
    ({ id: String(i), sourceId: 'lot', fields: { title: 'Registo' } })), trail: [] };
  assert.equal(discoveryPage(dossier).records.length, 3);
  assert.equal(discoveryPage(dossier).total, 5000);
  dossier.trail = dossier.records.map(({ id }) => ({ recordId: id, state: 'aside', note: 'Fora da pergunta, por agora.' }));
  const result = discoveryPage(dossier);
  assert.equal(result.aside, 5000);
  assert.equal(result.records.length, 0);
  assert.equal(result.total, 5000);
  assert.equal(dossier.records.length, 5000);
});

test('First doors vary repeated descriptions without merging identities or dropping later records', () => {
  const dossier = { records: Array.from({ length: 6 }, (_, i) => ({
    id: String(i), sourceId: 'lot', fields: { title: i < 4 ? 'Descrição repetida' : `Outra descrição ${i}`, buyer: 'Entidade' },
  })) };
  assert.deepEqual(discoveryPage(dossier).records.map(({ id }) => id), ['0', '4', '5']);
  assert.deepEqual(discoveryPage(dossier, '', 1).records.map(({ id }) => id), ['1', '2', '3']);
  assert.equal(discoveryPage(dossier).total, 6);
});

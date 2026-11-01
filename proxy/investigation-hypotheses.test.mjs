import test from 'node:test';
import assert from 'node:assert/strict';
import { saveHypothesis, validateHypotheses } from './investigation-hypotheses.mjs';
import { newDossier, addSource, restoreDossier, dossierJson } from './investigation.mjs';

const make = () => addSource(newDossier('Que hipótese verificar?'), { name: 'Fixture',
  url: 'https://example.org/proof', format: 'json', collectedAt: '2026-11-01T00:00:00Z',
  rawText: JSON.stringify([{ title: 'Registo A' }, { title: 'Registo B' }]) });
const hypothesis = () => ({ id: 'hypothesis-a', statement: 'Hipótese fictícia por verificar', assessment: 'open',
  rationale: '', gaps: 'Falta conferir uma fonte independente.', questions: 'Que explicação alternativa existe?', evidence: [] });

test('Hypotheses preserve old dossiers and round-trip optional evidence without altering reviews', async () => {
  const original = await make();
  assert.deepEqual(await restoreDossier(dossierJson(original)), original);
  assert.equal(Object.hasOwn(original, 'hypotheses'), false);
  const draft = hypothesis();
  draft.evidence = original.records.map((record, i) => ({ recordId: record.id,
    relation: i ? 'contradicts' : 'supports', note: 'Interpretação manual com limites por conferir.' }));
  const saved = saveHypothesis(original, draft);
  assert.equal(Object.hasOwn(original, 'hypotheses'), false);
  assert.deepEqual(saved.records, original.records);
  assert.deepEqual(await restoreDossier(dossierJson(saved)), saved);
  draft.evidence.push({ recordId: 'bad', relation: 'context', note: 'Não guardar' });
  assert.equal(saved.hypotheses[0].evidence.length, 2);
  const revised = saveHypothesis(saved, { ...saved.hypotheses[0], assessment: 'contested', rationale: 'Há contradição a esclarecer.' });
  assert.equal(revised.hypotheses.length, 1);
  assert.ok(revised.records.every(({ status }) => status === 'unverified'));
});

test('Malformed, dangling, duplicate and unjustified evidence fails both saving and restoring', async () => {
  const original = await make();
  for (const mutate of [
    (h) => { h.statement = ''; },
    (h) => { h.assessment = 'confirmed-by-ai'; },
    (h) => { h.assessment = 'supported'; },
    (h) => { h.gaps = null; },
    (h) => { h.questions = 'x'.repeat(5001); },
    (h) => { h.evidence = [{ recordId: 'missing', relation: 'supports', note: 'Justificação' }]; },
    (h) => { h.evidence = [{ recordId: original.records[0].id, relation: 'supports', note: '' }]; },
    (h) => { h.evidence = [{ recordId: original.records[0].id, relation: 'unknown', note: 'Justificação' }]; },
    (h) => { h.evidence = Array(2).fill({ recordId: original.records[0].id, relation: 'context', note: 'Justificação' }); },
  ]) {
    const draft = hypothesis(); mutate(draft);
    assert.throws(() => saveHypothesis(original, draft));
    await assert.rejects(restoreDossier(JSON.stringify({ ...original, hypotheses: [draft] })));
  }
  assert.throws(() => validateHypotheses(null, original.records));
  assert.throws(() => validateHypotheses([hypothesis(), hypothesis()], original.records));
  assert.throws(() => validateHypotheses(Array.from({ length: 101 }, (_, i) => ({ ...hypothesis(), id: String(i) })), original.records), /100/);
});

test('Dossier export validates hypotheses while preserving permitted larger matrices', async () => {
  const original = await make();
  const saved = saveHypothesis(original, hypothesis());
  saved.hypotheses[0].evidence.push({ recordId: 'missing', relation: 'context', note: 'Justificação' });
  assert.throws(() => dossierJson(saved), /prova inválida/);
  const large = { ...original, hypotheses: Array.from({ length: 100 }, (_, index) => ({
    ...hypothesis(), id: String(index), rationale: 'x'.repeat(5000), gaps: 'x'.repeat(5000),
    questions: 'x'.repeat(5000), evidence: [],
  })) };
  assert.ok(dossierJson(large).length > 1000000);
});

test('Hypothesis link limits accept 100 unique records and reject 101', () => {
  const records = Array.from({ length: 101 }, (_, index) => ({ id: `record-${index}` }));
  const draft = { ...hypothesis(), evidence: records.slice(0, 100).map(({ id }) =>
    ({ recordId: id, relation: 'context', note: 'Contexte à vérifier' })) };
  assert.equal(validateHypotheses([draft], records)[0].evidence.length, 100);
  draft.evidence.push({ recordId: records[100].id, relation: 'supports', note: 'Justificação' });
  assert.throws(() => validateHypotheses([draft], records), /100 ligações/);
});

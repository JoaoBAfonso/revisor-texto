import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { normalizeArticleKeys } from './article-keys.mjs';
import { findNumberedDoc, numberedArticleKey } from './numbered-doc.mjs';
import { makeResolver } from './procedures.mjs';

const read = (id) => JSON.parse(readFileSync(new URL(`../../data/lei/${id}.json`, import.meta.url), 'utf8'));

test('approval articles stay accessible without shadowing the approved code', () => {
  const doc = { id: 'cc', arts: [
    { k: '1', n: '1.º', t: 'Aprovação', x: 'Aprova o código.', r: ['cc:2'] },
    { k: '2', n: '2.º', t: 'Vigência', x: 'Entra em vigor.', r: [] },
    { k: '1', n: '1.º', t: 'Fontes', x: 'Texto do código.', r: ['cc:2'] },
    { k: '2', n: '2.º', t: 'Assentos', x: 'Outro artigo.', r: [] },
  ] };
  const texts = doc.arts.map((a) => [a.n, a.t, a.x]);
  assert.equal(normalizeArticleKeys(doc), true);
  assert.equal(doc.arts.find((a) => a.k === '1').t, 'Fontes');
  assert.equal(doc.arts[0].k, '1_extra_1');
  assert.deepEqual(doc.arts[0].r, []);
  assert.ok(doc.arts[0].refNote);
  assert.deepEqual(doc.arts.map((a) => [a.n, a.t, a.x]), texts);
  assert.equal(normalizeArticleKeys(doc), false);
  assert.equal(numberedArticleKey(doc.arts, '1'), '1_extra_1');
});

test('ambiguous repeated numbers receive separate keys, not guessed targets', () => {
  const doc = { id: 'nrau', arts: [{ k: '17', r: ['nrau:1'] }, { k: '17', r: [] }] };
  normalizeArticleKeys(doc);
  assert.deepEqual(doc.arts.map((a) => a.k), ['17_extra_1', '17_extra_2']);
  assert.ok(doc.arts.every((a) => a.refNote && !a.r.length));
});

test('persisted corpus has unique keys, aligned heads and valid remissions', () => {
  const meta = read('meta');
  const heads = read('heads');
  const docs = meta.docs.map((d) => read(d.id));
  const keys = new Set();
  for (const [i, doc] of docs.entries()) {
    const seen = new Set();
    for (const [j, a] of doc.arts.entries()) {
      assert.ok(!seen.has(a.k), `${doc.id}:${a.k} is repeated`);
      seen.add(a.k);
      keys.add(`${doc.id}:${a.k}`);
      assert.deepEqual(heads[meta.docs[i].off + j], a.part ? [a.k, a.n, a.t, a.part] : [a.k, a.n, a.t]);
    }
  }
  for (const doc of docs) for (const a of doc.arts) for (const ref of a.r) assert.ok(keys.has(ref), ref);
  for (const [key, sources] of Object.entries(read('refs'))) {
    assert.ok(keys.has(key), key);
    sources.forEach((source) => assert.ok(keys.has(source), source));
  }
  const jurisDir = new URL('../../data/juris/', import.meta.url);
  for (const file of readdirSync(jurisDir).filter((f) => f.endsWith('.json'))) {
    const j = JSON.parse(readFileSync(new URL(file, jurisDir), 'utf8'));
    for (const [key, indices] of Object.entries(j.arts)) {
      assert.ok(keys.has(`${file.slice(0, -5)}:${key}`), `${file}:${key}`);
      indices.forEach((i) => assert.ok(j.acs[i], `${file}:${i}`));
    }
  }
  for (const [id, k, title] of [
    ['cc', '1', 'Fontes imediatas'], ['cc', '7', 'Cessação da vigência da lei'],
    ['ct', '1', 'Fontes específicas'], ['cpp', '1', 'Definições legais'],
    ['ccp', '2', 'Entidades adjudicantes'],
  ]) assert.equal(docs.find((d) => d.id === id).arts.find((a) => a.k === k)?.t, title);
  assert.equal(findNumberedDoc(meta.docs, 'Decreto-Lei', '84/2021')?.id, 'vendabens');
  const resolve = makeResolver(new Map(meta.docs.map((d) => [d.id, d])), docs, []);
  assert.equal(resolve('Código Civil, art. 1.º').to, 'cc:1');
  assert.equal(resolve('Decreto-Lei n.º 47344/66, art. 1.º').to, 'cc:1_extra_1');
});

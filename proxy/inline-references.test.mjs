import assert from 'node:assert/strict';
import test from 'node:test';
import { inlineReferences, referenceTarget } from './inline-references.mjs';

test('Inline citations retain exact text, offsets, suffixes and explicit article context', () => {
  const text = 'Ver Lei n.º 26/2016, artigo 18.º e artigo 79.º do Código Civil; RGPD, art. 15.º. Lei n.º 1/99.';
  const matches = inlineReferences(text);
  assert.deepEqual(matches.map(({ label }) => label), [
    'Lei n.º 26/2016, artigo 18.º', 'artigo 79.º do Código Civil', 'RGPD, art. 15.º', 'Lei n.º 1/99',
  ]);
  assert.equal(matches[1].query, 'Código Civil, artigo 79.º');
  assert.deepEqual(matches.map(({ article }) => article), [true, true, true, false]);
  for (const { start, end, label } of matches) assert.equal(text.slice(start, end), label);
  assert.equal(inlineReferences('Código Penal, art. 158.º-A')[0].query, 'Código Penal, art. 158.º-A');
  assert.equal(inlineReferences('Regulamento (UE) 2022/2065, artigo 16.º')[0].article, true);
});

test('Generic words and ambiguous unqualified articles are not made into citations', () => {
  assert.deepEqual(inlineReferences('direito, fonte, lei, artigo 15.º, tribunal, saúde, myRGPD, RGPDextra'), []);
  assert.deepEqual(inlineReferences('Lei n.º 26/201666'), []);
  assert.equal(inlineReferences('CRP e Código do Trabalho').length, 2);
  assert.equal(inlineReferences('Lei n.º 151-B/2013')[0].label, 'Lei n.º 151-B/2013');
  assert.throws(() => inlineReferences(null), /inválido/);
});

test('Popup targets cover laws and article references without treating navigation as citations', () => {
  assert.deepEqual(referenceTarget('#/direito/lei/cc'), { id: 'cc', key: null });
  assert.deepEqual(referenceTarget('#/direito/lei/cc/79'), { id: 'cc', key: '79' });
  assert.deepEqual(referenceTarget('#/direito/lei/cp/158-A'), { id: 'cp', key: '158-A' });
  assert.deepEqual(referenceTarget('#/direito/lei/cpa/1_extra_1'), { id: 'cpa', key: '1_extra_1' });
  for (const href of ['#/direito', '#/direito/pesquisa', '#/direito/caso', '#/direito/lei',
    '#/direito/lei/grau/3', '#/direito/lei/busca/saude', '#/direito/lei/cc/sec-1',
    '#/direito/lei/cc/%ZZ', '#/direito/lei/cc/79/more', 'https://example.org', null]) {
    assert.equal(referenceTarget(href), null, String(href));
  }
});

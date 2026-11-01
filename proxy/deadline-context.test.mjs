import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { TOPICS } from './guia.js';
import { repositoryAudit } from './knowledge-audit.mjs';
import { findNumberedDoc, numberedArticleKey } from './corpus/numbered-doc.mjs';

test('All 20 guide deadlines have exact base articles and context without date calculation', async () => {
  const audit = await repositoryAudit();
  assert.equal(audit.stats.deadlines, 20);
  for (const topic of TOPICS) {
    for (const deadline of topic.deadlines) {
      assert.ok(deadline.trigger && deadline.limits && deadline.contextRefs.length);
      assert.equal('deadlineDate' in deadline, false);
    }
    const audited = audit.topics.find(({ id }) => topic.id === id);
    for (const deadline of audited.deadlines) {
      assert.equal(deadline.reference.status, 'article-linked');
      for (const ref of deadline.contextRefs) assert.equal(ref.status, 'article-linked');
    }
  }
  assert.equal(audit.findings.some(({ code }) => ['unresolved-reference', 'deadline-document-only', 'deadline-context-missing', 'multiple-reference-review', 'stale-guide'].includes(code)), false);
  assert.equal(audit.findings.filter(({ code }) => code === 'deadline-context-review').length, 20);
});

test('Browser deadline links resolve to the same exact articles as the compiled guide', () => {
  const read = (name) => JSON.parse(readFileSync(new URL(`../data/lei/${name}.json`, import.meta.url), 'utf8'));
  const meta = read('meta');
  meta.byId = Object.fromEntries(meta.docs.map((doc) => [doc.id, doc]));
  meta.byShort = Object.fromEntries(meta.docs.map((doc) => [doc.short.toLowerCase(), doc]));
  const context = vm.createContext({
    meta, heads: read('heads'), findNumberedDoc, numberedArticleKey,
    plain: (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9/ ]+/g, ' ').replace(/\s+/g, ' ').trim(),
    hashFor: (id) => `#/direito/lei/${id}`,
    art: (id, key) => `#/direito/lei/${id}/${key}`,
  });
  const source = readFileSync(new URL('../lei.js', import.meta.url), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function parseRef('), source.indexOf('// ── Peças de interface')), context);
  for (const topic of read('guia').topics) {
    for (const items of Object.values(topic.guidance || {})) {
      for (const item of items) {
        for (const { text, to } of item.refs) {
          assert.equal(context.resolveRef(text, { needArticle: true }), `#/direito/lei/${to.replace(':', '/')}`, text);
        }
      }
    }
    for (const deadline of topic.deadlines) {
      for (const { text, to } of [{ text: deadline.base, to: deadline.to }, ...deadline.contextRefs]) {
        assert.equal(context.resolveRef(text, { needArticle: true }), `#/direito/lei/${to.replace(':', '/')}`, text);
      }
    }
  }
});

test('Remaining deadlines do not generalise event, remedy or suspension', () => {
  const deadlines = (id) => TOPICS.find((topic) => topic.id === id).deadlines;
  for (const id of ['honra', 'arguido', 'odio']) {
    assert.match(deadlines(id)[0].trigger, /morte ou incapacidade/);
    assert.match(deadlines(id)[0].limits, /prazo de um ano/);
    assert.match(deadlines(id)[0].limits, /Não é prazo geral de denúncia/);
  }
  for (const id of ['privacidade', 'saude']) {
    assert.match(deadlines(id)[0].limits, /prazo criminal mais longo/);
    assert.match(deadlines(id)[0].limits, /não deve ser tomada como interrupção automática/);
  }
  assert.match(deadlines('dados')[0].limits, /mais dois meses/);
  assert.match(deadlines('dados')[0].limits, /não.*prazo de decisão da CNPD/i);
  assert.match(deadlines('trabalho')[0].when, /cessação do contrato, se posterior/);
  assert.match(deadlines('trabalho')[0].limits, /despedimento coletivo/);
  assert.match(deadlines('impostos')[0].limits, /Não começa sempre no fim do pagamento/);
  assert.match(deadlines('impostos')[1].limits, /não.*oposição à execução fiscal/i);
  const administrative = deadlines('administrativo');
  assert.match(administrative[0].when, /60 dias/);
  assert.match(administrative[0].trigger, /entidade competente para o receber/);
  assert.match(administrative[0].limits, /nem presume aprovação ou indeferimento/);
  assert.match(administrative[2].when, /facultativo: prazo de impugnação contenciosa/);
  assert.match(administrative[3].limits, /Não é prazo universal/);
  assert.match(deadlines('contraordenacoes')[0].trigger, /Conhecimento pelo arguido/);
  assert.match(deadlines('contraordenacoes')[0].limits, /não é o prazo de defesa antes da decisão/);
});

test('Deadline context distinguishes exercise, suspension, exceptions and advance notice', () => {
  const deadlines = (id) => TOPICS.find((topic) => topic.id === id).deadlines;
  const media = deadlines('resposta');
  assert.equal(media.length, 3);
  assert.equal(media[1].base, 'Lei n.º 27/2007, art. 67.º');
  assert.equal(media[2].base, 'Lei n.º 54/2010, art. 61.º');
  for (const deadline of media.slice(1)) {
    assert.match(deadline.when, /20 dias/);
    assert.match(deadline.limits, /suspensão/);
    assert.match(deadline.limits, /nem para recorrer/);
  }
  assert.match(deadlines('acesso')[0].limits, /máximo de dois meses/);
  assert.match(deadlines('consumo')[0].trigger, /posse física/);
  assert.match(deadlines('consumo')[0].limits, /não para toda a compra à distância/);
  assert.match(deadlines('participacao')[0].limits, /não de um pedido de autorização/);
});

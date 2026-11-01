import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { TOPICS } from './guia.js';
import { interpret } from './direito.js';
import { repositoryAudit } from './knowledge-audit.mjs';

test('Three citizen guide areas retain text arrays and expose 26 per-orientation source records', async () => {
  const audit = await repositoryAudit();
  const compiled = JSON.parse(readFileSync(new URL('../data/lei/guia.json', import.meta.url), 'utf8'));
  assert.equal(audit.stats.sourcedTopics, 3);
  assert.equal(audit.stats.sourcedOrientations, 26);
  assert.equal(audit.findings.filter(({ code }) => code === 'guidance-legal-review').length, 26);
  assert.equal(audit.findings.filter(({ code }) => code === 'topic-summary-review').length, 3);
  assert.equal(audit.findings.some(({ kind }) => kind === 'integrity'), false);
  for (const [id, query] of [['dados', 'dados pessoais'], ['consumo', 'consumidor'], ['administrativo', 'procedimento administrativo']]) {
    const topic = TOPICS.find((topic) => topic.id === id);
    const interpreted = interpret(query).topics.find((topic) => topic.id === id);
    assert.deepEqual(interpreted.guidance, topic.guidance);
    const saved = compiled.topics.find((topic) => topic.id === id);
    const checked = audit.topics.find((topic) => topic.id === id);
    assert.equal(audit.findings.some(({ owner, code }) => owner === `topic:${id}` && code === 'claim-traceability'), false);
    for (const field of ['rights', 'steps', 'arguments']) {
      assert.deepEqual(topic[field], topic.guidance[field].map(({ text }) => text));
      assert.deepEqual(saved[field], topic[field]);
      assert.ok(topic.guidance[field].every(({ kind }) => kind === (field === 'steps' ? 'preparation' : 'legal')));
      assert.ok(checked.guidance[field].every(({ references }) => references.length && references.every(({ status }) => status === 'article-linked')));
      assert.deepEqual(saved.guidance[field].map(({ refs }) => refs.map(({ to }) => to)),
        checked.guidance[field].map(({ references }) => references.map(({ to }) => to)));
    }
  }
  assert.equal(TOPICS.filter(({ guidance }) => !guidance).length, 31);
  assert.equal('guidance' in interpret('difamação').topics[0], false);
});

test('Sourced guidance preserves conditions rather than promising a remedy', () => {
  const text = (id, field) => TOPICS.find((topic) => topic.id === id)[field].join(' ');
  assert.match(text('dados', 'rights'), /Não há apagamento automático/);
  assert.match(text('dados', 'rights'), /eventual prorrogação/);
  assert.match(text('dados', 'rights'), /não atribui automaticamente indemnização/);
  assert.match(text('dados', 'steps'), /estar desatualizado não garante remoção/i);
  assert.match(text('dados', 'arguments'), /não demonstra, por si só, uma isenção/);
  assert.match(text('consumo', 'rights'), /Não é uma garantia de reembolso/);
  assert.match(text('consumo', 'rights'), /condições legais/);
  assert.match(text('administrativo', 'rights'), /casos de dispensa/);
  assert.match(text('administrativo', 'steps'), /distingue suspensão dos efeitos/);
  assert.match(text('administrativo', 'arguments'), /não produz automaticamente anulação/);
});

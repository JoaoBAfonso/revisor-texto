import assert from 'node:assert/strict';
import test from 'node:test';
import { auditKnowledge, repositoryAudit } from './knowledge-audit.mjs';
import { ENTITIES, TOPICS } from './guia.js';
import { LEGAL_SITUATIONS } from './legal-situations.mjs';

const fixture = () => ({
  topics: [{ id: 'rights', area: 'Direitos', note: 'Orientação', rights: ['Direito'], steps: ['Passo'],
    arguments: ['Argumento'], entities: ['service'], refs: ['Norma'],
    deadlines: [{ what: 'Resposta', when: 'Confirmar', base: 'Artigo' }] }],
  entities: { service: { name: 'Serviço', role: 'Informação', url: 'https://example.org' } },
  toolkit: [{ title: 'Ajuda', text: 'Orientação', ent: ['service'] }],
  kit: { FIELDS: { name: 'Nome' }, ANGLES: { rights: [{ title: 'Ângulo', text: 'Contexto', search: ['Pesquisa'] }] },
    TEMPLATES: [{ id: 'request', title: 'Pedido', when: 'Situação', deadline: 'Confirmar', send: 'Enviar',
      topics: ['rights'], fields: ['name'], to: { name: 'Serviço', url: null }, body: (field) => field('name') }] },
  resolve: (text) => ({ to: text === 'Artigo' ? 'law:1' : 'law' }),
  documents: [{ id: 'law', title: 'Diploma', url: 'https://example.org/law' }],
});

test('Audit distinguishes mechanical linkage from legal and situational review', () => {
  const data = fixture();
  const audit = auditKnowledge(data);
  assert.equal(audit.findings.filter(({ kind }) => kind === 'integrity').length, 0);
  assert.equal(audit.topics[0].deadlines[0].reference.status, 'article-linked');
  assert.equal(audit.topics[0].refs[0].status, 'document-linked');
  assert.equal(audit.sources[0].validity, 'not-verified');
  for (const code of ['claim-traceability', 'deadline-context-missing', 'deadline-context-review', 'situation-readiness',
    'template-source-review', 'template-use-review', 'legal-review-not-recorded', 'source-version-review']) {
    assert.ok(audit.findings.some((finding) => finding.code === code), code);
  }
  assert.deepEqual(auditKnowledge(data), audit);
  assert.match(audit.scope, /não certifica/);
});

test('Audit includes context-only sources and retains legal review for contextualised deadlines', () => {
  const data = fixture();
  Object.assign(data.topics[0].deadlines[0], {
    trigger: 'Receção a confirmar', limits: 'Regime e contagem a confirmar', contextRefs: ['Complemento'],
  });
  data.documents.push({ id: 'context', title: 'Outra fonte', url: 'https://example.org/context' });
  data.resolve = (text) => ({ to: text === 'Complemento' ? 'context:2' : text === 'Artigo' ? 'law:1' : 'law' });
  const audit = auditKnowledge(data);
  assert.equal(audit.findings.some(({ code }) => code === 'deadline-context-missing'), false);
  assert.ok(audit.findings.some(({ code }) => code === 'deadline-context-review'));
  assert.equal(audit.topics[0].deadlines[0].contextRefs[0].status, 'article-linked');
  assert.deepEqual(audit.sources.map(({ id }) => id), ['law', 'context']);
  data.topics[0].deadlines[0].contextRefs = ['missing'];
  data.resolve = (text) => ({ to: text === 'missing' ? null : 'law:1' });
  assert.ok(auditKnowledge(data).findings.some(({ code }) => code === 'unresolved-reference'));
});

test('Audit catches exact-reference failures, compound references and broken relationships', () => {
  const data = fixture();
  data.topics[0].refs = ['missing', 'missing-article', 'Lei n.º 1/2000 e Lei n.º 2/2000'];
  data.resolve = (text) => text === 'missing' ? { to: null, why: 'diploma ausente' }
    : text === 'missing-article' ? { to: 'law', why: 'artigo ausente' } : { to: 'law' };
  data.topics[0].entities = ['absent'];
  data.kit.TEMPLATES[0].topics = ['absent'];
  data.kit.TEMPLATES[0].fields = ['absent'];
  data.documents[0].url = 'javascript:alert(1)';
  const audit = auditKnowledge(data);
  const integrity = audit.findings.filter(({ kind }) => kind === 'integrity');
  for (const code of ['unresolved-reference', 'deadline-document-only', 'multiple-reference-review',
    'unknown-entity', 'unknown-topic', 'unknown-field', 'undeclared-field', 'invalid-source-url']) {
    assert.ok(integrity.some((finding) => finding.code === code), code);
  }
  assert.equal(audit.topics[0].refs[1].status, 'unresolved');
  assert.equal(audit.topics[0].refs[1].to, 'law');
});

test('Audit detects missing bases, duplicate IDs, invalid URLs and empty model content', () => {
  const data = fixture();
  data.topics.push(data.topics[0]);
  data.topics[0].deadlines[0].base = '';
  data.entities.service.url = 'not-a-url';
  data.kit.TEMPLATES.push({ ...data.kit.TEMPLATES[0], body: () => '' });
  const audit = auditKnowledge(data);
  for (const code of ['duplicate-topic', 'duplicate-template', 'missing-reference', 'invalid-entity', 'invalid-template-body']) {
    assert.ok(audit.findings.some((finding) => finding.code === code), code);
  }
});

test('Audit checks every sourced orientation without treating references as legal certification', () => {
  const data = fixture();
  data.topics[0].guidance = Object.fromEntries(['rights', 'steps', 'arguments'].map((field) => [field,
    data.topics[0][field].map((text) => ({ text, kind: field === 'steps' ? 'preparation' : 'legal', refs: ['Artigo'] }))]));
  const audit = auditKnowledge(data);
  assert.equal(audit.stats.sourcedTopics, 1);
  assert.equal(audit.stats.sourcedOrientations, 3);
  assert.equal(audit.findings.filter(({ code }) => code === 'guidance-legal-review').length, 3);
  assert.equal(audit.findings.filter(({ owner, code }) => owner === 'topic:rights' && code === 'claim-traceability').length, 0);
  assert.ok(audit.findings.some(({ code }) => code === 'topic-summary-review'));
  data.topics[0].guidance.rights[0].text = 'Divergente';
  data.topics[0].guidance.steps[0].kind = 'certified';
  data.topics[0].guidance.steps[0].refs = [];
  data.topics[0].guidance.arguments[0].refs = ['Norma'];
  const invalid = auditKnowledge(data);
  for (const code of ['invalid-guidance', 'missing-reference', 'guidance-document-only']) {
    assert.ok(invalid.findings.some((finding) => finding.code === code), code);
  }
  data.topics[0].guidance.rights = null;
  data.topics[0].guidance.steps = [];
  assert.ok(auditKnowledge(data).findings.some(({ code }) => code === 'invalid-guidance'));
});

test('Repository diagnostic covers all authored areas and models without certifying them', async () => {
  const audit = await repositoryAudit();
  assert.equal(audit.stats.topics, TOPICS.length);
  assert.equal(audit.stats.entities, Object.keys(ENTITIES).length);
  assert.ok(audit.stats.templates > 0);
  assert.equal(audit.topics.length, audit.stats.topics);
  assert.equal(audit.templates.length, audit.stats.templates);
  assert.ok(audit.sources.length);
  assert.equal(audit.stats.situations, LEGAL_SITUATIONS.length);
  assert.equal(audit.situations.length, LEGAL_SITUATIONS.length);
  assert.ok(audit.situations.every(({ references }) => references.length));
  assert.equal(audit.findings.some(({ code }) => code === 'invalid-situation-source'), false);
  assert.equal(audit.findings.filter(({ code }) => code === 'situation-legal-review').length, LEGAL_SITUATIONS.length);
  assert.ok(audit.findings.every(({ owner, code, kind, message }) => owner && code && message && ['integrity', 'review'].includes(kind)));
  assert.equal(audit.findings.some(({ code }) => code === 'deadline-document-only'), false);
  assert.equal(audit.findings.some(({ code }) => code === 'deadline-context-missing'), false);
  assert.match(audit.limits, /não consulta a rede/);
});

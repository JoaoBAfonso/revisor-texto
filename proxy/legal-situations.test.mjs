import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import { LEGAL_SITUATIONS, SITUATION_SOURCES, SITUATION_PATHS, SITUATION_URGENCY, situationGuidance, situationArticle } from './legal-situations.mjs';
import { ENTITIES, TOPICS } from './guia.js';
import { situationModel, situationModelText } from './legal-situations.mjs';

test('Citizen and journalist situations expose actions, conditions, limits and per-orientation sources', async () => {
  assert.equal(new Set(LEGAL_SITUATIONS.map(({ id }) => id)).size, 6);
  assert.equal(LEGAL_SITUATIONS.filter(({ audience }) => audience === 'citizens').length, 3);
  assert.equal(LEGAL_SITUATIONS.filter(({ audience }) => audience === 'journalists').length, 3);
  for (const situation of LEGAL_SITUATIONS) {
    assert.ok(situation.title && situation.intro && situation.deadlines);
    for (const field of ['confirm', 'proof', 'actions', 'rights', 'entities', 'limits']) assert.ok(situation[field].length, field);
    for (const id of situation.topics) assert.ok(TOPICS.some((topic) => topic.id === id));
    for (const { id, use } of situation.entities) assert.ok(ENTITIES[id] && use);
    for (const { text, refs } of situation.rights) {
      assert.ok(text && refs.length);
      for (const [id, key] of refs) {
        const doc = JSON.parse(await readFile(new URL(`../data/lei/${id}.json`, import.meta.url), 'utf8'));
        const article = situationArticle(doc, id, key);
        assert.equal(article.text, doc.arts.find(({ k }) => k === key).x);
        assert.ok(article.title.includes(SITUATION_SOURCES[id].label));
      }
    }
    assert.equal('templates' in situation, false);
  }
});

test('Situation sources reject wrong diplomas, unexpected origins and non-unique articles', async () => {
  const doc = JSON.parse(await readFile(new URL('../data/lei/cc.json', import.meta.url), 'utf8'));
  const article = doc.arts.find(({ k }) => k === '79');
  for (const change of [{ id: 'other' }, { url: 'https://example.org' }, { url: doc.url.replace('775', '4') },
    { arts: [] }, { arts: [article, article] }, { arts: [{ ...article, x: '' }] }]) {
    assert.throws(() => situationArticle({ ...doc, ...change }, 'cc', '79'));
  }
  assert.throws(() => situationArticle(null, 'cc', '79'));
  assert.throws(() => situationArticle(doc, 'unknown', '79'));
});

test('Safeguards separate obtaining material, publication and professional secrecy', () => {
  const privacy = LEGAL_SITUATIONS.find(({ id }) => id === 'privacy-publication');
  assert.match(privacy.rights[2].text, /Participar numa conversa não significa/);
  assert.match(privacy.actions.join(' '), /obtenção do material/);
  assert.match(privacy.limits.join(' '), /Não aplica integralmente/);
  const sources = LEGAL_SITUATIONS.find(({ id }) => id === 'source-protection');
  assert.match(sources.actions.join(' '), /não ignores convocatórias/);
  assert.match(sources.proof.join(' '), /Não alteres ou destruas prova/);
  assert.match(sources.limits.join(' '), /Não garante sigilo absoluto/);
  assert.match(LEGAL_SITUATIONS[0].limits.join(' '), /são posições diferentes/);
});

test('Citizen safeguards distinguish administrative acts, data rights and consumer regimes', () => {
  const admin = LEGAL_SITUATIONS.find(({ id }) => id === 'administrative-decision');
  assert.match(admin.confirm.join(' '), /regime específico/);
  assert.match(admin.rights[0].text, /sujeito a exceções/);
  assert.match(admin.actions.join(' '), /não deixes decorrer um prazo/);
  assert.match(admin.limits.join(' '), /suspensão de efeitos ou de prazos/);
  assert.ok(admin.rights.some(({ refs }) => refs.some(([id]) => id === 'cpta')));
  const data = LEGAL_SITUATIONS.find(({ id }) => id === 'personal-data-use');
  assert.match(data.rights[1].text, /não é um direito automático/);
  assert.match(data.rights[2].text, /não comprova uma infração/);
  assert.match(data.deadlines, /Não se calcula aqui atraso/);
  assert.match(data.limits.join(' '), /jornalismo/);
  const consumer = LEGAL_SITUATIONS.find(({ id }) => id === 'consumer-problem');
  assert.match(consumer.confirm[0], /entre particulares/);
  assert.match(consumer.limits.join(' '), /não é aplicado automaticamente a qualquer serviço/);
  assert.match(consumer.limits.join(' '), /Não afirma que todas as compras podem ser devolvidas em 14 dias/);
  assert.match(consumer.actions.join(' '), /não equivale a uma decisão de reembolso/);
});

test('All guided alternatives and urgency states retain preparation limits without changing fichas', () => {
  const before = JSON.stringify(LEGAL_SITUATIONS);
  assert.deepEqual(Object.keys(SITUATION_PATHS).sort(), LEGAL_SITUATIONS.map(({ id }) => id).sort());
  let combinations = 0;
  for (const { id } of LEGAL_SITUATIONS) {
    const path = SITUATION_PATHS[id];
    assert.ok(path.question);
    assert.equal(new Set(path.options.map(([value]) => value)).size, path.options.length);
    assert.equal(path.options[0][0], 'unknown');
    assert.deepEqual(situationGuidance(id), situationGuidance(id, { kind: 'unknown', urgency: 'unknown' }));
    for (const [kind, label, title, action] of path.options) {
      assert.ok(label && title && action);
      for (const [urgency, , text] of SITUATION_URGENCY) {
        const result = situationGuidance(id, { kind, urgency });
        assert.equal(result.title, title);
        assert.equal(result.action, action);
        assert.equal(result.urgency, text);
        assert.match(result.limit, /não confirmação de factos ou decisão jurídica/);
        assert.equal('outcome' in result, false);
        assert.equal('deadlineDate' in result, false);
        combinations++;
      }
    }
  }
  assert.equal(combinations, 100);
  assert.equal(JSON.stringify(LEGAL_SITUATIONS), before);
});

test('Guidance explicitly rejects invalid active choices and ignores unused values', () => {
  const id = 'consumer-problem';
  for (const answers of [null, [], { kind: 'invalid' }, { urgency: 'invalid' }]) assert.throws(() => situationGuidance(id, answers), /inválid/);
  assert.throws(() => situationGuidance('invalid'), /inválido/);
  assert.deepEqual(situationGuidance(id, { source: 'secret', other: 'unused' }), situationGuidance(id));
  assert.match(situationGuidance(id, { kind: 'withdraw' }).action, /Não há aqui direito geral/);
  assert.match(situationGuidance('administrative-decision', { kind: 'execution' }).action, /suspensão automática/);
  assert.match(situationGuidance('source-protection', { kind: 'search', urgency: 'immediate' }).action, /nem alteres ou destruas prova/);
  assert.match(situationGuidance('personal-data-use', { kind: 'erase' }).action, /condições e exceções/);
  assert.match(situationGuidance('privacy-publication', { kind: 'obtaining' }).action, /não demonstra/);
  assert.match(situationGuidance('publication-challenged', { kind: 'reply' }).action, /não uses como resposta um modelo/);
});

test('Only matching data and goods objectives without indicated urgency offer models', () => {
  let available = 0;
  for (const { id } of LEGAL_SITUATIONS) {
    for (const [kind] of SITUATION_PATHS[id].options) for (const [urgency] of SITUATION_URGENCY) {
      const selection = situationModel(id, { kind, urgency });
      const expected = urgency === 'none' && ((id === 'personal-data-use' && ['access', 'rectify'].includes(kind))
        || (id === 'consumer-problem' && kind === 'goods'));
      assert.equal(selection.available, expected);
      if (expected) {
        available++;
        assert.ok(selection.conditions.length >= 3 && selection.exclusions.length >= 2);
        assert.ok(['rgpd', 'consumo'].includes(selection.template));
      } else assert.ok(selection.reason);
    }
  }
  assert.equal(available, 3);
  assert.throws(() => situationModel('invalid'), /inválido/);
  assert.throws(() => situationModel('consumer-problem', { kind: 'invalid' }), /inválida/);
});

test('Guided drafts reuse existing templates but select one data right without threats or invented dates', async () => {
  const context = { window: {} };
  runInNewContext(await readFile(new URL('../modelos.js', import.meta.url), 'utf8'), context);
  const kit = context.window.LAW_KIT;
  const access = situationModelText(situationModel('personal-data-use', { kind: 'access', urgency: 'none' }), kit);
  const rectify = situationModelText(situationModel('personal-data-use', { kind: 'rectify', urgency: 'none' }), kit);
  assert.match(access, /artigo 15.º/);
  assert.doesNotMatch(access, /art\. 16|Apagamento|Oposição|será apresentada queixa/);
  assert.match(rectify, /artigo 16.º/);
  assert.doesNotMatch(rectify, /artigo 15|Apagamento|Oposição|será apresentada queixa/);
  for (const text of [access, rectify]) {
    assert.match(text, /eventual prorrogação/);
    assert.match(text, /\[Data e assinatura\]/);
    assert.doesNotMatch(text, /undefined/);
  }
  const goods = situationModelText(situationModel('consumer-problem', { kind: 'goods', urgency: 'none' }), kit);
  assert.match(goods, /84\/2021/);
  assert.match(goods, /\[a reparação/);
  const legacy = kit.TEMPLATES.find(({ id }) => id === 'rgpd').body((key) => `[${key}]`, { today: '[data]' });
  assert.match(legacy, /artigos 15.º a 21.º/);
  assert.match(legacy, /será apresentada queixa/);
  assert.throws(() => situationModelText({ available: false }, kit), /indisponível/);
  assert.throws(() => situationModelText({ available: true, template: 'missing' }, kit), /carregar/);
});

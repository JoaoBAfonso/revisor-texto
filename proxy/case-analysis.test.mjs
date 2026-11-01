import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const code = await readFile(new URL('../case-analysis.js', import.meta.url), 'utf8');
const { analyseAccess, accessQuestionKeys, legalPassages, legalArticle, contextualDecision } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const unknown = { entity: 'unknown', document: 'unknown', written: 'unknown', restricted: 'unknown',
  thirdParty: 'unknown', authorization: 'unknown', partial: 'unknown', outcome: 'unknown',
  environment: 'no', regime: 'common', sensitive: 'yes', health: 'no', interest: 'no', location: 'unknown', reason: 'other' };

test('unknown facts remain unresolved and invalid facts are explicit errors', () => {
  const result = analyseAccess(unknown);
  assert.equal(result.missing.length, 6);
  assert.equal(result.issues.find((issue) => issue.id === 'scope').status, 'Por confirmar');
  assert.equal(result.issues.find((issue) => issue.id === 'personal').status, 'Facto desconhecido');
  assert.throws(() => analyseAccess({ ...unknown, entity: 'maybe' }), /Resposta inválida/);
  assert.throws(() => analyseAccess(null), /Resposta inválida/);
});

test('restrictions, authorisation and partial disclosure produce conditional competing positions', () => {
  const result = analyseAccess({ ...unknown, entity: 'yes', document: 'yes', written: 'yes',
    restricted: 'yes', thirdParty: 'yes', authorization: 'yes', partial: 'yes', outcome: 'refused' });
  assert.match(result.issues.find((issue) => issue.id === 'personal').argument, /pode sustentar/);
  assert.match(result.issues.find((issue) => issue.id === 'partial').argument, /sempre que seja possível/);
  assert.ok(result.next.some((step) => step.includes('CADA')));
  assert.ok(result.issues.every((issue) => issue.argument && issue.objection && issue.evidence && issue.refs.length));
  assert.equal(result.missing.length, 0);
});

test('questions follow the relevant branches and inactive answers are ignored', () => {
  const facts = { ...unknown, entity: 'yes', document: 'yes', written: 'yes',
    thirdParty: 'no', restricted: 'no', outcome: 'pending' };
  const keys = accessQuestionKeys(facts);
  for (const key of ['authorization', 'interest', 'partial', 'reason', 'location']) assert.ok(!keys.includes(key));
  assert.deepEqual(analyseAccess({ ...facts, authorization: 'yes', reason: 'personal', partial: 'yes' }),
    analyseAccess(facts));
  assert.ok(accessQuestionKeys({ ...facts, thirdParty: 'yes', authorization: 'no' }).includes('interest'));
  assert.ok(accessQuestionKeys({ ...facts, document: 'no', outcome: 'refused' }).includes('location'));
  assert.ok(accessQuestionKeys({ ...facts, outcome: 'refused' }).includes('reason'));
});

test('environmental or unclassified requests do not inherit common-regime deadlines', () => {
  for (const environment of ['yes', 'unknown']) {
    const result = analyseAccess({ ...unknown, entity: 'yes', document: 'yes', environment, outcome: 'refused' });
    assert.equal(result.deadlines.length, 0);
    assert.equal(result.limited, true);
    assert.ok(result.issues.every((issue) => issue.application === 'blocked' && issue.refs.includes(17)));
    assert.ok(!result.next.some((step) => step.includes('Se ponderas queixa')));
  }
});

test('replies recognise legitimate limits, referral and preparatory-document deferral', () => {
  const facts = { ...unknown, entity: 'yes', document: 'yes', written: 'yes', restricted: 'yes',
    thirdParty: 'yes', authorization: 'no', partial: 'yes', outcome: 'refused' };
  const result = analyseAccess({ ...facts, reason: 'preparatory' });
  assert.ok(result.issues.every((issue) => issue.reply && issue.replyLimit));
  assert.match(result.issues.find((issue) => issue.id === 'restriction').replyLimit, /primeiro evento/);
  assert.match(result.issues.find((issue) => issue.id === 'partial').replyLimit, /revelar a informação protegida/);
  const referral = analyseAccess({ ...facts, document: 'no', location: 'elsewhere', reason: 'absent' });
  assert.match(referral.issues.find((issue) => issue.id === 'existing').conclusion, /remessa/);
  const create = analyseAccess({ ...facts, document: 'no', location: 'create' });
  assert.match(create.issues.find((issue) => issue.id === 'existing').conclusion, /não obriga a criar/);
});

test('ordinary access excludes irrelevant personal-data branches and never calculates deadlines', () => {
  const result = analyseAccess({ ...unknown, entity: 'yes', document: 'yes', written: 'no',
    restricted: 'no', thirdParty: 'no', partial: 'no', outcome: 'not-sent' });
  assert.ok(!result.issues.some((issue) => ['personal', 'restriction', 'partial'].includes(issue.id)));
  assert.ok(result.next.some((step) => step.includes('Prepara um pedido')));
  assert.match(result.deadlines[0].text, /prorrogação/);
  assert.match(result.deadlines[1].text, /não são calculados/);
});

test('all LADA grounds link to existing corpus articles', async () => {
  const doc = JSON.parse(await readFile(new URL('../data/lei/d75177807.json', import.meta.url), 'utf8'));
  const keys = new Set(doc.arts.map((article) => article.k));
  for (const facts of [unknown, { ...unknown, outcome: 'refused', thirdParty: 'yes', authorization: 'yes' },
    { ...unknown, environment: 'yes' }]) {
    const result = analyseAccess(facts);
    for (const ref of [...result.issues.flatMap((issue) => issue.refs), ...result.deadlines.map((item) => item.ref)]) {
      assert.ok(keys.has(String(ref)), `Missing LADA article ${ref}`);
    }
  }
});

test('declared interest changes the reply but never guarantees personal-data access', () => {
  const facts = { ...unknown, entity: 'yes', document: 'yes', written: 'yes', restricted: 'yes',
    thirdParty: 'yes', authorization: 'no', partial: 'yes', outcome: 'refused' };
  const noInterest = analyseAccess({ ...facts, interest: 'no' }).issues.find((issue) => issue.id === 'personal');
  const withInterest = analyseAccess({ ...facts, interest: 'yes' }).issues.find((issue) => issue.id === 'personal');
  assert.notEqual(withInterest.reply, noInterest.reply);
  assert.match(withInterest.reply, /Explica o direito/);
  assert.match(withInterest.replyLimit, /não garantem a entrega/);
  const unknownInterest = analyseAccess({ ...facts, interest: 'unknown' }).issues.find((issue) => issue.id === 'personal');
  assert.equal(unknownInterest.application, 'unresolved');
});

test('the authority invoking personal data triggers review even if requester says there are none', () => {
  const result = analyseAccess({ ...unknown, entity: 'yes', document: 'yes', written: 'yes',
    restricted: 'no', thirdParty: 'no', outcome: 'refused', reason: 'personal' });
  assert.ok(result.issues.some((issue) => issue.id === 'restriction'));
  assert.match(result.issues.find((issue) => issue.id === 'personal').conclusion, /Confirma primeiro/);
});

test('contradictory submission answers suspend every application', () => {
  const result = analyseAccess({ ...unknown, entity: 'yes', document: 'yes', written: 'yes', outcome: 'not-sent' });
  assert.equal(result.contradictions.length, 1);
  assert.deepEqual(result.contradictions[0].keys, ['written', 'outcome']);
  assert.ok(result.issues.every((issue) => issue.application === 'blocked'));
  assert.ok(result.next[0].includes('Corrige'));
  assert.equal(result.limited, true);
});

test('verbal refusal is not falsely classified as contradictory', () => {
  const result = analyseAccess({ ...unknown, entity: 'yes', document: 'yes', written: 'no', outcome: 'refused' });
  assert.equal(result.contradictions.length, 0);
  assert.match(result.issues.find((issue) => issue.id === 'request').conclusion, /recusa de pedido verbal registada por escrito/);
});

test('negative scope and unknown scope block dependent applications with distinct reasons', () => {
  for (const entity of ['no', 'unknown']) {
    const result = analyseAccess({ ...unknown, entity, document: 'yes', written: 'yes', outcome: 'refused' });
    assert.ok(result.issues.filter((issue) => issue.id !== 'scope').every((issue) => issue.application === 'blocked'));
    assert.ok(!result.next.some((step) => step.includes('Se ponderas queixa')));
    const existing = result.issues.find((issue) => issue.id === 'existing');
    assert.match(existing.blockers.join(' '), entity === 'no' ? /não prova que esteja fora/ : /Falta saber/);
  }
});

test('negative existence or possession does not imply a duty to create a document', () => {
  const result = analyseAccess({ ...unknown, entity: 'yes', document: 'no', written: 'yes', outcome: 'refused' });
  const existing = result.issues.find((issue) => issue.id === 'existing');
  assert.equal(existing.application, 'blocked');
  assert.match(existing.blockers.join(' '), /não obriga a criar/);
  assert.ok(result.next.some((step) => step.includes('quem o detém')));
  assert.ok(!result.next.some((step) => step.includes('Se ponderas queixa')));
});

test('every chain exposes exact declared facts, requirements, evidence and conditional conclusion', () => {
  const facts = { ...unknown, entity: 'yes', document: 'yes', written: 'yes', restricted: 'yes',
    thirdParty: 'yes', authorization: 'no', partial: 'no', outcome: 'refused' };
  const result = analyseAccess(facts);
  for (const issue of result.issues) {
    assert.ok(issue.requirements && issue.evidence && issue.conclusion && issue.refs.length);
    assert.ok(issue.facts.every((fact) => fact.value === facts[fact.key] && fact.question && fact.answer));
    assert.equal(issue.application, 'conditional');
  }
  assert.match(result.issues.find((issue) => issue.id === 'personal').conclusion, /outra base legal/);
  assert.match(result.issues.find((issue) => issue.id === 'partial').conclusion, /não prova que uma recusa total seja legal/);
  const unanswered = analyseAccess({ ...facts, partial: 'unknown' }).issues.find((issue) => issue.id === 'partial');
  assert.equal(unanswered.application, 'unresolved');
  assert.notEqual(unanswered.conclusion, result.issues.find((issue) => issue.id === 'partial').conclusion);
});

test('refusal scenarios select relevant replies and next steps without assuming a successful challenge', () => {
  const facts = { ...unknown, entity: 'yes', document: 'yes', written: 'yes', restricted: 'no',
    thirdParty: 'no', outcome: 'refused' };
  const scenarios = [
    ['imprecise', /Especifica assunto/, /artigo 12/],
    ['absent', /remeter o pedido/, /artigo 15/],
    ['personal', /fundamentação escrita/, /artigo 6/],
    ['secret', /fundamentação escrita/, /lei específica/],
    ['preparatory', /fundamentação escrita/, /artigo 6/],
    ['unknown', /resposta completa/, /todos os fundamentos/],
    ['other', /todas as razões/, /todos os fundamentos/],
  ];
  for (const [reason, reply, next] of scenarios) {
    const report = analyseAccess({ ...facts, reason });
    const request = report.issues.find((issue) => issue.id === 'request');
    assert.match(request.reply, reply, reason);
    assert.match(report.next.join(' '), next, reason);
    assert.ok(request.replyLimit, reason);
  }
});

test('disputed possession requires evidence and is not a user contradiction', () => {
  const report = analyseAccess({ ...unknown, entity: 'yes', document: 'yes', written: 'yes',
    restricted: 'no', thirdParty: 'no', outcome: 'refused', reason: 'absent' });
  assert.equal(report.contradictions.length, 0);
  const existing = report.issues.find((issue) => issue.id === 'existing');
  assert.equal(existing.application, 'blocked');
  assert.match(existing.blockers.join(' '), /versões diferentes/);
  assert.ok(existing.refs.includes(15));
});

test('authority restrictions activate partial disclosure even when requester reports no protected content', () => {
  for (const reason of ['personal', 'secret', 'preparatory']) {
    const facts = { ...unknown, entity: 'yes', document: 'yes', written: 'yes',
      restricted: 'no', thirdParty: 'no', outcome: 'refused', reason, partial: 'unknown' };
    assert.ok(accessQuestionKeys(facts).includes('partial'));
    const issue = analyseAccess(facts).issues.find((item) => item.id === 'partial');
    assert.equal(issue.application, 'unresolved');
  }
});

test('no refusal means no automatic request for refusal grounds', () => {
  const facts = { ...unknown, entity: 'yes', document: 'yes', written: 'yes',
    restricted: 'no', thirdParty: 'no' };
  for (const outcome of ['pending', 'extended', 'granted']) {
    const request = analyseAccess({ ...facts, outcome }).issues.find((issue) => issue.id === 'request');
    assert.doesNotMatch(request.reply, /fundamentação escrita|razões da recusa/);
  }
  assert.match(analyseAccess({ ...facts, outcome: 'granted' }).issues.find((issue) => issue.id === 'request').reply, /legíveis/);
});

test('selected legal passages are exact corpus transcriptions for every supported branch', async () => {
  const doc = JSON.parse(await readFile(new URL('../data/lei/d75177807.json', import.meta.url), 'utf8'));
  for (const reason of ['personal', 'secret', 'preparatory', 'absent', 'imprecise', 'unknown', 'other']) {
    for (const environment of ['yes', 'no']) {
      const report = analyseAccess({ ...unknown, entity: 'yes', document: 'yes', written: 'yes',
        restricted: 'yes', thirdParty: 'yes', authorization: 'no', partial: 'yes', outcome: 'refused', reason, environment });
      for (const issue of report.issues) {
        const passages = legalPassages(doc, issue.grounds);
        assert.equal(passages.length, issue.grounds.length);
        for (const passage of passages) {
          assert.ok(doc.arts.find((article) => article.k === String(passage.article)).x.includes(passage.text));
          assert.ok(passage.text.startsWith(`${passage.paragraph} - `));
          assert.equal(passage.url, doc.url);
        }
      }
    }
  }
  const extended = analyseAccess({ ...unknown, outcome: 'extended' }).issues.find((issue) => issue.id === 'request');
  assert.match(legalPassages(doc, extended.grounds)[0].text, /máximo de dois meses/);
  assert.throws(() => legalPassages({ ...doc, id: 'other' }, [[6, 8]]), /identificação/);
  assert.throws(() => legalPassages(doc, [[6, 99]]), /Não foi possível verificar/);
  assert.throws(() => legalPassages({ ...doc, arts: [] }, [[6, 8]]), /Não foi possível verificar/);
});

test('special or unidentified regimes suspend common advice without declaring access prohibited', async () => {
  const doc = JSON.parse(await readFile(new URL('../data/lei/d75177807.json', import.meta.url), 'utf8'));
  const facts = { ...unknown, entity: 'yes', document: 'yes', written: 'yes', outcome: 'refused' };
  for (const regime of ['unknown', 'procedure', 'investigation', 'registry', 'protected', 'other']) {
    const report = analyseAccess({ ...facts, regime });
    assert.equal(report.limited, true, regime);
    assert.deepEqual(report.deadlines, [], regime);
    assert.ok(report.issues.every((issue) => issue.application === 'blocked'), regime);
    assert.ok(!report.next.some((step) => step.includes('Se ponderas queixa')), regime);
    assert.ok(report.issues.every((issue) => issue.grounds.some(([article, paragraph]) => article === 1 && paragraph === 4)));
    for (const issue of report.issues) legalPassages(doc, issue.grounds);
    const pending = analyseAccess({ ...facts, regime, written: 'no', outcome: 'pending' });
    assert.ok(!pending.next.some((step) => /artigos 12.º e 13.º|artigo 15.º/.test(step)), regime);
  }
  const both = analyseAccess({ ...facts, regime: 'procedure', environment: 'yes' });
  assert.deepEqual(both.issues[0].grounds, [[1, 1], [4, 4], [1, 4]]);
  assert.throws(() => analyseAccess({ ...facts, regime: 'invalid' }), /Resposta inválida: regime/);
  assert.throws(() => analyseAccess({ ...facts, regime: undefined }), /Resposta inválida: regime/);
  assert.equal(analyseAccess(facts).limited, false);
});

test('nominative-data presumption concerns grounds only, not automatic access', () => {
  const facts = { ...unknown, entity: 'yes', document: 'yes', written: 'yes', restricted: 'yes',
    thirdParty: 'yes', authorization: 'no', interest: 'no', partial: 'yes', outcome: 'refused', reason: 'personal' };
  const ordinary = analyseAccess({ ...facts, sensitive: 'no' }).issues.find((issue) => issue.id === 'personal');
  assert.match(ordinary.argument, /não indicares outro fundamento/);
  assert.match(ordinary.replyLimit, /não à autorização de acesso/);
  assert.match(ordinary.conclusion, /não garante/);
  const sensitive = analyseAccess({ ...facts, sensitive: 'yes' }).issues.find((issue) => issue.id === 'personal');
  assert.match(sensitive.replyLimit, /não significa proibição automática/);
  assert.match(sensitive.conclusion, /não beneficia/);
  const unanswered = analyseAccess({ ...facts, sensitive: 'unknown' }).issues.find((issue) => issue.id === 'personal');
  assert.equal(unanswered.application, 'unresolved');
  assert.match(unanswered.argument, /não podemos avaliar/);
  assert.deepEqual(ordinary.grounds, [[6, 5], [6, 9]]);
});

test('data-category branch is ignored without third-party data and cannot bypass scope gates', () => {
  const facts = { ...unknown, entity: 'yes', document: 'yes', written: 'yes',
    restricted: 'no', thirdParty: 'no', outcome: 'pending' };
  assert.ok(!accessQuestionKeys(facts).includes('sensitive'));
  assert.deepEqual(analyseAccess({ ...facts, sensitive: 'no' }), analyseAccess({ ...facts, sensitive: 'invalid' }));
  for (const overrides of [{ regime: 'protected' }, { environment: 'yes' }, { entity: 'unknown' }, { document: 'unknown' },
    { written: 'yes', outcome: 'not-sent' }]) {
    const issue = analyseAccess({ ...facts, restricted: 'yes', thirdParty: 'yes', authorization: 'no',
      sensitive: 'no', interest: 'no', partial: 'yes', ...overrides }).issues.find((item) => item.id === 'personal');
    assert.equal(issue.application, 'blocked');
    assert.doesNotMatch(issue.conclusion, /Pode ser relevante a presunção/);
  }
});

test('dossier records support without treating documents as verified facts', () => {
  const facts = { ...unknown, entity: 'yes', document: 'yes', written: 'yes',
    restricted: 'no', thirdParty: 'no', outcome: 'pending' };
  const report = analyseAccess(facts, { entity: 'document', document: 'disputed', written: 'claim', outcome: 'none' });
  assert.equal(report.dossier.find((item) => item.key === 'entity').state, 'document');
  assert.equal(report.dossier.find((item) => item.key === 'document').state, 'disputed');
  assert.equal(report.dossier.find((item) => item.key === 'written').answer, 'Sim');
  assert.ok(report.issues.find((issue) => issue.id === 'existing').proof.some((item) => item.state === 'disputed'));
  assert.equal(report.issues.find((issue) => issue.id === 'existing').application, 'blocked');
  assert.equal(report.contradictions.length, 0);
  assert.deepEqual(analyseAccess(facts, { document: 'document' }).issues.map((issue) => issue.conclusion),
    analyseAccess(facts).issues.map((issue) => issue.conclusion));
  assert.throws(() => analyseAccess(facts, { document: 'verified' }), /Estado da prova inválido/);
  assert.throws(() => analyseAccess(facts, null), /Dossiê de prova inválido/);
  assert.deepEqual(analyseAccess(facts, { authorization: 'invalid' }), analyseAccess(facts));
});

test('scenario comparisons expose alternatives and decisive evidence without choosing a result', () => {
  const facts = { ...unknown, entity: 'yes', document: 'yes', written: 'yes',
    restricted: 'yes', thirdParty: 'no', partial: 'unknown', outcome: 'pending' };
  const report = analyseAccess(facts);
  assert.deepEqual(report.scenarios.map((item) => item.id), ['location', 'response', 'separation']);
  for (const scenario of report.scenarios) {
    assert.ok(scenario.question && scenario.refs.length);
    assert.equal(scenario.branches.length, 3);
    assert.ok(scenario.branches.every(([condition, consequence]) => condition && consequence));
    assert.equal('selected' in scenario, false);
  }
  const supported = analyseAccess(facts, { document: 'document' });
  assert.ok(!supported.scenarios.some((item) => item.id === 'location'));
  const disputed = analyseAccess({ ...facts, outcome: 'refused', reason: 'absent' }, { document: 'document' });
  assert.ok(disputed.scenarios.some((item) => item.id === 'location'));
});

test('declared evidence never overrides special regimes, contradictions or unknown facts', () => {
  const facts = { ...unknown, entity: 'yes', document: 'yes', written: 'yes', outcome: 'pending' };
  const evidence = { entity: 'document', document: 'document', written: 'document', outcome: 'document' };
  for (const overrides of [{ regime: 'procedure' }, { environment: 'yes' }, { outcome: 'not-sent' }]) {
    const report = analyseAccess({ ...facts, ...overrides }, evidence);
    assert.deepEqual(report.scenarios, []);
    assert.ok(report.issues.every((issue) => issue.application === 'blocked'));
  }
  const unanswered = analyseAccess({ ...facts, document: 'unknown' }, evidence);
  assert.equal(unanswered.issues.find((issue) => issue.id === 'existing').application, 'blocked');
});

test('comparison references exist in the corpus', async () => {
  const doc = JSON.parse(await readFile(new URL('../data/lei/d75177807.json', import.meta.url), 'utf8'));
  const report = analyseAccess({ ...unknown, entity: 'yes', document: 'no', location: 'elsewhere',
    restricted: 'yes', partial: 'unknown', outcome: 'pending' });
  for (const scenario of report.scenarios) {
    assert.ok(scenario.refs.every((ref) => doc.arts.some((article) => article.k === String(ref))));
  }
});

test('full article reading preserves corpus text and rejects unverifiable sources', async () => {
  const doc = JSON.parse(await readFile(new URL('../data/lei/d75177807.json', import.meta.url), 'utf8'));
  for (const article of [1, 3, 4, 5, 6, 12, 13, 15, 16, 17, 18]) {
    const original = doc.arts.find((item) => item.k === String(article));
    const result = legalArticle(doc, article);
    assert.equal(result.text, original.x);
    assert.equal(result.title, original.t);
    assert.equal(result.url, doc.url);
  }
  assert.throws(() => legalArticle({ ...doc, id: 'other' }, 6), /identificação/);
  assert.throws(() => legalArticle({ ...doc, url: 'https://example.org' }, 6), /identificação/);
  assert.throws(() => legalArticle(doc, 99), /Não foi possível verificar/);
  assert.throws(() => legalArticle({ ...doc, arts: [...doc.arts, doc.arts.find((item) => item.k === '6')] }, 6),
    /Não foi possível verificar/);
  assert.throws(() => legalArticle({ ...doc, arts: [{ k: '6', x: ' ' }] }, 6), /Não foi possível verificar/);
});

test('contextual decisions preserve exact local excerpts and disclose missing outcomes', async () => {
  for (const [id, file] of [['existing', 'cpta'], ['health', 'rgpd']]) {
    const corpus = JSON.parse(await readFile(new URL(`../data/juris/${file}.json`, import.meta.url), 'utf8'));
    const result = contextualDecision(corpus, id);
    const original = corpus.acs.find((item) => item.p === result.process);
    assert.ok(result.excerpts.every((text) => original.s.includes(text)));
    assert.match(result.outcome, /não regista o dispositivo/);
    assert.ok(result.context && result.argument && result.objection && result.check && result.limit);
    assert.equal(result.url, `http://www.dgsi.pt${original.u}`);
    for (const change of [{ p: 'other' }, { d: '2000-01-01' }, { t: 'other' }, { s: '' }]) {
      assert.throws(() => contextualDecision({ acs: [{ ...original, ...change }] }, id), /não corresponde/);
    }
    assert.throws(() => contextualDecision({ acs: [original, original] }, id), /não corresponde/);
  }
  assert.throws(() => contextualDecision(null, 'existing'), /inválida/);
  assert.throws(() => contextualDecision({ acs: [] }, 'missing'), /inválida/);
});

test('decision suggestions are thematic and never remove factual or regime gates', () => {
  const facts = { ...unknown, entity: 'yes', document: 'unknown', thirdParty: 'yes', sensitive: 'yes', authorization: 'no' };
  const report = analyseAccess(facts);
  assert.deepEqual(report.issues.find((item) => item.id === 'existing').decisions, ['existing']);
  assert.equal(report.issues.find((item) => item.id === 'existing').application, 'blocked');
  assert.deepEqual(report.issues.find((item) => item.id === 'personal').decisions, []);
  const health = analyseAccess({ ...facts, health: 'yes', healthWill: 'known', medical: 'no' });
  assert.deepEqual(health.issues.find((item) => item.id === 'health').decisions, ['health']);
  for (const overrides of [{ environment: 'yes' }, { regime: 'investigation' }, { entity: 'unknown' },
    { written: 'yes', outcome: 'not-sent' }]) {
    assert.ok(analyseAccess({ ...facts, ...overrides }).issues.every((item) => item.decisions.length === 0));
  }
  for (const overrides of [{ sensitive: 'unknown' }, { sensitive: 'no' }, { authorization: 'yes' }, { thirdParty: 'no' }]) {
    assert.ok(analyseAccess({ ...facts, ...overrides }).issues.every((item) => !item.decisions.includes('health')));
  }
});

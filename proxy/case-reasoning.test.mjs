import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const code = await readFile(new URL('../case-analysis.js', import.meta.url), 'utf8');
const { analyseAccess, legalPassages, accessReportText, accessReportPrintHtml, decisionComparison } = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const law = JSON.parse(await readFile(new URL('../data/lei/d75177807.json', import.meta.url), 'utf8'));
const base = {
  regime: 'common', environment: 'no', entity: 'yes', document: 'yes', written: 'yes',
  restricted: 'no', thirdParty: 'no', sensitive: 'unknown', health: 'no', authorization: 'unknown',
  interest: 'unknown', partial: 'unknown', outcome: 'pending', reason: 'unknown', location: 'unknown',
};
const personal = { restricted: 'yes', thirdParty: 'yes', sensitive: 'yes',
  authorization: 'no', interest: 'yes', partial: 'yes', outcome: 'refused', reason: 'personal' };

test('Text report retains conclusions, sources, proof and gates across regimes', () => {
  const variants = [
    {}, personal, { regime: 'protected' }, { document: 'unknown' },
    { written: 'yes', outcome: 'not-sent' },
    { ...personal, health: 'yes', healthWill: 'doctor', medical: 'no' },
    { ...personal, reasons: ['personal', 'secret', 'absent'] },
    { regime: 'procedure', procedureKind: 'progress', directInterest: 'yes' },
    { regime: 'procedure', procedureKind: 'certificate', directInterest: 'yes', certificateElements: 'yes', computerized: 'yes' },
    { regime: 'procedure', procedureKind: 'consult', directInterest: 'no', legitimateInterest: 'yes',
      interestProof: 'yes', interestDecision: 'pending' },
    { environment: 'yes', environmentalKind: 'emissions', outcome: 'refused', environmentalReason: 'commercial',
      environmentalReasons: ['commercial', 'security'], partial: 'yes',
      environmentalAssessment: { benefit: 'health', harm: { commercial: 'document', security: 'disputed' } } },
  ];
  for (const overrides of variants) {
    const input = { ...base, ...overrides };
    for (const evidence of [{}, { document: 'disputed', written: 'document' }]) {
      const report = analyseAccess(input, evidence);
      const text = accessReportText(input, evidence);
      assert.equal(accessReportText(input, evidence), text);
      assert.doesNotMatch(text, /undefined|\[object Object\]|: null/);
      assert.match(text, /não foram verificados ou autenticados/);
      assert.match(text, /sem IA nem envio/);
      assert.match(text, /partilha-a com cuidado/);
      assert.ok(text.includes(report.summary.position || 'Não há tese ou réplica aplicável'));
      for (const issue of report.issues) {
        assert.ok(text.includes(issue.title));
        for (const blocker of issue.blockers) assert.ok(text.includes(blocker));
      }
      for (const issue of report.refusalGrounds?.flatMap(({ issues }) => issues) || report.issues) {
        for (const field of ['argument', 'objection', 'reply', 'replyLimit', 'requirements', 'conclusion', 'evidence']) {
          assert.ok(text.includes(issue[field]), field);
        }
        for (const ref of issue.refs) assert.ok(text.includes(`artigo ${ref}.º`));
      }
      for (const entry of report.environmentalBalance || []) {
        for (const field of ['benefit', 'support', 'argument', 'objection', 'verify', 'separation', 'limit']) assert.ok(text.includes(entry[field]));
      }
      for (const item of report.dossier) assert.ok(text.includes(`${item.title}: ${item.label}`));
      for (const { text: deadline } of report.deadlines) assert.ok(text.includes(deadline));
      for (const task of report.roadmap) assert.ok(text.includes(task.question));
      assert.ok(text.includes(report.law === 'cpa' ? 'PGDL, não publicação oficial' : 'Ligação oficial DRE'));
      assert.equal(text.includes('nid=2248'), report.law === 'cpa');
    }
  }
});

test('Decision comparison distinguishes thematic contact, differences and unverified contexts', () => {
  for (const [overrides, state] of [[{}, 'contact'], [{ document: 'no', location: 'create' }, 'difference'],
    [{ document: 'unknown' }, 'unknown'], [{ document: 'no', location: 'elsewhere' }, 'unknown']]) {
    const input = { ...base, ...overrides };
    const before = analyseAccess(input);
    const comparison = decisionComparison(input, 'existing');
    assert.equal(comparison.rows[0].state, state);
    assert.deepEqual(comparison.blockers, before.issues.find(({ id }) => id === 'existing').blockers);
    assert.deepEqual(analyseAccess(input), before);
    assert.match(comparison.warning, /Não significa equivalência factual/);
    assert.equal('score' in comparison, false);
    for (const row of comparison.rows) {
      assert.ok(row.local && row.declared && row.verify);
      assert.ok(accessReportText(input).includes(row.declared));
    }
  }
  const input = { ...base, ...personal, health: 'yes', healthWill: 'known' };
  const health = decisionComparison(input, 'health', { document: 'disputed' });
  assert.equal(health.application, 'blocked');
  assert.equal(health.rows[0].state, 'contact');
  assert.equal(health.rows[1].state, 'unknown');
  assert.equal(health.rows[2].state, 'unknown');
  assert.match(health.rows[2].declared, /Não se presume/);
  assert.match(health.limit, /Lei n.º 12\/2005/);
  assert.ok(health.blockers.length);
  for (const overrides of [{ authorization: 'yes' }, { regime: 'protected' }, { health: 'unknown' },
    { environment: 'yes' }, { thirdParty: 'no' }]) {
    assert.throws(() => decisionComparison({ ...input, ...overrides }, 'health'), /não está selecionada/);
  }
  assert.throws(() => decisionComparison(base, 'invalid'), /não está selecionada/);
  assert.throws(() => decisionComparison(base, 'existing', { document: 'invalid' }), /inválido/);
  assert.deepEqual(decisionComparison({ ...base, document: 'unknown', location: 'create' }, 'existing'),
    decisionComparison({ ...base, document: 'unknown', location: 'unknown' }, 'existing'));
});

test('Print report preserves every line, escapes markup and provides A4 page flow', () => {
  const text = accessReportText(base);
  const html = accessReportPrintHtml(text);
  for (const line of text.trimEnd().split('\n').filter(Boolean)) assert.ok(html.includes(line));
  assert.match(html, /size: A4/);
  assert.match(html, /@media print/);
  assert.match(html, /break-after: avoid/);
  assert.doesNotMatch(html, /<script|<iframe|<link|src=/);
  const unsafe = accessReportPrintHtml('TÍTULO\n<script>alert("x")</script> & dados\n\nSECÇÃO\nFim');
  assert.ok(unsafe.includes('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; dados'));
  assert.doesNotMatch(unsafe, /<script>/);
  for (const value of ['', '   ', null, {}]) assert.throws(() => accessReportPrintHtml(value), /inválido/);
});

test('Text export ignores inactive assessment and proof, exposes invalid active answers', () => {
  const expected = accessReportText(base);
  assert.equal(accessReportText({ ...base, environmentalAssessment: { benefit: 'invalid' },
    healthWill: 'doctor', interestDecision: 'granted' }, { medical: 'document' }), expected);
  assert.throws(() => accessReportText({ ...base, regime: 'invalid' }), /inválid[oa]/);
  assert.throws(() => accessReportText(base, { document: 'invalid' }), /inválido/);
  const multi = accessReportText({ ...base, ...personal, reasons: ['secret', 'personal'] });
  assert.equal(multi, accessReportText({ ...base, ...personal, reasons: ['personal', 'secret'] }));
  assert.match(multi, /bloqueios conjuntos/);
});
const references = [
  {
    title: 'Existing ordinary document: access is conditional, not guaranteed',
    facts: {}, issue: 'existing', application: 'conditional', ground: [5, 1],
    conclusion: /depende de eventuais limites/, objection: /criar ou adaptar/,
  },
  {
    title: 'Pending response: do not infer delay from silence alone',
    facts: {}, issue: 'request', application: 'conditional', ground: [15, 1],
    conclusion: /não prova atraso/, reply: /receção/,
  },
  {
    title: 'Another holder: distinguish referral from a duty to deliver or create',
    facts: { document: 'no', location: 'elsewhere' }, issue: 'existing', application: 'blocked', ground: [15, 1],
    conclusion: /remessa/, objection: /criar ou adaptar/,
  },
  {
    title: 'New analysis: access does not require creating a document',
    facts: { document: 'no', location: 'create' }, issue: 'existing', application: 'blocked', ground: [13, 6],
    conclusion: /não obriga a criar/, objection: /esforço desproporcionado/,
  },
  {
    title: 'Imprecise request: clarification and assistance, not an automatic rejection',
    facts: { outcome: 'refused', reason: 'imprecise' }, issue: 'request', application: 'conditional', ground: [12, 6],
    reply: /convite a esclarecer e assistência/, replyLimit: /não obriga a adivinhar/,
  },
  {
    title: 'Preparatory document: deferral has limits and is not indefinite',
    facts: { restricted: 'yes', partial: 'yes', outcome: 'refused', reason: 'preparatory' },
    issue: 'restriction', application: 'conditional', ground: [6, 3],
    reply: /quando termina o adiamento/, replyLimit: /primeiro evento/,
  },
  {
    title: 'Partial access: redaction must actually protect the withheld information',
    facts: { restricted: 'yes', partial: 'yes', outcome: 'refused', reason: 'secret' },
    issue: 'partial', application: 'conditional', ground: [6, 8],
    conclusion: /Se for possível ocultar/, replyLimit: /revelar a informação protegida/,
  },
  {
    title: 'Sensitive third-party data: no presumption, but not an automatic prohibition',
    facts: personal, issue: 'personal', application: 'conditional', ground: [6, 9],
    conclusion: /não beneficia da presunção/, replyLimit: /não significa proibição automática/,
  },
  {
    title: 'Other personal data: presumption concerns grounds, not delivery',
    facts: { ...personal, sensitive: 'no', interest: 'no' },
    issue: 'personal', application: 'conditional', ground: [6, 9],
    conclusion: /não garante a entrega/, replyLimit: /Mantêm-se as ponderações/,
  },
  {
    title: 'Specific authorization: possible basis, not an override of all restrictions',
    facts: { ...personal, authorization: 'yes' },
    issue: 'personal', application: 'conditional', ground: [6, 5],
    conclusion: /Outros limites legais/, argument: /explícita e específica/,
  },
  {
    title: 'Unknown data category: suspend the presumption assessment',
    facts: { ...personal, sensitive: 'unknown' },
    issue: 'personal', application: 'unresolved', ground: [6, 9],
    argument: /não podemos avaliar esta presunção/,
  },
  {
    title: 'Legal secret: transparency alone does not displace a specific statute',
    facts: { restricted: 'yes', partial: 'unknown', outcome: 'refused', reason: 'secret' },
    issue: 'restriction', application: 'conditional', ground: [1, 4],
    reply: /norma concreta/, replyLimit: /regime específico/,
  },
];

for (const reference of references) {
  test(`Reasoning reference: ${reference.title}`, () => {
    const report = analyseAccess({ ...base, ...reference.facts });
    const issue = report.issues.find((item) => item.id === reference.issue);
    assert.ok(issue, 'The relevant legal question must be present');
    assert.equal(issue.application, reference.application);
    assert.ok(issue.grounds.some(([article, paragraph]) =>
      article === reference.ground[0] && paragraph === reference.ground[1]), 'The decisive provision must be selected');
    for (const field of ['conclusion', 'argument', 'objection', 'reply', 'replyLimit']) {
      assert.ok(issue[field], `${field} must not be empty`);
      if (reference[field]) assert.match(issue[field], reference[field]);
    }
    for (const item of report.issues) legalPassages(law, item.grounds);
    assert.ok(report.issues.every((item) => ['blocked', 'unresolved', 'conditional'].includes(item.application)));
  });
}

test('Reasoning safeguard: factual disputes propagate to dependent access positions', () => {
  for (const change of [
    { evidence: { document: 'disputed' } },
    { facts: { reason: 'absent' } },
  ]) {
    const report = analyseAccess({ ...base, ...personal, ...change.facts }, change.evidence);
    for (const id of ['existing', 'restriction', 'personal', 'partial']) {
      const issue = report.issues.find((item) => item.id === id);
      assert.equal(issue.application, 'blocked', id);
      assert.ok(issue.blockers.length, id);
      assert.doesNotMatch(issue.conclusion, /podes pedir o restante|não beneficia da presunção/i, id);
    }
    assert.equal(report.contradictions.length, 0, 'Conflicting versions are not an inconsistent questionnaire');
    assert.equal(report.limited, true);
    if (change.facts) assert.ok(report.next.some((step) => step.includes('Esclarece a posse')));
    assert.equal(report.issues.find((item) => item.id === 'request').application, 'conditional');
  }
});

test('Reasoning safeguard: regime and submission gates survive documentary support', () => {
  for (const change of [
    { regime: 'procedure' }, { regime: 'investigation' }, { environment: 'yes' },
    { environment: 'unknown' }, { outcome: 'not-sent' },
  ]) {
    const report = analyseAccess({ ...base, ...personal, ...change },
      { entity: 'document', document: 'document', written: 'document', outcome: 'document' });
    assert.ok(report.issues.every((item) => item.application === 'blocked'));
    assert.deepEqual(report.scenarios, []);
    assert.ok(report.issues.every((item) => item.decisions.length === 0));
    if (change.outcome !== 'not-sent') assert.deepEqual(report.deadlines, []);
  }
});

test('Reasoning safeguard: documentary claims cannot settle legal conclusions', () => {
  const facts = { ...base, ...personal };
  const initial = analyseAccess(facts);
  const supported = analyseAccess(facts,
    { entity: 'document', document: 'document', written: 'document', outcome: 'document' });
  assert.deepEqual(supported.issues.map(({ application, conclusion }) => ({ application, conclusion })),
    initial.issues.map(({ application, conclusion }) => ({ application, conclusion })));
});

test('Local synthesis selects the procedural or refusal question without ranking argument strength', () => {
  for (const [facts, expected] of [
    [{}, 'request'],
    [{ outcome: 'extended' }, 'request'],
    [{ outcome: 'granted' }, 'request'],
    [{ outcome: 'refused', reason: 'imprecise' }, 'request'],
    [personal, 'personal'],
    [{ outcome: 'refused', reason: 'preparatory', restricted: 'yes', partial: 'yes' }, 'restriction'],
    [{ outcome: 'refused', reason: 'secret', restricted: 'yes', partial: 'yes' }, 'restriction'],
    [{ outcome: 'partial', reason: 'other' }, 'request'],
  ]) {
    const report = analyseAccess({ ...base, ...facts });
    const focus = report.issues.find(({ id }) => id === expected);
    assert.equal(report.summary.issue, expected);
    assert.equal(report.summary.status, focus.application);
    for (const [field, original] of [['position', 'conclusion'], ['objection', 'objection'],
      ['reply', 'reply'], ['limit', 'replyLimit']]) {
      assert.equal(report.summary[field], focus.application === 'conditional' ? focus[original] : null);
    }
    assert.equal(report.summary.evidence, focus.evidence);
    assert.deepEqual(report.summary.refs, focus.refs);
    assert.deepEqual(report.summary.proof, focus.proof);
  }
});

test('Local synthesis refuses applied arguments for unresolved or blocked priorities', () => {
  for (const [facts, evidence, expected] of [
    [{ regime: 'procedure' }, {}, 'scope'],
    [{ environment: 'yes' }, {}, 'scope'],
    [{ environment: 'unknown' }, {}, 'scope'],
    [{ entity: 'unknown' }, {}, 'scope'],
    [{ outcome: 'not-sent' }, {}, 'scope'],
    [{ document: 'unknown' }, {}, 'existing'],
    [{ document: 'no', location: 'create' }, {}, 'existing'],
    [{ ...personal, reason: 'absent' }, {}, 'existing'],
    [{ ...personal, sensitive: 'unknown' }, {}, 'personal'],
    [{ ...personal }, { entity: 'disputed' }, 'scope'],
    [{ ...personal }, { document: 'disputed' }, 'existing'],
    [{ ...personal }, { written: 'disputed' }, 'request'],
    [{ ...personal }, { outcome: 'disputed' }, 'request'],
  ]) {
    const { summary } = analyseAccess({ ...base, ...facts }, evidence);
    assert.equal(summary.issue, expected);
    assert.notEqual(summary.status, 'conditional');
    for (const field of ['position', 'objection', 'reply', 'limit']) assert.equal(summary[field], null);
    assert.ok(summary.clarify.length);
    assert.equal(new Set(summary.clarify).size, summary.clarify.length);
  }
});

test('Verification roadmap prioritises unresolved facts and deduplicates shared dependencies', () => {
  const report = analyseAccess({ ...base, ...personal, entity: 'unknown', document: 'unknown', sensitive: 'unknown' });
  assert.deepEqual(report.roadmap.slice(0, 3).map(({ key }) => key), ['entity', 'document', 'sensitive']);
  assert.equal(new Set(report.roadmap.map(({ key }) => key)).size, report.roadmap.length);
  assert.equal(report.roadmap.find(({ key }) => key === 'entity').affects.length, report.issues.length);
  for (const task of report.roadmap) {
    assert.ok(task.title && task.question && task.verify && task.affects.length && task.refs.length);
    assert.ok(task.refs.every((number) => law.arts.some(({ k }) => k === String(number))));
  }
  const firstSupport = report.roadmap.findIndex(({ kind }) => kind === 'support');
  assert.ok(report.roadmap.slice(firstSupport).every(({ kind }) => kind === 'support'));
});

test('Verification roadmap follows contested possession without presuming a true version', () => {
  for (const [facts, evidence] of [[{ ...personal, reason: 'absent' }, {}], [personal, { document: 'disputed' }]]) {
    const report = analyseAccess({ ...base, ...facts }, evidence);
    const first = report.roadmap[0];
    assert.equal(first.key, 'document');
    assert.equal(first.kind, 'conflict');
    assert.match(first.question, /não escolhemos/);
    assert.equal(first.affects.length, 4);
    assert.equal(report.contradictions.length, 0);
  }
});

test('Verification roadmap does not apply common checks under excluded regimes or contradictions', () => {
  for (const [facts, keys] of [
    [{ regime: 'procedure' }, ['regime']],
    [{ environment: 'yes' }, ['environment']],
    [{ regime: 'unknown', environment: 'unknown' }, ['regime', 'environment']],
    [{ outcome: 'not-sent' }, ['submission']],
  ]) {
    const report = analyseAccess({ ...base, ...personal, ...facts });
    assert.deepEqual(report.roadmap.map(({ key }) => key), keys);
    assert.ok(report.issues.every(({ application }) => application === 'blocked'));
  }
});

test('Verification roadmap ignores inactive branches and does not authenticate documentary support', () => {
  const evidence = { entity: 'document', document: 'document', written: 'document', outcome: 'document' };
  const report = analyseAccess(base, evidence);
  assert.deepEqual(report.roadmap, []);
  assert.deepEqual(analyseAccess({ ...base, sensitive: 'yes', authorization: 'yes', interest: 'yes' },
    { ...evidence, authorization: 'disputed' }), report);
  assert.ok(report.issues.every(({ application }) => application === 'conditional'));
  const unexamined = analyseAccess(base);
  assert.ok(unexamined.roadmap.every(({ kind }) => kind === 'support'));
  assert.deepEqual(unexamined.issues.map(({ conclusion }) => conclusion), report.issues.map(({ conclusion }) => conclusion));
});

test('Multiple grounds retain every specific reply and source independent of selection order', () => {
  const facts = { ...base, ...personal, reasons: ['personal', 'secret', 'preparatory', 'imprecise'] };
  const report = analyseAccess(facts);
  assert.deepEqual(analyseAccess({ ...facts, reasons: [...facts.reasons].reverse() }), report);
  assert.equal(report.refusalGrounds.length, 4);
  const restriction = report.issues.find(({ id }) => id === 'restriction');
  for (const ground of [[6, 3], [1, 4], [6, 1], [6, 6]]) {
    assert.ok(restriction.grounds.some(([article, paragraph]) => article === ground[0] && paragraph === ground[1]));
  }
  assert.match(report.refusalGrounds.find(({ reason }) => reason === 'preparatory')
    .issues.find(({ id }) => id === 'restriction').replyLimit, /primeiro evento/);
  assert.match(report.refusalGrounds.find(({ reason }) => reason === 'imprecise')
    .issues.find(({ id }) => id === 'request').reply, /assistência/);
  assert.equal(report.summary.position, null);
  assert.ok(report.summary.clarify.some((text) => text.includes('não afasta automaticamente')));
  for (const issue of report.issues) legalPassages(law, issue.grounds);
});

test('Multiple grounds propagate disputed possession and preserve special regime gates', () => {
  const facts = { ...base, ...personal, reasons: ['personal', 'absent'] };
  const report = analyseAccess(facts);
  for (const id of ['existing', 'restriction', 'personal', 'partial']) {
    assert.equal(report.issues.find((item) => item.id === id).application, 'blocked');
  }
  assert.equal(report.roadmap[0].key, 'document');
  assert.equal(report.roadmap[0].kind, 'conflict');
  assert.equal(report.contradictions.length, 0);
  assert.ok(!report.next.some((text) => text.includes('Se ponderas queixa')));
  for (const overrides of [{ regime: 'procedure' }, { environment: 'unknown' }, { written: 'yes', outcome: 'not-sent' }]) {
    const gated = analyseAccess({ ...facts, ...overrides });
    assert.ok(gated.issues.every(({ application }) => application === 'blocked'));
    assert.deepEqual(gated.scenarios, []);
  }
});

test('Additional grounds activate partial questions, validate input, and are ignored without refusal', () => {
  const facts = { ...base, outcome: 'refused', reason: 'imprecise', reasons: ['imprecise', 'secret'], partial: 'unknown' };
  const report = analyseAccess(facts);
  assert.equal(report.issues.find(({ id }) => id === 'partial').application, 'unresolved');
  assert.ok(report.scenarios.some(({ id }) => id === 'separation'));
  for (const reasons of [null, [], 'secret', ['invalid']]) {
    assert.throws(() => analyseAccess({ ...facts, reasons }), /Fundamentos da recusa inválidos/);
  }
  assert.deepEqual(analyseAccess({ ...base, reasons: ['secret', 'personal'] }), analyseAccess(base));
  assert.deepEqual(analyseAccess({ ...base, outcome: 'refused', reason: 'secret', reasons: ['secret', 'secret'] }),
    analyseAccess({ ...base, outcome: 'refused', reason: 'secret' }));
});

test('Health access distinguishes consent scope and strict necessity without guaranteeing disclosure', () => {
  for (const authorization of ['yes', 'no']) {
    const report = analyseAccess({ ...base, ...personal, health: 'yes', healthWill: 'known', medical: 'no', authorization });
    const issue = report.issues.find(({ id }) => id === 'health');
    assert.equal(issue.application, 'conditional');
    assert.equal(report.summary.issue, 'health');
    assert.match(issue.argument, authorization === 'yes' ? /expressamente abrangida/ : /estritamente necessária/);
    assert.match(issue.replyLimit, /não dispensam uma base legal/);
    assert.deepEqual(issue.decisions, authorization === 'yes' ? [] : ['health']);
    assert.equal(legalPassages(law, issue.grounds).length, 4);
    assert.ok(report.roadmap.some(({ key }) => key === 'document'));
  }
});

test('Health intermediation is required on request or unascertainable will, not merely missing consent', () => {
  for (const healthWill of ['doctor', 'unascertainable']) {
    for (const medical of ['yes', 'no', 'unknown']) {
      const report = analyseAccess({ ...base, ...personal, health: 'yes', healthWill, medical });
      const issue = report.issues.find(({ id }) => id === 'health');
      assert.equal(issue.application, medical === 'yes' ? 'conditional' : 'blocked');
      if (medical !== 'yes') {
        assert.equal(report.summary.position, null);
        assert.match(issue.blockers.join(' '), /exige intermediação/);
      }
    }
  }
  const unknown = analyseAccess({ ...base, ...personal, health: 'yes', healthWill: 'unknown', medical: 'yes' });
  assert.equal(unknown.issues.find(({ id }) => id === 'health').application, 'unresolved');
  assert.equal(unknown.summary.position, null);
});

test('Health uncertainty, hidden branches and all existing gates remain effective', () => {
  const facts = { ...base, ...personal, health: 'yes', healthWill: 'known', medical: 'yes' };
  for (const overrides of [{ regime: 'protected' }, { environment: 'yes' }, { entity: 'unknown' },
    { document: 'unknown' }, { outcome: 'not-sent' }, { reason: 'absent' }]) {
    assert.equal(analyseAccess({ ...facts, ...overrides }).issues.find(({ id }) => id === 'health').application, 'blocked');
  }
  assert.equal(analyseAccess(facts, { document: 'disputed' }).issues.find(({ id }) => id === 'health').application, 'blocked');
  const combined = analyseAccess({ ...facts, reasons: ['personal', 'absent'] });
  assert.equal(combined.issues.find(({ id }) => id === 'health').application, 'blocked');
  const uncertain = analyseAccess({ ...facts, health: 'unknown' });
  assert.equal(uncertain.issues.find(({ id }) => id === 'health').application, 'unresolved');
  assert.ok(uncertain.issues.every(({ decisions }) => !decisions.includes('health')));
  for (const overrides of [{ thirdParty: 'no' }, { sensitive: 'no' }, { health: 'no' }]) {
    const report = analyseAccess({ ...facts, ...overrides, healthWill: 'invalid', medical: 'invalid' });
    assert.ok(report.issues.every(({ id }) => id !== 'health'));
  }
  assert.throws(() => analyseAccess({ ...facts, healthWill: 'invalid' }), /Resposta inválida/);
});

test('CPA distinguishes progress, consultation, ordinary certificates and article 84 time limits', async () => {
  const cpa = JSON.parse(await readFile(new URL('../data/lei/cpa.json', import.meta.url), 'utf8'));
  assert.throws(() => legalPassages(cpa, [[82, 1]]), /identificação/);
  assert.throws(() => legalPassages({ ...cpa, url: 'https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=999&tabela=leis' },
    [[82, 1]], 'cpa'), /identificação/);
  const facts = { ...base, regime: 'procedure', directInterest: 'yes', certificateElements: 'yes', computerized: 'no' };
  for (const [overrides, article, deadline] of [
    [{ procedureKind: 'progress' }, 82, /10 dias/],
    [{ procedureKind: 'consult' }, 83, null],
    [{ procedureKind: 'certificate', certificateElements: 'no' }, 83, null],
    [{ procedureKind: 'certificate' }, 84, /10 dias/],
    [{ procedureKind: 'certificate', computerized: 'yes' }, 84, /três dias/],
    [{ procedureKind: 'certificate', computerized: 'unknown' }, 84, /Confirma se/],
  ]) {
    const report = analyseAccess({ ...facts, ...overrides });
    assert.equal(report.law, 'cpa');
    assert.ok(report.issues[0].grounds.some(([number]) => number === article));
    assert.ok(legalPassages(cpa, report.issues[0].grounds, 'cpa').length);
    if (deadline) assert.match(report.deadlines[0].text, deadline);
    else assert.deepEqual(report.deadlines, []);
    assert.ok(!report.next.some((text) => text.includes('CADA')));
    assert.match(report.issues[0].replyLimit, /nem se importam automaticamente/i);
    assert.ok(report.roadmap.length);
  }
});

test('CPA essential gates prevent applied synthesis and common regime deadlines', () => {
  const facts = { ...base, regime: 'procedure', procedureKind: 'consult', directInterest: 'yes' };
  for (const overrides of [{ directInterest: 'no' }, { directInterest: 'unknown' }, { entity: 'unknown' },
    { document: 'no' }, { environment: 'yes' }, { outcome: 'not-sent' }]) {
    const report = analyseAccess({ ...facts, ...overrides });
    assert.equal(report.summary.position, null);
    assert.equal(report.issues[0].application, 'blocked');
    assert.deepEqual(report.deadlines, []);
  }
  assert.equal(analyseAccess(facts, { document: 'disputed' }).summary.position, null);
  assert.deepEqual(analyseAccess({ ...facts, sensitive: 'invalid', health: 'invalid', reasons: ['secret', 'personal'] }),
    analyseAccess(facts));
  assert.throws(() => analyseAccess({ ...facts, procedureKind: 'invalid' }), /Resposta inválida/);
  assert.throws(() => analyseAccess({ ...facts, directInterest: 'invalid' }), /Resposta inválida/);
});

test('CPA article 85 requires written proof and a favourable decision, not just claimed interest', async () => {
  const facts = { ...base, regime: 'procedure', procedureKind: 'consult', directInterest: 'no',
    legitimateInterest: 'yes', interestProof: 'yes', interestDecision: 'granted' };
  const report = analyseAccess(facts);
  assert.equal(report.issues[0].application, 'conditional');
  assert.match(report.summary.position, /abrangidos pelo despacho/);
  assert.match(report.issues[0].argument, /documentos probatórios/);
  assert.match(report.issues[0].reply, /não elimina as restrições/);
  const cpa = JSON.parse(await readFile(new URL('../data/lei/cpa.json', import.meta.url), 'utf8'));
  assert.ok(legalPassages(cpa, report.issues[0].grounds, 'cpa').some(({ article, paragraph }) => article === 85 && paragraph === 2));
  for (const overrides of [
    { legitimateInterest: 'no' }, { legitimateInterest: 'unknown' },
    { interestProof: 'no' }, { interestProof: 'unknown' }, { written: 'no' },
    { interestDecision: 'pending' }, { interestDecision: 'unknown' }, { interestDecision: 'refused' },
    { environment: 'yes' }, { entity: 'no' }, { document: 'unknown' },
  ]) {
    const result = analyseAccess({ ...facts, ...overrides },
      { entity: 'document', document: 'document', written: 'document', outcome: 'document' });
    assert.equal(result.summary.position, null);
    assert.equal(result.issues[0].application, 'blocked');
    assert.deepEqual(result.deadlines, []);
    assert.ok(result.roadmap.length);
  }
  for (const procedureKind of ['progress', 'consult', 'certificate']) {
    assert.deepEqual(analyseAccess({ ...facts, procedureKind, certificateElements: 'yes', computerized: 'yes' }).deadlines, []);
  }
});

test('CPA article 85 answers are ignored for directly interested or LADA requesters', () => {
  const facts = { ...base, regime: 'procedure', procedureKind: 'consult', directInterest: 'yes' };
  assert.deepEqual(analyseAccess({ ...facts, legitimateInterest: 'invalid', interestProof: 'invalid', interestDecision: 'invalid' }),
    analyseAccess(facts));
  assert.deepEqual(analyseAccess({ ...base, legitimateInterest: 'yes', interestProof: 'yes', interestDecision: 'granted' }),
    analyseAccess(base));
  assert.throws(() => analyseAccess({ ...facts, directInterest: 'no', legitimateInterest: 'yes',
    interestProof: 'yes', interestDecision: 'invalid' }), /Resposta inválida/);
});

test('Environmental access differentiates emissions exceptions from surviving legal grounds', () => {
  const facts = { ...base, environment: 'yes', environmentalKind: 'emissions',
    outcome: 'refused', partial: 'yes', environmentalReason: 'confidential',
    environmentalReasons: ['confidential', 'commercial', 'voluntary', 'species', 'security', 'justice', 'copyright', 'personal'] };
  const report = analyseAccess(facts);
  assert.equal(report.issues[0].application, 'conditional');
  for (const reason of ['confidential', 'commercial', 'voluntary', 'species']) {
    assert.match(report.environmentalGrounds.find((branch) => branch.reason === reason).argument, /não pode ser invocado/);
  }
  for (const reason of ['security', 'justice', 'copyright']) {
    assert.doesNotMatch(report.environmentalGrounds.find((branch) => branch.reason === reason).argument, /não pode ser invocado/);
  }
  assert.match(report.environmentalGrounds.find(({ reason }) => reason === 'personal').argument, /prevê deferimento/);
  assert.match(report.issues[0].replyLimit, /não afastam todos/);
  assert.deepEqual(analyseAccess({ ...facts, environmentalReasons: [...facts.environmentalReasons].reverse() }), report);
  const general = analyseAccess({ ...facts, environmentalKind: 'general' });
  assert.match(general.environmentalGrounds.find(({ reason }) => reason === 'personal').argument, /prevaleça|prevalência/);
  assert.ok(general.environmentalGrounds.every(({ argument }) => !argument.includes('não pode ser invocado')));
});

test('Environmental reasoning covers duty to hold, ongoing procedure, clarification and exact source', () => {
  const facts = { ...base, environment: 'yes', environmentalKind: 'general', outcome: 'refused', partial: 'yes',
    environmentalReason: 'ongoing', environmentalReasons: ['ongoing', 'imprecise', 'internal'] };
  const report = analyseAccess(facts);
  assert.match(report.environmentalGrounds.find(({ reason }) => reason === 'ongoing').argument, /não uma recusa automática/);
  assert.match(report.environmentalGrounds.find(({ reason }) => reason === 'imprecise').argument, /não seja possível sanar/);
  const passages = legalPassages(law, report.issues[0].grounds);
  assert.equal(passages.find(({ article }) => article === 17).text, law.arts.find(({ k }) => k === '17').x);
  assert.equal(passages.find(({ article }) => article === 17).paragraph, undefined);
  const absent = analyseAccess({ ...facts, environmentalReasons: ['absent'] });
  assert.equal(absent.summary.position, null);
  assert.equal(absent.issues[0].application, 'blocked');
  assert.match(absent.environmentalGrounds[0].argument, /nem deva estar/);
  assert.match(absent.environmentalGrounds[0].reply, /direta e imediata/);
});

test('Environmental branch respects gates, inactive data and invalid input', () => {
  const facts = { ...base, environment: 'yes', environmentalKind: 'emissions', outcome: 'refused',
    environmentalReason: 'personal', partial: 'yes' };
  for (const overrides of [{ entity: 'unknown' }, { document: 'no' }, { outcome: 'not-sent' }]) {
    const report = analyseAccess({ ...facts, ...overrides });
    assert.equal(report.summary.position, null);
    assert.deepEqual(report.deadlines, []);
  }
  assert.equal(analyseAccess(facts, { document: 'disputed' }).summary.position, null);
  assert.equal(analyseAccess({ ...facts, environmentalReason: 'unknown' }).summary.position, null);
  assert.deepEqual(analyseAccess({ ...facts, health: 'invalid', sensitive: 'invalid', reasons: ['secret'] }), analyseAccess(facts));
  for (const reasons of [[], null, 'security', ['invalid']]) {
    assert.throws(() => analyseAccess({ ...facts, environmentalReasons: reasons }), /Fundamentos ambientais inválidos/);
  }
  assert.deepEqual(analyseAccess({ ...base, environmentalReasons: ['security'], environmentalKind: 'invalid' }), analyseAccess(base));
  assert.throws(() => analyseAccess({ ...facts, environmentalKind: 'invalid' }), /Resposta inválida/);
});

test('Cross-regime matrix preserves summary gates and exact legal sources', async () => {
  const cpa = JSON.parse(await readFile(new URL('../data/lei/cpa.json', import.meta.url), 'utf8'));
  const regimes = [
    { ...base },
    { ...base, ...personal, health: 'yes', healthWill: 'doctor', medical: 'yes' },
    { ...base, ...personal, reasons: ['personal', 'secret'] },
    { ...base, regime: 'procedure', procedureKind: 'consult', directInterest: 'yes' },
    { ...base, regime: 'procedure', procedureKind: 'certificate', directInterest: 'no',
      legitimateInterest: 'yes', interestProof: 'yes', interestDecision: 'granted',
      certificateElements: 'yes', computerized: 'yes' },
    { ...base, environment: 'yes', environmentalKind: 'emissions', outcome: 'refused',
      environmentalReason: 'commercial', environmentalReasons: ['commercial', 'security'], partial: 'yes' },
  ];
  for (const facts of regimes) {
    for (const overrides of [{}, { entity: 'unknown' }, { document: 'unknown' },
      { written: 'yes', outcome: 'not-sent' }]) {
      for (const evidence of [{}, { document: 'disputed' }]) {
        const report = analyseAccess({ ...facts, ...overrides }, evidence);
        assert.ok(report.issues.length);
        assert.equal(new Set(report.issues.map(({ id }) => id)).size, report.issues.length);
        for (const issue of report.issues) {
          assert.equal(issue.application === 'blocked', issue.blockers.length > 0);
          assert.ok(issue.argument && issue.objection && issue.reply && issue.replyLimit && issue.evidence);
          legalPassages(report.law === 'cpa' ? cpa : law, issue.grounds, report.law);
        }
        if (overrides.entity === 'unknown' || report.contradictions.length) {
          assert.notEqual(report.summary.status, 'conditional');
          if (report.contradictions.length) assert.equal(report.summary.status, 'blocked');
          assert.equal(report.summary.position, null);
        }
        if (report.summary.position !== null) {
          assert.equal(report.summary.status, 'conditional');
          assert.ok(report.summary.objection && report.summary.reply && report.summary.limit);
        } else {
          assert.ok(report.summary.clarify.length);
        }
        for (const task of report.roadmap) {
          assert.ok(task.question && task.verify && task.affects.length);
          if (evidence.document === 'disputed' && task.key === 'document') {
            assert.equal(task.kind, 'conflict');
          }
        }
      }
    }
  }
});

test('Every pair of common refusal grounds preserves specific branches and ignores ordering', () => {
  const reasons = ['personal', 'secret', 'preparatory', 'absent', 'imprecise', 'other', 'unknown'];
  for (let i = 0; i < reasons.length; i++) {
    for (const second of reasons.slice(i + 1)) {
      const facts = { ...base, ...personal, reasons: [reasons[i], second] };
      const report = analyseAccess(facts);
      assert.deepEqual(analyseAccess({ ...facts, reasons: [second, reasons[i]] }), report);
      assert.equal(report.refusalGrounds.length, 2);
      for (const branch of report.refusalGrounds) {
        const single = analyseAccess({ ...facts, reasons: undefined, reason: branch.reason });
        assert.deepEqual(branch.issues, single.issues);
      }
      assert.equal(report.summary.position, null);
      if (facts.reasons.includes('absent')) {
        assert.ok(report.issues.filter(({ id }) => ['existing', 'restriction', 'personal', 'partial'].includes(id))
          .every(({ application }) => application === 'blocked'));
      }
    }
  }
});

test('Every pair of environmental grounds preserves emission limits and stable ordering', () => {
  const reasons = ['unknown', 'absent', 'ongoing', 'internal', 'personal', 'abusive', 'imprecise',
    'confidential', 'security', 'justice', 'commercial', 'copyright', 'voluntary', 'species', 'other'];
  for (let i = 0; i < reasons.length; i++) {
    for (const second of reasons.slice(i + 1)) {
      const facts = { ...base, environment: 'yes', environmentalKind: 'emissions', outcome: 'refused',
        environmentalReason: reasons[i], environmentalReasons: [reasons[i], second], partial: 'yes' };
      const report = analyseAccess(facts);
      assert.deepEqual(analyseAccess({ ...facts, environmentalReasons: [second, reasons[i]] }), report);
      assert.equal(report.environmentalGrounds.length, 2);
      if (facts.environmentalReasons.includes('absent')) {
        assert.equal(report.summary.status, 'blocked');
        assert.equal(report.summary.position, null);
      } else if (facts.environmentalReasons.some((reason) => ['unknown', 'other'].includes(reason))) {
        assert.equal(report.summary.status, 'unresolved');
        assert.equal(report.summary.position, null);
      }
      for (const branch of report.environmentalGrounds) {
        const single = analyseAccess({ ...facts, environmentalReasons: undefined, environmentalReason: branch.reason });
        assert.deepEqual(branch, single.environmentalGrounds[0]);
        assert.ok(law.arts.some(({ k }) => k === String(branch.ground[0])));
      }
    }
  }
});

test('Environmental balance distinguishes support per ground without deciding prevalence', () => {
  const facts = { ...base, environment: 'yes', environmentalKind: 'general', outcome: 'refused',
    environmentalReason: 'commercial', environmentalReasons: ['commercial', 'personal'], partial: 'no' };
  const baseline = analyseAccess(facts);
  const report = analyseAccess({ ...facts, environmentalAssessment: {
    benefit: 'health', harm: { commercial: 'document', personal: 'disputed' },
  } });
  assert.deepEqual(report.issues, baseline.issues);
  assert.deepEqual(report.summary, baseline.summary);
  assert.deepEqual(report.deadlines, baseline.deadlines);
  assert.equal(report.environmentalBalance.length, 2);
  const commercial = report.environmentalBalance.find(({ reason }) => reason === 'commercial');
  const personalBalance = report.environmentalBalance.find(({ reason }) => reason === 'personal');
  assert.match(commercial.argument, /riscos para a saúde pública/);
  assert.match(commercial.objection, /não foi lido nem autenticado/);
  assert.match(commercial.separation, /não valida uma recusa total/);
  assert.match(personalBalance.objection, /em conflito/);
  for (const entry of report.environmentalBalance) {
    assert.ok(entry.verify && entry.refs.every((ref) => law.arts.some(({ k }) => k === String(ref))));
    assert.equal('winner' in entry, false);
    assert.equal('score' in entry, false);
  }
});

test('Environmental balance preserves emissions rules and all factual gates', () => {
  const facts = { ...base, environment: 'yes', environmentalKind: 'emissions', outcome: 'refused',
    environmentalReason: 'commercial', environmentalReasons: ['commercial', 'security', 'personal'], partial: 'yes',
    environmentalAssessment: { benefit: 'accountability', harm: { commercial: 'document', security: 'none', personal: 'claim' } } };
  const report = analyseAccess(facts);
  assert.match(report.environmentalBalance.find(({ reason }) => reason === 'commercial').limit, /não reativa/);
  assert.match(report.environmentalBalance.find(({ reason }) => reason === 'personal').limit, /regra específica/);
  assert.match(report.environmentalBalance.find(({ reason }) => reason === 'security').objection, /não prova ausência/);
  for (const overrides of [{ entity: 'unknown' }, { document: 'unknown' }, { written: 'yes', outcome: 'not-sent' }]) {
    assert.equal(analyseAccess({ ...facts, ...overrides }).summary.position, null);
  }
  assert.equal(analyseAccess(facts, { document: 'disputed' }).summary.position, null);
});

test('Environmental balance validates relevant input and ignores inactive assessment fields', () => {
  const facts = { ...base, environment: 'yes', environmentalKind: 'general', outcome: 'refused',
    environmentalReason: 'commercial', partial: 'unknown' };
  for (const environmentalAssessment of [null, [], { benefit: 'invalid' }, { harm: null }, { harm: { commercial: 'invalid' } }]) {
    assert.throws(() => analyseAccess({ ...facts, environmentalAssessment }), /inválido/);
  }
  assert.deepEqual(analyseAccess({ ...facts, environmentalAssessment: { harm: { security: 'invalid' } } }), analyseAccess(facts));
  assert.deepEqual(analyseAccess({ ...base, environmentalAssessment: null }), analyseAccess(base));
  const pending = { ...facts, outcome: 'pending' };
  assert.deepEqual(analyseAccess({ ...pending, environmentalAssessment: null }), analyseAccess(pending));
  const none = analyseAccess({ ...facts, environmentalAssessment: { benefit: 'none' } });
  assert.match(none.environmentalBalance[0].argument, /não prova.*ausência de interesse público/);
});

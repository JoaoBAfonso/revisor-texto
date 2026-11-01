import test from 'node:test';
import assert from 'node:assert/strict';
import * as G from './teia-graph.mjs';
import { PARLIAMENT_FILE, RECOLHA, WIKIPEDIA_TEXT, WIKIPEDIA_SOURCE, LAW_FIRM, LAW_FIRM_NIF } from './teia-fixture.test-helper.mjs';

const declared = (extra) => ({ de: G.SUBJECT, rel: 'participacao', para: 'org:x', fonte: { tipo: 'primaria', nome: 'Registo de interesses na Assembleia da República' }, ...extra });

test('classifica cargos segundo o âmbito da Lei 52/2019', () => {
  assert.deepEqual(
    (({ ambito, executivo, exclusividade, nacional, chefe }) => ({ ambito, executivo, exclusividade, nacional, chefe }))(G.classifyOffice('Primeira-Ministra de Portugal')),
    { ambito: 'governo', executivo: true, exclusividade: true, nacional: true, chefe: true },
  );
  assert.equal(G.classifyOffice('Presidente da Assembleia Municipal de Exemplo').lei52, 'nao');
  const councillor = G.classifyOffice('Vereador da Câmara Municipal de Exemplo');
  assert.equal(councillor.ambito, 'autarquia-executivo');
  assert.equal(councillor.municipio, 'Exemplo');
  assert.equal(G.classifyOffice('Deputado à Assembleia da República').ambito, 'parlamento');
  assert.equal(G.classifyOffice('Presidente da Assembleia Geral da Loja Fictícia').publico, false);
  assert.deepEqual(G.officeYears('Presidente da Assembleia Municipal de Exemplo (200972013)'), { inicio: '2009', fim: '2013', rotulo: 'Presidente da Assembleia Municipal de Exemplo' });
});

test('junta declarações sucessivas numa linha de tempo e sabe quando um vínculo deixou de ser declarado', () => {
  const days = ['2013-01-29', '2018-04-19', '2022-05-10'];
  const [kept] = G.mergeTimeline([declared({ id: 'a1', declaradoEm: '2013-01-29' }), declared({ id: 'a2', declaradoEm: '2018-04-19' })], days);
  assert.deepEqual(kept.ids, ['a1', 'a2']);
  assert.equal(kept.declaradoDe, '2013-01-29');
  assert.equal(kept.declaradoEm, '2018-04-19');
  assert.equal(kept.fimAte, '2022-05-10');
  assert.equal(G.activeOn(kept, '2016-06-01'), 'sim');
  assert.equal(G.activeOn(kept, '2020-01-01'), 'talvez');
  assert.equal(G.activeOn(kept, '2023-01-01'), 'nao');

  const dated = G.mergeTimeline([
    { id: 'b1', de: G.SUBJECT, rel: 'cargo-publico', para: 'p', inicio: '2015-10-23', fim: '2019-10-24', aproximado: true, fonte: { tipo: 'primaria', nome: 'AR' } },
    { id: 'b2', de: G.SUBJECT, rel: 'cargo-publico', para: 'p', inicio: '2015-10-23', fim: '2018-04-06', fonte: { tipo: 'secundaria', nome: 'Wikidata' } },
  ]);
  assert.equal(dated.length, 1);
  assert.equal(dated[0].fim, '2018-04-06', 'as datas exatas prevalecem sobre as da legislatura');
  assert.equal(G.activeOn(dated[0], '2019-01-01'), 'nao');
  assert.equal(G.activeOn({ semData: true }, '2019-01-01'), 'talvez');
  assert.equal(G.activeOn({ inicio: '2024-04-02', atual: true }, '2026-05-15'), 'sim');
});

test('identidades: denominações compatíveis sim, coincidências de uma palavra não', () => {
  assert.equal(G.identityMatch(['Pinhais Gold de Portugal, Lda'], 'Pinhais, S.A.'), false);
  assert.equal(G.identityMatch(['AE&F, Sociedade de Advogados, RL', 'Alfa Exemplo & Ferraz'], 'Freguesia de Ferraz'), false);
  assert.equal(G.identityMatch(['AE&F, Sociedade de Advogados, RL'], 'AE&F - Sociedade de Advogados, SP, RL'), true);
  assert.equal(G.identityMatch(['AE&F, Sociedade de Advogados, RL', 'Alfa Exemplo & Ferraz'], LAW_FIRM), true);
  assert.equal(G.identityMatch(['Loja Fictícia - Eletrodomésticos, SA'], 'LOJA FICTICIA ELECTRODOMÉSTICOS SA'), true);
  assert.equal(G.identityMatch(['Casinos Atlântico'], 'Casinos Atlântico-Soc.Invest.Turis.Costa Norte L'), true);
  assert.equal(G.orgNameMatch('Tubaço', 'Grupo Tubaço, SA'), true);
  assert.equal(G.orgNameMatch('Quintaviva', 'Casinos Atlântico'), false);

  const node = { nome: 'AE&F, Sociedade de Advogados, RL', nomes: ['AE&F, Sociedade de Advogados, RL', 'Alfa Exemplo & Ferraz'] };
  const ranked = G.rankIdentityCandidates(node, [
    { candidatos: [{ id: '500000002', nome: 'Freguesia de Ferraz', pontuacao: 0.9, contratos: 50 }, { id: LAW_FIRM_NIF, nome: LAW_FIRM, pontuacao: 0.8, contratos: 3 }] },
    { candidatos: [{ id: LAW_FIRM_NIF, nome: LAW_FIRM, pontuacao: 1, contratos: 3 }] },
  ]);
  assert.deepEqual(ranked.map((item) => [item.id, item.coincide, item.pesquisas]), [[LAW_FIRM_NIF, true, 2], ['500000002', false, 1]]);
  assert.equal(ranked[0].pontuacao, 1);
});

test('declarações do Parlamento: siglas por extenso e cônjuge como nó privado', () => {
  const graph = G.createGraph({ tipo: 'person', nome: 'Ana Exemplo Ferraz' });
  G.addParliament(graph, PARLIAMENT_FILE, { recolhidoEm: RECOLHA });
  const firm = graph.nos[G.orgId('AE&F, Sociedade de Advogados, RL')];
  assert.ok(firm.nomes.includes('Alfa Exemplo & Ferraz'));
  const spouse = Object.values(graph.nos).find((node) => node.tipo === 'person' && node.id !== G.SUBJECT);
  assert.equal(spouse.privado, true);
  assert.ok(!JSON.stringify(graph).includes('Pessoa Privada Exemplo'), 'o nome do cônjuge não é guardado');
  const stake = graph.afirmacoes.filter((item) => item.rel === 'participacao');
  assert.equal(stake.length, 2);
  assert.ok(stake.every((item) => item.percentagem === 50 && item.fonte.tipo === 'primaria'));
  assert.ok(graph.afirmacoes.some((item) => item.rel === 'atividade' && item.detalhe === 'Advogada'));
  assert.throws(() => G.createGraph({ nome: '  ' }), /Indica/);
});

test('extrai empresas de texto corrido: a da família e quem lhe paga', () => {
  const mentions = G.extractOrganisations(WIKIPEDIA_TEXT, { exclude: ['Ana Exemplo Ferraz'] });
  const byName = Object.fromEntries(mentions.map((item) => [item.nome, item]));
  assert.deepEqual(Object.keys(byName).sort(), ['Casinos Atlântico', 'Quintaviva']);
  assert.equal(byName.Quintaviva.familia, true);
  assert.equal(byName['Casinos Atlântico'].familia, false);
  assert.equal(byName['Casinos Atlântico'].paga.para, '@familia');
  assert.equal(byName['Casinos Atlântico'].paga.inicio, '2021');
  assert.ok(byName['Casinos Atlântico'].temas.includes('concessão'));

  const graph = G.createGraph({ tipo: 'person', nome: 'Ana Exemplo Ferraz' });
  G.addCoMentions(graph, mentions, WIKIPEDIA_SOURCE);
  const pays = graph.afirmacoes.find((item) => item.rel === 'cliente');
  assert.equal(pays.de, G.orgId('Casinos Atlântico'));
  assert.equal(pays.para, G.orgId('Quintaviva'));
  assert.equal(pays.inicio, '2021');
  assert.match(pays.inferido, /empresa familiar/);
  assert.equal(pays.fonte.tipo, 'secundaria');
});

test('texto sobre uma entidade: a denominação abreviada é o próprio alvo e «empresa familiar» descreve quem a detém', () => {
  const subject = 'Casinos Atlântico-Soc.Invest.Turis.Costa Norte L';
  assert.equal(G.abbreviates('Sociedade de Investimentos Turísticos da Costa Norte', subject), true);
  assert.equal(G.abbreviates('Casinos Atlântico Sul', subject), false);
  const text = [
    'A Casinos Atlântico (razão social Casinos Atlântico — Sociedade de Investimentos Turísticos da Costa Norte, S.A.) é um grupo empresarial português.',
    'Desde 2026, a concessão é explorada pela subsidiária Casinos Atlântico Sul, S.A.',
    'O grupo é detido pela família fundadora, através da Fundadores SGPS.',
    'Em 2001, o Conselho de Ministros adjudicou à empresa Casinos Atlântico a concessão.',
  ].join(' ');
  const mentions = G.extractOrganisations(text, { exclude: ['Casinos Atlântico', subject], entidade: true });
  assert.deepEqual(mentions.map((item) => item.nome).sort(), ['Casinos Atlântico Sul', 'Fundadores']);
  assert.ok(mentions.every((item) => !item.familia));
  assert.ok(G.extractOrganisations(text, { exclude: ['Casinos Atlântico', subject] }).some((item) => item.familia), 'sobre uma pessoa, seria a empresa da família');
});

test('junta menções secundárias à entidade declarada e regista a fusão', () => {
  const graph = G.createGraph({ tipo: 'person', nome: 'Ana Exemplo Ferraz' });
  const declaredId = G.addNode(graph, { id: G.orgId('Grupo Tubaço, SA'), tipo: 'org', nome: 'Grupo Tubaço, SA' });
  G.addStatement(graph, { de: G.SUBJECT, rel: 'cargo-privado', para: declaredId, detalhe: 'Presidente da Assembleia Geral', fonte: { tipo: 'primaria', nome: 'Registo de interesses' } });
  G.addCoMentions(graph, [{ nome: 'Tubaço', mencoes: 1, excerto: 'presidiu à assembleia geral da Tubaço', familia: false, temas: [] }], WIKIPEDIA_SOURCE);
  const fusoes = G.consolidateOrgs(graph);
  assert.equal(fusoes.length, 1);
  assert.equal(fusoes[0].para, declaredId);
  assert.equal(graph.nos[G.orgId('Tubaço')], undefined);
  assert.ok(graph.afirmacoes.filter((item) => item.para === declaredId).length === 2);
});

test('separa decisões do Estado de jurisprudência e contratação coletiva', () => {
  const concession = G.classifyAct({ tipo: 'Contrato', sumario: 'Contrato de concessão do exclusivo da exploração de jogos', emissor: 'Economia - Gabinete do Secretário de Estado do Turismo' });
  assert.equal(concession.decisao, 'concessão');
  assert.equal(concession.governo, true);
  const ruling = G.classifyAct({ tipo: 'Acórdão', sumario: 'Recurso laboral', emissor: 'Tribunal da Relação do Porto' });
  assert.equal(ruling.decisao, '');
  assert.equal(ruling.outro, 'jurisprudência');
  assert.equal(G.classifyAct({ tipo: 'Acordo Colectivo de Trabalho', sumario: 'Acordo entre empresas do setor' }).outro, 'contratação coletiva');
  assert.equal(G.classifyAct({ tipo: 'Despacho', sumario: 'Cadastro dos grandes contribuintes', emissor: 'Finanças - Autoridade Tributária e Aduaneira' }).governo, false);
  assert.equal(G.classifyAct({ tipo: 'Deliberação', sumario: 'Licença de utilização', emissor: 'Município de Exemplo' }).municipio, 'Exemplo');
});

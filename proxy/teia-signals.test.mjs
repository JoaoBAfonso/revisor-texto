import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as G from './teia-graph.mjs';
import * as S from './teia-signals.mjs';
import { buildInvestigation, wikipediaStep, PARLIAMENT_FILE, WIKIDATA_PROFILE, RECOLHA } from './teia-fixture.test-helper.mjs';

const HOJE = '2026-11-01';
const PAYER = G.orgId('Casinos Atlântico');
const FAMILY_FIRM = G.orgId('Quintaviva');
const LAW_FIRM = G.orgId('AE&F, Sociedade de Advogados, RL');

function startGraph() {
  const graph = G.createGraph({ tipo: 'person', nome: 'Ana Exemplo Ferraz' });
  G.addParliament(graph, PARLIAMENT_FILE, { recolhidoEm: RECOLHA });
  G.addWikidata(graph, WIKIDATA_PROFILE, { recolhidoEm: RECOLHA });
  return graph;
}

const byId = (signals, prefix) => signals.find((item) => item.id.startsWith(prefix));
const state = (signal, id) => signal.criterios.find((item) => item.id === id)?.estado;

test('cargos: legislatura aproximada substituída pelas datas exatas do mandato', () => {
  const offices = S.officesOf(startGraph(), G.SUBJECT);
  assert.deepEqual(offices.map((item) => [item.cargo.ambito, item.inicio, item.fim, Boolean(item.atual), Boolean(item.aproximado)]), [
    ['governo', '2024-04-02', '', true, false],
    ['parlamento', '2015-10-23', '2018-04-06', false, false],
  ]);
  assert.equal(offices[1].ids.length, 2);
});

test('limites do CCP por data e pressão sobre o limite do artigo 113.º', () => {
  assert.deepEqual(S.ccpLimits('2017-06-01'), { ad: 75000, cp: 0 });
  assert.deepEqual(S.ccpLimits('2018-01-01'), { ad: 20000, cp: 75000 });
  assert.deepEqual(S.ccpLimits('2026-09-30'), { ad: 20000, cp: 75000 });
  assert.deepEqual(S.ccpLimits('2026-10-01'), { ad: 75000, cp: 130000 });
  const window = S.directAwardWindow({ 2016: [1, 23406, 1, 23406, 0, 0], 2017: [2, 126000, 2, 126000, 0, 0] });
  assert.deepEqual([window.de, window.ate, window.n, window.valorAD], [2015, 2017, 3, 149406]);
  assert.ok(S.windowPressure(window).ratio > 1.9);
  const small = S.directAwardWindow({ 2021: [1, 3000, 1, 3000, 0, 0], 2022: [1, 2500, 1, 2500, 0, 0] });
  assert.ok(S.windowPressure(small).ratio < 0.5, 'contratos pequenos não chegam a sinal');
  assert.equal(S.directAwardWindow({ 2020: [1, 50000, 1, 50000, 0, 0] }), null);
});

test('pesquisa no Diário da República pelo nome mais específico, com os temas das fontes primeiro', () => {
  const firm = { nome: 'AE&F, Sociedade de Advogados, RL', nomes: ['AE&F, Sociedade de Advogados, RL', 'AE&F - Alfa Exemplo & Ferraz'] };
  assert.equal(S.searchName(firm), 'Alfa Exemplo & Ferraz');
  assert.deepEqual(S.actQueries({ nome: 'Casinos Atlântico', nomes: ['Casinos Atlântico'], temas: ['concessão'] }),
    ['"Casinos Atlântico" concessão', '"Casinos Atlântico" contrato', '"Casinos Atlântico"']);
  assert.equal(S.displayName('Loja Fictícia - Eletrodomésticos, SA'), 'Loja Fictícia - Eletrodomésticos');
});

test('pontuação: plausibilidade, valor em causa e atualidade', () => {
  assert.ok(S.materiality(5000) < S.materiality(40000));
  assert.ok(S.materiality(40000) < S.materiality(400000));
  assert.equal(S.materiality(null), 1);
  assert.equal(S.recency({ atual: true }, HOJE), 1.25);
  assert.equal(S.recency({ ultimo: '2025-01-01' }, HOJE), 1);
  assert.equal(S.recency({ ultimo: '2014-01-01' }, HOJE), 0.8);
  const signal = (estado, relevancia) => ({ padrao: 'P2', relevancia, criterios: [{ id: 'durante', estado }, { id: 'vigente', estado: 'sim' }, { id: 'tipo', estado: 'sim' }] });
  assert.ok(S.scoreSignal(signal('sim', {}), HOJE) > S.scoreSignal(signal('talvez', {}), HOJE));
  assert.ok(S.scoreSignal(signal('sim', { atual: true }), HOJE) > S.scoreSignal(signal('sim', { ultimo: '2014-01-01' }), HOJE));
  assert.ok(S.scoreSignal(signal('sim', { valor: 500000 }), HOJE) > S.scoreSignal(signal('sim', { valor: 2000 }), HOJE));
});

test('perguntas: primeiro as fontes públicas, depois quem paga à empresa da família', () => {
  const graph = startGraph();
  const first = S.nextQuestions(graph).perguntas;
  assert.equal(first[0].id, 'fontes');
  assert.equal(first[0].acao.tipo, 'wikipedia');
  assert.ok(first.length <= 4);

  wikipediaStep(graph);
  S.markAsked(graph, 'fontes');
  const next = S.nextQuestions(graph).perguntas;
  assert.equal(next[0].id, `atos:${PAYER}`);
  assert.equal(next[0].prioridade, 20);
  assert.match(next[0].texto, /Casinos Atlântico paga a quem está ligado a Ana Exemplo Ferraz/);
  assert.deepEqual(next[0].acao.qs, ['"Casinos Atlântico" concessão', '"Casinos Atlântico" contrato', '"Casinos Atlântico"']);
  assert.ok(!S.nextQuestions(graph, { limit: 20 }).perguntas.some((item) => item.id === 'fontes'));
});

test('perguntas sobre uma entidade: quem a detém e cada assunto do Diário da República uma vez, os mais recentes primeiro', () => {
  const graph = G.createGraph({ tipo: 'org', nome: 'Casinos Atlântico' });
  assert.deepEqual(S.nextQuestions(graph, { limit: 20 }).perguntas.map((item) => item.id), ['declarantes', `contratos:${G.SUBJECT}`, `atos:${G.SUBJECT}`, 'fontes']);
  const concession = (zona) => `Contrato de concessão do exclusivo da exploração de jogos de fortuna ou azar na ${zona}`;
  const act = (n, data, sumario) => ({ id: `90010${n}`, tipo: 'Contrato', numero: `${n}/2026`, data, serie: '2', emissor: 'Gabinete do Secretário de Estado do Turismo',
    url: `https://diariodarepublica.pt/dr/detalhe/contrato/${n}`, sumario });
  G.addActs(graph, G.SUBJECT, { total: 5, recolhidoEm: RECOLHA, itens: [
    act(1, '2020-01-10', concession('Zona de Jogo do Oeste')),
    act(2, '2026-05-14', concession('Zona de Jogo do Norte')),
    act(3, '2026-05-15', concession('Zona de Jogo do Centro')),
    act(4, '2026-03-01', concession('zona de jogo do Centro')),
    act(5, '2024-01-10', 'Contrato de concessão de exploração da Marina de Vilamar'),
  ] }, { ligacao: 'nome', consulta: '"Casinos Atlântico" concessão' });
  const topics = S.nextQuestions(graph, { limit: 20 }).perguntas.filter((item) => item.id.startsWith('objeto:')).map((item) => item.acao.q);
  assert.deepEqual(topics, [
    'concessão exploração jogos fortuna Zona Jogo Centro',
    'concessão exploração jogos fortuna Zona Jogo Norte',
    'concessão exploração Marina Vilamar',
  ], 'a «zona de jogo do Centro» de março é o mesmo assunto; o Oeste, de 2020, fica para depois');
});

test('P8: a cadeia quem paga → empresa da família → titular → decisão do Estado', () => {
  const { visiveis, todos } = S.evaluateSignals(buildInvestigation(), { hoje: HOJE });
  const chain = visiveis[0];
  assert.equal(chain.padrao, 'P8');
  assert.equal(chain.entidade, PAYER);
  assert.equal(chain.ligada, FAMILY_FIRM);
  assert.equal(chain.pergunta, 'Casinos Atlântico pagava a Quintaviva (empresa da família de Ana Exemplo Ferraz) enquanto o Governo decidia sobre Casinos Atlântico?');
  assert.deepEqual(chain.cadeia.map((item) => item.papel), ['paga', 'família', 'titular', 'decisão']);
  assert.deepEqual(Object.fromEntries(chain.criterios.map((item) => [item.id, item.estado])),
    { ligacao: 'talvez', pagamento: 'talvez', durante: 'sim', simultaneo: 'talvez', emissor: 'talvez', decisao: 'sim' });
  assert.ok(chain.itens.every((item) => !/Acórdão/.test(item.texto || '')), 'jurisprudência não é decisão do Estado');
  assert.ok(chain.alternativas.length >= 3 && chain.lacunas.length >= 2);
  assert.ok(chain.lei.some((item) => item.artigo === '73' && item.id === 'cpa'));
  assert.equal(byId(todos, `P3:alvo:${PAYER}`), undefined, 'quem paga não repete a pergunta como entidade ligada');
});

test('P2 e P7: contratos da sociedade com participação de 50% durante o mandato de deputada', () => {
  const { visiveis, outros, todos } = S.evaluateSignals(buildInvestigation(), { hoje: HOJE });
  const money = byId(todos, `P2:alvo:${LAW_FIRM}`);
  assert.ok(money);
  assert.equal(state(money, 'identidade'), 'sim');
  assert.equal(state(money, 'tipo'), 'sim');
  assert.equal(state(money, 'regime'), 'talvez', 'antes de 2019 aplicava-se a Lei 64/93');
  assert.equal(money.criterios.find((item) => item.id === 'durante').nota, '3 contratos (149 406 €) durante Deputado (XIII Legislatura, Aveiro, PXX)');
  assert.ok(visiveis.includes(money));
  const repeated = byId(todos, `P7:${LAW_FIRM}`);
  assert.equal(state(repeated, 'valor'), 'sim');
  assert.ok(outros.includes(repeated), 'a mesma entidade não ocupa dois cartões visíveis');
  assert.equal(new Set(visiveis.map((item) => item.entidade)).size, visiveis.length);
});

test('P1 e P6: funções privadas depois da posse e empresa da família', () => {
  const { todos } = S.evaluateSignals(buildInvestigation(), { hoje: HOJE });
  const roles = byId(todos, 'P1:alvo:');
  assert.equal(state(roles, 'exclusividade'), 'sim');
  assert.equal(state(roles, 'sobreposicao'), 'talvez');
  assert.ok(roles.itens.every((item) => 'data' in item));
  const family = byId(todos, `P6:alvo:${FAMILY_FIRM}`);
  assert.equal(state(family, 'familia'), 'talvez');
  assert.match(family.criterios.find((item) => item.id === 'clientes').nota, /Casinos Atlântico \(desde 2021\)/);
});

test('P3: atos fracos (outro órgão, sem efeito patrimonial) não chegam a sinal', () => {
  const graph = buildInvestigation();
  const shop = G.orgId('Loja Fictícia - Eletrodomésticos, SA');
  G.addActs(graph, shop, { recolhidoEm: RECOLHA, itens: [{ id: '1', tipo: 'Despacho', numero: '1/2026', data: '2026-02-01',
    emissor: 'Finanças - Autoridade Tributária e Aduaneira', sumario: 'Cadastro dos grandes contribuintes' }] });
  assert.equal(byId(S.evaluateSignals(graph, { hoje: HOJE }).todos, `P3:alvo:${shop}`), undefined);
  G.addActs(graph, shop, { recolhidoEm: RECOLHA, itens: [{ id: '2', tipo: 'Resolução do Conselho de Ministros', numero: '9/2026', data: '2026-03-01',
    emissor: 'Presidência do Conselho de Ministros', sumario: 'Atribui apoio financeiro e incentivo ao investimento da Loja Fictícia' }] });
  const decision = byId(S.evaluateSignals(graph, { hoje: HOJE }).todos, `P3:alvo:${shop}`);
  assert.equal(state(decision, 'emissor'), 'sim');
  assert.equal(state(decision, 'decisao'), 'sim');
  assert.equal(decision.itens.length, 1);
});

test('privacidade: o nome do cônjuge nunca entra no grafo, nos sinais nem nas exportações', () => {
  const graph = buildInvestigation();
  const { todos } = S.evaluateSignals(graph, { hoje: HOJE });
  for (const text of [JSON.stringify(todos), S.exportGraph(graph), S.notebookMarkdown(graph, { sinais: todos, hoje: HOJE })]) {
    assert.ok(!text.includes('Pessoa Privada Exemplo'));
  }
  assert.ok(S.notebookMarkdown(graph, { sinais: todos, hoje: HOJE }).includes('Cônjuge (nome omitido)'));
});

test('as referências legais dos sinais existem no corpus local', () => {
  for (const ref of Object.values(S.LEGAL)) {
    const file = new URL(`../data/lei/${ref.id}.json`, import.meta.url);
    assert.ok(existsSync(file), `${ref.id} em falta`);
    const law = JSON.parse(readFileSync(file, 'utf8'));
    assert.ok(law.arts.some((article) => article.k === ref.artigo), `${ref.rotulo}: artigo em falta`);
    assert.equal(ref.href, `#/direito/lei/${ref.id}/${ref.artigo}`);
  }
});

test('modelos: pedido de comentário, pedido LADA, caderno e exportação', () => {
  const graph = buildInvestigation();
  const { visiveis } = S.evaluateSignals(graph, { hoje: HOJE });
  const chain = visiveis[0];
  const reply = S.replyTemplate(graph, chain, { hoje: new Date('2026-11-01T00:00:00Z') });
  assert.match(reply, /Exmo\(a\)\. Senhor\(a\) Ana Exemplo Ferraz/);
  assert.match(reply, /Esses pagamentos ainda se mantinham à data da decisão do Estado\?/);
  assert.match(reply, /até 06\/11\/2026/);
  const lada = S.ladaTemplate(graph, chain);
  assert.match(lada, /Lei n\.º 26\/2016/);
  assert.match(lada, /Contrato 43\/2026/);
  const ladaOpen = S.ladaTemplate(graph, { ...chain, itens: [] });
  assert.match(ladaOpen, /1\. Decisões, despachos, concessões, licenças, contratos ou apoios relativos a Casinos Atlântico adotados desde \d{2}\/\d{2}\/\d{4}/);
  const payment = graph.afirmacoes.find((item) => item.rel === 'cliente');
  assert.equal(S.describeStatement(graph, payment).match(/pagamentos ou avenças noticiados/g).length, 1, 'a relação não se repete no detalhe');
  const notebook = S.notebookMarkdown(graph, { sinais: visiveis, hoje: HOJE });
  assert.match(notebook, /não acusações/);
  assert.match(notebook, /Cadeia: Casinos Atlântico \(paga\) → Quintaviva \(família\) → Ana Exemplo Ferraz \(titular\) → Contrato 43\/2026 \(decisão, 15\/05\/2026\)/);
  const restored = S.importGraph(S.exportGraph(graph));
  assert.deepEqual(S.evaluateSignals(restored, { hoje: HOJE }).visiveis.map((item) => item.id), visiveis.map((item) => item.id));
  assert.throws(() => S.importGraph('{'), /JSON válido/);
  assert.throws(() => S.importGraph(JSON.stringify({ formato: 'outro' })), /caderno da Teia/);
});

test('importação: normaliza nós, descarta afirmações órfãs e omite nomes privados de cadernos antigos', () => {
  const graph = buildInvestigation();
  const data = JSON.parse(S.exportGraph(graph));
  data.grafo.nos['pessoa:antiga'] = { tipo: 'person', nome: 'Nome Privado Antigo', privado: true };
  data.grafo.afirmacoes.push({ id: 'x1', de: 'alvo', rel: 'conjuge', para: 'pessoa:antiga', fonte: { tipo: 'primaria', nome: 'Registo', citacao: 'Cônjuge: Nome Privado Antigo' } });
  data.grafo.afirmacoes.push({ id: 'x2', de: 'alvo', rel: 'manual', para: 'nao:existe', fonte: { tipo: 'manual', nome: 'x' } });
  data.grafo.nos['org:sem nomes'] = { tipo: 'org', nome: 'Sem Nomes, Lda' };
  data.grafo.nos.lixo = 'não é um nó';
  const restored = S.importGraph(JSON.stringify(data));
  assert.ok(!JSON.stringify(restored).includes('Nome Privado Antigo'));
  assert.ok(!restored.afirmacoes.some((item) => item.id === 'x2'));
  assert.equal(restored.nos.lixo, undefined);
  assert.deepEqual(restored.nos['org:sem nomes'].nomes, ['Sem Nomes, Lda']);
  assert.equal(restored.nos['org:sem nomes'].id, 'org:sem nomes');
});

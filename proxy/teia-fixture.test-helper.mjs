// Investigação fictícia para os testes da Teia: pessoas, empresas e números inventados, mesma forma dos dados reais.
import * as G from './teia-graph.mjs';

export const RECOLHA = '2026-10-30T10:00:00.000Z';

export const PARLIAMENT_FILE = {
  id: '9001', nome: 'Ana Exemplo Ferraz', nomeParlamentar: 'Ana Ferraz', profissao: 'Advogada',
  legislaturas: [{ leg: 'XIII', circulo: 'Aveiro', partido: 'PXX' }],
  funcoes: [],
  fontes: { interesses: [{ leg: 'XII', url: 'https://exemplo.pt/rgi-xii.pdf' }, { leg: 'XIII', url: 'https://exemplo.pt/rgi-xiii.pdf' }] },
  declaracoes: [
    { leg: 'XII', data: '2013-01-29', conjuge: 'Pessoa Privada Exemplo',
      ligacoes: [{ tipo: 'sociedade', entidade: 'AE&F, Sociedade de Advogados, RL', participacao: '50%' }],
      textos: { atividades: ['Sócia da AE&F - Alfa Exemplo & Ferraz'] } },
    { leg: 'XIII', data: '2018-04-19',
      ligacoes: [
        { tipo: 'sociedade', entidade: 'AE&F, Sociedade de Advogados, RL', participacao: '50%' },
        { tipo: 'cargo-social', funcao: 'Presidente da Assembleia Geral', entidade: 'Loja Fictícia - Eletrodomésticos, SA', inicio: '2015-05-30' },
        { funcao: 'Advogada', inicio: '2000' },
      ] },
  ],
};

export const WIKIDATA_PROFILE = {
  id: 'Q900001', url: 'https://www.wikidata.org/wiki/Q900001', nome: 'Ana Exemplo Ferraz', descricao: 'política fictícia',
  afirmacoes: [
    { p: 'P39', valor: 'Primeira-Ministra de Portugal', valorId: 'Q900002', inicio: '2024-04-02' },
    { p: 'P39', valor: 'deputada à Assembleia da República', valorId: 'Q900003', de: 'XIII Legislatura', deId: 'Q900004', inicio: '2015-10-23', fim: '2018-04-06' },
  ],
};

export const WIKIPEDIA_TEXT = [
  'Ana Exemplo Ferraz é uma política fictícia.',
  'Veio-se depois a saber que a própria primeira-ministra poderia ter um conflito de interesses por causa da sua empresa familiar Quintaviva.',
  'Soube-se também que a empresa familiar recebia várias avenças mensais pelos serviços de consultoria que prestava, incluindo uma avença de 4500 € da empresa Casinos Atlântico desde 2021.',
  'A Casinos Atlântico explora a concessão de jogo da zona do Norte.',
].join(' ');

export const WIKIPEDIA_SOURCE = { tipo: 'secundaria', nome: 'Wikipédia: Ana Exemplo Ferraz (revisão de 2026-10-29)', url: 'https://pt.wikipedia.org/w/index.php?oldid=1', recolhidoEm: RECOLHA };

export const LAW_FIRM = 'ALFA EXEMPLO & FERRAZ, SOCIEDADE DE ADVOGADOS, SP, RL';
export const LAW_FIRM_NIF = '510000001';
export const MUNICIPALITY_NIF = '506000001';

export const LAW_FIRM_SUPPLIER = {
  id: LAW_FIRM_NIF, url: 'https://exemplo.pt/fornecedor',
  nomes: { [MUNICIPALITY_NIF]: 'Município de Exemplo' },
  perfil: {
    nome: LAW_FIRM, n: 3, v: 149406, d0: '2016-04-13', d1: '2017-12-13', pr: { AD: 3 },
    anos: { 2016: [1, 23406, 1, 23406, 0, 0], 2017: [2, 126000, 2, 126000, 0, 0] },
    contratos: [
      ['c1', '2016-04-13', [MUNICIPALITY_NIF], [LAW_FIRM_NIF], 'Assessoria jurídica', 23406, 'AD', 'S'],
      ['c2', '2017-05-29', [MUNICIPALITY_NIF], [LAW_FIRM_NIF], 'Patrocínio judiciário', 54000, 'AD', 'S'],
      ['c3', '2017-12-13', [MUNICIPALITY_NIF], [LAW_FIRM_NIF], 'Assessoria jurídica 2018', 72000, 'AD', 'S'],
    ],
    adjudicantes: [{ id: MUNICIPALITY_NIF, n: 3, v: 149406, d0: '2016-04-13', d1: '2017-12-13',
      anos: { 2016: [1, 23406, 1, 23406, 0, 0], 2017: [2, 126000, 2, 126000, 0, 0] } }],
  },
};

export const DR_CONCESSION = {
  total: 2, recolhidoEm: RECOLHA,
  itens: [
    { id: '900043', tipo: 'Contrato', numero: '43/2026', data: '2026-05-15', serie: '2',
      emissor: 'Economia - Gabinete do Secretário de Estado do Turismo', url: 'https://diariodarepublica.pt/dr/detalhe/contrato/43-2026-900043',
      sumario: 'Contrato de concessão do exclusivo da exploração de jogos de fortuna ou azar na Zona de Jogo do Norte' },
    { id: '900044', tipo: 'Acórdão', numero: '1234/20.1T8PRT', data: '2023-10-23', serie: '2',
      emissor: 'Tribunal da Relação do Porto', url: 'https://diariodarepublica.pt/dr/detalhe/acordao/900044', sumario: 'Recurso laboral' },
  ],
};

export function wikipediaStep(graph) {
  const mentions = G.extractOrganisations(WIKIPEDIA_TEXT, { exclude: graph.nos[G.SUBJECT].nomes });
  G.addCoMentions(graph, mentions, WIKIPEDIA_SOURCE);
  G.consolidateOrgs(graph);
  return mentions;
}

// O percurso completo: declarações, Wikidata, Wikipédia, NIF confirmado pela pessoa, contratos e atos do Diário da República.
export function buildInvestigation({ wikipedia = true, contracts = true, acts = true } = {}) {
  const graph = G.createGraph({ tipo: 'person', nome: 'Ana Exemplo Ferraz' });
  G.addParliament(graph, PARLIAMENT_FILE, { recolhidoEm: RECOLHA });
  G.addWikidata(graph, WIKIDATA_PROFILE, { recolhidoEm: RECOLHA });
  if (wikipedia) wikipediaStep(graph);
  if (contracts) {
    const firm = G.orgId('AE&F, Sociedade de Advogados, RL');
    const kept = G.confirmIdentity(graph, firm, { nif: LAW_FIRM_NIF, nome: LAW_FIRM });
    G.addSupplier(graph, kept, LAW_FIRM_SUPPLIER, { recolhidoEm: RECOLHA });
  }
  if (acts && wikipedia) {
    const payer = G.orgId('Casinos Atlântico');
    G.addActs(graph, payer, DR_CONCESSION, { ligacao: 'nome', consulta: '"Casinos Atlântico" concessão' });
    graph.consultas.push({ pergunta: `atos:${payer}`, em: RECOLHA });
  }
  return graph;
}

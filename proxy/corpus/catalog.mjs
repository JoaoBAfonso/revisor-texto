// Catálogo dos diplomas que entram no «cérebro jurídico». O nome é o do PGDL (Procuradoria-Geral Distrital de Lisboa),
// de onde se obtém o texto consolidado. Para acrescentar um diploma: nova linha aqui e `node corpus/build.mjs`.
//
// rank: posição na hierarquia das normas (quanto menor, mais forte).
// area: áreas de `guia.js` a que o diploma pertence (serve para cruzar o diploma com as áreas jurídicas).
// alias: expressões que, no texto de outros diplomas, o identificam («do Código Civil»).

export const RANKS = [
  { rank: 0, name: 'Constituição', note: 'Topo da hierarquia: nenhuma norma a pode contrariar (art. 3.º, n.º 3, e art. 277.º da CRP).' },
  { rank: 1, name: 'Direito da União Europeia e convenções internacionais', note: 'Prevalecem sobre a lei ordinária (art. 8.º da CRP).' },
  { rank: 2, name: 'Leis de valor reforçado', note: 'Leis orgânicas, leis de bases e estatutos: condicionam as leis comuns (art. 112.º da CRP).' },
  { rank: 3, name: 'Códigos', note: 'Sistematizam um ramo do direito e são a base de interpretação das leis especiais.' },
  { rank: 4, name: 'Leis e decretos-leis', note: 'Atos legislativos da Assembleia da República e do Governo, com o mesmo valor (art. 112.º, n.º 2).' },
  { rank: 5, name: 'Regimes sectoriais e regionais', note: 'Regimes especiais que prevalecem sobre o geral na sua matéria (lex specialis), decretos legislativos regionais e regulamentares.' },
  { rank: 6, name: 'Portarias, resoluções e atos administrativos', note: 'Regulamentam as leis e não as podem contrariar; as resoluções do Conselho de Ministros orientam a administração.' },
];

const A = (id, name, short, rank, area = [], alias = []) => ({ id, name, short, rank, area, alias });

export const CATALOG = [
  A('crp', 'Constituição da República Portuguesa', 'CRP', 0, ['*'], ['Constitui[çc][ãa]o', 'CRP']),

  A('rgpd', 'Regulamento Geral sobre a Proteção de Dados (RGPD) da União Europeia (UE)', 'RGPD', 1, ['dados'], ['RGPD', 'Regulamento Geral sobre a Prote[çc][ãa]o de Dados']),

  A('ltc', 'Lei Orgânica do Tribunal Constitucional', 'LTC', 2, ['*']),
  A('lbh', 'Lei de bases da habitação', 'Lei de Bases da Habitação', 2, ['arrendamento'], ['Lei de Bases da Habita[çc][ãa]o']),
  // A busca do PGDL por «Lei de Bases do Ambiente» devolve a revogada Lei n.º 11/87: o nid fixa a Lei n.º 19/2014.
  { ...A('lba', 'Lei de Bases do Ambiente', 'Lei de Bases do Ambiente', 2, ['ambiente'], ['Lei de Bases do Ambiente', 'Lei de Bases da Pol[íi]tica de Ambiente']), nid: 2091 },
  { ...A('lbs', 'Lei de Bases da Saúde', 'Lei de Bases da Saúde', 2, ['saude'], ['Lei de Bases da Sa[úu]de']), nid: 3197 },
  A('segsocial', 'As Bases Gerais do Sistema de Segurança Social', 'Bases da Segurança Social', 2, ['seguranca-social']),
  A('losj', 'Lei da Organização do Sistema Judiciário', 'LOSJ', 2, ['*'], ['LOSJ']),
  A('estmp', 'Estatuto do Ministério Público (Novo)', 'Estatuto do MP', 2, ['*']),
  A('estmj', 'Estatuto dos Magistrados Judiciais', 'Estatuto dos Magistrados Judiciais', 2, ['*']),
  A('eoa', 'Estatuto da Ordem dos Advogados', 'Estatuto da Ordem dos Advogados', 2, ['*']),
  A('prov', 'Estatuto do Provedor de Justiça', 'Estatuto do Provedor de Justiça', 2, ['*']),
  A('acessodireito', 'Acesso ao Direito e aos Tribunais', 'Acesso ao Direito', 2, ['*']),

  A('cc', 'Código Civil', 'Código Civil', 3, ['arrendamento', 'familia', 'propriedade', 'contratacao', 'dividas', 'honra', 'privacidade'], ['C[óo]digo Civil', 'CC']),
  A('cpc', 'Código de Processo Civil (Novo)', 'Código de Processo Civil', 3, ['*'], ['C[óo]digo de Processo Civil', 'CPC']),
  A('cp', 'Código Penal de 1982 Versão consolidada posterior a 1995', 'Código Penal', 3, ['honra', 'privacidade', 'justica', 'arguido', 'corrupcao', 'odio', 'menores', 'digital'], ['C[óo]digo Penal', 'CP']),
  A('cpp', 'Código de Processo Penal', 'Código de Processo Penal', 3, ['justica', 'arguido', 'honra', 'privacidade'], ['C[óo]digo de Processo Penal', 'CPP']),
  A('ct', 'Código do Trabalho', 'Código do Trabalho', 3, ['trabalho'], ['C[óo]digo do Trabalho', 'CT']),
  A('cpt', 'Código de Processo do Trabalho', 'Código de Processo do Trabalho', 3, ['trabalho'], ['C[óo]digo de Processo do Trabalho', 'CPT']),
  A('csc', 'Código das Sociedades Comerciais', 'Código das Sociedades Comerciais', 3, ['contratacao'], ['C[óo]digo das Sociedades Comerciais', 'CSC']),
  A('cpa', 'Código do Procedimento Administrativo (Novo)', 'Código do Procedimento Administrativo', 3, ['acesso', 'administrativo', 'participacao'], ['C[óo]digo do Procedimento Administrativo', 'CPA']),
  A('cpta', 'Código de Processo nos Tribunais Administrativos', 'Código de Processo nos Tribunais Administrativos', 3, ['administrativo'], ['C[óo]digo de Processo nos Tribunais Administrativos', 'CPTA']),
  A('cppt', 'Código de Procedimento e de Processo Tributário', 'Código de Procedimento e de Processo Tributário', 3, ['impostos'], ['C[óo]digo de Procedimento e de Processo Tribut[áa]rio', 'CPPT']),
  A('ccp', 'Código dos Contratos Públicos (CCP)', 'Código dos Contratos Públicos', 3, ['acesso', 'contratacao'], ['C[óo]digo dos Contratos P[úu]blicos', 'CCP']),
  A('cire', 'Código da Insolvência e da Recuperação de Empresas', 'CIRE', 3, ['dividas'], ['C[óo]digo da Insolv[êe]ncia', 'CIRE']),
  A('cdadc', 'Código do Direito de Autor e dos Direitos Conexos', 'Código do Direito de Autor', 3, ['propriedade', 'autor'], ['C[óo]digo do Direito de Autor', 'CDADC']),
  A('cpi', 'Código da Propriedade Industrial', 'Código da Propriedade Industrial', 3, ['propriedade'], ['C[óo]digo da Propriedade Industrial', 'CPI']),
  A('crpred', 'Código do Registo Predial', 'Código do Registo Predial', 3, ['propriedade', 'arrendamento']),
  A('crciv', 'Código do Registo Civil', 'Código do Registo Civil', 3, ['familia']),
  A('crcom', 'Código do Registo Comercial', 'Código do Registo Comercial', 3, ['contratacao']),
  A('cnot', 'Código do Notariado', 'Código do Notariado', 3, ['propriedade']),
  A('cest', 'Código da Estrada', 'Código da Estrada', 3, ['justica', 'arguido'], ['C[óo]digo da Estrada']),
  A('cexp', 'Código das Expropriações', 'Código das Expropriações', 3, ['propriedade'], ['C[óo]digo das Expropria[çc][õo]es']),
  A('cpub', 'Código da Publicidade', 'Código da Publicidade', 3, ['consumo', 'imprensa', 'resposta'], ['C[óo]digo da Publicidade']),
  A('cvm', 'Código dos Valores Mobiliários', 'Código dos Valores Mobiliários', 3, ['contratacao'], ['C[óo]digo dos Valores Mobili[áa]rios', 'CVM']),
  A('cepmpl', 'Código da Execução das Penas e Medidas Privativas da Liberdade', 'Código da Execução das Penas', 3, ['justica', 'arguido']),

  A('lgt', 'Lei Geral Tributária', 'Lei Geral Tributária', 4, ['impostos'], ['Lei Geral Tribut[áa]ria', 'LGT']),
  A('lgtfp', 'Lei Geral do Trabalho em Funções Públicas', 'Lei Geral do Trabalho em Funções Públicas', 4, ['trabalho'], ['LTFP']),
  A('nrau', 'Novo Regime do Arrendamento Urbano (NRAU)', 'NRAU', 4, ['arrendamento'], ['NRAU', 'Novo Regime do Arrendamento Urbano']),
  A('ph', 'Regime da Propriedade Horizontal', 'Propriedade Horizontal', 4, ['propriedade', 'arrendamento']),
  A('obrasarrend', 'Regime Jurídico das Obras em Prédios Arrendados', 'Obras em Prédios Arrendados', 4, ['arrendamento']),
  A('lada', 'Lei de Acesso aos Documentos da Administração (LADA)', 'LADA', 4, ['acesso'], ['LADA', 'Lei de Acesso aos Documentos']),
  A('lpd', 'Lei da Proteção de Dados Pessoais', 'Lei da Proteção de Dados', 4, ['dados']),
  A('imprensa', 'Lei de Imprensa', 'Lei de Imprensa', 4, ['imprensa', 'resposta', 'honra', 'privacidade']),
  A('tv', 'Lei da Televisão e dos Serviços Audiovisuais a Pedido', 'Lei da Televisão', 4, ['imprensa', 'resposta']),
  // A busca do PGDL por «Lei da Rádio» devolve a revogada Lei n.º 4/2001: o nid fixa a Lei n.º 54/2010.
  { ...A('radio', 'Lei da Rádio', 'Lei da Rádio', 4, ['imprensa', 'resposta'], ['Lei da R[áa]dio']), nid: 1293 },
  { ...A('erc', 'Entidade Reguladora para a Comunicação Social (ERC)', 'Estatutos da ERC', 4, ['imprensa', 'resposta'], ['Entidade Reguladora para a Comunica[çc][ãa]o Social', 'ERC']), nid: 588 },
  A('estjorn', 'Estatuto do Jornalista', 'Estatuto do Jornalista', 4, ['imprensa', 'resposta', 'sigilo']),
  A('cibercrime', 'Lei do Cibercrime', 'Lei do Cibercrime', 4, ['justica', 'arguido', 'dados']),
  A('consumidor', 'Lei de Defesa do Consumidor', 'Lei de Defesa do Consumidor', 4, ['consumo']),
  { ...A('vendabens', 'Compra e Venda de Bens de Consumo e Conteúdos Digitais', 'Venda de Bens de Consumo', 4, ['consumo']), nid: 3471 },
  A('nacionalidade', 'Lei da Nacionalidade', 'Lei da Nacionalidade', 4, ['estrangeiros']),
  A('estrangeiros', 'Entrada, Permanência, Saída e Afastamento de Estrangeiros', 'Lei de Estrangeiros', 4, ['estrangeiros']),
  A('segint', 'Lei de Segurança Interna', 'Lei de Segurança Interna', 4, ['justica', 'arguido']),
  A('rcee', 'Responsabilidade Civil Extracontratual do Estado e Pessoas Colectivas de Direito Público', 'Responsabilidade do Estado', 4, ['administrativo']),
  A('denunciantes', 'Regime Geral de Proteção de Denunciantes de Infrações', 'Proteção de Denunciantes', 4, ['acesso', 'trabalho', 'denunciantes', 'corrupcao']),
  A('segredo', 'Lei do Segredo de Estado', 'Segredo de Estado', 4, ['acesso', 'sigilo']),
  A('lobby', 'Lei do Lobby - Registo de Transparência da Representação de Interesses', 'Lei do Lobby', 4, ['acesso', 'corrupcao']),
  A('partidos', 'Lei dos Partidos Políticos', 'Lei dos Partidos Políticos', 4, ['acesso', 'eleicoes']),
  A('finpart', 'Financiamento dos Partidos Políticos', 'Financiamento dos Partidos', 4, ['acesso', 'eleicoes']),
  A('relig', 'Lei da Liberdade Religiosa', 'Liberdade Religiosa', 4, ['participacao']),
  A('saudemental', 'Lei da Saúde Mental', 'Lei da Saúde Mental', 4, ['saude']),
  A('vitima', 'Estatuto da Vítima', 'Estatuto da Vítima', 4, ['justica', 'arguido', 'familia', 'violencia']),
  { ...A('divorcio', 'Alterações ao Regime Jurídico do Divórcio', 'Lei do Divórcio', 4, ['familia']), nid: 1028 },
  A('vd', 'Regime Jurídico Aplicável à Prevenção da Violência Doméstica e à Protecção e Assistência Suas Vítimas', 'Violência Doméstica', 4, ['justica', 'arguido', 'familia', 'violencia']),
];

export const ALIASES = CATALOG.filter((d) => d.alias.length).map((d) => [d.id, new RegExp(`^(?:${d.alias.join('|')})\\b`, 'i')]);

// Importa direito da União Europeia (Tratados, Carta e atos de direito derivado relevantes) para o «cérebro jurídico».
//
// O EUR-Lex bloqueia pedidos automáticos, mas o Serviço das Publicações serve o mesmo texto em português através do
// Cellar (publications.europa.eu/resource/celex/<CELEX>) por negociação de conteúdo: XHTML para atos recentes e HTML
// para os antigos. Grava data/lei/<id>.json e a lista em corpus/eu/docs.json.
//
//   node corpus/eu.mjs           descarrega o que falta
//   node corpus/eu.mjs --force   volta a descarregar tudo
// Depois: node corpus/build.mjs --index
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEu } from './eu-parse.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', '..', 'data', 'lei');
mkdirSync(join(HERE, 'eu'), { recursive: true });
const FORCE = process.argv.includes('--force');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// [id, CELEX, referência oficial, designação, sigla, áreas (ids de guia.js), alias (regex) para citações]
const ACTS = [
  ['tue', '12016M/TXT', 'Tratado da União Europeia', 'Tratado da União Europeia (versão consolidada)', 'TUE', ['participacao', 'justica'], ['TUE', 'Tratado da Uni[ãa]o Europeia']],
  ['tfue', '12016E/TXT', 'Tratado sobre o Funcionamento da União Europeia', 'Tratado sobre o Funcionamento da União Europeia (versão consolidada)', 'TFUE', ['consumo', 'trabalho', 'estrangeiros'], ['TFUE', 'Tratado sobre o Funcionamento da Uni[ãa]o Europeia']],
  ['carta-ue', '12016P/TXT', 'Carta dos Direitos Fundamentais da União Europeia', 'Carta dos Direitos Fundamentais da União Europeia', 'Carta UE', ['honra', 'privacidade', 'dados', 'justica', 'imprensa'], ['Carta dos Direitos Fundamentais da Uni[ãa]o Europeia', 'CDFUE', 'Carta UE']],
  ['dir-2016-680', '32016L0680', 'Diretiva (UE) 2016/680', 'Proteção de dados pessoais no âmbito penal', 'Diretiva 2016/680', ['dados', 'justica'], ['Diretiva \\(UE\\) 2016\\/680']],
  ['dir-2002-58', '32002L0058', 'Diretiva 2002/58/CE', 'Privacidade e comunicações eletrónicas (ePrivacy)', 'ePrivacy', ['dados', 'digital', 'privacidade'], ['Diretiva 2002\\/58\\/CE', 'ePrivacy']],
  ['dsa', '32022R2065', 'Regulamento (UE) 2022/2065', 'Regulamento dos Serviços Digitais (DSA)', 'DSA', ['digital', 'imprensa', 'odio', 'honra'], ['Regulamento \\(UE\\) 2022\\/2065', 'DSA', 'Regulamento dos Servi[çc]os Digitais']],
  ['dma', '32022R1925', 'Regulamento (UE) 2022/1925', 'Regulamento dos Mercados Digitais (DMA)', 'DMA', ['digital', 'consumo'], ['Regulamento \\(UE\\) 2022\\/1925', 'DMA']],
  ['emfa', '32024R1083', 'Regulamento (UE) 2024/1083', 'Lei Europeia da Liberdade dos Meios de Comunicação Social', 'EMFA', ['imprensa', 'sigilo'], ['Regulamento \\(UE\\) 2024\\/1083', 'EMFA', 'Lei Europeia da Liberdade dos Meios de Comunica[çc][ãa]o Social']],
  ['anti-slapp', '32024L1069', 'Diretiva (UE) 2024/1069', 'Proteção de jornalistas e defensores de direitos contra ações judiciais abusivas (anti-SLAPP)', 'Anti-SLAPP', ['imprensa', 'honra', 'justica'], ['Diretiva \\(UE\\) 2024\\/1069', 'anti-SLAPP']],
  ['publicidade-politica', '32024R0900', 'Regulamento (UE) 2024/900', 'Transparência e direcionamento da publicidade política', 'Publicidade política', ['eleicoes', 'digital'], ['Regulamento \\(UE\\) 2024\\/900']],
  ['ia', '32024R1689', 'Regulamento (UE) 2024/1689', 'Regulamento da Inteligência Artificial', 'Regulamento IA', ['digital', 'dados'], ['Regulamento \\(UE\\) 2024\\/1689', 'Regulamento da Intelig[êe]ncia Artificial']],
  ['acesso-docs-ue', '32001R1049', 'Regulamento (CE) n.º 1049/2001', 'Acesso do público aos documentos do Parlamento, do Conselho e da Comissão', 'Reg. 1049/2001', ['acesso'], ['Regulamento \\(CE\\) n\\.?º\\s*1049\\/2001']],
  ['denunciantes-ue', '32019L1937', 'Diretiva (UE) 2019/1937', 'Proteção das pessoas que denunciam violações do direito da União', 'Diretiva denunciantes', ['denunciantes', 'corrupcao'], ['Diretiva \\(UE\\) 2019\\/1937']],
  ['avmsd', '32018L1808', 'Diretiva (UE) 2018/1808', 'Serviços de comunicação social audiovisual (altera a Diretiva 2010/13/UE)', 'Diretiva SCSA', ['imprensa', 'digital', 'odio'], ['Diretiva \\(UE\\) 2018\\/1808']],
  ['direito-autor-mud', '32019L0790', 'Diretiva (UE) 2019/790', 'Direito de autor e direitos conexos no mercado único digital', 'Diretiva direito de autor', ['autor', 'digital'], ['Diretiva \\(UE\\) 2019\\/790']],
  ['infosoc', '32001L0029', 'Diretiva 2001/29/CE', 'Direito de autor na sociedade da informação', 'InfoSoc', ['autor', 'digital'], ['Diretiva 2001\\/29\\/CE']],
  ['comercio-eletronico-ue', '32000L0031', 'Diretiva 2000/31/CE', 'Comércio eletrónico', 'Diretiva e-commerce', ['digital', 'honra', 'consumo'], ['Diretiva 2000\\/31\\/CE']],
  ['dados-abertos', '32019L1024', 'Diretiva (UE) 2019/1024', 'Dados abertos e reutilização de informações do setor público', 'Dados abertos', ['acesso'], ['Diretiva \\(UE\\) 2019\\/1024']],
  ['info-ambiente-ue', '32003L0004', 'Diretiva 2003/4/CE', 'Acesso do público às informações sobre ambiente', 'Diretiva info. ambiente', ['acesso', 'ambiente'], ['Diretiva 2003\\/4\\/CE']],
  ['vitimas-ue', '32012L0029', 'Diretiva 2012/29/UE', 'Direitos, apoio e proteção das vítimas da criminalidade', 'Diretiva vítimas', ['justica', 'violencia'], ['Diretiva 2012\\/29\\/UE']],
  ['inocencia-ue', '32016L0343', 'Diretiva (UE) 2016/343', 'Reforço da presunção de inocência e direito de comparecer em julgamento', 'Diretiva presunção de inocência', ['arguido', 'honra', 'justica'], ['Diretiva \\(UE\\) 2016\\/343']],
  ['info-penal-ue', '32012L0013', 'Diretiva 2012/13/UE', 'Direito à informação em processo penal', 'Diretiva informação penal', ['arguido'], ['Diretiva 2012\\/13\\/UE']],
  ['traducao-penal-ue', '32010L0064', 'Diretiva 2010/64/UE', 'Interpretação e tradução em processo penal', 'Diretiva tradução penal', ['arguido'], ['Diretiva 2010\\/64\\/UE']],
  ['advogado-penal-ue', '32013L0048', 'Diretiva 2013/48/UE', 'Direito de acesso a um advogado em processo penal', 'Diretiva acesso a advogado', ['arguido'], ['Diretiva 2013\\/48\\/UE']],
  ['consumidores-ue', '32011L0083', 'Diretiva 2011/83/UE', 'Direitos dos consumidores', 'Diretiva direitos dos consumidores', ['consumo'], ['Diretiva 2011\\/83\\/UE']],
  ['clausulas-abusivas-ue', '31993L0013', 'Diretiva 93/13/CEE', 'Cláusulas abusivas nos contratos celebrados com consumidores', 'Diretiva cláusulas abusivas', ['consumo'], ['Diretiva 93\\/13\\/CEE']],
  ['praticas-desleais-ue', '32005L0029', 'Diretiva 2005/29/CE', 'Práticas comerciais desleais', 'Diretiva práticas desleais', ['consumo'], ['Diretiva 2005\\/29\\/CE']],
  ['venda-bens-ue', '32019L0771', 'Diretiva (UE) 2019/771', 'Contratos de compra e venda de bens', 'Diretiva venda de bens', ['consumo'], ['Diretiva \\(UE\\) 2019\\/771']],
  ['conteudos-digitais-ue', '32019L0770', 'Diretiva (UE) 2019/770', 'Fornecimento de conteúdos e serviços digitais', 'Diretiva conteúdos digitais', ['consumo', 'digital'], ['Diretiva \\(UE\\) 2019\\/770']],
  ['livre-circulacao-ue', '02004L0038-20110616', 'Diretiva 2004/38/CE', 'Direito de livre circulação e residência dos cidadãos da União', 'Diretiva livre circulação', ['estrangeiros'], ['Diretiva 2004\\/38\\/CE']],
  ['igualdade-racial-ue', '32000L0043', 'Diretiva 2000/43/CE', 'Igualdade de tratamento sem distinção de origem racial ou étnica', 'Diretiva igualdade racial', ['odio', 'trabalho'], ['Diretiva 2000\\/43\\/CE']],
  ['igualdade-emprego-ue', '32000L0078', 'Diretiva 2000/78/CE', 'Igualdade de tratamento no emprego e na atividade profissional', 'Diretiva igualdade no emprego', ['trabalho', 'deficiencia'], ['Diretiva 2000\\/78\\/CE']],
  ['tempo-trabalho-ue', '32003L0088', 'Diretiva 2003/88/CE', 'Organização do tempo de trabalho', 'Diretiva tempo de trabalho', ['trabalho'], ['Diretiva 2003\\/88\\/CE']],
  ['condicoes-trabalho-ue', '32019L1152', 'Diretiva (UE) 2019/1152', 'Condições de trabalho transparentes e previsíveis', 'Diretiva condições de trabalho', ['trabalho'], ['Diretiva \\(UE\\) 2019\\/1152']],
  ['conciliacao-ue', '32019L1158', 'Diretiva (UE) 2019/1158', 'Equilíbrio entre a vida profissional e a vida familiar', 'Diretiva conciliação', ['trabalho', 'familia'], ['Diretiva \\(UE\\) 2019\\/1158']],
  ['igualdade-genero-ue', '32006L0054', 'Diretiva 2006/54/CE', 'Igualdade de oportunidades e de tratamento entre homens e mulheres no emprego', 'Diretiva igualdade de género', ['trabalho'], ['Diretiva 2006\\/54\\/CE']],
  ['retorno-ue', '32008L0115', 'Diretiva 2008/115/CE', 'Normas comuns para o regresso de nacionais de países terceiros em situação irregular', 'Diretiva retorno', ['estrangeiros'], ['Diretiva 2008\\/115\\/CE']],
  ['dublin-iii', '32013R0604', 'Regulamento (UE) n.º 604/2013', 'Determinação do Estado responsável pela análise de pedidos de proteção internacional (Dublin III)', 'Dublin III', ['estrangeiros'], ['Regulamento \\(UE\\) n\\.?º\\s*604\\/2013']],
  ['asilo-procedimentos-ue', '32013L0032', 'Diretiva 2013/32/UE', 'Procedimentos comuns de concessão e retirada da proteção internacional', 'Diretiva procedimentos de asilo', ['estrangeiros'], ['Diretiva 2013\\/32\\/UE']],
  ['passageiros-aereos-ue', '32004R0261', 'Regulamento (CE) n.º 261/2004', 'Direitos dos passageiros dos transportes aéreos', 'Reg. 261/2004', ['consumo'], ['Regulamento \\(CE\\) n\\.?º\\s*261\\/2004']],
  ['viagens-organizadas-ue', '32015L2302', 'Diretiva (UE) 2015/2302', 'Viagens organizadas e serviços de viagem conexos', 'Diretiva viagens organizadas', ['consumo'], ['Diretiva \\(UE\\) 2015\\/2302']],
  ['bruxelas-i', '32012R1215', 'Regulamento (UE) n.º 1215/2012', 'Competência judiciária, reconhecimento e execução de decisões em matéria civil e comercial (Bruxelas I bis)', 'Bruxelas I bis', ['justica'], ['Regulamento \\(UE\\) n\\.?º\\s*1215\\/2012']],
  ['roma-i', '32008R0593', 'Regulamento (CE) n.º 593/2008', 'Lei aplicável às obrigações contratuais (Roma I)', 'Roma I', ['justica', 'consumo'], ['Regulamento \\(CE\\) n\\.?º\\s*593\\/2008']],
  ['roma-ii', '32007R0864', 'Regulamento (CE) n.º 864/2007', 'Lei aplicável às obrigações extracontratuais (Roma II)', 'Roma II', ['justica', 'honra'], ['Regulamento \\(CE\\) n\\.?º\\s*864\\/2007']],
  ['estado-direito-ue', '32020R2092', 'Regulamento (UE, Euratom) 2020/2092', 'Regime geral de condicionalidade para a proteção do orçamento da União', 'Condicionalidade', ['corrupcao', 'participacao'], ['Regulamento \\(UE, Euratom\\) 2020\\/2092']],
  ['terrorismo-online-ue', '32021R0784', 'Regulamento (UE) 2021/784', 'Combate à difusão de conteúdos terroristas em linha', 'Conteúdos terroristas', ['digital', 'odio'], ['Regulamento \\(UE\\) 2021\\/784']],
  ['pif-ue', '32017L1371', 'Diretiva (UE) 2017/1371', 'Luta contra a fraude lesiva dos interesses financeiros da União (PIF)', 'Diretiva PIF', ['corrupcao'], ['Diretiva \\(UE\\) 2017\\/1371']],
  ['contratacao-publica-ue', '32014L0024', 'Diretiva 2014/24/UE', 'Contratação pública', 'Diretiva contratação pública', ['contratacao', 'corrupcao'], ['Diretiva 2014\\/24\\/UE']],
  ['saude-transfronteirica-ue', '32011L0024', 'Diretiva 2011/24/UE', 'Aplicação dos direitos dos doentes em matéria de cuidados de saúde transfronteiriços', 'Diretiva cuidados transfronteiriços', ['saude'], ['Diretiva 2011\\/24\\/UE']],
  ['aia-ue', '32011L0092', 'Diretiva 2011/92/UE', 'Avaliação dos efeitos de certos projetos no ambiente', 'Diretiva AIA', ['ambiente', 'participacao'], ['Diretiva 2011\\/92\\/UE']],
  ['aae-ue', '32001L0042', 'Diretiva 2001/42/CE', 'Avaliação dos efeitos de determinados planos e programas no ambiente', 'Diretiva AAE', ['ambiente', 'participacao'], ['Diretiva 2001\\/42\\/CE']],
  ['agua-ue', '32000L0060', 'Diretiva 2000/60/CE', 'Quadro de ação comunitária no domínio da política da água', 'Diretiva-Quadro da Água', ['ambiente'], ['Diretiva 2000\\/60\\/CE']],
  ['habitats-ue', '31992L0043', 'Diretiva 92/43/CEE', 'Preservação dos habitats naturais e da fauna e da flora selvagens', 'Diretiva Habitats', ['ambiente'], ['Diretiva 92\\/43\\/CEE']],
  ['aves-ue', '32009L0147', 'Diretiva 2009/147/CE', 'Conservação das aves selvagens', 'Diretiva Aves', ['ambiente'], ['Diretiva 2009\\/147\\/CE']],
  ['resp-ambiental-ue', '32004L0035', 'Diretiva 2004/35/CE', 'Responsabilidade ambiental', 'Diretiva responsabilidade ambiental', ['ambiente'], ['Diretiva 2004\\/35\\/CE']],
  ['residuos-ue', '32008L0098', 'Diretiva 2008/98/CE', 'Resíduos', 'Diretiva resíduos', ['ambiente'], ['Diretiva 2008\\/98\\/CE']],
  ['acessibilidade-ue', '32019L0882', 'Diretiva (UE) 2019/882', 'Requisitos de acessibilidade dos produtos e serviços', 'Ato Europeu da Acessibilidade', ['deficiencia'], ['Diretiva \\(UE\\) 2019\\/882']],
  ['acessibilidade-web-ue', '32016L2102', 'Diretiva (UE) 2016/2102', 'Acessibilidade dos sítios web e das aplicações móveis de organismos do setor público', 'Diretiva acessibilidade web', ['deficiencia', 'digital'], ['Diretiva \\(UE\\) 2016\\/2102']],
  ['atrasos-pagamento-ue', '32011L0007', 'Diretiva 2011/7/UE', 'Combate aos atrasos de pagamento nas transações comerciais', 'Diretiva atrasos de pagamento', ['dividas', 'contratacao'], ['Diretiva 2011\\/7\\/UE']],
  ['credito-habitacao-ue', '32014L0017', 'Diretiva 2014/17/UE', 'Contratos de crédito aos consumidores para imóveis de habitação', 'Diretiva crédito habitação', ['dividas', 'arrendamento'], ['Diretiva 2014\\/17\\/UE']],
  ['credito-consumo-ue', '32008L0048', 'Diretiva 2008/48/CE', 'Contratos de crédito aos consumidores', 'Diretiva crédito ao consumo', ['dividas', 'consumo'], ['Diretiva 2008\\/48\\/CE']],
  ['ral-ue', '32013L0011', 'Diretiva 2013/11/UE', 'Resolução alternativa de litígios de consumo', 'Diretiva RAL', ['consumo', 'justica'], ['Diretiva 2013\\/11\\/UE']],
  ['salarios-minimos-ue', '32022L2041', 'Diretiva (UE) 2022/2041', 'Salários mínimos adequados na União Europeia', 'Diretiva salários mínimos', ['trabalho'], ['Diretiva \\(UE\\) 2022\\/2041']],
  ['trabalho-plataformas-ue', '32024L2831', 'Diretiva (UE) 2024/2831', 'Melhoria das condições de trabalho nas plataformas digitais', 'Diretiva trabalho em plataformas', ['trabalho', 'digital'], ['Diretiva \\(UE\\) 2024\\/2831']],
  ['transparencia-salarial-ue', '32023L0970', 'Diretiva (UE) 2023/970', 'Transparência salarial e igualdade de remuneração entre homens e mulheres', 'Diretiva transparência salarial', ['trabalho'], ['Diretiva \\(UE\\) 2023\\/970']],
  ['destacamento-ue', '31996L0071', 'Diretiva 96/71/CE', 'Destacamento de trabalhadores no âmbito de uma prestação de serviços', 'Diretiva destacamento', ['trabalho', 'estrangeiros'], ['Diretiva 96\\/71\\/CE']],
  ['despedimento-coletivo-ue', '31998L0059', 'Diretiva 98/59/CE', 'Aproximação das legislações sobre despedimentos coletivos', 'Diretiva despedimentos coletivos', ['trabalho'], ['Diretiva 98\\/59\\/CE']],
  ['transferencia-empresas-ue', '32001L0023', 'Diretiva 2001/23/CE', 'Manutenção dos direitos dos trabalhadores em caso de transferência de empresas', 'Diretiva transferência de empresas', ['trabalho'], ['Diretiva 2001\\/23\\/CE']],
  ['insolvencia-empregador-ue', '32008L0094', 'Diretiva 2008/94/CE', 'Proteção dos trabalhadores em caso de insolvência do empregador', 'Diretiva insolvência do empregador', ['trabalho', 'dividas'], ['Diretiva 2008\\/94\\/CE']],
  ['trabalho-temporario-ue', '32008L0104', 'Diretiva 2008/104/CE', 'Trabalho temporário', 'Diretiva trabalho temporário', ['trabalho'], ['Diretiva 2008\\/104\\/CE']],
  ['sst-ue', '31989L0391', 'Diretiva 89/391/CEE', 'Melhoria da segurança e da saúde dos trabalhadores no trabalho (diretiva-quadro)', 'Diretiva-quadro SST', ['trabalho', 'saude'], ['Diretiva 89\\/391\\/CEE']],
  ['info-consulta-ue', '32002L0014', 'Diretiva 2002/14/CE', 'Quadro geral de informação e consulta dos trabalhadores', 'Diretiva informação e consulta', ['trabalho'], ['Diretiva 2002\\/14\\/CE']],
  ['mde', '02002F0584-20090328', 'Decisão-Quadro 2002/584/JAI', 'Mandado de detenção europeu e processos de entrega entre Estados-Membros', 'MDE', ['justica', 'arguido'], ['Decis[ãa]o-Quadro 2002\\/584\\/JAI', 'mandado de deten[çc][ãa]o europeu']],
  ['racismo-xenofobia-ue', '32008F0913', 'Decisão-Quadro 2008/913/JAI', 'Luta contra o racismo e a xenofobia por via do direito penal', 'DQ racismo e xenofobia', ['odio'], ['Decis[ãa]o-Quadro 2008\\/913\\/JAI']],
  ['apoio-judiciario-ue', '32016L1919', 'Diretiva (UE) 2016/1919', 'Apoio judiciário para suspeitos e arguidos em processo penal', 'Diretiva apoio judiciário', ['arguido', 'justica'], ['Diretiva \\(UE\\) 2016\\/1919']],
  ['menores-penal-ue', '32016L0800', 'Diretiva (UE) 2016/800', 'Garantias processuais para menores suspeitos ou arguidos em processo penal', 'Diretiva menores em processo penal', ['arguido', 'menores'], ['Diretiva \\(UE\\) 2016\\/800']],
  ['trafico-ue', '32011L0036', 'Diretiva 2011/36/UE', 'Prevenção e luta contra o tráfico de seres humanos e proteção das vítimas', 'Diretiva tráfico de seres humanos', ['violencia', 'estrangeiros'], ['Diretiva 2011\\/36\\/UE']],
  ['abuso-menores-ue', '32011L0093', 'Diretiva 2011/93/UE', 'Luta contra o abuso e a exploração sexual de crianças', 'Diretiva abuso sexual de menores', ['menores', 'violencia', 'digital'], ['Diretiva 2011\\/93\\/UE']],
  ['violencia-mulheres-ue', '32024L1385', 'Diretiva (UE) 2024/1385', 'Combate à violência contra as mulheres e à violência doméstica', 'Diretiva violência contra as mulheres', ['violencia', 'familia'], ['Diretiva \\(UE\\) 2024\\/1385']],
  ['nis2', '32022L2555', 'Diretiva (UE) 2022/2555', 'Medidas para um elevado nível comum de cibersegurança (NIS 2)', 'NIS 2', ['digital', 'dados'], ['Diretiva \\(UE\\) 2022\\/2555', 'NIS ?2']],
  ['data-act', '32023R2854', 'Regulamento (UE) 2023/2854', 'Acesso equitativo aos dados e à sua utilização (Data Act)', 'Data Act', ['dados', 'digital'], ['Regulamento \\(UE\\) 2023\\/2854', 'Data Act']],
  ['dga', '32022R0868', 'Regulamento (UE) 2022/868', 'Governação europeia de dados (Data Governance Act)', 'DGA', ['dados', 'acesso'], ['Regulamento \\(UE\\) 2022\\/868', 'Data Governance Act']],
  ['eidas', '32014R0910', 'Regulamento (UE) n.º 910/2014', 'Identificação eletrónica e serviços de confiança (eIDAS)', 'eIDAS', ['digital', 'administrativo'], ['Regulamento \\(UE\\) n\\.?º\\s*910\\/2014', 'eIDAS']],
  ['acoes-representativas-ue', '32020L1828', 'Diretiva (UE) 2020/1828', 'Ações coletivas para proteção dos interesses dos consumidores', 'Diretiva ações coletivas', ['consumo', 'justica'], ['Diretiva \\(UE\\) 2020\\/1828']],
  ['indicacao-precos-ue', '31998L0006', 'Diretiva 98/6/CE', 'Defesa dos consumidores em matéria de indicações dos preços', 'Diretiva indicação de preços', ['consumo'], ['Diretiva 98\\/6\\/CE']],
  ['passageiros-ferroviarios-ue', '32021R0782', 'Regulamento (UE) 2021/782', 'Direitos e obrigações dos passageiros dos serviços ferroviários', 'Reg. passageiros ferroviários', ['consumo'], ['Regulamento \\(UE\\) 2021\\/782']],
  ['mobilidade-reduzida-ue', '32006R1107', 'Regulamento (CE) n.º 1107/2006', 'Direitos das pessoas com deficiência e com mobilidade reduzida no transporte aéreo', 'Reg. mobilidade reduzida', ['deficiencia', 'consumo'], ['Regulamento \\(CE\\) n\\.?º\\s*1107\\/2006']],
  ['qualificacao-asilo-ue', '32011L0095', 'Diretiva 2011/95/UE', 'Qualificação para beneficiar de proteção internacional', 'Diretiva qualificação', ['estrangeiros'], ['Diretiva 2011\\/95\\/UE']],
  ['acolhimento-ue', '32013L0033', 'Diretiva 2013/33/UE', 'Normas em matéria de acolhimento dos requerentes de proteção internacional', 'Diretiva acolhimento', ['estrangeiros'], ['Diretiva 2013\\/33\\/UE']],
  ['reagrupamento-ue', '32003L0086', 'Diretiva 2003/86/CE', 'Direito ao reagrupamento familiar', 'Diretiva reagrupamento familiar', ['estrangeiros', 'familia'], ['Diretiva 2003\\/86\\/CE']],
  ['residentes-ld-ue', '32003L0109', 'Diretiva 2003/109/CE', 'Estatuto dos nacionais de países terceiros residentes de longa duração', 'Diretiva residentes de longa duração', ['estrangeiros'], ['Diretiva 2003\\/109\\/CE']],
  ['schengen-fronteiras', '32016R0399', 'Regulamento (UE) 2016/399', 'Código da União relativo ao regime de passagem de pessoas nas fronteiras (Código das Fronteiras Schengen)', 'Código Fronteiras Schengen', ['estrangeiros'], ['Regulamento \\(UE\\) 2016\\/399', 'C[óo]digo das Fronteiras Schengen']],
  ['clima-ue', '32021R1119', 'Regulamento (UE) 2021/1119', 'Lei Europeia em matéria de Clima (neutralidade climática em 2050)', 'Lei Europeia do Clima', ['ambiente'], ['Regulamento \\(UE\\) 2021\\/1119', 'Lei Europeia do Clima']],
  ['emissoes-industriais-ue', '32010L0075', 'Diretiva 2010/75/UE', 'Emissões industriais (prevenção e controlo integrados da poluição)', 'Diretiva emissões industriais', ['ambiente'], ['Diretiva 2010\\/75\\/UE']],
  ['qualidade-ar-ue', '32024L2881', 'Diretiva (UE) 2024/2881', 'Qualidade do ar ambiente e um ar mais limpo na Europa', 'Diretiva qualidade do ar', ['ambiente', 'saude'], ['Diretiva \\(UE\\) 2024\\/2881']],
  ['restauro-natureza-ue', '32024R1991', 'Regulamento (UE) 2024/1991', 'Restauro da natureza', 'Reg. restauro da natureza', ['ambiente'], ['Regulamento \\(UE\\) 2024\\/1991']],
  ['crimes-ambientais-ue', '32024L1203', 'Diretiva (UE) 2024/1203', 'Proteção do ambiente através do direito penal', 'Diretiva crimes ambientais', ['ambiente', 'justica'], ['Diretiva \\(UE\\) 2024\\/1203']],
  ['aarhus-ue', '32006R1367', 'Regulamento (CE) n.º 1367/2006', 'Aplicação da Convenção de Aarhus às instituições da União (informação, participação e justiça em matéria de ambiente)', 'Reg. Aarhus', ['ambiente', 'acesso', 'participacao'], ['Regulamento \\(CE\\) n\\.?º\\s*1367\\/2006']],
  ['ice', '32019R0788', 'Regulamento (UE) 2019/788', 'Iniciativa de cidadania europeia', 'ICE', ['participacao', 'eleicoes'], ['Regulamento \\(UE\\) 2019\\/788', 'iniciativa de cidadania europeia']],
  ['ehds', '32025R0327', 'Regulamento (UE) 2025/327', 'Espaço Europeu de Dados de Saúde', 'EHDS', ['saude', 'dados'], ['Regulamento \\(UE\\) 2025\\/327', 'Espa[çc]o Europeu de Dados de Sa[úu]de', 'EHDS']],
];

async function fetchCellar(celex) {
  for (const accept of ['application/xhtml+xml', 'text/html']) {
    for (let i = 0; i < 3; i++) {
      const res = await fetch(`https://publications.europa.eu/resource/celex/${encodeURIComponent(celex)}`, { headers: { Accept: accept, 'Accept-Language': 'por' }, redirect: 'follow' });
      if (res.ok) return { html: await res.text(), accept };
      if (res.status === 404) break;
      await sleep(1500 * (i + 1));
    }
  }
  throw new Error('sem texto em português no Cellar');
}

const entries = [];
for (const [id, celex, ref, name, short, area, alias] of ACTS) {
  const title = `${ref} — ${name}`;
  entries.push({ id, name: `${ref} — ${name}`, short, rank: 1, area, alias, celex, url: `https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:${celex}`, title, eu: true });
  const file = join(OUT, `${id}.json`);
  if (!FORCE && existsSync(file)) continue;
  try {
    const { html } = await fetchCellar(celex);
    const parsed = parseEu(html);
    if (!parsed.arts.length) throw new Error('sem artigos');
    const doc = {
      id, name: `${ref} — ${name}`, short, rank: 1, area, url: entries.at(-1).url, title, secs: parsed.secs,
      arts: parsed.arts,
    };
    writeFileSync(file, JSON.stringify(doc));
    console.log(`✓ ${id.padEnd(26)} ${String(doc.arts.length).padStart(4)} artigos, ${String(doc.secs.length).padStart(3)} divisões`);
  } catch (e) { console.log(`✗ ${id.padEnd(26)} ${e.message}`); }
  await sleep(300);
}
writeFileSync(join(HERE, 'eu', 'docs.json'), JSON.stringify(entries, null, 1));

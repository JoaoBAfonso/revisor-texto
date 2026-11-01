const LADA = 'd75177807';
const QUESTIONS = [
  ['environment', 'O pedido é sobre informação ambiental?', 'Por exemplo, emissões, qualidade da água ou medidas que afetam o ambiente. No acesso geral, confirmar a categoria ativa as regras ambientais. Outros regimes exigem análise da sua articulação.'],
  ['entity', 'A entidade exerce funções da Administração Pública ou poderes públicos?', 'Por exemplo, uma câmara municipal. Uma entidade privada também pode estar abrangida, dependendo das suas funções; fazer trabalho de escritório não basta.'],
  ['document', 'O documento já existe e está na posse da entidade?', 'Pedir um registo existente é diferente de pedir que seja criada uma nova análise.'],
  ['written', 'Já enviaste um pedido escrito que identifica o que pretendes?', 'Conta apenas um pedido apresentado, não um rascunho. Guarda o comprovativo de receção.'],
  ['restricted', 'O documento pode conter informação protegida por lei?', 'Por exemplo, dados pessoais, segredos comerciais ou informação classificada.'],
  ['thirdParty', 'Pedes dados pessoais de outra pessoa?', 'A mera presença de um nome não resolve a classificação jurídica do documento.'],
  ['sensitive', 'Os dados incluem alguma das categorias indicadas abaixo?', 'Origem étnica, opiniões políticas, convicções religiosas ou filosóficas, filiação sindical, dados genéticos ou biométricos, saúde, intimidade da vida privada, vida sexual ou orientação sexual. Indica apenas sim/não/não sei; não introduzas dados pessoais.'],
  ['health', 'O pedido inclui dados de saúde de outra pessoa?', 'Indica apenas a categoria, sem descrever diagnósticos ou reproduzir dados. Este ramo não analisa o acesso aos teus próprios dados.'],
  ['medical', 'Está prevista a intermediação de um médico?', 'A intermediação não cria, por si só, um direito de acesso. Pode ser obrigatória conforme a vontade do titular.'],
  ['directInterest', 'O procedimento diz-te diretamente respeito?', 'Confirma a tua qualidade de interessado. Se não, podemos examinar a extensão por interesse legítimo do artigo 85.º.'],
  ['legitimateInterest', 'Invocas um interesse legítimo em conhecer estes elementos?', 'Não basta curiosidade ou uma afirmação genérica; o sistema não decide se o interesse é juridicamente suficiente.'],
  ['interestProof', 'O requerimento escrito foi instruído com documentos que provam esse interesse?', 'Indica apenas se apresentaste os documentos. Não os introduzas aqui; o sistema não verifica o seu conteúdo ou suficiência.'],
  ['certificateElements', 'A certidão é sobre apresentação, conteúdo, andamento ou resolução de um requerimento?', 'São os elementos enumerados no artigo 84.º. Outras certidões de documentos acessíveis seguem o artigo 83.º, n.º 3.'],
  ['computerized', 'Esses elementos constam de um procedimento informatizado?', 'O prazo especial do artigo 84.º, n.º 3, depende desta condição; não basta enviar o pedido por email.'],
  ['authorization', 'A pessoa autorizou por escrito o acesso aos seus dados?', 'A autorização deve indicar os dados e a finalidade do acesso. Só se aplica a dados de outra pessoa.'],
  ['partial', 'É possível ocultar a informação protegida e entregar o restante?', 'Por exemplo, ocultar os dados pessoais numa cópia do documento.'],
  ['interest', 'Consegues explicar um interesse pessoal protegido pela Constituição?', 'Indica o direito que pretendes exercer ou proteger; esta resposta não demonstra, por si só, que o interesse prevalece sobre a privacidade.'],
];
const FOLLOWUPS = {
  environmentalKind: {
    question: 'Que informação ambiental está em causa?',
    hint: 'Confirma a definição do artigo 3.º. Informação sobre emissões tem regras especiais, mas não afasta todos os limites legais.',
    options: [['unknown', 'Ainda não confirmei'], ['general', 'Informação ambiental, sem relação com emissões'],
      ['emissions', 'Informação relativa a emissões para o ambiente']],
  },
  environmentalReason: {
    question: 'Qual foi a razão ambiental da recusa?',
    hint: 'Seleciona uma razão e, se houver várias, assinala as restantes abaixo.',
    options: [['unknown', 'Não sei / não foi explicado'], ['absent', 'A entidade não detém a informação'],
      ['ongoing', 'Procedimento em curso'], ['internal', 'Comunicações internas entre entidades'],
      ['personal', 'Documentos nominativos / dados pessoais'], ['abusive', 'Pedido manifestamente abusivo ou dados errados/incompletos'],
      ['imprecise', 'Deficiência do pedido que não foi possível sanar'],
      ['confidential', 'Confidencialidade legal do processo ou informação'],
      ['security', 'Relações internacionais, segurança pública ou defesa nacional'],
      ['justice', 'Segredo ou funcionamento da justiça e procedimentos protegidos'],
      ['commercial', 'Confidencialidade comercial/industrial ou segredo estatístico, fiscal ou bancário'],
      ['copyright', 'Direitos de autor ou propriedade industrial'], ['voluntary', 'Proteção de quem forneceu voluntariamente a informação'],
      ['species', 'Proteção do ambiente, como localização de espécies'], ['other', 'Outra razão / fundamento por identificar']],
  },
  interestDecision: {
    question: 'O dirigente do serviço já decidiu sobre o acesso pelo artigo 85.º?',
    hint: 'Um pedido apresentado não equivale a despacho favorável. Confere o teor e o alcance da decisão.',
    options: [['unknown', 'Ainda não confirmei'], ['pending', 'Ainda aguardo despacho'],
      ['granted', 'Há despacho favorável para estes elementos'], ['refused', 'Há despacho de recusa']],
  },
  procedureKind: {
    question: 'O que pretendes obter do procedimento?',
    hint: 'Distinguir informação sobre andamento, consulta e certidões permite escolher as regras do CPA.',
    options: [['unknown', 'Ainda não sei'], ['progress', 'Informação sobre andamento ou decisões'],
      ['consult', 'Consultar o processo'], ['certificate', 'Certidão, reprodução ou declaração autenticada']],
  },
  healthWill: {
    question: 'O que se sabe sobre a vontade do titular quanto ao acesso?',
    hint: 'Não confundir falta de autorização escrita com impossibilidade de apurar a vontade. Não deduzir esta impossibilidade apenas por a pessoa ter falecido.',
    options: [['unknown', 'Ainda não confirmei'], ['known', 'É conhecida e não foi pedida intermediação médica'],
      ['doctor', 'O titular pediu intermediação médica'], ['unascertainable', 'Foi confirmada a impossibilidade de apurar a vontade']],
  },
  regime: {
    question: 'Que tipo de acesso pretendes?',
    hint: 'Escolhe o caso principal. Ter interesse num documento não significa, por si só, que estejas a consultar o teu próprio processo.',
    options: [['unknown', 'Não sei qual é o regime'],
      ['common', 'Acesso geral a documentos administrativos'],
      ['procedure', 'Informação, consulta ou certidões de um procedimento — CPA'],
      ['investigation', 'Documentos de investigação ou de apuramento de responsabilidades'],
      ['registry', 'Documentos notariais, de registo, identificação ou recenseamento eleitoral'],
      ['protected', 'Documentos sujeitos a segredo de justiça, fiscal, bancário ou profissional'],
      ['other', 'Outro regime específico / vários regimes']],
  },
  location: {
    question: 'Porque respondeste que o documento não existe ou não está na entidade?',
    hint: 'Distinguir estas situações muda o que podes pedir.',
    options: [['unknown', 'Não sei'], ['absent', 'A entidade diz que o documento não existe'],
      ['elsewhere', 'Existe, mas está noutra entidade'], ['create', 'Quero uma nova análise ou documento']],
  },
  reason: {
    question: 'Que razão foi dada para limitar o acesso?',
    hint: 'Escolhe uma razão. Se a entidade invocou várias, assinala também as restantes no grupo abaixo.',
    options: [['unknown', 'Não sei / não foi explicado'], ['personal', 'Dados pessoais'],
      ['secret', 'Segredo ou informação protegida'], ['preparatory', 'Processo ainda em curso'],
      ['absent', 'A entidade não tem o documento'], ['imprecise', 'Pedido pouco preciso'],
      ['other', 'Outra razão / várias razões']],
  },
};
const REGIME_GUIDANCE = {
  unknown: 'Identifica primeiro o tipo de acesso. O artigo 1.º, n.º 4, distingue situações sujeitas a outras leis.',
  procedure: 'Para saber o andamento ou as decisões de um processo em que és diretamente interessado, verifica o Código do Procedimento Administrativo (artigo 1.º, n.º 4, alínea a), da LADA).',
  investigation: 'Documentos de investigação ou apuramento de responsabilidades podem ter legislação própria. Identifica o procedimento e a regra aplicável (artigo 1.º, n.º 4, alíneas b) e d)).',
  registry: 'Este tipo de documento pode ter um sistema de acesso próprio. Confirma as regras do registo ou serviço competente (artigo 1.º, n.º 4, alínea c)).',
  protected: 'O segredo invocado exige analisar a lei que o regula. A LADA não afasta automaticamente esses regimes (artigo 1.º, n.º 4, alínea d)).',
  other: 'Identifica a lei específica e todas as razões invocadas antes de escolher o regime de acesso.',
};
const OUTCOMES = [
  ['unknown', 'Não sei / ainda não confirmei'],
  ['not-sent', 'Ainda não enviei o pedido'],
  ['pending', 'Aguardo resposta'],
  ['refused', 'Acesso recusado'],
  ['partial', 'Acesso apenas parcial'],
  ['extended', 'Foi comunicada uma prorrogação'],
  ['granted', 'Acesso concedido'],
];
const REQUIRED = [...QUESTIONS.map(([key]) => key), 'outcome', ...Object.keys(FOLLOWUPS)];
function refusalReasons(facts) {
  if (!['refused', 'partial'].includes(facts.outcome)) return [];
  if (facts.reasons === undefined) return [facts.reason];
  const allowed = FOLLOWUPS.reason.options.map(([value]) => value);
  if (!Array.isArray(facts.reasons) || !facts.reasons.length
    || facts.reasons.some((value) => !allowed.includes(value))) {
    throw new Error('Fundamentos da recusa inválidos.');
  }
  return allowed.filter((value) => facts.reasons.includes(value));
}
const EVIDENCE = {
  entity: ['Funções da entidade', 'Estatutos, diploma de criação ou informação oficial sobre as funções.'],
  document: ['Existência e localização do documento', 'Referência de arquivo, cópia anterior, comunicação ou resposta da entidade.'],
  written: ['Envio e receção do pedido', 'Pedido enviado e comprovativo de receção; o envio, sozinho, não prova a receção.'],
  outcome: ['Resposta ou estado do pedido', 'Resposta integral, aviso de prorrogação ou registo das comunicações recebidas.'],
  authorization: ['Autorização para dados de outra pessoa', 'Documento que indique os dados e a finalidade autorizados.'],
};
const EVIDENCE_OPTIONS = [
  ['unknown', 'Ainda não verifiquei a prova'],
  ['document', 'Tenho suporte documental para esta resposta'],
  ['claim', 'É apenas uma afirmação minha ou de outra parte'],
  ['disputed', 'Há versões diferentes / prova em conflito'],
  ['none', 'Não tenho suporte documental'],
];
const PUBLIC_BENEFITS = [
  ['unknown', 'Ainda não identifiquei o benefício público'],
  ['health', 'Compreender riscos para a saúde pública'],
  ['environment', 'Compreender impactos e medidas de proteção ambiental'],
  ['accountability', 'Fiscalizar decisões ou atuação das entidades'],
  ['other', 'Outro benefício público que precisa de concretização'],
  ['none', 'Ainda só identifiquei um interesse particular'],
];
const ENVIRONMENTAL_INTERESTS = {
  internal: 'Proteção das comunicações internas entre entidades',
  personal: 'Proteção dos dados pessoais presentes nos documentos',
  confidential: 'Confidencialidade do processo ou informação prevista na lei',
  security: 'Relações internacionais, segurança pública ou defesa nacional',
  justice: 'Segredo legal, acesso à justiça ou seu bom funcionamento',
  commercial: 'Confidencialidade legal comercial/industrial ou segredo estatístico, fiscal ou bancário',
  copyright: 'Direitos de autor, direitos conexos ou propriedade industrial',
  voluntary: 'Interesses de quem forneceu voluntariamente a informação',
  species: 'Proteção do ambiente, incluindo localização de espécies protegidas',
};

function environmentalBalance(input, reasons, emissions, partial) {
  const assessment = input.environmentalAssessment === undefined ? {} : input.environmentalAssessment;
  if (!assessment || typeof assessment !== 'object' || Array.isArray(assessment)) {
    throw new Error('Quadro de ponderação ambiental inválido.');
  }
  const benefit = assessment.benefit === undefined ? 'unknown' : assessment.benefit;
  const benefitOption = PUBLIC_BENEFITS.find(([value]) => value === benefit);
  if (!benefitOption) throw new Error('Benefício público inválido.');
  const harm = assessment.harm === undefined ? {} : assessment.harm;
  if (!harm || typeof harm !== 'object' || Array.isArray(harm)) throw new Error('Suporte dos prejuízos inválido.');
  return reasons.filter((reason) => ENVIRONMENTAL_INTERESTS[reason]).map((reason) => {
    const state = harm[reason] === undefined ? 'unknown' : harm[reason];
    const support = EVIDENCE_OPTIONS.find(([value]) => value === state);
    if (!support) throw new Error(`Suporte do fundamento ambiental inválido: ${reason}`);
    const exception = emissions && ['confidential', 'commercial', 'voluntary', 'species'].includes(reason);
    return {
      reason, interest: ENVIRONMENTAL_INTERESTS[reason], benefit: benefitOption[1], support: support[1], state,
      argument: benefit === 'unknown' || benefit === 'none' || benefit === 'other'
        ? 'Concretiza o benefício para o público: o que a divulgação permitiria compreender ou fiscalizar? Um interesse particular não prova, por si só, ausência de interesse público.'
        : `O benefício indicado — ${benefitOption[1].toLowerCase()} — pode orientar o argumento. Explica como estes documentos contribuem para esse benefício, sem presumir que ele prevalece.`,
      objection: state === 'disputed'
        ? 'O suporte do interesse protegido está em conflito. Compara as versões e identifica o que cada elemento realmente demonstra.'
        : state === 'document'
          ? 'Indicaste suporte documental, mas não foi lido nem autenticado. Verifica a norma, o conteúdo protegido e o nexo entre divulgação e prejuízo ou interesse invocado.'
          : 'A invocação de um interesse protegido não demonstra, sozinha, o fundamento. Obtém a justificação concreta e o respetivo suporte; a falta de documentos na tua posse não prova ausência de prejuízo.',
      verify: 'Resposta integral, norma invocada, partes do documento afetadas, explicação do interesse público e elementos que sustentem a restrição. Não introduzas aqui documentos nem dados pessoais.',
      separation: partial === 'yes'
        ? 'Indicaste ser possível expurgar informação. Confirma se a versão restante continua útil e se não revela o conteúdo protegido (artigo 18.º, n.º 6).'
        : partial === 'no'
          ? 'O «não» não valida uma recusa total. Pede que seja explicado por que razão o expurgo não permite disponibilizar parte da informação.'
          : 'Pede uma avaliação concreta da possibilidade de expurgo e de disponibilização parcial.',
      limit: exception
        ? 'Para emissões, este fundamento não pode ser invocado nas hipóteses do artigo 18.º, n.º 5. O suporte declarado não reativa um fundamento excluído; outros fundamentos devem ser examinados.'
        : emissions && ['internal', 'personal'].includes(reason)
          ? 'O artigo 18.º, n.º 3, contém uma regra específica para emissões. Não a substituas por uma pontuação de benefícios e prejuízos; verifica os restantes fundamentos.'
          : 'A interpretação é restritiva face ao interesse público (artigo 18.º, n.º 5). Este quadro não decide prevalência, suficiência da prova ou legalidade da recusa.',
      refs: [18],
    };
  });
}

export function accessDossier(facts, evidence = {}) {
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('Dossiê de prova inválido.');
  const active = accessQuestionKeys(facts);
  return Object.entries(EVIDENCE).filter(([key]) => active.includes(key)).map(([key, [title, verify]]) => {
    const value = evidence[key] === undefined ? 'unknown' : evidence[key];
    const option = EVIDENCE_OPTIONS.find(([name]) => name === value);
    if (!option) throw new Error(`Estado da prova inválido: ${key}`);
    return { key, title, state: value, label: option[1], verify,
      answer: key === 'outcome' ? OUTCOMES.find(([name]) => name === facts[key])[1]
        : { yes: 'Sim', no: 'Não', unknown: 'Não sei' }[facts[key]] };
  });
}
export function accessQuestionKeys(facts) {
  if (facts.regime === 'common' && facts.environment === 'yes' && facts.environmentalKind && facts.environmentalKind !== 'unknown') {
    return ['regime', 'environment', 'environmentalKind', 'entity', 'document', 'written', 'outcome',
      ...(['refused', 'partial'].includes(facts.outcome) ? ['environmentalReason', 'partial'] : [])];
  }
  if (facts.regime === 'procedure' && facts.procedureKind && facts.procedureKind !== 'unknown') {
    return ['regime', 'procedureKind', 'environment', 'entity', 'directInterest', 'restricted', 'thirdParty', 'written', 'outcome',
      ...(facts.directInterest === 'no' ? ['legitimateInterest', 'interestProof', 'interestDecision'] : []),
      ...(facts.procedureKind === 'progress' ? [] : ['document']),
      ...(facts.procedureKind === 'certificate' ? ['certificateElements',
        ...(facts.certificateElements === 'yes' ? ['computerized'] : [])] : [])];
  }
  const accessLimited = ['refused', 'partial'].includes(facts.outcome);
  return REQUIRED.filter((key) => {
    if (key === 'environmentalKind') return facts.environment === 'yes' && facts.regime === 'common';
    if (key === 'environmentalReason') return false;
    if (key === 'procedureKind') return facts.regime === 'procedure';
    if (['directInterest', 'certificateElements', 'computerized', 'legitimateInterest', 'interestProof', 'interestDecision'].includes(key)) return false;
    if (key === 'authorization') return facts.thirdParty === 'yes';
    if (key === 'sensitive') return facts.thirdParty === 'yes';
    if (key === 'health') return facts.thirdParty === 'yes' && facts.sensitive === 'yes';
    if (key === 'healthWill') return facts.thirdParty === 'yes' && facts.sensitive === 'yes' && facts.health === 'yes';
    if (key === 'medical') return facts.thirdParty === 'yes' && facts.sensitive === 'yes' && facts.health === 'yes'
      && ['doctor', 'unascertainable'].includes(facts.healthWill);
    if (key === 'interest') return facts.thirdParty === 'yes' && facts.authorization === 'no';
    if (key === 'partial') return facts.restricted === 'yes' || facts.thirdParty === 'yes' || facts.outcome === 'partial'
      || (accessLimited && refusalReasons(facts).some((reason) => ['personal', 'secret', 'preparatory'].includes(reason)));
    if (key === 'location') return facts.document === 'no';
    if (key === 'reason') return ['refused', 'partial'].includes(facts.outcome);
    return true;
  });
}
const RULES = {
  scope: { keys: ['entity'], requirements: 'Entidade e documentos abrangidos pelo artigo 4.º, após verificar exclusões e regimes especiais.' },
  existing: { keys: ['entity', 'document', 'location'], requirements: 'Documento administrativo existente e detido por entidade abrangida; acesso sujeito às restrições aplicáveis.' },
  request: { keys: ['entity', 'written', 'outcome', 'reason'], requirements: 'Pedido identificável e receção comprovada; verificar precisão, resposta e eventual prorrogação.' },
  restriction: { keys: ['entity', 'document', 'restricted', 'thirdParty', 'reason'], requirements: 'Identificar a informação protegida, a restrição legal concreta e a justificação da sua extensão e duração.' },
  personal: { keys: ['entity', 'document', 'thirdParty', 'sensitive', 'authorization', 'interest'], requirements: 'Confirmar se são documentos nominativos e examinar autorização específica ou interesse e ponderação legal; verificar o artigo 6.º, n.º 9.' },
  partial: { keys: ['entity', 'document', 'restricted', 'thirdParty', 'partial'], requirements: 'Informação sujeita a reserva que possa ser expurgada, deixando conteúdo comunicável sem revelar a matéria protegida.' },
  health: { keys: ['entity', 'document', 'health', 'healthWill', 'medical', 'authorization', 'interest'], requirements: 'Confirmar dados de saúde, base legal do acesso por terceiro, vontade do titular, intermediação médica e extensão da informação comunicável (artigo 7.º).' },
};
const PASSAGES = {
  scope: [[4, 1], [1, 4]],
  existing: [[5, 1], [13, 6]],
  request: [[12, 1], [15, 1]],
  restriction: [[6, 7], [6, 8]],
  personal: [[6, 5], [6, 9]],
  partial: [[6, 8]],
  health: [[7, 1], [7, 2], [7, 3], [7, 4]],
};
const DECISIONS = {
  existing: {
    file: 'cpta', process: '0106/26.6BALSB', date: '2026-09-23',
    path: '/jsta.nsf/35fbbbf22e1bb1e680256f8e003ea931/8cdbfe1575642ee380258e8200526027?OpenDocument',
    title: 'Documento existente ou explicação nova?',
    context: 'O sumário trata de uma intimação para obter informação e da certificação dos fundamentos de um ato. Distingue documentos existentes de explicações elaboradas para responder ao pedido.',
    excerpts: [
      'II - O direito à informação administrativa tem por objeto informação e documentação administrativa preexistentes, não compreendendo o poder de exigir da Administração a criação de documentos novos, a formulação de justificações complementares ou a prestação de esclarecimentos especificamente elaborados para responder às solicitações dos interessados.',
      'V - Perante um pedido de acesso a documentos administrativos, a entidade requerida deve pronunciar-se expressamente sobre a existência ou inexistência dos documentos solicitados, facultando o respetivo acesso quando legalmente admissível ou indicando fundamentadamente as razões que obstem à sua disponibilização.',
    ],
    argument: 'Se pedes um registo que já existe, distingue esse pedido de uma solicitação de explicações novas. O sumário também aponta para uma resposta expressa sobre a existência dos documentos.',
    objection: 'Se o pedido exige uma interpretação ou justificação que não consta de documentos existentes, este sumário apresenta um limite ao direito à informação.',
    check: 'O que pedes já está registado num documento, ou teria de ser elaborado de propósito?',
    limit: 'O meio processual e o pedido concreto importam. Este sumário não resolve a posse do documento, as restrições de acesso nem a admissibilidade de uma ação no teu caso.',
  },
  health: {
    file: 'rgpd', process: '02550/24.4BELSB', date: '2025-07-16',
    path: '/jsta.nsf/35fbbbf22e1bb1e680256f8e003ea931/9d152ddc0038a2ed80258cc900479855?OpenDocument',
    title: 'Invocar um interesse basta para obter dados de saúde?',
    context: 'O sumário trata de uma seguradora que pediu dados clínicos de uma pessoa falecida para apreciar um pedido indemnizatório, sem autorização válida comprovada.',
    excerpts: [
      'III – Não havendo autorização válida por parte do titular da informação, o acesso aos elementos clínicos de falecido, pressupõe a demonstração por parte do requerente de um interesse direto, pessoal, legítimo e constitucionalmente protegido suficientemente relevante que justifique o acesso à informação.',
      'IV - As USL devem impedir o acesso indevido de terceiros aos processos clínicos, cumprindo as exigências estabelecidas na legislação que regula a proteção de dados pessoais.',
    ],
    argument: 'O sumário exige demonstração concreta do interesse; a falta de autorização não dispensa a análise desse fundamento e das regras específicas.',
    objection: 'A proteção dos dados de saúde e o contexto do requerente podem impedir o acesso. Um interesse apenas afirmado não equivale a um interesse demonstrado ou prevalecente.',
    check: 'São realmente dados de saúde? Quem pede, para que direito concreto e por que razão cada dado é necessário?',
    limit: 'Indicar dados de saúde não reproduz este caso. O módulo examina o artigo 7.º, mas não determina os direitos relativos a pessoas falecidas nem aplica integralmente a Lei n.º 12/2005. Não generalizes a conclusão sobre uma seguradora a qualquer terceiro.',
  },
};

export function contextualDecision(corpus, id) {
  const reference = DECISIONS[id];
  if (!reference || !Array.isArray(corpus?.acs)) throw new Error('Referência de jurisprudência inválida.');
  const matches = corpus.acs.filter((item) => item.u === reference.path);
  const decision = matches[0];
  if (matches.length !== 1 || decision.t !== 'STA' || decision.p !== reference.process
    || decision.d !== reference.date || typeof decision.s !== 'string'
    || !reference.excerpts.every((text) => decision.s.includes(text))) {
    throw new Error('O acórdão local não corresponde à referência e às passagens esperadas.');
  }

  return { ...reference, court: decision.t, url: `http://www.dgsi.pt${decision.u}`,
    outcome: decision.dec?.trim() || 'O corpus local não regista o dispositivo. O sumário não permite afirmar o resultado integral da ação.' };
}

export function decisionComparison(input, id, evidence = {}) {
  const report = analyseAccess(input, evidence);
  const issue = report.issues.find(({ decisions }) => decisions.includes(id));
  if (!issue || !DECISIONS[id]) throw new Error('Esta decisão não está selecionada para a análise atual.');
  const rows = [];
  const add = (title, state, local, declared, verify) => rows.push({ title, state, local, declared, verify });
  if (id === 'existing') {
    const creating = input.document === 'no' && input.location === 'create';
    add('Objeto do pedido', input.document === 'yes' ? 'contact' : creating ? 'difference' : 'unknown',
      'O sumário distingue documentação preexistente de explicações elaboradas para responder ao pedido.',
      input.document === 'yes' ? 'Declaraste que o documento existe e está na entidade; isto não confirma o conteúdo ou a posse.'
        : creating ? 'Declaraste que pretendes uma nova análise ou documento; não é o mesmo que pedir um registo existente.'
          : 'A existência e a localização do registo continuam por confirmar.',
      'Identifica o registo concreto, a data e o detentor; compara o pedido escrito com o que já estava documentado.');
    add('Resposta sobre existência', 'unknown',
      'O sumário refere uma pronúncia expressa sobre existência ou inexistência, com acesso ou razões fundamentadas para o impedir.',
      'O estado do pedido e a razão selecionada não demonstram o teor integral da resposta.',
      'Lê a resposta completa: distingue inexistência, posse noutra entidade e pedido de criação de conteúdo.');
  } else {
    add('Categoria dos dados', 'contact',
      'O contexto selecionado é um pedido de elementos clínicos.',
      'Indicaste dados de saúde de terceiro; a categoria foi declarada, não verificada.',
      'Confirma a natureza e a extensão dos elementos pedidos, sem introduzir dados pessoais no formulário.');
    add('Autorização e interesse', 'unknown',
      'O sumário trata de ausência de autorização válida comprovada e exige demonstração concreta de um interesse qualificado.',
      input.interest === 'yes'
        ? 'Indicaste ausência de autorização escrita e afirmaste um interesse constitucionalmente protegido; não foi verificada a suficiência do interesse.'
        : 'Indicaste ausência de autorização escrita; o interesse necessário ao acesso não está demonstrado por estas respostas.',
      'Confere a autorização, o direito concreto invocado, a necessidade de cada dado e o suporte do interesse.');
    add('Qualidade do requerente e titular falecido', 'unknown',
      'O contexto descrito é uma seguradora a pedir dados de uma pessoa falecida para apreciar um pedido indemnizatório.',
      'O formulário não identifica o tipo de requerente nem se o titular faleceu. Não se presume nenhum destes factos.',
      'Estas diferenças de contexto exigem análise própria; o módulo não determina direitos relativos a falecidos nem aplica integralmente a Lei n.º 12/2005.');
  }
  add('Pedido e meio processual', 'unknown',
    DECISIONS[id].context,
    'As respostas do formulário não confirmam identidade de pedido, fase processual ou admissibilidade do meio de reação.',
    'Compara o pedido, os fundamentos e o texto integral; verifica o meio adequado com um jurista.');
  return {
    title: DECISIONS[id].title, rows, application: issue.application, blockers: [...issue.blockers],
    warning: 'Ponto de contacto é apenas temático e baseado em respostas declaradas. Não significa equivalência factual, precedente vinculativo ou previsão de êxito.',
    limit: DECISIONS[id].limit,
  };
}

function verificationRoadmap(facts, issues, dossier, contradictions, specialRegime) {
  const allTitles = issues.map(({ title }) => title);
  if (contradictions.length) return contradictions.map(({ text }) => ({
    key: 'submission', kind: 'conflict', title: 'Corrigir o estado do pedido',
    question: text, verify: EVIDENCE.written[1],
    affects: allTitles, refs: [12, 15],
  }));
  if (specialRegime) return [
    ...(facts.regime !== 'common' ? [{
      key: 'regime', kind: 'answer', title: 'Identificar a lei aplicável',
      question: REGIME_GUIDANCE[facts.regime],
      verify: 'Confirma o tipo de documentos, o procedimento e a legislação específica com o serviço competente ou um jurista.',
      affects: allTitles, refs: [1],
    }] : []),
    ...(facts.environment !== 'no' ? [{
      key: 'environment', kind: 'answer', title: 'Verificar o regime ambiental',
      question: facts.environment === 'yes'
        ? 'O módulo comum não avalia este pedido ambiental.'
        : 'Ainda não sabemos se o pedido está sujeito ao regime ambiental.',
      verify: QUESTIONS.find(([key]) => key === 'environment')[2],
      affects: allTitles, refs: [3, 4, 17, 18],
    }] : []),
  ];
  const order = ['entity', 'document', 'location', 'written', 'outcome', 'reason',
    'restricted', 'thirdParty', 'sensitive', 'health', 'healthWill', 'medical', 'authorization', 'interest', 'partial'];
  const tasks = [];
  for (const key of order) {
    const affected = issues.filter((issue) => issue.facts.some((fact) => fact.key === key));
    const fact = affected.flatMap(({ facts }) => facts).find((fact) => fact.key === key);
    if (!fact) continue;
    const proof = dossier.find((item) => item.key === key);
    const conflict = proof?.state === 'disputed'
      || (key === 'document' && facts.document === 'yes' && facts.reason === 'absent');
    const negative = (key === 'entity' || key === 'document') && fact.value === 'no';
    const needsAnswer = fact.value === 'unknown' || negative
      || (key === 'reason' && fact.value === 'other');
    const needsSupport = proof && proof.state !== 'document'
      && !(key === 'authorization' && fact.value === 'no')
      && !(key === 'written' && fact.value === 'no')
      && !(key === 'outcome' && fact.value === 'not-sent');
    if (!conflict && !needsAnswer && !needsSupport) continue;
    tasks.push({
      key, kind: conflict ? 'conflict' : needsAnswer ? 'answer' : 'support',
      title: proof?.title || fact.question,
      question: conflict
        ? 'Há versões em conflito. Compara os elementos de cada versão; não escolhemos uma delas como verdadeira.'
        : needsAnswer ? fact.question : 'A resposta foi indicada, mas falta examinar o seu suporte.',
      verify: proof?.verify || affected[0].evidence,
      affects: affected.map(({ title }) => title),
      refs: [...new Set(affected.flatMap(({ refs }) => refs))],
    });
  }
  return [...tasks.filter(({ kind }) => kind !== 'support'), ...tasks.filter(({ kind }) => kind === 'support')];
}

export function legalArticle(doc, article, law = LADA) {
  const sourceMatches = law === LADA ? /^https:\/\/diariodarepublica\.pt\// : law === 'cpa'
    ? /^https:\/\/www\.pgdlisboa\.pt\/leis\/lei_mostra_articulado\.php\?nid=2248&/ : null;
  if (!sourceMatches || doc?.id !== law || !Array.isArray(doc.arts)
    || typeof doc.url !== 'string' || !sourceMatches.test(doc.url)) {
    throw new Error('A fonte local do diploma não tem a identificação esperada.');
  }
  const matches = doc.arts.filter((item) => item.k === String(article));
  if (matches.length !== 1 || typeof matches[0].x !== 'string' || !matches[0].x.trim()) {
    throw new Error(`Não foi possível verificar o artigo ${article}.º no corpus.`);
  }
  return { article, text: matches[0].x, url: doc.url, title: matches[0].t };
}

export function legalPassages(doc, grounds, law = LADA) {
  return grounds.map(([article, paragraph]) => {
    const verified = legalArticle(doc, article, law);
    if (paragraph === null) return { ...verified, paragraph: undefined };
    const blocks = verified.text.split(/\r?\n(?=\d+\s*-\s)/);
    const text = blocks.find((block) => block.startsWith(`${paragraph} - `));
    if (!text) throw new Error(`Não foi possível verificar o artigo ${article}.º, n.º ${paragraph}.`);
    return { article, paragraph, text, url: doc.url, title: doc.title };
  });
}

export function analyseAccess(input, evidence = {}) {
  if (input?.regime === 'common' && input.environment === 'yes' && input.environmentalKind && input.environmentalKind !== 'unknown') {
    return analyseEnvironmental(input, evidence);
  }
  if (input?.regime === 'procedure' && input.procedureKind && input.procedureKind !== 'unknown') {
    return analyseProcedure(input, evidence);
  }
  const reasons = refusalReasons(input || {});
  if (reasons.length <= 1) {
    return analyseSingleAccess(reasons.length ? { ...input, reason: reasons[0], reasons: undefined } : input, evidence);
  }
  const branches = reasons.map((reason) => ({
    reason,
    label: FOLLOWUPS.reason.options.find(([value]) => value === reason)[1],
    report: analyseSingleAccess({ ...input, reason, reasons: undefined }, evidence),
  }));
  const report = analyseSingleAccess({ ...input, reason: 'other', reasons }, evidence);
  report.refusalGrounds = branches.map(({ reason, label, report }) => ({ reason, label, issues: report.issues }));
  report.issues = [...new Set(branches.flatMap(({ report }) => report.issues.map(({ id }) => id)))].map((id) => {
    const positions = branches.flatMap(({ report }) => report.issues.filter((issue) => issue.id === id));
    const issue = { ...positions[0] };
    issue.blockers = [...new Set(positions.flatMap(({ blockers }) => blockers))];
    // A disputed holder affects every position that depends on possession, across all refusal grounds.
    if (['existing', 'restriction', 'personal', 'partial', 'health'].includes(id)
      && input.document === 'yes' && reasons.includes('absent') && !issue.blockers.some((text) => text.includes('São versões diferentes'))) {
      issue.blockers.push('Dizes que a entidade tem o documento, mas ela afirma não o ter. São versões diferentes, não um erro teu: reúne elementos sobre a existência e a localização do registo.');
    }
    issue.application = issue.blockers.length ? 'blocked'
      : positions.some(({ application }) => application === 'unresolved') ? 'unresolved' : 'conditional';
    issue.refs = [...new Set(positions.flatMap(({ refs }) => refs))];
    issue.grounds = positions.flatMap(({ grounds }) => grounds)
      .filter((ground, index, all) => all.findIndex(([article, paragraph]) => article === ground[0] && paragraph === ground[1]) === index);
    issue.decisions = [...new Set(positions.flatMap(({ decisions }) => decisions))];
    issue.facts = positions.flatMap(({ facts }) => facts)
      .filter((fact, index, all) => all.findIndex(({ key, value }) => key === fact.key && value === fact.value) === index);
    issue.conclusion = issue.application === 'blocked'
      ? 'Esclarece primeiro os pontos em falta. Os fundamentos devem ser examinados em conjunto.'
      : issue.application === 'unresolved' ? 'Ainda falta informação para avaliar todos os fundamentos desta questão.'
        : 'Esta questão depende de várias razões da recusa. Compara cada fundamento antes de concluir.';
    return issue;
  });
  const specialRegime = input.environment !== 'no' || input.regime !== 'common';
  report.limited ||= report.issues.some(({ application }) => application === 'blocked');
  report.summary = {
    ...report.summary,
    status: report.issues.some(({ application }) => application === 'blocked') ? 'blocked' : 'unresolved',
    position: null, objection: null, reply: null, limit: null,
    title: 'A recusa tem vários fundamentos',
    clarify: [...new Set([
      ...report.issues.flatMap(({ blockers }) => blockers),
      ...report.issues.flatMap(({ facts }) => facts.filter(({ value }) => value === 'unknown').map(({ question }) => question)),
      'Examina cada razão: responder a uma delas não afasta automaticamente as restantes.',
    ])],
    refs: [...new Set(report.issues.flatMap(({ refs }) => refs))],
  };
  report.roadmap = verificationRoadmap({ ...input, reason: reasons.includes('absent') ? 'absent' : 'other' },
    report.issues, report.dossier, report.contradictions, specialRegime);
  report.missing = [...new Set(branches.flatMap(({ report }) => report.missing))];
  report.scenarios = specialRegime || report.contradictions.length ? []
    : branches.flatMap(({ report }) => report.scenarios)
      .filter((scenario, index, all) => all.findIndex(({ id }) => id === scenario.id) === index);
  if (!specialRegime && !report.contradictions.length && reasons.includes('absent') && input.document === 'yes') {
    report.next = report.next.filter((text) => !text.includes('Se ponderas queixa'));
    report.next.push('Esclarece a posse antes de avaliar as restantes razões. Se estiver noutra entidade conhecida, verifica a remessa do artigo 15.º.');
  }
  return report;
}

function analyseEnvironmental(input, evidence) {
  const active = accessQuestionKeys(input);
  for (const key of active) {
    const allowed = key === 'outcome' ? OUTCOMES.map(([value]) => value)
      : FOLLOWUPS[key] ? FOLLOWUPS[key].options.map(([value]) => value) : ['yes', 'no', 'unknown'];
    if (!allowed.includes(input[key])) throw new Error(`Resposta inválida: ${key}`);
  }
  const facts = Object.fromEntries(active.map((key) => [key, input[key]]));
  const limitedAccess = ['refused', 'partial'].includes(facts.outcome);
  const allowedReasons = FOLLOWUPS.environmentalReason.options.map(([value]) => value);
  const supplied = limitedAccess
    ? input.environmentalReasons === undefined ? [facts.environmentalReason] : input.environmentalReasons : [];
  if (!Array.isArray(supplied) || (limitedAccess && !supplied.length)
    || supplied.some((value) => !allowedReasons.includes(value))) throw new Error('Fundamentos ambientais inválidos.');
  const reasons = allowedReasons.filter((value) => supplied.includes(value));
  const emissions = facts.environmentalKind === 'emissions';
  const dossier = accessDossier(facts, evidence);
  const contradictions = facts.written === 'yes' && facts.outcome === 'not-sent'
    ? [{ keys: ['written', 'outcome'], text: 'Indicaste pedido escrito apresentado e que ainda não o enviaste. Corrige o estado do pedido.' }] : [];
  const blockers = [];
  if (facts.entity !== 'yes') blockers.push('Confirma que a entidade está abrangida pelo artigo 4.º, incluindo o âmbito ambiental.');
  if (facts.document !== 'yes') blockers.push('Verifica se a informação está ou deve estar na posse da entidade. A ausência alegada não resolve esse dever nem obriga automaticamente a criar uma análise.');
  if (facts.document === 'yes' && reasons.includes('absent')) blockers.push('Há versões diferentes sobre a posse da informação. Confirma também se a entidade a deve deter.');
  blockers.push(...contradictions.map(({ text }) => text));
  blockers.push(...dossier.filter(({ state }) => state === 'disputed').map(({ title }) => `${title}: esclarece o suporte em conflito.`));
  const guidance = {
    absent: ['O artigo 18.º, n.º 1, exige que a informação não esteja nem deva estar na posse da entidade para este fundamento.',
      'Se for conhecida outra entidade detentora, pede remessa direta e imediata e informação ao requerente. Verifica também o dever de deter a informação.', [18, 1]],
    ongoing: ['O artigo 18.º, n.º 2, prevê remessa à entidade coordenadora, não uma recusa automática por o procedimento estar em curso.',
      'Pede identificação da coordenadora, prazo previsível de conclusão e disposições de acesso do procedimento.', [18, 2]],
    internal: [emissions
      ? 'Nas comunicações internas entre entidades, o artigo 18.º, n.º 3, prevê deferimento quando o pedido incide sobre emissões.'
      : 'Nas comunicações internas entre entidades, o artigo 18.º, n.º 3, exige que prevaleça o interesse público na divulgação.',
      'Identifica o interesse público concreto e exige exame das restantes restrições; o sistema não faz a ponderação.', [18, 3]],
    personal: [emissions
      ? 'Para documentos nominativos, o artigo 18.º, n.º 3, prevê deferimento quando o pedido incide sobre emissões.'
      : 'Para documentos nominativos, o artigo 18.º, n.º 3, exige prevalência do interesse público na divulgação.',
      'Confirma o conteúdo do documento e a ponderação aplicável. Não se importam automaticamente a presunção nem a autorização do ramo comum.', [18, 3]],
    abusive: ['O artigo 18.º, n.º 4, alínea a), prevê pedido manifestamente abusivo ou documentos/dados errados ou incompletos.',
      'Pede concretização do problema e verifica o que pode ser corrigido, sem presumir abuso.', [18, 4]],
    imprecise: ['O artigo 18.º, n.º 4, alínea b), exige que não seja possível sanar a deficiência do artigo 12.º, n.º 6.',
      'Confere o convite a esclarecer, a assistência prestada e a resposta; a mera imprecisão não esgota este fundamento.', [12, 6]],
  };
  const exceptions = ['confidential', 'commercial', 'voluntary', 'species'];
  const branches = reasons.map((reason) => {
    const detail = guidance[reason];
    const excluded = emissions && exceptions.includes(reason);
    return {
      reason, label: FOLLOWUPS.environmentalReason.options.find(([value]) => value === reason)[1],
      argument: detail?.[0] || (['unknown', 'other'].includes(reason)
        ? 'Identifica o fundamento completo antes de escolher uma resposta.'
        : excluded ? 'Este fundamento, nas subalíneas i), iv), vi) ou vii) do artigo 18.º, n.º 4, não pode ser invocado para informação sobre emissões (n.º 5).'
          : 'O artigo 18.º, n.º 4, prevê este interesse protegido; é necessário demonstrar o prejuízo e verificar os requisitos legais.'),
      reply: detail?.[1] || (excluded
        ? 'Pede reapreciação deste fundamento à luz das emissões. Isso não elimina outros fundamentos legalmente aplicáveis.'
        : 'Pede a norma, o prejuízo concreto e a ponderação com o interesse público na divulgação; os fundamentos são interpretados restritivamente.'),
      limit: 'Responder a este fundamento não afasta os restantes. Não se presume acesso irrestrito nem ilegalidade da recusa.',
      ground: detail?.[2] || [18, 4],
    };
  });
  const balance = limitedAccess ? environmentalBalance(input, reasons, emissions, facts.partial) : [];
  const issueFacts = active.filter((key) => !['regime', 'environment', 'environmentalKind'].includes(key)).map((key) => ({
    key, question: QUESTIONS.find(([name]) => name === key)?.[1] || FOLLOWUPS[key]?.question || 'Em que estado está o pedido?',
    value: facts[key], answer: FOLLOWUPS[key] ? FOLLOWUPS[key].options.find(([value]) => value === facts[key])[1]
      : key === 'outcome' ? OUTCOMES.find(([value]) => value === facts[key])[1] : { yes: 'Sim', no: 'Não', unknown: 'Não sei' }[facts[key]],
  }));
  const application = blockers.length ? 'blocked'
    : issueFacts.some(({ value }) => value === 'unknown') || reasons.some((reason) => ['unknown', 'other'].includes(reason)) ? 'unresolved' : 'conditional';
  const issue = {
    id: 'environmental', title: 'Acesso à informação ambiental', application, blockers, facts: issueFacts, proof: dossier,
    requirements: 'Enquadramento ambiental, entidade abrangida, posse ou dever de deter e exame restritivo de cada fundamento e do interesse público.',
    argument: 'O artigo 17.º assegura acesso nos termos da secção anterior, com deveres adicionais de apoio, qualidade e informação sobre métodos de medição quando disponíveis. O artigo 18.º contém regras específicas de indeferimento.',
    objection: 'O interesse público e a referência a emissões não dispensam examinar cada fundamento, o conteúdo pedido e outras regras aplicáveis.',
    reply: 'Examina os fundamentos abaixo e pede disponibilização parcial quando seja possível expurgar a informação que fundamentou o indeferimento (artigo 18.º, n.º 6).',
    replyLimit: 'A ponderação não é automática. As exceções relativas a emissões não afastam todos os fundamentos de recusa. A comunicação parcial depende da possibilidade real de expurgo.',
    evidence: 'Pedido, resposta integral, categoria da informação, elementos que confirmem emissões, posse ou dever de deter, prejuízo invocado e partes que possam ser disponibilizadas.',
    conclusion: application === 'conditional' ? 'Podes examinar o acesso ambiental e cada fundamento invocado; nenhuma conclusão de entrega é automática.'
      : 'Esclarece as condições ambientais e os fundamentos antes de aplicar uma posição.',
    refs: [3, 4, 12, 15, 17, 18],
    grounds: [[17, null], [18, 1], [18, 2], [18, 3], [18, 4], [18, 5], [18, 6], [12, 6]], decisions: [],
  };
  const clarify = [...new Set([...blockers, ...issueFacts.filter(({ value }) => value === 'unknown').map(({ question }) => question),
    ...(reasons.includes('other') ? ['Identifica todos os fundamentos ambientais invocados.'] : [])])];
  return {
    issues: [issue], dossier, contradictions, limited: application !== 'conditional', environmentalGrounds: branches,
    environmentalBalance: balance,
    summary: { issue: issue.id, title: issue.title, status: application,
      position: application === 'conditional' ? issue.conclusion : null,
      objection: application === 'conditional' ? issue.objection : null,
      reply: application === 'conditional' ? issue.reply : null,
      limit: application === 'conditional' ? issue.replyLimit : null, clarify, evidence: issue.evidence, proof: dossier, refs: issue.refs },
    missing: clarify, scenarios: [],
    deadlines: blockers.length ? [] : [
      { text: 'O artigo 17.º remete para a secção anterior: verifica a resposta e eventual prorrogação do artigo 15.º. Não se calcula atraso nem uma data-limite aqui.', ref: 15 },
      { text: 'Verifica as condições de queixa do artigo 16.º e os meios de reação adequados; não se presume sucesso nem se calcula o prazo.', ref: 16 },
    ],
    next: ['Confirma o enquadramento ambiental e obtém todos os fundamentos da resposta.',
      'Verifica posse ou dever de deter, remessa e possibilidade de disponibilização parcial. Havendo prazo próximo, procura aconselhamento jurídico.'],
    roadmap: [...clarify.map((question, index) => ({ key: `environmental-${index}`, kind: 'answer',
      title: 'Condição ambiental a confirmar', question, verify: issue.evidence, affects: [issue.title], refs: issue.refs })),
      ...dossier.filter(({ state }) => state !== 'document').map(({ key, title, verify, state }) => ({
        key, kind: state === 'disputed' ? 'conflict' : 'support', title,
        question: state === 'disputed' ? 'Esclarece as versões em conflito antes de aplicar a posição.'
          : 'Confere o suporte da resposta; não foi autenticado pelo sistema.',
        verify, affects: [issue.title], refs: issue.refs,
      }))],
  };
}

function analyseProcedure(input, evidence) {
  const active = accessQuestionKeys(input);
  input = { ...input };
  for (const key of ['legitimateInterest', 'interestProof', 'interestDecision']) {
    if (input[key] === undefined) input[key] = 'unknown';
  }
  for (const key of active) {
    const allowed = key === 'outcome' ? OUTCOMES.map(([value]) => value)
      : FOLLOWUPS[key] ? FOLLOWUPS[key].options.map(([value]) => value) : ['yes', 'no', 'unknown'];
    if (!allowed.includes(input[key])) throw new Error(`Resposta inválida: ${key}`);
  }
  const facts = Object.fromEntries(active.map((key) => [key, input[key]]));
  const dossier = accessDossier(facts, evidence);
  const contradictions = facts.written === 'yes' && facts.outcome === 'not-sent'
    ? [{ text: 'Indicaste um pedido escrito apresentado e que ainda não o enviaste. Corrige o estado do pedido.', keys: ['written', 'outcome'] }] : [];
  const blockers = [];
  if (facts.environment !== 'no') blockers.push('Confirma a articulação com o regime de informação ambiental; este ramo não a resolve.');
  if (facts.entity !== 'yes') blockers.push('Confirma que se trata de um procedimento da Administração sujeito ao CPA.');
  const extension = facts.directInterest === 'no';
  if (facts.directInterest === 'unknown') blockers.push('Confirma se o procedimento te diz diretamente respeito antes de escolher entre os artigos 82.º a 84.º e a extensão do artigo 85.º.');
  if (extension) {
    if (facts.legitimateInterest !== 'yes') blockers.push('Identifica o interesse legítimo no conhecimento dos elementos; a sua suficiência não é decidida pelo sistema.');
    if (facts.written !== 'yes' || facts.interestProof !== 'yes') blockers.push('O artigo 85.º, n.º 2, exige requerimento escrito instruído com documentos probatórios do interesse legítimo invocado.');
    if (facts.interestDecision !== 'granted') blockers.push(facts.interestDecision === 'refused'
      ? 'Foi indicado despacho de recusa. Examina os fundamentos e os meios de reação adequados; não se presume ilegalidade.'
      : 'O exercício desta extensão depende de despacho do dirigente do serviço. Confirma a decisão antes de aplicar o acesso.');
  }
  if (facts.document !== undefined && facts.document !== 'yes') blockers.push('Confirma que os documentos constam do processo e estão disponíveis na entidade. Não se presume obrigação de criar documentos.');
  if (contradictions.length) blockers.push(contradictions[0].text);
  for (const proof of dossier.filter(({ state }) => state === 'disputed')) blockers.push(`${proof.title}: esclarece as versões em conflito.`);
  const certificate84 = facts.procedureKind === 'certificate' && facts.certificateElements === 'yes';
  const article = facts.procedureKind === 'progress' ? 82 : certificate84 ? 84 : 83;
  const title = facts.procedureKind === 'progress' ? 'Informação sobre o teu procedimento'
    : facts.procedureKind === 'consult' ? 'Consulta do processo' : 'Certidão ou reprodução do processo';
  let argument = article === 82
    ? 'O artigo 82.º permite aos interessados pedir informação ao responsável pela direção do procedimento sobre andamento e resoluções definitivas, incluindo serviço, atos praticados e deficiências a suprir.'
    : article === 84
      ? 'Para os elementos enumerados no artigo 84.º, os serviços passam certidão, reprodução ou declaração autenticada independentemente de despacho, nos prazos próprios desse artigo.'
      : 'O artigo 83.º prevê consulta do processo e, para documentos acessíveis, certidão, reprodução ou declaração autenticada mediante as importâncias devidas.';
  const objection = 'A qualidade de interessado não elimina documentos classificados, segredos legalmente protegidos nem a proteção dos dados pessoais de terceiros. O artigo 83.º não dá acesso irrestrito ao processo.';
  let reply = facts.restricted === 'yes' || facts.thirdParty === 'yes'
    ? 'Pede que sejam identificados os documentos ou dados limitados e a norma concreta que impede a comunicação. A proteção deve ser examinada no contexto do processo.'
    : 'Identifica o procedimento e o que pretendes: andamento, consulta ou documentos a certificar. Guarda o requerimento, a receção e a resposta.';
  const replyLimit = 'Não se presume que uma restrição seja ilegal nem se importam automaticamente a queixa à CADA, a prorrogação ou as regras de entrega parcial da LADA. Pode ser necessária legislação específica e aconselhamento jurídico.';
  if (extension) {
    argument = 'O artigo 85.º estende os direitos dos artigos 82.º a 84.º a pessoas que provem interesse legítimo no conhecimento dos elementos pretendidos. O exercício depende de despacho do dirigente, em requerimento escrito instruído com documentos probatórios. ' + argument;
    reply = 'Relaciona os elementos pretendidos com o interesse legítimo invocado, confere a prova apresentada e o alcance do despacho. Um despacho favorável não elimina as restrições dos documentos nem autoriza elementos fora do seu âmbito.';
  }
  const issueFacts = active.filter((key) => !['regime', 'procedureKind'].includes(key)).map((key) => ({
    key, question: QUESTIONS.find(([name]) => name === key)?.[1] || FOLLOWUPS[key]?.question || 'Em que estado está o pedido?',
    value: facts[key], answer: key === 'outcome' ? OUTCOMES.find(([value]) => value === facts[key])[1]
      : FOLLOWUPS[key] ? FOLLOWUPS[key].options.find(([value]) => value === facts[key])[1]
        : { yes: 'Sim', no: 'Não', unknown: 'Não sei' }[facts[key]],
  }));
  const application = blockers.length ? 'blocked' : issueFacts.some(({ value }) => value === 'unknown') ? 'unresolved' : 'conditional';
  const refs = [...new Set([article, 83, 85])];
  const issue = {
    id: 'procedure', title, application, blockers, facts: issueFacts, proof: dossier, refs,
    requirements: 'Procedimento sujeito ao CPA, qualidade de interessado, objeto identificável e exame das restrições.',
    argument, objection, reply, replyLimit,
    evidence: extension
      ? 'Requerimento escrito, documentos probatórios do interesse legítimo, despacho integral e elementos concretos abrangidos, sem os enviar para o sistema.'
      : 'Referência do procedimento, prova da qualidade de interessado, requerimento, receção, resposta e descrição dos documentos pretendidos.',
    conclusion: application === 'conditional' ? extension
      ? 'Com as condições do artigo 85.º indicadas, podes examinar o acesso aos elementos abrangidos pelo despacho. A prova, o interesse e as restrições continuam sujeitos a verificação.'
      : 'Podes examinar o direito pedido pelo CPA, sujeito à qualidade de interessado e às restrições aplicáveis.'
      : 'Esclarece as condições indicadas antes de aplicar o direito de acesso ao procedimento.',
    grounds: article === 82 ? [[82, 1], [82, 2], [82, 3], [83, 1], [83, 2], [85, 1], [85, 2]]
      : article === 84 ? [[84, 1], [84, 2], [84, 3], [83, 2], [85, 1], [85, 2]]
        : [[83, 1], [83, 2], [83, 3], [85, 1], [85, 2]],
    decisions: [],
  };
  const summary = {
    issue: issue.id, title, status: application,
    position: application === 'conditional' ? issue.conclusion : null,
    objection: application === 'conditional' ? objection : null,
    reply: application === 'conditional' ? reply : null,
    limit: application === 'conditional' ? replyLimit : null,
    clarify: [...new Set([...blockers, ...issueFacts.filter(({ value }) => value === 'unknown').map(({ question }) => question)])],
    evidence: issue.evidence, proof: dossier, refs,
  };
  const deadlines = blockers.length || extension ? [] : article === 82
    ? [{ text: 'Informação do artigo 82.º: prazo máximo de 10 dias (n.º 3). A contagem e o caso concreto não são calculados aqui.', ref: 82 }]
    : certificate84 ? [{ text: facts.computerized === 'yes'
      ? 'Elementos de procedimento informatizado: artigo 84.º, n.º 3, prevê prazo máximo de três dias, com autenticação por via eletrónica ou impressão nos serviços.'
      : facts.computerized === 'no'
        ? 'Artigo 84.º, n.º 1: prazo máximo de 10 dias a contar da apresentação do requerimento, para os elementos nele enumerados.'
        : 'Confirma se os elementos constam de procedimento informatizado antes de escolher entre os prazos dos n.os 1 e 3 do artigo 84.º.', ref: 84 }] : [];
  return {
    law: 'cpa', issues: [issue], summary, dossier, contradictions, limited: application !== 'conditional',
    missing: issueFacts.filter(({ value }) => value === 'unknown').map(({ question }) => question),
    scenarios: [], deadlines,
    next: [extension
      ? 'Confere o requerimento, a prova do interesse e o despacho do dirigente. Os prazos da extensão exigem análise específica; não se presume acesso ou atraso enquanto aguardas despacho.'
      : 'Confirma a qualidade de interessado e a referência do procedimento.',
      'Guarda o pedido e a resposta. Havendo recusa ou prazo próximo, verifica os meios de reação adequados com um jurista; este módulo não os determina.'],
    roadmap: [...summary.clarify.map((question, index) => ({
      key: `procedure-${index}`, kind: 'answer', title: 'Condição a confirmar', question,
      verify: issue.evidence, affects: [title], refs,
    })), ...dossier.filter(({ state }) => state !== 'document').map(({ key, title: proofTitle, verify, state }) => ({
      key, kind: state === 'disputed' ? 'conflict' : 'support', title: proofTitle,
      question: 'Confere o suporte desta resposta; o sistema não autentica documentos.',
      verify, affects: [title], refs,
    }))],
  };
}

function analyseSingleAccess(input, evidence = {}) {
  const active = accessQuestionKeys(input || {});
  const facts = { ...input };
  for (const key of ['health', 'healthWill', 'medical', 'procedureKind', 'environmentalKind']) {
    if (facts[key] === undefined) facts[key] = 'unknown';
  }
  for (const key of active) {
    const allowed = key === 'outcome' ? OUTCOMES.map(([value]) => value)
      : FOLLOWUPS[key] ? FOLLOWUPS[key].options.map(([value]) => value) : ['yes', 'no', 'unknown'];
    if (!allowed.includes(facts?.[key])) throw new Error(`Resposta inválida: ${key}`);
  }
  for (const key of REQUIRED.filter((key) => !active.includes(key))) facts[key] = 'unknown';
  const dossier = accessDossier(facts, evidence);
  const contradictions = [];
  if (facts.written === 'yes' && facts.outcome === 'not-sent') {
    contradictions.push({
      keys: ['written', 'outcome'],
      text: 'Disseste que já enviaste um pedido escrito e que ainda não o enviaste. Corrige uma destas respostas; um rascunho não conta como pedido apresentado.',
    });
  }
  const environmental = facts.environment !== 'no';
  const otherRegime = facts.regime !== 'common';
  const specialRegime = environmental || otherRegime;
  const disputedPossession = facts.document === 'yes' && facts.reason === 'absent';
  const issues = [];
  const add = (id, title, status, argument, objection, evidence, refs) =>
    issues.push({ id, title, status, argument, objection, evidence, refs });
  add('scope', 'Esta lei aplica-se à entidade?', facts.entity === 'yes' ? 'Condição indicada' : 'Por confirmar',
    'O artigo 4.º identifica as entidades abrangidas pela Lei de Acesso aos Documentos Administrativos (LADA), incluindo certas entidades privadas.',
    'Pode existir uma exclusão ou uma lei específica para estes documentos. Ser entidade pública ou privada não basta para decidir.',
    'Nome da entidade, estatutos ou informação sobre as suas funções e tipo de documentos pedidos.', [1, 3, 4]);
  add('existing', 'Podes pedir o documento?', facts.document === 'yes' ? 'Condição indicada' : 'Por confirmar',
    'O artigo 5.º permite, em regra, consultar, obter cópia e saber se um documento administrativo existe e o que contém, sem justificar o interesse.',
    'Não há obrigação de criar ou adaptar documentos, nem de preparar extratos com esforço desproporcionado. A entidade pode indicar a localização exata na Internet, salvo se demonstrares que não consegues usar esse acesso.',
    'Descrição do documento, datas, referência do processo e elementos que mostrem onde está.', [5, 13]);
  add('request', 'Pedido e resposta', facts.written === 'yes' ? 'Pedido escrito indicado' : 'Formalização por confirmar',
    'Os artigos 12.º e 15.º regulam como pedir os documentos e como a entidade deve responder.',
    'A entidade pode pedir esclarecimentos se o pedido for impreciso. Um volume ou complexidade excecionais podem justificar mais tempo, com fundamentação. A lei também prevê pedidos manifestamente abusivos.',
    'Pedido enviado, comprovativo de receção, resposta e eventual aviso de prorrogação.', [12, 15]);
  if (facts.restricted !== 'no' || facts.thirdParty !== 'no' || ['personal', 'secret', 'preparatory'].includes(facts.reason)) {
    add('restriction', 'A entidade pode limitar o acesso?', 'Exame necessário',
      'O artigo 6.º exige examinar qual a informação protegida e a razão legal para limitar o acesso.',
      'A proteção de dados, segredos comerciais ou informação classificada pode justificar limites. Em certas situações, a lei permite adiar o acesso.',
      'Razão escrita da recusa, informação que a entidade considera protegida e, se houver adiamento, até quando e porquê.', [6]);
  }
  if (facts.thirdParty !== 'no' || facts.reason === 'personal') {
    add('personal', 'E se houver dados de outra pessoa?', facts.thirdParty === 'unknown' ? 'Facto desconhecido' : 'Ponderação necessária',
      facts.authorization === 'yes' ? 'A autorização pode sustentar o acesso pelo artigo 6.º, n.º 5, alínea a), se indicar expressamente os dados e a finalidade.' : 'O artigo 6.º, n.º 5, alínea b), admite outra via: demonstrar um interesse direto, pessoal, legítimo e protegido pela Constituição, suficientemente relevante face aos direitos em causa. O n.º 9 contém uma presunção aplicável a certos documentos nominativos.',
      'Uma autorização genérica ou a simples invocação de transparência não afastam automaticamente a proteção de dados. É preciso verificar se o documento é nominativo, isto é, se contém os dados pessoais definidos no artigo 3.º.',
      'Dados pretendidos, autorização escrita ou explicação concreta do interesse que justifica o acesso.', [3, 6]);
  }
  if (facts.restricted !== 'no' || facts.thirdParty !== 'no' || facts.outcome === 'partial'
    || ['personal', 'secret', 'preparatory'].includes(facts.reason)) {
    add('partial', 'Podes receber só a parte não protegida?', facts.partial === 'yes' ? 'Separação indicada' : 'Viabilidade por confirmar',
      'O artigo 6.º, n.º 8, prevê entrega parcial sempre que seja possível ocultar a informação protegida.',
      'A parte entregue não pode permitir descobrir a informação que ficou oculta. É preciso verificar se a separação funciona neste documento.',
      'Partes que queres receber, proposta do que ocultar e razões da entidade para recusar essa solução.', [6]);
  }
  if (active.includes('health') && facts.health !== 'no') {
    add('health', 'Como aceder a dados de saúde de outra pessoa?', 'Exame específico',
      'O artigo 7.º acrescenta regras de intermediação médica e de limitação da informação comunicada. É preciso verificar primeiro a base legal do acesso.',
      'Ter um interesse ou recorrer a um médico não garante acesso. Confirma também a Lei n.º 12/2005 e outras regras aplicáveis; direitos relativos a pessoas falecidas não são determinados aqui.',
      'Categoria dos dados, base legal invocada, alcance do consentimento, vontade do titular e forma de intermediação, sem reproduzir dados clínicos neste formulário.', [6, 7]);
  }
  for (const issue of issues) {
    const rule = RULES[issue.id];
    issue.requirements = rule.requirements;
    issue.facts = rule.keys.filter((key) => active.includes(key)).map((key) => ({
      key,
      question: QUESTIONS.find(([name]) => name === key)?.[1] || FOLLOWUPS[key]?.question || 'Em que estado está o pedido?',
      value: facts[key],
      answer: key === 'outcome' ? OUTCOMES.find(([value]) => value === facts[key])[1]
        : FOLLOWUPS[key] ? FOLLOWUPS[key].options.find(([value]) => value === facts[key])[1]
        : { yes: 'Sim', no: 'Não', unknown: 'Não sei / por confirmar' }[facts[key]],
    }));
    issue.proof = dossier.filter(({ key }) => rule.keys.includes(key));
    issue.blockers = [];
    for (const item of issue.proof.filter(({ state }) => state === 'disputed')) {
      issue.blockers.push(`${item.title}: há versões diferentes ou prova em conflito. Esclarece este ponto antes de aplicar a conclusão.`);
    }
    if (environmental) issue.blockers.push(facts.environment === 'yes'
      ? 'É informação ambiental: consulta as regras específicas da LADA antes de usar esta análise comum.'
      : 'Confirma se é informação ambiental antes de aplicar o regime comum.');
    if (otherRegime) issue.blockers.push(REGIME_GUIDANCE[facts.regime]);
    if (contradictions.length) issue.blockers.push('Corrige as respostas que não combinam para podermos avaliar o pedido.');
    if (issue.id !== 'scope' && facts.entity !== 'yes') {
      issue.blockers.push(facts.entity === 'no'
        ? 'Respondeste «não» sobre as funções da entidade. Isso não prova que esteja fora da LADA: verifica as entidades abrangidas no artigo 4.º.'
        : 'Falta saber se a entidade está abrangida pela LADA (artigo 4.º).');
    }
    if (['existing', 'restriction', 'personal', 'partial', 'health'].includes(issue.id) && facts.document !== 'yes') {
      issue.blockers.push(facts.document === 'no'
        ? 'Respondeste «não» sobre a existência e posse do documento. Esclarece se não existe ou se está noutra entidade; esta resposta não obriga a criar um documento.'
        : 'Falta saber se o documento existe e quem o tem.');
    }
    if (['existing', 'restriction', 'personal', 'partial', 'health'].includes(issue.id) && disputedPossession) {
      issue.blockers.push('Dizes que a entidade tem o documento, mas ela afirma não o ter. São versões diferentes, não um erro teu: reúne elementos sobre a existência e a localização do registo.');
    }
    if (issue.id === 'health' && ['doctor', 'unascertainable'].includes(facts.healthWill) && facts.medical !== 'yes') {
      issue.blockers.push('Esta situação exige intermediação médica pelo artigo 7.º. Confirma como será assegurada antes de avaliar a comunicação.');
    }
    issue.application = issue.blockers.length ? 'blocked'
      : issue.facts.some(({ value }) => value === 'unknown') ? 'unresolved' : 'conditional';
    if (issue.application === 'blocked') {
      issue.conclusion = 'Esclarece primeiro os pontos em falta. Por agora, podes consultar apenas a explicação da lei.';
    } else if (issue.application === 'unresolved') {
      issue.conclusion = 'Ainda falta informação para responder a esta questão.';
    } else {
      const conclusions = {
        scope: facts.entity === 'yes'
          ? 'A entidade pode estar abrangida pela LADA. Confirma as suas funções e se existe uma lei específica para os documentos pedidos.'
          : 'O «não» não exclui automaticamente a LADA. Confirma a natureza da entidade e a lei aplicável.',
        existing: 'Podes, em princípio, pedir acesso ao documento existente. A entrega de todo o conteúdo depende de eventuais limites legais.',
        request: facts.written === 'yes'
          ? 'Com o pedido e a receção comprovados, podes avaliar a resposta da entidade. Não ter resposta, por si só, não prova atraso.'
          : 'Falta um pedido escrito. Para avaliar uma queixa, verifica também se existe uma recusa de pedido verbal registada por escrito.',
        restriction: 'Haver informação protegida não justifica, por si só, recusar todo o documento.',
        personal: facts.thirdParty !== 'yes'
          ? 'Confirma primeiro se o documento contém dados pessoais de outra pessoa.'
          : facts.authorization === 'yes'
            ? 'Uma autorização escrita para estes dados e finalidade pode apoiar o acesso. Outros limites legais continuam a ser relevantes.'
            : 'Não ter autorização não significa que o acesso seja proibido. Pode haver outra base legal, dependendo do interesse demonstrado e do tipo de dados.',
        partial: facts.partial === 'yes'
          ? 'Se for possível ocultar a informação protegida, podes pedir o restante documento.'
          : 'É preciso verificar se a informação pode ser separada. O «não» não prova que uma recusa total seja legal.',
        health: 'Confirma a base legal, a vontade do titular e a extensão da informação de saúde que pode ser comunicada.',
      };
      issue.conclusion = conclusions[issue.id];
    }
    const replies = {
      health: ['Verifica o consentimento ou o interesse concreto e limita o pedido aos dados necessários. Confirma se é exigida intermediação médica.',
        'A intermediação e a limitação do conteúdo não dispensam uma base legal de acesso nem outras restrições aplicáveis.'],
      scope: ['Pede à entidade que identifique a exclusão ou a lei específica que invoca e compara-a com o artigo 4.º.', 'Se existir um regime especial aplicável, é esse regime que precisa de análise.'],
      existing: ['Identifica o registo concreto. Se estiver noutra entidade conhecida, o artigo 15.º, n.º 1, alínea d), prevê remessa do pedido, com conhecimento ao requerente.', 'Se pretendes criar uma análise nova, o direito de acesso não obriga a produzi-la.'],
      request: ['Esclarece o pedido ou pede os fundamentos da prorrogação, conforme a resposta recebida.', 'Não se presume atraso sem verificar a receção e o prazo aplicável; uma prorrogação legal pode justificar mais tempo.'],
      restriction: ['Pede a identificação da informação protegida e da norma invocada; propõe acesso ao restante conteúdo.', 'Uma restrição legal concretamente aplicável pode justificar limitar ou adiar o acesso.'],
      personal: [facts.authorization === 'yes'
        ? 'Apresenta a autorização e confirma que abrange estes dados e esta finalidade.'
        : facts.interest === 'yes'
          ? 'Explica o direito que pretendes proteger e porque precisas destes dados; pede a ponderação do artigo 6.º, n.º 5, alínea b).'
          : 'Considera pedir uma cópia sem os dados protegidos. Sem autorização, é preciso examinar outra base legal antes de insistir no acesso aos dados.',
      'A autorização ou o interesse alegado não garantem acesso; é necessário verificar os dados e os direitos em conflito, incluindo o n.º 9 quando aplicável.'],
      partial: [facts.partial === 'yes'
        ? 'Indica as partes que podem ser entregues e propõe ocultar apenas a informação protegida.'
        : 'Pede à entidade que explique porque não consegue entregar uma versão sem a informação protegida.',
      'Se o conteúdo restante revelar a informação protegida, essa proposta pode não resolver a objeção.'],
    };
    [issue.reply, issue.replyLimit] = replies[issue.id];
    if (issue.id === 'health' && facts.health === 'yes') {
      issue.argument = facts.authorization === 'yes'
        ? 'Com consentimento do titular, o artigo 7.º, n.º 3, limita a comunicação à informação expressamente abrangida pelo consentimento.'
        : 'Nos demais casos de acesso por terceiros, o artigo 7.º, n.º 4, limita a transmissão à informação estritamente necessária ao interesse direto, pessoal, legítimo e constitucionalmente protegido que fundamenta o acesso.';
      issue.argument += facts.healthWill === 'unascertainable'
        ? ' Na impossibilidade de apurar a vontade do titular, o n.º 2 exige sempre intermediação de médico.'
        : facts.healthWill === 'doctor'
          ? ' Se o titular pede intermediação médica, o n.º 1 prevê o acesso por intermédio de médico.'
          : ' O n.º 1 prevê intermediação de médico se o titular a solicitar. Confirma a vontade e as restantes regras aplicáveis.';
      issue.reply = facts.authorization === 'yes'
        ? 'Confere quais os dados expressamente abrangidos pelo consentimento e respeita esse limite na comunicação.'
        : 'Explica o direito concreto que procuras proteger e por que razão cada informação de saúde é estritamente necessária; a relevância do interesse exige verificação.';
      if (issue.application === 'conditional') {
        issue.conclusion = facts.authorization === 'yes'
          ? 'Se o consentimento for válido, só pode ser comunicada a informação expressamente abrangida. Outros requisitos continuam a aplicar-se.'
          : 'Sem acesso baseado em consentimento, verifica a base legal e limita a comunicação à informação estritamente necessária. Isto não garante a entrega.';
      }
    }
    if (issue.id === 'personal' && facts.thirdParty === 'yes') {
      if (facts.sensitive === 'no') {
        issue.argument = 'Se o documento nominativo não contiver nenhuma das categorias do artigo 6.º, n.º 9, e não indicares outro fundamento, presume-se que o pedido se baseia no direito de acesso a documentos administrativos.';
        issue.replyLimit = 'Esta presunção diz respeito ao fundamento do pedido, não à autorização de acesso. Mantêm-se as ponderações dos números anteriores e outras restrições legais.';
        if (facts.authorization !== 'yes') {
          issue.reply = facts.interest === 'yes'
            ? 'Explica o direito que pretendes proteger e porque precisas destes dados. Se não indicares outro fundamento e forem cumpridas as condições do n.º 9, pode ser relevante a presunção nele prevista.'
            : 'Pede que seja examinada a presunção do artigo 6.º, n.º 9, se não houver outro fundamento indicado. Não assumes que a falta de autorização decide, sozinha, o acesso.';
        }
        if (issue.application === 'conditional' && facts.authorization !== 'yes') {
          issue.conclusion = 'Pode ser relevante a presunção sobre o fundamento do pedido. Isso não garante a entrega dos dados: os direitos em causa ainda têm de ser ponderados.';
        }
      } else if (facts.sensitive === 'yes') {
        issue.argument = 'A presunção do artigo 6.º, n.º 9, não abrange documentos que contenham alguma das categorias indicadas. É necessário examinar a autorização ou o interesse e a ponderação previstos no n.º 5, além de outras regras aplicáveis.';
        issue.replyLimit = 'Não beneficiar desta presunção não significa proibição automática de acesso. Mas a autorização ou o interesse alegado também não garantem a entrega dos dados.';
        if (issue.application === 'conditional' && facts.authorization !== 'yes') {
          issue.conclusion = 'Este documento não beneficia da presunção do n.º 9. O acesso exige examinar outra base legal e a proteção dos dados em causa.';
        }
      } else {
        issue.argument = 'Antes de invocar a presunção do artigo 6.º, n.º 9, confirma se o documento contém alguma das categorias nele indicadas. Sem essa informação não podemos avaliar esta presunção.';
      }
      if (facts.authorization === 'yes') {
        issue.argument += ' A autorização pode sustentar o acesso pelo n.º 5, alínea a), se for explícita e específica para estes dados e finalidade.';
      }
      issue.evidence = 'Tipo de dados presentes no documento, sem os reproduzir aqui; autorização escrita, se existir, e explicação do direito que pretendes proteger. Confirma também se foi indicado outro fundamento para o pedido.';
    }
    if (issue.id === 'existing' && facts.document === 'no') {
      if (facts.location === 'elsewhere') issue.conclusion = 'Se o documento está noutra entidade conhecida, pede a remessa do requerimento nos termos do artigo 15.º, n.º 1, alínea d).';
      if (facts.location === 'create') issue.conclusion = 'O acesso a documentos não obriga a criar uma nova análise. Procura um registo já existente que contenha a informação pretendida.';
      if (facts.location === 'absent') issue.conclusion = 'A alegada inexistência precisa de confirmação. Podes pedir informação sobre a existência do registo; não se presume que a entidade tenha de o criar.';
      if (specialRegime || contradictions.length || facts.entity !== 'yes' || issue.proof.some(({ state }) => state === 'disputed')) issue.conclusion = 'Confirma primeiro o regime aplicável e esclarece os factos ou respostas em conflito.';
      issue.refs = [...issue.refs, 15];
    }
    if (issue.id === 'restriction' && facts.reason === 'preparatory') {
      issue.reply = 'Pede que a entidade explique se é documento preparatório ou de processo não concluído e indique quando termina o adiamento do artigo 6.º, n.º 3.';
      issue.replyLimit = 'Esse número permite adiar até à decisão, ao arquivamento ou a um ano após elaboração, consoante o primeiro evento; outras restrições podem continuar a aplicar-se.';
    }
    if (issue.id === 'request' && facts.reason === 'imprecise') {
      issue.reply = 'Especifica assunto, período e documentos. O artigo 12.º, n.º 6, prevê convite a esclarecer e assistência na formulação do pedido.';
      issue.objection = 'Sem elementos suficientes para identificar os documentos, a entidade pode precisar de esclarecimentos antes de os localizar.';
      issue.evidence = 'Pedido original, convite a esclarecer e resposta com assunto, período e referências dos documentos.';
      issue.replyLimit = 'A assistência não obriga a adivinhar o documento pretendido nem a criar um registo novo. Confirma que os elementos adicionais permitem identificá-lo.';
    }
    if (issue.id === 'restriction' && facts.reason === 'secret') {
      issue.reply = 'Pede a norma concreta que protege a informação e quais as partes abrangidas. Verifica se é segredo comercial, informação classificada ou um segredo sujeito a lei própria.';
      issue.replyLimit = 'Não basta invocar transparência para afastar um segredo legal. Pode ser necessário analisar um regime específico, além do artigo 6.º.';
      issue.refs = [1, ...issue.refs];
    }
    if (issue.id === 'request' && ['personal', 'secret', 'preparatory'].includes(facts.reason)) {
      issue.objection = 'Uma razão legal para limitar o acesso deve ser distinguida de falta de resposta: verifica o fundamento escrito e os meios de reação comunicados.';
      issue.reply = 'Pede a fundamentação escrita e a indicação das formas de contestar, previstas no artigo 15.º, n.º 1, alínea c). Depois examina o limite invocado no cartão correspondente.';
      issue.replyLimit = 'Uma resposta fundamentada não torna a recusa automaticamente legal; também não prova, por si só, que tenhas direito ao conteúdo recusado.';
    }
    if (issue.id === 'existing' && facts.reason === 'absent') {
      issue.reply = replies.existing[0];
      issue.evidence = 'Resposta em que a entidade diz não ter o documento e referências, registos ou comunicações que indiquem a sua localização.';
      issue.refs = [...new Set([...issue.refs, 15])];
    }
    if (issue.id === 'request' && facts.reason === 'absent') {
      issue.objection = 'Uma entidade que não possui o documento não pode entregar o que não tem.';
      issue.reply = 'Pede que esclareça a falta de posse. Se souber quem tem o documento, o artigo 15.º, n.º 1, alínea d), prevê remeter o pedido e informar-te.';
      issue.replyLimit = 'A remessa depende de conhecer a entidade detentora; não equivale a uma obrigação de criar o documento.';
    }
    if (issue.id === 'request' && ['refused', 'partial'].includes(facts.outcome)
      && ['unknown', 'other'].includes(facts.reason)) {
      issue.reply = 'Obtém a resposta completa e identifica todas as razões da recusa. Se não foram explicadas, pede fundamentação escrita e os meios de reação do artigo 15.º, n.º 1, alínea c).';
      issue.replyLimit = 'Sem conhecer os fundamentos, não podemos escolher uma réplica específica. Havendo várias razões, responder a uma só pode não resolver a recusa.';
    }
    if (issue.id === 'request' && !['refused', 'partial'].includes(facts.outcome)) {
      issue.reply = facts.outcome === 'not-sent'
        ? 'Identifica os documentos, escolhe consulta, cópia ou certidão e envia um pedido escrito com os elementos do artigo 12.º.'
        : facts.outcome === 'extended'
          ? 'Verifica o aviso de prorrogação, a data de receção e os motivos de volume ou complexidade invocados.'
          : facts.outcome === 'granted'
            ? 'Confirma se recebeste todos os documentos pedidos e se estão legíveis. Só avalia uma limitação se houver conteúdo em falta.'
            : 'Confirma a receção do pedido e se houve resposta ou aviso de prorrogação antes de concluir que existe atraso.';
    }
    if (environmental) issue.refs = [...new Set([1, 3, 4, 17, 18, ...issue.refs])];
    if (otherRegime) issue.refs = [...new Set([1, ...issue.refs])];
    issue.grounds = PASSAGES[issue.id];
    if (issue.id === 'restriction' && facts.reason === 'preparatory') issue.grounds = [[6, 3], [6, 8]];
    if (issue.id === 'restriction' && facts.reason === 'secret') issue.grounds = [[1, 4], [6, 1], [6, 6]];
    if (issue.id === 'request' && facts.reason === 'imprecise') issue.grounds = [[12, 6], [15, 1]];
    if (issue.id === 'request' && facts.outcome === 'extended') issue.grounds = [[15, 4]];
    if (issue.id === 'existing' && (facts.document === 'no' || facts.reason === 'absent')) issue.grounds = [[5, 1], [13, 6], [15, 1]];
    if (environmental) issue.grounds = [[1, 1], [4, 4]];
    if (otherRegime) issue.grounds = [...(environmental ? issue.grounds : []), [1, 4]];
  }
  const limited = specialRegime || contradictions.length > 0 || facts.entity !== 'yes' || facts.document !== 'yes' || disputedPossession
    || dossier.some(({ state }) => state === 'disputed');
  const next = [
    'Guarda o pedido, o comprovativo de receção e a resposta da entidade.',
  ];
  if (contradictions.length) next.unshift('Corrige as respostas assinaladas acima e volta a analisar.');
  if (environmental) next.unshift('Confirma o enquadramento da informação ambiental nos artigos 3.º, 4.º, 17.º e 18.º. Este módulo não avalia esse regime específico.');
  if (otherRegime) next.unshift(REGIME_GUIDANCE[facts.regime]);
  if (facts.entity !== 'yes') next.push('Verifica se a entidade está abrangida pelo artigo 4.º antes de escolher como contestar uma recusa.');
  if (facts.document !== 'yes') next.push('Esclarece se o documento existe e quem o detém. Se não souberes, podes pedir informação sobre a sua existência.');
  if (disputedPossession) next.push('Compara a resposta da entidade com os registos ou referências que indicam onde está o documento. Esclarece a posse antes de avaliar a entrega ou as suas restrições. Se estiver noutra entidade conhecida, verifica a remessa prevista no artigo 15.º.');
  if (!specialRegime && !contradictions.length && (facts.written !== 'yes' || facts.outcome === 'not-sent')) next.push('Prepara um pedido escrito: identifica os documentos e indica se queres consulta, cópia ou certidão (artigos 12.º e 13.º).');
  if (!specialRegime && ['pending', 'extended', 'unknown'].includes(facts.outcome)) next.push('Confirma quando a entidade recebeu o pedido e se comunicou mais tempo para responder (artigo 15.º).');
  if (!limited && ['refused', 'partial'].includes(facts.outcome)) {
    const focus = facts.reason === 'absent' ? 'Verifica a falta de posse e a possível remessa do pedido (artigo 15.º).'
      : facts.reason === 'imprecise' ? 'Esclarece os documentos pedidos e verifica o convite previsto no artigo 12.º.'
        : ['unknown', 'other'].includes(facts.reason) ? 'Identifica todos os fundamentos da resposta antes de escolher como a contestar.'
          : 'Compara a razão da recusa com o artigo 6.º e verifica se há uma lei específica.';
    next.push(`${focus} Se ponderas queixa à CADA (Comissão de Acesso aos Documentos Administrativos), confirma as condições e o prazo do artigo 16.º.`);
  }
  next.push('Se tens um prazo próximo ou ponderas recorrer ao tribunal, procura aconselhamento jurídico.');
  const scenarios = [
    {
      id: 'location', title: 'Onde está o documento?',
      question: 'Um registo, uma cópia anterior ou a resposta da entidade permite confirmar existência e localização?',
      branches: [
        ['Existe e está na entidade', 'Examinar o acesso pelo artigo 5.º e os limites legais.'],
        ['Existe e está noutra entidade conhecida', 'Examinar a remessa do pedido prevista no artigo 15.º, n.º 1, alínea d).'],
        ['Não existe e teria de ser criado', 'O direito de acesso não obriga a produzir uma nova análise (artigo 13.º, n.º 6).'],
      ],
      refs: [5, 13, 15],
    },
    {
      id: 'response', title: 'O prazo de resposta já terminou?',
      question: 'Qual a data comprovada de receção e houve prorrogação comunicada e fundamentada?',
      branches: [
        ['A receção ou a contagem não estão confirmadas', 'Não concluir que existe atraso.'],
        ['Há prorrogação legalmente justificada', 'Examinar o prazo prorrogado; não presumir atraso pela regra comum.'],
        ['Terminou o prazo aplicável sem resposta', 'Examinar o direito de queixa do artigo 16.º, após confirmar os pressupostos e a contagem.'],
      ],
      refs: [15, 16],
    },
    {
      id: 'separation', title: 'É possível entregar uma parte?',
      question: 'Uma cópia com informação ocultada continuaria a revelar os dados ou segredos protegidos?',
      branches: [
        ['É possível ocultar a informação protegida', 'Examinar a comunicação parcial do artigo 6.º, n.º 8.'],
        ['O restante conteúdo ainda revela a informação protegida', 'A proposta de ocultação pode não resolver a objeção.'],
        ['Ainda não sabemos se é possível separar', 'Pedir uma explicação concreta; não validar automaticamente uma recusa total.'],
      ],
      refs: [6],
    },
  ].filter(({ id }) => id === 'location'
    ? facts.document !== 'yes' || facts.reason === 'absent' || dossier.some((item) => item.key === 'document' && item.state !== 'document')
    : id === 'response' ? ['pending', 'extended', 'unknown'].includes(facts.outcome)
      : active.includes('partial'));
  for (const issue of issues) {
    issue.decisions = [];
    if (specialRegime || contradictions.length || facts.entity !== 'yes') continue;
    if (issue.id === 'existing') issue.decisions.push('existing');
    if (issue.id === 'health' && facts.health === 'yes'
      && facts.authorization === 'no') issue.decisions.push('health');
  }
  const priority = specialRegime || contradictions.length || facts.entity !== 'yes'
    || dossier.some(({ key, state }) => key === 'entity' && state === 'disputed') ? 'scope'
    : facts.document !== 'yes' || disputedPossession || dossier.some(({ key, state }) => key === 'document' && state === 'disputed') ? 'existing'
      : dossier.some(({ key, state }) => ['written', 'outcome'].includes(key) && state === 'disputed')
        || !['refused', 'partial'].includes(facts.outcome) ? 'request'
        : facts.reason === 'absent' ? 'existing'
          : ['imprecise', 'unknown', 'other'].includes(facts.reason) ? 'request'
            : (facts.reason === 'personal' || facts.thirdParty === 'yes') && issues.some(({ id }) => id === 'health') ? 'health'
              : facts.reason === 'personal' || facts.thirdParty === 'yes' ? 'personal'
              : facts.reason === 'preparatory' || facts.reason === 'secret' ? 'restriction' : 'partial';
  const focus = issues.find(({ id }) => id === priority) || issues.find(({ id }) => id === 'request');
  const summary = {
    issue: focus.id,
    title: focus.title,
    status: focus.application,
    position: focus.application === 'conditional' ? focus.conclusion : null,
    objection: focus.application === 'conditional' ? focus.objection : null,
    reply: focus.application === 'conditional' ? focus.reply : null,
    limit: focus.application === 'conditional' ? focus.replyLimit : null,
    clarify: [...new Set([
      ...focus.blockers,
      ...focus.facts.filter(({ value }) => value === 'unknown').map(({ question }) => question),
      ...(contradictions.length ? contradictions.map(({ text }) => text) : []),
    ])],
    evidence: focus.evidence,
    proof: focus.proof,
    refs: focus.refs,
  };
  return {
    issues, next, contradictions, limited, dossier, summary,
    roadmap: verificationRoadmap(facts, issues, dossier, contradictions, specialRegime),
    scenarios: specialRegime || contradictions.length ? [] : scenarios,
    missing: active.filter((key) => facts[key] === 'unknown').map((key) =>
      QUESTIONS.find(([name]) => name === key)?.[1] || FOLLOWUPS[key]?.question || 'Qual foi o estado ou a resposta ao pedido?'),
    deadlines: specialRegime ? [] : [
      { text: 'Resposta: regra de 10 dias; o artigo 15.º, n.º 4, admite prorrogação excecional até ao máximo de dois meses, comunicada e fundamentada no prazo de 10 dias.', ref: 15 },
      { text: 'Queixa à CADA: o artigo 16.º, n.º 1, prevê 20 dias nas situações nele indicadas. O momento inicial e a contagem exigem verificação do caso; não são calculados aqui.', ref: 16 },
    ],
  };
}

export function accessReportText(input, evidence = {}) {
  const report = analyseAccess(input, evidence);
  const name = report.law === 'cpa' ? 'CPA' : 'LADA';
  const source = report.law === 'cpa'
    ? 'https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=2248&tabela=leis'
    : 'https://diariodarepublica.pt/dr/legislacao-consolidada/lei/2016-106603618';
  const status = { blocked: 'Aplicação bloqueada', unresolved: 'Informação em falta', conditional: 'Posição condicional, não verificada' };
  const lines = [
    'ANÁLISE LOCAL DE ACESSO A INFORMAÇÃO',
    `Regime analisado: ${name}`,
    'Não é um parecer jurídico nem uma previsão de êxito.',
    'Respostas e suporte são declarações do utilizador; não foram verificados ou autenticados.',
    'A vigência das normas e o estado processual das decisões não foram verificados.',
    'Relatório gerado localmente, sem IA nem envio de respostas. Ao guardá-lo, passas a conservar uma cópia das respostas; partilha-a com cuidado.',
    '',
    'RESPOSTAS DECLARADAS',
  ];
  for (const key of accessQuestionKeys(input)) {
    const value = input[key] === undefined ? 'unknown' : input[key];
    const question = key === 'outcome' ? 'Em que estado está o pedido?'
      : FOLLOWUPS[key]?.question || QUESTIONS.find(([name]) => name === key)[1];
    const answer = key === 'outcome' ? OUTCOMES.find(([name]) => name === value)?.[1]
      : FOLLOWUPS[key] ? FOLLOWUPS[key].options.find(([name]) => name === value)?.[1]
        : { yes: 'Sim', no: 'Não', unknown: 'Não sei / por confirmar' }[value];
    if (!answer) throw new Error(`Resposta sem descrição no relatório: ${key}`);
    lines.push(`${question} ${answer}`);
  }
  const list = (heading, items) => {
    if (items.length) lines.push('', heading, ...items.map((text) => `- ${text}`));
  };
  const refs = (numbers) => `${name}: ${numbers.map((number) => `artigo ${number}.º`).join('; ')}.`;
  const position = (issue) => {
    lines.push('', issue.title, status[issue.application], `Conclusão: ${issue.conclusion}`,
      `Condições legais: ${issue.requirements}`);
    list('Antes de aplicar', issue.blockers);
    lines.push(`Regra: ${issue.argument}`, `Objeção: ${issue.objection}`,
      `Resposta possível (só após confirmar as condições): ${issue.reply}`,
      `Limite dessa resposta: ${issue.replyLimit}`, `Prova útil: ${issue.evidence}`, refs(issue.refs),
      `Passagens selecionadas: ${issue.grounds.map(([article, paragraph]) =>
        paragraph === null ? `artigo ${article}.º integral` : `artigo ${article}.º, n.º ${paragraph}`).join('; ')}.`);
  };
  list('RESPOSTAS CONTRADITÓRIAS', report.contradictions.map(({ text }) => text));
  lines.push('', 'SÍNTESE', report.summary.title, status[report.summary.status],
    report.summary.position || 'Não há tese ou réplica aplicável para esta síntese. Esclarece as condições abaixo.');
  if (report.summary.position) lines.push(`Objeção: ${report.summary.objection}`,
    `Resposta: ${report.summary.reply}`, `Limite: ${report.summary.limit}`);
  lines.push(`Prova para a síntese: ${report.summary.evidence}`, refs(report.summary.refs));
  list('A esclarecer', report.summary.clarify);
  if (report.limited || report.issues.some(({ application }) => application !== 'conditional')) {
    lines.push('A avaliação é incompleta; a síntese não elimina os bloqueios das restantes posições.');
  }
  lines.push('', 'FUNDAMENTOS E LIMITES');
  if (report.refusalGrounds) {
    for (const issue of report.issues) {
      lines.push('', issue.title, status[issue.application]);
      list('Bloqueios conjuntos', issue.blockers);
    }
    for (const branch of report.refusalGrounds) {
      lines.push('', `Fundamento invocado: ${branch.label}`,
        'A leitura individual não elimina os bloqueios conjuntos. Responder a uma razão não afasta as restantes.');
      branch.issues.forEach(position);
    }
  } else report.issues.forEach(position);
  for (const branch of report.environmentalGrounds || []) {
    lines.push('', `Fundamento ambiental invocado: ${branch.label}`, branch.argument,
      `Resposta possível: ${branch.reply}`, branch.limit);
  }
  for (const entry of report.environmentalBalance || []) {
    lines.push('', `PONDERAÇÃO: ${entry.interest}`,
      `Benefício público indicado: ${entry.benefit}`, `Suporte indicado: ${entry.support}`,
      entry.argument, entry.objection, `Prova: ${entry.verify}`, entry.separation, entry.limit,
      'Não se determina qual interesse prevalece.');
  }
  list('DOSSIÊ DECLARADO', report.dossier.map(({ title, label, verify }) => `${title}: ${label}. Para verificar: ${verify}`));
  list('ROTEIRO DE VERIFICAÇÃO', report.roadmap.map(({ title, question, verify, affects }) =>
    `${title}: ${question} O que procurar: ${verify} Questões dependentes: ${affects.join(' · ')}`));
  for (const scenario of report.scenarios) {
    lines.push('', `CENÁRIOS: ${scenario.title}`, scenario.question,
      'Alternativas não verificadas, não previsões nem conclusões sobre o caso.',
      ...scenario.branches.map(([condition, consequence]) => `- ${condition}: ${consequence}`), refs(scenario.refs));
  }
  list('PRAZOS A VERIFICAR (SEM CÁLCULO DE DATAS)', report.deadlines.map(({ text }) => text));
  list('PRÓXIMOS PASSOS', report.next);
  lines.push('', 'FONTES', `${name} — ${report.law === 'cpa' ? 'Corpus com origem PGDL, não publicação oficial' : 'Ligação oficial DRE'}: ${source}`,
    'As referências a artigos não constituem transcrição nem verificação atual de vigência. Confere a versão oficial e todas as regras aplicáveis.');
  const decisions = [...new Set(report.issues.flatMap(({ decisions }) => decisions))];
  for (const id of decisions) {
    const decision = DECISIONS[id];
    const comparison = decisionComparison(input, id, evidence);
    lines.push(`Decisão sugerida para comparação temática: STA, ${decision.date}, processo ${decision.process}.`,
      `http://www.dgsi.pt${decision.path}`,
      'Esta exportação não carrega ou verifica o sumário, o texto integral ou o dispositivo. Não presume equivalência factual nem resultado.');
    lines.push(comparison.warning, status[comparison.application]);
    list('Bloqueios da posição associada', comparison.blockers);
    for (const row of comparison.rows) {
      lines.push('', `${row.title} — ${ { contact: 'Ponto de contacto temático', difference: 'Diferença relevante', unknown: 'Por confirmar' }[row.state]}`,
        `Contexto selecionado do sumário: ${row.local}`, `No teu caso: ${row.declared}`, `A verificar: ${row.verify}`);
    }
    lines.push(comparison.limit);
  }
  return `${lines.join('\n')}\n`;
}

export function accessReportPrintHtml(text) {
  if (typeof text !== 'string' || !text.trim()) throw new Error('Relatório de impressão inválido.');
  const escape = (value) => value.replace(/[&<>"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
  })[char]);
  const sections = text.trimEnd().split('\n\n').map((section, index) => {
    const [title, ...lines] = section.split('\n');
    return `<section><${index === 0 ? 'h1' : 'h2'}>${escape(title)}</${index === 0 ? 'h1' : 'h2'}>${lines.map((line) => `<p>${escape(line)}</p>`).join('')}</section>`;
  }).join('');
  return `<!doctype html><html lang="pt"><head><meta charset="utf-8">
<title>Análise de acesso — relatório</title><style>
@page { size: A4; margin: 18mm; }
* { box-sizing: border-box; }
body { margin: 0 auto; padding: 24px; max-width: 820px; color: #171717; background: white; font: 11pt/1.6 Georgia, serif; }
h1, h2 { font-family: Arial, sans-serif; line-height: 1.3; break-after: avoid; page-break-after: avoid; }
h1 { font-size: 20pt; border-bottom: 3px solid #a83c12; padding-bottom: 12px; }
h2 { font-size: 13pt; margin: 24px 0 10px; }
p { margin: 0 0 8px; overflow-wrap: anywhere; orphans: 3; widows: 3; }
.print-actions { font-family: Arial, sans-serif; padding: 16px; background: #faf8f7; border: 1px solid #a83c12; }
button { padding: 12px 16px; font: inherit; cursor: pointer; }
@media print { body { max-width: none; padding: 0; } .print-actions { display: none; } }
</style></head><body><div class="print-actions"><p>No destino da impressão, escolhe «Guardar como PDF». Cancelar não guarda nenhum ficheiro. Podes voltar a imprimir nesta janela.</p><button type="button">Guardar em PDF / imprimir</button></div><main>${sections}</main></body></html>`;
}

async function mount() {
  const shell = document.getElementById('case-shell');
  if (!shell) return;
  const { openReading, readingBackTo } = await import('./reading-dialog.js');
  const h = (tag, attrs, ...children) => {
    const el = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) el.setAttribute(key, value);
    el.append(...children.flat());
    return el;
  };
  let currentLaw = LADA;
  const source = (number) => {
    const law = currentLaw;
    const link = h('button', { type: 'button', class: 'brain-chip' }, `${law === 'cpa' ? 'CPA' : 'LADA'} · artigo ${number}.º`);
    link.addEventListener('click', () => {
      showPassages({ title: `${law === 'cpa' ? 'CPA' : 'LADA'} · artigo ${number}.º`, article: number, law }, readingBackTo(link));
    });
    return link;
  };
  const corpora = new Map();
  const showDecision = async (id, onBack, input, evidence) => {
    const content = h('div', { class: 'case-comparison' }, h('p', { role: 'status' }, 'A carregar a decisão do corpus local…'));
    openReading('Decisão para comparar', content, { onBack });
    try {
      const response = await fetch(`data/juris/${DECISIONS[id].file}.json?v=8`);
      if (!response.ok) throw new Error(`Falha ao carregar a jurisprudência (${response.status}).`);
      const decision = contextualDecision(await response.json(), id);
      const comparison = decisionComparison(input, id, evidence);
      const section = (title, text) => h('section', { class: 'case-comparison-question' },
        h('h3', null, title), h('p', null, text));
      content.replaceChildren(
        h('h3', null, decision.title),
        h('p', { class: 'case-comparison-note' }, `${decision.court} · ${decision.date} · Processo ${decision.process}`),
        h('p', { class: 'case-comparison-note', role: 'note' },
          'Exemplo selecionado para esta questão, não um caso considerado equivalente. Leitura baseada apenas no sumário local; o texto integral e o estado processual não foram verificados.'),
        section('O contexto descrito no sumário', decision.context),
        section('O que pode apoiar o pedido', decision.argument),
        section('O que pode contrariá-lo', decision.objection),
        section('O que comparar no teu caso', decision.check),
        h('section', { class: 'case-comparison' },
          h('h3', null, 'Comparação estruturada com as tuas respostas'),
          h('p', { class: 'case-comparison-note' }, comparison.warning),
          ...(comparison.application !== 'conditional' ? [
            h('p', { class: 'case-comparison-note' }, 'A posição associada tem condições por esclarecer. Este quadro não remove os seus bloqueios.'),
          ] : []),
          ...(comparison.blockers.length ? [h('ul', { class: 'case-list' }, comparison.blockers.map((text) => h('li', null, text)))] : []),
          ...comparison.rows.map((row) => h('section', { class: 'case-comparison-option' },
            h('h3', null, row.title),
            h('p', null, h('strong', null, { contact: 'Ponto de contacto temático', difference: 'Diferença relevante', unknown: 'Por confirmar' }[row.state])),
            h('p', null, h('strong', null, 'No sumário: '), row.local),
            h('p', null, h('strong', null, 'No teu caso: '), row.declared),
            h('p', null, h('strong', null, 'A verificar: '), row.verify)))),
        section('Limites desta comparação', decision.limit),
        section('Resultado da ação', decision.outcome),
        h('section', { class: 'case-comparison-sources' }, h('h3', null, 'Passagens exatas do sumário'),
          ...decision.excerpts.map((text) => h('blockquote', { class: 'legal-passage-text' }, h('p', null, text)))),
        h('a', { href: decision.url, target: '_blank', rel: 'noopener noreferrer' }, 'Conferir o texto integral no DGSI ↗'));
    } catch (error) {
      const retry = h('button', { type: 'button' }, 'Tentar novamente');
      retry.addEventListener('click', () => showDecision(id, onBack, input, evidence));
      content.replaceChildren(h('p', { role: 'alert' }, `Não foi possível verificar a decisão: ${error.message}`), retry);
    }
  };
  const showPassages = async (issue, onBack) => {
    const law = issue.law || currentLaw;
    const content = h('div', { class: 'legal-passages' }, h('p', { role: 'status' }, 'A carregar as passagens da lei…'));
    openReading(`${issue.title} · texto da lei`, content, { onBack });
    const passagesFrom = (data) => issue.article !== undefined
      ? [legalArticle(data, issue.article, law)] : legalPassages(data, issue.grounds, law);
    try {
      let corpus = corpora.get(law);
      if (!corpus) {
        const response = await fetch(`data/lei/${law}.json?v=8`);
        if (!response.ok) throw new Error(`Falha ao carregar o diploma (${response.status}).`);
        const data = await response.json();
        passagesFrom(data);
        corpus = data;
        corpora.set(law, data);
      }
      const passages = passagesFrom(corpus);
      const returnButton = h('button', { type: 'button' }, 'Voltar à explicação');
      if (onBack) returnButton.addEventListener('click', onBack);
      content.replaceChildren(
        h('div', { class: 'legal-source-note', role: 'note', 'aria-label': 'Sobre esta transcrição' },
          h('strong', null, 'Texto do corpus local'),
          h('p', null, `Sem verificação atual de vigência. ${law === 'cpa' ? 'Fonte local: PGDL; confirma também a publicação oficial no DRE.' : 'Confirma a versão em vigor no DRE.'} Estes textos não incluem todas as regras e exceções.`)),
        ...passages.map(({ article, paragraph, text, title }) => h('section', { class: 'legal-passage' },
          h('h3', null, h('span', null, `Artigo ${article}.º`),
            h('small', null, paragraph !== undefined ? `N.º ${paragraph}` : title)),
          h('blockquote', { class: 'legal-passage-text' },
            text.split(/\r?\n/).filter((line) => line.trim()).map((line) =>
              h('p', { class: /^[a-z]\)/.test(line) ? 'legal-clause' : /^(?:[ivxlcdm]+)\)/i.test(line) ? 'legal-subclause' : 'legal-paragraph' }, line))),
          ...(issue.article === undefined ? [source(article)] : []))),
        h('div', { class: 'legal-passage-actions' },
          ...(onBack ? [returnButton] : []),
          h('a', { href: corpus.url, target: '_blank', rel: 'noopener noreferrer' }, `Conferir a fonte ${law === 'cpa' ? 'PGDL' : 'DRE'} ↗`)));
    } catch (error) {
      const retry = h('button', { type: 'button' }, 'Tentar novamente');
      retry.addEventListener('click', () => showPassages(issue, onBack));
      content.replaceChildren(h('p', { role: 'alert' }, `Não foi possível verificar as passagens: ${error.message}`), retry);
    }
  };
  const form = h('form', { class: 'case-form' });
  const field = (key, question, hint, options) => h('div', { class: 'case-field' },
    h('label', { for: `case-${key}` }, question),
    h('p', { id: `case-hint-${key}`, class: 'meta' }, hint),
    h('select', { id: `case-${key}`, name: key, 'aria-describedby': `case-hint-${key}` },
      options.map(([value, text]) => h('option', { value }, text))));
  const extraReasons = h('div', { class: 'case-field', role: 'group', 'aria-labelledby': 'case-extra-reasons-title' },
    h('strong', { id: 'case-extra-reasons-title' }, 'Foram dadas outras razões?'),
    h('p', { class: 'meta' }, 'Assinala as restantes, além da razão escolhida acima. Não assinales razões que a entidade não invocou.'),
    ...FOLLOWUPS.reason.options.filter(([value]) => value !== 'unknown').map(([value, text]) =>
      h('label', { class: 'case-reason-option' },
        h('input', { type: 'checkbox', name: 'extra-reason', value }), h('span', null, text))));
  const environmentalExtras = h('div', { class: 'case-field', role: 'group', 'aria-labelledby': 'case-environmental-reasons-title' },
    h('strong', { id: 'case-environmental-reasons-title' }, 'Outros fundamentos ambientais invocados'),
    h('p', { class: 'meta' }, 'Assinala apenas as razões adicionais que constam da resposta.'),
    ...FOLLOWUPS.environmentalReason.options.filter(([value]) => value !== 'unknown').map(([value, text]) =>
      h('label', { class: 'case-reason-option' },
        h('input', { type: 'checkbox', name: 'extra-environmental-reason', value }), h('span', null, text))));
  const assessmentFields = h('details', { class: 'case-dossier-fields', hidden: '' },
    h('summary', null, 'Interesse público e suporte da restrição · opcional'),
    h('p', { class: 'brain-note' }, 'Indica categorias e suporte declarado, sem descrever o caso nem enviar documentos. Estas respostas não decidem a ponderação.'),
    field('assessment-benefit', 'Que benefício público pode resultar da divulgação?',
      'Escolhe o benefício principal. A sua relação com os documentos e a sua importância precisam de ser demonstradas.', PUBLIC_BENEFITS),
    ...Object.entries(ENVIRONMENTAL_INTERESTS).map(([reason, title]) =>
      field(`assessment-harm-${reason}`, title, 'Que suporte tens para a justificação desta restrição? Não é uma avaliação feita pelo sistema.', EVIDENCE_OPTIONS)));
  form.append(field('regime', FOLLOWUPS.regime.question, FOLLOWUPS.regime.hint, FOLLOWUPS.regime.options),
    ...QUESTIONS.map(([key, question, hint]) => field(key, question, hint,
    [['unknown', 'Não sei / por confirmar'], ['yes', 'Sim'], ['no', 'Não']])),
    field('outcome', 'Em que estado está o pedido?', 'O estado indicado não prova que decorreu um prazo legal.', OUTCOMES),
    ...Object.entries(FOLLOWUPS).filter(([key]) => key !== 'regime')
      .map(([key, { question, hint, options }]) => field(key, question, hint, options)),
    extraReasons,
    environmentalExtras,
    assessmentFields,
    h('details', { class: 'case-dossier-fields' },
      h('summary', null, 'Dossiê de prova · opcional'),
      h('p', { class: 'brain-note' }, 'Indica apenas o tipo de suporte. Não anexes documentos nem introduzas dados pessoais. Ter um documento não significa que o sistema tenha verificado o seu conteúdo.'),
      ...Object.entries(EVIDENCE).map(([key, [title, hint]]) => field(`proof-${key}`, title, hint, EVIDENCE_OPTIONS))),
    h('button', { type: 'submit' }, 'Ver análise'));
  const updateQuestions = () => {
    const facts = Object.fromEntries(Array.from(form.querySelectorAll('select:not([name^="assessment-"])')).map((select) => [select.name, select.value]));
    const environmental = facts.regime === 'common' && facts.environment === 'yes' && facts.environmentalKind !== 'unknown';
    const environmentalLimited = environmental && ['refused', 'partial'].includes(facts.outcome);
    environmentalExtras.hidden = !environmentalLimited;
    for (const checkbox of environmentalExtras.querySelectorAll('input')) {
      checkbox.disabled = !environmentalLimited || checkbox.value === facts.environmentalReason;
      if (checkbox.disabled) checkbox.checked = false;
    }
    const environmentalReasons = environmentalLimited
      ? [facts.environmentalReason, ...Array.from(environmentalExtras.querySelectorAll('input:checked')).map(({ value }) => value)] : [];
    const relevantInterests = environmentalReasons.filter((reason) => ENVIRONMENTAL_INTERESTS[reason]);
    assessmentFields.hidden = !relevantInterests.length;
    for (const select of assessmentFields.querySelectorAll('select')) {
      const visible = relevantInterests.length > 0
        && (select.name === 'assessment-benefit' || relevantInterests.includes(select.name.replace('assessment-harm-', '')));
      select.closest('.case-field').hidden = !visible;
      select.disabled = !visible;
      if (!visible) select.value = 'unknown';
    }
    const limited = ['refused', 'partial'].includes(facts.outcome)
      && !(facts.regime === 'procedure' && facts.procedureKind !== 'unknown') && !environmental;
    extraReasons.hidden = !limited;
    for (const checkbox of extraReasons.querySelectorAll('input')) {
      checkbox.disabled = !limited || checkbox.value === facts.reason;
      if (checkbox.disabled) checkbox.checked = false;
    }
    const additional = Array.from(extraReasons.querySelectorAll('input:checked')).map(({ value }) => value);
    if (additional.length) facts.reasons = [facts.reason, ...additional];
    const active = accessQuestionKeys(facts);
    for (const select of form.querySelectorAll('select:not([name^="assessment-"])')) {
      const visible = active.includes(select.name.replace(/^proof-/, ''));
      select.closest('.case-field').hidden = !visible;
      select.disabled = !visible;
      if (!visible) select.value = 'unknown';
    }
  };
  updateQuestions();
  const result = h('div', { class: 'case-result', tabindex: '-1', 'aria-label': 'Análise do caso', hidden: '' });
  shell.append(
    h('div', { class: 'def-head' }, h('h2', null, 'Analisar caso · acesso a documentos')),
    h('p', { class: 'brain-note' }, 'Explora acesso geral pela LADA ou informação de procedimento próprio pelo CPA. A análise usa regras locais, sem IA, e depende da prova e da lei em vigor; não substitui um advogado. As respostas não são guardadas nem enviadas.'),
    form, result);
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const formData = new FormData(form);
      const values = Object.fromEntries(formData);
      const additional = formData.getAll('extra-reason');
      if (additional.length) values.reasons = [values.reason, ...additional];
      const environmentalAdditional = formData.getAll('extra-environmental-reason');
      if (environmentalAdditional.length) values.environmentalReasons = [values.environmentalReason, ...environmentalAdditional];
      if (formData.has('assessment-benefit')) {
        values.environmentalAssessment = {
          benefit: formData.get('assessment-benefit'),
          harm: Object.fromEntries(Array.from(formData).filter(([key]) => key.startsWith('assessment-harm-'))
            .map(([key, value]) => [key.replace('assessment-harm-', ''), value])),
        };
      }
      const evidence = Object.fromEntries(Object.keys(EVIDENCE)
        .filter((key) => values[`proof-${key}`] !== undefined).map((key) => [key, values[`proof-${key}`]]));
      const report = analyseAccess(values, evidence);
      const reportText = accessReportText(values, evidence);
      currentLaw = report.law || LADA;
      const exportButton = h('button', { type: 'button' }, 'Guardar relatório');
      exportButton.addEventListener('click', () => {
        const text = reportText;
        const preview = h('textarea', { readonly: '', rows: '16', 'aria-label': 'Relatório em texto', class: 'case-report-preview' });
        preview.value = text;
        const error = h('p', { role: 'alert', hidden: '' });
        const pdf = h('button', { type: 'button' }, 'Guardar em PDF');
        pdf.addEventListener('click', () => {
          try {
            const printWindow = window.open('', '_blank');
            if (!printWindow) throw new Error('O navegador bloqueou a janela de impressão. Permite pop-ups para este site e tenta novamente.');
            printWindow.opener = null;
            printWindow.document.open();
            printWindow.document.write(accessReportPrintHtml(text));
            printWindow.document.close();
            printWindow.document.querySelector('button').addEventListener('click', () => {
              try {
                printWindow.print();
              } catch (failure) {
                console.error('Falha na impressão do relatório jurídico:', failure);
                const warning = printWindow.document.createElement('p');
                warning.setAttribute('role', 'alert');
                warning.textContent = `Não foi possível abrir a impressão: ${failure.message}. Usa a opção Imprimir do navegador ou guarda o relatório em texto na página original.`;
                printWindow.document.querySelector('.print-actions').append(warning);
              }
            });
            printWindow.document.querySelector('button').click();
            error.hidden = true;
          } catch (failure) {
            console.error('Falha ao preparar PDF jurídico:', failure);
            error.textContent = `Não foi possível preparar o PDF: ${failure.message}. A opção .txt continua disponível.`;
            error.hidden = false;
          }
        });
        const download = h('button', { type: 'button' }, 'Descarregar .txt');
        download.addEventListener('click', () => {
          let url;
          try {
            url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
            const link = h('a', { href: url, download: `analise-acesso-${report.law === 'cpa' ? 'cpa' : 'lada'}.txt` });
            link.click();
            error.hidden = true;
          } catch (failure) {
            console.error('Falha ao descarregar relatório jurídico:', failure);
            error.textContent = `Não foi possível iniciar a descarga: ${failure.message}. Podes selecionar e copiar o texto abaixo.`;
            error.hidden = false;
          } finally {
            if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
        });
        openReading('Guardar relatório da análise', h('div', { class: 'case-comparison' },
          h('p', { class: 'case-comparison-note' }, 'Confere o relatório antes de guardar. O ficheiro conserva as respostas declaradas: partilha-o com cuidado. Não inclui documentos pessoais nem verifica a lei em vigor.'),
          h('p', null, 'Para PDF, abre a versão de impressão e escolhe «Guardar como PDF» no destino. O navegador pode pedir autorização para abrir uma nova janela.'),
          h('div', { class: 'brain-chips' }, pdf, download), error, preview));
      });
      const balanceButton = h('button', { type: 'button' }, 'Comparar interesse público e restrições');
      balanceButton.addEventListener('click', () => openReading('Ponderação ambiental · argumentos e prova',
        h('div', { class: 'case-comparison' },
          h('p', { class: 'case-comparison-note', role: 'note' },
            'Este quadro organiza argumentos e prova declarada. Não determina qual interesse prevalece nem substitui a leitura dos fundamentos. Resolver uma objeção não elimina as restantes.'),
          ...(report.issues[0].application !== 'conditional' ? [
            h('p', { class: 'case-comparison-note', role: 'note' }, 'Há condições por esclarecer. As comparações abaixo são orientação geral, não posições aplicáveis ao caso.'),
          ] : []),
          ...report.environmentalBalance.map((entry) => h('section', { class: 'case-comparison-option' },
            h('h3', null, entry.interest),
            h('p', null, h('strong', null, 'A favor da divulgação: '), entry.argument),
            h('p', null, h('strong', null, 'Suporte indicado para a restrição: '), entry.support),
            h('p', null, h('strong', null, 'A objeção a examinar: '), entry.objection),
            h('p', null, h('strong', null, 'O que reunir: '), entry.verify),
            h('p', null, h('strong', null, 'Alternativa à recusa total: '), entry.separation),
            h('p', null, entry.limit),
            h('div', { class: 'brain-chips' }, entry.refs.map(source)))))));
      const roadmapButton = h('button', { type: 'button' }, 'O que confirmar primeiro');
      roadmapButton.addEventListener('click', () => openReading('Roteiro de verificação',
        h('div', { class: 'case-comparison' },
          h('p', { class: 'case-comparison-note', role: 'note' },
            'Começa pelas dúvidas e pelos conflitos; depois verifica o suporte das respostas. A ordem segue as condições da análise, não a urgência de prazos. Não introduzas documentos nem dados pessoais aqui.'),
          ...(report.roadmap.length ? [
            h('ol', { class: 'case-comparison-options', 'aria-label': 'Pontos a verificar por ordem' },
              report.roadmap.map((task, index) => h('li', { class: 'case-comparison-option' },
                h('h3', null, h('span', { class: 'case-comparison-number', 'aria-hidden': 'true' }, String(index + 1)), task.title),
                h('p', null, task.question),
                h('p', null, h('strong', null, 'O que procurar: '), task.verify),
                h('p', null, h('strong', null, 'Questões que dependem disto: '), task.affects.join(' · ')),
                h('div', { class: 'brain-chips' }, task.refs.map(source))))),
          ] : [
            h('p', null, 'Não há novas dúvidas ou faltas de suporte assinaladas pelo questionário. Isto não significa que os factos ou a suficiência da prova tenham sido verificados.'),
          ]),
          h('p', { class: 'case-comparison-note', role: 'note' },
            'Depois de conferires os elementos, atualiza as respostas e volta a analisar. Resolver um ponto não garante acesso: outras condições e restrições podem manter-se. Se houver prazo próximo, procura aconselhamento jurídico.'))));
      const summaryButton = h('button', { type: 'button' }, 'Ver síntese do caso');
      summaryButton.addEventListener('click', () => {
        const summary = report.summary;
        const section = (title, text) => h('section', { class: 'case-comparison-question' },
          h('h3', null, title), h('p', null, text));
        openReading('Síntese do caso', h('div', { class: 'case-comparison' },
          h('p', { class: 'case-comparison-note', role: 'note' },
            'Síntese local das respostas, não um parecer jurídico. Destaca uma questão prioritária; não classifica a força dos argumentos nem substitui a leitura das restantes posições. A prova e a versão em vigor da lei não foram verificadas.'),
          section('A questão prioritária', summary.title),
          ...(summary.position ? [
            section('Uma posição possível', summary.position),
            section('A objeção a examinar', summary.objection),
            section('Como responder', summary.reply),
            section('O limite dessa resposta', summary.limit),
          ] : [
            section('Ainda não há posição aplicável', 'Esclarece os pontos abaixo antes de usar uma tese ou réplica para esta questão.'),
          ]),
          ...(summary.clarify.length ? [h('section', { class: 'case-comparison-question' },
            h('h3', null, 'O que falta esclarecer'),
            h('ul', { class: 'case-list' }, summary.clarify.map((text) => h('li', null, text))))] : []),
          section('A prova a reunir', summary.evidence),
          ...(summary.proof.length ? [
            h('section', { class: 'case-comparison-question' },
              h('h3', null, 'O suporte que indicaste'),
              h('ul', { class: 'case-list' }, summary.proof.map(({ title, label }) => h('li', null, `${title}: ${label}`)))),
          ] : []),
          ...(report.limited || report.issues.some(({ application }) => application !== 'conditional') ? [
            h('p', { class: 'case-comparison-note', role: 'note' },
              'Há outras questões por esclarecer. Esta síntese não significa que todo o pedido possa ser avaliado. Consulta os fundamentos e limites de cada posição.'),
          ] : []),
          h('section', { class: 'case-comparison-sources' }, h('h3', null, 'Artigos de apoio'),
            h('div', { class: 'brain-chips' }, summary.refs.map(source)))));
      });
      const dossierButton = h('button', { type: 'button' }, 'Ver dossiê e prova em falta');
      dossierButton.addEventListener('click', () => openReading('Dossiê do pedido', [
        h('p', null, 'Estas são as tuas indicações, não factos verificados. O suporte documental não garante que a resposta seja verdadeira ou que a prova seja suficiente.'),
        ...report.dossier.map(({ title, answer, label, verify }) => h('section', { class: 'case-issue' },
          h('h3', null, title), h('p', null, `Resposta: ${answer}`), h('p', null, label),
          h('p', null, `Para verificar: ${verify}`))),
      ]));
      result.replaceChildren(
        h('h3', null, 'O que isto significa para o teu pedido'),
        h('div', { class: 'brain-chips' }, summaryButton, roadmapButton, dossierButton, exportButton,
          ...(report.environmentalBalance?.length ? [balanceButton] : [])),
        ...(report.contradictions.length ? [
          h('section', { class: 'case-issue', role: 'alert' }, h('h3', null, 'Há respostas que não combinam'),
            h('ul', { class: 'case-list' }, report.contradictions.map(({ text }) => h('li', null, text)))),
        ] : []),
        ...(report.limited ? [h('p', { role: 'note' }, 'Ainda não podemos avaliar todo o pedido. As explicações e os prazos abaixo são apenas orientação geral.')] : []),
        ...report.issues.map((issue) => {
          const read = h('button', { type: 'button' }, 'Ver fundamento e limites');
          const decisions = issue.decisions.map((id) => {
            const button = h('button', { type: 'button' }, DECISIONS[id].title);
            button.addEventListener('click', () => showDecision(id, readingBackTo(button), values, evidence));
            return button;
          });
          const verify = h('button', { type: 'button' }, 'Ler as passagens da lei');
          verify.addEventListener('click', () => {
            showPassages(issue, readingBackTo(verify));
          });
          read.addEventListener('click', () => {
            if (report.refusalGrounds) {
              const groups = [];
              for (const branch of report.refusalGrounds) {
                const position = branch.issues.find(({ id }) => id === issue.id);
                if (!position) continue;
                const signature = JSON.stringify([position.argument, position.objection, position.reply, position.replyLimit, position.evidence, position.refs]);
                const group = groups.find((item) => item.signature === signature);
                if (group) group.labels.push(branch.label);
                else groups.push({ signature, labels: [branch.label], position });
              }
              openReading(issue.title, h('div', { class: 'case-comparison' },
                h('p', { class: 'case-comparison-note', role: 'note' }, 'Fundamentos invocados em conjunto. As explicações abaixo não escolhem qual razão prevalece; resolver uma não elimina as outras.'),
                ...(issue.blockers.length ? [h('section', { class: 'case-comparison-question' },
                  h('h3', null, 'Antes de aplicar estas posições'),
                  h('ul', { class: 'case-list' }, issue.blockers.map((text) => h('li', null, text))))] : []),
                ...groups.map(({ labels, position }) =>
                  h('section', { class: 'case-comparison-option' },
                    h('h3', null, labels.join(' · ')),
                    h('p', null, h('strong', null, 'Regra: '), position.argument),
                    h('p', null, h('strong', null, 'Objeção: '), position.objection),
                    h('p', null, h('strong', null, 'Resposta possível, após confirmar os factos: '), position.reply),
                    h('p', null, h('strong', null, 'Limite: '), position.replyLimit),
                    h('p', null, h('strong', null, 'Prova útil: '), position.evidence),
                    h('div', { class: 'brain-chips' }, position.refs.map(source)))),
                h('div', { class: 'legal-passage-actions' }, verify),
                ...(decisions.length ? [h('section', { class: 'case-comparison-sources' },
                  h('h3', null, 'Decisão para comparar'),
                  h('p', null, 'Exemplo temático: não resolve o conjunto de fundamentos da recusa.'),
                  h('div', { class: 'brain-chips' }, decisions))] : [])));
              return;
            }
            openReading(issue.title, [
            ...(issue.blockers.length ? [h('h3', null, 'O que falta esclarecer'),
              h('ul', { class: 'case-list' }, issue.blockers.map((text) => h('li', null, text)))] : []),
            ...(issue.application === 'unresolved' ? [
              h('h3', null, 'O que falta esclarecer'),
              h('ul', { class: 'case-list' }, issue.facts.filter(({ value }) => value === 'unknown')
                .map(({ question }) => h('li', null, question))),
            ] : []),
            h('h3', null, 'O que diz a lei'), h('p', null, issue.argument),
            ...(report.environmentalGrounds?.length ? [
              h('section', { class: 'case-comparison' },
                ...report.environmentalGrounds.map((branch) => h('section', { class: 'case-comparison-option' },
                  h('h3', null, branch.label), h('p', null, branch.argument),
                  h('p', null, h('strong', null, 'Resposta possível: '), branch.reply),
                  h('p', null, branch.limit),
                  h('div', { class: 'brain-chips' }, source(branch.ground[0]))))),
            ] : []),
            h('h3', null, 'O que pode limitar o teu pedido'), h('p', null, issue.objection),
            h('h3', null, 'Como podes responder'), h('p', null, issue.reply),
            h('h3', null, 'Quando essa resposta não chega'), h('p', null, issue.replyLimit),
            h('h3', null, 'O que reunir'), h('p', null, issue.evidence),
            ...(issue.proof.length ? [
              h('h3', null, 'Suporte desta posição'),
              h('ul', { class: 'case-list' }, issue.proof.map(({ title, label }) => h('li', null, `${title}: ${label}`))),
              h('p', null, 'Sem verificar a prova, esta posição continua a depender da confirmação dos factos.'),
            ] : []),
            h('h3', null, 'Consultar os artigos'),
            h('div', { class: 'brain-chips' }, issue.refs.map(source)),
            h('div', { class: 'legal-passage-actions' }, verify),
            ...(decisions.length ? [
              h('section', { class: 'case-comparison-sources' },
                h('h3', null, 'Decisão para comparar'),
                h('p', null, 'Exemplo sobre esta questão; não significa que os factos sejam iguais aos teus.'),
                h('div', { class: 'brain-chips' }, decisions)),
            ] : []),
          ]);
          });
          return h('section', { class: 'case-issue' },
            h('h3', null, issue.title), h('p', null, issue.conclusion), read);
        }),
        ...(report.scenarios.length ? [
          h('section', { class: 'brain-block' }, h('h3', null, 'O que pode mudar a análise'),
            ...report.scenarios.map((scenario) => {
              const compare = h('button', { type: 'button' }, 'Comparar cenários');
              compare.addEventListener('click', () => openReading(scenario.title,
                h('div', { class: 'case-comparison' },
                  h('section', { class: 'case-comparison-question' },
                    h('h3', null, 'O que precisamos de saber'), h('p', null, scenario.question)),
                  h('p', { class: 'case-comparison-note', role: 'note' },
                    'Estas alternativas não são conclusões sobre o teu caso. Confirma o regime e os factos antes de aplicar alguma delas.'),
                  h('ol', { class: 'case-comparison-options', 'aria-label': 'Cenários alternativos' },
                    scenario.branches.map(([condition, consequence], index) => h('li', { class: 'case-comparison-option' },
                      h('h3', null, h('span', { class: 'case-comparison-number', 'aria-hidden': 'true' }, String(index + 1)), condition),
                      h('p', null, consequence)))),
                  h('section', { class: 'case-comparison-sources' },
                    h('h3', null, 'Artigos de apoio'),
                    h('div', { class: 'brain-chips' }, scenario.refs.map(source))))));
              return h('div', { class: 'case-issue' }, h('h4', null, scenario.title), compare);
            })),
        ] : []),
        ...(report.deadlines.length ? [h('section', { class: 'brain-block' }, h('h3', null, 'Prazos: confirmar antes de agir'),
          ...report.deadlines.map(({ text, ref }) => h('p', null, text, ' ', source(ref))))] : []),
        h('section', { class: 'brain-block' }, h('h3', null, 'Próximos passos'),
          h('ol', { class: 'case-list' }, report.next.map((text) => h('li', null, text))),
          ...(report.law === 'cpa' ? [] : [h('a', { href: 'https://www.cada.pt', target: '_blank', rel: 'noopener noreferrer' }, 'CADA · informação oficial ↗')])));
      result.hidden = false;
      result.focus();
    } catch (error) {
      result.replaceChildren(h('p', { role: 'alert' }, `Não foi possível analisar o caso: ${error.message}`));
      result.hidden = false;
      result.focus();
    }
  });
  form.addEventListener('change', () => { updateQuestions(); result.hidden = true; });
}

if (typeof document !== 'undefined') mount().catch((error) => {
  console.error('Falha ao iniciar a análise local de casos:', error);
  const shell = document.getElementById('case-shell');
  if (shell) {
    shell.setAttribute('role', 'alert');
    shell.textContent = `Não foi possível iniciar a análise: ${error.message}`;
  }
});

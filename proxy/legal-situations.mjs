export const SITUATION_SOURCES = {
  crp: { label: 'Constituição', nid: '4' },
  cc: { label: 'Código Civil', nid: '775' },
  cp: { label: 'Código Penal', nid: '109' },
  cpp: { label: 'Código de Processo Penal', nid: '199' },
  estjorn: { label: 'Estatuto do Jornalista', nid: '136' },
  imprensa: { label: 'Lei de Imprensa', nid: '138' },
  cpa: { label: 'Código do Procedimento Administrativo', nid: '2248' },
  cpta: { label: 'Código de Processo nos Tribunais Administrativos', nid: '439' },
  rgpd: { label: 'RGPD', nid: '2961' },
  consumidor: { label: 'Lei de Defesa do Consumidor', nid: '726' },
  vendabens: { label: 'Regime da venda de bens e conteúdos digitais', nid: '3471' },
};

export const LEGAL_SITUATIONS = [
  {
    id: 'publication-challenged',
    audience: 'journalists',
    title: 'Contestaram uma publicação minha',
    intro: 'Recebeste um pedido de resposta, uma reclamação ou uma comunicação sobre uma notícia. Primeiro distingue o que te está a ser pedido.',
    topics: ['honra', 'resposta', 'imprensa'],
    confirm: [
      'É um pedido de resposta ou retificação, um pedido informal de correção, uma ameaça de ação ou uma notificação judicial?',
      'Qual é o meio de publicação, a data, o conteúdo contestado e a qualidade de quem reclama?',
      'Distingue afirmações de facto, juízos de valor e informação da vida privada; uma opinião não fica automaticamente fora dos limites legais.',
    ],
    rights: [
      { text: 'A liberdade de expressão e de imprensa é um ponto de partida, não uma dispensa dos direitos de terceiros.', refs: [['crp', '37'], ['crp', '38'], ['crp', '26']] },
      { text: 'Nas publicações periódicas, resposta e retificação têm pressupostos distintos. Confere o pedido antes de decidir como atuar; esta ficha não decide a sua validade.', refs: [['imprensa', '24'], ['imprensa', '25']] },
      { text: 'Em matéria de difamação, interesses legítimos e verdade ou fundamento sério em boa-fé têm condições cumulativas e limites. A vida privada e o dever de informação exigem cuidado próprio.', refs: [['cp', '180']] },
    ],
    proof: ['Guarda a publicação original, versões e datas, o pedido integral e o comprovativo da sua receção.',
      'Preserva os elementos que sustentam os factos e as diligências de verificação e contraditório. Mantém os materiais que identificam fontes num circuito protegido.'],
    actions: ['Identifica o tipo de comunicação e encaminha-a para a direção editorial e apoio jurídico, sem confundir reclamação com processo judicial.',
      'Prepara uma cronologia e compara cada ponto contestado com o material publicado. Avalia correção editorial separadamente das obrigações legais.',
      'Se houver notificação judicial ou prazo próximo, procura apoio jurídico de imediato; não assumas que uma resposta editorial substitui um ato processual.'],
    entities: [
      { id: 'sj', use: 'Pedir informação sobre apoio jurídico e deontológico a jornalistas.' },
      { id: 'oa', use: 'Procurar advogado para avaliar a comunicação e os meios de reação.' },
      { id: 'erc', use: 'Consultar informação sobre direito de resposta e regulação; a competência depende do assunto e do meio.' },
    ],
    deadlines: 'Regista a publicação e a receção do pedido. Os prazos variam com o meio, o pedido e o ato a praticar. Esta ficha não calcula datas nem transpõe os prazos da imprensa para rádio ou televisão.',
    limits: ['Não classifica a publicação como lícita ou ilícita, não prevê êxito nem substitui a leitura integral de uma notificação.',
      'Não recomenda o modelo de direito de resposta a quem está a responder a esse pedido: são posições diferentes. Não há envio automático de documentos.'],
  },
  {
    id: 'privacy-publication',
    audience: 'journalists',
    title: 'Quero publicar imagens ou informação da vida privada',
    intro: 'Antes de divulgar, distingue interesse jornalístico, direitos da pessoa e forma de obtenção do material.',
    topics: ['privacidade', 'dados', 'imprensa'],
    confirm: ['O material identifica alguém? Inclui imagem, voz, intimidade, menores ou dados pessoais que exijam análise específica?',
      'Como foi obtido, para que uso existe consentimento e que informação é realmente necessária à notícia?',
      'O que torna o assunto relevante para o público, em vez de apenas curioso? Há uma alternativa menos intrusiva?'],
    rights: [
      { text: 'Liberdade de informação e proteção da vida privada devem ser examinadas em conjunto. Esta ficha não faz uma ponderação automática.', refs: [['crp', '26'], ['crp', '37'], ['crp', '38'], ['cc', '80']] },
      { text: 'O direito à imagem tem exceções legalmente previstas, mas não basta dizer que a pessoa é conhecida ou que estava num local público. Confere o contexto e o limite relativo à honra, reputação e decoro.', refs: [['cc', '79']] },
      { text: 'Obter, gravar e utilizar material são questões distintas. Participar numa conversa não significa, por si só, poder gravá-la sem consentimento; há regras penais a examinar.', refs: [['cp', '199']] },
    ],
    proof: ['Documenta a origem, o contexto e as autorizações existentes, sem as introduzir nesta ferramenta.',
      'Regista a justificação editorial, as verificações e as alternativas consideradas, como anonimização, corte ou não divulgação.'],
    actions: ['Separa a avaliação da obtenção do material da decisão de o publicar.',
      'Discute a necessidade de identificar a pessoa e de divulgar cada detalhe com a direção editorial.',
      'Se houver menores, intimidade, gravação sem consentimento ou dúvida séria, obtém avaliação jurídica antes de divulgar. A anonimização não garante, sozinha, licitude.'],
    entities: [
      { id: 'sj', use: 'Pedir orientação deontológica e informação sobre apoio jurídico.' },
      { id: 'oa', use: 'Procurar avaliação jurídica prévia, incluindo regimes específicos.' },
      { id: 'cnpd', use: 'Consultar informação sobre proteção de dados; não é uma autorização prévia para publicar.' },
    ],
    deadlines: 'Não há nesta ficha um prazo geral para publicar. Uma notificação ou processo pode criar urgência própria; a ausência de contagem aqui não significa ausência de prazo.',
    limits: ['Não determina consentimento válido, interesse público prevalecente ou adequação da anonimização.',
      'Não aplica integralmente os regimes de dados pessoais, menores, segredo de justiça ou gravações. Não recomenda automaticamente um pedido de remoção a quem quer publicar.'],
  },
  {
    id: 'source-protection',
    audience: 'journalists',
    title: 'Pediram-me para revelar uma fonte',
    intro: 'Pode tratar-se de pressão informal, pedido de depoimento, ordem judicial ou diligência sobre materiais. O contexto importa.',
    topics: ['sigilo', 'justica', 'imprensa'],
    confirm: ['Quem está a pedir, por que meio e com que fundamento? Existe convocatória, mandado ou decisão judicial?',
      'Está em causa a identidade de uma fonte ou material que permita identificá-la?',
      'Qual é o ato e o prazo indicado? O teu enquadramento como jornalista e as regras aplicáveis precisam de ser confirmados.'],
    rights: [
      { text: 'A Constituição protege a liberdade de imprensa e o acesso às fontes de informação; o Estatuto prevê o sigilo profissional, sem prejuízo da lei processual penal.', refs: [['crp', '38'], ['estjorn', '11']] },
      { text: 'A escusa e a quebra do segredo profissional têm procedimentos distintos no processo penal. Não se deduz que qualquer pedido imponha revelação, nem que o sigilo seja absoluto.', refs: [['cpp', '135'], ['estjorn', '11']] },
      { text: 'Buscas, apreensões e material que permita identificar fontes têm regras específicas no Estatuto. A ficha não avalia a validade de uma diligência concreta.', refs: [['estjorn', '11']] },
    ],
    proof: ['Preserva a comunicação, a identificação da autoridade, os fundamentos e as datas, num circuito de acesso restrito.',
      'Não introduzas nomes de fontes, mensagens ou arquivos nesta ferramenta. Não alteres ou destruas prova; procura apoio para proteger o material respeitando as obrigações legais.'],
    actions: ['Procura apoio jurídico antes de responder sobre material protegido; não ignores convocatórias ou ordens.',
      'Leva a comunicação integral ao advogado e esclarece como invocar o sigilo no ato concreto.',
      'Se uma diligência estiver em curso ou existir prazo próximo, pede apoio imediato e informa a direção editorial sem divulgar desnecessariamente a fonte.'],
    entities: [
      { id: 'sj', use: 'Contactar o Sindicato dos Jornalistas para informação sobre apoio jurídico e profissional.' },
      { id: 'oa', use: 'Procurar advogado para examinar o ato, a escusa e os meios adequados de reação.' },
      { id: 'ccpj', use: 'Consultar informação sobre estatuto e enquadramento profissional; não substitui a defesa perante um tribunal.' },
    ],
    deadlines: 'Confere o ato recebido: pode indicar uma data de comparência ou prazo. Esta ficha não calcula a contagem nem aconselha faltar ou desobedecer.',
    limits: ['Não garante sigilo absoluto, imunidade ou invalidade de uma busca. Não determina legitimidade da escusa ou admissibilidade de quebra.',
      'Não gera uma declaração automática de recusa de depoimento. O meio de reação depende da decisão e da fase processual.'],
  },
  {
    id: 'administrative-decision',
    audience: 'citizens',
    title: 'Recebi uma decisão de um serviço público e discordo',
    intro: 'Uma proposta de decisão, uma decisão final e uma notificação para pagar ou cumprir não são a mesma coisa. Começa pelo documento recebido.',
    topics: ['administrativo'],
    confirm: ['Qual é o serviço, o assunto, o ato recebido e a data e forma da notificação?',
      'Ainda te estão a ouvir antes de decidir ou já há decisão final? Existe um regime específico, como fiscal, contraordenacional ou de segurança social?',
      'O documento indica fundamentos, destinatário de reclamação ou recurso e algum prazo? Há efeitos imediatos ou risco de dano?'],
    rights: [
      { text: 'No procedimento administrativo, a audiência antes da decisão final é um direito sujeito a exceções. Confirma a fase e as regras aplicáveis; discordar não demonstra que a audiência era obrigatória neste caso.', refs: [['cpa', '121']] },
      { text: 'Determinados atos administrativos, incluindo os que neguem ou restrinjam direitos ou interesses legalmente protegidos, devem ser fundamentados. Confere o ato e as condições legais.', refs: [['cpa', '152']] },
      { text: 'Reclamar para o autor do ato e agir em tribunal são caminhos distintos, com condições próprias. Não se presume que um pedido informal suspenda efeitos ou preserve prazos.', refs: [['cpa', '191'], ['cpta', '58']] },
    ],
    proof: ['Guarda a decisão integral, anexos, envelope ou registo eletrónico da notificação, requerimento inicial e comprovativos.',
      'Prepara uma cronologia, identifica os pontos de discordância e reúne os documentos que os sustentam, sem os carregar nesta ferramenta.'],
    actions: ['Distingue audiência, reclamação, recurso e ação judicial antes de escolher o documento a apresentar.',
      'Pede esclarecimento ao serviço sobre o ato e os meios indicados, mas não deixes decorrer um prazo à espera de uma resposta informal.',
      'Se existir prazo próximo, execução ou possível dano grave, procura apoio jurídico para confirmar o meio de reação e eventual proteção urgente.'],
    entities: [
      { id: 'oa', use: 'Procurar advogado para avaliar o ato e o meio adequado de reação.' },
      { id: 'ss', use: 'Consultar condições e procedimento de proteção jurídica, se não tiveres meios para os custos.' },
      { id: 'provedor', use: 'Consultar a possibilidade de queixa sobre atuação administrativa; não substitui recurso ou ação nem se presume que suspenda prazos.' },
    ],
    deadlines: 'Confere a notificação, a data juridicamente relevante, o tipo de ato e o regime. Esta ficha não calcula prazos nem aplica automaticamente os prazos gerais a matérias especiais.',
    limits: ['Não declara a decisão inválida, não escolhe o recurso por ti e não confirma a tempestividade de qualquer atuação.',
      'Pedir esclarecimentos ou apresentar queixa ao Provedor não é tratado aqui como suspensão de efeitos ou de prazos. Não se gera automaticamente uma impugnação.'],
  },
  {
    id: 'personal-data-use',
    audience: 'citizens',
    title: 'Usaram os meus dados pessoais e quero agir',
    intro: 'Primeiro identifica quem usa os dados e o que queres obter: informação, correção, apagamento ou apresentação de uma reclamação.',
    topics: ['dados'],
    confirm: ['Que entidade está a tratar os dados e onde identificaste o tratamento? O RGPD aplica-se ou existe um regime específico?',
      'Queres conhecer os dados, corrigir informação errada ou pedir apagamento? São objetivos diferentes, com condições próprias.',
      'Já apresentaste um pedido ao responsável? Quando foi recebido e que resposta, justificação ou prorrogação foi comunicada?'],
    rights: [
      { text: 'O RGPD prevê informação sobre os pedidos de exercício de direitos e regras de resposta. Confere a receção, as condições de identificação e a eventual prorrogação; esta ficha não conclui que existe atraso.', refs: [['rgpd', '12']] },
      { text: 'Acesso, retificação e apagamento são direitos distintos. O apagamento depende das condições e exceções legais; não é um direito automático a eliminar qualquer informação.', refs: [['rgpd', '15'], ['rgpd', '16'], ['rgpd', '17']] },
      { text: 'Se considerares que o tratamento dos teus dados viola o RGPD, existe a possibilidade de reclamação a uma autoridade de controlo. Isso não comprova uma infração nem garante apagamento ou indemnização.', refs: [['rgpd', '77']] },
    ],
    proof: ['Preserva o aviso de privacidade, a comunicação ou captura com endereço e data que mostra o tratamento.',
      'Guarda o pedido enviado, comprovativo de receção e resposta. Evita reproduzir mais dados do que os necessários; não os introduzas nesta ferramenta.'],
    actions: ['Identifica o responsável e usa o canal indicado para explicar o direito que pretendes exercer e o tratamento em causa.',
      'Compara a resposta com o pedido e guarda os fundamentos invocados. Não envies documentos de identificação sem avaliar necessidade e segurança.',
      'Se a resposta não resolver a questão, consulta a CNPD sobre reclamação. Para dano, urgência ou via judicial, procura avaliação jurídica.'],
    entities: [
      { id: 'cnpd', use: 'Consultar os direitos dos titulares e o canal de reclamação; não se presume que a entidade tenha cometido uma infração.' },
      { id: 'oa', use: 'Procurar apoio para regimes específicos, medidas urgentes ou eventual ação judicial.' },
    ],
    deadlines: 'Confere as regras do artigo 12.º, a receção e a eventual prorrogação fundamentada. Não se calcula aqui atraso ou data-limite; outros regimes podem ter regras diferentes.',
    limits: ['Não decide se houve tratamento ilícito, se o consentimento era necessário ou se o apagamento é devido.',
      'Não aplica integralmente os regimes de tratamento penal, jornalismo ou proteção de outros titulares. Não apresenta queixa nem gera automaticamente um pedido com todos os direitos.'],
  },
  {
    id: 'consumer-problem',
    audience: 'citizens',
    title: 'Tive um problema com uma compra ou serviço',
    intro: 'Um produto com defeito, um serviço mal prestado e querer desistir de uma compra exigem caminhos diferentes.',
    topics: ['consumo'],
    confirm: ['Compraste para uso não profissional a alguém que atua profissionalmente? Uma compra entre particulares pode seguir regras diferentes.',
      'É um bem, serviço, conteúdo digital ou outra prestação? Quando contrataste e quando recebeste ou detetaste o problema?',
      'Está em causa falta de conformidade, incumprimento, cobrança ou desistência? A compra foi presencial ou à distância e o setor tem regras especiais?'],
    rights: [
      { text: 'A Lei de Defesa do Consumidor define o âmbito de proteção e prevê direitos à qualidade, informação e proteção dos interesses económicos. Confirma se a relação está abrangida.', refs: [['consumidor', '2'], ['consumidor', '3'], ['consumidor', '8']] },
      { text: 'Na venda de bens abrangida pelo regime, os meios de reposição da conformidade, redução do preço ou resolução têm condições e uma articulação própria. Não se presume reembolso imediato em qualquer defeito.', refs: [['vendabens', '3'], ['vendabens', '15']] },
    ],
    proof: ['Guarda fatura, contrato, condições e publicidade relevantes, comprovativos de pagamento e entrega.',
      'Documenta o problema, a data em que o detetaste, as comunicações e a resposta do fornecedor. Preserva o bem e os elementos úteis à avaliação.'],
    actions: ['Explica por escrito o problema ao vendedor ou prestador e identifica a solução pretendida, sem confundir defeito com simples desistência.',
      'Se não ficar resolvido, consulta a Direção-Geral do Consumidor sobre meios adequados e centros de resolução de conflitos; o setor e o contrato importam.',
      'O Livro de Reclamações é um canal possível quando aplicável, mas não equivale a uma decisão de reembolso nem substitui todas as vias de reação.'],
    entities: [
      { id: 'dgc', use: 'Consultar direitos, entidades setoriais e meios de resolução alternativa de conflitos.' },
      { id: 'livro', use: 'Consultar e utilizar o canal de reclamação quando aplicável à entidade e à atividade.' },
      { id: 'oa', use: 'Procurar avaliação jurídica se houver litígio, prazo ou valor que exija apoio.' },
    ],
    deadlines: 'Regista contratação, entrega, deteção do problema e comunicação ao fornecedor. Prazos e regimes dependem do contrato, data e tipo de bem ou serviço. Não se aplica aqui um prazo único de garantia ou de desistência.',
    limits: ['Não confirma falta de conformidade, cobertura de garantia ou direito a reembolso. O regime de venda de bens não é aplicado automaticamente a qualquer serviço.',
      'Não afirma que todas as compras podem ser devolvidas em 14 dias. Não aplica integralmente resolução à distância, serviços financeiros ou outros regimes especiais.'],
  },
];

export const SITUATION_PATHS = {
  'publication-challenged': {
    question: 'Que comunicação recebeste sobre a publicação?',
    options: [
      ['unknown', 'Ainda não identifiquei', 'Identificar a comunicação', 'Lê o documento integral e distingue pedido editorial, exercício de direito e ato processual. Não escolhas uma resposta só pelo título.'],
      ['correction', 'Pedido informal de correção', 'Avaliar a correção editorial', 'Compara os pontos contestados com a publicação e as verificações realizadas. Um pedido apresentado como informal pode exigir análise da sua natureza jurídica.'],
      ['reply', 'Pedido de resposta ou retificação', 'Conferir pressupostos e meio de publicação', 'Encaminha o pedido integral para a direção editorial e apoio jurídico. Confirma âmbito, conteúdo, datas e lei do meio; não uses como resposta um modelo dirigido a quem exerce o direito.'],
      ['legal', 'Comunicação judicial ou ameaça de ação', 'Distinguir ameaça de ato processual', 'Uma ameaça não é uma convocatória. Se recebeste um ato judicial, procura apoio para identificar o ato a praticar e o prazo; uma resposta editorial não o substitui.'],
    ],
  },
  'privacy-publication': {
    question: 'Qual é a tua principal dúvida sobre o material?',
    options: [
      ['unknown', 'Ainda não consegui distinguir', 'Separar obtenção e publicação', 'Identifica como o material foi obtido, quem pode ser identificado e o que pretendes divulgar. Uma autorização de acesso não demonstra autorização de publicação.'],
      ['obtaining', 'Como foi obtido ou gravado', 'Examinar a obtenção do material', 'Confere consentimento, contexto e regras aplicáveis antes de usar. Participar numa conversa ou receber uma gravação não demonstra, por si só, que a obtenção ou utilização é lícita.'],
      ['identification', 'Identificar alguém ou mostrar a sua imagem', 'Examinar necessidade e alternativas', 'Avalia o interesse da identificação, o contexto da imagem e alternativas menos intrusivas. Ser figura pública, estar na rua ou anonimizar não resolve automaticamente todos os limites.'],
      ['intimacy', 'Divulgar intimidade, menores ou dados sensíveis', 'Pedir avaliação específica antes de divulgar', 'Estes contextos exigem análise própria dos direitos e regimes envolvidos. Discute a necessidade de cada detalhe com a direção e apoio jurídico; a ficha não autoriza a divulgação.'],
    ],
  },
  'source-protection': {
    question: 'Como te foi pedida informação sobre a fonte?',
    options: [
      ['unknown', 'Ainda não identifiquei o ato', 'Identificar origem e fundamento', 'Guarda a comunicação e confirma quem pede, em que qualidade e se existe ato formal. Não envies material identificador da fonte para esta ferramenta.'],
      ['informal', 'Pressão ou pedido informal', 'Proteger o circuito de informação', 'Distingue pressão informal de obrigação processual. Procura apoio profissional e jurídico sem divulgar desnecessariamente a fonte; não assumes que o sigilo resolve todos os contextos.'],
      ['testimony', 'Convocatória ou pedido de depoimento', 'Preparar o ato com apoio jurídico', 'Leva a convocatória integral ao advogado e confirma como invocar o sigilo. Não ignores a comparência nem apresentes automaticamente uma recusa de depoimento.'],
      ['search', 'Ordem, busca ou apreensão de material', 'Obter apoio imediato para a diligência', 'Se a diligência está em curso, procura apoio jurídico imediato. Confere mandado e regras do ato; não obstruas a diligência nem alteres ou destruas prova. A ficha não avalia a sua validade.'],
    ],
  },
  'administrative-decision': {
    question: 'Em que fase está o assunto com o serviço público?',
    options: [
      ['unknown', 'Ainda não identifiquei a fase', 'Identificar o ato recebido', 'Confirma se é proposta, decisão final ou outro ato, a entidade e o regime. Não assumes que qualquer discordância se resolve com o mesmo recurso.'],
      ['hearing', 'Pediram-me pronúncia antes de decidir', 'Preparar a participação na audiência', 'Confere o convite, os elementos disponibilizados e o prazo. Organiza factos e documentos para a pronúncia; a ficha não confirma que esta é uma audiência regulada pelo CPA.'],
      ['final', 'Foi comunicada uma decisão final', 'Identificar o meio de reação', 'Compara fundamentos e provas e confirma reclamação, recurso ou ação adequada, incluindo regimes especiais. Não esperes por esclarecimento informal deixando correr um prazo.'],
      ['execution', 'Pediram pagamento ou cumprimento, ou já há execução', 'Avaliar efeitos e eventual proteção urgente', 'Leva o ato e a notificação integral a apoio jurídico. A cobrança ou execução pode ter regras próprias; reclamar não é tratado aqui como suspensão automática.'],
    ],
  },
  'personal-data-use': {
    question: 'O que pretendes fazer em relação aos teus dados?',
    options: [
      ['unknown', 'Ainda não defini o objetivo', 'Identificar tratamento e objetivo', 'Confirma o responsável, o tratamento e o resultado pretendido. Não escolhas todos os direitos de uma vez sem distinguir as suas condições.'],
      ['access', 'Saber que dados usam e obter informação', 'Preparar um pedido de acesso', 'Identifica o tratamento e o responsável e confere o âmbito do artigo 15.º. Acesso aos teus dados não equivale automaticamente a obter todos os documentos de uma entidade.'],
      ['rectify', 'Corrigir dados inexatos', 'Preparar a retificação', 'Identifica a informação que consideras inexata e o que sustenta a correção. Não introduzas aqui os dados ou comprovativos; confere o artigo 16.º e o regime aplicável.'],
      ['erase', 'Pedir apagamento', 'Conferir condições e exceções', 'Explica ao responsável o tratamento e o fundamento do pedido. O artigo 17.º contém condições e exceções; nem todo o tratamento depende de consentimento ou tem de ser apagado a pedido.'],
      ['complain', 'Reclamar do tratamento ou da resposta', 'Preparar os elementos para a reclamação', 'Guarda pedido, receção, resposta e elementos sobre o tratamento. Consulta o canal da CNPD e distingue reclamação de pedido de indemnização; a escolha não comprova uma infração.'],
    ],
  },
  'consumer-problem': {
    question: 'Que tipo de problema queres resolver?',
    options: [
      ['unknown', 'Ainda não identifiquei o problema', 'Identificar contrato e problema', 'Distingue bem, serviço, conteúdo digital, cobrança e desistência. Confirma relação de consumo e datas antes de escolher uma solução.'],
      ['goods', 'Um bem tem defeito ou não corresponde ao contratado', 'Examinar a falta de conformidade do bem', 'Documenta o problema e comunica ao vendedor. Confere o regime aplicável e as condições dos meios de reposição; não se presume reembolso imediato.'],
      ['service', 'Um serviço falhou ou há uma cobrança contestada', 'Conferir contrato e regras do setor', 'Compara prestação, contrato e cobrança e pede explicação por escrito. O regime de venda de bens não se aplica automaticamente a qualquer serviço.'],
      ['withdraw', 'Quero desistir ou devolver sem alegar defeito', 'Verificar se existe direito de desistência', 'Confirma como foi contratado, datas, exceções e política comercial. Não há aqui direito geral a devolver todas as compras em 14 dias; a ficha não calcula livre resolução.'],
    ],
  },
};

export const SITUATION_URGENCY = [
  ['unknown', 'Ainda não confirmei', 'Confere se a comunicação indica prazo, comparência ou efeitos imediatos. A ausência de informação não demonstra ausência de urgência.'],
  ['none', 'Não identifiquei ato formal ou urgência', 'Esta resposta não confirma que não há prazo. Continua a verificar o documento e o regime; a ferramenta não faz contagem.'],
  ['notice', 'Há notificação, convocatória ou prazo indicado', 'Preserva o documento integral e a receção e procura apoio para confirmar o ato e a contagem. Não ignores a comunicação enquanto aguardas esclarecimento informal.'],
  ['immediate', 'Há diligência em curso ou risco de dano imediato', 'Procura apoio competente de imediato. Esta ferramenta não presta assistência urgente nem decide medidas cautelares; preserva prova e respeita as obrigações legais.'],
];

export function situationGuidance(id, answers = {}) {
  const path = SITUATION_PATHS[id];
  if (!path || !answers || typeof answers !== 'object' || Array.isArray(answers)) throw new Error('Percurso orientador inválido.');
  const route = path.options.find(([value]) => value === (answers.kind === undefined ? 'unknown' : answers.kind));
  const urgency = SITUATION_URGENCY.find(([value]) => value === (answers.urgency === undefined ? 'unknown' : answers.urgency));
  if (!route || !urgency) throw new Error('Resposta inválida no percurso orientador.');
  return { title: route[2], action: route[3], urgency: urgency[2],
    limit: 'Orientação de preparação baseada nas tuas escolhas, não confirmação de factos ou decisão jurídica. Todas as condições, fontes e limites da ficha continuam aplicáveis.' };
}

export function situationModel(id, answers = {}) {
  situationGuidance(id, answers);
  if (answers.urgency !== 'none') return { available: false,
    reason: 'Confirma primeiro a existência de notificações e urgências. Se houver ato formal ou risco imediato, procura apoio para o meio adequado; não é aberto um modelo neste percurso.' };
  if (id === 'personal-data-use' && ['access', 'rectify'].includes(answers.kind)) {
    return { available: true, template: 'rgpd', right: answers.kind,
      title: answers.kind === 'access' ? 'Preparar pedido de acesso aos meus dados' : 'Preparar pedido de retificação dos meus dados',
      conditions: ['O pedido é sobre os teus próprios dados e identificaste o responsável pelo tratamento.',
        'Confirmaste que o exercício deste direito segue o RGPD, e não um regime específico que exija outro caminho.',
        answers.kind === 'access' ? 'Pretendes acesso aos dados e informação sobre o tratamento, não acesso geral a todos os documentos da entidade.'
          : 'Consegues identificar os dados que consideras inexatos e a correção pretendida.'],
      exclusions: ['Não serve para dados de terceiros, reclamação à CNPD, apagamento, oposição ou resposta a ato judicial.',
        'O modelo não confirma a aplicação do RGPD, a inexatidão ou a validade de uma recusa. Não juntes identificação sem avaliar necessidade e segurança.'] };
  }
  if (id === 'consumer-problem' && answers.kind === 'goods') {
    return { available: true, template: 'consumo', title: 'Preparar reclamação sobre um bem',
      conditions: ['Compraste para uso não profissional a um vendedor que atua profissionalmente.',
        'Está em causa um bem com possível falta de conformidade, não um serviço, mera desistência ou compra entre particulares.',
        'Confirmaste o regime aplicável à data e ao tipo de contrato e vais escolher apenas o pedido permitido pelas condições legais.'],
      exclusions: ['Não serve para todos os serviços ou contratos digitais, livre resolução, compras profissionais ou entre particulares.',
        'Reparação, substituição, redução e resolução não são escolhas livres em qualquer caso. Não se confirma garantia, reembolso ou prazo.'] };
  }
  return { available: false, reason: 'Ainda não há modelo ligado a esta alternativa. Usa as ações e entidades da ficha; não escolhemos um documento apenas por pertencer à mesma área jurídica.' };
}

export function situationModelText(selection, kit) {
  if (!selection?.available || !kit?.TEMPLATES || !kit?.FIELDS) throw new Error('Modelo do percurso indisponível.');
  const template = kit.TEMPLATES.find(({ id }) => id === selection.template);
  if (!template || typeof template.body !== 'function') throw new Error('Não foi possível carregar o modelo esperado.');
  return template.body((key) => `[${kit.FIELDS[key] || key}]`, { today: '[Data e assinatura]', right: selection.right });
}

export function situationArticle(doc, id, key) {
  const source = SITUATION_SOURCES[id];
  if (!source || doc?.id !== id || !Array.isArray(doc.arts)) throw new Error('Fonte da ficha inválida.');
  const url = new URL(doc.url);
  if (url.protocol !== 'https:' || url.hostname !== 'www.pgdlisboa.pt'
    || url.pathname !== '/leis/lei_mostra_articulado.php' || url.searchParams.get('nid') !== source.nid) {
    throw new Error('A fonte local não corresponde ao diploma esperado.');
  }
  const matches = doc.arts.filter(({ k }) => k === key);
  if (matches.length !== 1 || typeof matches[0].x !== 'string' || !matches[0].x.trim()) {
    throw new Error('Artigo em falta, repetido ou sem texto verificável.');
  }
  return { title: `${source.label} · artigo ${key}.º`, text: matches[0].x, url: doc.url };
}

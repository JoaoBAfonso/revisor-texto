// Teia: sinais que merecem pergunta. Um sinal nunca afirma uma infração: junta critérios legais verificáveis e diz,
// para cada um, se está confirmado (sim), por confirmar (talvez), contra (nao) ou não se aplica (na), com provas,
// explicações alternativas e lacunas que só uma pessoa pode fechar.
import { SUBJECT, PRIVATE_NAME, RELATIONS, activeOn, dayStart, dayEnd, yearsBetween, classifyBuyer, objectQuery, mergeTimeline, declarationDaysOf } from './teia-graph.mjs';
import { DIRECT_AWARD, PRIOR_CONSULTATION, cleanText, normalizeName, nameTokens, GENERIC_TOKENS } from './teia-index.mjs';

export const LAW_52_START = '2019-10-25';

const law = (id, artigo, rotulo) => ({ id, artigo, rotulo, href: `#/direito/lei/${id}/${artigo}` });
export const LEGAL = {
  exclusividade: law('d123610180', '6', 'Lei n.º 52/2019, artigo 6.º (exclusividade)'),
  autarcas: law('d123610180', '7', 'Lei n.º 52/2019, artigo 7.º (autarcas)'),
  anteriores: law('d123610180', '8', 'Lei n.º 52/2019, artigo 8.º (atividades anteriores)'),
  impedimentos: law('d123610180', '9', 'Lei n.º 52/2019, artigo 9.º (impedimentos)'),
  cessacao: law('d123610180', '10', 'Lei n.º 52/2019, artigo 10.º (depois de sair do cargo)'),
  declaracao: law('d123610180', '13', 'Lei n.º 52/2019, artigo 13.º (declaração única)'),
  clientes: law('d123610180', '13', 'Lei n.º 52/2019, artigo 13.º, n.º 3, alínea b) (a quem foram prestados serviços)'),
  vigencia: law('d123610180', '26', 'Lei n.º 52/2019, artigo 26.º (entrada em vigor)'),
  deputados: law('d626808', '21', 'Estatuto dos Deputados, artigo 21.º (impedimentos)'),
  cpaImpedimento: law('cpa', '69', 'Código do Procedimento Administrativo, artigo 69.º (impedimentos)'),
  cpaSuspeicao: law('cpa', '73', 'Código do Procedimento Administrativo, artigo 73.º (escusa e suspeição)'),
  ccpConvidadas: law('ccp', '113', 'Código dos Contratos Públicos, artigo 113.º (entidades convidadas)'),
  ccpValor: law('ccp', '20', 'Código dos Contratos Públicos, artigo 20.º (escolha do procedimento)'),
  ladaAcesso: law('d75177807', '5', 'Lei n.º 26/2016, artigo 5.º (direito de acesso)'),
  ladaResposta: law('d75177807', '15', 'Lei n.º 26/2016, artigo 15.º (resposta em 10 dias)'),
};

export const MANUAL_SOURCES = {
  transparencia: { nome: 'Entidade para a Transparência — declarações únicas', url: 'https://entidadetransparencia.pt/' },
  atosSocietarios: { nome: 'Publicações de atos societários (Ministério da Justiça)', url: 'https://publicacoes.mj.pt/' },
  cada: { nome: 'Comissão de Acesso aos Documentos Administrativos', url: 'https://www.cada.pt/' },
};

export const PATTERNS = {
  P1: { titulo: 'Funções privadas durante cargo em exclusividade', peso: 2 },
  P2: { titulo: 'Dinheiro público para entidade ligada', peso: 3 },
  P3: { titulo: 'Decisão do Estado sobre entidade ligada', peso: 3 },
  P4: { titulo: 'Porta giratória', peso: 2 },
  P5: { titulo: 'Ligação noticiada fora das declarações', peso: 1 },
  P6: { titulo: 'Entidade ligada à família', peso: 3 },
  P7: { titulo: 'Ajustes diretos repetidos', peso: 1.5 },
  P8: { titulo: 'Quem paga à entidade ligada recebe decisões do Estado', peso: 4 },
};

const ORDER = { nao: 0, talvez: 1, sim: 2 };
const best = (states) => states.reduce((acc, state) => (ORDER[state] > ORDER[acc] ? state : acc), 'nao');
const both = (...states) => states.reduce((acc, state) => (ORDER[state] < ORDER[acc] ? state : acc), 'sim');
const criterion = (id, texto, estado, nota = '', provas = []) => ({ id, texto, estado, nota: cleanText(nota, 400), provas: [...new Set(provas.filter(Boolean))] });
const unique = (values) => [...new Set(values.filter(Boolean))];
const idsOf = (items) => unique(items.flatMap((item) => item.ids || [item.id]));

export function euro(value) {
  return `${new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 0 }).format(Math.round(value || 0))} €`;
}

export function shortDate(day) {
  return day ? String(day).slice(0, 10).split('-').reverse().join('/') : 's/d';
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const nameOf = (graph, id) => graph.nos[id]?.nome || id;
const officeLabel = (graph, office) => cleanText(office.detalhe || nameOf(graph, office.para), 140);
const sentence = (text) => { const value = String(text || '').trim(); return /[.!?…]$/.test(value) ? value : `${value}.`; };
const period = (item) => `${item.inicio ? shortDate(item.inicio) : '?'}–${item.fim ? shortDate(item.fim) : item.atual ? 'atual' : '?'}`;

function tiePeriod(item) {
  if (item.rel === 'co-mencao') return 'sem datas (fonte secundária)';
  const parts = [];
  if (item.inicio || item.fim) parts.push(period(item));
  if (item.declaradoDe) parts.push(`declarada em ${shortDate(item.declaradoDe)} e em ${shortDate(item.declaradoEm)}`);
  else if (item.declaradoEm) parts.push(`declarada em ${shortDate(item.declaradoEm)}`);
  if (item.fimAte) parts.push(`já não consta da declaração de ${shortDate(item.fimAte)}`);
  return parts.join(', ') || 'sem datas';
}

// ——— leitura do grafo ———

// Cargos públicos do titular numa linha de tempo: sem repetições entre declarações e fontes. As legislaturas só dão datas
// aproximadas; quando outra fonte tem as datas exatas do mandato de deputado, essas prevalecem.
export function officesOf(graph, holder) {
  const all = graph.afirmacoes.filter((item) => item.de === holder && item.rel === 'cargo-publico' && item.cargo?.publico);
  const dated = new Set(all.filter((item) => !item.semData).map((item) => item.para));
  const merged = mergeTimeline(all.filter((item) => !item.semData || !dated.has(item.para)), declarationDaysOf(graph, holder));
  const precise = merged.filter((office) => office.cargo.ambito === 'parlamento' && !office.aproximado && office.inicio);
  const used = new Set();
  const out = [];
  for (const office of merged) {
    if (office.cargo.ambito !== 'parlamento' || !office.aproximado || !office.inicio) { out.push(office); continue; }
    const legEnd = office.fim ? dayEnd(office.fim) : '9999-12-31';
    const overlap = precise.filter((other) => dayStart(other.inicio) <= legEnd && (other.fim ? dayEnd(other.fim) : '9999-12-31') >= dayStart(office.inicio));
    if (!overlap.length) { out.push(office); continue; }
    for (const other of overlap) {
      used.add(other);
      const inicio = [dayStart(office.inicio), dayStart(other.inicio)].sort().at(-1);
      const fim = [legEnd, other.fim ? dayEnd(other.fim) : other.atual ? '9999-12-31' : legEnd].sort()[0];
      out.push({ ...office, ids: unique([...(office.ids || [office.id]), ...(other.ids || [other.id])]), fontes: [...(office.fontes || [office.fonte]), ...(other.fontes || [other.fonte])],
        inicio, fim: fim === '9999-12-31' ? '' : fim, atual: fim === '9999-12-31' && Boolean(other.atual), aproximado: false });
    }
  }
  return out.filter((office) => !used.has(office)).sort((a, b) => dayStart(b.inicio).localeCompare(dayStart(a.inicio)));
}

const TIES = new Set(['cargo-privado', 'participacao', 'servico', 'apoio', 'co-mencao', 'manual', 'grupo', 'familia']);

export function tiesBetween(graph, holder, org) {
  return graph.afirmacoes.filter((item) => TIES.has(item.rel)
    && ((item.de === holder && item.para === org) || (item.de === org && item.para === holder)));
}

// Ligações já consolidadas: a mesma participação declarada em 2013 e 2018 é um só vínculo, contínuo entre as duas datas.
function mergedTies(graph, holder, org) {
  return mergeTimeline(tiesBetween(graph, holder, org), declarationDaysOf(graph, holder));
}

function holdersOf(graph) {
  const people = Object.values(graph.nos).filter((node) => node.tipo === 'person' && !node.privado);
  return people.filter((node) => node.id === SUBJECT || graph.afirmacoes.some((item) => item.de === node.id && item.rel === 'cargo-publico')).map((node) => node.id);
}

function linkedOrgs(graph, holder) {
  const ids = new Set();
  for (const item of graph.afirmacoes) {
    if (!TIES.has(item.rel)) continue;
    const other = item.de === holder ? item.para : item.para === holder ? item.de : '';
    if (other && graph.nos[other] && ['org', 'public-body'].includes(graph.nos[other].tipo) && other !== holder) ids.add(other);
    if (other === SUBJECT && graph.nos[SUBJECT].tipo === 'org') ids.add(SUBJECT);
  }
  return [...ids];
}

const official = (ties) => ties.filter((item) => item.fonte?.tipo === 'primaria');

function linkCriterion(ties) {
  const primary = official(ties);
  if (primary.length) return criterion('ligacao', 'Ligação registada numa fonte oficial', 'sim', primary[0].fonte.citacao || primary[0].fonte.nome, idsOf(primary));
  const manual = ties.filter((item) => item.fonte?.tipo === 'manual');
  const text = manual.length ? `Registada por ti: ${manual[0].fonte.nome}` : `Só em fonte secundária (pista por confirmar): ${ties[0]?.fonte?.nome || ''}`;
  return criterion('ligacao', 'Ligação registada numa fonte oficial', 'talvez', text, idsOf(ties));
}

function identityConfirmed(graph, org) {
  return graph.identidades.some((item) => item.no === org) || (org === SUBJECT && /^\d{9}$/.test(graph.nos[SUBJECT].ids?.nif || ''));
}

// A ligação estava em vigor neste dia? As ligações chegam consolidadas (mergeTimeline): declarações sucessivas presumem continuidade.
function tieStateOn(ties, day, offices = []) {
  if (!ties.length) return { estado: 'nao', artigo8: false };
  let estado = best(ties.map((item) => (item.rel === 'co-mencao' ? 'talvez' : activeOn(item, day))));
  let artigo8 = false;
  if (estado === 'nao') {
    // Art. 8.º: ligações terminadas nos 3 anos anteriores à posse continuam a impedir o titular de intervir.
    artigo8 = ties.some((item) => (item.fim || item.fimAte) && offices.some((office) => office.inicio && activeOn(office, day) !== 'nao'
      && yearsBetween(dayEnd(item.fim || item.fimAte), office.inicio) >= 0 && yearsBetween(dayEnd(item.fim || item.fimAte), office.inicio) <= 3));
    if (artigo8) estado = 'talvez';
  }
  return { estado, artigo8 };
}

function tieDescription(graph, ties) {
  const item = official(ties)[0] || ties[0];
  if (!item) return 'ligação';
  if (item.rel === 'participacao') return item.percentagem != null ? `participação de ${item.percentagem}%` : 'participação social';
  if (item.rel === 'cargo-privado') return `funções de ${cleanText(item.detalhe || 'função', 80).toLowerCase()}`;
  if (item.rel === 'co-mencao') return 'menção conjunta numa fonte secundária';
  return RELATIONS[item.rel] || 'ligação';
}

const MANAGEMENT = /administra|gerente|ger[eê]ncia|gest[aã]o|diretor|director|\bceo\b|presidente executiv|conselho de administra|administrador/i;
const GOVERNANCE = /assembleia geral|conselho fiscal|fiscal [uú]nico|conselho consultivo|conselho geral/i;

function tieTypeCriterion(graph, ties, org) {
  const lawFirm = /advogad|solicitador|revisor|contabilist|sociedade de profissionais/i.test(graph.nos[org]?.nomes?.join(' ') || '');
  const notes = [];
  let estado = 'talvez';
  for (const item of ties) {
    if (item.rel === 'participacao') {
      if (item.percentagem > 10) { estado = 'sim'; notes.push(`Participação de ${item.percentagem}% (acima de 10%)`); }
      else if (item.percentagem != null) { estado = best([estado, 'talvez']); notes.push(`Participação de ${item.percentagem}%: abaixo de 10%, conta o valor (50 000 €) e o n.º 10`); }
      else notes.push('Participação sem percentagem declarada');
    } else if (item.rel === 'cargo-privado') {
      if (MANAGEMENT.test(item.detalhe || '')) { estado = 'sim'; notes.push(`Função de gestão: ${item.detalhe}`); }
      else if (GOVERNANCE.test(item.detalhe || '')) notes.push(`${item.detalhe}: em regra não é função de gestão`);
      else notes.push(`Função: ${item.detalhe || 'não especificada'}`);
    } else if (item.rel === 'co-mencao') notes.push(item.familia ? 'Fonte secundária refere ligação familiar (n.º 3 e 4)' : 'Natureza da ligação por apurar');
    else notes.push(`${RELATIONS[item.rel] || item.rel}: não está no n.º 2, ver art. 8.º e CPA`);
  }
  if (lawFirm) notes.push('Sociedade de profissionais: o n.º 11 estende-lhe o artigo');
  return criterion('tipo', 'Tipo de ligação abrangido pelo artigo 9.º (gestão ou mais de 10%)', estado, unique(notes).join('; '), idsOf(ties));
}

function buyerOf(graph, id) {
  const node = graph.nos[/^\d{9}$/.test(id) ? `nif:${id}` : `org:${String(id).replace(/^n:/, '')}`];
  const nome = node?.nome || id;
  return { id, nome, esfera: node?.esfera || classifyBuyer(nome) };
}

function sphereState(cargo, buyer) {
  if (cargo.nacional) return 'na';
  const same = (a, b) => a && b && normalizeName(a) === normalizeName(b);
  if (cargo.ambito === 'autarquia-executivo' || cargo.ambito === 'autarquia-deliberativo') {
    if (!cargo.municipio) return 'talvez';
    if (buyer.esfera.esfera === 'municipal') return same(buyer.esfera.municipio, cargo.municipio) ? 'sim' : 'nao';
    return ['freguesia', 'local'].includes(buyer.esfera.esfera) ? 'talvez' : 'nao';
  }
  if (cargo.ambito === 'regional') return buyer.esfera.esfera === 'regional' ? 'sim' : 'nao';
  return 'talvez';
}

function lastDeclaration(graph, holder) {
  return graph.afirmacoes.filter((item) => item.de === holder && item.declaradoEm && /registo de interesses/i.test(item.fonte?.nome || ''))
    .map((item) => item.declaradoEm).sort().at(-1) || '';
}

function declarationGap(graph, holder, hoje) {
  const last = lastDeclaration(graph, holder);
  const later = officesOf(graph, holder).some((office) => office.cargo.lei52 !== 'nao'
    && (office.atual || dayEnd(office.fim) > (last || '0') || dayStart(office.inicio) > (last || '0')) && dayStart(office.inicio) <= hoje);
  if (!later) return null;
  return {
    texto: last ? `As declarações nos dados abertos do Parlamento terminam em ${shortDate(last)}. A declaração única atual está na Entidade para a Transparência.`
      : 'Sem declarações nos dados abertos do Parlamento para este titular. Consulta a declaração única na Entidade para a Transparência.',
    fonte: MANUAL_SOURCES.transparencia,
  };
}

function actsOf(graph, org) {
  return graph.afirmacoes.filter((item) => item.rel === 'ato' && item.para === org && !item.classe?.societario && !item.classe?.outro);
}

function asked(graph, id) {
  return graph.consultas.some((item) => item.pergunta === id);
}

// ——— padrões ———

function patternP1(graph, holder) {
  const signals = [];
  const offices = officesOf(graph, holder).filter((office) => office.inicio
    && (office.cargo.exclusividade === true || (office.cargo.exclusividade === null && office.cargo.ambito === 'autarquia-executivo')));
  const seen = new Set();
  const privateRoles = mergeTimeline(graph.afirmacoes.filter((item) => item.de === holder && ['cargo-privado', 'atividade', 'servico'].includes(item.rel)), declarationDaysOf(graph, holder));
  for (const office of offices) {
    if (seen.has(office.para)) continue;
    seen.add(office.para);
    const start = dayStart(office.inicio);
    const items = privateRoles.map((role) => {
      const day = [start, dayStart(role.inicio)].filter(Boolean).sort().at(-1);
      return { role, estado: both(activeOn(office, day), activeOn(role, day)) };
    }).filter((entry) => entry.estado !== 'nao');
    if (!items.length) continue;
    const label = officeLabel(graph, office);
    const nature = items.map(({ role }) => {
      const forProfit = /\b(?:s\.?\s?a\.?|lda\.?|limitada|sgps|unipessoal)\b/i.test(nameOf(graph, role.para));
      if (role.rel === 'cargo-privado' && (MANAGEMENT.test(role.detalhe || '') || GOVERNANCE.test(role.detalhe || ''))) return forProfit ? 'sim' : 'talvez';
      if (role.rel === 'atividade') return /docen|professor|confer[eê]ncia|palestra|autor|liter[aá]ri|art[ií]stic/i.test(role.detalhe || '') ? 'nao' : 'talvez';
      return 'talvez';
    });
    const describe = ({ role }) => `${cleanText(role.detalhe || RELATIONS[role.rel], 80)}${role.para ? ` — ${nameOf(graph, role.para)}` : ''} (desde ${role.inicio ? shortDate(role.inicio) : '?'}; declarado em ${shortDate(role.declaradoEm)})`;
    const criterios = [
      criterion('exclusividade', 'Cargo exercido em regime de exclusividade', office.cargo.exclusividade ? 'sim' : 'talvez',
        office.cargo.exclusividade ? `${label}: regime de exclusividade (art. 6.º)` : `${label}: depende do regime de permanência (art. 7.º)`, idsOf([office])),
      criterion('sobreposicao', 'A função privada continuava depois da posse', best(items.map((entry) => entry.estado)),
        items.map(describe).join('; '), idsOf(items.map((entry) => entry.role))),
      criterion('natureza', 'Função profissional ou em corpos sociais de entidade com fins lucrativos', best(nature),
        'O n.º 2 exclui docência no ensino superior, conferências, criação artística e funções por inerência', items.map((entry) => entry.role.id)),
    ];
    signals.push({
      id: `P1:${holder}:${office.para}`, padrao: 'P1', sujeito: holder, entidade: office.para,
      pergunta: `${nameOf(graph, holder)} manteve ${plural(items.length, 'função privada', 'funções privadas')} depois de assumir o cargo de ${label}?`,
      resumo: `${label} desde ${shortDate(office.inicio)}. Funções declaradas antes, sem data de fim: ${items.map(describe).join('; ')}.`,
      criterios,
      itens: items.map((entry) => ({ texto: describe(entry), estado: entry.estado, prova: entry.role.id, data: entry.role.inicio || '' })),
      alternativas: [
        'A função pode ter terminado antes da posse sem que isso conste dos dados abertos (renúncia, suspensão).',
        'Funções por inerência ou expressamente admitidas por lei são exceções (art. 6.º, n.º 2).',
        ...(items.some(({ role }) => /advoga/i.test(role.detalhe || '')) ? ['A inscrição como advogado pode estar suspensa durante o cargo.'] : []),
      ],
      lacunas: [
        { texto: 'Declaração única entregue no início do cargo, onde as funções cessadas devem constar.', fonte: MANUAL_SOURCES.transparencia },
        { texto: 'Renúncia aos órgãos sociais publicada nos atos societários.', fonte: MANUAL_SOURCES.atosSocietarios },
      ],
      lei: [LEGAL.exclusividade, ...(office.cargo.ambito.startsWith('autarquia') ? [LEGAL.autarcas] : []), LEGAL.declaracao],
      relevancia: { atual: Boolean(office.atual) },
    });
  }
  return signals;
}

function patternP2(graph, holder, org, ties, hoje) {
  const rows = graph.contratos[org] || [];
  if (!rows.length) return null;
  const allOffices = officesOf(graph, holder);
  const offices = allOffices.filter((office) => office.cargo.lei52 !== 'nao');
  const evaluated = rows.map((row) => {
    const active = offices.map((office) => ({ office, estado: both(activeOn(office, row.data), office.cargo.lei52) })).filter((entry) => entry.estado !== 'nao');
    const tie = tieStateOn(ties, row.data, offices);
    const buyer = buyerOf(graph, row.adjudicantes[0]);
    return { row, buyer, active, office: best(active.map((entry) => entry.estado)), tie };
  });
  const relevant = evaluated.filter((entry) => entry.office !== 'nao' && entry.tie.estado !== 'nao');
  if (!relevant.length) return null;
  const national = relevant.some((entry) => entry.active.some(({ office }) => office.cargo.nacional));
  const spheres = relevant.flatMap((entry) => entry.active.map(({ office }) => sphereState(office.cargo, entry.buyer))).filter((state) => state !== 'na');
  const direct = relevant.filter((entry) => DIRECT_AWARD.has(entry.row.procedimento));
  const value = relevant.reduce((sum, entry) => sum + entry.row.valor, 0);
  const modern = relevant.filter((entry) => entry.row.data >= LAW_52_START).length;
  const approximate = relevant.some((entry) => entry.active.some(({ office }) => office.aproximado));
  const artigo8 = relevant.some((entry) => entry.tie.artigo8);
  const confirmed = identityConfirmed(graph, org);
  const tieText = tieDescription(graph, ties);
  const omitted = graph.nos[org]?.contratosResumo?.omitidos || 0;
  const perOffice = new Map();
  // Cada contrato conta uma vez, no cargo mais forte (âmbito nacional e datas exatas primeiro).
  const strongest = (entry) => [...entry.active].sort((a, b) => ORDER[b.estado] - ORDER[a.estado]
    || Number(Boolean(b.office.cargo.nacional)) - Number(Boolean(a.office.cargo.nacional)) || Number(Boolean(a.office.aproximado)) - Number(Boolean(b.office.aproximado)))[0].office;
  for (const entry of relevant) {
    const label = officeLabel(graph, strongest(entry));
    const group = perOffice.get(label) || { n: 0, valor: 0 };
    group.n += 1;
    group.valor += entry.row.valor;
    perOffice.set(label, group);
  }
  const duringText = [...perOffice].map(([label, group]) => `${plural(group.n, 'contrato', 'contratos')} (${euro(group.valor)}) durante ${label}`).join('; ');
  const criterios = [
    linkCriterion(ties),
    criterion('identidade', 'A entidade dos contratos é a mesma (NIF confirmado por ti)', confirmed ? 'sim' : 'talvez',
      confirmed ? `NIF ${graph.nos[org].ids?.nif || ''}` : 'Confirma o NIF antes de tirar conclusões'),
    criterion('durante', 'Contratos celebrados enquanto exercia cargo abrangido', best(relevant.map((entry) => entry.office)),
      `${duringText}${relevant.length < rows.length ? ` — ${rows.length - relevant.length} fora destes períodos` : ''}${approximate ? ' (datas de legislatura aproximadas)' : ''}`,
      idsOf(relevant.flatMap((entry) => entry.active.map(({ office }) => office)))),
    criterion('vigente', 'A ligação existia à data dos contratos', best(relevant.map((entry) => entry.tie.estado)),
      artigo8 ? 'Ligação terminada nos 3 anos anteriores à posse: o art. 8.º impede o titular de intervir' : `Ligação: ${ties.map(tiePeriod).join('; ')}`,
      idsOf(ties)),
    tieTypeCriterion(graph, ties, org),
    national
      ? criterion('esfera', 'Adjudicante na esfera do cargo', 'na', 'Para cargos de âmbito nacional o n.º 2 abrange qualquer procedimento de contratação pública')
      : criterion('esfera', 'Adjudicante na esfera do cargo', spheres.length ? best(spheres) : 'talvez', unique(relevant.map((entry) => entry.buyer.nome)).join('; ')),
    criterion('concorrencia', 'Sem concorrência (ajuste direto)', direct.length ? 'sim' : 'nao',
      direct.length ? `${plural(direct.length, 'ajuste direto', 'ajustes diretos')} (${euro(direct.reduce((sum, entry) => sum + entry.row.valor, 0))})` : 'Procedimentos com concorrência'),
    criterion('regime', 'Lei 52/2019 já em vigor (desde 25/10/2019)', modern === relevant.length ? 'sim' : 'talvez',
      modern === relevant.length ? '' : `${modern ? `${relevant.length - modern} de ${relevant.length} contratos` : 'Os contratos são'} anteriores a 25/10/2019: aplicava-se a Lei n.º 64/93 (revogada, fora do corpus local), com impedimentos semelhantes — confirma o regime da época`),
  ];
  const items = relevant.map((entry) => ({
    id: entry.row.id, data: entry.row.data, valor: entry.row.valor, procedimento: entry.row.procedimentoNome, adjudicante: entry.buyer.nome,
    objeto: cleanText(entry.row.objeto, 160), url: entry.row.url, cargo: entry.active.map(({ office }) => officeLabel(graph, office)).join('; '),
    estado: both(entry.office, entry.tie.estado),
  })).sort((a, b) => (ORDER[b.estado] - ORDER[a.estado]) || b.data.localeCompare(a.data));
  const days = items.map((item) => item.data).sort();
  const fornece = graph.afirmacoes.filter((item) => item.rel === 'fornece' && item.de === org).map((item) => item.id);
  const gap = declarationGap(graph, holder, hoje);
  return {
    id: `P2:${holder}:${org}`, padrao: 'P2', sujeito: holder, entidade: org,
    pergunta: `${nameOf(graph, org)} podia contratar com o Estado enquanto ${nameOf(graph, holder)} tinha ${tieText} e exercia cargo público?`,
    resumo: `${plural(relevant.length, 'contrato', 'contratos')} (${euro(value)}) entre ${shortDate(days[0])} e ${shortDate(days.at(-1))}, ${plural(direct.length, 'por ajuste direto', 'por ajuste direto')}, com ${unique(items.map((item) => item.adjudicante)).slice(0, 3).join(', ')}.`,
    criterios, itens: items, provas: unique([...idsOf(ties), ...fornece]),
    alternativas: [
      ...(ties.some((item) => item.rel === 'participacao') ? ['A participação pode ter sido suspensa, liquidada ou alienada antes dos contratos (art. 9.º, n.º 7 e 8).'] : []),
      ...(ties.some((item) => GOVERNANCE.test(item.detalhe || '')) ? ['Presidir à mesa da assembleia geral não é, em regra, função de gestão: o n.º 2 pode não se aplicar.'] : []),
      ...(confirmed ? [] : ['Pode ser outra entidade com denominação semelhante.']),
      ...(approximate ? ['As datas de mandato de deputado são aproximadas: o mandato pode ter terminado antes da legislatura.'] : []),
      'A pergunta é se a entidade podia concorrer; não implica que o titular tenha intervindo no contrato.',
    ],
    lacunas: [
      { texto: 'Órgãos sociais e capital da entidade à data de cada contrato.', fonte: MANUAL_SOURCES.atosSocietarios },
      { texto: 'Peças dos procedimentos: convites, propostas e declarações sobre impedimentos.', modelo: 'lada' },
      ...(gap ? [gap] : []),
      ...(omitted ? [{ texto: `${plural(omitted, 'contrato não listado', 'contratos não listados')} individualmente nos dados; contagens por ano no perfil.` }] : []),
    ],
    lei: [LEGAL.impedimentos, LEGAL.anteriores, ...(relevant.some((entry) => entry.active.some(({ office }) => office.cargo.ambito === 'parlamento')) ? [LEGAL.deputados] : []),
      LEGAL.cpaImpedimento, ...(modern < relevant.length ? [LEGAL.vigencia] : [])],
    relevancia: { atual: relevant.some((entry) => entry.active.some(({ office }) => office.atual)), valor: value,
      ultimo: relevant.map((entry) => entry.row.data).sort().at(-1) },
  };
}

const PATRIMONIAL = new Set(['concessão', 'licença ou autorização', 'apoio financeiro', 'benefício fiscal', 'contrato ou aditamento', 'expropriação', 'prorrogação']);

function issuerState(cargo, act, emissor) {
  if (cargo.ambito === 'governo') {
    if (!act.classe?.governo) return 'nao';
    if (cargo.chefe) return /primeiro-ministro|presid[eê]ncia do conselho de ministros|conselho de ministros/i.test(emissor) ? 'sim' : 'talvez';
    return 'talvez';
  }
  if (cargo.ambito === 'autarquia-executivo') return act.classe?.municipio && cargo.municipio && normalizeName(act.classe.municipio) === normalizeName(cargo.municipio) ? 'sim' : 'nao';
  if (cargo.ambito === 'regional') return /regional|regi[aã]o aut[oó]noma/i.test(emissor) ? 'talvez' : 'nao';
  if (cargo.ambito === 'alto-cargo') return 'talvez';
  return 'nao';
}

function patternP3(graph, holder, org, ties) {
  const acts = actsOf(graph, org).filter((act) => act.data);
  if (!acts.length) return null;
  const offices = officesOf(graph, holder).filter((office) => office.cargo.executivo);
  if (!offices.length) return null;
  const evaluated = acts.map((act) => {
    const node = graph.nos[act.de] || {};
    const per = offices.map((office) => ({ office, estado: activeOn(office, act.data), emissor: issuerState(office.cargo, act, node.emissor || '') }))
      .filter((entry) => entry.estado !== 'nao');
    const decisao = act.classe?.decisao || '';
    const tie = tieStateOn(ties, act.data, offices);
    const scoreOf = (entry) => ORDER[entry.estado] + ORDER[entry.emissor] + (PATRIMONIAL.has(decisao) ? 3 : 0) + (act.ligacao === 'nome' ? 2 : 1) + ORDER[tie.estado];
    const top = per.sort((a, b) => scoreOf(b) - scoreOf(a))[0];
    return top ? { act, node, top, decisao, tie, score: scoreOf(top) } : null;
  }).filter((entry) => entry && !(entry.top.emissor === 'nao' && !PATRIMONIAL.has(entry.decisao)))
    .sort((a, b) => b.score - a.score || String(b.act.data).localeCompare(String(a.act.data)));
  if (!evaluated.length) return null;
  const lead = evaluated[0];
  const label = officeLabel(graph, lead.top.office);
  const criterios = [
    linkCriterion(ties),
    criterion('durante', 'Ato publicado enquanto exercia cargo executivo', lead.top.estado, `${label} (${period(lead.top.office)}); ato de ${shortDate(lead.act.data)}`, idsOf([lead.top.office])),
    criterion('emissor', 'Emitido por órgão na esfera do cargo', lead.top.emissor,
      lead.top.emissor === 'talvez' && lead.top.office.cargo.chefe ? `${lead.node.emissor}: outro membro do Governo` : lead.node.emissor || ''),
    criterion('decisao', 'Decisão com efeito patrimonial (concessão, licença, contrato, apoio)', PATRIMONIAL.has(lead.decisao) ? 'sim' : 'talvez', lead.decisao || 'Tipo de decisão por apurar'),
    criterion('destinatario', 'O ato nomeia a entidade', lead.act.ligacao === 'nome' ? 'sim' : 'talvez',
      lead.act.ligacao === 'nome' ? '' : `Encontrado ao seguir o objeto («${lead.act.consulta}»): confirma se a entidade é concorrente ou destinatária`),
    criterion('vigente', 'A ligação existia à data do ato (ou nos 3 anos antes da posse)', lead.tie.estado,
      lead.tie.artigo8 ? 'Ligação terminada nos 3 anos anteriores à posse (art. 8.º)' : `Ligação: ${ties.map(tiePeriod).join('; ')}`, idsOf(ties)),
  ];
  return {
    id: `P3:${holder}:${org}`, padrao: 'P3', sujeito: holder, entidade: org,
    pergunta: `O Estado decidiu sobre ${nameOf(graph, org)}${lead.decisao ? ` (${lead.decisao})` : ''} enquanto ${nameOf(graph, holder)} era ${label}?`,
    resumo: `${plural(evaluated.length, 'ato', 'atos')} no Diário da República durante cargos executivos. O mais relevante: ${lead.node.nome} de ${shortDate(lead.act.data)} — ${sentence(lead.act.detalhe)}`,
    criterios,
    itens: evaluated.slice(0, 8).map((entry) => ({ id: entry.act.de, texto: `${entry.node.nome} — ${entry.act.detalhe}`, data: entry.act.data, emissor: entry.node.emissor,
      url: entry.node.url, ligacao: entry.act.ligacao, estado: both(entry.top.estado, entry.tie.estado) })),
    provas: unique([...idsOf(ties), ...evaluated.map((entry) => entry.act.id)]),
    alternativas: [
      'O titular pode não ter intervindo ou ter pedido escusa (CPA, art. 73.º).',
      ...(lead.top.office.cargo.chefe ? ['Atos de outro membro do Governo não implicam intervenção pessoal do Primeiro-Ministro.'] : []),
      ...(lead.act.ligacao === 'objeto' ? ['O ato pode dizer respeito a outra entidade do mesmo setor.'] : []),
      'A ligação pode ter terminado mais de 3 anos antes da posse (art. 8.º).',
    ],
    lacunas: [
      { texto: 'Concorrentes e decisão final do procedimento.' },
      { texto: 'Declarações de impedimento ou escusa, atas e informações de suporte.', modelo: 'lada' },
    ],
    lei: [LEGAL.anteriores, LEGAL.cpaImpedimento, LEGAL.cpaSuspeicao],
    relevancia: { atual: Boolean(lead.top.office.atual), patrimonial: PATRIMONIAL.has(lead.decisao), ultimo: lead.act.data },
  };
}

function patternP4(graph, holder) {
  const signals = [];
  const offices = officesOf(graph, holder).filter((office) => office.cargo.executivo && office.fim);
  const roles = graph.afirmacoes.filter((item) => item.de === holder && ['cargo-privado', 'servico'].includes(item.rel) && item.inicio);
  for (const office of offices) {
    for (const role of roles) {
      const years = yearsBetween(dayEnd(office.fim), role.inicio);
      if (years < 0 || years > 3) continue;
      const before = graph.afirmacoes.some((item) => item.de === holder && item.para === role.para && item.id !== role.id
        && item.inicio && dayStart(item.inicio) < dayStart(office.inicio));
      const during = actsOf(graph, role.para).some((act) => activeOn(office, act.data) !== 'nao' && issuerState(office.cargo, act, graph.nos[act.de]?.emissor || '') !== 'nao')
        || (graph.contratos[role.para] || []).some((row) => activeOn(office, row.data) !== 'nao' && sphereState(office.cargo, buyerOf(graph, row.adjudicantes[0])) !== 'nao');
      const label = officeLabel(graph, office);
      signals.push({
        id: `P4:${holder}:${office.para}:${role.para}`, padrao: 'P4', sujeito: holder, entidade: role.para,
        pergunta: `${nameOf(graph, holder)} passou para ${nameOf(graph, role.para)} pouco depois de deixar o cargo de ${label}?`,
        resumo: `${label} até ${shortDate(office.fim)}; ${cleanText(role.detalhe, 80)} em ${nameOf(graph, role.para)} desde ${shortDate(role.inicio)} (${years.toFixed(1).replace('.', ',')} anos depois).`,
        criterios: [
          criterion('executivo', 'Cargo político de natureza executiva', 'sim', label, [office.id]),
          criterion('prazo', 'Nova função nos 3 anos seguintes', 'sim', `${years.toFixed(1).replace('.', ',')} anos`, [role.id]),
          criterion('regresso', 'Não é regresso à entidade de antes do cargo (n.º 2)', before ? 'nao' : 'talvez', before ? 'Já tinha ligação antes do cargo' : 'Confirma o percurso anterior'),
          criterion('setor', 'Entidade abrangida por decisões ou contratos do cargo', during ? 'sim' : 'talvez', during ? 'Há atos ou contratos na esfera do cargo durante o mandato' : 'Procura apoios, privatizações ou intervenção direta'),
        ],
        itens: [], provas: [office.id, role.id],
        alternativas: ['A empresa pode não atuar no setor que o titular tutelava.', 'Regresso à empresa ou atividade anterior é exceção (art. 10.º, n.º 2).'],
        lacunas: [{ texto: 'Apoios, incentivos ou privatizações que envolveram a entidade durante o mandato.' }],
        lei: [LEGAL.cessacao],
      });
    }
  }
  return signals;
}

function moneyState(graph, holder, org) {
  const offices = officesOf(graph, holder).filter((office) => office.cargo.lei52 !== 'nao');
  const rows = graph.contratos[org] || [];
  const acts = actsOf(graph, org).filter((act) => act.data);
  const hit = rows.some((row) => offices.some((office) => activeOn(office, row.data) !== 'nao'))
    || acts.some((act) => offices.some((office) => office.cargo.executivo && activeOn(office, act.data) !== 'nao'));
  if (hit) return { estado: 'sim', nota: `${plural(rows.length, 'contrato', 'contratos')} e ${plural(acts.length, 'ato', 'atos')} encontrados, alguns durante o cargo` };
  if (rows.length || acts.length) return { estado: 'nao', nota: 'Contratos ou atos encontrados, mas fora dos períodos de cargo' };
  const noContracts = asked(graph, `contratos:${org}`);
  const noActs = asked(graph, `atos:${org}`);
  if (noContracts && noActs) return { estado: 'nao', nota: 'Sem contratos no Portal BASE nem atos no Diário da República' };
  if (noContracts) return { estado: 'talvez', nota: 'Sem contratos no Portal BASE; falta procurar decisões no Diário da República' };
  if (noActs) return { estado: 'talvez', nota: 'Sem atos no Diário da República; falta procurar contratos no Portal BASE' };
  return { estado: 'talvez', nota: 'Ainda não verificado: pergunta se recebeu dinheiro público ou decisões do Estado' };
}

function patternP5(graph, holder, org, ties, hoje) {
  if (holder !== SUBJECT || ties.some((item) => item.rel !== 'co-mencao')) return null;
  const mention = ties[0];
  const last = lastDeclaration(graph, holder);
  const gap = declarationGap(graph, holder, hoje);
  const money = moneyState(graph, holder, org);
  return {
    id: `P5:${holder}:${org}`, padrao: 'P5', sujeito: holder, entidade: org,
    pergunta: `Que relação tem ${nameOf(graph, holder)} com ${nameOf(graph, org)}? Surge em fontes públicas mas não nas declarações disponíveis.`,
    resumo: `«${mention.fonte?.citacao || ''}» — ${mention.fonte?.nome || 'fonte secundária'}.`,
    criterios: [
      criterion('mencao', 'Mencionada com o titular numa fonte pública', 'sim', `${plural(mention.mencoes || 1, 'menção', 'menções')} em ${mention.fonte?.nome || 'fonte secundária'}`, [mention.id]),
      criterion('ausente', 'Não aparece nas declarações oficiais disponíveis', last ? 'sim' : 'talvez', last ? `Última declaração nos dados abertos: ${shortDate(last)}` : 'Sem declarações nos dados abertos'),
      criterion('cobertura', 'As declarações disponíveis cobrem o período atual', gap ? 'nao' : 'sim', gap ? gap.texto : ''),
      criterion('familia', 'A fonte refere ligação familiar', ties.some((item) => item.familia) ? 'sim' : 'nao', ties.some((item) => item.familia) ? 'Por confirmar em fonte oficial' : ''),
      criterion('dinheiro', 'Contratos ou decisões do Estado durante o cargo', money.estado, money.nota),
    ],
    itens: [], provas: ties.map((item) => item.id),
    alternativas: ['A fonte secundária pode estar errada ou desatualizada.', 'A ligação pode ser posterior à última declaração disponível ou não ser declarável.'],
    lacunas: [gap || { texto: 'Declaração única atual do titular.', fonte: MANUAL_SOURCES.transparencia }, { texto: 'Sócios e gerência da entidade.', fonte: MANUAL_SOURCES.atosSocietarios }],
    lei: [LEGAL.declaracao],
  };
}

function clientsOf(graph, org) {
  const groups = new Map();
  for (const item of graph.afirmacoes.filter((entry) => entry.rel === 'cliente' && entry.para === org && entry.de !== org)) {
    if (!groups.has(item.de)) groups.set(item.de, []);
    groups.get(item.de).push(item);
  }
  return [...groups.entries()].map(([payer, items]) => ({ payer, items, inicio: items.map((item) => item.inicio).filter(Boolean).sort()[0] || '' }));
}

function patternP6(graph, holder, org, ties) {
  const mention = ties.find((item) => item.familia || item.rel === 'familia');
  if (!mention) return null;
  const spouse = graph.afirmacoes.find((item) => item.de === holder && item.rel === 'conjuge' && item.fonte?.tipo === 'primaria');
  const money = moneyState(graph, holder, org);
  const clients = clientsOf(graph, org);
  const clientText = clients.map((entry) => `${displayName(nameOf(graph, entry.payer))}${entry.inicio ? ` (desde ${entry.inicio})` : ''}`).join(', ');
  return {
    id: `P6:${holder}:${org}`, padrao: 'P6', sujeito: holder, entidade: org,
    pergunta: `${displayName(nameOf(graph, org))} é uma entidade da família de ${nameOf(graph, holder)}? Quem lhe paga e o que recebeu do Estado durante o cargo?`,
    resumo: `«${mention.fonte?.citacao || ''}» — ${mention.fonte?.nome || ''}.${clients.length ? ` Pagamentos noticiados de: ${clientText}.` : ''}`,
    criterios: [
      spouse ? criterion('conjuge', 'Cônjuge identificado em declaração oficial', 'sim', `Declaração de ${shortDate(spouse.declaradoEm)}`, [spouse.id])
        : criterion('conjuge', 'Cônjuge identificado em declaração oficial', 'talvez', 'Sem cônjuge nas declarações disponíveis'),
      criterion('familia', 'Fonte liga a entidade à família', mention.fonte?.tipo === 'primaria' ? 'sim' : 'talvez', mention.fonte?.tipo === 'primaria' ? '' : 'Fonte secundária: confirmar sócios e gerência', idsOf([mention])),
      ...(clients.length ? [criterion('clientes', 'Quem paga à entidade é conhecido', clients.some((entry) => entry.items.some((item) => item.fonte?.tipo === 'primaria')) ? 'sim' : 'talvez',
        `${clientText} — confirma se dependem de decisões do Estado`, idsOf(clients.flatMap((entry) => entry.items)))] : []),
      criterion('dinheiro', 'Contratos ou decisões do Estado durante o cargo', money.estado, money.nota),
      criterion('participacao', 'Família com mais de 10% ou mais de 50 000 € (art. 9.º, n.º 3)', 'talvez', 'Só a certidão ou os atos societários o confirmam'),
    ],
    itens: [], provas: unique([spouse?.id, ...idsOf([mention]), ...idsOf(clients.flatMap((entry) => entry.items))]),
    alternativas: ['A entidade pode pertencer a outros familiares não abrangidos.', 'A participação familiar pode estar abaixo dos limites do n.º 3.'],
    lacunas: [{ texto: 'Sócios, gerência e capital da entidade.', fonte: MANUAL_SOURCES.atosSocietarios }, { texto: 'Declaração única atual do titular.', fonte: MANUAL_SOURCES.transparencia }],
    lei: [LEGAL.impedimentos, LEGAL.cpaImpedimento],
    relevancia: { atual: officesOf(graph, holder).some((office) => office.atual && office.cargo.executivo) },
  };
}

const governs = (cargo) => (cargo.ambito === 'governo' ? 'o Governo' : cargo.ambito === 'autarquia-executivo' ? 'a câmara' : cargo.ambito === 'regional' ? 'o governo regional' : 'o Estado');

// P8 — a cadeia que os dados soltos escondem: X paga à entidade ligada ao titular (ou ao próprio) e o Estado decide sobre X
// enquanto o titular exerce um cargo executivo. O CPA impede ou desaconselha intervir quando há interesse do titular ou da
// família (art. 69.º) ou relação de crédito com quem tem interesse direto (art. 73.º); a Lei 52/2019 manda declarar a quem
// foram prestados serviços (art. 13.º, n.º 3, b).
function patternP8(graph, holder) {
  const offices = officesOf(graph, holder).filter((office) => office.cargo.executivo);
  if (!offices.length) return [];
  const linked = new Set(linkedOrgs(graph, holder));
  const signals = [];
  for (const target of [holder, ...linked]) {
    for (const { payer, items: pays, inicio } of clientsOf(graph, target)) {
      if (payer === holder) continue;
      const pay = { ...pays[0], inicio, fim: '', atual: false, declaradoEm: '', ids: idsOf(pays) };
      const ties = target === holder ? [] : mergedTies(graph, holder, target);
      const familyTie = ties.find((item) => item.familia || item.rel === 'familia');
      const payerName = displayName(nameOf(graph, payer));
      const targetName = displayName(nameOf(graph, target));
      const targetLabel = target === holder ? nameOf(graph, holder) : `${targetName}${familyTie ? ` (empresa da família de ${nameOf(graph, holder)})` : ''}`;
      const acts = actsOf(graph, payer).filter((act) => act.data).map((act) => {
        const node = graph.nos[act.de] || {};
        const per = offices.map((office) => ({ office, estado: activeOn(office, act.data), emissor: issuerState(office.cargo, act, node.emissor || '') }))
          .filter((entry) => entry.estado !== 'nao');
        const decisao = act.classe?.decisao || '';
        const simultaneo = both(activeOn(pay, act.data), target === holder ? 'sim' : tieStateOn(ties, act.data, offices).estado);
        const scoreOf = (entry) => ORDER[entry.estado] + ORDER[entry.emissor] + (PATRIMONIAL.has(decisao) ? 3 : 0) + (act.ligacao === 'nome' ? 2 : 1) + ORDER[simultaneo];
        const top = per.sort((a, b) => scoreOf(b) - scoreOf(a))[0];
        return top ? { act, node, top, decisao, simultaneo, score: scoreOf(top) } : null;
      }).filter(Boolean).sort((a, b) => b.score - a.score || String(b.act.data).localeCompare(String(a.act.data)));
      const rows = (graph.contratos[payer] || []).map((row) => {
        const buyer = buyerOf(graph, row.adjudicantes[0]);
        const active = offices.map((office) => ({ office, estado: both(activeOn(office, row.data), office.cargo.nacional ? 'sim' : sphereState(office.cargo, buyer) === 'nao' ? 'nao' : 'talvez') }))
          .filter((entry) => entry.estado !== 'nao');
        return active.length ? { row, buyer, active, simultaneo: activeOn(pay, row.data) } : null;
      }).filter((entry) => entry && entry.simultaneo !== 'nao').sort((a, b) => b.row.data.localeCompare(a.row.data));
      const lead = acts[0];
      const checked = asked(graph, `atos:${payer}`);
      const linkState = target === holder ? 'sim' : official(ties).length ? 'sim' : 'talvez';
      const linkNote = target === holder ? 'Pagamentos ao próprio titular'
        : official(ties).length ? `Declarado: ${official(ties)[0].fonte.citacao || tieDescription(graph, official(ties))}`
          : familyTie ? `Fonte secundária refere empresa da família: «${cleanText(familyTie.fonte?.citacao, 200)}»` : `Só em fonte secundária: ${ties[0]?.fonte?.nome || ''}`;
      const primaryPay = pays.find((item) => item.fonte?.tipo === 'primaria') || pays[0];
      const inferred = pays.find((item) => item.inferido)?.inferido;
      const label = lead ? officeLabel(graph, lead.top.office) : officeLabel(graph, offices[0]);
      const who = governs((lead?.top.office || offices[0]).cargo);
      const criterios = [
        criterion('ligacao', 'A entidade paga está ligada ao titular', linkState, linkNote, target === holder ? idsOf(pays) : idsOf(ties)),
        criterion('pagamento', `${payerName} pagava a ${targetName}`, pays.some((item) => item.fonte?.tipo === 'primaria') ? 'sim' : 'talvez',
          `«${cleanText(primaryPay.fonte?.citacao, 220)}» — ${primaryPay.fonte?.nome || 'fonte'}${inicio ? ` (desde ${inicio})` : ''}${inferred ? `. ${inferred}` : ''}`, idsOf(pays)),
        lead
          ? criterion('durante', 'Decisão do Estado sobre quem paga, durante cargo executivo', lead.top.estado, `${label} (${period(lead.top.office)}); ${lead.node.nome} de ${shortDate(lead.act.data)}`, idsOf([lead.top.office]))
          : rows.length
            ? criterion('durante', 'Decisão do Estado sobre quem paga, durante cargo executivo', 'talvez',
              `${plural(rows.length, 'contrato público', 'contratos públicos')} (${euro(rows.reduce((sum, entry) => sum + entry.row.valor, 0))}) durante ${label}`, idsOf(rows[0].active.map(({ office }) => office)))
            : criterion('durante', 'Decisão do Estado sobre quem paga, durante cargo executivo', checked ? 'nao' : 'talvez',
              checked ? `Sem atos sobre ${payerName} encontrados durante o cargo` : `Ainda não verificado: procura concessões, licenças e contratos de ${payerName}`),
        criterion('simultaneo', 'Os pagamentos coincidiam com a decisão', lead ? lead.simultaneo : rows.length ? best(rows.map((entry) => entry.simultaneo)) : 'talvez',
          `Pagamentos noticiados${inicio ? ` desde ${inicio}` : ' sem data'}${lead ? `; decisão de ${shortDate(lead.act.data)}` : ''}. Não se sabe se continuavam`),
        criterion('emissor', 'Decidido na esfera do cargo do titular', lead ? lead.top.emissor : 'talvez',
          lead ? (lead.top.emissor === 'talvez' && lead.top.office.cargo.chefe ? `${lead.node.emissor}: outro membro do Governo, sob a direção do Primeiro-Ministro` : lead.node.emissor || '') : 'Por apurar'),
        criterion('decisao', 'Decisão com efeito patrimonial (concessão, licença, contrato, apoio)', lead ? (PATRIMONIAL.has(lead.decisao) ? 'sim' : 'talvez') : 'talvez',
          lead ? lead.decisao || 'Tipo de decisão por apurar' : 'Ainda não verificado'),
      ];
      const itens = [
        ...acts.slice(0, 6).map((entry) => ({ id: entry.act.de, texto: `${entry.node.nome} — ${entry.act.detalhe}`, data: entry.act.data, emissor: entry.node.emissor,
          url: entry.node.url, ligacao: entry.act.ligacao, estado: both(entry.top.estado, entry.simultaneo) })),
        ...rows.slice(0, 4).map((entry) => ({ id: entry.row.id, data: entry.row.data, valor: entry.row.valor, procedimento: entry.row.procedimentoNome, adjudicante: entry.buyer.nome,
          objeto: cleanText(entry.row.objeto, 160), url: entry.row.url, estado: both(best(entry.active.map(({ estado }) => estado)), entry.simultaneo) })),
      ];
      signals.push({
        id: `P8:${holder}:${payer}:${target}`, padrao: 'P8', sujeito: holder, entidade: payer, ligada: target,
        pergunta: lead
          ? `${payerName} pagava a ${targetLabel} enquanto ${who} decidia sobre ${payerName}?`
          : `${payerName} pagava a ${targetLabel}. O Estado decidiu sobre ${payerName} enquanto ${nameOf(graph, holder)} era ${label}?`,
        resumo: `${primaryPay.fonte?.nome || 'Fonte'}: «${cleanText(primaryPay.fonte?.citacao, 200)}».${lead ? ` ${lead.node.nome} (${shortDate(lead.act.data)}), ${lead.node.emissor || 'emissor por apurar'}: ${sentence(cleanText(lead.act.detalhe, 160))}` : rows.length ? ` ${plural(rows.length, 'contrato público', 'contratos públicos')} durante o cargo.` : ' Ainda sem decisões do Estado verificadas.'}`,
        criterios, itens,
        provas: unique([...idsOf(pays), ...idsOf(ties), ...acts.map((entry) => entry.act.id)]),
        cadeia: [
          { no: payer, nome: payerName, papel: 'paga' },
          { no: target, nome: targetName, papel: target === holder ? 'titular' : familyTie ? 'família' : 'ligada' },
          ...(target === holder ? [] : [{ no: holder, nome: nameOf(graph, holder), papel: 'titular' }]),
          ...(lead ? [{ no: lead.act.de, nome: lead.node.nome, papel: 'decisão', data: lead.act.data }] : []),
        ],
        alternativas: [
          'O titular pode não ter intervindo na decisão ou ter pedido escusa (CPA, art. 73.º).',
          ...(lead?.top.office.cargo.chefe && lead.top.emissor !== 'sim' ? ['A decisão é de outro membro do Governo: a intervenção pessoal do Primeiro-Ministro não está demonstrada.'] : []),
          'Os pagamentos podem ter terminado antes da decisão.',
          ...(pays.some((item) => item.fonte?.tipo !== 'primaria') ? ['A fonte secundária pode estar incompleta: confirma valores, datas e quem recebeu.'] : []),
          ...(inferred ? ['A notícia fala na «empresa familiar»: confirma que é esta a entidade paga.'] : []),
          ...(familyTie ? ['A empresa pode já não ser do titular, mas o CPA abrange também cônjuge e parentes (art. 69.º, n.º 1, b).'] : []),
        ],
        lacunas: [
          { texto: 'Lista de clientes na declaração única (art. 13.º, n.º 3, b): consta esta entidade?', fonte: MANUAL_SOURCES.transparencia },
          { texto: 'Despachos, atas e declarações de impedimento ou escusa no procedimento da decisão.', modelo: 'lada' },
          ...(familyTie ? [{ texto: 'Sócios e gerência da entidade paga à data dos pagamentos.', fonte: MANUAL_SOURCES.atosSocietarios }] : []),
          ...(lead ? [] : [{ texto: `Concessões, licenças, apoios e contratos do Estado com ${payerName}.` }]),
        ],
        lei: [LEGAL.cpaImpedimento, LEGAL.cpaSuspeicao, LEGAL.clientes],
        relevancia: {
          atual: Boolean((lead?.top.office || rows[0]?.active[0]?.office)?.atual),
          patrimonial: Boolean(lead && PATRIMONIAL.has(lead.decisao)),
          valor: rows.length ? rows.reduce((sum, entry) => sum + entry.row.valor, 0) : null,
          ultimo: lead?.act.data || rows[0]?.row.data || '',
        },
      });
    }
  }
  return signals;
}

// Limites do CCP para bens e serviços (art. 20.º, n.º 1, c e d) em vigor num dia: versão de 2008, revisão de 2018 e
// Decreto-Lei n.º 177/2026 (desde 1/10/2026). Antes de 2018 não havia consulta prévia.
export function ccpLimits(day) {
  if (day >= '2026-10-01') return { ad: 75000, cp: 130000 };
  if (day >= '2018-01-01') return { ad: 20000, cp: 75000 };
  return { ad: 75000, cp: 0 };
}

// Janela de três anos civis com mais ajustes diretos e consultas prévias (o CCP fala no ano económico em curso e nos dois anteriores).
export function directAwardWindow(anos = {}) {
  let top = null;
  const years = Object.keys(anos).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  for (const year of years) {
    let ad = 0; let cp = 0; let valorAD = 0; let valorCP = 0;
    for (let y = year - 2; y <= year; y += 1) {
      const entry = anos[y] || anos[String(y)];
      if (!entry) continue;
      ad += entry[2] || 0; cp += entry[4] || 0; valorAD += entry[3] || 0; valorCP += entry[5] || 0;
    }
    const n = ad + cp;
    const value = valorAD + valorCP;
    if (n >= 2 && (!top || n > top.n || (n === top.n && value > top.valor))) top = { de: year - 2, ate: year, n, ad, cp, valor: value, valorAD, valorCP };
  }
  return top;
}

// Quanto do limite do art. 113.º, n.º 2, a janela já ocupa (1 = atingido).
export function windowPressure(window) {
  const limits = ccpLimits(`${window.ate}-01-01`);
  const ratio = Math.max((window.valorAD ?? window.valor) / limits.ad, limits.cp ? window.valor / limits.cp : 0);
  return { ratio, limits };
}

function patternP7(graph, holder, org, ties) {
  const signals = [];
  for (const supply of graph.afirmacoes.filter((item) => item.rel === 'fornece' && item.de === org)) {
    const window = directAwardWindow(supply.anos);
    if (!window) continue;
    const { ratio, limits } = windowPressure(window);
    if (ratio < 0.5) continue;
    const buyer = nameOf(graph, supply.para);
    const buyerId = graph.nos[supply.para]?.ids?.nif || String(supply.para).replace(/^(?:nif|org):/, '');
    const rows = (graph.contratos[org] || []).filter((row) => row.adjudicantes.some((id) => id === buyerId || `n:${id}` === buyerId || id === `n:${buyerId}`)
      && (DIRECT_AWARD.has(row.procedimento) || PRIOR_CONSULTATION.has(row.procedimento))
      && Number(row.data.slice(0, 4)) >= window.de && Number(row.data.slice(0, 4)) <= window.ate);
    const link = org === SUBJECT ? criterion('ligacao', 'Ligação registada numa fonte oficial', 'na', 'A entidade é o alvo da investigação') : linkCriterion(ties);
    const valueNote = `${euro(window.valorAD ?? window.valor)} por ajuste direto (limite ${euro(limits.ad)})${limits.cp && window.cp ? `; ${euro(window.valor)} somando consultas prévias (limite ${euro(limits.cp)})` : ''}. Limites para bens e serviços em ${window.ate}`;
    signals.push({
      id: `P7:${org}:${supply.para}`, padrao: 'P7', sujeito: holder, entidade: org,
      pergunta: `${buyer} escolheu repetidamente ${displayName(nameOf(graph, org))} sem concurso?`,
      resumo: `${plural(window.n, 'contrato', 'contratos')} sem concurso entre ${window.de} e ${window.ate} (${window.ad} por ajuste direto, ${window.cp} por consulta prévia), ${euro(window.valor)} acumulados.`,
      criterios: [
        criterion('repeticao', 'Dois ou mais ajustes diretos ou consultas prévias em 3 anos', 'sim', `${window.n} entre ${window.de} e ${window.ate}`, [supply.id]),
        criterion('valor', 'Valor acumulado atinge o limite do artigo 113.º, n.º 2', ratio >= 1 ? 'sim' : 'talvez', valueNote),
        criterion('materiais', 'Excluídos os ajustes diretos por critérios materiais', 'sim', 'Os dados já não os contam'),
        link,
      ],
      itens: rows.map((row) => ({ id: row.id, data: row.data, valor: row.valor, procedimento: row.procedimentoNome, adjudicante: buyer, objeto: cleanText(row.objeto, 160), url: row.url, estado: 'talvez' }))
        .sort((a, b) => b.data.localeCompare(a.data)),
      provas: [supply.id, ...idsOf(ties)],
      alternativas: ['Empreitadas e outros tipos de contrato têm limites próprios.', 'Contagem por ano civil: o ano económico da entidade pode ser outro.',
        'Ajustes diretos simplificados e contratos do Estado em serviços diferentes contam à parte (art. 113.º, n.º 3 e 4).'],
      lacunas: [{ texto: 'Convites e fundamentação da escolha do procedimento.', modelo: 'lada' }],
      lei: [LEGAL.ccpConvidadas, LEGAL.ccpValor],
      valorJanela: window.valor,
      relevancia: { valor: window.valor, ultimo: rows.map((row) => row.data).sort().at(-1) || `${window.ate}-12-31` },
    });
  }
  return signals.sort((a, b) => b.valorJanela - a.valorJanela).slice(0, 3);
}

// ——— avaliação e ordenação ———

const VALUE = { sim: 2, talvez: 0.75, nao: -1.5, na: 0 };
// Critérios sem os quais a pergunta perde a base legal: um «talvez» aqui pesa mais do que nos restantes.
const KEYS = { P1: ['sobreposicao', 'natureza'], P2: ['durante', 'vigente', 'tipo'], P3: ['durante', 'emissor', 'vigente'], P4: ['prazo', 'setor'],
  P5: ['dinheiro'], P6: ['familia', 'dinheiro'], P7: ['valor'], P8: ['pagamento', 'durante'] };
const KEY_FACTOR = { sim: 1, talvez: 0.85, nao: 0.4, na: 1 };

// Contratos de 90 € não são notícia: o valor em causa modula a pontuação dos padrões com dinheiro.
export function materiality(valor) {
  if (valor == null) return 1;
  return valor < 10000 ? 0.5 : valor < 50000 ? 0.7 : valor < 500000 ? 1 : valor < 5000000 ? 1.15 : 1.3;
}

// Plausibilidade (média dos critérios, com os essenciais a pesar mais) × peso do padrão × valor em causa × atualidade,
// mais bónus para ligação oficial e decisões com efeito patrimonial. O cargo atual pesa mais do que factos de há 10 anos.
export function recency(relevance = {}, hoje = new Date().toISOString().slice(0, 10)) {
  if (relevance.atual) return 1.25;
  if (!relevance.ultimo) return 1;
  const years = yearsBetween(dayStart(relevance.ultimo), hoje);
  return years <= 4 ? 1 : years <= 8 ? 0.9 : 0.8;
}

export function scoreSignal(signal, hoje) {
  const counted = signal.criterios.filter((item) => item.estado !== 'na');
  const average = counted.length ? counted.reduce((sum, item) => sum + (VALUE[item.estado] ?? 0), 0) / counted.length : 0;
  const keys = (KEYS[signal.padrao] || []).reduce((acc, id) => acc * (KEY_FACTOR[signal.criterios.find((item) => item.id === id)?.estado] ?? 1), 1);
  const primary = signal.criterios.some((item) => item.id === 'ligacao' && item.estado === 'sim') ? 1.5 : 0;
  const relevance = signal.relevancia || {};
  const base = (PATTERNS[signal.padrao]?.peso || 1) * 5 * average * keys * materiality(relevance.valor);
  return Math.round((base * (base > 0 ? recency(relevance, hoje) : 1) + primary + (relevance.patrimonial ? 1.5 : 0)) * 100) / 100;
}

// Os cartões visíveis mostram entidades diferentes; os restantes sinais sobre a mesma entidade ficam em «outros».
function diversify(ranked, limit) {
  const visible = [];
  const used = new Set();
  for (const signal of ranked) {
    if (visible.length >= limit) break;
    const keys = unique([signal.entidade, signal.ligada]);
    if (keys.some((key) => used.has(key))) continue;
    visible.push(signal);
    keys.forEach((key) => used.add(key));
  }
  for (const signal of ranked) {
    if (visible.length >= limit) break;
    if (!visible.includes(signal)) visible.push(signal);
  }
  visible.sort((a, b) => b.pontuacao - a.pontuacao || a.id.localeCompare(b.id));
  return { visiveis: visible, outros: ranked.filter((signal) => !visible.includes(signal)) };
}

export function evaluateSignals(graph, { hoje = new Date().toISOString().slice(0, 10), limit = 3 } = {}) {
  const signals = [];
  for (const holder of holdersOf(graph)) {
    const chains = patternP8(graph, holder);
    const payers = new Set(chains.map((item) => item.entidade));
    signals.push(...patternP1(graph, holder), ...patternP4(graph, holder), ...chains);
    for (const org of linkedOrgs(graph, holder)) {
      const ties = mergedTies(graph, holder, org);
      if (!ties.length) continue;
      // Quem paga a uma entidade ligada já tem a sua pergunta (P8): não se repete como decisão sobre entidade ligada.
      const p3 = payers.has(org) ? null : patternP3(graph, holder, org, ties);
      signals.push(...[patternP2(graph, holder, org, ties, hoje), p3, patternP6(graph, holder, org, ties)].filter(Boolean));
      const family = signals.some((item) => item.id === `P6:${holder}:${org}`);
      if (!family && !payers.has(org)) { const weak = patternP5(graph, holder, org, ties, hoje); if (weak) signals.push(weak); }
      if (org !== SUBJECT) signals.push(...patternP7(graph, holder, org, ties));
    }
  }
  if (graph.nos[SUBJECT].tipo === 'org') signals.push(...patternP7(graph, SUBJECT, SUBJECT, []));
  const seen = new Set();
  const ranked = signals.filter((item) => !seen.has(item.id) && seen.add(item.id)).map((item) => {
    const counts = { sim: 0, talvez: 0, nao: 0, na: 0 };
    for (const entry of item.criterios) counts[entry.estado] += 1;
    return { ...item, titulo: PATTERNS[item.padrao].titulo, contagem: counts, pontuacao: scoreSignal(item, hoje) };
  }).sort((a, b) => b.pontuacao - a.pontuacao || a.id.localeCompare(b.id));
  return { ...diversify(ranked, limit), todos: ranked };
}

// ——— perguntas seguintes ———

const LEGAL_FORMS = /,?\s*(?:S\.?\s?A\.?|Lda\.?|Limitada|SGPS|Unipessoal|S\.?\s?P\.?,?\s?R\.?\s?L\.?|R\.?\s?L\.?|C\.?R\.?L\.?)\s*$/i;

export function displayName(name) {
  return cleanText(String(name || '').replace(LEGAL_FORMS, '').replace(LEGAL_FORMS, ''), 80);
}

export function markAsked(graph, pergunta, detail = {}) {
  graph.consultas.push({ pergunta, em: new Date().toISOString(), ...detail });
}

const GENERIC_SUFFIX = /,?\s+(?:sociedade de advogados|sociedade de profissionais|sociedade gestora de participa[cç][oõ]es sociais)\b.*$/i;

// O nome que melhor encontra a entidade no Diário da República: o mais curto que ainda é específico
// («Sousa Pinheiro & Montenegro» em vez de «SP&M» ou da denominação completa).
export function searchName(node) {
  const names = unique([node?.nome, ...(node?.nomes || [])].map((name) => displayName(name).replace(/^[\p{Lu}&.]{2,8}\s+[-–]\s+/u, '').replace(GENERIC_SUFFIX, '').trim()));
  const specific = names.filter((name) => name.length >= 5 && nameTokens(name).some((token) => token.length >= 4 && !GENERIC_TOKENS.has(token)));
  const caps = (name) => Number(name === name.toUpperCase());
  return (specific.length ? specific : names).sort((a, b) => a.length - b.length || caps(a) - caps(b))[0] || displayName(node?.nome);
}

const THEME_QUERY = { 'concessão': 'concessão', 'licença': 'licença', apoio: 'apoio', contrato: 'contrato' };

// Pesquisas no Diário da República: primeiro os temas que as fontes associam à entidade, depois os gerais.
export function actQueries(node) {
  const name = `"${searchName(node)}"`;
  return unique([...(node?.temas || []).map((tema) => THEME_QUERY[tema] && `${name} ${THEME_QUERY[tema]}`), `${name} concessão`, `${name} contrato`, name]).slice(0, 3);
}

const drAction = (no, node) => {
  const qs = actQueries(node);
  return { tipo: 'dr', no, q: qs[0], qs, ligacao: 'nome' };
};

export function nextQuestions(graph, { limit = 4 } = {}) {
  const alvo = graph.nos[SUBJECT];
  const questions = [];
  const add = (question) => { if (!asked(graph, question.id) && !questions.some((item) => item.id === question.id)) questions.push(question); };
  const executive = officesOf(graph, SUBJECT).some((office) => office.cargo.executivo);
  if (alvo.tipo === 'org') {
    add({ id: 'declarantes', texto: `Que titulares de cargos declararam ligação a ${displayName(alvo.nome)}?`, porque: 'O registo de interesses do Parlamento diz quem tem ou teve funções ou participações nesta entidade.',
      acao: { tipo: 'declarantes', no: SUBJECT, nome: alvo.nome }, prioridade: 10 });
    if (!graph.contratos[SUBJECT]) add({ id: `contratos:${SUBJECT}`, texto: `Quem paga a ${displayName(alvo.nome)} e como?`, porque: 'Os contratos públicos mostram que entidades do Estado a escolheram e se houve concorrência.',
      acao: { tipo: 'contratos', no: SUBJECT, nome: alvo.nome }, prioridade: 9 });
    add({ id: `atos:${SUBJECT}`, texto: `O Estado decidiu algo sobre ${displayName(alvo.nome)}?`, porque: 'O Diário da República publica concessões, licenças, apoios e contratos.',
      acao: drAction(SUBJECT, alvo), prioridade: 7 });
    if (!graph.afirmacoes.some((item) => item.rel === 'co-mencao')) add({ id: 'fontes', texto: `Quem detém ${displayName(alvo.nome)} e com quem se relaciona?`,
      porque: 'As fontes públicas citam donos, participadas e parceiros que os registos oficiais não juntam. As participadas também recebem concessões e contratos.',
      acao: { tipo: 'wikipedia', titulo: alvo.tituloArtigo || alvo.nome }, prioridade: 6.5 });
  }
  const linked = linkedOrgs(graph, SUBJECT);
  const linkedSet = new Set([SUBJECT, ...linked]);
  // Quem paga ao titular ou a uma entidade ligada: o elo que liga o titular a decisões sobre terceiros.
  const payers = new Map();
  for (const item of graph.afirmacoes.filter((entry) => entry.rel === 'cliente' && linkedSet.has(entry.para) && entry.de !== SUBJECT)) {
    if (!payers.has(item.de)) payers.set(item.de, item);
  }
  for (const org of linked) {
    const node = graph.nos[org];
    const ties = tiesBetween(graph, SUBJECT, org);
    const primary = official(ties).length > 0;
    const secondary = ties.some((item) => item.fonte?.tipo === 'secundaria' || item.rel === 'co-mencao');
    const familia = ties.some((item) => item.familia);
    const pays = payers.get(org);
    const why = pays
      ? `${pays.fonte?.nome || 'Fonte'}: «${cleanText(pays.fonte?.citacao, 180)}». Se o Estado decidiu sobre ${displayName(node.nome)} durante o cargo, a pergunta muda de natureza.`
      : primary ? `Declarado: ${official(ties)[0].fonte.citacao || tieDescription(graph, ties)}.` : `${ties[0]?.fonte?.nome || 'Fonte secundária'}: «${cleanText(ties[0]?.fonte?.citacao, 160)}»`;
    const crossed = primary && secondary ? 1 : 0;
    if (!graph.contratos[org]) {
      add({ id: `contratos:${org}`, texto: `${displayName(node.nome)} recebeu dinheiro público?`, porque: why,
        acao: { tipo: 'contratos', no: org, nome: node.nome, nomes: node.nomes },
        prioridade: (primary ? 10 : 6) + (ties.some((item) => item.rel === 'participacao') ? 2 : 0) + (familia ? 2 : 0) + (pays ? 2 : 0) + crossed + Math.min(2, ties[0]?.mencoes || 0) / 2 });
    }
    // Com cargo executivo, a decisão do Estado sobre quem paga é o elo que falta ao sinal P8: passa à frente de qualquer outra pista.
    add({ id: `atos:${org}`, texto: pays ? `${displayName(node.nome)} paga a quem está ligado a ${alvo.nome}. O Estado decidiu algo sobre ${displayName(node.nome)}?` : `O Estado decidiu algo sobre ${displayName(node.nome)}?`,
      porque: pays ? why : `${why} Concessões, licenças e apoios saem no Diário da República.`,
      acao: drAction(org, node), prioridade: pays && executive ? 20 : (executive ? 8 : 5) + (familia ? 1 : 0) + (primary ? 0.5 : 0) + crossed + (pays ? 2 : 0) });
  }
  if (alvo.tipo === 'person') {
    const secondary = graph.afirmacoes.some((item) => item.rel === 'co-mencao');
    // Barata e reveladora: as fontes secundárias trazem as ligações que as declarações não mostram (e quem paga a quem).
    if (!secondary) add({ id: 'fontes', texto: 'O que dizem as fontes públicas que não está nas declarações?', porque: 'Notícias e enciclopédias citam empresas e relações que podem não estar declaradas.',
      acao: { tipo: 'wikipedia', titulo: alvo.tituloArtigo || alvo.nome }, prioridade: executive ? 12.5 : 11 });
    const gap = declarationGap(graph, SUBJECT, new Date().toISOString().slice(0, 10));
    if (gap) add({ id: 'declaracao-atual', texto: 'A declaração atual mostra outras ligações?', porque: gap.texto, acao: { tipo: 'externo', url: gap.fonte.url, fonte: gap.fonte.nome }, prioridade: 4 });
    for (const office of officesOf(graph, SUBJECT).filter((item) => item.cargo.executivo && item.fim)) {
      add({ id: `depois:${office.para}`, texto: `O que fez depois de sair do cargo de ${officeLabel(graph, office)}?`, porque: 'Nos 3 anos seguintes há limites a funções em empresas do setor tutelado (art. 10.º).',
        acao: { tipo: 'dr', no: SUBJECT, q: `"${alvo.nome}"`, ligacao: 'nome' }, prioridade: 5 });
    }
  }
  // Seguir o objeto: um ato sobre a entidade leva a decisões sobre o mesmo assunto que não a nomeiam.
  // Só os assuntos dos atos mais recentes, e cada assunto uma vez («zona Algarve» e «Zona Jogo Algarve» são o mesmo).
  const stems = (text) => new Set(nameTokens(text).map((token) => token.replace(/s$/, '')));
  const same = (a, b) => { const [small, large] = a.size <= b.size ? [a, b] : [b, a]; return small.size >= 2 && [...small].every((token) => large.has(token)); };
  const seen = graph.consultas.filter((item) => item.consulta).map((item) => stems(item.consulta));
  const acts = graph.afirmacoes.filter((item) => item.rel === 'ato' && item.ligacao === 'nome' && PATRIMONIAL.has(item.classe?.decisao))
    .sort((a, b) => String(b.data || '').localeCompare(String(a.data || '')));
  let topics = 0;
  for (const act of acts) {
    if (topics >= 3) break;
    const node = graph.nos[act.de];
    const q = objectQuery(node?.sumario || act.detalhe, nameOf(graph, act.para));
    if (!q) continue;
    const key = stems(q);
    if (seen.some((other) => same(key, other))) continue;
    seen.push(key);
    if (graph.consultas.some((item) => item.consulta === q) || asked(graph, `objeto:${q}`)) continue;
    topics += 1;
    add({ id: `objeto:${q}`, texto: `Houve outras decisões sobre «${q}»?`, porque: `${node?.nome || 'Um ato'} (${shortDate(act.data)}) trata deste assunto. Decisões posteriores podem não nomear a entidade.`,
      acao: { tipo: 'dr', no: act.para, q, ligacao: 'objeto' }, prioridade: (executive ? 8.5 : 6) - topics / 100 });
  }
  questions.sort((a, b) => b.prioridade - a.prioridade || a.id.localeCompare(b.id));
  return { perguntas: questions.slice(0, limit), restantes: Math.max(0, questions.length - limit) };
}

// ——— modelos e exportação ———

export function describeStatement(graph, item) {
  const from = nameOf(graph, item.de);
  const to = item.para ? nameOf(graph, item.para) : '';
  const when = item.data ? ` em ${shortDate(item.data)}` : item.inicio || item.fim ? ` (${period(item)})` : item.declaradoEm ? ` (declarado em ${shortDate(item.declaradoEm)})` : '';
  const relation = RELATIONS[item.rel] || item.rel;
  const detail = item.detalhe && item.detalhe.trim().toLowerCase() !== String(relation).toLowerCase() ? `: ${cleanText(item.detalhe, 160)}` : '';
  return `${from} — ${relation}${to ? ` — ${to}` : ''}${detail}${when}`;
}

const QUESTION_FOR = {
  vigente: 'Mantinha essa ligação à data dos factos? Se não, quando terminou?',
  tipo: 'Que funções exercia exatamente na entidade e qual a participação no capital?',
  sobreposicao: 'Em que data cessou cada uma das funções privadas indicadas?',
  natureza: 'Alguma destas funções é exercida por inerência ou está abrangida por exceção legal?',
  emissor: 'Teve alguma intervenção, direta ou indireta, na preparação ou decisão deste ato? Pediu escusa?',
  destinatario: 'A entidade foi concorrente ou destinatária deste procedimento?',
  durante: 'Pode confirmar as datas em que exerceu o cargo?',
  familia: 'Que familiares detêm participações ou cargos na entidade?',
  participacao: 'Qual a participação de familiares no capital da entidade?',
  dinheiro: 'A entidade recebeu contratos ou apoios públicos durante o seu mandato?',
  ausente: 'Por que razão esta ligação não consta das declarações disponíveis?',
  regresso: 'Teve funções nesta entidade antes de assumir o cargo?',
  setor: 'A entidade beneficiou de decisões ou apoios do setor que tutelava?',
  ligacao: 'Que relação mantém hoje com esta entidade e desde quando?',
  pagamento: 'Que pagamentos foram feitos por esta entidade, desde quando, em que montantes e por que serviços?',
  simultaneo: 'Esses pagamentos ainda se mantinham à data da decisão do Estado?',
  clientes: 'Quem são os clientes da entidade e algum depende de decisões do Estado?',
  conjuge: 'Que familiares têm participação ou funções na entidade?',
  decisao: 'Qual foi o conteúdo e o efeito desta decisão para a entidade?',
};

export function replyTemplate(graph, signal, { autor = '[o teu nome e órgão de comunicação]', prazoDias = 5, hoje = new Date() } = {}) {
  const facts = signal.provas.map((id) => graph.afirmacoes.find((item) => item.id === id)).filter(Boolean).slice(0, 8)
    .map((item, index) => `${index + 1}. ${describeStatement(graph, item)}. Fonte: ${item.fonte?.nome || ''}${item.fonte?.url ? ` (${item.fonte.url})` : ''}`);
  const contracts = (signal.itens || []).filter((item) => item.url).slice(0, 5).map((item) => `- ${item.texto || `${item.procedimento || 'Contrato'} de ${shortDate(item.data)}, ${euro(item.valor)}, ${item.adjudicante || ''}`} — ${item.url}`);
  const questions = unique(signal.criterios.filter((item) => item.estado === 'talvez').map((item) => QUESTION_FOR[item.id]));
  questions.push('Há algum contexto ou documento que considere relevante para este trabalho?');
  const deadline = new Date(hoje.getTime() + prazoDias * 86400000).toISOString().slice(0, 10);
  return [
    `Assunto: Pedido de comentário — ${signal.titulo || PATTERNS[signal.padrao].titulo}`,
    '',
    `Exmo(a). Senhor(a) ${nameOf(graph, signal.sujeito)},`,
    '',
    'Estou a preparar um trabalho jornalístico com base em dados públicos e gostaria de ouvir a sua posição antes de publicar.',
    '',
    'Factos recolhidos em fontes públicas:',
    ...facts,
    ...(contracts.length ? ['', 'Registos relacionados:', ...contracts] : []),
    '',
    'Perguntas:',
    ...questions.map((item, index) => `${index + 1}. ${item}`),
    '',
    `Agradeço a resposta até ${shortDate(deadline)}. Se não for possível responder, essa informação será referida no trabalho.`,
    '',
    'Com os melhores cumprimentos,',
    autor,
  ].join('\n');
}

export function ladaTargets(graph, signal) {
  const names = new Map();
  for (const item of signal.itens || []) if (item.adjudicante) names.set(item.adjudicante, item.adjudicante);
  for (const item of signal.itens || []) if (item.emissor) names.set(item.emissor, item.emissor);
  return [...names.keys()].slice(0, 8);
}

export function ladaTemplate(graph, signal, { entidade = '', requerente = '[nome, identificação e contacto]' } = {}) {
  const items = (signal.itens || []).filter((item) => !entidade || item.adjudicante === entidade || item.emissor === entidade).slice(0, 10);
  // Sem registos concretos, pede o que falta verificar: decisões sobre a entidade do sinal enquanto o titular exercia cargo executivo.
  const since = officesOf(graph, signal.sujeito).filter((office) => office.cargo.executivo && office.inicio).map((office) => dayStart(office.inicio)).sort()[0];
  const subjectOrg = signal.entidade && graph.nos[signal.entidade]?.tipo !== 'person' ? displayName(nameOf(graph, signal.entidade)) : '';
  const documents = items.length ? items.map((item, index) => (item.adjudicante
    ? `${index + 1}. Processo do contrato publicado no Portal BASE com o n.º ${item.id} (${shortDate(item.data)}, ${euro(item.valor)}): convites, propostas recebidas, relatório de análise, decisão de adjudicação, contrato e declarações relativas a impedimentos e conflitos de interesses.`
    : `${index + 1}. Processo administrativo relativo a ${item.texto} (${shortDate(item.data)}): informações e pareceres de suporte, lista de concorrentes ou interessados, declarações de impedimento ou de escusa e atas.`))
    : subjectOrg
      ? [`1. Decisões, despachos, concessões, licenças, contratos ou apoios relativos a ${subjectOrg}${since ? ` adotados desde ${shortDate(since)}` : ''}, e respetivos processos: informações e pareceres de suporte, declarações de impedimento ou de escusa e atas.`,
        '2. [Acrescenta ou precisa os documentos: tipo, data, número do processo.]']
      : ['1. [Descreve os documentos com a maior precisão possível: tipo, data, número do processo.]'];
  return [
    'Assunto: Pedido de acesso a documentos administrativos (Lei n.º 26/2016, de 22 de agosto)',
    '',
    `Exmo(a). Senhor(a) Presidente/Dirigente máximo(a)${entidade ? ` — ${entidade}` : ''},`,
    '',
    'Ao abrigo do artigo 5.º da Lei n.º 26/2016 (LADA), que garante a todos o direito de acesso aos documentos administrativos sem necessidade de enunciar qualquer interesse, venho requerer a reprodução, em formato digital, dos seguintes documentos:',
    '',
    ...documents,
    '',
    'Caso algum documento contenha dados nominativos, peço o acesso com expurgo dessa informação (artigo 6.º).',
    'Nos termos do artigo 15.º, a entidade dispõe de 10 dias para responder. Em caso de recusa ou falta de resposta, poderei apresentar queixa à CADA.',
    '',
    'Requerente:',
    requerente,
    '',
    'Data e assinatura:',
  ].join('\n');
}

export function notebookMarkdown(graph, { sinais = evaluateSignals(graph).todos, hoje = new Date().toISOString().slice(0, 10) } = {}) {
  const alvo = graph.nos[SUBJECT];
  const mark = { sim: '✔', talvez: '?', nao: '✖', na: '—' };
  const lines = [`# Caderno de investigação — ${alvo.nome}`, '',
    `Gerado em ${shortDate(hoje)} com a Teia (Fumaça). Junta factos públicos com fonte. Os sinais são perguntas, não acusações: cada um mostra o que está confirmado, o que falta confirmar e explicações alternativas.`, ''];
  lines.push('## Sinais que merecem pergunta', '');
  if (!sinais.length) lines.push('Nenhum sinal com os dados recolhidos até agora.', '');
  sinais.forEach((signal, index) => {
    lines.push(`### ${index + 1}. ${signal.titulo || PATTERNS[signal.padrao].titulo}`, '', `**${signal.pergunta}**`, '', signal.resumo, '');
    if (signal.cadeia?.length) lines.push(`Cadeia: ${signal.cadeia.map((item) => `${item.nome} (${item.papel}${item.data ? `, ${shortDate(item.data)}` : ''})`).join(' → ')}`, '');
    lines.push('| Critério | Estado | Nota |', '|---|---|---|');
    for (const item of signal.criterios) lines.push(`| ${item.texto} | ${mark[item.estado]} | ${String(item.nota || '').replace(/\|/g, '/')} |`);
    lines.push('');
    if (signal.itens?.length) lines.push('Registos:', ...signal.itens.slice(0, 12).map((item) => `- ${item.texto || `${shortDate(item.data)} — ${item.procedimento || ''} — ${euro(item.valor)} — ${item.adjudicante || ''} — ${item.objeto || ''}`}${item.url ? ` — ${item.url}` : ''}`), '');
    lines.push('Explicações alternativas:', ...signal.alternativas.map((item) => `- ${item}`), '');
    lines.push('Lacunas:', ...signal.lacunas.map((item) => `- ${item.texto}${item.fonte ? ` (${item.fonte.nome}: ${item.fonte.url})` : ''}`), '');
    lines.push('Lei:', ...signal.lei.map((item) => `- ${item.rotulo}`), '');
  });
  lines.push('## Factos com fonte', '');
  graph.afirmacoes.forEach((item, index) => {
    lines.push(`${index + 1}. ${describeStatement(graph, item)} — ${item.fonte?.tipo === 'primaria' ? 'fonte oficial' : item.fonte?.tipo === 'manual' ? 'registo manual' : 'fonte secundária'}: ${item.fonte?.nome || ''}${item.fonte?.url ? ` (${item.fonte.url})` : ''}${item.fonte?.citacao ? ` — «${item.fonte.citacao}»` : ''}`);
  });
  lines.push('');
  if (graph.identidades.length) lines.push('## Identidades confirmadas por ti', '', ...graph.identidades.map((item) => `- ${nameOf(graph, item.no)} = NIF ${item.nif} (${item.fonte}, ${shortDate(item.confirmadoEm)})`), '');
  if (graph.fusoes?.length) lines.push('## Denominações juntas automaticamente', '', ...graph.fusoes.map((item) => `- «${item.de}» tratada como ${item.nome} (${item.motivo})`), '');
  if (graph.consultas.length) lines.push('## Consultas feitas', '', ...graph.consultas.map((item) => `- ${shortDate(item.em)} — ${item.texto || item.pergunta || item.fonte || ''}${item.consulta ? `: ${item.consulta}` : ''}${item.total != null ? ` (${item.total} resultados)` : ''}${item.resumo ? ` → ${item.resumo}` : ''}`), '');
  lines.push('---', 'Antes de publicar: confirma cada facto na fonte original, ouve as pessoas visadas e regista as respostas.');
  return lines.join('\n');
}

export function exportGraph(graph) {
  return JSON.stringify({ formato: 'fumaca-teia', versao: graph.versao, exportadoEm: new Date().toISOString(), grafo: graph }, null, 1);
}

export function importGraph(text) {
  let data;
  try { data = JSON.parse(text); } catch { throw new Error('O ficheiro não é JSON válido.'); }
  const graph = data?.grafo;
  if (data?.formato !== 'fumaca-teia' || !graph || typeof graph.nos !== 'object' || !graph.nos[SUBJECT]
    || !Array.isArray(graph.afirmacoes) || !Array.isArray(graph.consultas) || !Array.isArray(graph.identidades)) {
    throw new Error('Este ficheiro não é um caderno da Teia.');
  }
  if (graph.versao !== 1) throw new Error('Versão do caderno não suportada.');
  graph.contratos = graph.contratos && typeof graph.contratos === 'object' ? graph.contratos : {};
  // Um caderno pode vir de uma versão antiga ou ter sido editado: só passam nós e afirmações bem formados, sem nomes privados.
  for (const [id, node] of Object.entries(graph.nos)) {
    if (!node || typeof node !== 'object' || Array.isArray(node)) { delete graph.nos[id]; continue; }
    node.id = id;
    node.nome = node.privado ? PRIVATE_NAME : cleanText(node.nome, 200) || id;
    node.nomes = node.privado ? [PRIVATE_NAME] : [...new Set([node.nome, ...(Array.isArray(node.nomes) ? node.nomes.filter((name) => typeof name === 'string') : [])])];
    node.ids = node.ids && typeof node.ids === 'object' && !Array.isArray(node.ids) ? node.ids : {};
  }
  graph.afirmacoes = graph.afirmacoes.filter((item) => item && typeof item === 'object' && graph.nos[item.de] && (!item.para || graph.nos[item.para]));
  for (const item of graph.afirmacoes) {
    if (item.fonte && typeof item.fonte !== 'object') item.fonte = {};
    if (graph.nos[item.para]?.privado && item.fonte) item.fonte.citacao = 'Cônjuge indicado na declaração (nome omitido pela Teia)';
  }
  graph.consultas = graph.consultas.filter((item) => item && typeof item === 'object');
  graph.identidades = graph.identidades.filter((item) => item && typeof item === 'object' && graph.nos[item.no]);
  graph.fusoes = Array.isArray(graph.fusoes) ? graph.fusoes.filter((item) => item && typeof item === 'object') : [];
  return graph;
}

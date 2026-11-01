// Teia: grafo de afirmações com proveniência. Cada ligação diz quem a afirma, onde e quando foi recolhida.
// Nada aqui decide culpa: o grafo guarda factos citáveis; os sinais (teia-signals.mjs) só fazem perguntas.
import { cleanText, normalizeName, nameTokens, unpackContract, parliamentBiographyUrl, DIRECT_AWARD, STOPWORDS, GENERIC_TOKENS, expandAcronym } from './teia-index.mjs';

export const GRAPH_VERSION = 1;
export const SUBJECT = 'alvo';
export const PRIVATE_NAME = 'Cônjuge (nome omitido)';

export const RELATIONS = {
  'cargo-publico': 'cargo público',
  'cargo-privado': 'função em entidade',
  participacao: 'participação social',
  atividade: 'atividade declarada',
  servico: 'serviço prestado declarado',
  apoio: 'apoio ou benefício declarado',
  conjuge: 'cônjuge indicado na declaração',
  partido: 'filiação partidária',
  membro: 'membro de',
  fornece: 'contratos públicos',
  ato: 'ato no Diário da República',
  'co-mencao': 'mencionado no mesmo texto',
  grupo: 'mesmo grupo empresarial',
  cliente: 'pagamentos ou avenças noticiados',
  manual: 'ligação registada por ti',
};

// Datas de início das legislaturas (primeira reunião). O mandato de cada deputado pode ser mais curto.
export const LEGISLATURES = {
  I: ['1976-06-03', '1980-11-12'], II: ['1980-11-13', '1983-05-30'], III: ['1983-05-31', '1985-11-03'],
  IV: ['1985-11-04', '1987-08-12'], V: ['1987-08-13', '1991-11-03'], VI: ['1991-11-04', '1995-10-26'],
  VII: ['1995-10-27', '1999-10-24'], VIII: ['1999-10-25', '2002-04-04'], IX: ['2002-04-05', '2005-03-09'],
  X: ['2005-03-10', '2009-10-14'], XI: ['2009-10-15', '2011-06-19'], XII: ['2011-06-20', '2015-10-22'],
  XIII: ['2015-10-23', '2019-10-24'], XIV: ['2019-10-25', '2022-03-28'], XV: ['2022-03-29', '2024-03-25'],
  XVI: ['2024-03-26', '2025-06-02'], XVII: ['2025-06-03', ''],
};

const MUNICIPALITY = /(?:c[aâ]mara municipal|munic[ií]pio|assembleia municipal|concelho)\s+d[eoa]s?\s+([\p{L}][\p{L}\s'-]{1,40}?)(?=\s*(?:[,;.()]|\s-\s|$|\d))/iu;

// lei52: o cargo está abrangido pelos impedimentos da Lei 52/2019 (arts. 2.º e 3.º)? Assembleias municipais e órgãos partidários não estão.
export function classifyOffice(label) {
  const text = cleanText(label);
  const municipality = MUNICIPALITY.exec(text)?.[1]?.trim() || '';
  const office = (ambito, extra = {}) => ({ publico: true, ambito, executivo: false, exclusividade: false, nacional: false, municipio: municipality, lei52: 'sim', ...extra });
  if (/primeir[oa][\s-]ministr/i.test(text)) return office('governo', { executivo: true, exclusividade: true, nacional: true, chefe: true });
  if (/\bministr[oa]\b|secret[aá]ri[oa]s? de estado|membro do governo|subsecret[aá]ri[oa] de estado/i.test(text) && !/regional/i.test(text)) {
    return office('governo', { executivo: true, exclusividade: true, nacional: true });
  }
  if (/presidente da rep[uú]blica/i.test(text)) return office('presidencia', { exclusividade: true, nacional: true });
  if (/governo regional|secret[aá]ri[oa] regional/i.test(text)) return office('regional', { executivo: true, exclusividade: true });
  if (/assembleia legislativa|deputad[oa] regional/i.test(text)) return office('regional');
  if (/parlamento europeu|eurodeputad/i.test(text)) return office('europeu', { nacional: true });
  if (/assembleia municipal|assembleia de freguesia|assembleia metropolitana|deputad[oa] municipal/i.test(text)) return office('autarquia-deliberativo', { lei52: 'nao' });
  if (/presidente da c[aâ]mara|vereador|presidente da junta|junta de freguesia|c[aâ]mara municipal|comiss[aã]o executiva metropolitana|secretariado executivo intermunicipal/i.test(text)) {
    return office('autarquia-executivo', { executivo: true, exclusividade: null });
  }
  if (/deputad[oa]|assembleia da rep[uú]blica|grupo parlamentar/i.test(text)) return office('parlamento', { nacional: true });
  if (/diretor[ae]?[\s-]geral|director[ae]?[\s-]geral|subdiretor|inspetor[ae]?[\s-]geral|conselho diretivo|gestor p[uú]blico|presidente do instituto|chefe do gabinete|chefe de gabinete/i.test(text)) {
    return office('alto-cargo', { executivo: true, exclusividade: true, nacional: true });
  }
  if (/comiss[aã]o de acesso aos documentos|entidade reguladora|entidade administrativa independente|provedor de justi[cç]a|tribunal constitucional|conselho de estado|conselho econ[oó]mico e social/i.test(text)) {
    return office('orgao-independente', { nacional: true, lei52: 'talvez' });
  }
  if (/\b(?:presidente|secret[aá]ri[oa][\s-]geral|l[ií]der|vice-presidente)\b.*\b(?:partido|psd|ps|cds|pcp|bloco|chega|iniciativa liberal|livre|pan)\b/i.test(text)) {
    return { publico: false, ambito: 'partido', executivo: false, exclusividade: false, nacional: true, municipio: '', lei52: 'nao' };
  }
  return { publico: false, ambito: 'privado', executivo: false, exclusividade: false, nacional: false, municipio: '', lei52: 'nao' };
}

// «Presidente da Assembleia Municipal de Espinho (200972013)»: os dados abertos trazem por vezes os anos colados ao cargo.
export function officeYears(label) {
  const match = /\(\s*((?:19|20)\d{2})[^\d)]{0,3}\d?((?:19|20)\d{2})\s*\)/.exec(String(label || ''));
  if (!match || match[2] < match[1]) return null;
  return { inicio: match[1], fim: match[2], rotulo: cleanText(String(label).replace(match[0], '')) };
}

export function classifyBuyer(name) {
  const text = cleanText(name);
  const municipality = /^(?:munic[ií]pio|c[aâ]mara municipal)\s+d[eoa]s?\s+(.+?)\s*$/i.exec(text)?.[1] || '';
  if (municipality) return { esfera: 'municipal', municipio: municipality };
  if (/junta de freguesia|^freguesia d|uni[aã]o d[ae]s? freguesias/i.test(text)) return { esfera: 'freguesia', municipio: '' };
  if (/servi[cç]os municipalizados|empresa municipal|\bE\.\s?M\.?(?:,|\s|$)|intermunicipal|[aá]rea metropolitana/i.test(text)) return { esfera: 'local', municipio: '' };
  if (/regi[aã]o aut[oó]noma|governo regional|secretaria regional|vice-presid[eê]ncia do governo regional/i.test(text)) return { esfera: 'regional', municipio: '' };
  if (/minist[eé]rio|secretaria-geral|dire[cç][aã]o[\s-]geral|dire[cç][aã]o regional|instituto|,?\s?I\.\s?P\.|ag[eê]ncia|autoridade|inspe[cç][aã]o[\s-]geral|guarda nacional|pol[ií]cia de seguran|for[cç]a a[eé]rea|ex[eé]rcito|marinha|estado-maior|presid[eê]ncia do conselho|gabinete|agrupamento de escolas|escola (?:secund|b[aá]sica)|hospital|centro hospitalar|unidade local de sa[uú]de|administra[cç][aã]o regional de sa[uú]de|E\.\s?P\.\s?E\.?|\bEPE\b|universidade|polit[eé]cnico|tribunal|turismo de portugal|banco portugu[eê]s de fomento|infraestruturas de portugal|estradas de portugal|comboios de portugal|caixa geral de dep[oó]sitos|parpública|aicep|instituto nacional|emerg[eê]ncia m[eé]dica/i.test(text)) {
    return { esfera: 'central', municipio: '' };
  }
  return { esfera: 'outra', municipio: '' };
}

// Uma afirmação é «em vigor» num dia se o intervalo da fonte o contém. Sem fim declarado, só sabemos até à data da declaração.
export function dayStart(value) {
  const text = String(value || '');
  if (/^\d{4}$/.test(text)) return `${text}-01-01`;
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-01`;
  return text.slice(0, 10);
}

export function dayEnd(value) {
  const text = String(value || '');
  if (/^\d{4}$/.test(text)) return `${text}-12-31`;
  if (/^\d{4}-\d{2}$/.test(text)) return `${text}-31`;
  return text.slice(0, 10);
}

export function activeOn(statement, day) {
  if (!day || statement.semData) return 'talvez';
  const start = dayStart(statement.inicio);
  const end = dayEnd(statement.fim);
  if (start && day < start) return 'nao';
  if (end && day > end) return 'nao';
  // Deixou de constar de uma declaração posterior: terminou, no máximo, nessa data.
  if (statement.fimAte && day > statement.fimAte) return 'nao';
  if (statement.declaradoDe && statement.declaradoDe <= day && day <= statement.declaradoEm) return 'sim';
  if (!start) return 'talvez';
  if (end || statement.atual) return statement.aproximado ? 'talvez' : 'sim';
  if (statement.declaradoEm && day <= statement.declaradoEm) return 'sim';
  return 'talvez';
}

const isDeclared = (item) => Boolean(item.declaradoEm) && /registo de interesses|declara/i.test(item.fonte?.nome || '');

function span(item) {
  const start = dayStart(item.inicio) || item.declaradoEm || dayStart(item.data) || '';
  const end = item.fim ? dayEnd(item.fim) : item.atual ? '9999-12-31' : item.declaradoEm || dayStart(item.data) || start;
  return [start, end];
}

function combine(group, declarationDays) {
  const precise = group.filter((item) => !item.aproximado);
  const pick = (field, last) => {
    const norm = field === 'fim' ? dayEnd : dayStart;
    const values = (precise.some((item) => item[field]) ? precise : group).map((item) => item[field]).filter(Boolean).sort((a, b) => norm(a).localeCompare(norm(b)));
    return values.length ? (last ? values.at(-1) : values[0]) : '';
  };
  const lead = [...group].sort((a, b) => Number(b.fonte?.tipo === 'primaria') - Number(a.fonte?.tipo === 'primaria')
    || Number(Boolean(b.inicio || b.fim)) - Number(Boolean(a.inicio || a.fim)) || String(b.declaradoEm || '').localeCompare(String(a.declaradoEm || '')))[0];
  const declared = group.map((item) => item.declaradoEm).filter(Boolean).sort();
  const inicio = pick('inicio', false);
  const fim = group.some((item) => item.atual) ? '' : pick('fim', true);
  const merged = {
    ...lead, ids: group.map((item) => item.id), fontes: [...new Map(group.map((item) => [item.fonte?.url || item.fonte?.nome, item.fonte])).values()].filter(Boolean),
    inicio, fim, atual: group.some((item) => item.atual), semData: group.every((item) => item.semData),
    aproximado: Boolean((inicio && !precise.some((item) => item.inicio === inicio)) || (fim && !precise.some((item) => item.fim === fim))),
    declaradoEm: declared.at(-1) || '', declaradoDe: declared.length > 1 ? declared[0] : '',
  };
  if (!merged.declaradoDe) delete merged.declaradoDe;
  if (merged.declaradoEm && !merged.fim && !merged.atual && group.some(isDeclared)) {
    const later = declarationDays.find((day) => day > merged.declaradoEm);
    if (later) merged.fimAte = later;
  }
  return merged;
}

// Junta afirmações sobre o mesmo vínculo (a mesma função repetida em várias declarações, ou vinda de várias fontes)
// numa linha de tempo. Declarações sucessivas presumem continuidade; períodos datados só se juntam se se sobrepõem.
// declarationDays: datas das declarações do titular, para saber quando um vínculo deixou de ser declarado.
export function mergeTimeline(items, declarationDays = []) {
  const days = [...new Set(declarationDays.filter(Boolean))].sort();
  const groups = new Map();
  for (const item of items) {
    const key = [item.de, item.rel, item.para || normalizeName(item.detalhe || '')].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  const result = [];
  for (const group of groups.values()) {
    const sorted = [...group].sort((a, b) => span(a)[0].localeCompare(span(b)[0]));
    const clusters = [];
    for (const item of sorted) {
      const [start, end] = span(item);
      const last = clusters.at(-1);
      const bothDeclared = last && isDeclared(item) && last.items.some(isDeclared) && !last.items.some((other) => other.fim) && !item.inicio;
      if (last && (bothDeclared || (start && last.end && start <= last.end))) {
        last.items.push(item);
        if (end > last.end) last.end = end;
      } else clusters.push({ items: [item], end });
    }
    for (const cluster of clusters) result.push(cluster.items.length === 1 && !days.length ? { ...cluster.items[0], ids: [cluster.items[0].id] } : combine(cluster.items, days));
  }
  return result;
}

export function declarationDaysOf(graph, holder) {
  return [...new Set(graph.afirmacoes.filter((item) => item.de === holder && isDeclared(item)).map((item) => item.declaradoEm))].sort();
}

export function yearsBetween(from, to) {
  return (Date.parse(dayStart(to)) - Date.parse(dayStart(from))) / (365.25 * 86400000);
}

export function createGraph(subject) {
  const tipo = subject?.tipo === 'org' ? 'org' : 'person';
  const nome = cleanText(subject?.nome, 200);
  if (!nome) throw new Error('Indica quem ou o que queres escrutinar.');
  return {
    versao: GRAPH_VERSION, criadoEm: new Date().toISOString(),
    nos: { [SUBJECT]: { id: SUBJECT, tipo, nome, nomes: [nome], ids: { ...(subject.ids || {}) } } },
    afirmacoes: [], contratos: {}, identidades: [], consultas: [],
  };
}

export function orgId(name, nif = '') {
  if (/^\d{9}$/.test(String(nif))) return `nif:${nif}`;
  return `org:${normalizeName(name).slice(0, 120)}`;
}

export function findByNif(graph, nif) {
  return Object.values(graph.nos).find((node) => node.ids?.nif === nif)?.id || '';
}

export function addNode(graph, node) {
  const existing = graph.nos[node.id];
  const nome = cleanText(node.nome, 200);
  if (!existing) {
    graph.nos[node.id] = { ...node, nome, nomes: [...new Set([nome, ...(node.nomes || [])].filter(Boolean))], ids: { ...(node.ids || {}) } };
    return node.id;
  }
  for (const value of [nome, ...(node.nomes || [])]) if (value && !existing.nomes.includes(value)) existing.nomes.push(value);
  Object.assign(existing.ids, node.ids || {});
  for (const [key, value] of Object.entries(node)) if (!['id', 'nome', 'nomes', 'ids', 'tipo'].includes(key) && value != null && existing[key] == null) existing[key] = value;
  if (existing.tipo === 'org' && node.tipo && node.tipo !== 'org') existing.tipo = node.tipo;
  return existing.id;
}

export function addStatement(graph, statement) {
  const chave = [statement.de, statement.rel, statement.para || '', statement.detalhe || '', statement.inicio || '', statement.fim || '', statement.data || '', statement.fonte?.url || ''].join('|');
  const existing = graph.afirmacoes.find((item) => item.chave === chave);
  if (existing) return existing.id;
  const id = `a${graph.afirmacoes.length + 1}`;
  graph.afirmacoes.push({ id, chave, ...statement });
  return id;
}

export function statementsOf(graph, nodeId, rel) {
  return graph.afirmacoes.filter((item) => (item.de === nodeId || item.para === nodeId) && (!rel || item.rel === rel));
}

// Junta dois nós depois de confirmação humana (por exemplo, um nome declarado e um NIF nos contratos).
export function mergeNodes(graph, keepId, dropId) {
  if (keepId === dropId || !graph.nos[keepId] || !graph.nos[dropId]) return keepId;
  const drop = graph.nos[dropId];
  addNode(graph, { ...drop, id: keepId, tipo: graph.nos[keepId].tipo });
  for (const item of graph.afirmacoes) {
    if (item.de === dropId) item.de = keepId;
    if (item.para === dropId) item.para = keepId;
  }
  if (graph.contratos[dropId]) graph.contratos[keepId] = graph.contratos[keepId] || graph.contratos[dropId];
  delete graph.contratos[dropId];
  delete graph.nos[dropId];
  return keepId;
}

export function confirmIdentity(graph, nodeId, { nif = '', nome = '', fonte = 'Portal BASE' } = {}) {
  if (!graph.nos[nodeId]) throw new Error('Entidade desconhecida no grafo.');
  if (!/^\d{9}$/.test(nif)) throw new Error('A confirmação precisa de um NIF de 9 dígitos.');
  const other = findByNif(graph, nif);
  const kept = other && other !== nodeId ? mergeNodes(graph, other === SUBJECT ? SUBJECT : nodeId, other === SUBJECT ? nodeId : other) : nodeId;
  addNode(graph, { id: kept, nome: nome || graph.nos[kept].nome, ids: { nif } });
  graph.identidades.push({ no: kept, nif, nome, fonte, confirmadoEm: new Date().toISOString(), por: 'utilizador' });
  return kept;
}

const source = (tipo, nome, url, recolhidoEm, citacao) => ({ tipo, nome, url, recolhidoEm, ...(citacao ? { citacao: cleanText(citacao, 400) } : {}) });
const percent = (value) => {
  const match = /(\d+(?:[.,]\d+)?)\s*%/.exec(String(value || ''));
  return match ? Number(match[1].replace(',', '.')) : null;
};

export function addParliament(graph, file, { recolhidoEm = new Date().toISOString() } = {}) {
  const alvo = graph.nos[SUBJECT];
  addNode(graph, { id: SUBJECT, nome: alvo.nome, nomes: [file.nome, file.nomeParlamentar].filter(Boolean), ids: { parlamento: file.id } });
  alvo.profissao = alvo.profissao || file.profissao || '';
  const bio = file.fontes?.biografia || parliamentBiographyUrl(file.id);
  const bioSource = source('primaria', 'Assembleia da República — biografia (dados abertos)', bio, recolhidoEm);
  const parliament = addNode(graph, { id: 'orgao:assembleia da republica', tipo: 'public-body', nome: 'Assembleia da República' });
  for (const entry of file.legislaturas || []) {
    const [inicio, fim] = LEGISLATURES[entry.leg] || [];
    addStatement(graph, { de: SUBJECT, rel: 'cargo-publico', para: parliament, detalhe: `Deputado (${entry.leg} Legislatura${entry.circulo ? `, ${entry.circulo}` : ''}${entry.partido ? `, ${entry.partido}` : ''})`,
      inicio, fim, aproximado: true, cargo: classifyOffice('Deputado à Assembleia da República'), fonte: bioSource });
  }
  for (const funcao of file.funcoes || []) {
    const cargo = classifyOffice(funcao.descricao);
    if (!cargo.publico || cargo.ambito === 'parlamento') continue;
    const years = officeYears(funcao.descricao);
    const rotulo = years?.rotulo || funcao.descricao;
    const body = addNode(graph, { id: `orgao:${normalizeName(rotulo).slice(0, 80)}`, tipo: 'public-body', nome: rotulo });
    addStatement(graph, { de: SUBJECT, rel: 'cargo-publico', para: body, detalhe: rotulo, cargo, fonte: bioSource,
      ...(years ? { inicio: years.inicio, fim: years.fim, aproximado: true } : { semData: true, atual: funcao.antiga === false }) });
  }
  const interests = new Map((file.fontes?.interesses || []).map((item) => [item.leg, item.url]));
  const texts = [];
  for (const declaration of file.declaracoes || []) {
    const fonte = source('primaria', `Registo de interesses na Assembleia da República (${declaration.leg} Legislatura, ${declaration.data || 'sem data'})`,
      interests.get(declaration.leg) || file.ficheiro || bio, recolhidoEm);
    const declaradoEm = declaration.data || '';
    // Minimização de dados: basta saber que há cônjuge declarado; o nome nunca entra no grafo nem nas exportações.
    if (declaration.conjuge) {
      const spouse = addNode(graph, { id: 'pessoa:conjuge', tipo: 'person', nome: PRIVATE_NAME, privado: true });
      addStatement(graph, { de: SUBJECT, rel: 'conjuge', para: spouse, data: declaradoEm, declaradoEm, fonte: { ...fonte, citacao: 'Cônjuge indicado na declaração (nome omitido pela Teia)' } });
    }
    for (const item of declaration.ligacoes || []) {
      const label = [item.funcao, item.entidade].filter(Boolean).join(' — ');
      const base = { de: SUBJECT, inicio: item.inicio || item.data || '', fim: item.fim || '', declaradoEm, fonte: { ...fonte, citacao: label } };
      if (!item.entidade) {
        const cargo = classifyOffice(item.funcao);
        if (cargo.publico && cargo.ambito !== 'parlamento') {
          const body = addNode(graph, { id: `orgao:${normalizeName(item.funcao).slice(0, 80)}`, tipo: 'public-body', nome: item.funcao });
          addStatement(graph, { ...base, rel: 'cargo-publico', para: body, detalhe: item.funcao, cargo });
        } else if (!cargo.publico) addStatement(graph, { ...base, rel: 'atividade', para: '', detalhe: item.funcao });
        continue;
      }
      const cargo = classifyOffice(`${item.funcao || ''} ${item.entidade}`);
      const target = addNode(graph, { id: orgId(item.entidade), tipo: cargo.publico ? 'public-body' : 'org', nome: item.entidade, area: item.area || '', local: item.local || '' });
      if (item.tipo === 'sociedade') {
        addStatement(graph, { ...base, rel: 'participacao', para: target, detalhe: item.participacao ? `participação de ${item.participacao}` : 'participação social', percentagem: percent(item.participacao) });
      } else if (item.tipo === 'servico' || item.tipo === 'apoio') {
        addStatement(graph, { ...base, rel: item.tipo, para: target, detalhe: item.funcao || RELATIONS[item.tipo], data: item.data || '' });
      } else if (cargo.publico) {
        addStatement(graph, { ...base, rel: 'cargo-publico', para: target, detalhe: item.funcao || '', cargo });
      } else {
        addStatement(graph, { ...base, rel: 'cargo-privado', para: target, detalhe: item.funcao || (item.tipo === 'cargo' ? 'cargo' : 'função'), periodo: item.periodo || '' });
      }
    }
    for (const value of Object.values(declaration.textos || {})) texts.push(...(Array.isArray(value) ? value : [value]).filter(Boolean).map(String));
  }
  alvo.textosDeclarados = [...new Set([...(alvo.textosDeclarados || []), ...texts])].slice(0, 40);
  // Siglas declaradas («SP&M») ganham a forma por extenso que o próprio declarante escreveu noutro campo.
  for (const node of Object.values(graph.nos)) {
    if (node.tipo !== 'org') continue;
    for (const alias of expandAcronym(node.nome, alvo.textosDeclarados)) if (!node.nomes.includes(alias)) node.nomes.push(alias);
  }
  return graph;
}

const LEG_ROLE = { 'cargo-social': 'cargo-privado', cargo: 'cargo-privado', sociedade: 'participacao', servico: 'servico', apoio: 'apoio', atividade: 'atividade' };

// Quando o alvo é uma entidade: quem a declarou ao Parlamento (índice inverso) e em que legislaturas foi deputado.
export function addDeclarants(graph, entries, people = [], { recolhidoEm = new Date().toISOString() } = {}) {
  const byId = new Map(people.map((person) => [String(person.id), person]));
  const parliament = addNode(graph, { id: 'orgao:assembleia da republica', tipo: 'public-body', nome: 'Assembleia da República' });
  const ids = [];
  for (const entry of entries) {
    const person = byId.get(String(entry.pessoa));
    const nome = person?.np || person?.nome || `Deputado ${entry.pessoa}`;
    const node = addNode(graph, { id: `parl:${entry.pessoa}`, tipo: 'person', nome, nomes: [person?.nome].filter(Boolean), ids: { parlamento: String(entry.pessoa) } });
    const fonte = source('primaria', `Registo de interesses na Assembleia da República (${entry.leg} Legislatura)`, parliamentBiographyUrl(entry.pessoa), recolhidoEm, entry.entidade);
    ids.push(addStatement(graph, { de: node, rel: LEG_ROLE[entry.tipo] || 'atividade', para: SUBJECT, detalhe: cleanText(entry.entidade, 200), declaradoEm: entry.data || '', fonte }));
    for (const leg of person?.legs || [entry.leg]) {
      const [inicio, fim] = LEGISLATURES[leg] || [];
      if (!inicio) continue;
      addStatement(graph, { de: node, rel: 'cargo-publico', para: parliament, detalhe: `Deputado (${leg} Legislatura)`, inicio, fim, aproximado: true,
        cargo: classifyOffice('Deputado à Assembleia da República'), fonte: source('primaria', 'Assembleia da República — dados abertos', parliamentBiographyUrl(entry.pessoa), recolhidoEm) });
    }
  }
  return ids;
}

// Sigla inicial («SP&M, Sociedade…», «SP&M - Sousa…»): só letras, em minúsculas.
function leadingAcronym(name) {
  const first = cleanText(name).split(/[\s,]+/)[0] || '';
  const letters = first.replace(/[^\p{L}]/gu, '');
  return letters.length >= 2 && letters.length <= 6 && letters === letters.toUpperCase() && /[&.]/.test(first) ? normalizeName(letters).replace(/\s/g, '') : '';
}

// Duas denominações referem-se provavelmente à mesma entidade se os termos específicos da mais curta estão todos na mais longa,
// ou se começam pela mesma sigla.
export function orgNameMatch(a, b) {
  const acronym = leadingAcronym(a);
  if (acronym && acronym === leadingAcronym(b)) return true;
  const specific = (name) => nameTokens(name).filter((token) => token.length >= 3 && !GENERIC_TOKENS.has(token));
  const ta = specific(a);
  const tb = specific(b);
  if (!ta.length || !tb.length) return false;
  const [small, big] = ta.length <= tb.length ? [ta, new Set(nameTokens(b))] : [tb, new Set(nameTokens(a))];
  return small.join('').length >= 5 && small.every((token) => big.has(token));
}

const FORM_TOKENS = new Set(['sociedade', 'limitada', 'unipessoal', 'sgps', 'crl']);

// Candidato do registo com a mesma identidade? Mais exigente que orgNameMatch: todos os termos específicos de um dos nomes
// conhecidos têm de estar na denominação do registo («Oliveiras Gold de Portugal» não é «Oliveiras, S.A.»).
export function identityMatch(names, candidate) {
  const target = new Set(nameTokens(candidate));
  const acronym = leadingAcronym(candidate);
  return names.filter(Boolean).some((name) => {
    if (acronym && acronym === leadingAcronym(name)) return true;
    const specific = nameTokens(name).filter((token) => token.length >= 3 && !GENERIC_TOKENS.has(token) && !FORM_TOKENS.has(token));
    return specific.join('').length >= 5 && specific.every((token) => target.has(token));
  });
}

// Junta entidades só conhecidas por fontes secundárias à entidade já ligada por fonte oficial ou NIF. Fica registado em graph.fusoes.
export function consolidateOrgs(graph) {
  graph.fusoes = graph.fusoes || [];
  const touching = (id) => graph.afirmacoes.filter((item) => item.de === id || item.para === id);
  const strong = (node) => Boolean(node.ids?.nif) || touching(node.id).some((item) => item.fonte?.tipo === 'primaria' || item.fonte?.tipo === 'manual');
  const weak = Object.values(graph.nos).filter((node) => node.tipo === 'org' && node.id !== SUBJECT && touching(node.id).length && !strong(node));
  for (const node of weak) {
    const target = Object.values(graph.nos).find((other) => other.id !== node.id && ['org', 'public-body'].includes(other.tipo) && other.id !== SUBJECT
      && strong(other) && other.nomes.some((name) => node.nomes.some((mine) => orgNameMatch(name, mine))));
    if (!target) continue;
    graph.fusoes.push({ de: node.nome, para: target.id, nome: target.nome, motivo: 'denominação semelhante', em: new Date().toISOString() });
    mergeNodes(graph, target.id, node.id);
  }
  return graph.fusoes;
}

// Junta os candidatos das pesquisas por cada denominação de um nó. «coincide» marca nomes compatíveis com algum dos conhecidos;
// a escolha final é sempre do utilizador.
export function rankIdentityCandidates(node, results, limit = 6) {
  const merged = new Map();
  for (const result of results) {
    for (const candidate of result?.candidatos || []) {
      const entry = merged.get(candidate.id) || { ...candidate, pesquisas: 0 };
      entry.pontuacao = Math.max(entry.pontuacao || 0, candidate.pontuacao || 0);
      entry.pesquisas += 1;
      merged.set(candidate.id, entry);
    }
  }
  return [...merged.values()].map((entry) => ({ ...entry, coincide: identityMatch(node?.nomes || [node?.nome], entry.nome) }))
    .sort((a, b) => Number(b.coincide) - Number(a.coincide) || b.pontuacao - a.pontuacao || b.pesquisas - a.pesquisas || (b.contratos || 0) - (a.contratos || 0))
    .slice(0, limit);
}

const WIKIDATA_ROLE = { P39: 'cargo-publico', P102: 'partido', P108: 'cargo-privado', P463: 'membro', P1830: 'participacao', '~P112': 'cargo-privado',
  '~P127': 'participacao', '~P488': 'cargo-privado', '~P169': 'cargo-privado', '~P3320': 'cargo-privado', '~P1037': 'cargo-privado', '~P749': 'grupo' };
const WIKIDATA_DETAIL = { P108: 'empregador', P463: 'membro', P1830: 'proprietário', '~P112': 'fundador', '~P127': 'proprietário', '~P488': 'presidente',
  '~P169': 'diretor executivo', '~P3320': 'membro do conselho de administração', '~P1037': 'diretor', '~P749': 'empresa-mãe de' };
const ORG_INCOMING = { P112: 'fundador', P127: 'proprietário', P488: 'presidente', P169: 'diretor executivo', P3320: 'membro do conselho de administração', P1037: 'diretor', P749: 'empresa-mãe' };

export function addWikidata(graph, perfil, { recolhidoEm = new Date().toISOString() } = {}) {
  const alvo = graph.nos[SUBJECT];
  const fonte = source('secundaria', 'Wikidata', perfil.url, recolhidoEm);
  addNode(graph, { id: SUBJECT, nome: alvo.nome, nomes: [perfil.nome], ids: { wikidata: perfil.id } });
  Object.assign(alvo, {
    descricao: alvo.descricao || perfil.descricao || '', imagem: alvo.imagem || perfil.imagem || '',
    artigo: alvo.artigo || perfil.artigo || '', tituloArtigo: alvo.tituloArtigo || perfil.tituloArtigo || '',
  });
  const dead = perfil.afirmacoes.some((item) => item.p === 'P570');
  for (const item of perfil.afirmacoes) {
    if (item.p === 'P569') alvo.nascimento = item.valor;
    else if (item.p === 'P570') alvo.morte = item.valor;
    else if (item.p === 'P106') alvo.profissoes = [...new Set([...(alvo.profissoes || []), item.valor])];
    else if (item.p === 'P856') alvo.site = alvo.site || item.valor;
    else if (item.p === 'P159') alvo.sede = alvo.sede || item.valor;
    else if (item.p === 'P452') alvo.setores = [...new Set([...(alvo.setores || []), item.valor])];
    else if (item.p === 'P571') alvo.fundacao = item.valor;
    else if (item.p === 'P576') alvo.extincao = item.valor;
    else if (item.p === 'P1448') alvo.nomes.includes(item.valor) || alvo.nomes.push(item.valor);
    else if (ORG_INCOMING[item.p] && item.valorId) {
      const other = addNode(graph, { id: `wd:${item.valorId}`, tipo: item.p === 'P749' ? 'org' : 'person', nome: item.valor, ids: { wikidata: item.valorId } });
      addStatement(graph, { de: other, rel: item.p === 'P127' ? 'participacao' : item.p === 'P749' ? 'grupo' : 'cargo-privado', para: SUBJECT,
        detalhe: ORG_INCOMING[item.p], inicio: item.inicio || '', fim: item.fim || '', atual: !item.fim && !dead, fonte });
    } else if (WIKIDATA_ROLE[item.p]) {
      const rel = WIKIDATA_ROLE[item.p];
      const label = item.p === 'P39' ? [item.valor, item.de].filter(Boolean).join(' — ') : item.valor;
      const cargo = classifyOffice(label);
      const isParty = rel === 'cargo-privado' && /partido|social democrata|socialista|comunista/i.test(item.valor);
      const target = addNode(graph, { id: item.valorId ? `wd:${item.deId || item.valorId}` : orgId(item.valor),
        tipo: rel === 'cargo-publico' || isParty ? 'public-body' : 'org', nome: item.p === 'P39' && item.de ? item.de : item.valor, ids: item.valorId ? { wikidata: item.deId || item.valorId } : {} });
      addStatement(graph, {
        de: SUBJECT, rel: isParty ? 'partido' : rel, para: target, detalhe: isParty ? `${WIKIDATA_DETAIL[item.p] || ''} do partido`.trim() : (item.p === 'P39' ? item.valor : WIKIDATA_DETAIL[item.p] || RELATIONS[rel]),
        inicio: item.inicio || '', fim: item.fim || '', atual: !item.fim && !dead && Boolean(item.inicio), ...(rel === 'cargo-publico' ? { cargo } : {}), fonte,
      });
    }
  }
  return graph;
}

export function addSupplier(graph, nodeId, result, { fundamentos = [], recolhidoEm = new Date().toISOString(), pagina = '' } = {}) {
  const { perfil, nomes = {} } = result;
  addNode(graph, { id: nodeId, nome: graph.nos[nodeId]?.nome || perfil.nome, nomes: [perfil.nome, ...(perfil.nomes || [])], ids: { nif: /^\d{9}$/.test(result.id) ? result.id : undefined } });
  graph.nos[nodeId].contratosResumo = { n: perfil.n, v: perfil.v, d0: perfil.d0, d1: perfil.d1, pr: perfil.pr, anos: perfil.anos, omitidos: perfil.omitidos || 0 };
  const rows = (perfil.contratos || []).map((row) => unpackContract(row, fundamentos));
  graph.contratos[nodeId] = rows;
  for (const buyer of perfil.adjudicantes || []) {
    const nome = nomes[buyer.id] || buyer.id;
    const buyerNode = addNode(graph, { id: /^\d{9}$/.test(buyer.id) ? `nif:${buyer.id}` : `org:${buyer.id.replace(/^n:/, '')}`, tipo: 'public-body', nome, ids: /^\d{9}$/.test(buyer.id) ? { nif: buyer.id } : {}, esfera: classifyBuyer(nome) });
    const shown = rows.filter((row) => row.adjudicantes.includes(buyer.id));
    const ad = Object.values(buyer.anos || {}).reduce((sum, year) => [sum[0] + (year[2] || 0), sum[1] + (year[3] || 0)], [0, 0]);
    addStatement(graph, {
      de: nodeId, rel: 'fornece', para: buyerNode, detalhe: `${buyer.n} contrato${buyer.n === 1 ? '' : 's'}`, inicio: buyer.d0, fim: buyer.d1,
      n: buyer.n, valor: buyer.v, ajustesDiretos: ad[0], valorAjustesDiretos: ad[1], anos: buyer.anos || {}, contratos: shown.map((row) => row.id),
      fonte: source('primaria', 'Portal BASE (IMPIC), via fumaca-dados', shown[0]?.url || pagina || result.url, recolhidoEm),
    });
  }
  return rows;
}

export function addBuyer(graph, nodeId, result, { recolhidoEm = new Date().toISOString(), limit = 12 } = {}) {
  const { perfil, nomes = {} } = result;
  addNode(graph, { id: nodeId, nome: graph.nos[nodeId]?.nome || perfil.nome, ids: { nif: /^\d{9}$/.test(result.id) ? result.id : undefined }, esfera: classifyBuyer(perfil.nome) });
  graph.nos[nodeId].compras = { n: perfil.n, v: perfil.v, d0: perfil.d0, d1: perfil.d1, totalFornecedores: perfil.totalFornecedores };
  for (const supplier of (perfil.fornecedores || []).slice(0, limit)) {
    const nome = nomes[supplier.id] || supplier.id;
    const supplierNode = addNode(graph, { id: /^\d{9}$/.test(supplier.id) ? `nif:${supplier.id}` : `org:${supplier.id.replace(/^n:/, '')}`, tipo: 'org', nome, ids: /^\d{9}$/.test(supplier.id) ? { nif: supplier.id } : {} });
    const ad = Object.values(supplier.anos || {}).reduce((sum, year) => [sum[0] + (year[2] || 0), sum[1] + (year[3] || 0)], [0, 0]);
    addStatement(graph, { de: supplierNode, rel: 'fornece', para: nodeId, detalhe: `${supplier.n} contrato${supplier.n === 1 ? '' : 's'}`, inicio: supplier.d0, fim: supplier.d1,
      n: supplier.n, valor: supplier.v, ajustesDiretos: ad[0], valorAjustesDiretos: ad[1], anos: supplier.anos || {}, contratos: [],
      fonte: source('primaria', 'Portal BASE (IMPIC), via fumaca-dados', result.url, recolhidoEm) });
  }
}

const DECISION = [
  [/concess[aã]o|concession[aá]ri/i, 'concessão'], [/licen[cç]a|alvar[aá]|autoriza/i, 'licença ou autorização'],
  [/subs[ií]dio|apoio financeiro|incentivo|comparticipa|financiamento/i, 'apoio financeiro'], [/isen[cç][aã]o|benef[ií]cio fiscal/i, 'benefício fiscal'],
  [/adjudica|contrato|aditamento|acordo/i, 'contrato ou aditamento'], [/expropria/i, 'expropriação'], [/prorroga/i, 'prorrogação'],
  [/nomea|designa|exonera|cessa[cç][aã]o de fun/i, 'nomeação ou exoneração'], [/insolv|presta[cç][aã]o de contas/i, 'processo judicial'],
];

// Documentos do DR que nomeiam a entidade mas não são decisões do Estado sobre ela.
const NOT_DECISION = [
  [/ac[oó]rd[aã]o|senten[cç]a|supremo tribunal|tribunal (?:central|da rela|constitucional|administrativo|judicial)|^\s*\d+\s*$/i, 'jurisprudência'],
  [/acordo colec?tivo|contrato colec?tivo|acordo de empresa|portaria de extens|regulamenta[cç][aã]o (?:colectiva |coletiva )?do trabalho|conven[cç][aã]o colec?tiva/i, 'contratação coletiva'],
  [/^\s*parecer/i, 'parecer'],
];

export function classifyAct(item) {
  const text = `${item.tipo || ''} ${item.sumario || ''} ${item.titulo || ''}`;
  const emissor = cleanText(item.emissor);
  const societario = /societ/i.test(`${item.tipo || ''} ${item.conteudo || ''}`);
  const outro = societario ? '' : NOT_DECISION.find(([pattern], index) => pattern.test(index === 0 ? `${item.conteudo || ''} ${item.tipo || ''} ${emissor}` : `${item.conteudo || ''} ${item.tipo || ''}`))?.[1] || '';
  const decisao = outro || societario ? '' : DECISION.find(([pattern]) => pattern.test(text))?.[1] || '';
  const governo = /minist|gabinete d[oa] (?:ministr|secret[aá]ri|primeiro)|presid[eê]ncia do conselho de ministros|conselho de ministros|governo/i.test(`${emissor} ${item.tipo}`) && !/regional/i.test(emissor);
  const municipio = /^(?:munic[ií]pio|c[aâ]mara municipal)\s+d[eoa]s?\s+(.+)$/i.exec(emissor)?.[1] || '';
  return { decisao, governo, municipio, societario, ...(outro ? { outro } : {}), nomeacao: decisao === 'nomeação ou exoneração' };
}

export function addActs(graph, nodeId, response, { ligacao = 'nome', consulta = '' } = {}) {
  const ids = [];
  for (const item of response.itens || []) {
    const act = addNode(graph, { id: `dr:${item.id}`, tipo: 'act', nome: [item.tipo, item.numero].filter(Boolean).join(' ') || 'Publicação no Diário da República',
      data: item.data, serie: item.serie, emissor: item.emissor || '', sumario: item.sumario || item.titulo || '', url: item.url, empresa: item.empresa || '', concelho: item.concelho || '', conteudo: item.conteudo || '' });
    const excerto = (item.excertos || []).flat().join(' ');
    ids.push(addStatement(graph, { de: act, rel: 'ato', para: nodeId, data: item.data, detalhe: cleanText(item.sumario || item.titulo, 240), ligacao, consulta,
      classe: classifyAct(item), fonte: source('primaria', 'Diário da República', item.url, response.recolhidoEm, excerto || item.sumario) }));
  }
  graph.consultas.push({ fonte: 'dr', consulta, no: nodeId, ligacao, total: response.total ?? null, em: response.recolhidoEm });
  return ids;
}

const ACT_WORDS = new Set(['aditamento', 'contrato', 'despacho', 'determina', 'aprova', 'aprovacao', 'alteracao', 'procedimento', 'lancamento', 'atribuicao',
  'exclusivo', 'permanente', 'relativo', 'relativa', 'referente', 'publicacao', 'diario', 'republica', 'serie', 'aviso', 'anuncio', 'extrato', 'declaracao', 'retificacao', 'presente',
  'concursal', 'primeiro', 'segundo', 'terceiro', 'quarto', 'quinto', 'nos', 'termos', 'ambito', 'sobre', 'entre', 'pela', 'pelo', 'pelos', 'pelas']);

// «Seguir o objeto»: transforma o sumário de um ato numa pesquisa pelo assunto, para encontrar decisões que não nomeiam a entidade.
export function objectQuery(sumario, exclude = '') {
  const skip = new Set(nameTokens(exclude));
  const words = cleanText(sumario).replace(/[«»"“”().,;:]/g, ' ').split(/\s+/).filter(Boolean);
  const picked = [];
  words.forEach((word, index) => {
    const folded = normalizeName(word);
    if (!folded || folded.length < 4 || ACT_WORDS.has(folded) || STOPWORDS.has(folded) || skip.has(folded) || /^\d/.test(folded)) return;
    if (picked.some((item) => item.folded === folded)) return;
    // A maiúscula da primeira palavra é de início de frase, não de nome próprio.
    picked.push({ word, folded, proper: index > 0 && /^\p{Lu}/u.test(word) });
  });
  const proper = picked.filter((item) => item.proper).map((item) => item.word);
  const common = picked.filter((item) => !item.proper).map((item) => item.word);
  return [...common.slice(0, Math.max(3, 7 - proper.length)), ...proper.slice(0, 3)].join(' ').slice(0, 120);
}

// Um ponto só fica dentro de uma palavra se vier outra letra a seguir (S.A); assim «Spinumviva. Isto» não se junta.
const NAME_WORD = String.raw`(?:[\p{Lu}\d](?:[\p{L}\d'’]|\.(?=[\p{L}\d]))*(?:-[\p{L}\d]+)*|&)`;
const CONNECT = String.raw`(?:[^\S\n]*&[^\S\n]*|[^\S\n]+-[^\S\n]+|[^\S\n]+(?:e|de|da|do|dos|das|d')[^\S\n]+|[^\S\n]+)`;
const NAME = `${NAME_WORD}(?:${CONNECT}${NAME_WORD}){0,5}`;
const LEGAL_FORM = String.raw`(?:S\.\s?A\.?|SA|Lda\.?|Limitada|SGPS|Unipessoal|S\.\s?P\.?,?\s?R\.\s?L\.?|R\.\s?L\.?|RL|C\.?R\.?L\.?)`;
const TRIGGER = String.raw`(?<!C[oó]digo\s+d[ao]s?\s+)(?:[Ee]mpresas?|[Ss]ociedades?|[Ff]irma|[Gg]rupo(?!\s+[Pp]arlamentar)|[Cc]onsultora|[Cc]onstrutora|[Oo]peradora|[Hh]olding|[Cc]ompanhia|[Cc]adeia|[Ii]mobili[aá]ria|[Mm]arca)`;
const TRIGGER_TAIL = String.raw`(?:\s+(?:familiar|de advogados|de consultoria|portuguesa|privada|de constru[cç][aã]o|de comunica[cç][aã]o|detida|criada|fundada))*`;
const PATTERNS = [
  new RegExp(`(${NAME}),?\\s+${LEGAL_FORM}(?=[\\s,.;:)]|$)`, 'gu'),
  new RegExp(`${TRIGGER}${TRIGGER_TAIL}\\s+(?:(?:a|o|chamada|denominada|designada)\\s+)?(${NAME})`, 'gu'),
  new RegExp(`(?:denomina[cç][aã]o|denominada|designada)\\s+(${NAME})`, 'gu'),
];
const APPOSITION = new RegExp(`[,:;]\\s(?:a|o)\\s(${NAME})`, 'gu');
const NOT_ORG = new Set(['portugal', 'estado', 'governo', 'assembleia', 'republica', 'assembleia da republica', 'ministerio publico', 'codigo civil', 'primeiro ministro',
  'presidente', 'parlamento', 'psd', 'ps', 'cds', 'pcp', 'chega', 'be', 'il', 'livre', 'pan', 'uniao europeia', 'lisboa', 'porto', 'europa', 'tribunal constitucional',
  'janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro', 'grupo parlamentar',
  'conselho de ministros', 'presidencia do conselho de ministros']);
const FAMILY = /\b(?:mulher|esposa|marido|c[oô]njuge|filh[oa]s?|familiar(?:es)?|fam[ií]lia|pai|m[aã]e|irm[aã]o?s?|sogr[oa]|cunhad[oa])\b/i;
// Quem paga a quem: «avença de 4500 € da empresa Solverde», «clientes como a Solverde», «pagos pela X».
const PAYER = /(?:aven[cç]as?|pagamentos?|pag[oa]u|pagava|pagos? pel[ao]|cliente[s]?|honor[aá]rios|contratad[ao] pel[ao]|financiad[ao] pel[ao]|patroc[ií]nio|consultoria (?:a|à|ao|para))\b[^.]{0,70}$/i;
const FAMILY_FIRM = /empresa (?:familiar|da fam[ií]lia)|sua empresa|empresa d[ao] (?:mulher|marido|filh)/i;
const THEMES = [[/concess[aã]o|concession/i, 'concessão'], [/licen[cç]a|alvar[aá]|licenciamento/i, 'licença'], [/subs[ií]dio|apoio|incentivo|fundos/i, 'apoio'],
  [/contrato|adjudica|concurso/i, 'contrato']];

function trimName(name) {
  return name.replace(/(?:\s+(?:e|de|da|do|dos|das|d')|\s*[&-])+$/u, '').replace(/^(?:&|-)\s*/, '').trim();
}

function sentenceBounds(text, index) {
  const start = Math.max(text.lastIndexOf('. ', index) + 2, text.lastIndexOf('\n', index) + 1, 0);
  const endDot = text.indexOf('. ', index);
  const endLine = text.indexOf('\n', index);
  return [start, Math.min(endDot >= 0 ? endDot + 1 : text.length, endLine >= 0 ? endLine : text.length)];
}

function sentenceAround(text, index) {
  const [start, end] = sentenceBounds(text, index);
  return cleanText(text.slice(start, end), 320);
}

// «Sociedade de Investimentos Turísticos da Costa Verde» é a denominação que «Soc.Invest.Turis.Costa Verde» abrevia.
export function abbreviates(name, other) {
  const tokens = nameTokens(name);
  const others = nameTokens(other).filter((token) => token.length >= 3);
  return tokens.length >= 2 && others.length >= 2
    && tokens.every((token) => others.some((item) => item === token || (Math.min(token.length, item.length) >= 3 && (token.startsWith(item) || item.startsWith(token)))));
}

// Extrai denominações de organizações de texto corrido (legal-form, «a empresa X», aposições em frases sobre empresas).
// Com `entidade`, o texto é sobre uma organização: as suas denominações abreviadas ficam de fora e «empresa familiar»
// descreve quem a detém, não uma família do alvo.
export function extractOrganisations(text, { exclude = [], entidade = false } = {}) {
  const body = String(text || '');
  const excluded = new Set(exclude.flatMap((value) => [normalizeName(value), ...nameTokens(value)]));
  const found = new Map();
  const consider = (raw, index) => {
    const nome = trimName(raw);
    const key = normalizeName(nome);
    if (!key || key.length < 3 || NOT_ORG.has(key) || excluded.has(key)) return;
    if (key.split(' ').every((word) => excluded.has(word) || NOT_ORG.has(word))) return;
    if (entidade && exclude.some((value) => abbreviates(nome, value))) return;
    const entry = found.get(key) || { nome, indices: [] };
    entry.indices.push(index);
    found.set(key, entry);
  };
  for (const pattern of PATTERNS) for (const match of body.matchAll(pattern)) consider(match[1], match.index);
  for (const match of body.matchAll(APPOSITION)) {
    const sentence = sentenceAround(body, match.index);
    if (/\b(?:empresas?|sociedades?|grupo|setor|setores|ind[uú]stria|operadora|com[eé]rcio)\b/i.test(sentence)) consider(match[1], match.index);
  }
  const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const positions = new Map([...found.entries()].map(([key, entry]) => [key, [...body.matchAll(new RegExp(escape(entry.nome), 'g'))].map((m) => m.index)]));
  const entries = [...found.entries()].map(([key, entry]) => {
    const where = positions.get(key).length ? positions.get(key) : entry.indices;
    const mencoes = Math.max(entry.indices.length, where.length);
    let familia = false;
    let paga = null;
    let excerto = '';
    const temas = new Set();
    for (const pos of where) {
      const [start, end] = sentenceBounds(body, pos);
      const sentence = body.slice(start, end);
      const before = body.slice(Math.max(start, pos - 90), pos);
      const after = body.slice(pos + entry.nome.length, Math.min(end, pos + entry.nome.length + 60));
      for (const [pattern, tema] of THEMES) if (pattern.test(sentence)) temas.add(tema);
      const family = !entidade && (FAMILY.test(before.slice(-50)) || /^\s*,?\s*(?:a |uma )?(?:empresa |sociedade )?(?:familiar|da fam[ií]lia|detida pel[ao]s? (?:mulher|marido|filh|fam))/i.test(after));
      if (family && !familia) { familia = true; excerto = cleanText(sentence, 320); }
      if (!paga && PAYER.test(before)) {
        const other = [...found.entries()].find(([otherKey]) => otherKey !== key && positions.get(otherKey).some((p) => p >= start && p < end));
        paga = {
          para: other ? other[1].nome : !entidade && FAMILY_FIRM.test(sentence) ? '@familia' : '@alvo',
          inicio: /^[^.]{0,40}?\bdesde\s+((?:19|20)\d{2})\b/.exec(after)?.[1] || '',
          excerto: cleanText(sentence, 320),
        };
        excerto = paga.excerto;
      }
    }
    return { chave: key, nome: entry.nome, mencoes, excerto: excerto || sentenceAround(body, where[0]), familia, ...(paga ? { paga } : {}), temas: [...temas] };
  });
  // Junta «SP&M» e «SP&M - Sousa Pinheiro & Montenegro»: fica a forma mais longa.
  const result = [];
  for (const entry of entries.sort((a, b) => b.chave.length - a.chave.length)) {
    const longer = result.find((item) => ` ${item.chave} `.includes(` ${entry.chave} `));
    if (longer) {
      longer.mencoes = Math.max(longer.mencoes, entry.mencoes); longer.familia ||= entry.familia; longer.aliases = [...(longer.aliases || []), entry.nome];
      longer.paga ||= entry.paga; longer.temas = [...new Set([...longer.temas, ...entry.temas])];
    } else result.push(entry);
  }
  return result.sort((a, b) => b.mencoes - a.mencoes || a.nome.localeCompare(b.nome)).slice(0, 15);
}

// Menções conjuntas numa fonte secundária. Quando o texto diz quem paga a quem («avença da Solverde» à empresa familiar),
// fica também uma afirmação «cliente» entre as duas entidades: é a pista que liga o titular a decisões sobre terceiros.
export function addCoMentions(graph, mentions, fonte) {
  const ids = [];
  const nodeOf = new Map();
  for (const mention of mentions) {
    const node = addNode(graph, { id: orgId(mention.nome), tipo: 'org', nome: mention.nome, nomes: mention.aliases || [], ...(mention.temas?.length ? { temas: mention.temas } : {}) });
    nodeOf.set(mention.nome, node);
    for (const alias of mention.aliases || []) nodeOf.set(alias, node);
    ids.push(addStatement(graph, { de: SUBJECT, rel: 'co-mencao', para: node, detalhe: `${mention.mencoes} ${mention.mencoes === 1 ? 'menção' : 'menções'}`,
      mencoes: mention.mencoes, familia: mention.familia, fonte: { ...fonte, citacao: mention.excerto } }));
  }
  const family = mentions.filter((mention) => mention.familia).map((mention) => nodeOf.get(mention.nome));
  for (const mention of mentions.filter((item) => item.paga)) {
    const payer = nodeOf.get(mention.nome);
    const targets = mention.paga.para === '@familia' ? family.filter((id) => id !== payer) : mention.paga.para === '@alvo' ? [] : [nodeOf.get(mention.paga.para)].filter(Boolean);
    for (const target of targets.length ? targets : [SUBJECT]) {
      ids.push(addStatement(graph, { de: payer, rel: 'cliente', para: target, detalhe: 'pagamentos ou avenças noticiados', inicio: mention.paga.inicio,
        ...(mention.paga.para === '@familia' && targets.length ? { inferido: 'O texto fala na «empresa familiar»; associada à entidade familiar mencionada' } : {}),
        fonte: { ...fonte, citacao: mention.paga.excerto } }));
    }
  }
  return ids;
}

export function addManual(graph, { de = SUBJECT, para, nome, rel = 'manual', detalhe = '', inicio = '', fim = '', url = '', citacao = '', fonteNome = 'Registo manual' }) {
  const node = para || addNode(graph, { id: orgId(nome), tipo: 'org', nome });
  return addStatement(graph, { de, rel, para: node, detalhe: cleanText(detalhe, 300), inicio, fim,
    fonte: { tipo: 'manual', nome: cleanText(fonteNome, 200), url, recolhidoEm: new Date().toISOString(), ...(citacao ? { citacao: cleanText(citacao, 600) } : {}) } });
}

export function directAwardShare(rows) {
  const direct = rows.filter((row) => DIRECT_AWARD.has(row.procedimento));
  return { n: direct.length, valor: direct.reduce((sum, row) => sum + row.valor, 0), total: rows.length };
}

import { openReading } from './reading-dialog.js';
import { newDossier, addSource, restoreDossier, publicUrl, duplicateKeys, recordsCsv, dossierJson, recordUrl, csvTable, MAX_IMPORT_BYTES, REVIEW_STATES } from './proxy/investigation.mjs';
import { entityIndex, entitiesCsv, relationshipMap, relationshipsCsv } from './proxy/investigation-entities.mjs';
import { timelineEvents, timelinePage, timelineCsv } from './proxy/investigation-timeline.mjs';
import { FUNDING_SOURCES } from './proxy/investigation-funding.mjs';
import { HYPOTHESIS_STATES, EVIDENCE_ROLES, saveHypothesis } from './proxy/investigation-hypotheses.mjs';
import { chooseTrail, discoveryPage } from './proxy/investigation-discovery.mjs';
import { createTeia } from './teia.js?v=2';

const root = document.getElementById('investigation');
const h = (tag, props, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) if (child != null && child !== false) node.append(child);
  return node;
};
const labels = {
  unverified: 'Por verificar', 'source-checked': 'Conferido na origem', corroborated: 'Corroborado',
  contradicted: 'Contraditado', ambiguous: 'Identidade ambígua',
};
const STORE = 'investigation-dossier-v1';
const hypothesisLabels = { open: 'Em aberto', supported: 'Apoiada na avaliação manual', contested: 'Contestada na avaliação manual', discarded: 'Descartada na avaliação manual' };
const evidenceLabels = { supports: 'Apoia', contradicts: 'Contradiz', context: 'Contexto / alcance incerto' };
const hypothesesView = h('div', { class: 'investigation-hypotheses' });
let dossier = null, busy = false, controller = null, next = null, page = 0, entityPage = 0, storageWarning = '';
let mapFocus = '', mapPage = 0;
let chronologyPage = 0;
let activeWorkspace = 'start';
const workspacePanels = new Map();
const workspaceButtons = new Map();
const WORKSPACES = [
  ['start', 'Começar', 'Define a pergunta que orienta o dossiê.'],
  ['discover', 'Encontrar fontes', 'Pesquisa contratos/anúncios ou consulta recursos oficiais de fundos.'],
  ['import', 'Importar dados', 'Adiciona um ficheiro CSV/JSON e identifica a sua origem.'],
  ['records', 'Verificar registos', 'Filtra os dados, confere originais e justifica a revisão.'],
  ['entities', 'Entidades e mapa', 'Examina ocorrências e papéis declarados sem confundir identidades.'],
  ['timeline', 'Cronologia', 'Distingue datas declaradas, publicação e lacunas.'],
  ['notes', 'Notas e contraditório', 'Regista hipóteses, dúvidas e perguntas por esclarecer.'],
  ['preserve', 'Preservar e exportar', 'Guarda originais, exporta ou restaura um dossiê.'],
];
const workspaceHelp = h('p', { class: 'meta', id: 'investigation-workspace-help' });
let discoveryOffset = 0, trailOffset = 0;
const technical = h('div', { hidden: true, id: 'investigation-bench' });
const discovery = h('section', { id: 'investigation-discovery' });
const trailView = h('section', { id: 'investigation-trail', hidden: true });
const curiosity = h('textarea', { id: 'investigation-curiosity', maxlength: '500', rows: '3',
  placeholder: 'O que te intriga? Não precisas de ter uma hipótese pronta.' });
const anchor = h('input', { id: 'investigation-anchor', type: 'search', maxlength: '120',
  placeholder: 'Uma expressão, entidade ou tema: por exemplo, manutenção hospitalar',
  oninput: () => { discoveryOffset = 0; renderDiscovery(); } });
const scope = h('select', { id: 'investigation-scope' },
  h('option', { value: 'sns' }, 'Contratos na saúde, em Portugal'),
  h('option', { value: 'ted' }, 'Anúncios TED com compradores em Portugal'));
const discoveryCards = h('div', { class: 'investigation-discovery-cards' });
const trailCards = h('div');
const modeButtons = new Map();
const teia = createTeia();
const overview = h('div', { class: 'investigation-overview' });
function showMode(mode, focus = true) {
  teia.hidden = mode !== 'teia'; technical.hidden = mode !== 'bench'; discovery.hidden = mode !== 'explore'; trailView.hidden = mode !== 'trail';
  overview.hidden = mode === 'teia'; message.hidden = mode === 'teia';
  for (const [key, node] of modeButtons) key === mode ? node.setAttribute('aria-current', 'true') : node.removeAttribute('aria-current');
  const heading = { teia, bench: technical, trail: trailView, explore: discovery }[mode].querySelector('h2');
  if (focus) heading?.focus();
}
const modeNav = h('nav', { class: 'investigation-mode-navigation', 'aria-label': 'Percurso de investigação' },
  ...[['teia', 'Escrutinar'], ['explore', 'Explorar contratos'], ['trail', 'O meu fio'], ['bench', 'Bancada de dados']].map(([key, label]) => {
    const node = h('button', { type: 'button', 'aria-current': key === 'teia' ? 'true' : null,
      'aria-controls': { teia: teia.id, explore: discovery.id, trail: trailView.id, bench: technical.id }[key],
      onclick: () => showMode(key) }, label);
    modeButtons.set(key, node); return node;
  }));
const message = h('p', { role: 'status', 'aria-live': 'polite', class: 'investigation-status' }, 'Começa por uma pergunta de interesse público.');
const question = h('textarea', { rows: '2', maxlength: '500', placeholder: 'Que pergunta queres responder? Ex.: que contratos de manutenção celebrou esta entidade?', id: 'investigation-question' });
const query = h('input', { type: 'search', maxlength: '120', placeholder: 'Tema, empresa, entidade ou NIF organizacional', id: 'investigation-query' });
const collectionSource = h('select', { id: 'investigation-collection-source', onchange: () => { next = null; render(); } },
  h('option', { value: 'sns' }, 'Contratos na saúde — SNS / IMPIC'),
  h('option', { value: 'ted' }, 'Anúncios de contratação — TED (compradores em Portugal)'));
const filter = h('input', { type: 'search', placeholder: 'Filtrar os registos recolhidos…', 'aria-label': 'Filtrar registos', oninput: () => { page = 0; renderTable(); } });
const statusFilter = h('select', { 'aria-label': 'Estado de verificação', onchange: () => { page = 0; renderTable(); } },
  h('option', { value: '' }, 'Todos os estados'), REVIEW_STATES.map((state) => h('option', { value: state }, labels[state])));
const sourceName = h('input', { maxlength: '200', placeholder: 'Nome da fonte e editor', id: 'investigation-source-name' });
const sourceUrl = h('input', { type: 'url', placeholder: 'https://… (página de origem do ficheiro)', id: 'investigation-source-url' });
const saveLocal = h('input', { type: 'checkbox', id: 'investigation-local' });
const notes = h('textarea', { maxlength: '20000', rows: '4', id: 'investigation-notes', placeholder: 'Hipóteses, elementos contraditórios, lacunas e perguntas para contraditório.',
  onchange: () => {
    if (!dossier) return;
    try { const updated = { ...dossier, notes: notes.value }; dossierJson(updated); dossier = updated; persist(); }
    catch (error) { notes.value = dossier.notes; notify(error.message, true); }
  } });
const stats = h('p', { class: 'meta' });
const dossierQuestion = h('p', {});
const table = h('div', { class: 'investigation-table-wrap' });
const sources = h('div');
const entities = h('div', { class: 'investigation-entities' });
const entityFilter = h('input', { type: 'search', 'aria-label': 'Filtrar entidades por nome ou NIF',
  placeholder: 'Nome ou NIF nas ocorrências recolhidas…', oninput: () => { entityPage = 0; renderEntities(); } });
const mapFilter = h('input', { type: 'search', id: 'investigation-map-filter', placeholder: 'Nome ou NIF para centrar o mapa…',
  oninput: () => { mapPage = 0; renderMapChoices(); renderMap(); } });
const mapSelect = h('select', { id: 'investigation-map-entity', onchange: () => {
  mapFocus = mapSelect.value; mapPage = 0; renderMap();
} });
const mapChoices = h('p', { class: 'meta', role: 'status' });
const mapView = h('div', { class: 'investigation-map' });
const chronology = h('div', { class: 'investigation-timeline' });
const resetTimeline = () => { chronologyPage = 0; renderTimeline(); };
const chronologyFilter = h('input', { type: 'search', id: 'investigation-timeline-filter', placeholder: 'Objeto, entidade, fonte ou data original…', oninput: resetTimeline });
const chronologyKind = h('select', { id: 'investigation-timeline-kind', onchange: resetTimeline },
  h('option', { value: '' }, 'Todos os tipos'),
  h('option', { value: 'date' }, 'Celebração / data declarada'),
  h('option', { value: 'published' }, 'Publicação'));
const chronologyState = h('select', { id: 'investigation-timeline-state', onchange: resetTimeline },
  h('option', { value: '' }, 'Datas e lacunas'),
  h('option', { value: 'dated' }, 'Com dia reconhecido'),
  h('option', { value: 'undated' }, 'Sem dia ordenável'));
const chronologyOrder = h('select', { id: 'investigation-timeline-order', onchange: resetTimeline },
  h('option', { value: 'asc' }, 'Mais antigo primeiro'),
  h('option', { value: 'desc' }, 'Mais recente primeiro'));
const catalog = h('div', { class: 'investigation-catalog' });
const fundingSelect = h('select', { id: 'investigation-funding-source' },
  ...FUNDING_SOURCES.map((source) => h('option', { value: source.key }, source.title)));
const fundingResults = h('div', { class: 'investigation-funding' });
const actions = [];
const button = (text, handler) => {
  const node = h('button', { type: 'button', onclick: handler }, text);
  actions.push(node);
  return node;
};
const notify = (text, error = false) => {
  message.textContent = text + (storageWarning ? ` ${storageWarning}` : '');
  message.classList.toggle('error', error || !!storageWarning);
};
function persist() {
  if (!saveLocal.checked || !dossier) return;
  try { localStorage.setItem(STORE, dossierJson(dossier)); storageWarning = ''; }
  catch {
    storageWarning = 'Não foi possível guardar no navegador. O dossiê continua nesta sessão: exporta JSON para não o perder.';
    notify('Falha de preservação local.', true);
  }
}
function startDossier() {
  if (!dossier) dossier = newDossier(question.value);
  else if (question.value.trim() !== dossier.question) throw new Error('A pergunta mudou. Usa «Atualizar pergunta» antes de recolher.');
}
function download(text, filename, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = h('a', { href: url, download: filename });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function render() {
  for (const action of actions) action.disabled = busy;
  question.disabled = busy;
  query.disabled = busy;
  collectionSource.disabled = busy;
  curiosity.disabled = busy; anchor.disabled = busy; scope.disabled = busy;
  fundingSelect.disabled = busy;
  sourceName.disabled = busy;
  sourceUrl.disabled = busy;
  file.disabled = busy;
  backup.disabled = busy;
  notes.disabled = busy || !dossier;
  more.disabled = busy || !next;
  cancel.disabled = !controller;
  stats.textContent = dossier
    ? `${dossier.records.length} registos · ${dossier.sources.length} lotes/fontes · ${dossier.records.filter((record) => record.status === 'unverified').length} por verificar. Montantes e datas são valores da fonte, sem conversão ou soma automática.`
    : 'Nenhum registo recolhido. Sem recolha automática ao abrir a ferramenta.';
  dossierQuestion.textContent = dossier ? `Pergunta do dossiê: ${dossier.question}` : 'Ainda não há dossiê nesta sessão.';
  sources.replaceChildren(...(dossier?.sources || []).map((source) => h('article', { class: 'investigation-source' },
    h('strong', {}, source.name), h('p', {}, h('a', { href: source.url, target: '_blank', rel: 'noopener noreferrer' }, 'Abrir origem')),
    h('p', { class: 'meta' }, `Recolha: ${source.collectedAt} · ${source.method} · SHA-256: ${source.hash}`),
    source.query ? h('p', { class: 'meta' }, `Pesquisa: ${source.query} · correspondências indicadas pela API nesse momento: ${source.total}. Não é cobertura nacional nem uma fotografia completa.`) : null,
    source.requestBody ? h('details', {}, h('summary', {}, 'Pedido POST original à API TED'),
      h('pre', { class: 'investigation-raw' }, JSON.stringify(source.requestBody, null, 2))) : null,
    h('button', { type: 'button', onclick: () => download(source.rawText, `origem-${source.hash.slice(0, 12)}.${source.format === 'ted-json' ? 'json' : source.format}`, 'text/plain;charset=utf-8') }, 'Descarregar original'))));
  renderTable();
  renderEntities();
  renderMapChoices();
  renderMap();
  renderTimeline();
  renderHypotheses();
  renderDiscovery();
  renderTrail();
}

function startDiscovery() {
  if (busy) return;
  try {
    const fresh = newDossier(curiosity.value);
    const updated = dossier ? { ...dossier, question: fresh.question } : fresh;
    dossierJson(updated); dossier = updated; question.value = dossier.question;
    query.value = anchor.value; collectionSource.value = scope.value; next = null; discoveryOffset = 0;
    persist(); request(scope.value);
  } catch (error) { notify(error.message, true); }
}

function renderDiscovery() {
  const result = discoveryPage(dossier || { records: [] }, anchor.value, discoveryOffset);
  discoveryOffset = result.page;
  discoveryCards.replaceChildren(
    h('h3', {}, dossier?.records.length ? 'Por onde queres começar a puxar o fio?' : 'Ainda não procurámos pistas'),
    h('p', {}, !dossier?.records.length ? 'Escreve a tua curiosidade e uma expressão curta para uma primeira procura. Não recolhemos nada ao abrir.'
      : !result.available ? 'Não há pistas visíveis para esta expressão. Ajusta-a, consulta outra fonte ou revê as escolhas deixadas de lado no teu fio.'
        : 'Três portas de entrada, não três conclusões. Escolhe uma para ler com atenção.'),
    ...result.records.map((record) => {
      const source = dossier.sources.find(({ id }) => id === record.sourceId);
      const choice = dossier.trail?.find(({ recordId }) => recordId === record.id);
      return h('article', { class: 'investigation-discovery-card' },
        h('p', { class: 'meta' }, source.format === 'ted-json' ? 'Um anúncio a compreender' : 'Um registo a compreender'),
        h('h3', {}, record.fields.title),
        h('p', {}, `Comprador declarado: ${record.fields.buyer || 'não indicado'}`),
        h('p', { class: 'meta' }, `Encontrado em ${source.name}. ${choice ? `No teu fio: ${trailLabels[choice.state]}.` : 'Ainda não escolheste seguir esta pista.'}`),
        h('button', { type: 'button', disabled: busy, onclick: () => openDiscovery(record.id) }, 'Abrir esta pista'));
    }),
    h('details', {}, h('summary', {}, 'O que estás a ver — e o que fica de fora'),
      stats.cloneNode(true),
      h('p', {}, `${result.total} registos contêm a expressão nos campos locais; ${result.aside} deixados de lado por ti. Alternamos lotes e apresentamos primeiro combinações diferentes de objeto/comprador/adjudicatária; as descrições repetidas vêm depois, sem apagar ou fundir registos. Mostramos até três. Não há ranking de importância, irregularidade ou verdade; nomes iguais não demonstram identidade e lotes não são fontes independentes.`),
      h('p', {}, 'A pesquisa inicial é a expressão que escolheste, não uma interpretação automática da tua curiosidade. SNS cobre apenas saúde; TED contém anúncios, não contratos celebrados. Ausência nesta seleção não demonstra ausência de contratos ou relações.'),
      ...(dossier?.sources || []).map((source) => h('p', { class: 'meta' }, `${source.name}: termo «${source.query || 'importação local'}» · recolha ${source.collectedAt} · API indicou ${source.total ?? 'contagem não disponível'} correspondências nesse momento.`))),
    h('div', { class: 'investigation-actions' },
      h('button', { type: 'button', disabled: busy || !result.page, onclick: () => { discoveryOffset--; renderDiscovery(); } }, 'Pistas anteriores'),
      h('button', { type: 'button', disabled: busy || result.page + 1 >= result.pageCount, onclick: () => { discoveryOffset++; renderDiscovery(); } }, 'Outras três pistas'),
      h('span', { class: 'meta' }, `Seleção ${result.page + 1} de ${result.pageCount}`)));
}
const trailLabels = { follow: 'Quero seguir', question: 'Tenho dúvidas', aside: 'Deixei de lado' };
function renderTrail() {
  const trail = dossier?.trail || [];
  trailOffset = Math.min(trailOffset, Math.max(0, Math.ceil(trail.length / 6) - 1));
  trailCards.replaceChildren(
    h('p', {}, trail.length ? 'Estas são as escolhas que fizeste, não factos confirmados. Incluímos dúvidas e pistas deixadas de lado para não apagar o caminho.' : 'O fio começa quando escolhes uma pista e explicas o que te interessa ou te faz duvidar.'),
    ...trail.slice(trailOffset * 6, (trailOffset + 1) * 6).map((item) => {
      const record = dossier.records.find(({ id }) => id === item.recordId);
      return h('article', { class: 'investigation-discovery-card' }, h('h3', {}, record.fields.title),
        h('p', { class: 'meta' }, trailLabels[item.state]), h('p', { class: 'investigation-trail-note' }, item.note),
        h('button', { type: 'button', disabled: busy, onclick: () => openDiscovery(item.recordId) }, 'Retomar esta pista'));
    }),
    h('div', { class: 'investigation-actions' },
      h('button', { type: 'button', disabled: busy || !trailOffset, onclick: () => { trailOffset--; renderTrail(); } }, 'Escolhas anteriores'),
      h('button', { type: 'button', disabled: busy || (trailOffset + 1) * 6 >= trail.length, onclick: () => { trailOffset++; renderTrail(); } }, 'Mais escolhas')));
}
function openDiscovery(id) {
  const record = dossier.records.find((record) => record.id === id);
  const source = dossier.sources.find(({ id }) => id === record.sourceId);
  const previous = dossier.trail?.find(({ recordId }) => recordId === id);
  const state = h('select', { id: 'discovery-choice' }, ...Object.entries(trailLabels).map(([value, label]) => h('option', { value }, label)));
  state.value = previous?.state || 'follow';
  const note = h('textarea', { id: 'discovery-reason', rows: '3', maxlength: '3000', placeholder: 'O que queres perceber aqui? Que explicação alternativa pode existir?' });
  note.value = previous?.note || '';
  const feedback = h('p', { role: 'status' });
  const content = h('div', { class: 'investigation-hypothesis-editor' },
    h('h3', {}, 'O que a fonte declara'),
    h('p', {}, record.fields.title),
    ...[['Comprador', record.fields.buyer], ['Adjudicatária', record.fields.supplier], ['Preço declarado', record.fields.amount],
      ['Data do registo', record.fields.date], ['Publicação', record.fields.published]].filter(([, value]) => value).map(([label, value]) => h('p', {}, `${label}: ${value}`)),
    h('p', { class: 'meta' }, `${source.name} · linha ${record.row} · ${labels[record.status]}`),
    h('h3', {}, 'O que ainda não sabemos'),
    h('p', {}, source.format === 'ted-json' ? 'Este anúncio não comprova celebração, fornecedor, pagamento ou execução.'
      : 'Este registo não comprova execução, despesa efetivamente paga, identidade dos titulares ou irregularidade. Confere o significado das datas e dos valores.'),
    h('p', {}, 'Antes de seguir a intuição: que contexto falta? O que poderia contrariar a tua leitura? A mesma informação noutra fonte pode ter a mesma origem.'),
    h('a', { href: recordUrl(record, source), target: '_blank', rel: 'noopener noreferrer' }, 'Ler na fonte original'),
    h('button', { type: 'button', onclick: () => inspect(id, () => openReading('Explorar uma pista', content)) }, 'Conferir os campos originais e rever'),
    h('details', {}, h('summary', {}, 'Seguir uma menção — sem presumir identidade'),
      h('p', {}, 'Procura explícita na fonte escolhida. Um nome igual não confirma identidade. Usa o NIF organizacional na bancada se precisar de distinguir homónimos.'),
      ...[...new Set([record.fields.buyer, record.fields.supplier])].filter((name) => name && name.length <= 120 && !/[|;\n]/.test(name)).map((name) =>
        h('button', { type: 'button', onclick: () => {
          anchor.value = name; query.value = name; collectionSource.value = scope.value; next = null; discoveryOffset = 0;
          document.querySelector('dialog[open]').close(); showMode('explore'); request(scope.value);
        } }, `Procurar «${name}»`))),
    h('h3', {}, 'O que queres fazer com esta pista?'),
    h('p', { class: 'meta' }, 'Guarda a escolha antes de fechar ou seguir uma menção. As palavras que escreves aqui não são enviadas à fonte.'),
    h('label', { for: state.id }, 'A tua escolha, não uma avaliação automática'), state,
    h('label', { for: note.id }, 'Guardar o motivo e a próxima pergunta'), note,
    h('button', { type: 'button', onclick: () => {
      try {
        const updated = chooseTrail(dossier, id, state.value, note.value);
        dossierJson(updated); dossier = updated; persist(); render();
        feedback.textContent = 'Escolha guardada no fio desta sessão. Exporta o dossiê para preservar.';
        notify('Fio atualizado; a revisão do registo não foi alterada.');
      } catch (error) { feedback.textContent = error.message; }
    } }, 'Guardar no meu fio'), feedback);
  openReading('Explorar uma pista', content);
}
function renderTable() {
  const normal = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const term = normal(filter.value);
  const records = (dossier?.records || []).filter((record) => (!statusFilter.value || record.status === statusFilter.value)
    && normal(Object.values(record.fields).join(' ')).includes(term));
  const duplicates = duplicateKeys(dossier?.records || []);
  page = Math.min(page, Math.max(0, Math.ceil(records.length / 50) - 1));
  const visible = records.slice(page * 50, page * 50 + 50);
  table.replaceChildren(
    h('p', { class: 'meta' }, `${records.length} correspondências locais. Registos idênticos são assinalados, não apagados; nomes e NIFs não são fundidos automaticamente.`),
    h('table', {}, h('caption', {}, 'Contratos e registos — valores declarados pelas fontes'),
      h('thead', {}, h('tr', {}, ['Objeto / anúncio', 'Adjudicante / NIF', 'Adjudicatária / NIF', 'Preço declarado', 'Celebração / publicação', 'Revisão'].map((text) => h('th', { scope: 'col' }, text)))),
      h('tbody', {}, visible.map((record) => h('tr', {},
        h('td', {}, record.fields.title || 'Objeto não indicado',
          dossier.sources.find((source) => source.id === record.sourceId).format === 'ted-json' ? h('p', { class: 'meta' }, 'Anúncio TED — não comprova contrato celebrado.') : null,
          duplicates.has(record.id) ? h('p', { class: 'meta' }, 'Registo idêntico presente noutro lote; conferir.') : null),
        h('td', {}, record.fields.buyer || 'Não indicado', h('p', { class: 'meta' }, record.fields.buyerId || 'NIF não indicado')),
        h('td', {}, record.fields.supplier || 'Não indicada', h('p', { class: 'meta' }, record.fields.supplierId || 'NIF não indicado')),
        h('td', {}, record.fields.amount || 'Não indicado'),
        h('td', {}, record.fields.date || 'Não indicada', h('p', { class: 'meta' }, record.fields.published || 'Publicação não indicada')),
        h('td', {}, labels[record.status], h('button', { type: 'button', disabled: busy, onclick: () => inspect(record.id) }, 'Ver registo e rever')))))),
    records.length ? h('nav', { 'aria-label': 'Páginas de registos' },
      h('button', { type: 'button', disabled: page === 0, onclick: () => { page--; renderTable(); } }, 'Anterior'),
      ` Página ${page + 1} de ${Math.ceil(records.length / 50)} `,
      h('button', { type: 'button', disabled: (page + 1) * 50 >= records.length, onclick: () => { page++; renderTable(); } }, 'Seguinte')) : h('p', {}, 'Sem registos neste filtro.'));
}
function renderEntities() {
  if (!dossier?.records.length) { entities.replaceChildren(h('p', {}, 'Importa ou recolhe registos para examinar as entidades declaradas.')); return; }
  const all = entityIndex(dossier);
  const term = entityFilter.value.toLocaleLowerCase();
  const groups = all.filter((group) => `${group.nif || ''} ${group.names.join(' ')} ${group.occurrences.map(({ rawId }) => rawId).join(' ')}`.toLocaleLowerCase().includes(term));
  entityPage = Math.min(entityPage, Math.max(0, Math.ceil(groups.length / 50) - 1));
  entities.replaceChildren(h('p', { class: 'meta' }, `${groups.length} grupos/ocorrências neste filtro. Os números contam registos e lotes, não contratos únicos ou fontes independentes.`),
    ...groups.slice(entityPage * 50, entityPage * 50 + 50).map((group) => h('article', { class: 'investigation-source' },
      h('strong', {}, group.names.join(' / ') || 'Designação não indicada'),
      h('p', {}, group.nif ? `NIF declarado ${group.nif} — formato e dígito de controlo válidos; identidade não confirmada.`
        : 'Ocorrência isolada — sem agrupamento por identidade.'),
      h('p', { class: 'meta' }, `${group.recordCount} registos · ${group.sourceCount} lotes. Nenhum estado de revisão foi alterado pelo cruzamento.`),
      group.warnings.map((warning) => h('p', { class: 'meta' }, warning)),
      h('button', { type: 'button', disabled: busy, onclick: () => inspectEntity(group.key) }, 'Examinar ocorrências e fontes'),
      h('button', { type: 'button', disabled: busy, onclick: () => {
        focusMap(group.key); mapSelect.scrollIntoView({ block: 'center' }); mapSelect.focus();
      } }, 'Ver no mapa'))),
    ...(groups.length ? [h('nav', { 'aria-label': 'Páginas de entidades' },
      h('button', { type: 'button', disabled: !entityPage, onclick: () => { entityPage--; renderEntities(); } }, 'Anterior'),
      ` Página ${entityPage + 1} de ${Math.ceil(groups.length / 50)} `,
      h('button', { type: 'button', disabled: (entityPage + 1) * 50 >= groups.length, onclick: () => { entityPage++; renderEntities(); } }, 'Seguinte'))] : [h('p', {}, 'Sem entidades neste filtro.')]));
}

function renderMapChoices() {
  const term = mapFilter.value.trim().toLocaleLowerCase('pt');
  const groups = (dossier ? entityIndex(dossier) : []).filter((group) =>
    `${group.names.join(' ')} ${group.nif || ''}`.toLocaleLowerCase('pt').includes(term));
  if (!groups.some(({ key }) => key === mapFocus)) { mapFocus = groups[0]?.key || ''; mapPage = 0; }
  const visible = groups.slice(0, 50);
  const selected = groups.find(({ key }) => key === mapFocus);
  if (selected && !visible.includes(selected)) visible.unshift(selected);
  mapSelect.replaceChildren(...visible.map((group) => h('option', { value: group.key },
    `${group.names[0] || 'Sem designação'} · ${group.nif || 'ocorrência isolada'}`)));
  mapSelect.value = mapFocus;
  mapSelect.disabled = busy || !visible.length;
  mapFilter.disabled = busy;
  mapChoices.textContent = `${groups.length} grupos correspondentes; ${visible.length} na seleção. Usa a pesquisa para encontrar os restantes. Nomes semelhantes continuam separados.`;
}

function focusMap(key) {
  mapFocus = key; mapPage = 0; mapFilter.value = '';
  renderMapChoices(); renderMap();
  mapSelect.focus({ preventScroll: true });
}

function renderMap() {
  if (!dossier || !mapFocus) {
    mapView.replaceChildren(h('p', {}, 'Sem entidades para este mapa. Recolhe/importa registos com entidades ou ajusta a pesquisa.'));
    return;
  }
  const map = relationshipMap(dossier, mapFocus, mapPage);
  mapPage = map.page;
  const height = Math.max(240, map.records.length * 110 + 60);
  const canvas = h('div', { class: 'investigation-map-canvas', style: `height:${height}px` });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 960 ${height}`);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  canvas.append(svg);
  const positions = new Map();
  positions.set(map.focus.key, { x: 20, y: height / 2 });
  map.records.forEach((record, index) => positions.set(`record:${record.id}`, { x: 360, y: 85 + index * 110 }));
  const others = map.entities.filter(({ key }) => key !== map.focus.key);
  others.forEach((group, index) => positions.set(group.key, { x: 700, y: 60 + (index + .5) * (height - 120) / others.length }));
  for (const edge of map.edges) {
    const entity = positions.get(edge.groupKey), record = positions.get(`record:${edge.recordId}`);
    const left = entity.x < record.x;
    const fromX = left ? entity.x + 240 : record.x + 240;
    const toX = left ? record.x : entity.x;
    const fromY = (left ? entity.y : record.y) + (edge.role === 'buyer' ? -8 : 8);
    const toY = (left ? record.y : entity.y) + (edge.role === 'buyer' ? -8 : 8);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    line.setAttribute('d', `M${fromX},${fromY} C${(fromX + toX) / 2},${fromY} ${(fromX + toX) / 2},${toY} ${toX},${toY}`);
    line.setAttribute('class', `investigation-map-edge ${edge.role}`);
    svg.append(line);
  }
  const node = (key, title, subtitle, kind, onclick) => {
    const position = positions.get(key);
    canvas.append(h('button', { type: 'button', class: `investigation-map-node ${kind}`, disabled: busy,
      style: `left:${position.x}px;top:${position.y - 35}px`, title: `${title} — ${subtitle}`,
      'aria-label': `${title} — ${subtitle}`, onclick },
    h('strong', {}, title), h('span', {}, subtitle)));
  };
  for (const group of map.entities) {
    node(group.key, group.names[0] || 'Sem designação',
      `${group.nif ? `NIF ${group.nif}` : 'Ocorrência isolada'} · ${group.key === map.focus.key ? 'examinar' : 'centrar'}`,
      'entity', () => group.key === map.focus.key ? inspectEntity(group.key) : focusMap(group.key));
  }
  for (const record of map.records) {
    const source = dossier.sources.find(({ id }) => id === record.sourceId);
    node(`record:${record.id}`, record.fields.title,
      `${source.format === 'ted-json' ? 'Anúncio TED' : 'Registo'} · ${labels[record.status]} · rever`,
      'record', () => inspect(record.id));
  }
  const groupByKey = new Map(map.entities.map((group) => [group.key, group]));
  const evidence = h('details', {}, h('summary', {}, 'Ligações desta página em lista: papéis, fontes e revisão'),
    ...map.records.map((record) => {
      const source = dossier.sources.find(({ id }) => id === record.sourceId);
      return h('article', { class: 'investigation-source' },
        h('strong', {}, record.fields.title),
        h('p', { class: 'meta' }, `${source.name} · linha ${record.row} · ${source.collectedAt} · ${labels[record.status]}`),
        ...map.edges.filter(({ recordId }) => recordId === record.id).map((edge) => h('p', {},
          `${edge.role === 'buyer' ? 'Comprador/adjudicante' : 'Adjudicatária'} declarado: ${edge.name || 'sem designação'} · identificador original: ${edge.rawId || 'não indicado'}. `,
          h('button', { type: 'button', disabled: busy, onclick: () => inspectEntity(edge.groupKey) }, 'Examinar entidade'),
          ...groupByKey.get(edge.groupKey).warnings.map((warning) => h('span', { class: 'meta' }, ` ${warning}`)))),
        h('a', { href: recordUrl(record, source), target: '_blank', rel: 'noopener noreferrer' }, 'Conferir registo na fonte'),
        h('button', { type: 'button', disabled: busy, onclick: () => inspect(record.id) }, 'Rever registo'));
    }));
  mapView.replaceChildren(
    h('p', { role: 'status' }, `${map.totalRecords} registos ligados ao centro · ${map.records.length} nesta página · ${map.edges.length} papéis declarados. Página ${map.page + 1} de ${map.pageCount}. Duplicados não são apagados; lotes não são fontes independentes.`),
    ...map.focus.warnings.map((warning) => h('p', { class: 'meta' }, warning)),
    h('p', { class: 'meta' }, 'Entidades nos lados; registos no meio. Linha contínua: comprador/adjudicante. Tracejada: adjudicatária. Seleciona um registo para rever; outra entidade para centrar. Linhas não demonstram propriedade, influência ou irregularidade.'),
    h('div', { class: 'investigation-map-scroll', tabindex: '0', role: 'region', 'aria-label': 'Mapa de ligações com deslocação horizontal' }, canvas),
    h('nav', { 'aria-label': 'Páginas do mapa', class: 'investigation-actions' },
      h('button', { type: 'button', disabled: busy || !map.page, onclick: () => { mapPage--; renderMap(); } }, 'Registos anteriores'),
      h('button', { type: 'button', disabled: busy || map.page + 1 >= map.pageCount, onclick: () => { mapPage++; renderMap(); } }, 'Registos seguintes')),
    evidence);
}

function renderTimeline() {
  for (const control of [chronologyFilter, chronologyKind, chronologyState, chronologyOrder]) control.disabled = busy;
  const result = timelinePage(dossier ? timelineEvents(dossier) : [], {
    term: chronologyFilter.value, kind: chronologyKind.value, state: chronologyState.value,
    direction: chronologyOrder.value, page: chronologyPage,
  });
  chronologyPage = result.page;
  const states = { missing: 'Data ausente', invalid: 'Data inválida', unresolved: 'Data por esclarecer' };
  chronology.replaceChildren(
    h('p', { role: 'status' }, `${result.total} acontecimentos/campos correspondentes · ${result.dated} com dia reconhecido · ${result.undated} lacunas sem dia ordenável. Página ${result.page + 1} de ${result.pageCount}.`),
    ...(!result.total ? [h('p', {}, 'Sem acontecimentos para estes filtros. Recolhe/importa registos ou ajusta a pesquisa.')] : []),
    h('ol', { class: 'investigation-timeline-list' }, ...result.events.map((event) => h('li', { class: 'investigation-source' },
      h('strong', {}, event.day || states[event.state]), ' · ', event.label,
      h('p', {}, event.title),
      h('p', { class: 'meta' }, `Data original: ${event.original || 'não indicada'} · ${event.recordKind === 'notice' ? 'Anúncio, não contrato celebrado' : 'Registo importado'} · ${labels[event.status]}`),
      ...event.warnings.map((warning) => h('p', { class: 'meta' }, warning)),
      h('p', { class: 'meta' }, `${event.sourceName} · linha ${event.row} · recolha ${event.collectedAt} (não é data do acontecimento)`),
      h('details', {}, h('summary', {}, 'Identificador e integridade da origem'),
        h('p', { class: 'meta' }, `Registo: ${event.recordId} · fonte: ${event.sourceId} · SHA-256: ${event.hash}`)),
      h('div', { class: 'investigation-actions' },
        h('a', { href: event.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Conferir na fonte'),
        h('button', { type: 'button', disabled: busy, onclick: () => inspect(event.recordId) }, 'Rever registo e originais'))))),
    h('nav', { 'aria-label': 'Páginas da cronologia', class: 'investigation-actions' },
      h('button', { type: 'button', disabled: busy || !result.page, onclick: () => { chronologyPage--; renderTimeline(); } }, 'Acontecimentos anteriores'),
      h('button', { type: 'button', disabled: busy || result.page + 1 >= result.pageCount, onclick: () => { chronologyPage++; renderTimeline(); } }, 'Acontecimentos seguintes')));
}

function renderHypotheses() {
  hypothesesView.replaceChildren(...(dossier?.hypotheses || []).map((hypothesis) => h('article', { class: 'investigation-source' },
    h('h3', {}, hypothesis.statement), h('p', {}, hypothesisLabels[hypothesis.assessment]),
    h('p', { class: 'meta' }, `${hypothesis.evidence.length} registos ligados. Quantidade de ligações não mede força da prova ou independência das fontes.`),
    h('p', {}, `Justificação: ${hypothesis.rationale || 'por preencher'}`),
    h('p', {}, `Lacunas: ${hypothesis.gaps || 'não registadas; não significa que não existam'}`),
    h('p', {}, `Perguntas para contraditório: ${hypothesis.questions || 'por preparar'}`),
    h('button', { type: 'button', disabled: busy, onclick: () => editHypothesis(hypothesis.id) }, 'Examinar e editar hipótese'))));
  if (!dossier?.hypotheses?.length) hypothesesView.append(h('p', {}, 'Ainda não há hipóteses estruturadas. As notas livres abaixo permanecem intactas.'));
}

function editHypothesis(id) {
  if (!dossier) { notify('Define primeiro a pergunta do dossiê na área Começar.', true); return; }
  const draft = id ? structuredClone(dossier.hypotheses.find((hypothesis) => hypothesis.id === id)) : {
    id: crypto.randomUUID(), statement: '', assessment: 'open', rationale: '', gaps: '', questions: '', evidence: [],
  };
  const statement = h('textarea', { id: 'hypothesis-statement', maxlength: '1000', rows: '3' }); statement.value = draft.statement;
  const assessment = h('select', { id: 'hypothesis-assessment' }, ...HYPOTHESIS_STATES.map((state) => h('option', { value: state }, hypothesisLabels[state])));
  assessment.value = draft.assessment;
  const fields = Object.fromEntries(['rationale', 'gaps', 'questions'].map((key) => {
    const input = h('textarea', { id: `hypothesis-${key}`, maxlength: '5000', rows: '3' });
    input.value = draft[key]; return [key, input];
  }));
  const feedback = h('p', { role: 'status', 'aria-live': 'polite' });
  const linked = h('div');
  const search = h('input', { type: 'search', id: 'hypothesis-record-search', oninput: renderChoices });
  const select = h('select', { id: 'hypothesis-record' });
  const selectionInfo = h('p', { class: 'meta' });
  const relation = h('select', { id: 'hypothesis-relation' }, ...EVIDENCE_ROLES.map((role) => h('option', { value: role }, evidenceLabels[role])));
  const note = h('textarea', { id: 'hypothesis-evidence-note', maxlength: '5000', rows: '3' });
  function renderChoices() {
    const term = search.value.toLocaleLowerCase('pt');
    const records = dossier.records.filter((record) => !draft.evidence.some(({ recordId }) => recordId === record.id) &&
      `${record.fields.title} ${record.fields.buyer} ${record.fields.supplier} ${record.id}`.toLocaleLowerCase('pt').includes(term));
    select.replaceChildren(...records.slice(0, 50).map((record) => {
      const source = dossier.sources.find(({ id }) => id === record.sourceId);
      return h('option', { value: record.id }, `${record.fields.title} · ${source.name} · linha ${record.row}`);
    }));
    selectionInfo.textContent = `${records.length} registos correspondentes; até 50 na seleção. Pesquisa para encontrar os restantes.`;
    select.disabled = !records.length;
  }
  function renderLinks() {
    linked.replaceChildren(...draft.evidence.map((evidence) => {
      const record = dossier.records.find(({ id }) => id === evidence.recordId);
      const source = dossier.sources.find(({ id }) => id === record.sourceId);
      return h('article', { class: 'investigation-source' }, h('strong', {}, `${evidenceLabels[evidence.relation]}: ${record.fields.title}`),
        h('p', {}, evidence.note),
        h('p', { class: 'meta' }, `${source.name} · linha ${record.row} · ${labels[record.status]} · SHA-256 ${source.hash}`),
        h('a', { href: recordUrl(record, source), target: '_blank', rel: 'noopener noreferrer' }, 'Conferir fonte'),
        h('button', { type: 'button', onclick: () => {
          draft.statement = statement.value; draft.assessment = assessment.value;
          for (const key of Object.keys(fields)) draft[key] = fields[key].value;
          inspect(record.id, () => buildEditor());
        } }, 'Rever original ligado'),
        h('button', { type: 'button', onclick: () => {
          draft.evidence = draft.evidence.filter((item) => item.recordId !== evidence.recordId); renderLinks(); renderChoices();
        } }, 'Remover ligação do rascunho'));
    }));
  }
  function buildEditor() {
    renderLinks(); renderChoices();
    openReading('Hipótese: prova, lacunas e contraditório', content);
  }
  const content = h('div', { class: 'investigation-hypothesis-editor' },
    h('p', {}, 'Rascunho local: guarda antes de fechar. Uma ligação é a tua interpretação, não prova automática. Fontes repetidas podem ter a mesma origem; TED não comprova contrato celebrado. Rever um registo não avalia a hipótese.'),
    h('label', { for: statement.id }, 'Hipótese verificável'), statement,
    h('label', { for: assessment.id }, 'Avaliação manual, não certificação de verdade'), assessment,
    ...Object.entries(fields).flatMap(([key, input]) => [h('label', { for: input.id },
      { rationale: 'Justificação e explicações alternativas', gaps: 'Lacunas e verificação ainda necessária', questions: 'Perguntas para contraditório (não enviadas automaticamente)' }[key]), input]),
    h('h3', {}, 'Registos ligados e interpretação'), linked,
    h('label', { for: search.id }, 'Procurar um registo do dossiê'), search,
    h('label', { for: select.id }, 'Registo a ligar'), select, selectionInfo,
    h('label', { for: relation.id }, 'Papel do registo para esta hipótese'), relation,
    h('label', { for: note.id }, 'Justificar o alcance e limites desta ligação'), note,
    h('button', { type: 'button', onclick: () => {
      if (!select.value || !note.value.trim()) { feedback.textContent = 'Escolhe um registo e justifica a ligação.'; return; }
      if (draft.evidence.length >= 100) { feedback.textContent = 'Limite de 100 ligações por hipótese.'; return; }
      draft.evidence.push({ recordId: select.value, relation: relation.value, note: note.value });
      note.value = ''; renderLinks(); renderChoices(); feedback.textContent = 'Ligação adicionada ao rascunho; guarda a hipótese para preservar.';
    } }, 'Adicionar ligação ao rascunho'),
    h('button', { type: 'button', onclick: () => {
      try {
        const updated = saveHypothesis(dossier, { ...draft, statement: statement.value, assessment: assessment.value,
          ...Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value])) });
        dossierJson(updated); dossier = updated; persist(); render();
        feedback.textContent = 'Hipótese guardada no dossiê desta sessão.'; notify('Hipótese guardada. Avaliação manual; revisões dos registos não alteradas.');
      } catch (error) { feedback.textContent = error.message; }
    } }, 'Guardar hipótese'), feedback);
  buildEditor();
}

function exportHypotheses() {
  if (!dossier?.hypotheses?.length) { notify('Não há hipóteses para exportar.', true); return; }
  const rows = dossier.hypotheses.flatMap((hypothesis) => (hypothesis.evidence.length ? hypothesis.evidence : [null]).map((evidence) => {
    const record = evidence ? dossier.records.find(({ id }) => id === evidence.recordId) : null;
    const source = record ? dossier.sources.find(({ id }) => id === record.sourceId) : null;
    return [hypothesis.id, hypothesis.statement, hypothesis.assessment, hypothesis.rationale, hypothesis.gaps, hypothesis.questions,
      evidence?.relation || '', evidence?.note || '', record?.id || '', record?.fields.title || '', record?.status || '', record?.note || '',
      source?.format === 'ted-json' ? 'notice' : record ? 'imported-record' : '',
      source?.id || '', source?.name || '', source ? recordUrl(record, source) : '', source?.hash || '', record?.row || '', source?.collectedAt || ''];
  }));
  download(csvTable(['hypothesis_id', 'statement', 'manual_assessment', 'rationale', 'gaps', 'questions',
    'evidence_role', 'evidence_note', 'record_id', 'record_title', 'record_status', 'record_review_note', 'record_kind', 'source_id', 'source_name', 'source_url', 'source_sha256', 'original_row', 'collected_at'], rows),
  'investigacao-hipoteses.csv', 'text/csv;charset=utf-8');
}

function inspectEntity(key) {
  const all = entityIndex(dossier);
  const group = all.find((group) => group.key === key);
  const byKey = new Map(all.map((group) => [group.key, group]));
  const content = h('div', {},
    h('p', {}, group.nif ? `Agrupamento pelo NIF declarado ${group.nif}, não confirmação da identidade.` : 'Esta ocorrência não foi fundida com outras pelo nome.'),
    h('p', {}, 'Repetições entre SNS/IMPIC e TED podem derivar do mesmo anúncio ou publicador. Não constituem corroboração independente. Não são somados valores nem inferidas relações societárias.'),
    group.warnings.map((warning) => h('p', { class: 'meta' }, warning)),
    group.candidateKeys.length ? h('details', {}, h('summary', {}, 'Outras ocorrências com designação semelhante (não fundidas)'),
      group.candidateKeys.map((key) => h('p', {}, `${byKey.get(key).names.join(' / ')} · ${byKey.get(key).nif || 'sem NIF elegível'}`)),
      group.candidatesTruncated ? h('p', { class: 'meta' }, 'Lista limitada a 20 pistas; usa o filtro de entidades para examinar as restantes.') : null) : null);
  const list = h('div');
  let shown = 0;
  const showMore = h('button', { type: 'button', onclick: () => append() }, 'Mostrar mais ocorrências');
  function append() {
    for (const occurrence of group.occurrences.slice(shown, shown + 50)) {
      const record = dossier.records.find((record) => record.id === occurrence.recordId);
      const source = dossier.sources.find((source) => source.id === occurrence.sourceId);
      list.append(h('article', { class: 'investigation-source' }, h('strong', {}, record.fields.title),
        h('p', {}, `${occurrence.role === 'buyer' ? 'Adjudicante/comprador' : 'Adjudicatária'}: ${occurrence.name || 'não indicada'} · identificador original: ${occurrence.rawId || 'não indicado'}`),
        h('p', { class: 'meta' }, `${source.name} · linha ${occurrence.row} · ${occurrence.collectedAt} · ${labels[record.status]}`),
        h('a', { href: occurrence.url, target: '_blank', rel: 'noopener noreferrer' }, 'Conferir origem do registo'),
        h('button', { type: 'button', onclick: () => inspect(record.id, () => inspectEntity(key)) }, 'Rever este registo')));
    }
    shown += 50; showMore.hidden = shown >= group.occurrences.length;
  }
  append(); content.append(list, showMore);
  openReading('Entidades: ocorrências e proveniência', content);
}
function inspect(id, onBack) {
  const record = dossier.records.find((record) => record.id === id);
  const source = dossier.sources.find((source) => source.id === record.sourceId);
  const selection = h('select', { id: 'investigation-review-state' }, REVIEW_STATES.map((state) => h('option', { value: state }, labels[state])));
  selection.value = record.status;
  const note = h('textarea', { id: 'investigation-review-note', rows: '5', maxlength: '5000' });
  note.value = record.note;
  const status = h('p', { role: 'status' });
  const content = h('div', {},
    h('p', {}, `Fonte: ${source.name} · registo original ${record.row} · recolhido em ${source.collectedAt}`),
    h('a', { href: recordUrl(record, source), target: '_blank', rel: 'noopener noreferrer' }, 'Conferir na fonte (abre outro separador)'),
    source.format === 'ted-json' ? h('p', { class: 'meta' }, 'Anúncio TED: não demonstra adjudicação, fornecedor, preço pago ou data de celebração. Esses campos não são inferidos.') : null,
    h('p', { class: 'meta' }, 'Data de celebração não é data de publicação. Um nome igual ou um NIF na fonte não prova identidade; múltiplas entidades podem estar na mesma célula. Um vínculo contratual não prova irregularidade.'),
    h('details', {}, h('summary', {}, 'Valores originais, sem transformação'), h('pre', { class: 'investigation-raw' }, JSON.stringify(record.raw, null, 2))),
    h('label', { for: 'investigation-review-state' }, 'Estado atribuído por ti (não automaticamente)'), selection,
    h('label', { for: 'investigation-review-note' }, 'Justificação, fontes independentes e dúvidas'), note,
    h('button', { type: 'button', onclick: () => {
      if (selection.value !== 'unverified' && !note.value.trim()) { status.textContent = 'Justifica a revisão e indica a prova; não basta mudar o estado.'; return; }
      try {
        const updated = { ...dossier, records: dossier.records.map((item) => item.id === id
          ? { ...item, status: selection.value, note: note.value } : item) };
        dossierJson(updated); dossier = updated;
        persist(); render(); status.textContent = 'Revisão atualizada no dossiê desta sessão.';
      } catch (error) { status.textContent = error.message; }
    } }, 'Guardar revisão'), status);
  openReading('Rever registo', content, { onBack });
}
async function requestFunding() {
  if (busy) return;
  const key = fundingSelect.value;
  try {
    busy = true; controller = new AbortController(); render();
    fundingResults.replaceChildren();
    notify('A consultar metadados oficiais. É enviado apenas o identificador do conjunto, não a pergunta ou o dossiê.');
    const url = new URL('/investigar', window.REVISOR_CONFIG.definitionApi);
    url.searchParams.set('source', 'funding'); url.searchParams.set('q', key);
    const response = await fetch(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Falha HTTP ${response.status}.`);
    if (result.source !== 'funding' || result.key !== key || result.scope !== 'metadata-only' ||
        !Array.isArray(result.resources) || !publicUrl(result.datasetUrl)) throw new Error('Resposta inesperada dos metadados de fundos.');
    fundingResults.replaceChildren(h('article', { class: 'investigation-source' },
      h('strong', {}, result.title), h('p', {}, result.purpose),
      h('p', { class: 'meta' }, `${result.publisher} · licença declarada: ${result.license} · atualização do catálogo: ${result.updatedAt || 'não indicada'}`),
      h('p', { class: 'meta' }, `Consulta: ${result.collectedAt} · SHA-256 dos metadados: ${result.hash}. Não é hash dos ficheiros XLSX nem autenticação do conteúdo.`),
      h('a', { href: result.datasetUrl, target: '_blank', rel: 'noopener noreferrer' }, 'Conferir conjunto oficial e condições'),
      !result.resources.length ? h('p', {}, 'O catálogo não apresenta recursos neste momento.') : null,
      ...result.resources.map((resource) => h('p', {},
        h('a', { href: publicUrl(resource.url), target: '_blank', rel: 'noopener noreferrer' },
          `${resource.title} (${resource.format || 'formato não indicado'}) — recurso externo`),
        h('span', { class: 'meta' }, ` · atualização declarada: ${resource.updatedAt || 'não indicada'}`))),
      h('details', {}, h('summary', {}, 'Pedido e resposta originais dos metadados'),
        h('p', {}, result.requestUrl), h('pre', { class: 'investigation-raw' }, result.rawText)),
      h('button', { type: 'button', onclick: () => download(JSON.stringify(result), `fontes-fundos-${key}.json`) }, 'Preservar metadados desta consulta JSON')));
    notify(`${result.resources.length} recursos oficiais encontrados. Apenas metadados consultados; nenhum projeto, beneficiário ou ficheiro adicionado ao dossiê.`);
  } catch (error) {
    notify(error.name === 'AbortError' ? 'Consulta de fundos cancelada; o dossiê não foi alterado.' : error.message, error.name !== 'AbortError');
  } finally { busy = false; controller = null; render(); }
}

async function request(source, offset = 0) {
  if (busy) return;
  try {
    if (source !== 'catalog') startDossier();
    if (query.value.trim().length < 2) throw new Error('Indica uma pesquisa com pelo menos 2 caracteres.');
    const term = query.value.trim();
    busy = true; controller = new AbortController(); render(); notify('A consultar a API pública. O termo de pesquisa é enviado à fonte.');
    const url = new URL('/investigar', window.REVISOR_CONFIG.definitionApi);
    url.searchParams.set('source', source); url.searchParams.set('q', term); url.searchParams.set('offset', String(offset));
    const response = await fetch(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `Falha HTTP ${response.status}.`);
    if (source === 'catalog') {
      if (!Array.isArray(result.items)) throw new Error('Resposta inesperada do catálogo.');
      catalog.replaceChildren(h('p', { class: 'meta' }, 'Até 10 conjuntos encontrados; são pistas, não contratos recolhidos. Confere editor, atualização, licença e âmbito. Não descarregamos recursos externos automaticamente.'),
        ...result.items.map((item) => h('article', { class: 'investigation-source' },
          publicUrl(item.url) ? h('a', { href: publicUrl(item.url), target: '_blank', rel: 'noopener noreferrer' }, item.title) : h('strong', {}, item.title),
          h('p', {}, `${item.publisher} · ${item.license} · atualização declarada: ${item.updatedAt || 'não indicada'}`),
          (item.resources || []).filter((resource) => publicUrl(resource.url)).map((resource) => h('p', {}, h('a', {
            href: publicUrl(resource.url), target: '_blank', rel: 'noopener noreferrer',
          }, `Consultar recurso ${resource.format || 'sem formato indicado'}`))))));
      notify(`${result.items.length} pistas de dados abertos encontradas. Não foram adicionadas ao dossiê como prova.`);
    } else {
      if (result.source !== source || result.offset !== offset || !Number.isInteger(result.count)) throw new Error('Resposta inesperada da recolha.');
      if (result.count) {
        dossier = await addSource(dossier, { name: source === 'ted' ? 'TED — anúncios com compradores em Portugal'
          : 'Contratos Públicos na Saúde — Portal da Transparência SNS / IMPIC', url: result.url,
          rawText: result.rawText, format: source === 'ted' ? 'ted-json' : 'json', collectedAt: result.collectedAt, query: term, total: result.total,
          ...(source === 'ted' ? { requestBody: result.requestBody } : {}) });
      }
      next = result.hasMore ? { source, query: term, offset: offset + result.count } : null;
      if (result.count) persist();
      notify(`${result.count} registos neste lote; ${result.total} correspondências indicadas pela API. Limite de 200 por pesquisa. ${source === 'ted'
        ? 'Anúncios com compradores em Portugal; não contratos celebrados. Pesquisa textual no arquivo TED, sem ordenação temporal garantida.'
        : 'Apenas este conjunto da saúde, sujeito à atualização da fonte.'} Nenhuma verificação de identidade foi feita.`);
      if (technical.hidden) notify(result.count
        ? 'A consulta está pronta. Abre uma pista e escolhe o que queres perceber melhor. O âmbito e os limites estão em «O que estás a ver».'
        : 'Esta consulta não encontrou registos. Experimenta outra expressão ou fonte; isto não demonstra ausência de contratos.');
    }
  } catch (error) {
    notify(error.name === 'AbortError' ? 'Consulta cancelada. Os lotes anteriores permanecem no dossiê.' : error.message, error.name !== 'AbortError');
  } finally { busy = false; controller = null; render(); }
}
const file = h('input', { type: 'file', accept: '.csv,.json,text/csv,application/json', id: 'investigation-file', onchange: async () => {
  const selected = file.files[0];
  if (!selected || busy) return;
  try {
    startDossier();
    if (selected.size > MAX_IMPORT_BYTES) throw new Error('O ficheiro excede 2 MiB.');
    if (!/\.(csv|json)$/i.test(selected.name)) throw new Error('Escolhe um ficheiro com extensão .csv ou .json.');
    if (!sourceName.value.trim() || !publicUrl(sourceUrl.value)) throw new Error('Preenche o nome da fonte e a ligação HTTPS de origem antes de importar.');
    busy = true; render();
    dossier = await addSource(dossier, { name: sourceName.value, url: sourceUrl.value, rawText: await selected.text(),
      format: selected.name.toLowerCase().endsWith('.csv') ? 'csv' : 'json', collectedAt: new Date().toISOString() });
    persist(); notify('Ficheiro importado localmente. Registos por verificar; nenhum conteúdo do ficheiro foi enviado.');
  } catch (error) { notify(error.message, true); }
  finally { busy = false; file.value = ''; render(); }
} });
const backup = h('input', { type: 'file', accept: '.json', id: 'investigation-backup', onchange: async () => {
  const selected = backup.files[0];
  if (!selected || busy) return;
  if (dossier && !window.confirm('Substituir o dossiê desta sessão? Exporta-o primeiro se quiseres conservá-lo.')) { backup.value = ''; return; }
  try {
    if (selected.size > 24 * 1024 * 1024) throw new Error('O dossiê excede 24 MiB.');
    busy = true; render();
    const restored = await restoreDossier(await selected.text());
    dossier = restored; question.value = dossier.question; curiosity.value = dossier.question; notes.value = dossier.notes; next = null;
    persist(); notify('Dossiê restaurado; originais e transformações conferidos, não a veracidade dos dados.');
  } catch (error) { notify(error.message, true); }
  finally { busy = false; backup.value = ''; render(); }
} });
const more = button('Recolher próximo lote de 50', () => {
  if (next) { query.value = next.query; collectionSource.value = next.source; request(next.source, next.offset); }
});
const cancel = h('button', { type: 'button', disabled: true, onclick: () => controller?.abort() }, 'Cancelar consulta');
const section = (key, title, ...children) => {
  const index = workspacePanels.get(key)?.length || 0;
  const headingId = `investigation-${key}-heading-${index}`;
  const panel = h('section', { id: `investigation-workspace-${key}-${index}`, class: 'investigation-panel', 'aria-labelledby': headingId, hidden: key !== activeWorkspace },
    h('h2', { id: headingId, tabindex: '-1' }, title), ...children,
    h('button', { type: 'button', class: 'investigation-workspace-return', onclick: () => workspaceButtons.get(activeWorkspace).focus() }, 'Voltar às áreas de trabalho'));
  if (!workspacePanels.has(key)) workspacePanels.set(key, []);
  workspacePanels.get(key).push(panel);
  return panel;
};
function showWorkspace(key, focus = true) {
  if (!workspacePanels.has(key)) throw new Error('Área de investigação desconhecida.');
  activeWorkspace = key;
  if (technical.hidden) showMode('bench', focus);
  for (const [panelKey, panels] of workspacePanels) for (const panel of panels) panel.hidden = panelKey !== key;
  for (const [buttonKey, node] of workspaceButtons) {
    node.setAttribute('aria-controls', workspacePanels.get(buttonKey).map((panel) => panel.id).join(' '));
    if (buttonKey === key) node.setAttribute('aria-current', 'true');
    else node.removeAttribute('aria-current');
  }
  workspaceHelp.textContent = WORKSPACES.find(([workspaceKey]) => workspaceKey === key)[2];
  if (focus) workspacePanels.get(key)[0].querySelector('h2').focus();
}
const workspaceNav = h('nav', { class: 'investigation-navigation', 'aria-label': 'Áreas de trabalho da investigação' },
  ...WORKSPACES.map(([key, title]) => {
    const node = h('button', { type: 'button', onclick: () => showWorkspace(key), 'aria-current': key === activeWorkspace ? 'true' : null }, title);
    workspaceButtons.set(key, node);
    return node;
  }));
saveLocal.addEventListener('change', () => {
  if (saveLocal.checked) { persist(); notify('Gravação local ativada. Exporta também JSON; o navegador pode apagar os dados.'); }
  else {
    try { localStorage.removeItem(STORE); storageWarning = ''; notify('Cópia automática local removida; o dossiê continua na sessão.'); }
    catch { notify('Não foi possível remover a cópia local. Verifica o armazenamento do navegador.', true); }
  }
});
technical.append(
  h('h2', { tabindex: '-1' }, 'Bancada de dados'), h('p', {}, 'Instrumentos de conferência. Não precisas de percorrer todas as áreas para investigar.'),
  workspaceNav, workspaceHelp,
  section('start', 'Definir a investigação', h('label', { for: 'investigation-question' }, 'Pergunta orientadora'), question,
    button('Atualizar pergunta', () => {
      try { const fresh = newDossier(question.value); dossier = dossier ? { ...dossier, question: fresh.question } : fresh; curiosity.value = dossier.question; persist(); render(); notify('Pergunta atualizada.'); }
      catch (error) { notify(error.message, true); }
    }),
    h('p', {}, 'Começa por uma pergunta verificável, delimita o período e distingue o que já sabes do que precisas de confirmar.'),
    h('div', { class: 'investigation-actions' },
      h('button', { type: 'button', onclick: () => showWorkspace('discover') }, 'Encontrar fontes públicas'),
      h('button', { type: 'button', onclick: () => showWorkspace('import') }, 'Já tenho um ficheiro de dados'))),
  section('discover', 'Descobrir e recolher contratos e anúncios', h('label', { for: 'investigation-query' }, 'Tema ou entidade a pesquisar'), query,
    h('p', { class: 'meta' }, 'Ao consultar, este termo é enviado pelo proxy à API escolhida. Não envies nomes de fontes confidenciais ou dados pessoais sensíveis. Não são contornados CAPTCHA, autenticação ou paywalls.'),
    h('label', { for: 'investigation-collection-source' }, 'Fonte de recolha'), collectionSource,
    h('div', { class: 'investigation-actions' }, button('Descobrir no dados.gov.pt', () => request('catalog')),
      button('Recolher na fonte selecionada', () => { next = null; request(collectionSource.value); }), more),
    h('p', { class: 'meta' }, 'Recolha manual de 50 por lote, até 200 por pesquisa. SNS: publicação decrescente. TED: arquivo de anúncios, sem ordem cronológica garantida; o tipo de anúncio não é a modalidade de contratação. A fonte pode mudar entre lotes; duplicados são assinalados. Sem monitorização ou cobertura garantida. Confere licença e condições de reutilização antes de publicar.'),
    h('p', {}, h('a', { href: 'https://dados.gov.pt/datasets/contratos-publicos-portal-base-impic-contratos-de-2012-a-2026', target: '_blank', rel: 'noopener noreferrer' }, 'Consultar distribuição nacional IMPIC / Portal BASE'),
      ' — recursos ZIP/XLSX externos, não importados automaticamente. Para este piloto, prepara uma seleção CSV/JSON e identifica a origem; conserva o ficheiro original fora da ferramenta.'),
    catalog),
  section('discover', 'Fundos europeus e PRR: fontes oficiais',
    h('p', {}, 'Consultar projetos, entidades, contratualização e territórios PRR, e beneficiários/operações do Portugal 2020. Obtém os recursos atuais do catálogo oficial, sem depender de endereços XLSX datados. Esta consulta pesquisa conjuntos, não nomes de pessoas ou projetos dentro dos ficheiros.'),
    h('label', { for: 'investigation-funding-source' }, 'Conjunto oficial a consultar'), fundingSelect,
    button('Consultar recursos atuais de fundos', requestFunding),
    h('p', { class: 'meta' }, 'Só recolhemos metadados JSON do dados.gov.pt. Os ficheiros externos não são descarregados automaticamente. Exporta os metadados antes de mudar de conjunto ou recarregar: não entram no dossiê nem na gravação local. Preserva também o ficheiro original, data de download, folha e transformações fora da ferramenta. A licença PRR pode estar «notspecified»: verifica condições antes de reutilizar ou publicar.'),
    h('p', {}, 'Importação de projetos e beneficiários XLSX ainda não suportada: não renomeies beneficiário como adjudicatária nem apoio como preço de contrato para forçar a importação. Contratualizado, aprovado, executado e pago são medidas distintas; projetos e territórios podem repetir-se. Não somamos nem cruzamos estes metadados com contratos.'),
    h('p', {}, h('a', { href: 'https://transparencia.gov.pt/pt/fundos-europeus/prr/beneficiarios-projetos/', target: '_blank', rel: 'noopener noreferrer' }, 'Explorar beneficiários e projetos PRR no Mais Transparência'),
      ' — pesquisa externa, não recolha automática.'),
    fundingResults),
  section('import', 'Importar ficheiro de uma fonte', h('label', { for: 'investigation-source-name' }, 'Nome da fonte'), sourceName,
    h('label', { for: 'investigation-source-url' }, 'Origem HTTPS'), sourceUrl,
    h('label', { for: 'investigation-file' }, 'Importar CSV ou JSON (2 MiB; dossiê até 5000 registos)'), file,
    h('details', {}, h('summary', {}, 'Formatos e colunas suportados'),
      h('p', {}, 'CSV com cabeçalhos e separador vírgula, ponto e vírgula ou tabulação; JSON com lista de objetos planos (ou results). Objeto/título obrigatório: objeto_do_contrato, objeto, titulo ou title.'),
      h('p', {}, 'Colunas opcionais: adjudicante/buyer, adjudicataria/supplier, nif_adjudicante/buyer_id, nif_adjudicatario/supplier_id, preco/valor/amount, data/date (confirmar significado), data_de_publicacao/published, procedimento/procedure. Colunas oficiais da API SNS também são reconhecidas. Campos desconhecidos ficam nos originais; valores ausentes não são inventados.'),
      button('Descarregar exemplo CSV', () => download('objeto;adjudicante;nif_adjudicante;adjudicataria;nif_adjudicatario;valor;data;procedimento\nExemplo fictício;Entidade fictícia;;Empresa fictícia;;1000,00;2026-01-01;Por confirmar', 'exemplo-ficticio.csv', 'text/csv;charset=utf-8')))),
  section('records', 'Verificar os registos', h('div', { class: 'investigation-actions' }, filter, statusFilter), table),
  section('entities', 'Entidades: cruzar sem confundir', h('p', {}, 'Agrupamento apenas por NIF organizacional declarado com formato e dígito de controlo válidos (prefixos 5, 6 ou 9; PT opcional). Não valida existência, titularidade ou identidade. Identificadores pessoais, múltiplos e inválidos ficam isolados; nomes semelhantes nunca provocam fusão.'),
    entityFilter, entities,
    button('Exportar ocorrências de entidades CSV', () => {
      if (!dossier?.records.length) { notify('Não há registos para cruzar.', true); return; }
      download(entitiesCsv(dossier), 'investigacao-entidades.csv', 'text/csv;charset=utf-8');
    })),
  section('entities', 'Mapa de relações declaradas', h('p', {}, 'Explora uma entidade de cada vez, com até 12 registos por página e as entidades que neles aparecem. Cada ligação vem de uma linha original e de um papel declarado; não infere relações entre entidades. TED é anúncio, não contrato celebrado. Ausência de ligação não comprova ausência de relação. O mapa é recalculado a partir do dossiê, sem alterar identidades ou revisões.'),
    h('label', { for: 'investigation-map-filter' }, 'Procurar centro do mapa'), mapFilter,
    h('label', { for: 'investigation-map-entity' }, 'Entidade ou ocorrência no centro'), mapSelect, mapChoices, mapView,
    button('Exportar ligações do dossiê CSV', () => {
      if (!dossier?.records.length || !entityIndex(dossier).length) { notify('Não há papéis de entidades declarados para exportar.', true); return; }
      download(relationshipsCsv(dossier), 'investigacao-ligacoes.csv', 'text/csv;charset=utf-8');
    })),
  section('timeline', 'Cronologia ligada às fontes',
    h('p', {}, 'Sequência de dias declarados, não reconstrução automática dos factos. Publicação e celebração/data do registo são acontecimentos distintos. TED só fornece publicação do anúncio; não inferimos celebração. Uma coluna genérica data/date precisa de confirmação do seu significado. A recolha não substitui datas ausentes.'),
    h('p', { class: 'meta' }, 'Reconhecemos YYYY-MM-DD, DD/MM/YYYY e datas ISO com hora e fuso explícitos, incluindo o formato TED de dia com fuso. Ordenamos pelo dia escrito, sem conversão de fuso nem ordem dentro do mesmo dia. Anos/meses isolados, formatos incertos e datas inválidas ficam no fim, separados da sequência datada. Lacunas não comprovam ausência de acontecimentos; duplicados continuam visíveis. Estes filtros são independentes da tabela e do mapa.'),
    h('label', { for: 'investigation-timeline-filter' }, 'Pesquisar na cronologia'), chronologyFilter,
    h('label', { for: 'investigation-timeline-kind' }, 'Tipo de acontecimento'), chronologyKind,
    h('label', { for: 'investigation-timeline-state' }, 'Datas ou lacunas'), chronologyState,
    h('label', { for: 'investigation-timeline-order' }, 'Ordem dos dias reconhecidos'), chronologyOrder,
    chronology,
    button('Exportar cronologia completa CSV', () => {
      if (!dossier?.records.length) { notify('Não há registos para a cronologia.', true); return; }
      download(timelineCsv(dossier), 'investigacao-cronologia.csv', 'text/csv;charset=utf-8');
    }),
    h('p', { class: 'meta' }, 'CSV: dossiê completo, sem os filtros desta vista, em ordem crescente de dias e com lacunas no fim. Inclui valores declarados, interpretação, fontes, revisão e avisos. O JSON preserva os originais para reconstruir esta cronologia.')),
  section('notes', 'Hipóteses, lacunas e contraditório',
    h('p', {}, 'Matriz de trabalho manual: hipóteses verificáveis, registos de apoio/contradição/contexto, justificação, lacunas e perguntas. Até 100 hipóteses e 100 ligações por hipótese. Quantidade de registos não mede força ou independência da prova; não há conclusões, pontuações de verdade ou envio automático de perguntas.'),
    h('div', { class: 'investigation-actions' }, button('Criar hipótese', () => editHypothesis()), button('Exportar matriz de hipóteses CSV', exportHypotheses)),
    hypothesesView,
    h('label', { for: 'investigation-notes' }, 'Notas livres anteriores (preservadas; não convertidas automaticamente em hipóteses)'), notes),
  section('preserve', 'Fontes, preservação e exportação', sources,
    h('p', { class: 'meta' }, 'Os originais são preservados com SHA-256 e data de recolha. O hash deteta alterações do ficheiro; não prova autenticidade ou verdade. As revisões são declarações tuas, não avaliações automáticas. O CSV inclui proveniência e neutraliza fórmulas; o JSON conserva o dossiê e os originais.'),
    h('label', { class: 'investigation-check', for: 'investigation-local' }, saveLocal, 'Guardar neste navegador (opcional; não é cifrado, não usar em computador partilhado)'),
    h('div', { class: 'investigation-actions' },
      button('Exportar dossiê JSON', () => {
        try { if (!dossier) throw new Error('Cria primeiro um dossiê.'); download(dossierJson(dossier), 'investigacao-dossie.json'); }
        catch (error) { notify(error.message, true); }
      }),
      button('Exportar registos CSV', () => { if (dossier?.records.length) download(recordsCsv(dossier), 'investigacao-registos.csv', 'text/csv;charset=utf-8'); else notify('Não há registos para exportar.', true); }),
      button('Carregar cópia deste navegador', async () => {
        if (dossier && !window.confirm('Substituir o dossiê desta sessão pela cópia local?')) return;
        try {
          busy = true; render();
          const saved = localStorage.getItem(STORE);
          if (!saved) throw new Error('Não existe cópia local guardada.');
          dossier = await restoreDossier(saved); question.value = dossier.question; curiosity.value = dossier.question; notes.value = dossier.notes; next = null;
          notify('Cópia local carregada; não foi enviado conteúdo.');
        } catch (error) { notify(error.message, true); }
        finally { busy = false; render(); }
      }),
      button('Limpar dossiê', () => {
        if (!window.confirm('Limpar o dossiê da sessão e a cópia deste navegador? Ficheiros exportados não são removidos.')) return;
        try { localStorage.removeItem(STORE); }
        catch { notify('Não foi possível remover a cópia local; o dossiê foi mantido.', true); return; }
        dossier = null; next = null; storageWarning = ''; question.value = ''; curiosity.value = ''; anchor.value = ''; notes.value = ''; catalog.replaceChildren(); fundingResults.replaceChildren(); render(); notify('Dossiê limpo.');
      })),
    h('label', { for: 'investigation-backup' }, 'Restaurar dossiê JSON exportado'), backup),
);
discovery.append(
  h('h2', { tabindex: '-1' }, 'Há alguma coisa que queres perceber melhor?'),
  h('p', {}, 'Começa pelo que te intriga. Não precisas de uma hipótese pronta: uma pergunta, uma intuição ou um detalhe que não encaixa bastam.'),
  h('label', { for: curiosity.id }, 'A tua curiosidade'), curiosity,
  h('details', {}, h('summary', {}, 'Preciso de uma ideia para começar'),
    ...['Quem contrata este serviço — e com quem?', 'O que falta saber sobre este contrato?', 'Porque aparece esta entidade nestes registos?'].map((text) =>
      h('button', { type: 'button', onclick: () => { curiosity.value = text; curiosity.focus(); } }, text))),
  h('label', { for: anchor.id }, 'Uma expressão para procurar a primeira pista'), anchor,
  h('p', { class: 'meta' }, 'Escolhe tu a expressão: não traduzimos a tua intuição numa pesquisa automática. Só esta expressão é enviada à fonte, nunca a curiosidade ou o dossiê.'),
  h('label', { for: scope.id }, 'Onde procurar neste primeiro percurso'), scope,
  button('Procurar as primeiras pistas', startDiscovery),
  h('p', { class: 'meta' }, 'Uma consulta manual, até 50 registos por lote; três pistas visíveis de cada vez. Sem cobertura nacional garantida, pesquisa de vida privada ou conclusões automáticas. Mais fontes e importação na bancada.'),
  discoveryCards);
trailView.append(
  h('h2', { tabindex: '-1' }, 'O meu fio de investigação'),
  h('p', {}, 'O que te interessa, as perguntas que ficam e as pistas que preferiste não seguir. Não é uma narrativa automática nem prova de uma hipótese.'),
  trailCards,
  h('button', { type: 'button', onclick: () => showWorkspace('notes') }, 'Confrontar a hipótese com outras explicações'));
overview.append(dossierQuestion,
  h('p', { class: 'meta' }, 'O teu percurso fica nesta sessão. Exporta JSON antes de fechar; guardar neste navegador é opcional.'),
  h('div', { class: 'investigation-actions' },
    h('button', { type: 'button', onclick: () => showWorkspace('preserve') }, 'Guardar ou retomar investigação'), cancel));
root.append(
  h('h1', {}, 'Investigar'),
  h('p', { class: 'home-lead' }, 'Escolhe uma pessoa ou entidade. Segue as perguntas. Descobre o que os dados públicos, cruzados, mostram.'),
  modeNav, teia, overview, message, discovery, trailView, technical);
showWorkspace(activeWorkspace, false);
showMode('teia', false);
render();

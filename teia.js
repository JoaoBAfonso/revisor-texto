// Teia: escrutínio público guiado por perguntas. Cruza fontes oficiais e secundárias num grafo com proveniência e levanta
// sinais que merecem pergunta — nunca acusações. A pessoa confirma identidades; a Teia só sugere o passo seguinte.
import { openReading, readingBackTo } from './reading-dialog.js';
import { createDataClient, DATA_BASE, DATA_REPOSITORY, cleanText, normalizeName } from './proxy/teia-index.mjs';
import * as G from './proxy/teia-graph.mjs';
import * as S from './proxy/teia-signals.mjs?v=2';

const SUBJECT = G.SUBJECT;
const STORE = 'teia-v1';
const MAX_FILE = 8 * 1024 * 1024;
const SVG_NS = 'http://www.w3.org/2000/svg';
const config = window.REVISOR_CONFIG || {};
const API = String(config.definitionApi || '').replace(/\/+$/, '');
const client = createDataClient({ baseUrl: config.dataBase || DATA_BASE });
const EXAMPLES = ['Luís Montenegro', 'Solverde'];
const KIND = { person: 'Pessoa', org: 'Entidade', 'public-body': 'Entidade pública', act: 'Publicação no Diário da República' };
const SOURCE_BADGE = { primaria: 'Oficial', secundaria: 'Secundária', manual: 'Tua' };
const MARK = { sim: ['✔', 'confirmado'], talvez: ['?', 'por confirmar'], nao: ['✖', 'contra'], na: ['—', 'não se aplica'] };
const ROLE = { paga: 'paga', 'família': 'família', ligada: 'entidade ligada', titular: 'titular do cargo', 'decisão': 'decisão do Estado' };
const TIE_RELS = new Set(['cargo-privado', 'participacao', 'servico', 'apoio', 'co-mencao', 'manual', 'grupo', 'cliente']);
const PAPEIS = { f: 'fornecedora', a: 'adjudicante', fa: 'fornecedora e adjudicante', c: 'concorrente' };
const INDEX_COUNT_HELP = 'As ocorrências no índice incluem os papéis de adjudicante, fornecedora e concorrente, podendo contar vários papéis no mesmo contrato. Não são uma contagem de contratos ganhos.';

const h = (tag, props, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'class') node.className = value;
    else if (key === 'checked' || key === 'disabled' || key === 'value') node[key] = value;
    else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : value);
  }
  for (const child of children.flat(Infinity)) if (child != null && child !== false) node.append(child);
  return node;
};
const svg = (tag, attrs, ...children) => {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (value != null && value !== false) node.setAttribute(key, value);
  }
  for (const child of children.flat(Infinity)) if (child != null && child !== false) node.append(child);
  return node;
};
const unique = (values) => [...new Set(values.filter(Boolean))];
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const short = (name) => S.displayName(name) || cleanText(name, 80);
const today = () => new Date().toISOString().slice(0, 10);
const nameOf = (id) => graph?.nos[id]?.nome || id;

function safeUrl(value) {
  try {
    const url = new URL(String(value || ''), location.href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : '';
  } catch { return ''; }
}

function outLink(href, text, props = {}) {
  const url = safeUrl(href);
  return url ? h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', ...props }, text) : h('span', props, text);
}

const lawLink = (law) => h('a', { href: law.href, class: 'inline-legal-reference' }, law.rotulo);

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = h('a', { href: url, download: name, hidden: true });
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const fileName = (suffix) => `teia-${normalizeName(graph.nos[SUBJECT].nome).replace(/\s+/g, '-').slice(0, 60) || 'investigacao'}-${today()}.${suffix}`;

// ——— estado ———

let root;
let stage;
let statusBar;
let statusText;
let statusButton;
let graph = null;
let shown = new Set();
let fresh = new Set();
let finding = null;
let busy = false;
let controller = null;
let pinned = [];
let webSvg = null;

function announce(text, state = 'info') {
  statusText.textContent = text;
  statusBar.dataset.state = state;
  statusButton.hidden = state === 'info';
  statusButton.textContent = state === 'busy' ? 'Cancelar' : 'Fechar';
}

const abortError = () => new DOMException('Consulta cancelada.', 'AbortError');

function checkpoint(signal) {
  if (signal?.aborted) throw abortError();
}

// O cliente de dados não aceita AbortSignal: a corrida deixa cancelar sem esperar pela resposta.
function race(promise, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(abortError()); return; }
    const stop = () => reject(abortError());
    signal.addEventListener('abort', stop, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop));
  });
}

async function work(label, task) {
  if (busy) return;
  busy = true;
  controller = new AbortController();
  const { signal } = controller;
  const before = document.activeElement;
  stage.setAttribute('aria-busy', 'true');
  announce(label, 'busy');
  for (const node of root.querySelectorAll('[data-work]')) node.disabled = true;
  // O botão que iniciou o trabalho fica desativado: o foco passa para «Cancelar» em vez de se perder.
  if (before?.disabled || before?.matches?.('[data-work]')) statusButton.focus();
  try {
    await task(signal);
  } catch (error) {
    if (error?.name === 'AbortError' || signal.aborted) announce('Consulta cancelada. A investigação ficou como estava.');
    else {
      console.error(error);
      announce(error?.message || 'Algo correu mal. Tenta de novo.', 'error');
    }
  } finally {
    busy = false;
    controller = null;
    stage.removeAttribute('aria-busy');
    for (const node of root.querySelectorAll('[data-work]')) node.disabled = false;
    const lost = document.activeElement === document.body || (document.activeElement === statusButton && statusButton.hidden);
    if (lost && before?.isConnected) before.focus();
  }
}

async function fromSource(params, signal) {
  if (!API) throw new Error('O serviço de consulta não está configurado neste site.');
  const url = new URL(`${API}/teia`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const local = new AbortController();
  const relay = () => local.abort();
  const timer = setTimeout(relay, 45000);
  signal.addEventListener('abort', relay, { once: true });
  try {
    const response = await fetch(url, { signal: local.signal, headers: { Accept: 'application/json' } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `A fonte respondeu com erro ${response.status}.`);
    return data;
  } catch (error) {
    if (signal.aborted) throw abortError();
    if (error?.name === 'AbortError') throw new Error('A fonte demorou demasiado a responder. Tenta de novo daqui a pouco.');
    if (error instanceof TypeError) throw new Error('Não foi possível contactar a fonte. Verifica a ligação ou tenta mais tarde.');
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener('abort', relay);
  }
}

function remembered() {
  try { return localStorage.getItem(STORE); } catch { return null; }
}

function forget() {
  try { localStorage.removeItem(STORE); } catch { /* armazenamento indisponível */ }
}

function persist() {
  if (!graph) return;
  graph.vistos = [...shown];
  if (!graph.lembrar) return;
  try { localStorage.setItem(STORE, S.exportGraph(graph)); }
  catch {
    graph.lembrar = false;
    announce('O navegador não deixou guardar a investigação. Descarrega o ficheiro .json para não a perder.', 'error');
  }
}

function focusHeading(selector = 'h2') {
  stage.querySelector(selector)?.focus({ preventScroll: false });
}

// Entidades ligadas ao titular por funções, participações, menções ou pagamentos.
function linkedTo(g, id) {
  return unique(g.afirmacoes.filter((item) => TIE_RELS.has(item.rel) && (item.de === id || item.para === id))
    .map((item) => (item.de === id ? item.para : item.de))).filter((other) => g.nos[other] && !g.nos[other].privado);
}

function openGraph(next, { lembrar = false, texto = '', notas = [] } = {}) {
  next.lembrar = lembrar;
  next.adiadas = Array.isArray(next.adiadas)
    ? next.adiadas.filter((item) => item && typeof item.id === 'string').map((item) => ({ id: item.id, texto: cleanText(item.texto, 300) }))
    : [];
  const ids = S.evaluateSignals(next).todos.map((signal) => signal.id);
  shown = new Set(Array.isArray(next.vistos) ? next.vistos.filter((id) => typeof id === 'string') : ids);
  fresh = new Set(ids.filter((id) => !shown.has(id)));
  for (const id of fresh) shown.add(id);
  graph = next;
  pinned = [];
  finding = { texto: texto || `Retomaste a investigação sobre ${graph.nos[SUBJECT].nome}: ${plural(graph.afirmacoes.length, 'facto', 'factos')} com fonte e ${plural(graph.consultas.length, 'consulta feita', 'consultas feitas')}.`, notas };
  persist();
  renderDesk();
  focusHeading('.teia-finding h3');
  announce(finding.texto);
}

// ——— entrada ———

function renderEntry() {
  graph = null;
  finding = null;
  pinned = [];
  shown = new Set();
  fresh = new Set();
  webSvg = null;
  const input = h('input', { id: 'teia-q', type: 'search', maxlength: '120', autocomplete: 'off', spellcheck: 'false', placeholder: 'Ex.: Luís Montenegro', 'aria-describedby': 'teia-q-help' });
  const form = h('form', {
    class: 'teia-search', role: 'search',
    onsubmit: (event) => {
      event.preventDefault();
      const q = cleanText(input.value, 120);
      if (q.length < 3) { announce('Escreve pelo menos 3 letras.', 'error'); input.focus(); return; }
      work(`A procurar «${q}» no Parlamento, nos contratos públicos e na Wikidata…`, (signal) => lookup(q, signal));
    },
  },
  h('label', { for: 'teia-q' }, 'Nome de uma pessoa ou entidade'),
  h('div', { class: 'teia-search-row' }, input, h('button', { type: 'submit', class: 'teia-primary', 'data-work': '' }, 'Procurar')),
  h('p', { class: 'meta', id: 'teia-q-help' }, 'Titulares de cargos políticos e públicos, empresas, associações, entidades públicas.'));
  const examples = h('p', { class: 'teia-examples' }, h('span', {}, 'Experimenta:'),
    ...EXAMPLES.map((name) => h('button', { type: 'button', class: 'chip', 'data-work': '', onclick: () => { input.value = name; form.requestSubmit(); } }, name)));
  let resume = null;
  const saved = remembered();
  if (saved) {
    try {
      const previous = S.importGraph(saved);
      resume = h('div', { class: 'teia-resume' },
        h('p', {}, 'Tens uma investigação guardada neste navegador: ', h('strong', {}, previous.nos[SUBJECT].nome), '.'),
        h('div', { class: 'teia-actions' },
          h('button', { type: 'button', onclick: () => openGraph(previous, { lembrar: true }) }, 'Retomar'),
          h('button', { type: 'button', class: 'teia-quiet', onclick: () => { forget(); renderEntry(); focusHeading(); announce('A investigação guardada foi apagada deste navegador.'); } }, 'Apagar')));
    } catch { forget(); }
  }
  const file = h('input', {
    type: 'file', id: 'teia-file', accept: '.json,application/json',
    onchange: async () => {
      const chosen = file.files[0];
      file.value = '';
      if (!chosen) return;
      if (chosen.size > MAX_FILE) { announce('O ficheiro tem mais de 8 MB.', 'error'); return; }
      try { openGraph(S.importGraph(await chosen.text())); } catch (error) { announce(error.message, 'error'); }
    },
  });
  stage.replaceChildren(h('div', { class: 'teia-entry' },
    h('p', { class: 'teia-kicker' }, 'Teia · escrutínio público'),
    h('h2', { tabindex: '-1' }, 'Quem queres escrutinar?'),
    h('p', { class: 'teia-lead' }, 'Escreve um nome. A Teia cruza o que está publicado em fontes oficiais e faz-te as perguntas certas, uma de cada vez, até os factos falarem.'),
    form, examples, resume,
    h('ol', { class: 'teia-steps' },
      h('li', {}, h('strong', {}, 'Escolhes quem.'), ' Confirmas a identidade em cada fonte. Homónimos são o erro mais comum: a Teia nunca adivinha.'),
      h('li', {}, h('strong', {}, 'Segues perguntas.'), ' Cada resposta cruza mais uma fonte pública: Parlamento, contratos públicos, Diário da República, Wikidata e Wikipédia.'),
      h('li', {}, h('strong', {}, 'A Teia levanta sinais.'), ' Quando os factos se cruzam onde a lei manda olhar, surge uma pergunta, com as provas, a lei, outras explicações e o que falta confirmar.')),
    h('div', { class: 'teia-open' }, h('label', { for: 'teia-file' }, 'Abrir uma investigação guardada (.json)'), file),
    h('details', { class: 'teia-ethics' }, h('summary', {}, 'Como trabalha a Teia — e o que nunca faz'),
      h('ul', {},
        h('li', {}, 'Só usa dados públicos: declarações ao Parlamento, Portal BASE, Diário da República, Wikidata e Wikipédia.'),
        h('li', {}, 'Cada facto guarda a fonte, a data de recolha e a citação. Fontes oficiais, secundárias e tuas nunca se confundem.'),
        h('li', {}, 'Um sinal não é uma acusação: mostra critérios legais verificáveis, explicações alternativas e lacunas.'),
        h('li', {}, 'Não guarda nomes de familiares nem pesquisa vida privada. Fontes protegidas por captcha ficam para ti.'),
        h('li', {}, 'Antes de publicar, confirma na fonte original e ouve as pessoas visadas. A Teia prepara o pedido de comentário.')),
      h('p', { class: 'meta' }, 'O nome que pesquisas é enviado à Wikidata, à Wikipédia e ao Diário da República através do nosso servidor. Os índices de contratos e declarações são públicos e reprodutíveis: ',
        outLink(DATA_REPOSITORY, 'repositório fumaca-dados'), '.'))));
}

// ——— identidade ———

async function lookup(q, signal) {
  const [people, entities, wikidata] = await Promise.allSettled([
    race(client.searchPeople(q), signal),
    race(client.searchEntities(q), signal),
    fromSource({ fonte: 'wikidata-pesquisa', q, offset: 0 }, signal),
  ]);
  checkpoint(signal);
  renderIdentity(q, { people, entities, wikidata });
  focusHeading();
  const total = [people, entities, wikidata].filter((item) => item.status === 'fulfilled').length;
  announce(total ? `Resultados para «${q}». Confirma a identidade em cada fonte.` : 'Nenhuma fonte respondeu. Tenta de novo daqui a pouco.', total ? 'info' : 'error');
}

function renderIdentity(q, found) {
  const listOf = (result, pick) => (result.status === 'fulfilled' ? pick(result.value) || [] : []);
  const failure = (result, source) => (result.status === 'rejected' ? `${source} indisponível agora: ${result.reason?.message || 'erro desconhecido'}` : '');
  const people = listOf(found.people, (value) => value).slice(0, 6);
  const entities = listOf(found.entities, (value) => value?.candidatos).slice(0, 6);
  const items = listOf(found.wikidata, (value) => value?.itens).slice(0, 6);
  const key = normalizeName(q);
  const person = people.find((item) => item.pontuacao === 1) || null;
  const entity = entities.find((item) => normalizeName(item.nome).startsWith(key)) || null;
  const item = items.find((entry) => normalizeName(entry.nome) === key) || null;
  const orgHint = /empresa|sociedade|associa|clube|grupo|companhia|banco|funda/i.test(item?.descricao || '');
  const tipo = person ? 'person' : entity || orgHint ? 'org' : 'person';

  const group = (name, legend, list, describe, preset, note, help) => h('fieldset', { class: 'teia-choices', 'data-group': name },
    h('legend', {}, legend),
    help ? h('p', { class: 'meta' }, help) : null,
    note ? h('p', { class: 'teia-note' }, note) : null,
    ...list.map((entry, index) => h('label', { class: 'teia-choice' },
      h('input', { type: 'radio', name, value: String(index), checked: entry === preset }),
      h('span', {}, h('strong', {}, entry.nome), h('span', { class: 'meta' }, describe(entry))))),
    h('label', { class: 'teia-choice is-none' }, h('input', { type: 'radio', name, value: '', checked: !preset }), h('span', {}, list.length ? 'Nenhum destes' : 'Sem resultados nesta fonte')));
  const parliament = group('teia-parl', 'No Parlamento', people,
    (entry) => [entry.np && entry.np !== entry.nome ? entry.np : '', (entry.partidos || []).join(', '),
      entry.legs?.length ? `deputado em ${plural(entry.legs.length, 'legislatura', 'legislaturas')} (${entry.legs.join(', ')})` : ''].filter(Boolean).join(' · '),
    person, failure(found.people, 'O índice do Parlamento'), 'Declarações de interesses e biografias de quem foi deputado.');
  const contracts = group('teia-ent', 'Nos contratos públicos', entities,
    (entry) => [entry.nif ? `NIF ${entry.nif}` : 'sem NIF no registo', plural(entry.contratos || 0, 'ocorrência no índice', 'ocorrências no índice'), PAPEIS[entry.papeis] || ''].filter(Boolean).join(' · '),
    entity, failure(found.entities, 'O índice de contratos'), `Portal BASE desde 2012. Confirma pelo NIF quando o conheces. ${INDEX_COUNT_HELP}`);
  const wikidata = group('teia-wd', 'Na Wikidata', items, (entry) => [entry.descricao || 'sem descrição', entry.id].join(' · '),
    item, failure(found.wikidata, 'A Wikidata'), 'Cargos, empresas e datas registados de forma estruturada.');
  const sync = () => {
    const kind = form.elements['teia-kind'].value;
    parliament.hidden = kind !== 'person';
    contracts.hidden = kind !== 'org';
  };
  const kind = h('fieldset', { class: 'teia-kind' }, h('legend', {}, `«${q}» é…`),
    ...[['person', 'uma pessoa'], ['org', 'uma entidade']].map(([value, label]) => h('label', { class: 'teia-toggle' },
      h('input', { type: 'radio', name: 'teia-kind', value, checked: value === tipo, onchange: sync }), h('span', {}, label))));
  const form = h('form', {
    class: 'teia-identity',
    onsubmit: (event) => {
      event.preventDefault();
      const data = new FormData(form);
      const chosenKind = data.get('teia-kind') === 'org' ? 'org' : 'person';
      const pick = (name, list) => { const value = data.get(name); return value ? list[Number(value)] || null : null; };
      const choice = { parl: chosenKind === 'person' ? pick('teia-parl', people) : null, ent: chosenKind === 'org' ? pick('teia-ent', entities) : null, wd: pick('teia-wd', items) };
      const nome = cleanText(chosenKind === 'person' ? choice.parl?.np || choice.wd?.nome || choice.parl?.nome || q : choice.wd?.nome || short(choice.ent?.nome) || q, 200);
      work(`A abrir a investigação sobre ${nome}…`, (signal) => begin(nome, chosenKind, choice, signal));
    },
  }, kind, parliament, contracts, wikidata,
  h('div', { class: 'teia-actions' },
    h('button', { type: 'submit', class: 'teia-primary', 'data-work': '' }, 'Começar a investigar'),
    h('button', { type: 'button', 'data-work': '', onclick: () => { renderEntry(); focusHeading(); } }, '← Outra pesquisa')));
  stage.replaceChildren(h('div', { class: 'teia-entry' },
    h('p', { class: 'teia-kicker' }, 'Passo 1 · identidade'),
    h('h2', { tabindex: '-1' }, `Quem é «${q}»?`),
    h('p', { class: 'teia-lead' }, 'Confirma em cada fonte. Homónimos são o erro mais comum: na dúvida, escolhe «Nenhum destes». Podes juntar fontes mais tarde.'),
    form));
  sync();
}

async function begin(nome, tipo, choice, signal) {
  const draft = G.createGraph({ tipo, nome });
  const notes = [];
  if (choice.parl) {
    const file = await race(client.person(choice.parl.id), signal);
    if (file) G.addParliament(draft, file);
    else notes.push('A ficha do Parlamento não foi encontrada no índice.');
  }
  if (choice.ent) {
    if (choice.ent.nif) G.confirmIdentity(draft, SUBJECT, { nif: choice.ent.nif, nome: choice.ent.nome });
    else draft.identidades.push({ no: SUBJECT, nif: '', nome: choice.ent.nome, base: choice.ent.id, fonte: 'Portal BASE', confirmadoEm: new Date().toISOString(), por: 'utilizador' });
    const [supplier, buyer, fundamentos] = await Promise.all([
      choice.ent.papeis?.includes('f') ? race(client.supplier(choice.ent.id), signal) : null,
      choice.ent.papeis?.includes('a') ? race(client.buyer(choice.ent.id), signal) : null,
      race(client.fundamentos(), signal).catch(() => []),
    ]);
    if (supplier) G.addSupplier(draft, SUBJECT, supplier, { fundamentos });
    if (buyer) G.addBuyer(draft, SUBJECT, buyer);
  }
  if (choice.wd) {
    try {
      const { perfil } = await fromSource({ fonte: 'wikidata', id: choice.wd.id }, signal);
      G.addWikidata(draft, perfil);
    } catch (error) {
      if (signal.aborted) throw abortError();
      notes.push(`Wikidata: ${error.message}`);
    }
  }
  G.consolidateOrgs(draft);
  checkpoint(signal);
  const offices = S.officesOf(draft, SUBJECT);
  const resumo = draft.nos[SUBJECT].contratosResumo;
  const parts = [
    offices.length ? plural(offices.length, 'cargo público', 'cargos públicos') : '',
    linkedTo(draft, SUBJECT).length ? plural(linkedTo(draft, SUBJECT).length, 'entidade ligada', 'entidades ligadas') : '',
    resumo ? `${plural(resumo.n, 'contrato público', 'contratos públicos')} (${S.euro(resumo.v)})` : '',
  ].filter(Boolean);
  const texto = `${nome}: ${parts.length ? `${parts.join(', ')} e ` : ''}${plural(draft.afirmacoes.length, 'facto', 'factos')} com fonte. Segue a primeira pergunta.`;
  draft.vistos = [];
  openGraph(draft, { texto, notas: notes });
}

// ——— bancada ———

const years = (item) => `${item.inicio ? String(item.inicio).slice(0, 4) : '?'}–${item.atual ? 'hoje' : item.fim ? String(item.fim).slice(0, 4) : '?'}`;
const SOURCE_OF = { wikipedia: 'Wikipédia', contratos: 'Portal BASE (contratos públicos)', dr: 'Diário da República', declarantes: 'Registo de interesses do Parlamento' };

function renderDesk() {
  if (!graph) return;
  const result = S.evaluateSignals(graph);
  const { perguntas } = S.nextQuestions(graph, { limit: 40 });
  const skipped = new Set(graph.adiadas.map((item) => item.id));
  const questions = perguntas.filter((item) => !skipped.has(item.id));
  const parked = graph.adiadas.filter((item) => perguntas.some((question) => question.id === item.id));
  webSvg = null;
  stage.replaceChildren(h('div', { class: 'teia-desk' },
    portrait(),
    findingBanner(),
    result.todos.length ? signalsSection(result) : null,
    questionsSection(questions, result.todos.length),
    webSection(result),
    timelineSection(result),
    trailSection(parked),
    notebookSection()));
  if (pinned.length) light(pinned);
  const frame = stage.querySelector('.teia-web-frame');
  if (frame && frame.scrollWidth > frame.clientWidth) frame.scrollLeft = (frame.scrollWidth - frame.clientWidth) / 2;
}

function sourceFamilies() {
  const alvo = graph.nos[SUBJECT];
  const names = graph.afirmacoes.map((item) => item.fonte?.nome || '');
  const asked = (prefix) => graph.consultas.some((item) => String(item.pergunta || '').startsWith(prefix));
  return [
    ['Parlamento', Boolean(alvo.ids.parlamento) || names.some((name) => name.includes('Assembleia da República'))],
    ['Contratos públicos', Object.keys(graph.contratos).length > 0 || Object.values(graph.nos).some((node) => node.compras) || asked('contratos:')],
    ['Diário da República', graph.consultas.some((item) => item.fonte === 'dr')],
    ['Wikidata', Boolean(alvo.ids.wikidata)],
    ['Wikipédia', names.some((name) => name.startsWith('Wikipédia')) || asked('fontes')],
    ['As tuas provas', graph.afirmacoes.some((item) => item.fonte?.tipo === 'manual')],
  ];
}

function portrait() {
  const alvo = graph.nos[SUBJECT];
  const name = short(alvo.nome) || alvo.nome;
  const initials = name.split(/[\s-]+/).filter((word) => /^\p{Lu}/u.test(word)).map((word) => word[0]).join('').slice(0, 2) || name.slice(0, 2).toUpperCase();
  const offices = S.officesOf(graph, SUBJECT);
  const ordered = [...offices.filter((item) => item.atual), ...offices.filter((item) => !item.atual)].slice(0, 6);
  const contracts = Object.values(graph.nos).reduce((sum, node) => sum + (node.contratosResumo?.n || 0), 0);
  const decisions = new Set(graph.afirmacoes.filter((item) => item.rel === 'ato' && item.classe?.decisao).map((item) => item.de)).size;
  const gauges = [
    [graph.afirmacoes.length, 'factos com fonte'],
    [linkedTo(graph, SUBJECT).length, 'entidades ligadas'],
    [contracts, 'contratos públicos'],
    [decisions, 'decisões do Estado'],
  ];
  return h('section', { class: 'teia-portrait', 'aria-labelledby': 'teia-subject' },
    h('div', { class: 'teia-monogram', 'aria-hidden': 'true' }, initials),
    h('div', { class: 'teia-portrait-body' },
      h('p', { class: 'teia-kicker' }, `${KIND[alvo.tipo] || 'Alvo'} em escrutínio`),
      h('h2', { id: 'teia-subject', tabindex: '-1' }, alvo.nome),
      alvo.descricao ? h('p', { class: 'teia-description' }, alvo.descricao) : null,
      ordered.length ? h('ul', { class: 'teia-offices', 'aria-label': 'Cargos públicos' },
        ordered.map((office) => h('li', { class: office.atual ? 'is-current' : '' }, cleanText(office.detalhe || nameOf(office.para), 90), h('span', {}, ` ${years(office)}`)))) : null,
      h('ul', { class: 'teia-sources', 'aria-label': 'Fontes cruzadas' },
        sourceFamilies().map(([label, on]) => h('li', { 'data-on': on ? 'true' : 'false' },
          h('span', { 'aria-hidden': 'true' }, on ? '●' : '○'), ` ${label}`, h('span', { class: 'teia-sr' }, on ? ' (consultada)' : ' (por consultar)')))),
      h('div', { class: 'teia-gauges' }, gauges.map(([value, label]) => h('p', {}, h('strong', {}, String(value)), h('span', {}, label)))),
      h('button', { type: 'button', onclick: (event) => openNode(SUBJECT, event.currentTarget) }, 'Tudo o que sabemos')));
}

function findingBanner() {
  if (!finding) return null;
  return h('section', { class: 'teia-finding', 'aria-labelledby': 'teia-finding-h' },
    h('h3', { id: 'teia-finding-h', tabindex: '-1' }, 'O que encontrámos'),
    h('p', {}, finding.texto),
    finding.notas?.length ? h('ul', { class: 'teia-notes' }, finding.notas.map((note) => h('li', {}, note))) : null,
    h('div', { class: 'teia-actions' },
      fresh.size ? h('button', { type: 'button', class: 'teia-primary', onclick: () => focusHeading('#teia-signals-h') }, `Ver ${plural(fresh.size, 'sinal novo', 'sinais novos')}`) : null,
      finding.acao ? h('button', { type: 'button', onclick: (event) => finding.acao.fn(event.currentTarget) }, finding.acao.rotulo) : null));
}

function questionsSection(questions, signals) {
  const [lead, ...rest] = questions;
  const section = h('section', { class: 'teia-questions', 'aria-labelledby': 'teia-questions-h' },
    h('h3', { id: 'teia-questions-h', tabindex: '-1' }, signals ? 'Pergunta seguinte' : 'Primeira pergunta'),
    signals ? null : h('p', { class: 'meta' }, 'Ainda nenhum sinal. Cada pergunta cruza mais uma fonte; os sinais aparecem quando os factos se encontram.'));
  if (!lead) {
    section.append(h('p', {}, 'Esgotámos as perguntas automáticas com os dados recolhidos. Acrescenta provas tuas — uma notícia, um registo comercial, uma declaração — e a Teia volta a cruzar tudo.'),
      h('button', { type: 'button', onclick: (event) => openManual({}, event.currentTarget) }, 'Acrescentar prova'));
    return section;
  }
  section.append(questionCard(lead, true));
  if (rest.length) {
    section.append(h('details', { class: 'teia-more' }, h('summary', {}, `Outras pistas (${rest.length})`),
      h('div', { class: 'teia-question-list' }, rest.map((question) => questionCard(question, false)))));
  }
  return section;
}

function questionCard(question, lead) {
  const action = question.acao;
  const external = action.tipo === 'externo';
  return h('article', { class: `teia-question${lead ? ' is-lead' : ''}` },
    lead ? h('p', { class: 'teia-kicker' }, 'A pista mais promissora') : null,
    h('h4', {}, question.texto),
    h('p', { class: 'teia-why' }, question.porque),
    h('p', { class: 'teia-where' }, `Onde: ${external ? action.fonte || 'fonte externa' : SOURCE_OF[action.tipo] || 'fontes públicas'}`),
    h('div', { class: 'teia-actions' },
      external
        ? [outLink(action.url, 'Abrir a fonte', { class: 'teia-button' }),
          h('button', { type: 'button', 'data-work': '', onclick: () => consulted(question) }, 'Já consultei')]
        : h('button', { type: 'button', class: lead ? 'teia-primary' : '', 'data-work': '', onclick: () => investigate(question) }, 'Investigar'),
      h('button', { type: 'button', class: 'teia-quiet', 'data-work': '', onclick: () => park(question) }, 'Agora não')));
}

function park(question) {
  if (busy) return;
  graph.adiadas.push({ id: question.id, texto: question.texto });
  persist();
  renderDesk();
  focusHeading('#teia-questions-h');
  announce('Pista adiada. Podes retomá-la no teu percurso.');
}

function unpark(id) {
  graph.adiadas = graph.adiadas.filter((item) => item.id !== id);
  persist();
  renderDesk();
  focusHeading('#teia-questions-h');
  announce('Pista retomada.');
}

function consulted(question) {
  if (busy) return;
  S.markAsked(graph, question.id, { texto: question.texto, resumo: 'Consultaste a fonte fora da Teia.' });
  afterChange(`Consultaste: ${question.acao.fonte || 'fonte externa'}. Se encontraste algo relevante, acrescenta-o como prova: a Teia volta a cruzar tudo.`, [],
    { rotulo: 'Acrescentar prova', fn: (trigger) => openManual({}, trigger) });
}

function investigate(question) {
  const where = SOURCE_OF[question.acao.tipo] || 'as fontes';
  work(`A consultar ${where}: ${question.texto}`, (signal) => runQuestion(question, signal));
}

// Cada passo corre sobre uma cópia: se for cancelado ou falhar, a investigação fica exatamente como estava.
async function runQuestion(question, signal) {
  const draft = structuredClone(graph);
  const step = STEPS[question.acao.tipo];
  if (!step) throw new Error('Esta pergunta não tem consulta automática.');
  const outcome = await step(draft, question.acao, signal);
  checkpoint(signal);
  S.markAsked(draft, question.id, { texto: question.texto, resumo: outcome.resumo, ...(outcome.consulta ? { consulta: outcome.consulta } : {}) });
  graph = draft;
  afterChange(outcome.resumo, outcome.notas);
}

function afterChange(resumo, notas = [], acao = null) {
  const ids = S.evaluateSignals(graph).todos.map((signal) => signal.id);
  fresh = new Set(ids.filter((id) => !shown.has(id)));
  for (const id of fresh) shown.add(id);
  finding = { texto: resumo, notas: notas || [], acao };
  persist();
  renderDesk();
  focusHeading('.teia-finding h3');
  announce(`${resumo}${fresh.size ? ` ${plural(fresh.size, 'sinal novo', 'sinais novos')}.` : ''}`);
}

const STEPS = {
  async wikipedia(draft, action, signal) {
    let wiki;
    try { wiki = await fromSource({ fonte: 'wikipedia', titulo: action.titulo }, signal); }
    catch (error) {
      if (signal.aborted || !/não encontrad/i.test(error.message)) throw error;
      return { resumo: `Não há artigo da Wikipédia com o título «${action.titulo}». Procura notícias de referência e acrescenta o que encontrares como prova.` };
    }
    const alvo = draft.nos[SUBJECT];
    const mentions = G.extractOrganisations(wiki.texto, { exclude: alvo.nomes, entidade: alvo.tipo === 'org' });
    const before = draft.fusoes?.length || 0;
    G.addCoMentions(draft, mentions, { tipo: 'secundaria', nome: `Wikipédia: ${wiki.titulo} (revisão de ${S.shortDate(wiki.dataRevisao)})`, url: wiki.revisao || wiki.url, recolhidoEm: wiki.recolhidoEm });
    const merged = G.consolidateOrgs(draft).slice(before);
    if (!mentions.length) return { resumo: `O artigo «${wiki.titulo}» da Wikipédia não menciona outras entidades.` };
    const family = mentions.filter((item) => item.familia);
    const payer = mentions.find((item) => item.paga);
    const paid = payer && (payer.paga.para === '@alvo' ? `a ${alvo.nome}`
      : payer.paga.para === '@familia' ? (family.length === 1 ? `à ${short(family[0].nome)} (empresa familiar)` : 'à empresa familiar')
        : `a ${short(payer.paga.para)}`);
    const shown = mentions.slice(0, 4).map((item) => short(item.nome)).join(', ');
    const parts = [`O artigo «${wiki.titulo}» da Wikipédia menciona ${plural(mentions.length, 'entidade', 'entidades')} ao lado de ${alvo.nome}: ${shown}${mentions.length > 4 ? ` e mais ${mentions.length - 4}` : ''}.`];
    if (family.length) parts.push(`${family.map((item) => short(item.nome)).join(', ')} ${family.length === 1 ? 'surge' : 'surgem'} como empresa familiar.`);
    if (payer) parts.push(`O texto diz que ${short(payer.nome)} paga ${paid}${payer.paga.inicio ? ` desde ${payer.paga.inicio}` : ''}.`);
    return { resumo: parts.join(' '), notas: merged.map((item) => `«${item.de}» foi tratada como ${item.nome} (denominação semelhante). Confirma na ficha da entidade.`) };
  },

  async contratos(draft, action, signal) {
    const node = draft.nos[action.no];
    if (!node) return { resumo: 'Esta entidade já não está na investigação.' };
    const names = unique([action.nome, ...(action.nomes || []), ...node.nomes]).slice(0, 4);
    const settled = await Promise.allSettled(names.map((name) => race(client.searchEntities(name), signal)));
    checkpoint(signal);
    const results = settled.filter((item) => item.status === 'fulfilled').map((item) => item.value);
    if (!results.length) throw settled[0].reason;
    const ranked = G.rankIdentityCandidates(node, results);
    if (!ranked.length) return { resumo: `${short(node.nome)} não aparece nos contratos públicos desde 2012 com este nome. Se conheceres o NIF ou outra denominação, acrescenta-a como prova.` };
    const choice = await chooseIdentity(node, ranked, signal);
    if (choice === null) throw abortError();
    if (!choice) return { resumo: `Indicaste que nenhum registo dos contratos públicos corresponde a ${short(node.nome)}.` };
    const kept = choice.nif ? G.confirmIdentity(draft, action.no, { nif: choice.nif, nome: choice.nome }) : action.no;
    if (!choice.nif) draft.identidades.push({ no: kept, nif: '', nome: choice.nome, base: choice.id, fonte: 'Portal BASE', confirmadoEm: new Date().toISOString(), por: 'utilizador' });
    const [supplier, buyer, fundamentos] = await Promise.all([
      choice.papeis?.includes('f') ? race(client.supplier(choice.id), signal) : null,
      choice.papeis?.includes('a') ? race(client.buyer(choice.id), signal) : null,
      race(client.fundamentos(), signal).catch(() => []),
    ]);
    if (supplier) G.addSupplier(draft, kept, supplier, { fundamentos });
    if (buyer) G.addBuyer(draft, kept, buyer);
    const sold = draft.nos[kept].contratosResumo;
    const bought = draft.nos[kept].compras;
    const parts = [];
    if (sold) parts.push(`${short(choice.nome)} recebeu ${plural(sold.n, 'contrato público', 'contratos públicos')} (${S.euro(sold.v)}) entre ${S.shortDate(sold.d0)} e ${S.shortDate(sold.d1)}.`);
    if (bought) parts.push(`Como adjudicante, celebrou ${plural(bought.n, 'contrato', 'contratos')} (${S.euro(bought.v)}) com ${plural(bought.totalFornecedores || 0, 'fornecedor', 'fornecedores')}.`);
    return { resumo: parts.join(' ') || `${short(choice.nome)} não tem contratos no índice.` };
  },

  async dr(draft, action, signal) {
    const queries = unique(action.qs || [action.q]);
    const before = new Set(Object.keys(draft.nos));
    let total = 0;
    for (const q of queries) {
      checkpoint(signal);
      const response = await fromSource({ fonte: 'dr', q, offset: 0 }, signal);
      G.addActs(draft, action.no, response, { ligacao: action.ligacao, consulta: q });
      total += response.total || 0;
    }
    const added = draft.afirmacoes.filter((item) => item.rel === 'ato' && item.para === action.no && !before.has(item.de));
    // As decisões tomadas enquanto o titular exercia um cargo executivo são as que importam: vêm primeiro, as mais recentes à frente.
    const executive = S.officesOf(draft, SUBJECT).filter((office) => office.cargo.executivo);
    const during = (item) => executive.some((office) => G.activeOn(office, item.data) !== 'nao');
    const decisions = added.filter((item) => item.classe?.decisao)
      .sort((a, b) => Number(during(b)) - Number(during(a)) || String(b.data || '').localeCompare(String(a.data || '')));
    const inOffice = decisions.filter(during);
    const target = action.ligacao === 'objeto' ? `«${action.q}»` : short(draft.nos[action.no]?.nome);
    const consulta = action.ligacao === 'objeto' ? action.q : '';
    if (!added.length) return { resumo: `O Diário da República não tem publicações novas sobre ${target}${total ? ` (${plural(total, 'resultado', 'resultados')}, já conhecidos)` : ''}.`, consulta };
    const examples = (inOffice.length ? inOffice : decisions).slice(0, 2).map((item) => `${item.classe.decisao}, ${S.shortDate(item.data)}`).join('; ');
    const who = draft.nos[SUBJECT]?.nome;
    let when = '';
    if (executive.length && decisions.length === 1) when = inOffice.length ? `, tomada enquanto ${who} exercia funções executivas` : `, mas não enquanto ${who} exercia funções executivas`;
    else if (executive.length && decisions.length) {
      when = !inOffice.length ? `, nenhuma enquanto ${who} exercia funções executivas`
        : `; ${inOffice.length === decisions.length ? 'todas' : inOffice.length} enquanto ${who} exercia funções executivas`;
    }
    const found = decisions.length ? `${decisions.length === 1 ? 'Uma é decisão do Estado' : `${decisions.length} são decisões do Estado`}${when} (${examples}).`
      : 'Nenhuma é uma decisão do Estado sobre a entidade.';
    return {
      resumo: `${plural(added.length, 'publicação nova', 'publicações novas')} na pesquisa do Diário da República por ${target}. ${found}`,
      consulta,
      notas: [action.ligacao === 'objeto'
        ? 'Estas publicações tratam do mesmo assunto, mas podem não nomear a entidade: lê cada uma antes de as ligar.'
        : 'Encontrar o nome não confirma quem recebeu a decisão. O ato pode referir uma filial, uma homónima ou uma concorrente: confirma a denominação, o NIF e o papel no texto integral.'],
    };
  },

  async declarantes(draft, action, signal) {
    const names = unique([action.nome, ...draft.nos[SUBJECT].nomes]).slice(0, 3);
    const lists = await Promise.all(names.map((name) => race(client.declaredBy(name), signal)));
    const seen = new Set();
    const entries = lists.flat().filter((entry) => {
      const key = [entry.pessoa, entry.leg, entry.tipo, entry.entidade].join('|');
      return !seen.has(key) && seen.add(key);
    });
    if (!entries.length) return { resumo: `Ninguém declarou ligação a ${short(action.nome)} no registo de interesses do Parlamento.` };
    G.addDeclarants(draft, entries, await race(client.people(), signal));
    const who = unique(entries.map((entry) => draft.nos[`parl:${entry.pessoa}`]?.nome));
    return {
      resumo: `${who.length === 1 ? '1 titular declarou' : `${who.length} titulares declararam`} ligação a ${short(action.nome)}: ${who.slice(0, 4).join(', ')}${who.length > 4 ? '…' : ''}.`,
      notas: ['O nome declarado pode ser de outra entidade com denominação parecida: abre cada pessoa e confirma a citação.'],
    };
  },
};

function trailSection(parked) {
  const steps = graph.consultas.filter((item) => item.pergunta);
  return h('section', { class: 'teia-trail', 'aria-labelledby': 'teia-trail-h' },
    h('h3', { id: 'teia-trail-h' }, 'O teu percurso'),
    steps.length
      ? h('ol', { class: 'teia-trail-list' }, steps.map((item) => h('li', {},
        h('strong', {}, item.texto || item.pergunta), item.resumo ? ` ${item.resumo}` : '', h('span', { class: 'meta' }, ` · ${S.shortDate(item.em)}`))))
      : h('p', { class: 'meta' }, 'Ainda não seguiste nenhuma pergunta.'),
    parked.length ? h('div', { class: 'teia-parked' }, h('h4', {}, 'Pistas adiadas'),
      h('ul', {}, parked.map((item) => h('li', {}, item.texto, ' ', h('button', { type: 'button', class: 'teia-quiet', 'data-work': '', onclick: () => unpark(item.id) }, 'Retomar'))))) : null,
    graph.identidades.length ? h('details', {}, h('summary', {}, `Identidades que confirmaste (${graph.identidades.length})`),
      h('ul', {}, graph.identidades.map((item) => h('li', {}, `${nameOf(item.no)} = ${item.nome || ''}${item.nif ? `, NIF ${item.nif}` : ''} (${item.fonte || 'fonte'}, ${S.shortDate(item.confirmadoEm)})`)))) : null);
}

function notebookSection() {
  const remember = h('input', {
    type: 'checkbox', id: 'teia-remember', checked: Boolean(graph.lembrar),
    onchange: () => {
      graph.lembrar = remember.checked;
      if (!graph.lembrar) { forget(); announce('A investigação deixou de estar guardada neste navegador.'); return; }
      persist();
      if (graph.lembrar) announce('A investigação fica guardada neste navegador.');
      else remember.checked = false;
    },
  });
  return h('section', { class: 'teia-notebook', 'aria-labelledby': 'teia-notebook-h' },
    h('h3', { id: 'teia-notebook-h' }, 'Caderno'),
    h('p', {}, 'Tudo o que recolheste, com fontes, sinais, lacunas e consultas feitas. O caderno .md lê-se em qualquer editor; o ficheiro .json retoma a investigação.'),
    h('div', { class: 'teia-actions' },
      h('button', { type: 'button', onclick: () => { download(fileName('md'), S.notebookMarkdown(graph), 'text/markdown;charset=utf-8'); announce('Caderno descarregado.'); } }, 'Descarregar caderno (.md)'),
      h('button', { type: 'button', onclick: () => { download(fileName('json'), S.exportGraph(graph), 'application/json'); announce('Investigação descarregada.'); } }, 'Guardar investigação (.json)'),
      h('button', { type: 'button', onclick: (event) => openManual({}, event.currentTarget) }, 'Acrescentar prova')),
    h('label', { class: 'teia-check', for: 'teia-remember' }, remember, ' Lembrar esta investigação neste navegador'),
    h('p', { class: 'meta' }, 'Desligado por omissão. Fica só neste dispositivo: quem usar o mesmo navegador pode vê-la.'),
    h('button', {
      type: 'button', class: 'teia-quiet', 'data-work': '',
      onclick: () => {
        if (!window.confirm('Começar uma nova investigação? A atual só fica guardada se a descarregaste ou a lembraste neste navegador.')) return;
        renderEntry();
        focusHeading();
      },
    }, 'Nova investigação'));
}

// ——— sinais ———

const signalNodes = (signal) => unique([signal.sujeito, signal.entidade, signal.ligada, ...(signal.cadeia || []).map((item) => item.no)])
  .filter((id) => graph.nos[id] && !graph.nos[id].privado);
const details = (summary, items, className = '') => h('details', { class: className }, h('summary', {}, `${summary} (${items.length})`), h('ul', {}, items));

function signalsSection(result) {
  return h('section', { class: 'teia-signals', 'aria-labelledby': 'teia-signals-h' },
    h('h3', { id: 'teia-signals-h', tabindex: '-1' }, 'Sinais que merecem pergunta'),
    h('p', { class: 'meta' }, 'Não são acusações. Cada sinal junta critérios da lei, diz o que está confirmado e o que falta, e mostra outras explicações possíveis.'),
    h('div', { class: 'teia-signal-list' }, result.visiveis.map(signalCard)),
    result.outros.length ? h('details', { class: 'teia-more' }, h('summary', {}, `Outros sinais (${result.outros.length})`),
      h('div', { class: 'teia-signal-list' }, result.outros.map(signalCard))) : null);
}

function chain(steps) {
  return h('ol', { class: 'teia-chain', 'aria-label': 'Cadeia de ligações' }, steps.map((step) =>
    h('li', { 'data-role': step.papel }, h('button', { type: 'button', class: 'teia-chain-node', onclick: (event) => openNode(step.no, event.currentTarget) },
      h('span', { class: 'teia-role' }, ROLE[step.papel] || step.papel),
      h('span', { class: 'teia-chain-name' }, short(step.nome)),
      step.data ? h('span', { class: 'teia-role' }, S.shortDate(step.data)) : null))));
}

function itemRow(item) {
  const text = item.texto || [item.procedimento || 'Contrato', S.euro(item.valor), item.adjudicante, item.objeto].filter(Boolean).join(' · ');
  return h('li', { class: 'teia-item' },
    item.estado ? h('span', { class: 'teia-mark', 'data-state': item.estado, 'aria-hidden': 'true' }, MARK[item.estado]?.[0] || '') : null,
    h('span', {}, item.estado ? h('span', { class: 'teia-sr' }, `${MARK[item.estado]?.[1] || ''}: `) : null,
      h('span', { class: 'meta' }, `${S.shortDate(item.data)} · `), item.url ? outLink(item.url, text) : text,
      item.emissor ? h('span', { class: 'meta' }, ` · ${item.emissor}`) : null));
}

function signalCard(signal) {
  const ids = signalNodes(signal);
  const key = ids.join('|');
  const isNew = fresh.has(signal.id);
  const counts = signal.contagem;
  const card = h('article', {
    class: `teia-signal${isNew ? ' is-new' : ''}`, 'data-pattern': signal.padrao,
    onmouseenter: () => light(ids), onmouseleave: () => light(pinned),
    onfocusin: () => light(ids), onfocusout: (event) => { if (!card.contains(event.relatedTarget)) light(pinned); },
  },
  h('p', { class: 'teia-kicker' }, signal.titulo, isNew ? h('span', { class: 'teia-new' }, 'Novo') : null),
  h('h4', {}, signal.pergunta),
  h('p', { class: 'teia-summary' }, signal.resumo),
  signal.cadeia?.length ? chain(signal.cadeia) : null,
  h('p', { class: 'teia-tally' }, `${counts.sim} ${counts.sim === 1 ? 'critério confirmado' : 'critérios confirmados'} · ${counts.talvez} por confirmar · ${counts.nao} contra`),
  h('ul', { class: 'teia-criteria' }, signal.criterios.map((item) => h('li', { 'data-state': item.estado },
    h('span', { class: 'teia-mark', 'aria-hidden': 'true' }, MARK[item.estado][0]),
    h('span', {}, h('span', { class: 'teia-sr' }, `${MARK[item.estado][1]}: `), h('strong', {}, item.texto),
      item.nota ? h('span', { class: 'teia-note-text' }, ` ${item.nota}`) : null,
      item.provas?.length ? [' ', h('button', { type: 'button', class: 'teia-link', onclick: (event) => openProofs(item.texto, item.provas, event.currentTarget) }, `provas (${item.provas.length})`)] : null)))),
  signal.alternativas?.length ? h('p', { class: 'teia-alt' }, h('strong', {}, 'Outra explicação possível: '), signal.alternativas[0]) : null,
  signal.alternativas?.length > 1 ? details('Outras explicações', signal.alternativas.slice(1).map((text) => h('li', {}, text))) : null,
  signal.lacunas?.length ? details('O que falta confirmar', signal.lacunas.map((gap) => h('li', {}, gap.texto,
    gap.fonte ? [' ', outLink(gap.fonte.url, gap.fonte.nome)] : null,
    gap.modelo === 'lada' ? [' ', h('button', { type: 'button', class: 'teia-link', onclick: (event) => openLada(signal, event.currentTarget) }, 'pedir documentos')] : null))) : null,
  signal.itens?.length ? details('Registos', signal.itens.slice(0, 12).map(itemRow)) : null,
  h('p', { class: 'teia-law' }, h('span', {}, 'Lei: '), signal.lei.flatMap((law, index) => [index ? ' · ' : '', lawLink(law)])),
  h('div', { class: 'teia-actions' },
    h('button', { type: 'button', class: 'teia-primary', onclick: (event) => openReply(signal, event.currentTarget) }, 'Pedir comentário'),
    h('button', { type: 'button', onclick: (event) => openLada(signal, event.currentTarget) }, 'Pedir documentos'),
    h('button', { type: 'button', onclick: (event) => openProofs(signal.pergunta, signal.provas, event.currentTarget) }, 'Ver provas'),
    h('button', { type: 'button', onclick: (event) => openManual({ de: signal.sujeito, para: signal.entidade }, event.currentTarget) }, 'Acrescentar prova'),
    h('button', { type: 'button', 'data-pin': key, 'aria-pressed': String(pinned.join('|') === key), onclick: () => pin(ids) }, 'Mostrar na teia')));
  return card;
}

function pin(ids) {
  const key = ids.join('|');
  pinned = pinned.join('|') === key ? [] : ids;
  const current = pinned.join('|');
  for (const button of stage.querySelectorAll('[data-pin]')) button.setAttribute('aria-pressed', String(Boolean(current) && button.dataset.pin === current));
  const clear = stage.querySelector('.teia-unpin');
  if (clear) clear.hidden = !pinned.length;
  light(pinned);
  if (pinned.length) focusHeading('#teia-web-h');
  announce(pinned.length ? `Na teia: ${ids.map((id) => short(nameOf(id))).join(', ')}.` : 'Destaque removido.');
}

function light(ids) {
  if (!webSvg?.isConnected) return;
  const set = new Set(ids || []);
  webSvg.classList.toggle('is-lighting', set.size > 0);
  for (const node of webSvg.querySelectorAll('[data-node]')) node.classList.toggle('is-lit', set.has(node.dataset.node));
  for (const edge of webSvg.querySelectorAll('[data-edge-a]')) edge.classList.toggle('is-lit', set.has(edge.dataset.edgeA) && set.has(edge.dataset.edgeB));
}

// ——— janelas ———

function factItem(item) {
  const kind = item.fonte?.tipo || 'secundaria';
  return h('li', { class: 'teia-fact' },
    h('span', { class: 'teia-badge', 'data-kind': kind }, SOURCE_BADGE[kind] || 'Fonte'), ' ',
    S.describeStatement(graph, item),
    item.inferido ? h('span', { class: 'teia-note-text' }, ` (${item.inferido})`) : null,
    item.fonte?.citacao ? h('q', {}, item.fonte.citacao) : null,
    h('span', { class: 'meta' }, outLink(item.fonte?.url, item.fonte?.nome || 'fonte'), item.fonte?.recolhidoEm ? ` · recolhido em ${S.shortDate(item.fonte.recolhidoEm)}` : ''));
}

function openProofs(title, ids, trigger) {
  const items = unique(ids).map((id) => graph.afirmacoes.find((item) => item.id === id)).filter(Boolean);
  openReading(`Provas: ${cleanText(title, 90)}`, [
    h('p', { class: 'meta' }, 'Cada facto com a fonte, a citação e a data de recolha. Confirma na origem antes de publicar.'),
    items.length ? h('ol', { class: 'teia-facts' }, items.map(factItem)) : h('p', {}, 'Sem provas registadas.'),
  ], { onBack: readingBackTo(trigger) });
}

function copyActions(textarea, base) {
  const status = h('p', { class: 'meta', role: 'status' });
  return h('div', {},
    h('div', { class: 'teia-actions' },
      h('button', {
        type: 'button',
        onclick: async () => {
          try { await navigator.clipboard.writeText(textarea.value); status.textContent = 'Texto copiado.'; }
          catch { textarea.select(); status.textContent = 'Não foi possível copiar: o texto ficou selecionado, usa Ctrl+C.'; }
        },
      }, 'Copiar'),
      h('button', { type: 'button', onclick: () => { download(`${base}-${today()}.txt`, textarea.value, 'text/plain;charset=utf-8'); status.textContent = 'Ficheiro descarregado.'; } }, 'Descarregar .txt')),
    status);
}

function openReply(signal, trigger) {
  const text = h('textarea', { class: 'model-text', rows: '18', 'aria-label': 'Pedido de comentário (podes editar)' });
  text.value = S.replyTemplate(graph, signal);
  openReading('Pedir comentário', h('div', { class: 'model-editor' },
    h('p', { class: 'meta' }, `Ouvir ${nameOf(signal.sujeito)} antes de publicar é um dever deontológico. Edita à vontade: o texto não sai do teu navegador.`),
    text, copyActions(text, 'pedido-de-comentario')), { onBack: readingBackTo(trigger) });
}

function openLada(signal, trigger) {
  const targets = S.ladaTargets(graph, signal);
  const text = h('textarea', { class: 'model-text', rows: '18', 'aria-label': 'Pedido de acesso a documentos (podes editar)' });
  const select = h('select', { id: 'teia-lada-target', onchange: () => { text.value = S.ladaTemplate(graph, signal, { entidade: select.value }); } },
    h('option', { value: '' }, 'Todas as entidades'), targets.map((name) => h('option', { value: name }, name)));
  select.value = targets[0] || '';
  text.value = S.ladaTemplate(graph, signal, { entidade: select.value });
  openReading('Pedir documentos (LADA)', h('div', { class: 'model-editor' },
    h('p', { class: 'meta' }, 'Qualquer pessoa pode pedir documentos administrativos, sem dizer porquê. A entidade tem 10 dias para responder; sem resposta, podes queixar-te à CADA.'),
    h('p', { class: 'meta' }, lawLink(S.LEGAL.ladaAcesso), ' · ', lawLink(S.LEGAL.ladaResposta), ' · ', outLink(S.MANUAL_SOURCES.cada.url, 'CADA')),
    targets.length ? [h('label', { for: 'teia-lada-target' }, 'Entidade a quem pedes'), select] : null,
    text, copyActions(text, 'pedido-lada')), { onBack: readingBackTo(trigger) });
}

function buyerName(id) {
  return graph.nos[`nif:${id}`]?.nome || graph.nos[`org:${String(id).replace(/^n:/, '')}`]?.nome || id;
}

function openNode(id, trigger) {
  const node = graph.nos[id];
  if (!node) return;
  const rank = { primaria: 0, manual: 1, secundaria: 2 };
  const facts = graph.afirmacoes.filter((item) => item.de === id || item.para === id)
    .sort((a, b) => (rank[a.fonte?.tipo] ?? 3) - (rank[b.fonte?.tipo] ?? 3) || String(b.data || b.inicio || '').localeCompare(String(a.data || a.inicio || '')));
  const wikidata = /^Q\d+$/.test(node.ids?.wikidata || '') ? `https://www.wikidata.org/wiki/${node.ids.wikidata}` : '';
  const aliases = (node.nomes || []).filter((name) => name !== node.nome);
  const sold = node.contratosResumo;
  const bought = node.compras;
  const rows = (graph.contratos[id] || []).slice().sort((a, b) => String(b.data).localeCompare(String(a.data))).slice(0, 15);
  const content = [
    h('p', { class: 'meta' }, [KIND[node.tipo] || 'Entidade', node.ids?.nif ? `NIF ${node.ids.nif}` : ''].filter(Boolean).join(' · '),
      wikidata ? [' · ', outLink(wikidata, `Wikidata ${node.ids.wikidata}`)] : null),
    node.privado ? h('p', {}, 'Pessoa privada: a Teia regista apenas que existe, a partir da declaração oficial, e nunca guarda o nome.') : null,
    id === SUBJECT && node.descricao ? h('p', {}, node.descricao) : null,
    node.tipo === 'act' ? [h('p', {}, node.sumario || ''), h('p', { class: 'meta' }, `${node.emissor || 'Emissor por apurar'} · ${S.shortDate(node.data)} · `, outLink(node.url, 'Ler no Diário da República'))] : null,
    aliases.length && !node.privado ? h('p', {}, h('strong', {}, 'Outras denominações: '), aliases.join('; ')) : null,
    ...graph.identidades.filter((item) => item.no === id).map((item) => h('p', { class: 'teia-note' },
      `Identidade confirmada por ti em ${S.shortDate(item.confirmadoEm)}: ${item.nome || ''}${item.nif ? `, NIF ${item.nif}` : ''} (${item.fonte || 'fonte'}).`)),
    ...(graph.fusoes || []).filter((item) => item.para === id).map((item) => h('p', { class: 'teia-note' },
      `A Teia juntou «${item.de}» a esta entidade (${item.motivo}). Se não for a mesma, regista a correção como prova.`)),
    sold ? [h('h3', {}, 'Contratos públicos como fornecedora'),
      h('p', {}, `${plural(sold.n, 'contrato', 'contratos')} (${S.euro(sold.v)}) entre ${S.shortDate(sold.d0)} e ${S.shortDate(sold.d1)}.${sold.omitidos ? ` ${sold.omitidos} sem detalhe no índice.` : ''}`)] : null,
    rows.length ? h('div', { class: 'teia-table-wrap', tabindex: '0', role: 'region', 'aria-label': 'Contratos mais recentes' },
      h('table', { class: 'teia-table' },
        h('caption', {}, rows.length < (sold?.n || 0) ? `Os ${rows.length} mais recentes` : 'Todos os contratos'),
        h('thead', {}, h('tr', {}, ['Data', 'Adjudicante', 'Objeto', 'Procedimento', 'Valor'].map((label) => h('th', { scope: 'col' }, label)))),
        h('tbody', {}, rows.map((row) => h('tr', {},
          h('td', {}, S.shortDate(row.data)),
          h('td', {}, (row.adjudicantes || []).map(buyerName).join('; ')),
          h('td', {}, outLink(row.url, cleanText(row.objeto, 140) || 'Ver contrato')),
          h('td', {}, row.procedimentoNome || row.procedimento || ''),
          h('td', { class: 'teia-num' }, S.euro(row.valor))))))) : null,
    bought ? [h('h3', {}, 'Contratos públicos como adjudicante'),
      h('p', {}, `${plural(bought.n, 'contrato', 'contratos')} (${S.euro(bought.v)}) entre ${S.shortDate(bought.d0)} e ${S.shortDate(bought.d1)}, com ${plural(bought.totalFornecedores || 0, 'fornecedor', 'fornecedores')}.`)] : null,
    h('h3', {}, `Factos com fonte (${facts.length})`),
    facts.length ? h('ol', { class: 'teia-facts' }, facts.slice(0, 60).map(factItem)) : h('p', {}, 'Ainda sem factos.'),
    facts.length > 60 ? h('p', { class: 'meta' }, `Mostramos 60 de ${facts.length}. O caderno .md tem todos.`) : null,
    node.privado || node.tipo === 'act' ? null : h('button', { type: 'button', onclick: (event) => openManual({ de: SUBJECT, para: id === SUBJECT ? '' : id }, event.currentTarget) }, 'Acrescentar prova'),
  ];
  openReading(`O que sabemos: ${node.privado ? node.nome : short(node.nome)}`, content.flat().filter(Boolean), { onBack: readingBackTo(trigger) });
}

const MANUAL_RELS = [
  ['participacao', 'participação social (De detém parte de Para)'],
  ['cargo-privado', 'função em entidade (De exerce funções em Para)'],
  ['servico', 'serviço prestado (De presta serviços a Para)'],
  ['cliente', 'pagamentos ou avenças (De paga a Para)'],
  ['manual', 'outra ligação'],
];

function openManual(preset = {}, trigger) {
  const nodes = Object.values(graph.nos).filter((node) => !node.privado && node.tipo !== 'act')
    .sort((a, b) => (a.id === SUBJECT ? -1 : b.id === SUBJECT ? 1 : a.nome.localeCompare(b.nome, 'pt')));
  const options = (selected) => nodes.map((node) => h('option', { value: node.id, selected: node.id === selected }, short(node.nome) || node.nome));
  const field = (id, label, control, hint) => h('div', { class: 'teia-field' }, h('label', { for: id }, label), control, hint ? h('p', { class: 'meta' }, hint) : null);
  const from = h('select', { id: 'teia-m-de' }, options(preset.de || SUBJECT));
  const to = h('select', { id: 'teia-m-para', onchange: () => { other.hidden = to.value !== '__nova'; } },
    h('option', { value: '__nova', selected: !preset.para }, 'Outra entidade (escrever o nome)'), options(preset.para || ''));
  const name = h('input', { id: 'teia-m-nome', maxlength: '200', autocomplete: 'off' });
  const other = field('teia-m-nome', 'Nome da entidade', name);
  const rel = h('select', { id: 'teia-m-rel' }, MANUAL_RELS.map(([value, label]) => h('option', { value }, label)));
  const detail = h('input', { id: 'teia-m-det', maxlength: '300', placeholder: 'Ex.: sócio-gerente; avença mensal' });
  const start = h('input', { id: 'teia-m-ini', type: 'date' });
  const end = h('input', { id: 'teia-m-fim', type: 'date' });
  const url = h('input', { id: 'teia-m-url', type: 'url', required: true, inputmode: 'url', placeholder: 'https://' });
  const source = h('input', { id: 'teia-m-fonte', required: true, maxlength: '200', placeholder: 'Ex.: Expresso, 3/3/2025; Registo comercial' });
  const quote = h('textarea', { id: 'teia-m-cit', rows: '3', maxlength: '600', placeholder: 'A frase exata que prova a ligação' });
  const error = h('p', { class: 'teia-form-error', role: 'alert' });
  const form = h('form', {
    class: 'teia-manual', novalidate: true,
    onsubmit: (event) => {
      event.preventDefault();
      let parsed = null;
      try { parsed = new URL(url.value.trim()); } catch { parsed = null; }
      const para = to.value === '__nova' ? '' : to.value;
      const nome = cleanText(name.value, 200);
      const problem = !parsed || parsed.protocol !== 'https:' ? ['Indica o endereço https da fonte.', url]
        : !cleanText(source.value) ? ['Indica o nome da fonte.', source]
          : !para && nome.length < 2 ? ['Escreve o nome da entidade.', name]
            : para === from.value ? ['Escolhe duas entidades diferentes.', to]
              : start.value && end.value && end.value < start.value ? ['A data de fim é anterior à de início.', end] : null;
      if (problem) { error.textContent = problem[0]; problem[1].focus(); return; }
      G.addManual(graph, { de: from.value, para: para || undefined, nome, rel: rel.value, detalhe: detail.value, inicio: start.value, fim: end.value,
        url: parsed.href, citacao: quote.value, fonteNome: source.value });
      G.consolidateOrgs(graph);
      document.querySelector('dialog.reading-dialog')?.close();
      afterChange(`Prova acrescentada: ${short(nameOf(from.value))} — ${MANUAL_RELS.find(([value]) => value === rel.value)[1].split(' (')[0]} — ${para ? short(nameOf(para)) : nome}. A Teia voltou a cruzar tudo.`);
    },
  },
  h('p', { class: 'meta' }, 'Uma notícia, um registo comercial, uma declaração única, uma ata. Fica marcada como prova tua e entra nos sinais como qualquer outra fonte.'),
  field('teia-m-de', 'De', from),
  field('teia-m-rel', 'Ligação', rel),
  field('teia-m-para', 'Para', to), other,
  field('teia-m-det', 'Pormenor (opcional)', detail),
  h('div', { class: 'teia-field-row' }, field('teia-m-ini', 'Desde (opcional)', start), field('teia-m-fim', 'Até (opcional)', end)),
  field('teia-m-url', 'Endereço da fonte', url, 'Só endereços https.'),
  field('teia-m-fonte', 'Nome da fonte', source),
  field('teia-m-cit', 'Citação (opcional)', quote),
  error,
  h('div', { class: 'teia-actions' }, h('button', { type: 'submit', class: 'teia-primary' }, 'Acrescentar')));
  other.hidden = Boolean(preset.para);
  openReading('Acrescentar prova', form, { onBack: readingBackTo(trigger) });
}

// Escolha humana da identidade num registo oficial: devolve o candidato, false («nenhum») ou null (janela fechada = cancelar).
function chooseIdentity(node, ranked, signal) {
  return new Promise((resolve) => {
    let dialog = null;
    let done = false;
    const finish = (value) => {
      if (done) return;
      done = true;
      dialog?.removeEventListener('close', onClose);
      signal.removeEventListener('abort', onAbort);
      if (dialog?.open) dialog.close();
      resolve(value);
    };
    const onClose = () => finish(null);
    const onAbort = () => finish(null);
    const preset = ranked.find((item) => item.coincide) || null;
    const form = h('form', {
      class: 'teia-choose',
      onsubmit: (event) => {
        event.preventDefault();
        const value = new FormData(form).get('teia-cand');
        finish(value ? ranked.find((item) => item.id === value) || false : false);
      },
    },
    h('fieldset', { class: 'teia-choices' }, h('legend', {}, 'Registos no Portal BASE'),
      ranked.map((item) => h('label', { class: 'teia-choice' },
        h('input', { type: 'radio', name: 'teia-cand', value: item.id, checked: item === preset }),
        h('span', {}, h('strong', {}, item.nome), h('span', { class: 'meta' },
          [item.nif ? `NIF ${item.nif}` : 'sem NIF', plural(item.contratos || 0, 'ocorrência no índice', 'ocorrências no índice'), PAPEIS[item.papeis] || '', item.coincide ? 'nome compatível' : 'nome diferente'].filter(Boolean).join(' · '))))),
      h('label', { class: 'teia-choice is-none' }, h('input', { type: 'radio', name: 'teia-cand', value: '', checked: !preset }), h('span', {}, 'Nenhum destes'))),
    h('div', { class: 'teia-actions' },
      h('button', { type: 'submit', class: 'teia-primary' }, 'Confirmar'),
      h('button', { type: 'button', onclick: () => finish(null) }, 'Cancelar')));
    openReading(`Qual destes registos é ${short(node.nome)}?`, [
      h('p', {}, 'Escolhe só se tiveres a certeza: o NIF passa a identificar a entidade em toda a investigação. Na dúvida, «Nenhum destes».'),
      h('p', { class: 'meta' }, INDEX_COUNT_HELP),
      (node.nomes || []).length > 1 ? h('p', { class: 'meta' }, `Nomes conhecidos: ${node.nomes.join('; ')}`) : null,
      form,
    ].filter(Boolean));
    dialog = document.querySelector('dialog.reading-dialog');
    dialog.addEventListener('close', onClose);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

// ——— a teia ———

const EDGE_KIND = { fornece: 'money', cliente: 'money', ato: 'act', 'cargo-publico': 'office', partido: 'office', membro: 'office' };
const EDGE_WEIGHT = { money: 7, tie: 6, act: 3, office: 2 };
const WEB = { cx: 360, cy: 262, r1: 150, r2: 238, squash: 0.86 };

function webModel(result) {
  const visible = (id) => graph.nos[id] && !graph.nos[id].privado;
  const score = new Map();
  const bump = (id, value) => { if (visible(id)) score.set(id, (score.get(id) || 0) + value); };
  const pairs = new Map();
  for (const item of graph.afirmacoes) {
    if (!item.para || item.de === item.para || !visible(item.de) || !visible(item.para)) continue;
    const [a, b] = [item.de, item.para].sort();
    const edge = pairs.get(`${a}|${b}`) || { a, b, kinds: new Set(), strong: false, items: [] };
    edge.kinds.add(EDGE_KIND[item.rel] || 'tie');
    edge.strong ||= item.rel !== 'ato' && (item.fonte?.tipo === 'primaria' || item.fonte?.tipo === 'manual');
    edge.items.push(item);
    pairs.set(`${a}|${b}`, edge);
  }
  for (const signal of result.todos) for (const id of signalNodes(signal)) bump(id, 20 + signal.pontuacao);
  for (const edge of pairs.values()) {
    const kind = edge.kinds.has('money') ? 'money' : edge.kinds.has('tie') ? 'tie' : edge.kinds.has('act') ? 'act' : 'office';
    edge.kind = kind;
    const other = edge.a === SUBJECT ? edge.b : edge.b === SUBJECT ? edge.a : '';
    if (other) bump(other, EDGE_WEIGHT[kind] + (edge.strong ? 2 : 0));
    if (edge.items.some((item) => item.rel === 'cliente')) { bump(edge.a, 4); bump(edge.b, 4); }
    if (edge.items.some((item) => item.rel === 'ato' && item.classe?.decisao)) for (const id of [edge.a, edge.b]) if (graph.nos[id]?.tipo === 'act') bump(id, 2);
  }
  score.set(SUBJECT, Infinity);
  const nodes = [...score.entries()].sort((a, b) => b[1] - a[1]).slice(0, 11).map(([id]) => id);
  const picked = new Set(nodes);
  return { nodes, edges: [...pairs.values()].filter((edge) => picked.has(edge.a) && picked.has(edge.b)), hidden: Math.max(0, score.size - nodes.length) };
}

const normAngle = (angle) => Math.atan2(Math.sin(angle), Math.cos(angle));

// Anéis: ligações diretas ao alvo no primeiro, o resto no segundo, perto da entidade por onde se chega lá.
function webLayout(model) {
  const { cx, cy, r2, squash } = WEB;
  const adjacent = new Map(model.nodes.map((id) => [id, new Set()]));
  for (const edge of model.edges) { adjacent.get(edge.a).add(edge.b); adjacent.get(edge.b).add(edge.a); }
  const ring1 = model.nodes.filter((id) => id !== SUBJECT && adjacent.get(SUBJECT).has(id));
  const ring2 = model.nodes.filter((id) => id !== SUBJECT && !adjacent.get(SUBJECT).has(id));
  const r1 = ring2.length ? WEB.r1 : 205;
  const angle = new Map();
  ring1.forEach((id, index) => angle.set(id, normAngle(-Math.PI / 2 + (index * 2 * Math.PI) / ring1.length)));
  const outer = ring2.map((id) => {
    const parents = [...adjacent.get(id)].filter((other) => angle.has(other));
    if (!parents.length) return { id, t: NaN };
    return { id, t: Math.atan2(parents.reduce((sum, other) => sum + Math.sin(angle.get(other)), 0), parents.reduce((sum, other) => sum + Math.cos(angle.get(other)), 0)) };
  });
  const loose = outer.filter((item) => Number.isNaN(item.t));
  loose.forEach((item, index) => { item.t = normAngle(Math.PI / 2 + Math.PI / Math.max(ring1.length, 2) + (index * 2 * Math.PI) / loose.length); });
  const gap = Math.min(Math.PI / 4, (2 * Math.PI) / Math.max(outer.length, 1));
  outer.sort((a, b) => a.t - b.t);
  for (let pass = 0; pass < 3; pass += 1) {
    for (let index = 1; index < outer.length; index += 1) if (outer[index].t - outer[index - 1].t < gap) outer[index].t = outer[index - 1].t + gap;
  }
  const place = (t, r) => ({ x: cx + r * Math.cos(t), y: cy + r * Math.sin(t) * squash });
  const positions = new Map([[SUBJECT, { x: cx, y: cy }]]);
  for (const id of ring1) positions.set(id, place(angle.get(id), r1));
  for (const item of outer) positions.set(item.id, place(item.t, r2));
  return { positions, adjacent };
}

function wrapLabel(text, width = 18, max = 3) {
  const lines = [''];
  for (const word of String(text).split(/\s+/)) {
    const line = lines.at(-1);
    if (!line) lines[lines.length - 1] = word;
    else if (`${line} ${word}`.length <= width) lines[lines.length - 1] = `${line} ${word}`;
    else lines.push(word);
  }
  if (lines.length > max) {
    lines[max - 1] = `${lines[max - 1].slice(0, width - 1)}…`;
    lines.length = max;
  }
  return lines.map((line) => (line.length > width + 2 ? `${line.slice(0, width)}…` : line));
}

function webSection(result) {
  const section = h('section', { class: 'teia-web', 'aria-labelledby': 'teia-web-h' },
    h('div', { class: 'teia-web-head' },
      h('h3', { id: 'teia-web-h', tabindex: '-1' }, 'A teia'),
      h('button', { type: 'button', class: 'teia-unpin teia-quiet', hidden: !pinned.length, onclick: () => pin(pinned) }, 'Limpar destaque')));
  const model = webModel(result);
  if (model.nodes.length < 2) {
    section.append(h('p', { class: 'meta' }, 'A teia cresce com cada pergunta. Por agora só está o alvo.'));
    return section;
  }
  const { cx, cy, squash } = WEB;
  const { positions, adjacent } = webLayout(model);
  const inSignals = new Set(result.todos.flatMap(signalNodes));
  const around = (id) => [id, ...adjacent.get(id)];
  const threads = svg('g', { class: 'teia-threads', 'aria-hidden': 'true' },
    [75, 150, 238, 310].map((r) => svg('polygon', {
      points: Array.from({ length: 12 }, (_, index) => { const t = (index * Math.PI) / 6; return `${(cx + r * Math.cos(t)).toFixed(1)},${(cy + r * Math.sin(t) * squash).toFixed(1)}`; }).join(' '),
    })),
    Array.from({ length: 12 }, (_, index) => { const t = (index * Math.PI) / 6; return svg('line', { x1: cx, y1: cy, x2: (cx + 330 * Math.cos(t)).toFixed(1), y2: (cy + 330 * Math.sin(t) * squash).toFixed(1) }); }));
  const edges = svg('g', { class: 'teia-edges', 'aria-hidden': 'true' }, model.edges.map((edge) => {
    const a = positions.get(edge.a);
    const b = positions.get(edge.b);
    const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const bend = 0.1 * length;
    const qx = (a.x + b.x) / 2 - ((b.y - a.y) / length) * bend;
    const qy = (a.y + b.y) / 2 + ((b.x - a.x) / length) * bend;
    return svg('path', { d: `M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${qx.toFixed(1)} ${qy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`,
      class: `teia-edge is-${edge.kind}${edge.strong ? '' : ' is-weak'}`, 'data-edge-a': edge.a, 'data-edge-b': edge.b });
  }));
  const open = (event, id) => openNode(id, event.currentTarget);
  const nodes = svg('g', { class: 'teia-nodes' }, model.nodes.map((id) => {
    const node = graph.nos[id];
    const point = positions.get(id);
    const subject = id === SUBJECT;
    const r = subject ? 30 : inSignals.has(id) ? 19 : 13;
    const label = wrapLabel(short(node.nome) || node.nome, subject ? 22 : 20, subject ? 2 : 3);
    // Por cima do nó na metade de cima da teia, para os nomes não cruzarem os fios que vão para o centro.
    const labelY = !subject && point.y < cy - 1 ? -(r + 8) - (label.length - 1) * 14 : r + 16;
    return svg('g', {
      class: `teia-node is-${node.tipo}${subject ? ' is-subject' : ''}${inSignals.has(id) ? ' is-signal' : ''}`, 'data-node': id,
      transform: `translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`, role: 'button', tabindex: '0',
      'aria-label': `${node.nome} (${KIND[node.tipo] || 'entidade'}, ${plural(adjacent.get(id).size, 'ligação', 'ligações')} na teia). Abrir o que sabemos.`,
      onclick: (event) => open(event, id),
      onkeydown: (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); open(event, id); } },
      onmouseenter: () => light(around(id)), onmouseleave: () => light(pinned), onfocus: () => light(around(id)), onblur: () => light(pinned),
    },
    svg('circle', { r }),
    svg('text', { class: 'teia-node-label', 'text-anchor': 'middle', y: labelY }, label.map((line, index) => svg('tspan', { x: 0, dy: index ? 14 : 0 }, line))));
  }));
  webSvg = svg('svg', { viewBox: '0 0 720 540', class: 'teia-web-svg', role: 'group', 'aria-labelledby': 'teia-web-h', 'data-no-inline-links': '' }, threads, edges, nodes);
  const rels = (edge) => unique(edge.items.map((item) => item.rel === 'ato' ? 'resultado de pesquisa no Diário da República' : G.RELATIONS[item.rel] || item.rel)).join(', ');
  section.append(
    h('p', { class: 'meta' }, 'Passa por um nó para ver as ligações; abre-o para ler os factos. Os sinais acendem aqui as entidades envolvidas.'),
    h('div', { class: 'teia-web-frame' }, webSvg),
    h('ul', { class: 'teia-legend' },
      [['money', 'dinheiro: contratos ou pagamentos'], ['tie', 'função, participação ou menção'], ['act', 'publicação no Diário da República'], ['office', 'cargo público ou partido']]
        .map(([kind, label]) => h('li', {}, h('span', { class: `teia-swatch is-${kind}`, 'aria-hidden': 'true' }), label)),
      h('li', {}, h('span', { class: 'teia-swatch is-weak', 'aria-hidden': 'true' }), 'tracejado: fonte secundária ou destinatário por confirmar')),
    model.hidden ? h('p', { class: 'meta' }, `Mostramos as ${model.nodes.length} entidades mais relevantes. Outras ${model.hidden} estão no caderno e nas fichas.`) : null,
    h('details', { class: 'teia-web-list' }, h('summary', {}, 'Ler a teia como lista'),
      h('ul', {}, model.edges.map((edge) => h('li', {},
        h('button', { type: 'button', class: 'teia-link', onclick: (event) => openNode(edge.a, event.currentTarget) }, short(nameOf(edge.a))),
        ` — ${rels(edge)} — `,
        h('button', { type: 'button', class: 'teia-link', onclick: (event) => openNode(edge.b, event.currentTarget) }, short(nameOf(edge.b))),
        edge.strong ? '' : edge.items.some((item) => item.rel === 'ato') ? ' (destinatário por confirmar)' : ' (só fonte secundária)')))));
  return section;
}

// ——— no tempo ———

function toMs(value, end = false) {
  const match = /^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/.exec(String(value || ''));
  if (!match) return NaN;
  const [, y, m, d] = match;
  if (end) return m ? (d ? Date.UTC(+y, +m - 1, +d) : Date.UTC(+y, +m, 0)) : Date.UTC(+y, 11, 31);
  return Date.UTC(+y, m ? +m - 1 : 0, d ? +d : 1);
}

const strongSource = (item) => (item.fontes || [item.fonte]).some((fonte) => fonte?.tipo === 'primaria' || fonte?.tipo === 'manual');

function officeMarks(holder, now) {
  const rows = new Map();
  for (const office of S.officesOf(graph, holder)) {
    const start = toMs(office.inicio || office.declaradoDe || office.declaradoEm);
    if (Number.isNaN(start)) continue;
    const end = office.fim ? toMs(office.fim, true) : office.atual ? now : toMs(office.declaradoEm || office.inicio, true);
    const parliament = office.cargo?.ambito === 'parlamento';
    const key = parliament ? 'parlamento' : office.para || normalizeName(office.detalhe || '');
    const label = parliament ? 'Deputado na Assembleia da República' : cleanText(office.detalhe || nameOf(office.para), 70);
    if (!rows.has(key)) rows.set(key, { label, marks: [], lines: [], latest: 0, executivo: false });
    const row = rows.get(key);
    const text = `${cleanText(office.detalhe || label, 90)}, ${years(office)}${office.aproximado ? ' (datas aproximadas)' : ''}`;
    row.marks.push({ start, end: Math.max(end, start), shape: 'bar', kind: 'office', weak: office.aproximado || !strongSource(office), open: office.atual, title: text });
    row.lines.push(text);
    row.latest = Math.max(row.latest, start);
    row.executivo ||= Boolean(office.cargo?.executivo || office.cargo?.chefe);
  }
  return [...rows.values()].sort((a, b) => b.latest - a.latest);
}

function entityMarks(id, now) {
  const marks = [];
  const lines = [];
  const people = new Set(Object.values(graph.nos).filter((node) => node.tipo === 'person').map((node) => node.id));
  const ties = graph.afirmacoes.filter((item) => TIE_RELS.has(item.rel) && item.rel !== 'cliente' && item.rel !== 'co-mencao'
    && ((item.para === id && people.has(item.de)) || (item.de === id && people.has(item.para))));
  let undated = 0;
  for (const item of G.mergeTimeline(ties, G.declarationDaysOf(graph, SUBJECT))) {
    const who = short(nameOf(item.de === id ? item.para : item.de));
    const what = `${who}: ${cleanText(item.detalhe || G.RELATIONS[item.rel] || item.rel, 80)}`;
    const start = toMs(item.inicio || item.declaradoDe);
    const declared = toMs(item.declaradoEm);
    if (!Number.isNaN(start)) {
      const end = item.fim ? toMs(item.fim, true) : item.atual ? now : Number.isNaN(declared) ? start : declared;
      const text = `${what}, ${years(item)}${item.declaradoEm && !item.fim && !item.atual ? ` (declarado até ${S.shortDate(item.declaradoEm)})` : ''}`;
      marks.push({ start, end: Math.max(end, start), shape: 'bar', kind: 'tie', weak: !strongSource(item), open: item.atual, title: text });
      lines.push(text);
    } else if (!Number.isNaN(declared)) {
      const text = `${what}, declarado em ${S.shortDate(item.declaradoEm)}`;
      marks.push({ start: declared, shape: 'dot', kind: 'tie', weak: !strongSource(item), title: text });
      lines.push(text);
    } else undated += 1;
  }
  for (const item of graph.afirmacoes.filter((entry) => entry.rel === 'cliente' && entry.de === id)) {
    const start = toMs(item.inicio || item.data);
    const text = `${short(nameOf(item.de))} paga a ${short(nameOf(item.para))}${item.inicio ? ` desde ${S.shortDate(item.inicio)}` : ''}${item.fim ? ` até ${S.shortDate(item.fim)}` : ''} (${item.fonte?.nome || 'fonte'})`;
    if (Number.isNaN(start)) { undated += 1; lines.push(text); continue; }
    marks.push({ start, end: item.fim ? toMs(item.fim, true) : now, shape: 'bar', kind: 'money', weak: !strongSource(item), open: !item.fim, title: text });
    lines.push(text);
  }
  const contracts = (graph.contratos[id] || []).filter((row) => !Number.isNaN(toMs(row.data)));
  const top = Math.max(1, ...contracts.map((row) => Number(row.valor) || 0));
  for (const row of contracts) {
    marks.push({ start: toMs(row.data), shape: 'dot', kind: 'money', size: 6 + Math.round(Math.sqrt((Number(row.valor) || 0) / top) * 12),
      title: `Contrato público, ${S.shortDate(row.data)}: ${S.euro(row.valor)} · ${cleanText(row.objeto, 80)}` });
  }
  if (contracts.length) {
    const total = contracts.reduce((sum, row) => sum + (Number(row.valor) || 0), 0);
    const dates = contracts.map((row) => String(row.data)).sort();
    lines.push(`${plural(contracts.length, 'contrato público', 'contratos públicos')} entre ${S.shortDate(dates[0])} e ${S.shortDate(dates.at(-1))}, ${S.euro(total)} no total`);
  }
  const acts = graph.afirmacoes.filter((item) => item.rel === 'ato' && item.para === id && item.classe?.decisao);
  for (const item of acts) {
    const date = item.data || graph.nos[item.de]?.data;
    const start = toMs(date);
    const text = `Resultado no Diário da República (destinatário por confirmar), ${S.shortDate(date)}: ${cleanText(graph.nos[item.de]?.sumario || item.detalhe, 110)}`;
    if (Number.isNaN(start)) { undated += 1; continue; }
    marks.push({ start, shape: 'diamond', kind: 'act', title: text });
    lines.push(text);
  }
  if (graph.nos[id]?.tipo === 'person') for (const row of officeMarks(id, now)) { marks.push(...row.marks); lines.push(...row.lines); }
  if (undated) lines.push(`${plural(undated, 'ligação sem data', 'ligações sem data')} (ver ficha)`);
  return { marks, lines };
}

function timelineSection(result) {
  const now = Date.now();
  const subject = graph.nos[SUBJECT];
  const offices = subject.tipo === 'person' ? officeMarks(SUBJECT, now).slice(0, 3) : [];
  const candidates = unique([
    subject.tipo === 'person' ? '' : SUBJECT,
    ...[...result.todos].sort((a, b) => b.pontuacao - a.pontuacao).flatMap((signal) => [signal.entidade, signal.ligada]),
    ...linkedTo(graph, SUBJECT),
    ...Object.keys(graph.contratos),
  ]).filter((id) => graph.nos[id] && !graph.nos[id].privado && graph.nos[id].tipo !== 'act');
  const entities = [];
  for (const id of candidates) {
    if (offices.length + entities.length >= 8) break;
    const row = entityMarks(id, now);
    if (row.marks.length) entities.push({ id, ...row });
  }
  const section = h('section', { class: 'teia-time', 'aria-labelledby': 'teia-time-h' }, h('h3', { id: 'teia-time-h', tabindex: '-1' }, 'No tempo'));
  const all = [...offices, ...entities].flatMap((row) => row.marks);
  if (!all.length) {
    section.append(h('p', { class: 'meta' }, 'Ainda não há factos com data. Os cargos, contratos e decisões aparecem aqui à medida que as perguntas avançam.'));
    return section;
  }
  const yearNow = new Date(now).getUTCFullYear();
  const first = Math.max(yearNow - 45, new Date(Math.min(...all.map((mark) => mark.start))).getUTCFullYear());
  const t0 = Date.UTC(first, 0, 1);
  const t1 = Date.UTC(yearNow, 11, 31);
  const pct = (ms) => Math.min(100, Math.max(0, ((ms - t0) / (t1 - t0)) * 100));
  const span = yearNow - first + 1;
  const step = span <= 6 ? 1 : span <= 14 ? 2 : span <= 35 ? 5 : 10;
  const ticks = [];
  for (let year = Math.ceil(first / step) * step; year <= yearNow; year += step) ticks.push(year);
  const governing = offices.filter((row) => row.executivo);
  const bands = (governing.length ? governing : offices).flatMap((row) => row.marks)
    .map((mark) => h('span', { class: 'teia-tl-band', style: `left:${pct(mark.start)}%;width:${Math.max(pct(mark.end) - pct(mark.start), 0.4)}%`, 'aria-hidden': 'true', title: mark.title }));
  const draw = (mark) => {
    const left = pct(mark.start);
    const cls = `teia-tl-mark is-${mark.shape} is-${mark.kind}${mark.weak ? ' is-weak' : ''}${mark.open ? ' is-open' : ''}`;
    if (mark.shape === 'bar') return h('span', { class: cls, style: `left:${left}%;width:${Math.max(pct(mark.end) - left, 0.6)}%`, title: mark.title, 'aria-hidden': 'true' });
    return h('span', { class: cls, style: `left:${left}%${mark.size ? `;--size:${mark.size}px` : ''}`, title: mark.title, 'aria-hidden': 'true' });
  };
  const todayLine = () => h('span', { class: 'teia-tl-today', style: `left:${pct(now)}%`, 'aria-hidden': 'true' });
  const row = (label, marks, lines, extra = [], className = '') => h('li', { class: `teia-tl-row${className}` },
    h('div', { class: 'teia-tl-label' }, label),
    h('div', { class: 'teia-tl-track' }, extra, marks.map(draw), todayLine()),
    h('ul', { class: 'teia-sr' }, lines.map((line) => h('li', {}, line))));
  section.append(
    h('p', { class: 'meta' }, offices.length
      ? `Em cima, os cargos de ${short(subject.nome)}. Por baixo, quando cada entidade se cruzou com ele. A sombra marca os períodos ${governing.length ? 'em funções executivas' : 'em cargos públicos'}: é aí que vale a pena procurar coincidências.`
      : 'Contratos, decisões do Estado e ligações de cada entidade ao longo do tempo.'),
    h('div', { class: 'teia-tl-axis', 'aria-hidden': 'true' }, h('span', {}), h('div', { class: 'teia-tl-track' },
      ticks.map((year) => h('span', { class: 'teia-tl-tick', style: `left:${pct(Date.UTC(year, 0, 1))}%` }, String(year))))),
    h('ul', { class: 'teia-tl-rows' },
      offices.map((office) => row(office.label, office.marks, office.lines, [], ' is-office')),
      entities.map((entity) => row(
        h('button', { type: 'button', class: 'teia-link', onclick: (event) => openNode(entity.id, event.currentTarget),
          onmouseenter: () => light([SUBJECT, entity.id]), onmouseleave: () => light(pinned) }, short(nameOf(entity.id))),
        entity.marks, entity.lines, bands.map((band) => band.cloneNode(true))))),
    h('ul', { class: 'teia-legend' },
      [['office', 'bar', 'cargo público'], ['tie', 'bar', 'função ou participação'], ['money', 'bar', 'pagamentos noticiados'], ['money', 'dot', 'contrato público (tamanho = valor)'], ['act', 'diamond', 'decisão no Diário da República']]
        .map(([kind, shape, label]) => h('li', {}, h('span', { class: `teia-tl-key is-${shape} is-${kind}`, 'aria-hidden': 'true' }), label)),
      h('li', {}, h('span', { class: 'teia-tl-key is-band', 'aria-hidden': 'true' }), governing.length ? 'em funções executivas' : 'em cargos públicos')));
  return section;
}

// ——— arranque ———

export function createTeia() {
  if (root) return root;
  statusText = h('p', { class: 'teia-status-text', role: 'status', 'aria-live': 'polite' });
  statusButton = h('button', { type: 'button', class: 'teia-quiet', hidden: true, onclick: () => {
    if (busy) controller?.abort();
    else { statusBar.dataset.state = 'info'; statusButton.hidden = true; }
  } }, 'Fechar');
  statusBar = h('div', { class: 'teia-status', 'data-state': 'info' }, statusText, statusButton);
  stage = h('div', { class: 'teia-stage' });
  root = h('section', { id: 'investigation-teia', class: 'teia', 'aria-label': 'Teia: escrutínio a partir de dados públicos' }, stage, statusBar);
  renderEntry();
  return root;
}

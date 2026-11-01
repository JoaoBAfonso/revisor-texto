import { LEGAL_SITUATIONS, SITUATION_SOURCES, SITUATION_PATHS, SITUATION_URGENCY, situationGuidance, situationModel, situationModelText, situationArticle } from './proxy/legal-situations.mjs';
import { ENTITIES } from './proxy/guia.js';
import { openReading, readingBackTo } from './reading-dialog.js';

const h = (tag, text, className) => {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
};
const button = (text, action) => {
  const element = h('button', text);
  element.type = 'button';
  element.addEventListener('click', action);
  return element;
};
const list = (title, items) => {
  const section = h('section');
  section.append(h('h3', title));
  const ul = h('ul', '', 'case-list');
  ul.append(...items.map((text) => h('li', text)));
  section.append(ul);
  return section;
};
const cache = new Map();
function showModel(selection, onBack) {
  const content = h('div', '', 'case-comparison');
  openReading(selection.title, content, { onBack });
  try {
    const text = situationModelText(selection, window.LAW_KIT);
    const preview = h('textarea', '', 'case-report-preview');
    preview.rows = 18;
    preview.value = text;
    preview.setAttribute('aria-label', 'Modelo editável por rever e completar');
    const error = h('p');
    error.setAttribute('role', 'alert');
    error.hidden = true;
    const download = button('Descarregar rascunho .txt', () => {
      let url;
      try {
        url = URL.createObjectURL(new Blob([preview.value], { type: 'text/plain;charset=utf-8' }));
        const link = h('a');
        link.href = url;
        link.download = `rascunho-${selection.template}${selection.right ? `-${selection.right}` : ''}.txt`;
        link.click();
        error.hidden = true;
      } catch (failure) {
        console.error('Falha ao guardar rascunho jurídico:', failure);
        error.textContent = `Não foi possível iniciar a descarga: ${failure.message}. Podes selecionar e copiar o texto.`;
        error.hidden = false;
      } finally {
        if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    });
    content.append(h('p', 'Rascunho, não documento pronto a enviar. Completa os marcadores, escolhe o pedido adequado e revê fundamentos e datas. Não juntes dados desnecessários. O ficheiro guardado conserva o que escreveres; partilha-o com cuidado.', 'case-comparison-note'),
      list('Condições declaradas, não verificadas', selection.conditions),
      list('Exclusões e limites', selection.exclusions), preview, download, error,
      h('p', 'Não há envio ou gravação automática. O texto editado existe só nesta janela; ao fechar e abrir um novo rascunho, começa de novo.'));
  } catch (failure) {
    const alert = h('p', `Não foi possível preparar o modelo: ${failure.message}`);
    alert.setAttribute('role', 'alert');
    content.append(alert);
  }
}
async function showArticle(id, key, onBack) {
  const content = h('div', '', 'case-comparison');
  content.append(h('p', 'A carregar o artigo do corpus local…'));
  openReading('Fundamento da ficha', content, { onBack });
  try {
    let doc = cache.get(id);
    if (!doc) {
      const response = await fetch(`data/lei/${id}.json?v=8`);
      if (!response.ok) throw new Error(`Não foi possível carregar o diploma (${response.status}).`);
      doc = await response.json();
    }
    const article = situationArticle(doc, id, key);
    cache.set(id, doc);
    const passage = h('blockquote', '', 'legal-passage-text');
    passage.append(...article.text.split(/\r?\n/).filter((text) => text.trim()).map((text) => h('p', text)));
    const source = h('a', 'Conferir a fonte PGDL ↗');
    source.href = article.url;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    content.replaceChildren(h('h3', article.title),
      h('p', 'Transcrição do corpus com origem PGDL, não publicação oficial DRE. Sem verificação atual de vigência; confere a versão oficial e as regras aplicáveis.', 'case-comparison-note'),
      passage, source);
  } catch (error) {
    const alert = h('p', `Não foi possível verificar o artigo: ${error.message}`);
    alert.setAttribute('role', 'alert');
    content.replaceChildren(alert, button('Tentar novamente', () => showArticle(id, key, onBack)));
  }
}
function showSituation(situation) {
  const content = h('div', '', 'case-comparison');
  content.append(h('p', situation.intro),
    h('p', 'Ficha de preparação, não análise do teu caso. Não introduzas dados pessoais, fontes ou documentos. As escolhas ficam só nesta abertura da ficha, sem guardar ou enviar respostas.', 'case-comparison-note'));
  const path = SITUATION_PATHS[situation.id];
  const form = h('form', '', 'situation-questions');
  const selects = {};
  for (const [key, question, options] of [
    ['kind', path.question, path.options],
    ['urgency', 'Existe uma notificação, prazo ou urgência?', SITUATION_URGENCY],
  ]) {
    const label = h('label', question);
    const select = h('select');
    select.name = key;
    for (const [value, text] of options) {
      const option = h('option', text);
      option.value = value;
      select.append(option);
    }
    selects[key] = select;
    label.append(select);
    form.append(label);
  }
  const guidance = h('section', '', 'case-comparison-question');
  guidance.setAttribute('aria-live', 'polite');
  const update = () => {
    try {
      const result = situationGuidance(situation.id, { kind: selects.kind.value, urgency: selects.urgency.value });
      guidance.replaceChildren(h('h3', result.title), h('p', result.action),
        h('p', result.urgency), h('p', result.limit, 'case-comparison-note'));
      const selection = situationModel(situation.id, { kind: selects.kind.value, urgency: selects.urgency.value });
      if (!selection.available) guidance.append(h('p', selection.reason));
      else {
        const checkbox = h('input');
        checkbox.type = 'checkbox';
        const label = h('label', 'Li as condições e considero que correspondem ao meu objetivo. Isto é uma declaração minha, não validação jurídica.');
        label.prepend(checkbox);
        const open = button(selection.title, () => showModel(selection, readingBackTo(open)));
        open.disabled = true;
        checkbox.addEventListener('change', () => { open.disabled = !checkbox.checked; });
        guidance.append(list('Antes de abrir um modelo', selection.conditions),
          list('Quando não usar', selection.exclusions), label, open);
      }
    } catch (error) {
      const alert = h('p', `Não foi possível orientar o percurso: ${error.message}`);
      alert.setAttribute('role', 'alert');
      guidance.replaceChildren(alert);
    }
  };
  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('change', update);
  form.append(button('Limpar escolhas', () => { form.reset(); update(); }));
  update();
  content.append(form, guidance, list('O que confirmar primeiro', situation.confirm));
  const rights = h('section');
  rights.append(h('h3', 'Direitos e condições a examinar'));
  for (const item of situation.rights) {
    const block = h('section', '', 'case-comparison-option');
    const refs = h('div', '', 'brain-chips');
    for (const [id, key] of item.refs) {
      const trigger = button(`${SITUATION_SOURCES[id].label} · artigo ${key}.º`, () => showArticle(id, key, readingBackTo(trigger)));
      refs.append(trigger);
    }
    block.append(h('p', item.text), refs);
    rights.append(block);
  }
  content.append(rights, list('O que preservar e preparar', situation.proof),
    list('Ações possíveis', situation.actions));
  const entities = h('section');
  entities.append(h('h3', 'A quem pedir apoio ou informação'));
  for (const route of situation.entities) {
    const entity = ENTITIES[route.id];
    const link = h('a', `${entity.name} ↗`);
    link.href = entity.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const paragraph = h('p');
    paragraph.append(link, document.createTextNode(` — ${route.use}`));
    entities.append(paragraph);
  }
  content.append(entities, list('Prazos: confirmar antes de agir', [situation.deadlines]),
    list('O que esta ficha não decide', situation.limits),
    h('p', 'As referências fundamentam as questões a examinar, não certificam a adequação ao caso ou a vigência. As fichas não têm ainda revisão jurídica independente registada.', 'case-comparison-note'));
  openReading(situation.title, content);
}
const root = document.getElementById('legal-situations');
if (root) {
  root.append(h('h2', 'O que te aconteceu?'),
    h('p', 'Percursos para cidadãos e jornalistas. Escolhe uma situação para preparar a próxima ação; não precisas de saber o nome da lei.'));
  for (const [audience, title] of [['citizens', 'Cidadãos'], ['journalists', 'Jornalistas']]) {
    const group = h('section');
    group.append(h('h3', title));
    const cards = h('div', '', 'situation-cards');
    for (const situation of LEGAL_SITUATIONS.filter((item) => item.audience === audience)) {
      const card = h('section', '', 'situation-card');
      const read = button('Ver caminhos e cuidados', () => showSituation(situation));
      read.setAttribute('aria-label', `Ver caminhos e cuidados: ${situation.title}`);
      card.append(h('h4', situation.title), h('p', situation.intro), read);
      cards.append(card);
    }
    group.append(cards);
    root.append(group);
  }
  const note = h('p', 'Não encontras a tua situação? Estes percursos não cobrem todas as situações. ', 'brain-note');
  const search = h('a', 'Abrir a pesquisa jurídica');
  search.href = '#/direito/pesquisa';
  note.append(search, document.createTextNode(' ou consulta a secção Legislação.'));
  root.append(note);
}

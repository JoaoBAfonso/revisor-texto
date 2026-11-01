import { inlineReferences, referenceTarget } from './proxy/inline-references.mjs';
import { openReading, readingBackTo } from './reading-dialog.js';

const EXCLUDE = 'a, button, input, textarea, select, option, script, style, code, pre, svg, [contenteditable]:not([contenteditable="false"]), [data-no-inline-links]';
const pending = new Set();
let timer;
let running = false;
let failed = false;
const p = (text) => {
  const element = document.createElement('p');
  element.textContent = text;
  return element;
};

async function readReference(href, onBack) {
  const content = document.createElement('div');
  content.className = 'case-comparison';
  content.append(p('A carregar a referência do corpus local…'));
  openReading('Referência jurídica', content, { onBack });
  try {
    const target = referenceTarget(href);
    if (!target) throw new Error('Endereço de referência inválido.');
    const { id, key } = target;
    const response = await fetch(`data/lei/${encodeURIComponent(id)}.json?v=8`);
    if (!response.ok) throw new Error(`Não foi possível carregar o diploma (${response.status}).`);
    const doc = await response.json();
    if (doc.id !== id || !Array.isArray(doc.arts)) throw new Error('O diploma não corresponde à referência.');
    const articles = key ? doc.arts.filter(({ k }) => k === key) : doc.arts;
    if (!articles.length || (key && articles.length !== 1)
      || articles.some(({ x }) => typeof x !== 'string' || !x.trim())) throw new Error('Texto em falta ou referência de artigo ambígua.');
    const sourceUrl = new URL(doc.url);
    if (!['http:', 'https:'].includes(sourceUrl.protocol)) throw new Error('URL da fonte inválida.');
    const title = document.createElement('h3');
    title.textContent = doc.title || doc.name;
    const fullPage = document.createElement('a');
    fullPage.href = `#/direito/lei/${encodeURIComponent(id)}`;
    fullPage.dataset.referenceNavigation = '';
    fullPage.textContent = 'Abrir lei na página completa';
    fullPage.addEventListener('click', (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      for (const dialog of document.querySelectorAll('dialog[open]')) dialog.close();
    });
    content.replaceChildren(title, fullPage,
      p('Texto do corpus local. Sem verificação atual de vigência; confirma a versão oficial. A ligação não implica aplicação ao teu caso.'));
    // Keep source text intact and avoid recursively linking an entire diploma in this reading view.
    const passages = document.createElement('div');
    passages.dataset.noInlineLinks = '';
    for (const article of articles) {
      const heading = document.createElement('h4');
      heading.textContent = `Artigo ${article.n || article.k} — ${article.t || ''}`;
      const quote = document.createElement('blockquote');
      quote.className = 'legal-passage-text';
      quote.append(...article.x.split(/\r?\n/).filter((line) => line.trim()).map(p));
      passages.append(heading, quote);
    }
    const source = document.createElement('a');
    source.href = sourceUrl.href;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = 'Conferir na fonte de origem ↗';
    content.append(passages, source);
  } catch (error) {
    const alert = p(`Não foi possível ler a referência: ${error.message}`);
    alert.setAttribute('role', 'alert');
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.textContent = 'Tentar novamente';
    retry.addEventListener('click', () => readReference(href, onBack));
    content.replaceChildren(alert, retry);
  }
}

function enqueue(root) {
  if (root.nodeType === Node.TEXT_NODE || root.nodeType === Node.ELEMENT_NODE) pending.add(root);
  clearTimeout(timer);
  timer = setTimeout(processPending, 80);
}

async function processPending() {
  if (running || !window.brain?.references || failed) return;
  running = true;
  const roots = [...pending];
  pending.clear();
  const nodes = new Set();
  for (const root of roots) {
    if (!root.isConnected) continue;
    if (root.nodeType === Node.TEXT_NODE) nodes.add(root);
    else {
      if (root.closest(EXCLUDE)) continue;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) nodes.add(walker.currentNode);
    }
  }
  const candidates = [];
  for (const node of nodes) {
    if (!node.parentElement || node.parentElement.closest(EXCLUDE)) continue;
    const text = node.textContent;
    const matches = inlineReferences(text);
    if (matches.length) candidates.push({ node, text, matches });
  }
  try {
    const queries = [...new Map(candidates.flatMap(({ matches }) => matches.map((match) =>
      [`${match.article}:${match.query}`, { text: match.query, article: match.article }]))).entries()];
    const resolved = await window.brain.references(queries.map(([, value]) => value));
    const targets = new Map(queries.map(([key], index) => [key, resolved[index]]));
    for (const { node, text, matches } of candidates) {
      if (!node.isConnected || node.textContent !== text || node.parentElement.closest(EXCLUDE)) continue;
      const fragment = document.createDocumentFragment();
      let offset = 0;
      let linked = false;
      for (const match of matches) {
        const href = targets.get(`${match.article}:${match.query}`);
        if (!href) continue;
        fragment.append(document.createTextNode(text.slice(offset, match.start)));
        const link = document.createElement('a');
        link.className = 'inline-legal-reference';
        link.href = href;
        link.textContent = match.label;
        link.title = 'Consultar esta referência no corpus local';
        fragment.append(link);
        offset = match.end;
        linked = true;
      }
      if (linked) {
        fragment.append(document.createTextNode(text.slice(offset)));
        node.replaceWith(fragment);
      }
    }
  } catch (error) {
    failed = true;
    console.error('Não foi possível preparar ligações jurídicas internas:', error);
    const notice = p('As ligações jurídicas automáticas não puderam ser preparadas. O texto mantém-se disponível; recarrega a página para tentar novamente.');
    notice.setAttribute('role', 'alert');
    document.getElementById('view-direito').append(notice);
  } finally {
    running = false;
    if (pending.size && !failed) timer = setTimeout(processPending, 80);
  }
}

document.addEventListener('click', (event) => {
  const link = event.target.closest?.('a[href]');
  if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey
    || link.hasAttribute('download')) return;
  const href = link.getAttribute('href');
  if (!referenceTarget(href)) return;
  if (link.hasAttribute('data-reference-navigation')) return;
  const legal = link.closest('#view-direito, dialog[open]');
  if (!legal && !link.classList.contains('inline-legal-reference')) return;
  if (link.closest('.law-modes, .brain-pager, .brain-crumbs')
    || link.classList.contains('brain-start')) return;
  event.preventDefault();
  event.stopPropagation();
  const back = link.closest('.reading-dialog[open]') ? readingBackTo(link) : undefined;
  readReference(href, back || (() => {
    document.querySelector('.reading-dialog[open]')?.close();
    if (link.isConnected) link.focus({ preventScroll: true });
  }));
}, true);

const observer = new MutationObserver((records) => {
  for (const record of records) {
    if (record.type === 'characterData') enqueue(record.target);
    else for (const node of record.addedNodes) enqueue(node);
  }
});
observer.observe(document.body, { childList: true, subtree: true, characterData: true });
window.addEventListener('brain-ready', () => enqueue(document.body));
enqueue(document.body);

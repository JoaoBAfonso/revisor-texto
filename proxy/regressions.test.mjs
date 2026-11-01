import test from 'node:test';
import assert from 'node:assert/strict';
import { searchLaw, interpret } from './direito.js';
import { decode } from './ciberduvidas.js';
import { sliceArticle } from './texto.js';
import { parseOriginal } from './corpus/dre-parse.mjs';
import worker from './worker.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { makeResolver } from './corpus/procedures.mjs';
import { fetchArticle } from './noticias.js';
import { refsIn } from './corpus/dgsi.mjs';

test('citations, accented capitals, article suffixes and line endings', () => {
  assert.equal(interpret('Código Civil, artigo 1064.º').citation.label, 'Código Civil, art. 1064.º');
  assert.equal(decode('&Aacute; &aacute; &Otilde;'), 'Á á Õ');
  assert.deepEqual(sliceArticle(['## Artigo 65.º', 'Normal', '## Artigo 65.º-A', 'Aditado'], '65-A'), ['## Artigo 65.º-A', 'Aditado']);
  const text = 'Artigo 1.º\nObjeto\n1 - Primeiro.\nArtigo 2.º\nEfeitos\n1 - Segundo.';
  for (const ending of ['\n', '\r', '\r\n']) assert.equal(parseOriginal(text.replaceAll('\n', ending)).arts.length, 2);
});

test('different query identifiers survive legal result deduplication', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ organic: [
    { link: 'https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=775', title: 'Civil' },
    { link: 'https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=109', title: 'Penal' },
  ] })));
  const result = await searchLaw('teste', ['pgdl'], { SERPER_API_KEY: 'local-mock' });
  assert.equal(result.results.length, 2);
});

test('partial legal search failures remain visible', async (t) => {
  t.mock.method(globalThis, 'fetch', async (url) => {
    if (new URL(url).searchParams.get('q').includes('site:dgsi.pt')) throw new Error('Offline');
    return new Response('<li class="b_algo"><h2><a href="https://www.pgdlisboa.pt/leis/teste.php?nid=775">Civil</a></h2><p>teste</p></li>');
  });

  const result = await searchLaw('teste', ['pgdl', 'dgsi']);
  assert.ok(result.results.length);
  assert.ok(result.failed.includes('dgsi'));
});

test('invalid translation payload is an explicit upstream error', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({ translations: [] })));
  const response = await worker.fetch(new Request('http://localhost/translate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: 'Teste', source: 'pt-PT', target: 'en-GB' }),
  }), { DEEPL_API_KEY: 'local-mock' });
  assert.equal(response.status, 502);
  assert.ok((await response.json()).error);
});

test('article suffixes are preserved in browser, corpus and search citations', () => {
  const doc = JSON.parse(readFileSync(new URL('../data/lei/cc.json', import.meta.url), 'utf8'));
  const resolve = makeResolver(new Map([['cc', doc]]), [doc], [['cc', /^CC\b/i]]);
  const source = readFileSync(new URL('../lei.js', import.meta.url), 'utf8');
  const context = vm.createContext({ plain: (s) => s.toLowerCase().replace(/,$/, '') });
  vm.runInContext(source.slice(source.indexOf('function parseRef('), source.indexOf('\nfunction findDoc(')), context);
  for (const q of ['CC, art. 158.º-A', 'CC, art. 158-A', 'CC, art. 158.º-a']) {
    assert.equal(resolve(q).to, 'cc:158-A');
    assert.equal(context.parseRef(q).k, '158-A');
  }
  for (const q of ['artigo 158.º-A do CC', '158-A CC', '158.º-A CC']) {
    const parsed = context.parseRef(q);
    assert.equal(parsed.k, '158-A');
    assert.equal(parsed.name, 'cc');
  }
  assert.equal(context.parseRef('artigo 65 CRP').k, '65');
  assert.equal(resolve('CC, art. 158.º').to, 'cc:158');
  assert.equal(interpret('CC, art. 158.º-A').citation.label, 'Código Civil, art. 158.º-A');
});

test('Guide source links show explicit errors for missing references and loading failure', async () => {
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  for (const outcome of ['linked', 'missing', 'failure']) {
    let replacement;
    const context = vm.createContext({
      h: (tag, props, ...children) => ({ tag, props, children, replaceWith: (node) => { replacement = node; } }),
      window: { brain: { link: () => outcome === 'failure' ? Promise.reject(new Error('Offline'))
        : Promise.resolve(outcome === 'linked' ? '#/direito/lei/rgpd/15' : null) } },
    });
    vm.runInContext(source.slice(source.indexOf('  function baseLink(text)'), source.indexOf('  function guidanceList(')), context);
    const node = context.baseLink('RGPD, art. 15.º');
    await new Promise((resolve) => setImmediate(resolve));
    if (outcome === 'linked') {
      assert.equal(node.href, '#/direito/lei/rgpd/15');
      assert.equal(replacement, undefined);
    } else {
      assert.equal(node.href, undefined);
      assert.equal(replacement.props.role, 'status');
      assert.match(replacement.children[0], outcome === 'failure' ? /não foi possível carregar a referência/ : /referência não encontrada no corpus/);
    }
  }
});

test('outdated definitions cannot replace newer results or errors', async () => {
  const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  let word = 'old';
  let release;
  const pending = new Promise((resolve) => { release = resolve; });
  const shown = [];
  const context = vm.createContext({
    selectedWord: () => word, openPanel: () => {}, $: () => null,
    langEl: { value: 'pt-PT' }, definitionCache: new Map(), definitionEl: {},
    fetchPortuguese: (w) => w === 'old' ? pending : Promise.resolve({ word: w }),
    renderDefinition: (d) => shown.push(d.word),
  });
  vm.runInContext(source.slice(source.indexOf('  let definitionVersion ='), source.indexOf("  ['select', 'keyup', 'mouseup', 'input'].forEach((ev) => textEl.addEventListener(ev, updateDefineButton))")), context);
  const old = context.showDefinition();
  word = 'new';
  await context.showDefinition();
  release({ word: 'old' });
  await old;
  assert.deepEqual(shown, ['new']);
  assert.ok(context.definitionCache.has('pt-PT:old'));
});

test('news extraction excludes unrelated paragraphs and retains body fallback', async (t) => {
  const main = 'Texto principal da notícia, com uma frase suficientemente longa para entrar na extração.';
  const related = 'Esta notícia relacionada trata de outro assunto e não pertence ao artigo principal.';
  let html = `<article><p>${main}</p></article><section><p>${related}</p></section>`;
  t.mock.method(globalThis, 'fetch', async (url) => {
    const response = new Response(html, { headers: { 'Content-Type': 'text/html' } });
    Object.defineProperty(response, 'url', { value: url });
    return response;
  });

  assert.equal((await fetchArticle('https://www.rtp.pt/noticias/teste')).text, main);
  html = `<div><p>${main}</p></div>`;
  assert.equal((await fetchArticle('https://www.rtp.pt/noticias/teste')).text, main);
  html = `<article></article><div><p>${main}</p></div>`;
  assert.equal((await fetchArticle('https://www.rtp.pt/noticias/teste')).text, main);
});

test('DGSI recognises lower-case suffixes and numeric ranges without changing lists', () => {
    assert.deepEqual(refsIn('artigo 158.º-a do CC'), ['cc:158-A']);
    assert.deepEqual(refsIn('artigos 10 a 12 do CC'), ['cc:10', 'cc:11', 'cc:12']);
    assert.deepEqual(refsIn('artigos 10 ao 12 do CC'), ['cc:10', 'cc:11', 'cc:12']);
    assert.deepEqual(refsIn('artigos 10 e 12 do CC'), ['cc:10', 'cc:12']);
  });

  test('article extraction accepts spaced suffixes and excludes subsequent divisions', () => {
    assert.deepEqual(sliceArticle(['## Artigo 65.º - A', 'Texto', '## Artigo 66.º'], '65-A'), ['## Artigo 65.º - A', 'Texto']);
    for (const heading of ['SUBSECÇÃO II', 'ANEXO I']) {
      assert.deepEqual(sliceArticle(['## Artigo 65.º', 'Texto', `## ${heading}`, 'Divisão', '## Artigo 66.º'], '65'), ['## Artigo 65.º', 'Texto']);
    }
  });

  test('news and legal pop-ups distinguish network failure from unavailable content', async () => {
    const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
    const makeNode = (tag, props = {}, ...kids) => ({
      tag, ...props, kids, textContent: '', setAttribute(key, value) { this[key] = value; },
    });
    const body = {
      children: [],
      replaceChildren(...nodes) { this.children = nodes; },
      append(node) { this.children.push(node); },
      get lastElementChild() { return this.children.at(-1); },
    };
    const context = vm.createContext({
      h: makeNode, answerBody: body, openDialog: () => ({}),
      fmtDate: () => '', getJson: async () => { throw new Error('Offline'); },
    });
    vm.runInContext(source.slice(source.indexOf('  async function openNews('), source.indexOf('\n  function renderNews(')), context);
    vm.runInContext(source.slice(source.indexOf('  async function openLaw('), source.indexOf('\n  const openArticle =')), context);
    const result = { title: 'Teste', source: 'Fonte', url: 'https://example.com', description: 'Excerto' };
    await context.openNews(result);
    assert.equal(body.lastElementChild.role, 'alert');
    assert.ok(body.lastElementChild.kids[0].includes('Falhou o carregamento'));
    await context.openLaw(result);
    assert.equal(body.lastElementChild.role, 'alert');
    assert.ok(body.lastElementChild.textContent.includes('Falhou o carregamento'));
  });

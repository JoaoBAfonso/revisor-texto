(() => {
  const $ = (id) => document.getElementById(id);
  const textEl = $('text'), backdrop = $('backdrop'), langEl = $('lang');
  const issuesEl = $('issues'), statusEl = $('status'), countEl = $('count');
  const undoBtn = $('undo'), personalEl = $('personal'), personalCount = $('personalCount');

  const WORD_RE = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;
  const factoryPromise = window.HunspellAsm.loadModule();
  const spellers = {};
  const undoStack = [];
  const MAX_UNDO = 200;
  let snap = null; // estado do texto no último ponto de referência
  let typing = false;
  let typingTimer = null;
  let speller = null;
  let other = null; // dicionários do outro idioma, para detetar palavras escritas noutra língua
  const LANG_NAME = { 'pt-PT': 'português', en: 'inglês' };
  let timer = null;
  let issues = [];
  let activeIndex = -1;

  const store = {
    get(key, fallback) { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } },
    set(key, value) { localStorage.setItem(key, JSON.stringify(value)); },
  };
  let ignored = new Set(); // ignorados só nesta sessão

  // Cada opção do seletor pode combinar vários dicionários (inglês = US + GB).
  const LANGUAGES = {
    'pt-PT': [{ name: 'pt-PT', label: 'Portugal' }],
    en: [{ name: 'en-US', label: 'EUA' }, { name: 'en-GB', label: 'Reino Unido' }],
  };

  // Dicionário pessoal separado por idioma; migra o antigo dicionário partilhado para pt-PT.
  const personalKey = (lang) => `personal:${lang}`;
  const legacyPersonal = store.get('personal', null);
  if (legacyPersonal && localStorage.getItem(personalKey('pt-PT')) === null) {
    store.set(personalKey('pt-PT'), legacyPersonal);
  }
  localStorage.removeItem('personal');
  let currentLang = 'pt-PT';
  let personal = new Set();
  function loadPersonal(lang) {
    currentLang = lang;
    personal = new Set(store.get(personalKey(lang), []));
  }

  async function loadDictionary({ name, label }) {
    const [factory, aff, dic] = await Promise.all([
      factoryPromise,
      ...['aff', 'dic'].map((ext) => fetch(`vendor/dict/${name}.${ext}`).then((r) => {
        if (!r.ok) throw new Error(`Falha ao carregar ${name}.${ext}`);
        return r.arrayBuffer();
      })),
    ]);
    const affPath = factory.mountBuffer(new Uint8Array(aff), `${name}.aff`);
    const dicPath = factory.mountBuffer(new Uint8Array(dic), `${name}.dic`);
    return { label, hunspell: factory.create(affPath, dicPath) };
  }

  async function loadSpeller(lang, quiet = false) {
    if (spellers[lang]) return spellers[lang];
    if (!quiet) statusEl.textContent = 'A carregar dicionário…';
    const dicts = await Promise.all(LANGUAGES[lang].map(loadDictionary));
    spellers[lang] = dicts;
    return spellers[lang];
  }

  function correctIn(dict, word) {
    const h = dict.hunspell;
    if (h.spell(word)) return true;
    return word.includes('-') && word.split('-').every((p) => !p || personal.has(p.toLowerCase()) || h.spell(p));
  }

  // Devolve null se a palavra está correta em todas as variantes.
  function classify(word) {
    if (personal.has(word.toLowerCase())) return null;
    const ok = speller.filter((d) => correctIn(d, word));
    if (ok.length === speller.length) return null;
    if (ok.length === 0) {
      const seen = new Set();
      const suggestions = [];
      for (const d of speller) {
        for (const s of d.hunspell.suggest(word)) {
          if (seen.has(s.toLowerCase())) continue;
          seen.add(s.toLowerCase());
          suggestions.push({ text: s });
        }
      }
      // Sugestões que só diferem no acento (nao → não) vêm primeiro.
      const base = stripAccents(word);
      suggestions.sort((a, b) => (stripAccents(b.text) === base) - (stripAccents(a.text) === base));
      const foreign = other && word.length >= 3 ? other.dicts.filter((d) => d.hunspell.spell(word)) : [];
      if (foreign.length) {
        return {
          type: 'foreign',
          note: `Pode ser ${LANG_NAME[other.lang]}: a palavra existe no dicionário de ${LANG_NAME[other.lang]}` +
            `${other.lang === 'en' ? ` (${foreign.map((d) => d.label).join(', ')})` : ''}. ` +
            'Se é intencional, ignora ou acrescenta ao dicionário.',
          suggestions: suggestions.slice(0, 5),
        };
      }
      return { type: 'error', suggestions: suggestions.slice(0, 5) };
    }
    // Correta só em algumas variantes: sugere o equivalente nas restantes.
    const missing = speller.filter((d) => !ok.includes(d));
    const suggestions = [];
    for (const d of missing) {
      const alt = d.hunspell.suggest(word).filter((s) => !/[\s-]/.test(s) && d.hunspell.spell(s)).slice(0, 1);
      alt.forEach((s) => suggestions.push({ text: s, label: d.label }));
    }
    return {
      type: 'variant',
      okLabels: ok.map((d) => d.label),
      missingLabels: missing.map((d) => d.label),
      suggestions,
    };
  }

  const stripAccents = (s) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const isKnown = (w) => personal.has(w.toLowerCase()) || speller.some((d) => correctIn(d, w));

  // Pequenos erros que o dicionário não apanha: símbolos/acentos por engano, repetições e espaçamento.
  const DEAD = { '´': '\u0301', '`': '\u0300', '^': '\u0302', '~': '\u0303', '¨': '\u0308' };
  const ACCENTED = { a: 'áàâã', e: 'éê', i: 'í', o: 'óôõ', u: 'ú', c: 'ç' };
  const STRAY_RE = /(?<![\p{L}\p{M}\p{N}])([\p{L}\p{M}]*)([+=^~´`¨|\\]+)([\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*)/gu;
  const DIGITS_RE = /(?<![\p{L}\p{M}\p{N}])[\p{L}\p{M}]+\p{N}+[\p{L}\p{M}]+(?![\p{N}])/gu;
  const REPEAT_RE = /(?<![\p{L}\p{M}\p{N}])([\p{L}\p{M}]+)([ \t]+|\r?\n)\1(?![\p{L}\p{M}\p{N}'’-])/giu;
  const REPEAT_OK = { en: new Set(['that', 'had']), 'pt-PT': new Set() };

  function strayCandidates(prefix, symbols, rest) {
    const first = rest[0], tail = rest.slice(1);
    const out = [];
    if (symbols.length === 1 && DEAD[symbols]) {
      const composed = (first + DEAD[symbols]).normalize('NFC');
      if (composed.length === 1) out.push(prefix + composed + tail);
    } else if (langEl.value === 'pt-PT') {
      const lower = first.toLowerCase();
      for (const v of ACCENTED[lower] || '') out.push(prefix + (first === lower ? v : v.toUpperCase()) + tail);
    }
    const valid = out.filter(isKnown);
    valid.push(prefix + rest);
    return [...new Set(valid)];
  }

  function findTypos(text) {
    const out = [];
    const push = (start, end, display, note, suggestions) => {
      const word = text.slice(start, end);
      const key = `typo:${display}:${word.toLowerCase()}`;
      if (ignored.has(key)) return;
      out.push({ type: 'typo', word, display, key, start, end, note, suggestions });
    };
    for (const m of text.matchAll(STRAY_RE)) {
      const [token, prefix, symbols, rest] = m;
      const suggestions = strayCandidates(prefix, symbols, rest).map((t) => ({ text: t }));
      push(m.index, m.index + token.length, token, `Símbolo “${symbols}” por engano? Pode ser um acento mal escrito.`, suggestions);
    }
    for (const m of text.matchAll(DIGITS_RE)) {
      const plain = m[0].replace(/\p{N}+/gu, '');
      push(m.index, m.index + m[0].length, m[0], 'Números no meio de uma palavra.', isKnown(plain) ? [{ text: plain }] : []);
    }
    for (const m of text.matchAll(REPEAT_RE)) {
      if (REPEAT_OK[langEl.value === 'en' ? 'en' : 'pt-PT'].has(m[1].toLowerCase())) continue;
      push(m.index + m[1].length, m.index + m[0].length, `${m[1]} ${m[1]}`, 'Palavra repetida.', [{ text: '', caption: 'Remover repetição' }]);
    }
    for (const m of text.matchAll(/(?<=\S)[ \t]{2,}(?=\S)/g)) {
      push(m.index, m.index + m[0].length, 'espaços a mais', 'Mais de um espaço seguido.', [{ text: ' ', caption: 'Um só espaço' }]);
    }
    for (const m of text.matchAll(/(?<=\S)[ \t]+(?=[,;.!?:](?!\p{N}))/gu)) {
      push(m.index, m.index + m[0].length, 'espaço antes da pontuação', 'Espaço antes de um sinal de pontuação.', [{ text: '', caption: 'Remover espaço' }]);
    }
    for (const m of text.matchAll(/(?<=\p{L})[,;](?=\p{L})/gu)) {
      push(m.index, m.index + 1, `${m[0]} sem espaço`, 'Falta um espaço depois do sinal.', [{ text: `${m[0]} `, caption: `Acrescentar espaço` }]);
    }
    for (const m of text.matchAll(/(?<=\p{Ll})\.(?=\p{Lu}\p{Ll})/gu)) {
      push(m.index, m.index + 1, 'ponto sem espaço', 'Falta um espaço depois do ponto.', [{ text: '. ', caption: 'Acrescentar espaço' }]);
    }
    for (const m of text.matchAll(/([,;:])\1+/g)) {
      push(m.index, m.index + m[0].length, `${m[0]} repetido`, 'Pontuação repetida.', [{ text: m[1], caption: `Só “${m[1]}”` }]);
    }
    return out;
  }

  function findIssues(text) {
    const typos = findTypos(text).sort((a, b) => a.start - b.start);
    const kept = [];
    for (const t of typos) if (!kept.length || t.start >= kept[kept.length - 1].end) kept.push(t);
    const found = [];
    for (const m of text.matchAll(WORD_RE)) {
      const word = m[0];
      if (word.length < 2) continue;
      const start = m.index, end = start + word.length;
      if (kept.some((t) => start < t.end && end > t.start)) continue;
      if (ignored.has(word.toLowerCase())) continue;
      const result = classify(word.replace(/’/g, "'"));
      if (!result) continue;
      found.push({ word, start, end, ...result });
    }
    return [...kept, ...found].sort((a, b) => a.start - b.start);
  }

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function renderBackdrop() {
    const text = textEl.value;
    let html = '', pos = 0;
    issues.forEach((it, i) => {
      html += esc(text.slice(pos, it.start));
      const cls = [it.type === 'error' ? '' : it.type, i === activeIndex ? 'active' : ''].filter(Boolean).join(' ');
      html += `<mark${cls ? ` class="${cls}"` : ''}>${esc(it.word)}</mark>`;
      pos = it.end;
    });
    html += esc(text.slice(pos));
    backdrop.innerHTML = html + '\n';
    syncScroll();
  }

  function syncScroll() {
    backdrop.scrollTop = textEl.scrollTop;
    backdrop.scrollLeft = textEl.scrollLeft;
  }

  function contextOf(it) {
    const text = textEl.value;
    const a = Math.max(0, it.start - 25), b = Math.min(text.length, it.end + 25);
    return `${a > 0 ? '…' : ''}${text.slice(a, it.start)}[${it.display ?? it.word}]${text.slice(it.end, b)}${b < text.length ? '…' : ''}`
      .replace(/\s+/g, ' ');
  }

  function renderIssues() {
    issuesEl.replaceChildren();
    countEl.textContent = issues.length ? `(${issues.length})` : '';
    if (!issues.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = textEl.value.trim() ? 'Nenhum erro encontrado.' : 'Escreve algum texto para começar.';
      issuesEl.append(li);
      return;
    }
    issues.slice(0, 200).forEach((it, i) => {
      const li = document.createElement('li');
      const w = document.createElement('span');
      w.className = 'word';
      w.textContent = it.display ?? it.word;
      li.className = it.type;
      const ctx = document.createElement('span');
      ctx.className = 'ctx';
      ctx.textContent = contextOf(it);
      const actions = document.createElement('div');
      actions.className = 'actions';

      let note = null;
      if (it.type === 'variant' || it.note) {
        note = document.createElement('span');
        note.className = 'note';
        note.textContent = it.note ||
          `Variante: correta em ${it.okLabels.join(', ')}; não aceite em ${it.missingLabels.join(', ')}.`;
      }

      for (const s of it.suggestions) {
        const b = document.createElement('button');
        b.className = 'sug';
        b.textContent = s.caption || (s.label ? `${s.text} (${s.label})` : s.text);
        b.title = s.label ? `Mudar para a variante ${s.label}` : 'Substituir por esta sugestão';
        b.onclick = () => applySuggestion(i, s.text);
        actions.append(b);
      }
      const ign = document.createElement('button');
      ign.textContent = 'Ignorar';
      ign.onclick = () => { ignored.add(it.key ?? it.word.toLowerCase()); check(); };
      actions.append(ign);
      if (it.type !== 'typo') {
        const add = document.createElement('button');
        add.textContent = 'Adicionar ao dicionário';
        add.onclick = () => { personal.add(it.word.toLowerCase()); savePersonal(); check(); };
        actions.append(add);
      }

      li.append(w, ctx);
      if (note) li.append(note);
      li.append(actions);
      li.onmouseenter = () => { activeIndex = i; renderBackdrop(); };
      li.onmouseleave = () => { activeIndex = -1; renderBackdrop(); };
      li.onclick = (e) => {
        if (e.target.closest('button')) return;
        textEl.focus();
        textEl.setSelectionRange(it.start, it.end);
      };
      issuesEl.append(li);
    });
    if (issues.length > 200) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = `A mostrar os primeiros 200 de ${issues.length} erros.`;
      issuesEl.append(li);
    }
  }

  function renderPersonal() {
    personalCount.textContent = personal.size;
    personalEl.replaceChildren();
    [...personal].sort().forEach((w) => {
      const li = document.createElement('li');
      const span = document.createElement('span');
      span.textContent = w;
      const b = document.createElement('button');
      b.textContent = 'Remover';
      b.onclick = () => { personal.delete(w); savePersonal(); check(); };
      li.append(span, b);
      personalEl.append(li);
    });
  }

  function savePersonal() {
    store.set(personalKey(currentLang), [...personal]);
    renderPersonal();
  }

  const state = () => ({ text: textEl.value, lang: langEl.value });
  function pushUndo(s) {
    undoStack.push(s);
    if (undoStack.length > MAX_UNDO) undoStack.shift();
    undoBtn.disabled = false;
  }
  function endTyping() {
    clearTimeout(typingTimer);
    typing = false;
    snap = state();
  }
  // Qualquer alteração programática (sugestão, tradução…) fica registada como um passo.
  function recordChange(change) {
    endTyping();
    pushUndo(snap);
    change();
    snap = state();
  }

  function applySuggestion(i, suggestion) {
    const it = issues[i];
    recordChange(() => {
      const before = textEl.value;
      textEl.value = before.slice(0, it.start) + suggestion + before.slice(it.end);
    });
    check();
  }

  function check() {
    if (!speller) return;
    issues = findIssues(textEl.value);
    activeIndex = -1;
    renderBackdrop();
    renderIssues();
    statusEl.textContent = `${textEl.value.length} caracteres · ${issues.length} possíveis erros` +
      (autoDetected ? ' · idioma detetado automaticamente' : '');
    store.set('draft', textEl.value);
  }

  function scheduleCheck() {
    clearTimeout(timer);
    timer = setTimeout(check, 250);
  }

  // Deteção automática: ativa a partir de um ecrã em branco, até o utilizador escolher o idioma.
  const STOPWORDS = {
    'pt-PT': 'o a os as um uma uns umas de do da dos das em no na nos nas por para com sem sobre entre e ou mas que se não nao é são foi ser estar está estão tem têm tinha há ao aos à às isto isso este esta estes estas esse essa eu tu ele ela nós vós eles elas me te lhe nos meu minha seu sua muito mais já também como quando onde porque então ainda só aqui ali hoje ontem amanhã texto frase'.split(' '),
    en: 'the a an of to in on at by for with without about between and or but that this these those is are was were be been being have has had do does did not no it its he she they we you i me my your his her their our there here what which who when where why how very more also just so than then if as from into out up down over can could will would should may might one some any all'.split(' '),
  };
  const stopSets = Object.fromEntries(Object.entries(STOPWORDS).map(([k, v]) => [k, new Set(v)]));
  const AUTO_DETECT_MAX_CHARS = 300;
  let autoDetect = !textEl.value.trim();
  let autoDetected = false;

  function detectLanguage(text) {
    const words = text.toLowerCase().match(/[\p{L}\p{M}]+/gu) || [];
    const score = { 'pt-PT': 0, en: 0 };
    for (const w of words) {
      for (const lang of Object.keys(score)) if (stopSets[lang].has(w)) score[lang]++;
      if (/[ãõçáéíóúâêôà]/.test(w)) score['pt-PT'] += 2;
      if (/(ção|ções|ão|ões|nh|lh)/.test(w)) score['pt-PT']++;
      if (/(th|ing|tion|ough|wh)/.test(w)) score.en++;
    }
    const [best, other] = score['pt-PT'] >= score.en ? ['pt-PT', 'en'] : ['en', 'pt-PT'];
    return score[best] >= 2 && score[best] > score[other] ? best : null;
  }

  async function setLanguage(lang) {
    langEl.value = lang;
    updateDefineButton();
    updateDoubts();
    renderTargets();
    trRange = null;
    trActions.hidden = true;
    store.set('lang', lang);
    try {
      speller = await loadSpeller(lang);
      loadPersonal(lang);
      renderPersonal();
      ignored = new Set();
      other = null;
      check();
      loadOther(lang);
    } catch (e) { statusEl.textContent = e.message; }
  }

  async function loadOther(lang) {
    const otherLang = lang === 'en' ? 'pt-PT' : 'en';
    try {
      const dicts = await loadSpeller(otherLang, true);
      if (langEl.value !== lang) return;
      other = { lang: otherLang, dicts };
      check();
    } catch { /* sem o segundo dicionário só se perde a sugestão de outra língua */ }
  }

  function autoDetectLanguage() {
    const text = textEl.value;
    if (!text.trim()) { autoDetect = true; autoDetected = false; return; }
    if (!autoDetect) return;
    if (text.length > AUTO_DETECT_MAX_CHARS) { autoDetect = false; return; }
    const lang = detectLanguage(text);
    if (!lang) return;
    autoDetected = true;
    if (lang !== langEl.value) setLanguage(lang);
  }

  textEl.addEventListener('input', () => {
    // Cada rajada de escrita conta como um só passo para desfazer.
    if (!typing) { typing = true; pushUndo(snap); }
    clearTimeout(typingTimer);
    typingTimer = setTimeout(() => { typing = false; snap = state(); }, 800);
    renderBackdrop(); autoDetectLanguage(); scheduleCheck();
  });
  textEl.addEventListener('scroll', syncScroll);

  // Definição de palavras: português via proxy (Priberam), inglês direto do Wiktionary.
  const defineBtn = $('define'), definitionEl = $('definition');
  const definitionCache = new Map();
  const MAX_DEFS_PER_ENTRY = 8;

  const SOURCES = {
    'pt-PT': { name: 'Dicionário Priberam', url: (w) => `https://dicionario.priberam.org/${encodeURIComponent(w)}` },
    en: { name: 'Wiktionary', url: (w) => `https://en.wiktionary.org/wiki/${encodeURIComponent(w)}#English` },
  };

  function selectedWord() {
    const sel = textEl.value.slice(textEl.selectionStart, textEl.selectionEnd).trim();
    return /^[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*$/u.test(sel) ? sel : null;
  }

  function updateDefineButton() {
    defineBtn.disabled = !selectedWord();
  }

  async function fetchPortuguese(word) {
    const api = window.REVISOR_CONFIG?.definitionApi;
    if (!api) throw new Error('Proxy de definições não configurado.');
    const res = await fetch(`${api}/?word=${encodeURIComponent(word)}`);
    if (!res.ok) throw new Error('Não foi possível obter a definição.');
    return res.json();
  }

  const htmlToText = (html) => {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    doc.querySelectorAll('link, style, script, sup').forEach((n) => n.remove());
    return doc.body.textContent.replace(/\s+/g, ' ').trim();
  };

  async function fetchEnglish(word) {
    const res = await fetch(`https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(word)}`);
    if (res.status === 404) return { word, found: false, entries: [] };
    if (!res.ok) throw new Error('Não foi possível obter a definição.');
    const data = await res.json();
    const entries = (data.en || [])
      .map((e) => ({
        category: e.partOfSpeech.toLowerCase(),
        definitions: e.definitions.map((d) => htmlToText(d.definition)).filter(Boolean),
      }))
      .filter((e) => e.definitions.length);
    return { word, found: entries.length > 0, entries };
  }

  function renderDefinition(r, lang) {
    const source = SOURCES[lang];
    definitionEl.replaceChildren();
    const h = document.createElement('h3');
    h.textContent = r.word;
    definitionEl.append(h);
    if (!r.found) {
      const msg = lang === 'en' ? 'Word not found in the dictionary.' : 'Palavra não encontrada no dicionário.';
      definitionEl.append(Object.assign(document.createElement('p'), { textContent: msg }));
    }
    if (r.forms) definitionEl.append(Object.assign(document.createElement('p'), { className: 'forms', textContent: r.forms }));
    for (const e of r.entries) {
      if (e.category) definitionEl.append(Object.assign(document.createElement('div'), { className: 'cat', textContent: e.category }));
      const ol = document.createElement('ol');
      ol.style.listStyle = 'none';
      ol.style.paddingLeft = '0';
      const shown = lang === 'en' ? e.definitions.slice(0, MAX_DEFS_PER_ENTRY) : e.definitions;
      shown.forEach((d, i) => ol.append(Object.assign(document.createElement('li'), { textContent: lang === 'en' ? `${i + 1}. ${d}` : d })));
      if (shown.length < e.definitions.length) {
        ol.append(Object.assign(document.createElement('li'), { className: 'forms', textContent: `… mais ${e.definitions.length - shown.length} definições na fonte.` }));
      }
      definitionEl.append(ol);
    }
    const src = document.createElement('p');
    src.className = 'src';
    const a = document.createElement('a');
    a.href = source.url(r.word);
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = `Ver no ${source.name}`;
    src.append(a);
    definitionEl.append(src);
  }

  async function showDefinition() {
    const word = selectedWord();
    if (!word) return;
    const lang = langEl.value;
    const key = `${lang}:${word.toLowerCase()}`;
    if (definitionCache.has(key)) return renderDefinition(definitionCache.get(key), lang);
    definitionEl.textContent = `A procurar "${word}"…`;
    try {
      const data = await (lang === 'en' ? fetchEnglish : fetchPortuguese)(word.toLowerCase());
      definitionCache.set(key, data);
      renderDefinition(data, lang);
    } catch (e) {
      definitionEl.replaceChildren();
      const msg = e instanceof TypeError
        ? 'Não foi possível contactar o serviço de definições (sem ligação, ou proxy offline/mal configurado).'
        : e.message;
      definitionEl.append(Object.assign(document.createElement('p'), { textContent: `${msg} ` }));
      const a = Object.assign(document.createElement('a'), {
        href: SOURCES[lang].url(word.toLowerCase()),
        target: '_blank', rel: 'noopener', textContent: `Abrir no ${SOURCES[lang].name}`,
      });
      definitionEl.append(a);
    }
  }

  ['select', 'keyup', 'mouseup', 'input'].forEach((ev) => textEl.addEventListener(ev, updateDefineButton));
  document.addEventListener('selectionchange', () => { if (document.activeElement === textEl) updateDefineButton(); });
  defineBtn.onclick = showDefinition;

  // Dúvidas do Ciberdúvidas (só português), via proxy.
  const doubtsEl = $('doubts'), doubtsForm = $('doubtsForm'), doubtsQuery = $('doubtsQuery');
  const doubtsBtn = $('doubtsBtn'), doubtsResult = $('doubtsResult');
  const doubtsCache = new Map();
  let doubtsSeq = 0;
  const newsEl = $('news'), newsForm = $('newsForm'), newsQuery = $('newsQuery');
  const newsBtn = $('newsBtn'), newsResult = $('newsResult'), newsSites = $('newsSites');

  function updateDoubts() {
    const pt = langEl.value === 'pt-PT';
    doubtsEl.hidden = !pt;
    newsEl.hidden = !pt;
    doubtsBtn.disabled = !doubtsQuery.value.trim();
    newsBtn.disabled = !newsQuery.value.trim();
  }
  doubtsQuery.addEventListener('input', updateDoubts);
  newsQuery.addEventListener('input', updateDoubts);
  document.addEventListener('selectionchange', () => {
    if (document.activeElement !== textEl) return;
    const sel = textEl.value.slice(textEl.selectionStart, textEl.selectionEnd).trim();
    if (sel && sel.length <= 80 && !/\n/.test(sel)) { doubtsQuery.value = sel; newsQuery.value = sel; updateDoubts(); }
  });

  const doubtsMessage = (text, isError) => {
    doubtsResult.className = isError ? 'error' : '';
    doubtsResult.textContent = text;
  };

  const answerDialog = $('answerDialog'), answerBody = $('answerBody'), answerTitle = $('answerTitle');
  const answerSource = $('answerSource');
  const answerCache = new Map();
  let answerSeq = 0;
  $('answerClose').onclick = () => answerDialog.close();
  answerDialog.addEventListener('click', (e) => { if (e.target === answerDialog) answerDialog.close(); });

  function renderAnswer(d) {
    answerTitle.textContent = d.title;
    answerBody.className = 'dialog-body';
    const wrap = (cls, label, html) => {
      const box = document.createElement('div');
      box.className = cls;
      const h = document.createElement('h3');
      h.textContent = label;
      const body = document.createElement('div');
      body.innerHTML = html; // já limpo no proxy: só tags de texto, sem atributos
      box.append(h, body);
      return box;
    };
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = [d.author && `Resposta de ${d.author}`, d.date].filter(Boolean).join(' · ');
    answerBody.replaceChildren(wrap('question', 'Pergunta', d.question), wrap('answer', 'Resposta', d.answer), meta);
  }

  async function openAnswer(r) {
    const api = window.REVISOR_CONFIG?.definitionApi;
    const seq = ++answerSeq;
    answerTitle.textContent = r.title;
    answerSource.textContent = 'Ver no Ciberdúvidas';
    answerSource.href = r.url;
    answerBody.className = 'dialog-body';
    answerBody.textContent = 'A carregar a resposta…';
    if (!answerDialog.open) answerDialog.showModal();
    answerBody.scrollTop = 0;
    try {
      let d = answerCache.get(r.url);
      if (!d) {
        const res = await fetch(`${api}/resposta?url=${encodeURIComponent(r.url)}`);
        if (!res.ok) throw new Error();
        d = await res.json();
        answerCache.set(r.url, d);
      }
      if (seq === answerSeq) renderAnswer(d);
    } catch {
      if (seq === answerSeq) {
        answerBody.className = 'dialog-body error';
        answerBody.textContent = 'Não foi possível carregar a resposta. Usa a ligação abaixo para a ver no Ciberdúvidas.';
      }
    }
  }

  function renderDoubts(data) {
    doubtsResult.className = '';
    doubtsResult.replaceChildren();
    if (!data.results.length) {
      doubtsMessage(`Sem dúvidas encontradas para «${data.term}».`);
      return;
    }
    const list = document.createElement('ul');
    list.className = 'doubt-list';
    for (const r of data.results) {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = r.url; a.rel = 'noopener noreferrer';
      a.onclick = (e) => { if (window.REVISOR_CONFIG?.definitionApi) { e.preventDefault(); openAnswer(r); } };
      a.textContent = r.title;
      const p = document.createElement('p');
      p.textContent = r.summary;
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = [r.author, r.date].filter(Boolean).join(' · ');
      li.append(a, p, meta);
      list.append(li);
    }
    const src = document.createElement('p');
    src.className = 'src';
    const more = document.createElement('a');
    more.href = data.moreUrl; more.target = '_blank'; more.rel = 'noopener noreferrer';
    more.textContent = 'Ciberdúvidas da Língua Portuguesa';
    src.append('Fonte: ', more, ` · ${data.results.length} dúvidas mais relevantes para «${data.term}».`);
    doubtsResult.append(list, src);
  }

  doubtsForm.onsubmit = async (e) => {
    e.preventDefault();
    const term = doubtsQuery.value.trim();
    const api = window.REVISOR_CONFIG?.definitionApi;
    if (!term) return;
    if (!api) { doubtsMessage('Proxy não configurado.', true); return; }
    const seq = ++doubtsSeq;
    doubtsMessage('A pesquisar no Ciberdúvidas…');
    try {
      let data = doubtsCache.get(term.toLowerCase());
      if (!data) {
        const res = await fetch(`${api}/duvidas?q=${encodeURIComponent(term)}`);
        if (!res.ok) throw new Error();
        data = await res.json();
        doubtsCache.set(term.toLowerCase(), data);
      }
      if (seq === doubtsSeq) renderDoubts(data);
    } catch {
      if (seq === doubtsSeq) doubtsMessage('Não foi possível consultar o Ciberdúvidas. Tenta novamente.', true);
    }
  };

  // Notícias (só português): pesquisa via proxy; o popup mostra título, data e resumo, com ligação ao artigo.
  const newsCache = new Map();
  let newsSeq = 0;
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }) : '');
  const newsMessage = (text, isError) => {
    newsResult.className = isError ? 'error' : '';
    newsResult.textContent = text;
  };

  function openNews(r) {
    answerTitle.textContent = r.title;
    answerSource.textContent = 'Ler no site';
    answerSource.href = r.url;
    answerBody.className = 'dialog-body';
    const meta = document.createElement('p');
    meta.className = 'meta';
    meta.textContent = [r.source, fmtDate(r.date)].filter(Boolean).join(' · ');
    const box = document.createElement('div');
    box.className = 'question';
    const p = document.createElement('p');
    p.textContent = r.description || 'Sem resumo disponível. Abre a notícia no site original para a ler.';
    box.append(p);
    answerBody.replaceChildren(meta, box);
    if (!answerDialog.open) answerDialog.showModal();
    answerBody.scrollTop = 0;
  }

  function renderNews(data) {
    newsResult.className = '';
    newsResult.replaceChildren();
    if (!data.results.length) {
      newsMessage(`Sem notícias encontradas para «${data.term}».`);
      return;
    }
    const list = document.createElement('ul');
    list.className = 'doubt-list';
    for (const r of data.results) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'link';
      b.textContent = r.title;
      b.onclick = () => openNews(r);
      const meta = document.createElement('span');
      meta.className = 'meta';
      meta.textContent = [r.source, fmtDate(r.date)].filter(Boolean).join(' · ');
      li.append(b, meta);
      list.append(li);
    }
    const src = document.createElement('p');
    src.className = 'src';
    src.textContent = `Resultados do Bing Notícias para «${data.term}».`;
    if (data.failed?.length) src.textContent += ' Alguns sites não responderam.';
    newsResult.append(list, src);
  }

  newsForm.onsubmit = async (e) => {
    e.preventDefault();
    const term = newsQuery.value.trim();
    const api = window.REVISOR_CONFIG?.definitionApi;
    const sites = [...newsSites.querySelectorAll('input:checked')].map((i) => i.value);
    if (!term) return;
    if (!api) { newsMessage('Proxy não configurado.', true); return; }
    if (!sites.length) { newsMessage('Escolhe pelo menos um site.', true); return; }
    const seq = ++newsSeq;
    newsMessage('A pesquisar nas notícias…');
    const key = `${term.toLowerCase()}|${sites.join(',')}`;
    try {
      let data = newsCache.get(key);
      if (!data) {
        const res = await fetch(`${api}/noticias?q=${encodeURIComponent(term)}&sites=${sites.join(',')}`);
        if (!res.ok) throw new Error();
        data = await res.json();
        newsCache.set(key, data);
      }
      if (seq === newsSeq) renderNews(data);
    } catch {
      if (seq === newsSeq) newsMessage('Não foi possível pesquisar as notícias. Tenta novamente.', true);
    }
  };

  // Tradução entre português e inglês via DeepL (proxy guarda a chave).
  const trTarget = $('trTarget'), trBtn = $('translate'), trResult = $('trResult');
  const trActions = $('trActions'), trCopy = $('trCopy'), trApply = $('trApply');
  const TARGETS = {
    'pt-PT': [{ value: 'en-GB', label: 'Inglês (Reino Unido)' }, { value: 'en-US', label: 'Inglês (EUA)' }],
    en: [{ value: 'pt-PT', label: 'Português (Portugal)' }],
  };
  let trRange = null; // parte do texto que foi traduzida, para a poder substituir

  function renderTargets() {
    trTarget.replaceChildren(...TARGETS[langEl.value].map((t) => Object.assign(document.createElement('option'), { value: t.value, textContent: t.label })));
  }

  function updateTranslateButton() {
    trBtn.disabled = !textEl.value.trim();
    trBtn.textContent = textEl.selectionStart !== textEl.selectionEnd ? 'Traduzir seleção' : 'Traduzir texto';
  }

  function showTranslation(message, isError = false) {
    trResult.textContent = message;
    trResult.classList.toggle('error', isError);
    trActions.hidden = isError || !trRange || !message;
  }

  async function translateText() {
    const hasSelection = textEl.selectionStart !== textEl.selectionEnd;
    const start = hasSelection ? textEl.selectionStart : 0;
    const end = hasSelection ? textEl.selectionEnd : textEl.value.length;
    const text = textEl.value.slice(start, end);
    if (!text.trim()) return;
    const api = window.REVISOR_CONFIG?.definitionApi;
    trRange = null;
    trActions.hidden = true;
    trBtn.disabled = true;
    showTranslation('A traduzir…');
    try {
      if (!api) throw new Error('Proxy não configurado.');
      const res = await fetch(`${api}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, source: langEl.value, target: trTarget.value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível traduzir.');
      trRange = { start, end, original: text };
      showTranslation(data.text);
    } catch (e) {
      showTranslation(e instanceof TypeError ? 'Não foi possível contactar o serviço de tradução (sem ligação, ou proxy offline/mal configurado).' : e.message, true);
    } finally {
      updateTranslateButton();
    }
  }

  trBtn.onclick = translateText;
  trCopy.onclick = async () => {
    await navigator.clipboard.writeText(trResult.textContent);
    trCopy.textContent = 'Copiado!';
    setTimeout(() => { trCopy.textContent = 'Copiar'; }, 1500);
  };
  trApply.onclick = () => {
    if (!trRange) return;
    const current = textEl.value;
    if (current.slice(trRange.start, trRange.end) !== trRange.original) {
      showTranslation('O texto mudou desde a tradução. Traduz novamente antes de substituir.', true);
      return;
    }
    const translated = trResult.textContent;
    const replacedAll = trRange.start === 0 && trRange.end === current.length;
    recordChange(() => {
      textEl.value = current.slice(0, trRange.start) + translated + current.slice(trRange.end);
    });
    const targetLang = trTarget.value.startsWith('en') ? 'en' : 'pt-PT';
    trRange = null;
    trActions.hidden = true;
    if (replacedAll) {
      autoDetect = false;
      autoDetected = false;
      setLanguage(targetLang);
    } else {
      check();
    }
    snap = state();
    updateTranslateButton();
  };
  ['select', 'keyup', 'mouseup', 'input'].forEach((ev) => textEl.addEventListener(ev, updateTranslateButton));
  document.addEventListener('selectionchange', () => { if (document.activeElement === textEl) updateTranslateButton(); });
  renderTargets();
  updateTranslateButton();

  function undo() {
    endTyping();
    let previous;
    do { previous = undoStack.pop(); } while (previous && previous.text === textEl.value && previous.lang === langEl.value);
    undoBtn.disabled = !undoStack.length;
    if (!previous) return;
    textEl.value = previous.text;
    snap = previous;
    if (previous.lang !== langEl.value) setLanguage(previous.lang);
    else check();
    updateTranslateButton();
  }
  undoBtn.onclick = undo;
  textEl.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'y' || (k === 'z' && e.shiftKey)) e.preventDefault(); // sem refazer: o histórico nativo ficou desfasado
  });
  langEl.onchange = () => {
    autoDetect = false;
    autoDetected = false;
    setLanguage(langEl.value);
    if (!typing) snap = state();
  };

  const savedLang = store.get('lang', 'pt-PT');
  langEl.value = LANGUAGES[savedLang] ? savedLang : 'pt-PT';
  textEl.value = store.get('draft', '');
  autoDetect = !textEl.value.trim();
  snap = state();
  loadPersonal(langEl.value);
  renderPersonal();
  renderTargets();
  updateDoubts();
  updateTranslateButton();
  loadSpeller(langEl.value)
    .then((s) => { speller = s; check(); loadOther(langEl.value); })
    .catch((e) => { statusEl.textContent = `${e.message}. Abre a página através de um servidor (não file://).`; });
})();

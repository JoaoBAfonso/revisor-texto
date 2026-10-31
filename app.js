(() => {
  const $ = (id) => document.getElementById(id);
  const textEl = $('text'), backdrop = $('backdrop'), langEl = $('lang');
  const issuesEl = $('issues'), statusEl = $('status'), countEl = $('count');
  const undoBtn = $('undo'), personalEl = $('personal'), personalCount = $('personalCount');

  const WORD_RE = /[\p{L}\p{M}]+(?:['’-][\p{L}\p{M}]+)*/gu;
  const factoryPromise = window.HunspellAsm.loadModule();
  const spellers = {};
  const undoStack = [];
  let speller = null;
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

  async function loadSpeller(lang) {
    if (spellers[lang]) return spellers[lang];
    statusEl.textContent = 'A carregar dicionário…';
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

  function findIssues(text) {
    const found = [];
    for (const m of text.matchAll(WORD_RE)) {
      const word = m[0];
      if (word.length < 2) continue;
      if (ignored.has(word.toLowerCase())) continue;
      const result = classify(word.replace(/’/g, "'"));
      if (!result) continue;
      found.push({ word, start: m.index, end: m.index + word.length, ...result });
    }
    return found;
  }

  const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

  function renderBackdrop() {
    const text = textEl.value;
    let html = '', pos = 0;
    issues.forEach((it, i) => {
      html += esc(text.slice(pos, it.start));
      const cls = [it.type === 'variant' ? 'variant' : '', i === activeIndex ? 'active' : ''].filter(Boolean).join(' ');
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
    return `${a > 0 ? '…' : ''}${text.slice(a, it.start)}[${it.word}]${text.slice(it.end, b)}${b < text.length ? '…' : ''}`
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
      w.textContent = it.word;
      li.className = it.type;
      const ctx = document.createElement('span');
      ctx.className = 'ctx';
      ctx.textContent = contextOf(it);
      const actions = document.createElement('div');
      actions.className = 'actions';

      let note = null;
      if (it.type === 'variant') {
        note = document.createElement('span');
        note.className = 'note';
        note.textContent = `Variante: correta em ${it.okLabels.join(', ')}; não aceite em ${it.missingLabels.join(', ')}.`;
      }

      for (const s of it.suggestions) {
        const b = document.createElement('button');
        b.className = 'sug';
        b.textContent = s.label ? `${s.text} (${s.label})` : s.text;
        b.title = s.label ? `Mudar para a variante ${s.label}` : 'Substituir por esta sugestão';
        b.onclick = () => applySuggestion(i, s.text);
        actions.append(b);
      }
      const ign = document.createElement('button');
      ign.textContent = 'Ignorar';
      ign.onclick = () => { ignored.add(it.word.toLowerCase()); check(); };
      const add = document.createElement('button');
      add.textContent = 'Adicionar ao dicionário';
      add.onclick = () => { personal.add(it.word.toLowerCase()); savePersonal(); check(); };
      actions.append(ign, add);

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

  function applySuggestion(i, suggestion) {
    const it = issues[i];
    const before = textEl.value;
    undoStack.push({ text: before, lang: langEl.value });
    textEl.value = before.slice(0, it.start) + suggestion + before.slice(it.end);
    undoBtn.disabled = false;
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
    renderTargets();
    trRange = null;
    trActions.hidden = true;
    store.set('lang', lang);
    try {
      speller = await loadSpeller(lang);
      loadPersonal(lang);
      renderPersonal();
      ignored = new Set();
      check();
    } catch (e) { statusEl.textContent = e.message; }
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

  textEl.addEventListener('input', () => { renderBackdrop(); autoDetectLanguage(); scheduleCheck(); });
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
    undoStack.push({ text: current, lang: langEl.value });
    undoBtn.disabled = false;
    const replacedAll = trRange.start === 0 && trRange.end === current.length;
    textEl.value = current.slice(0, trRange.start) + translated + current.slice(trRange.end);
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
    updateTranslateButton();
  };
  ['select', 'keyup', 'mouseup', 'input'].forEach((ev) => textEl.addEventListener(ev, updateTranslateButton));
  document.addEventListener('selectionchange', () => { if (document.activeElement === textEl) updateTranslateButton(); });
  renderTargets();
  updateTranslateButton();

  undoBtn.onclick = () => {
    if (!undoStack.length) return;
    const previous = undoStack.pop();
    textEl.value = previous.text;
    undoBtn.disabled = !undoStack.length;
    if (previous.lang !== langEl.value) setLanguage(previous.lang);
    else check();
    updateTranslateButton();
  };
  langEl.onchange = () => {
    autoDetect = false;
    autoDetected = false;
    setLanguage(langEl.value);
  };

  const savedLang = store.get('lang', 'pt-PT');
  langEl.value = LANGUAGES[savedLang] ? savedLang : 'pt-PT';
  textEl.value = store.get('draft', '');
  autoDetect = !textEl.value.trim();
  loadPersonal(langEl.value);
  renderPersonal();
  renderTargets();
  updateTranslateButton();
  loadSpeller(langEl.value)
    .then((s) => { speller = s; check(); })
    .catch((e) => { statusEl.textContent = `${e.message}. Abre a página através de um servidor (não file://).`; });
})();

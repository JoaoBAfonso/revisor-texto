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
  let links = []; // ligações no texto: [{ start, end, url }], ordenadas e sem sobreposição
  let prevText = '';
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
    const cuts = new Set([0, text.length]);
    for (const it of issues) { cuts.add(it.start); cuts.add(it.end); }
    for (const l of links) { cuts.add(l.start); cuts.add(l.end); }
    const pts = [...cuts].filter((p) => p >= 0 && p <= text.length).sort((a, b) => a - b);
    let html = '', ii = 0, lj = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const s = pts[k], e = pts[k + 1];
      while (ii < issues.length && issues[ii].end <= s) ii++;
      while (lj < links.length && links[lj].end <= s) lj++;
      const it = issues[ii] && issues[ii].start <= s ? issues[ii] : null;
      const lk = links[lj] && links[lj].start <= s ? links[lj] : null;
      let part = esc(text.slice(s, e));
      if (it) {
        const cls = [it.type === 'error' ? '' : it.type, ii === activeIndex ? 'active' : ''].filter(Boolean).join(' ');
        part = `<mark${cls ? ` class="${cls}"` : ''}>${part}</mark>`;
      }
      if (lk) part = `<span class="lnk">${part}</span>`;
      html += part;
    }
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
        activeIndex = i;
        renderBackdrop();
        textEl.focus({ preventScroll: true });
        textEl.setSelectionRange(it.start, it.end);
        textEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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

  const state = () => ({ text: textEl.value, lang: langEl.value, links: links.map((l) => ({ ...l })) });
  const sameState = (a, b) => a.text === b.text && a.lang === b.lang && JSON.stringify(a.links) === JSON.stringify(b.links);

  // Mantém as ligações coladas ao texto certo quando o texto muda (escrita, sugestões, tradução…).
  function adjustLinks(before, after) {
    if (before === after) return;
    const max = Math.min(before.length, after.length);
    let a = 0;
    while (a < max && before[a] === after[a]) a++;
    let b = 0;
    while (b < max - a && before[before.length - 1 - b] === after[after.length - 1 - b]) b++;
    const removed = before.length - a - b, inserted = after.length - a - b;
    const delta = inserted - removed, editEnd = a + removed;
    links = links.flatMap((l) => {
      let { start: s, end: e } = l;
      if (editEnd <= s) { s += delta; e += delta; }
      else if (a >= e) { /* depois da ligação */ }
      else if (a <= s && editEnd >= e) return [];
      else if (a <= s) { s = a + inserted; e += delta; }
      else if (editEnd >= e) e = a;
      else e += delta;
      return e > s ? [{ ...l, start: s, end: e }] : [];
    });
  }

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
  // Qualquer alteração programática (sugestão, tradução, ligação…) fica registada como um passo.
  function recordChange(change) {
    endTyping();
    pushUndo(snap);
    const before = textEl.value;
    change();
    adjustLinks(before, textEl.value);
    prevText = textEl.value;
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
    store.set('links', links);
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
    adjustLinks(prevText, textEl.value);
    prevText = textEl.value;
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

  // ── Pesquisas: Ciberdúvidas, notícias e direito (só português) ──
  const API = () => window.REVISOR_CONFIG?.definitionApi;

  // Cria elementos sem repetição: h('a', { href, onclick }, 'texto', outroNó).
  const h = (tag, props = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k in el) el[k] = v;
      else el.setAttribute(k, v);
    }
    el.append(...kids.flat().filter((k) => k != null && k !== false));
    return el;
  };
  const extLink = (href, text) => h('a', { href, target: '_blank', rel: 'noopener noreferrer' }, text);
  const checked = (fieldset) => [...fieldset.querySelectorAll('input:checked')].map((i) => i.value);
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

  // Pedidos ao proxy com cache em memória; «keep» decide se a resposta merece ser guardada.
  const memo = new Map();
  async function getJson(path, params, { signal, keep = () => true } = {}) {
    const url = `${API()}${path}?${new URLSearchParams(params)}`;
    const key = url.toLowerCase();
    if (memo.has(key)) return memo.get(key);
    const res = await fetch(url, { signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (keep(data)) memo.set(key, data);
    return data;
  }

  // Uma pesquisa = formulário + pedido ao proxy + desenho do resultado. Cancela o pedido anterior ao submeter outro.
  function createSearch({ section, form, input, button, result, path, busy, fail, params, keep, render }) {
    let controller = null;
    const say = (text, isError = false) => { result.className = isError ? 'error' : ''; result.textContent = text; };
    const sync = () => { button.disabled = !input.value.trim(); };

    async function run() {
      const term = input.value.trim();
      if (!term) return;
      if (!API()) { say('Proxy não configurado.', true); return; }
      const extra = params?.() ?? {};
      if (extra.error) { say(extra.error, true); return; }
      controller?.abort();
      controller = new AbortController();
      say(busy);
      try {
        const data = await getJson(path, { q: term, ...extra }, { signal: controller.signal, keep });
        result.className = '';
        result.replaceChildren();
        render(data);
      } catch (err) {
        if (err.name !== 'AbortError') say(fail, true);
      }
    }

    form.addEventListener('submit', (e) => { e.preventDefault(); run(); });
    input.addEventListener('input', sync);
    return {
      section, input, result, say, sync, run,
      ask(term) { input.value = term; sync(); section.scrollIntoView({ block: 'start', behavior: 'smooth' }); run(); },
    };
  }

  const doubts = createSearch({
    section: $('doubts'), form: $('doubtsForm'), input: $('doubtsQuery'), button: $('doubtsBtn'), result: $('doubtsResult'),
    path: '/duvidas', busy: 'A pesquisar no Ciberdúvidas…', fail: 'Não foi possível consultar o Ciberdúvidas. Tenta novamente.',
    render: (data) => renderDoubts(data),
  });
  const newsSites = $('newsSites');
  const news = createSearch({
    section: $('news'), form: $('newsForm'), input: $('newsQuery'), button: $('newsBtn'), result: $('newsResult'),
    path: '/noticias', busy: 'A pesquisar nas notícias…', fail: 'Não foi possível pesquisar as notícias. Tenta novamente.',
    params: () => { const sites = checked(newsSites); return sites.length ? { sites: sites.join(',') } : { error: 'Escolhe pelo menos um site.' }; },
    render: (data) => renderNews(data),
  });
  const lawSources = $('lawSources');
  const law = createSearch({
    section: $('law'), form: $('lawForm'), input: $('lawQuery'), button: $('lawBtn'), result: $('lawResult'),
    path: '/direito', busy: 'A interpretar e a pesquisar…', fail: 'Não foi possível pesquisar. Tenta novamente.',
    params: () => { const sources = checked(lawSources); return sources.length ? { sources: sources.join(',') } : { error: 'Escolhe pelo menos uma fonte.' }; },
    keep: (data) => data.results.length > 0,
    render: (data) => renderLaw(data),
  });
  const searches = [doubts, news, law];

  function updateDoubts() {
    const pt = langEl.value === 'pt-PT';
    for (const s of searches) { s.section.hidden = !pt; s.sync(); }
  }
  document.addEventListener('selectionchange', () => {
    if (document.activeElement !== textEl) return;
    const sel = textEl.value.slice(textEl.selectionStart, textEl.selectionEnd).trim();
    if (sel && sel.length <= 80 && !/\n/.test(sel)) { for (const s of searches) s.input.value = sel; updateDoubts(); }
  });
  const answerDialog = $('answerDialog'), answerBody = $('answerBody'), answerTitle = $('answerTitle');
  const answerSource = $('answerSource');
  let dialogCtl = null; // cancela o carregamento do popup anterior
  $('answerClose').onclick = () => answerDialog.close();
  answerDialog.addEventListener('click', (e) => { if (e.target === answerDialog) answerDialog.close(); });

  function openDialog({ title, label, url }) {
    dialogCtl?.abort();
    dialogCtl = new AbortController();
    answerTitle.textContent = title;
    answerSource.textContent = label;
    answerSource.href = url;
    answerBody.className = 'dialog-body';
    setupInsert(url);
    if (!answerDialog.open) answerDialog.showModal();
    answerBody.scrollTop = 0;
    return dialogCtl.signal;
  }

  function renderAnswer(d) {
    answerTitle.textContent = d.title;
    answerBody.className = 'dialog-body';
    const wrap = (cls, label, html) => {
      const body = h('div');
      body.innerHTML = html; // já limpo no proxy: só tags de texto, sem atributos
      return h('div', { class: cls }, h('h3', {}, label), body);
    };
    const meta = h('p', { class: 'meta' }, [d.author && `Resposta de ${d.author}`, d.date].filter(Boolean).join(' · '));
    answerBody.replaceChildren(wrap('question', 'Pergunta', d.question), wrap('answer', 'Resposta', d.answer), meta);
  }

  async function openAnswer(r) {
    const signal = openDialog({ title: r.title, label: 'Ver no Ciberdúvidas', url: r.url });
    answerBody.textContent = 'A carregar a resposta…';
    try {
      renderAnswer(await getJson('/resposta', { url: r.url }, { signal }));
    } catch (err) {
      if (err.name === 'AbortError') return;
      answerBody.className = 'dialog-body error';
      answerBody.textContent = 'Não foi possível carregar a resposta. Usa a ligação abaixo para a ver no Ciberdúvidas.';
    }
  }

  function renderDoubts(data) {
    if (!data.results.length) { doubts.say(`Sem dúvidas encontradas para «${data.term}».`); return; }
    doubts.result.append(
      h('ul', { class: 'doubt-list' }, data.results.map((r) => h('li', {},
        h('a', { href: r.url, rel: 'noopener noreferrer', onclick: (e) => { if (API()) { e.preventDefault(); openAnswer(r); } } }, r.title),
        h('p', {}, r.summary),
        h('span', { class: 'meta' }, [r.author, r.date].filter(Boolean).join(' · '))))),
      h('p', { class: 'src' }, 'Fonte: ', extLink(data.moreUrl, 'Ciberdúvidas da Língua Portuguesa'),
        ` · ${data.results.length} dúvidas mais relevantes para «${data.term}».`),
    );
  }


  // Guarda a última seleção no editor: é nela que a ligação da notícia é inserida (em Markdown).
  let lastSel = null;
  document.addEventListener('selectionchange', () => {
    if (document.activeElement !== textEl) return;
    const { selectionStart: start, selectionEnd: end } = textEl;
    const text = textEl.value.slice(start, end);
    if (text.trim()) lastSel = { start, end, text };
  });
  const answerInsert = $('answerInsert');
  function setupInsert(url) {
    answerInsert.hidden = false;
    answerInsert.disabled = !lastSel;
    answerInsert.textContent = lastSel ? 'Ligar a seleção a esta página' : 'Seleciona texto no editor para o ligar a esta página';
    answerInsert.onclick = () => {
      let { start, end, text } = lastSel;
      if (textEl.value.slice(start, end) !== text) {
        start = textEl.value.indexOf(text);
        if (start < 0) { answerInsert.textContent = 'A seleção já não existe no texto'; return; }
        end = start + text.length;
      }
      setLink(start, end, url);
      lastSel = null;
      answerDialog.close();
    };
  }

  async function openNews(r) {
    const signal = openDialog({ title: r.title, label: 'Ler no site', url: r.url });
    const draw = (d, loading) => {
      const by = d?.authors?.length ? `Por ${d.authors.join(', ')}` : (loading ? 'A obter autor…' : 'Autor não indicado');
      const paragraphs = (d?.text || '').split('\n\n').filter(Boolean);
      if (!paragraphs.length) paragraphs.push(d?.description || r.description || 'Sem texto disponível. Abre a notícia no site original para a ler.');
      const note = loading ? 'A carregar mais texto…'
        : (d?.text ? 'Excerto do início da notícia. Para a ler na íntegra, abre-a no site original.' : '');
      answerBody.replaceChildren(
        h('p', { class: 'meta' }, [by, r.source, fmtDate(r.date)].filter(Boolean).join(' · ')),
        h('div', { class: 'question' }, paragraphs.map((t) => h('p', {}, t))),
        h('p', { class: 'meta' }, note),
      );
    };
    draw(null, true);
    try {
      draw(await getJson('/noticia', { url: r.url }, { signal }), false);
    } catch (err) {
      if (err.name !== 'AbortError') draw({}, false);
    }
  }

  function renderNews(data) {
    if (!data.results.length) { news.say(`Sem notícias encontradas para «${data.term}».`); return; }
    news.result.append(
      h('ul', { class: 'doubt-list' }, data.results.map((r) => h('li', {},
        h('button', { type: 'button', class: 'link', onclick: () => openNews(r) }, r.title),
        h('span', { class: 'meta' }, [r.source, fmtDate(r.date)].filter(Boolean).join(' · '))))),
      h('p', { class: 'src' }, `Resultados do Bing Notícias para «${data.term}».`, data.failed?.length ? ' Alguns sites não responderam.' : ''),
    );
  }

  // Direito e legislação: o proxy interpreta o termo e devolve um guia (direitos, passos, prazos, entidades)
  // mais resultados de fontes oficiais.
  function openLaw(r) {
    openDialog({ title: r.title, label: `Abrir em ${r.source}`, url: r.url });
    answerBody.replaceChildren(
      h('p', { class: 'meta' }, [r.kind, r.source].join(' · ')),
      h('div', { class: 'question' }, h('p', {}, r.description || 'Sem excerto disponível. Abre a fonte para ler o documento.')),
      h('p', { class: 'meta' }, 'Excerto devolvido pelo motor de pesquisa. Confirma sempre o texto em vigor na fonte oficial.'),
    );
  }

  const lawList = (items, ordered = false) => h(ordered ? 'ol' : 'ul', {}, items.map((t) => h('li', {}, t)));
  const lawBlock = (title, ...content) => h('section', { class: 'law-block' }, h('h4', {}, title), ...content);
  const entityList = (entities) => h('ul', { class: 'entity-list' }, entities.map((e) => h('li', {},
    e.url ? extLink(e.url, e.name) : h('strong', {}, e.name), ` — ${e.role}`)));

  function lawGuide(t, open) {
    return h('details', { class: 'law-topic', open },
      h('summary', {}, t.area),
      h('p', { class: 'law-note' }, t.note),
      t.rights?.length ? lawBlock('Os teus direitos', lawList(t.rights)) : null,
      t.steps?.length ? lawBlock('Como agir', lawList(t.steps, true)) : null,
      t.deadlines?.length ? lawBlock('Prazos', h('ul', { class: 'deadlines' }, t.deadlines.map((d) => h('li', {},
        h('strong', {}, d.when), ` — ${d.what} `, h('span', { class: 'meta' }, `(${d.base})`))))) : null,
      t.arguments?.length ? lawBlock('Argumentos úteis', lawList(t.arguments)) : null,
      t.entities?.length ? lawBlock('Onde recorrer', entityList(t.entities)) : null,
      t.refs?.length ? lawBlock('Diplomas e artigos (toca para pesquisar)', h('p', { class: 'chips' }, t.refs.map((ref) =>
        h('button', { type: 'button', class: 'chip', onclick: () => law.ask(ref) }, ref)))) : null,
    );
  }

  function lawResults(results) {
    const groups = new Map();
    for (const r of results) {
      const kind = r.related ? `${r.kind} (área relacionada)` : r.kind;
      if (!groups.has(kind)) groups.set(kind, []);
      groups.get(kind).push(r);
    }
    return [...groups].map(([kind, items]) => h('div', { class: 'law-group' },
      h('h3', {}, kind),
      h('ul', { class: 'doubt-list' }, items.map((r) => h('li', {},
        h('button', { type: 'button', class: 'link', onclick: () => openLaw(r) }, r.title),
        h('span', { class: 'meta' }, r.source))))));
  }

  function renderLaw(data) {
    const { citation, topics = [], toolkit = [] } = data.interpretation || {};
    law.result.append(...[
      citation ? h('p', { class: 'law-cite' }, `Interpretado como citação: ${citation.label}`) : null,
      topics.map((t, i) => lawGuide(t, i === 0)),
      data.results.length ? lawResults(data.results) : h('p', {}, `Sem resultados diretos nas fontes escolhidas para «${data.term}».`),
      toolkit.length ? h('details', { class: 'law-topic law-toolkit' },
        h('summary', {}, 'Ferramentas ao teu alcance, em qualquer situação'),
        h('ul', { class: 'toolkit' }, toolkit.map((k) => h('li', {}, h('strong', {}, k.title), ` ${k.text}`,
          k.entities.length ? entityList(k.entities) : null)))) : null,
      h('p', { class: 'src' },
        `Informação orientativa, que não substitui aconselhamento jurídico. Confirma sempre o texto em vigor e os prazos na fonte oficial. Pesquisa via ${data.provider || 'motor de pesquisa'}. `,
        data.failed?.length ? 'Falhou a pesquisa. ' : null,
        data.moreUrl ? extLink(data.moreUrl, 'Ver mais no Google') : null),
    ].flat().filter(Boolean));
  }

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

  // Ligações no texto: guardadas à parte (o editor continua a ser texto simples) e desenhadas no overlay.
  const linkBtn = $('linkBtn'), linkBar = $('linkBar'), linkDialog = $('linkDialog');
  const linkForm = $('linkForm'), linkInput = $('linkUrl'), linkError = $('linkError');
  let linkTarget = null;

  function normalizeUrl(value) {
    let v = value.trim();
    if (!v || /\s/.test(v)) return '';
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) {
      if (!/^(https?:|mailto:)/i.test(v)) return '';
    } else v = `https://${v}`;
    try {
      const u = new URL(v);
      return u.protocol === 'mailto:' || u.hostname.includes('.') ? u.href : '';
    } catch { return ''; }
  }

  function linkAtSelection() {
    const s = textEl.selectionStart, e = textEl.selectionEnd;
    return links.find((l) => (s === e ? l.start <= s && s <= l.end : l.start < e && s < l.end)) || null;
  }

  function updateLinkBar() {
    const cur = linkAtSelection();
    linkBtn.disabled = textEl.selectionStart === textEl.selectionEnd && !cur;
    linkBtn.textContent = cur ? 'Editar ligação' : 'Ligação';
    linkBar.hidden = !cur;
    if (!cur) return;
    $('linkShown').textContent = cur.url.length > 70 ? `${cur.url.slice(0, 69)}…` : cur.url;
    $('linkOpen').href = cur.url;
  }

  function refreshLinks() {
    renderBackdrop();
    store.set('links', links);
    updateLinkBar();
  }

  function setLink(start, end, url) {
    const text = textEl.value;
    while (start < end && /\s/.test(text[start])) start++;
    while (end > start && /\s/.test(text[end - 1])) end--;
    if (start >= end) return;
    recordChange(() => {
      links = links.filter((l) => l.end <= start || l.start >= end);
      if (url) links.push({ start, end, url });
      links.sort((a, b) => a.start - b.start);
    });
    refreshLinks();
  }

  function openLinkDialog() {
    const cur = linkAtSelection();
    const s = textEl.selectionStart, e = textEl.selectionEnd;
    linkTarget = s !== e ? { start: s, end: e } : cur && { start: cur.start, end: cur.end };
    if (!linkTarget) return;
    linkInput.value = cur?.url || '';
    linkError.hidden = true;
    linkDialog.showModal();
    linkInput.select();
  }

  linkBtn.onclick = openLinkDialog;
  $('linkEdit').onclick = openLinkDialog;
  $('linkCancel').onclick = () => linkDialog.close();
  $('linkRemove').onclick = () => {
    const cur = linkAtSelection();
    if (cur) setLink(cur.start, cur.end, '');
  };
  linkForm.onsubmit = (e) => {
    e.preventDefault();
    const url = normalizeUrl(linkInput.value);
    if (!url) { linkError.hidden = false; return; }
    setLink(linkTarget.start, linkTarget.end, url);
    linkDialog.close();
  };
  ['select', 'keyup', 'mouseup', 'input'].forEach((ev) => textEl.addEventListener(ev, updateLinkBar));
  textEl.addEventListener('click', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const cur = linkAtSelection();
    if (cur) window.open(cur.url, '_blank', 'noopener,noreferrer');
  });
  // Colar um endereço sobre texto selecionado transforma essa seleção numa ligação.
  textEl.addEventListener('paste', (e) => {
    const s = textEl.selectionStart, en = textEl.selectionEnd;
    const pasted = (e.clipboardData?.getData('text') || '').trim();
    if (s === en || !/^https?:\/\/\S+$/i.test(pasted)) return;
    const url = normalizeUrl(pasted);
    if (!url) return;
    e.preventDefault();
    setLink(s, en, url);
  });

  // Copia o texto com as ligações como HTML (para colar em Word, e-mail, CMS…).
  const copyRich = $('copyRich');
  copyRich.onclick = async () => {
    const text = textEl.value;
    const html = (s) => esc(s).replace(/\n/g, '<br>');
    let out = '', pos = 0;
    for (const l of links) {
      out += `${html(text.slice(pos, l.start))}<a href="${esc(l.url).replace(/"/g, '&quot;')}">${html(text.slice(l.start, l.end))}</a>`;
      pos = l.end;
    }
    out += html(text.slice(pos));
    let label = 'Copiado';
    try {
      await navigator.clipboard.write([new ClipboardItem({
        'text/html': new Blob([`<div>${out}</div>`], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      })]);
    } catch {
      try { await navigator.clipboard.writeText(text); label = 'Copiado (sem ligações)'; } catch { label = 'Não foi possível copiar'; }
    }
    copyRich.textContent = label;
    setTimeout(() => { copyRich.textContent = 'Copiar com ligações'; }, 1800);
  };

  function undo() {
    endTyping();
    let previous;
    do { previous = undoStack.pop(); } while (previous && sameState(previous, state()));
    undoBtn.disabled = !undoStack.length;
    if (!previous) return;
    textEl.value = previous.text;
    links = previous.links.map((l) => ({ ...l }));
    prevText = previous.text;
    snap = previous;
    if (previous.lang !== langEl.value) setLanguage(previous.lang);
    else check();
    refreshLinks();
    updateTranslateButton();
  }
  undoBtn.onclick = undo;
  textEl.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
    else if (k === 'k') { e.preventDefault(); openLinkDialog(); }
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
  prevText = textEl.value;
  links = store.get('links', [])
    .filter((l) => l && Number.isInteger(l.start) && Number.isInteger(l.end) && l.start >= 0 && l.start < l.end
      && l.end <= textEl.value.length && /^(https?|mailto):/i.test(String(l.url)))
    .sort((a, b) => a.start - b.start);
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

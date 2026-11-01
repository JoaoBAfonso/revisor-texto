import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { runInNewContext } from 'node:vm';
import { isDeepStrictEqual } from 'node:util';
import { ENTITIES, TOOLKIT, TOPICS } from './guia.js';
import { ALIASES } from './corpus/catalog.mjs';
import { compileGuide, makeResolver } from './corpus/procedures.mjs';
import { LEGAL_SITUATIONS, SITUATION_PATHS, SITUATION_URGENCY, situationGuidance, situationModel, situationModelText, situationArticle } from './legal-situations.mjs';

const present = (value) => typeof value === 'string' && value.trim().length > 0;
const webUrl = (value) => {
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
};

export function auditKnowledge({ topics, entities, toolkit, kit, resolve, documents = [] }) {
  const findings = [];
  const add = (owner, code, message, kind = 'review') => findings.push({ owner, code, kind, message });
  const ids = new Set();
  const checkEntities = (owner, list) => {
    for (const id of list || []) if (!entities[id]) add(owner, 'unknown-entity', `Entidade não definida: ${id}`, 'integrity');
  };
  const reference = (owner, text, articleRequired = false, documentOnlyCode = 'deadline-document-only') => {
    if (!present(text)) {
      add(owner, 'missing-reference', 'Não há referência estruturada para conferir.', 'integrity');
      return { text: text || '', to: null, status: 'missing' };
    }
    const result = resolve(text);
    const exact = result.to && !result.why;
    const article = exact && result.to.includes(':');
    const status = !exact ? 'unresolved' : articleRequired && !article ? 'document-only' : article ? 'article-linked' : 'document-linked';
    if (!exact) add(owner, 'unresolved-reference', `${text}: ${result.why || 'sem ligação ao corpus'}`, 'integrity');
    else if (articleRequired && !article) add(owner, documentOnlyCode, `${text}: ligação ao diploma, não a um artigo exato.`, 'integrity');
    if ((text.match(/\bn\.?º\s*\d+(?:-[A-Z])?\/\d+/gi) || []).length > 1 || /\barts\.|\bartigos\b/i.test(text)) {
      add(owner, 'multiple-reference-review', 'A citação abrange várias normas; a ligação do resolver não demonstra cobertura integral de todas.', 'integrity');
    }
    return { text, to: result.to || null, status };
  };
  const inventory = topics.map((topic) => {
    const owner = `topic:${topic.id}`;
    if (ids.has(topic.id)) add(owner, 'duplicate-topic', 'Identificador de área repetido.', 'integrity');
    ids.add(topic.id);
    for (const field of ['area', 'note']) if (!present(topic[field])) add(owner, 'missing-content', `Falta ${field}.`, 'integrity');
    for (const field of ['rights', 'steps', 'arguments']) {
      if (!Array.isArray(topic[field]) || !topic[field].length || topic[field].some((text) => !present(text))) {
        add(owner, 'missing-content', `Conteúdo incompleto: ${field}.`, 'integrity');
      }
    }
    checkEntities(owner, topic.entities);
    const refs = (topic.refs || []).map((text, index) => reference(`${owner}:ref:${index}`, text));
    if (!refs.length) add(owner, 'missing-reference', 'Área sem referências estruturadas.', 'integrity');
    const deadlines = (topic.deadlines || []).map((deadline, index) => {
      const key = `${owner}:deadline:${index}`;
      for (const field of ['what', 'when']) if (!present(deadline[field])) add(key, 'missing-content', `Prazo sem ${field}.`, 'integrity');
      const base = reference(key, deadline.base, true);
      const contextRefs = (deadline.contextRefs || []).map((text, index) => reference(`${key}:context:${index}`, text, true));
      if (!present(deadline.trigger) || !present(deadline.limits)) add(key, 'deadline-context-missing', 'Evento inicial ou limites não estão estruturados; requer contextualização.');
      add(key, 'deadline-context-review', 'Conferir duração, evento inicial, contagem, exceções e versão aplicável. Uma ligação exata não valida o prazo.');
      return { ...deadline, reference: base, contextRefs };
    });
    const guidance = {};
    if (topic.guidance) {
      for (const field of ['rights', 'steps', 'arguments']) {
        const items = topic.guidance[field];
        if (!Array.isArray(items)) {
          add(owner, 'invalid-guidance', `Orientações estruturadas sem lista ${field}.`, 'integrity');
          continue;
        }
        if (!Array.isArray(topic[field]) || items.length !== topic[field].length) add(owner, 'invalid-guidance', `Orientações ${field} não correspondem ao conteúdo apresentado.`, 'integrity');
        guidance[field] = items.map((item, index) => {
          const key = `${owner}:${field}:${index}`;
          if (!item || !present(item.text) || item.text !== topic[field]?.[index] || !['legal', 'preparation'].includes(item.kind)) {
            add(key, 'invalid-guidance', 'Texto ou natureza da orientação inválidos ou diferentes do conteúdo apresentado.', 'integrity');
          }
          const references = Array.isArray(item?.refs) ? item.refs.map((text) => reference(key, text, true, 'guidance-document-only')) : [];
          if (!references.length) add(key, 'missing-reference', 'Orientação sem artigos de fundamento ou contexto.', 'integrity');
          add(key, 'guidance-legal-review', 'Conferir apoio efetivo de cada artigo ao texto, condições, regime e versão; preparação prática não equivale a dever legal.');
          return { text: item?.text, kind: item?.kind, references };
        });
      }
      add(owner, 'topic-summary-review', 'Resumo da área permanece em texto livre e não constitui uma orientação individual verificada.');
    } else add(owner, 'claim-traceability', 'Direitos, passos e argumentos são texto livre: não há ligação individual estruturada de cada orientação à sua fonte.');
    add(owner, 'situation-readiness', 'Conferir situações vividas, condições de utilização, exceções, prova e alternativas antes de construir um percurso de ação.');
    add(owner, 'legal-review-not-recorded', 'Não há registo estruturado de revisão jurídica e versão das fontes desta área.');
    return { id: topic.id, area: topic.area, refs, deadlines, guidance, entities: topic.entities || [] };
  });
  for (const [id, entity] of Object.entries(entities)) {
    const owner = `entity:${id}`;
    if (!present(entity.name) || !present(entity.role) || !webUrl(entity.url)) add(owner, 'invalid-entity', 'Nome, papel ou URL da entidade incompleto/inválido.', 'integrity');
    add(owner, 'entity-route-review', 'Confirmar competência, canal de atuação e ligação atual; não foi feita verificação na rede.');
  }
  for (const [index, item] of toolkit.entries()) {
    const owner = `toolkit:${index}`;
    checkEntities(owner, item.ent);
    if (!present(item.title) || !present(item.text)) add(owner, 'missing-content', 'Ferramenta geral sem título ou texto.', 'integrity');
    add(owner, 'claim-traceability', 'Orientação geral sem fontes individuais estruturadas; as citações no texto não foram extraídas automaticamente.');
  }
  for (const [id, angles] of Object.entries(kit.ANGLES)) {
    if (!ids.has(id)) add(`angles:${id}`, 'unknown-topic', 'Perspetivas de área inexistente.', 'integrity');
    for (const [index, angle] of angles.entries()) {
      if (!present(angle.title) || !present(angle.text) || !Array.isArray(angle.search) || !angle.search.length) {
        add(`angles:${id}:${index}`, 'missing-content', 'Perspetiva sem título, texto ou pesquisas.', 'integrity');
      }
      add(`angles:${id}:${index}`, 'claim-traceability', 'Pesquisas sugeridas não são fontes verificadas das afirmações desta perspetiva.');
    }
  }
  const templateIds = new Set();
  const templates = kit.TEMPLATES.map((template) => {
    const owner = `template:${template.id}`;
    if (templateIds.has(template.id)) add(owner, 'duplicate-template', 'Identificador de modelo repetido.', 'integrity');
    templateIds.add(template.id);
    for (const field of ['title', 'when', 'deadline', 'send']) if (!present(template[field])) add(owner, 'missing-content', `Modelo sem ${field}.`, 'integrity');
    if (!template.topics?.length) add(owner, 'unknown-topic', 'Modelo sem áreas de utilização.', 'integrity');
    for (const id of template.topics || []) if (id !== '*' && !ids.has(id)) add(owner, 'unknown-topic', `Área inexistente: ${id}`, 'integrity');
    if (!present(template.to?.name) || (template.to.url !== null && !webUrl(template.to.url))) add(owner, 'invalid-recipient', 'Destinatário ou URL inválido.', 'integrity');
    for (const field of template.fields || []) if (!kit.FIELDS[field]) add(owner, 'unknown-field', `Campo não definido: ${field}`, 'integrity');
    if (typeof template.body !== 'function') add(owner, 'invalid-template-body', 'Modelo sem função de composição.', 'integrity');
    else {
      const used = new Set();
      const body = template.body((field) => {
        used.add(field);
        return `[${field}]`;
      }, { today: '[data de teste]' });
      if (!present(body)) add(owner, 'invalid-template-body', 'Composição do modelo vazia.', 'integrity');
      for (const field of used) if (!template.fields?.includes(field)) add(owner, 'undeclared-field', `O corpo utiliza um campo não declarado: ${field}`, 'integrity');
    }
    add(owner, 'template-source-review', 'Fundamentos e prazos do modelo não têm referências estruturadas próprias; conferir também citações dentro do corpo.');
    add(owner, 'template-use-review', 'A descrição «quando usar» não substitui condições, exclusões, prova e revisão do caso concreto.');
    return { id: template.id, title: template.title, topics: template.topics, when: template.when, deadline: template.deadline };
  });
  const referenced = new Set(inventory.flatMap((topic) => [...topic.refs, ...topic.deadlines.flatMap(({ reference, contextRefs }) => [reference, ...contextRefs]),
    ...Object.values(topic.guidance).flatMap((items) => items.flatMap(({ references }) => references))])
    .filter(({ to }) => to).map(({ to }) => to.split(':')[0]));
  const sources = documents.filter(({ id }) => referenced.has(id)).map((doc) => {
    if (!webUrl(doc.url)) add(`source:${doc.id}`, 'invalid-source-url', 'Diploma citado sem URL web válida.', 'integrity');
    add(`source:${doc.id}`, 'source-version-review', 'Conferir publicação oficial, versão aplicável e data de revisão; uma cópia local não prova vigência.');
    return { id: doc.id, title: doc.title, url: doc.url, validity: 'not-verified' };
  });
  return {
    scope: 'Diagnóstico local de integridade e preparação editorial; não certifica correção jurídica, vigência, competência atual ou adequação ao caso.',
    limits: 'Não extrai todas as citações de texto livre, não consulta a rede e não verifica conteúdo, números ou alíneas das normas ou decisões. Ausência de falhas de integridade não significa conteúdo juridicamente validado.',
    stats: { topics: topics.length, templates: templates.length, entities: Object.keys(entities).length,
      references: inventory.reduce((n, topic) => n + topic.refs.length, 0),
      deadlines: inventory.reduce((n, topic) => n + topic.deadlines.length, 0),
      sourcedTopics: inventory.filter((topic) => Object.keys(topic.guidance).length).length,
      sourcedOrientations: inventory.reduce((n, topic) => n + Object.values(topic.guidance).reduce((total, items) => total + items.length, 0), 0) },
    topics: inventory, templates, sources, findings,
  };
}

export async function repositoryAudit() {
  const lei = new URL('../data/lei/', import.meta.url);
  const meta = JSON.parse(await readFile(new URL('meta.json', lei), 'utf8'));
  const docs = await Promise.all(meta.docs.map((doc) => readFile(new URL(`${doc.id}.json`, lei), 'utf8').then(JSON.parse)));
  const aliases = [...ALIASES];
  const eu = JSON.parse(await readFile(new URL('./corpus/eu/docs.json', import.meta.url), 'utf8'));
  for (const doc of eu) if (doc.alias?.length) aliases.push([doc.id, new RegExp(`^(?:${doc.alias.join('|')})\\b`, 'i')]);
  if (docs.some(({ id }) => id === 'd376273')) aliases.push(['d376273', /^(?:RGCO|Regime Geral das Contra-?Ordena[çc][õo]es)\b/i]);
  const resolve = makeResolver(new Map(meta.docs.map((doc) => [doc.id, doc])), docs, aliases);
  const context = { window: {} };
  runInNewContext(await readFile(new URL('../modelos.js', import.meta.url), 'utf8'), context, { timeout: 1000 });
  const audit = auditKnowledge({ topics: TOPICS, entities: ENTITIES, toolkit: TOOLKIT, kit: context.window.LAW_KIT, resolve, documents: docs });
  audit.situations = LEGAL_SITUATIONS.map((situation) => {
    const refs = situation.rights.flatMap(({ refs }) => refs);
    for (const [id, key] of refs) {
      try {
        situationArticle(docs.find((doc) => doc.id === id), id, key);
      } catch (error) {
        audit.findings.push({ owner: `situation:${situation.id}`, code: 'invalid-situation-source', kind: 'integrity', message: error.message });
      }
    }
    audit.findings.push({ owner: `situation:${situation.id}`, code: 'situation-legal-review', kind: 'review',
      message: 'Ficha com fontes por orientação, condições, prova e limites; revisão jurídica independente não registada.' });
    const path = SITUATION_PATHS[situation.id];
    if (!path?.options?.length) {
      audit.findings.push({ owner: `situation:${situation.id}`, code: 'invalid-situation-path', kind: 'integrity',
        message: 'Ficha sem pergunta ou alternativas de orientação.' });
    } else {
      for (const [kind] of path.options) for (const [urgency] of SITUATION_URGENCY) {
        situationGuidance(situation.id, { kind, urgency });
        const model = situationModel(situation.id, { kind, urgency });
        if (model.available) {
          try {
            situationModelText(model, context.window.LAW_KIT);
          } catch (error) {
            audit.findings.push({ owner: `situation:${situation.id}`, code: 'invalid-situation-model', kind: 'integrity', message: error.message });
          }
        }
      }
    }
    return { id: situation.id, title: situation.title, topics: situation.topics, references: refs,
      path: path ? { question: path.question, alternatives: path.options.map(([value, label]) => ({ value, label })) } : null };
  });
  audit.stats.situations = LEGAL_SITUATIONS.length;
  const snapshot = JSON.parse(await readFile(new URL('guia.json', lei), 'utf8'));
  if (!isDeepStrictEqual(snapshot, compileGuide(resolve).out)) {
    audit.findings.push({ owner: 'compiled-guide', code: 'stale-guide', kind: 'integrity',
      message: 'O guia compilado difere do conteúdo de autoria ou da resolução atual. Conferir antes de regenerar o corpus.' });
  }
  return audit;
}

if (process.argv[1] && pathToFileURL(resolvePath(process.argv[1])).href === import.meta.url) {
  try {
    const audit = await repositoryAudit();
    if (process.argv.includes('--json')) console.log(JSON.stringify(audit, null, 2));
    else {
      console.log(audit.scope);
      console.log(JSON.stringify(audit.stats));
      const counts = {};
      for (const finding of audit.findings) counts[finding.code] = (counts[finding.code] || 0) + 1;
      console.log('Pontos a tratar:', JSON.stringify(counts, null, 2));
      for (const finding of audit.findings.filter(({ kind }) => kind === 'integrity')) console.log(`${finding.owner}: ${finding.message}`);
      console.log('Usa --json para consultar o inventário completo e os pontos de revisão por área/modelo.');
    }
    if (process.argv.includes('--check') && audit.findings.some(({ kind }) => kind === 'integrity')) process.exitCode = 1;
  } catch (error) {
    console.error(`Não foi possível auditar o conhecimento jurídico: ${error.message}`);
    process.exitCode = 1;
  }
}

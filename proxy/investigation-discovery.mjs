export const TRAIL_STATES = ['follow', 'question', 'aside'];

export function validateTrail(trail, records) {
  if (!Array.isArray(trail) || trail.length > 5000) throw new Error('Fio de investigação inválido (máximo 5000 pistas).');
  const recordsById = new Set(records.map(({ id }) => id)), ids = new Set();
  for (const item of trail) {
    if (!item || !recordsById.has(item.recordId) || ids.has(item.recordId) || !TRAIL_STATES.includes(item.state) ||
        typeof item.note !== 'string' || !item.note.trim() || item.note.length > 3000) throw new Error('Escolha de pista inválida: registo existente, estado e motivo são obrigatórios.');
    ids.add(item.recordId);
  }
}

export function chooseTrail(dossier, recordId, state, note) {
  const trail = [...(dossier.trail || []).filter((item) => item.recordId !== recordId), { recordId, state, note }];
  validateTrail(trail, dossier.records);
  return { ...dossier, trail };
}

const normal = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

export function discoveryPage(dossier, term = '', page = 0) {
  if (typeof term !== 'string' || !Number.isInteger(page) || page < 0) throw new Error('Pesquisa de pistas inválida.');
  const query = normal(term.trim());
  const aside = new Set((dossier.trail || []).filter(({ state }) => state === 'aside').map(({ recordId }) => recordId));
  const matches = dossier.records.filter((record) => normal(Object.values(record.fields).join(' ')).includes(query));
  const available = matches.filter(({ id }) => !aside.has(id));
  // Round-robin by lot exposes different origins without claiming independent corroboration.
  const lots = new Map();
  for (const record of available) {
    if (!lots.has(record.sourceId)) lots.set(record.sourceId, []);
    lots.get(record.sourceId).push(record);
  }
  const ordered = [];
  const maximum = Math.max(0, ...[...lots.values()].map((records) => records.length));
  for (let i = 0; i < maximum; i++) for (const records of lots.values()) if (records[i]) ordered.push(records[i]);
  const descriptions = new Set(), distinct = [], repeated = [];
  for (const record of ordered) {
    const description = JSON.stringify([record.fields.title, record.fields.buyer, record.fields.supplier].map((value) => normal(value || '')));
    if (descriptions.has(description)) repeated.push(record);
    else { descriptions.add(description); distinct.push(record); }
  }
  const varied = [...distinct, ...repeated];
  const pageCount = Math.max(1, Math.ceil(varied.length / 3));
  page = Math.min(page, pageCount - 1);
  return { records: varied.slice(page * 3, page * 3 + 3), total: matches.length,
    available: ordered.length, aside: matches.length - ordered.length, page, pageCount };
}

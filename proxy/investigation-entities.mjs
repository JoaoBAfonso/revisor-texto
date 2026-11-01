import { csvTable, recordUrl } from './investigation.mjs';

export function organizationalNif(value) {
  if (typeof value !== 'string') return null;
  const match = /^(?:PT\s*)?([569]\d{8})$/i.exec(value.trim());
  if (!match) return null;
  const nif = match[1];
  const sum = [...nif.slice(0, 8)].reduce((total, digit, index) => total + Number(digit) * (9 - index), 0);
  const check = 11 - sum % 11;
  return (check >= 10 ? 0 : check) === Number(nif[8]) ? nif : null;
}

const nameKey = (name) => name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ');

export function entityIndex(dossier) {
  const groups = new Map();
  const sources = new Map(dossier.sources.map((source) => [source.id, source]));
  for (const record of dossier.records) {
    for (const role of ['buyer', 'supplier']) {
      const name = record.fields[role], rawId = record.fields[`${role}Id`];
      if (!name && !rawId) continue;
      // Multi-name cells have no reliable positional mapping to identifier cells.
      const singleName = !/[|;\n]/.test(name);
      const nif = singleName ? organizationalNif(rawId) : null;
      const key = nif ? `nif:${nif}` : `occurrence:${record.id}:${role}`;
      if (!groups.has(key)) groups.set(key, { key, nif, names: [], occurrences: [], warnings: [] });
      const group = groups.get(key);
      if (name && !group.names.includes(name)) group.names.push(name);
      const source = sources.get(record.sourceId);
      group.occurrences.push({ recordId: record.id, role, name, rawId, sourceId: source.id, row: record.row,
        url: recordUrl(record, source), collectedAt: source.collectedAt, recordStatus: record.status });
      if (!nif) {
        const warning = !singleName ? 'Célula com várias designações: não é possível atribuir o identificador a uma entidade.'
          : rawId ? 'Identificador não elegível: inválido, múltiplo, pessoal ou não reconhecido como NIF organizacional.'
            : 'Sem identificador organizacional; designação isolada não demonstra identidade.';
        if (!group.warnings.includes(warning)) group.warnings.push(warning);
      }
    }
  }
  const names = new Map();
  for (const group of groups.values()) {
    if (group.nif && new Set(group.names.map(nameKey)).size > 1) group.warnings.push('O mesmo NIF aparece com designações diferentes; conferir mudança de nome, erro ou associação incorreta.');
    for (const name of group.names) {
      if (/[|;\n]/.test(name)) continue;
      const key = nameKey(name);
      if (!key) continue;
      if (!names.has(key)) names.set(key, new Set());
      names.get(key).add(group.key);
    }
  }
  for (const group of groups.values()) {
    const candidates = new Set();
    let candidatesTruncated = false;
    for (const name of group.names) {
      if (/[|;\n]/.test(name)) continue;
      for (const key of names.get(nameKey(name)) || []) {
        if (key === group.key || candidates.has(key)) continue;
        if (candidates.size === 20) { candidatesTruncated = true; break; }
        candidates.add(key);
      }
    }
    group.candidateKeys = [...candidates];
    group.candidatesTruncated = candidatesTruncated;
    if (candidates.size) group.warnings.push('Designação semelhante noutros grupos: possível homónimo ou informação incompleta, sem fusão.');
    group.sourceCount = new Set(group.occurrences.map(({ sourceId }) => sourceId)).size;
    group.recordCount = new Set(group.occurrences.map(({ recordId }) => recordId)).size;
  }
  return [...groups.values()];
}

export function entitiesCsv(dossier) {
  const sources = new Map(dossier.sources.map((source) => [source.id, source]));
  return csvTable(['group_key', 'criterion', 'nif_declared', 'name_declared', 'identifier_original', 'role',
    'record_id', 'source_url', 'collected_at', 'original_row', 'source_sha256', 'record_status', 'warnings'],
  entityIndex(dossier).flatMap((group) => group.occurrences.map((occurrence) => [
    group.key, group.nif ? 'organizational-nif-checksum-only' : 'isolated-occurrence', group.nif || '',
    occurrence.name, occurrence.rawId, occurrence.role, occurrence.recordId, occurrence.url, occurrence.collectedAt,
    occurrence.row, sources.get(occurrence.sourceId).hash, occurrence.recordStatus, group.warnings.join(' | '),
  ])));
}

export const MAP_PAGE_SIZE = 12;

export function relationshipMap(dossier, groupKey, page = 0) {
  if (!Number.isInteger(page) || page < 0) throw new Error('Página do mapa inválida.');
  const groups = entityIndex(dossier);
  const focus = groups.find((group) => group.key === groupKey);
  if (!focus) throw new Error('A entidade selecionada não existe neste dossiê.');
  const linkedIds = new Set(focus.occurrences.map(({ recordId }) => recordId));
  const linked = dossier.records.filter((record) => linkedIds.has(record.id));
  const lastPage = Math.max(0, Math.ceil(linked.length / MAP_PAGE_SIZE) - 1);
  page = Math.min(page, lastPage);
  const records = linked.slice(page * MAP_PAGE_SIZE, (page + 1) * MAP_PAGE_SIZE);
  const visibleIds = new Set(records.map(({ id }) => id));
  const edges = groups.flatMap((group) => group.occurrences.filter(({ recordId }) => visibleIds.has(recordId))
    .map((occurrence) => ({ ...occurrence, groupKey: group.key })));
  const entityKeys = new Set(edges.map(({ groupKey }) => groupKey));
  return { focus, page, pageCount: lastPage + 1, totalRecords: linked.length, records, edges,
    entities: groups.filter(({ key }) => entityKeys.has(key)) };
}

export function relationshipsCsv(dossier) {
  const sources = new Map(dossier.sources.map((source) => [source.id, source]));
  const records = new Map(dossier.records.map((record) => [record.id, record]));
  return csvTable(['entity_node', 'record_node', 'role_declared', 'criterion', 'name_declared',
    'identifier_original', 'record_title', 'record_kind', 'source_id', 'source_url', 'original_row', 'collected_at',
    'source_sha256', 'record_status', 'review_note', 'warnings'],
  entityIndex(dossier).flatMap((group) => group.occurrences.map((occurrence) => [
    group.key, `record:${occurrence.recordId}`, occurrence.role,
    group.nif ? 'organizational-nif-checksum-only' : 'isolated-occurrence',
    occurrence.name, occurrence.rawId, records.get(occurrence.recordId).fields.title,
    sources.get(occurrence.sourceId).format === 'ted-json' ? 'notice' : 'imported-record', occurrence.sourceId,
    occurrence.url, occurrence.row, occurrence.collectedAt, sources.get(occurrence.sourceId).hash,
    occurrence.recordStatus, records.get(occurrence.recordId).note, group.warnings.join(' | '),
  ])));
}

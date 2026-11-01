import { csvTable, recordUrl } from './investigation.mjs';

export const TIMELINE_PAGE_SIZE = 50;

export function timelineDate(value) {
  if (typeof value !== 'string') throw new Error('A data declarada tem de ser texto.');
  const original = value;
  if (!value) return { original, day: '', state: 'missing', warning: 'Data não indicada na fonte.' };
  let match = /^(\d{4})-(\d{2})-(\d{2})(.*)$/.exec(value);
  if (!match) {
    const local = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (local) match = [value, local[3], local[2], local[1], ''];
  }
  if (!match) return { original, day: '', state: 'unresolved', warning: 'Formato ou precisão não reconhecidos; data não colocada na sequência.' };
  const [, yearText, monthText, dayText, suffix] = match;
  const year = Number(yearText), month = Number(monthText), day = Number(dayText);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (!year || month < 1 || month > 12 || day < 1 || day > days[month - 1]) {
    return { original, day: '', state: 'invalid', warning: 'Data de calendário inválida; conferir o original.' };
  }
  // TED can provide a calendar date followed by an offset, without a time.
  const offset = '(?:Z|[+-](?:0\\d|1[0-4]):[0-5]\\d)';
  const dateOffset = new RegExp(`^${offset}$`);
  const timestamp = new RegExp(`^T(?:[01]\\d|2[0-3]):[0-5]\\d:[0-5]\\d(?:\\.\\d{1,9})?${offset}$`);
  if (suffix && !dateOffset.test(suffix) && !timestamp.test(suffix)) {
    return { original, day: '', state: 'unresolved', warning: 'Hora/fuso ou formato não reconhecidos; conferir antes de ordenar.' };
  }
  if (/[+-]14:(?!00)/.test(suffix)) {
    return { original, day: '', state: 'invalid', warning: 'Desvio de fuso inválido; conferir o original.' };
  }
  return { original, day: `${yearText}-${monthText}-${dayText}`, state: 'dated',
    warning: suffix ? 'Ordenação pelo dia escrito na fonte, sem conversão de fuso ou comparação de horas.' : '' };
}

export function timelineEvents(dossier) {
  const sources = new Map(dossier.sources.map((source) => [source.id, source]));
  return dossier.records.flatMap((record) => {
    const source = sources.get(record.sourceId);
    const notice = source.format === 'ted-json';
    const fields = notice ? ['published'] : ['date', 'published'];
    const parsed = Object.fromEntries(fields.map((field) => [field, timelineDate(record.fields[field])]));
    const reversed = !notice && parsed.date.day && parsed.published.day && parsed.published.day < parsed.date.day;
    return fields.map((kind) => ({
      id: `${record.id}:${kind}`, recordId: record.id, kind,
      label: kind === 'published' ? (notice ? 'Publicação do anúncio TED' : 'Publicação declarada')
        : 'Celebração / data declarada do registo',
      title: record.fields.title, buyer: record.fields.buyer, supplier: record.fields.supplier,
      ...parsed[kind], sourceId: source.id, sourceName: source.name, sourceUrl: recordUrl(record, source),
      row: record.row, collectedAt: source.collectedAt, hash: source.hash,
      recordKind: notice ? 'notice' : 'imported-record', status: record.status, note: record.note,
      warnings: [
        ...(parsed[kind].warning ? [parsed[kind].warning] : []),
        ...(!notice && kind === 'date' ? ['Uma coluna genérica data/date não comprova celebração; confirmar o significado na fonte.'] : []),
        ...(reversed ? ['Publicação declarada anterior à data do registo: conferir significado e datas; não demonstra irregularidade.'] : []),
      ],
    }));
  });
}

function ordered(events, direction) {
  return [...events].sort((a, b) => {
    if (!a.day || !b.day) return Number(!a.day) - Number(!b.day);
    return (direction === 'asc' ? 1 : -1) * a.day.localeCompare(b.day);
  });
}

export function timelinePage(events, { term = '', kind = '', state = '', direction = 'asc', page = 0 } = {}) {
  if (!['', 'date', 'published'].includes(kind) || !['', 'dated', 'undated'].includes(state) ||
      !['asc', 'desc'].includes(direction) || !Number.isInteger(page) || page < 0) throw new Error('Filtro da cronologia inválido.');
  const normal = (text) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const query = normal(term.trim());
  const filtered = ordered(events.filter((event) => (!kind || event.kind === kind) &&
    (!state || (state === 'dated' ? !!event.day : !event.day)) &&
    normal([event.title, event.buyer, event.supplier, event.sourceName, event.original].join(' ')).includes(query)), direction);
  const pageCount = Math.max(1, Math.ceil(filtered.length / TIMELINE_PAGE_SIZE));
  page = Math.min(page, pageCount - 1);
  return { events: filtered.slice(page * TIMELINE_PAGE_SIZE, (page + 1) * TIMELINE_PAGE_SIZE),
    page, pageCount, total: filtered.length, dated: filtered.filter(({ day }) => day).length,
    undated: filtered.filter(({ day }) => !day).length };
}

export function timelineCsv(dossier) {
  return csvTable(['event_id', 'record_id', 'event_kind', 'event_label', 'date_original', 'day_declared',
    'date_state', 'record_title', 'record_kind', 'buyer_declared', 'supplier_declared', 'source_id',
    'source_name', 'source_url', 'original_row', 'collected_at', 'source_sha256', 'record_status', 'review_note', 'warnings'],
  ordered(timelineEvents(dossier), 'asc').map((event) => [
    event.id, event.recordId, event.kind, event.label, event.original, event.day, event.state,
    event.title, event.recordKind, event.buyer, event.supplier, event.sourceId, event.sourceName,
    event.sourceUrl, event.row, event.collectedAt, event.hash, event.status, event.note, event.warnings.join(' | '),
  ]));
}

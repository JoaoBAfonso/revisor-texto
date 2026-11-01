const APPROVED_TEXTS = new Set([
  'cc', 'cpp', 'ct', 'cpt', 'csc', 'cpa', 'cpta', 'cppt', 'ccp', 'cire',
  'cdadc', 'cpi', 'crpred', 'crciv', 'cnot', 'cest', 'cexp', 'cvm',
  'cepmpl', 'lgt', 'lgtfp', 'erc', 'rcee', 'vitima',
]);

export function normalizeArticleKeys(doc) {
  const groups = new Map();
  doc.arts.forEach((a, i) => {
    if (!groups.has(a.k)) groups.set(a.k, []);
    groups.get(a.k).push(i);
  });
  if (![...groups.values()].some((list) => list.length > 1)) return false;
  const starts = groups.get('1') || [];
  const primary = APPROVED_TEXTS.has(doc.id) && starts.length > 1 ? starts.at(-1) : null;
  const used = new Set(groups.keys());
  for (const [key, positions] of groups) {
    const canonical = primary == null ? null : positions.find((i) => i >= primary);
    for (const [ordinal, i] of positions.entries()) {
      if (i === canonical || (positions.length === 1 && (primary == null || i >= primary))) continue;
      const a = doc.arts[i];
      let suffix = ordinal + 1;
      let next;
      do { next = `${key}_extra_${suffix++}`; } while (used.has(next));
      used.add(next);
      a.k = next;
      a.part = primary != null && i < primary ? 'Diploma de aprovação ou alteração' : 'Texto adicional ou referência ambígua';
      a.r = [];
      a.refNote = 'Este texto tem numeração própria ou repetida. As remissões não foram associadas automaticamente; confirma-as na fonte.';
    }
  }
  return true;
}

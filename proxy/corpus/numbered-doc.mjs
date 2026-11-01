export function findNumberedDoc(docs, type, number) {
  const kind = /^decreto-lei$/i.test(type) ? '(?:Decreto-Lei|DL)' : type;
  const escaped = number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![-\\w])${kind}\\s+n\\.?º\\s*${escaped}\\b`, 'i');
  return docs.find((d) => re.test(`${d.title} ${d.short} ${d.name}`.replace(/[º°]/g, 'º'))) || null;
}

export function numberedArticleKey(articles, key) {
  const approval = articles.find((a) => a.k.startsWith(`${key}_extra_`) && a.part === 'Diploma de aprovação ou alteração');
  return approval?.k || articles.find((a) => a.k === key)?.k || null;
}

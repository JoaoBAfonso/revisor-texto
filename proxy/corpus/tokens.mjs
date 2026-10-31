// Normalização de palavras: a mesma função indexa o corpus (no build) e interpreta a pesquisa (no browser).
const STOP = new Set(('para como pelo pela pelos pelas sobre entre quando onde cujo cuja seja sejam deve devem pode podem ser sao esta este esse essa isto aquele ' +
  'aquela mais menos muito tambem ainda apos ate sem sob contra desde durante conforme segundo mesmo mesma outro outra outros outras cada todo toda todos ' +
  'todas qual quais quem tem tenha tiver tiverem sido sendo ter foi eram havendo ficam fica fim tal tais nao nem seu sua seus suas dos das nos nas aos ' +
  'com por uma uns umas que artigo artigos numero numeros alinea alineas presente lei decreto diploma disposto previsto nos termos efeitos ' +
  'caso casos qualquer quaisquer aquele ele ela eles elas apenas bem so alem ja ou aquelas aqueles').split(' '));

export function stem(w) {
  if (w.endsWith('coes') || w.endsWith('oes') || w.endsWith('aes')) return `${w.slice(0, w.endsWith('coes') ? -4 : -3)}ao`;
  if (w.endsWith('ais') && w.length > 5) return `${w.slice(0, -3)}al`;
  if (w.endsWith('eis') && w.length > 5) return `${w.slice(0, -3)}el`;
  if (w.endsWith('es') && w.length > 5) return w.slice(0, -2);
  if (w.endsWith('s') && w.length > 4) return w.slice(0, -1);
  return w;
}

export function tokens(text) {
  return text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w))
    .map(stem);
}

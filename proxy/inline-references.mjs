const LAW = String.raw`(?:Lei Orgânica|Lei Constitucional|Decreto-Lei|Decreto Legislativo Regional|Decreto Regulamentar|Decreto|Portaria|Lei)\s+n\.?\s*[º°]\s*\d+(?:-[A-Z])?\/\d{2,4}`;
const EU = String.raw`(?:Regulamento|Diretiva)\s*\((?:UE|CE)\)\s*(?:n\.?\s*[º°]\s*)?\d{2,4}\/\d+`;
const NAME = String.raw`(?:Constituição da República Portuguesa|Código do Procedimento Administrativo|Código de Processo nos Tribunais Administrativos|Código de Processo Penal|Código de Processo Civil|Código do Trabalho|Código Civil|Código Penal|Estatuto do Jornalista|Lei de Imprensa|Regulamento Geral (?:sobre a )?Proteção de Dados|CRP|RGPD|CPA|CPTA|CPPT|LADA|RGCO|CEDH|DSA)`;
const DOC = `(?:${LAW}|${EU}|${NAME})`;
const ARTICLE = String.raw`(?:artigo|art\.)\s*\d+\s*\.?\s*[º°]?(?:\s*-\s*[A-Z]{1,2})?`;
const PATTERN = new RegExp(`(?<![\\p{L}\\p{N}_])(?:${DOC}\\s*,?\\s+${ARTICLE}|${ARTICLE}\\s+(?:do|da|de|dos|das)\\s+${DOC}|${DOC})(?![\\p{L}\\p{N}_/-])`, 'giu');

export function inlineReferences(text) {
  if (typeof text !== 'string') throw new Error('Texto de referências inválido.');
  return [...text.matchAll(PATTERN)].map((match) => {
    const label = match[0];
    const article = /\b(?:artigo|art\.)\s*\d+/i.test(label);
    const reversed = new RegExp(`^(${ARTICLE})\\s+(?:do|da|de|dos|das)\\s+(.+)$`, 'i').exec(label);
    return { start: match.index, end: match.index + label.length, label, article,
      query: reversed ? `${reversed[2]}, ${reversed[1]}` : label };
  });
}

export function referenceTarget(href) {
  if (typeof href !== 'string') return null;
  const match = /^#\/direito\/lei\/([^/?#]+)(?:\/([^/?#]+))?$/.exec(href);
  if (!match) return null;
  try {
    const id = decodeURIComponent(match[1]);
    const key = match[2] === undefined ? null : decodeURIComponent(match[2]);
    if (!/^[a-z0-9-]+$/i.test(id) || ['grau', 'busca'].includes(id)
      || (key !== null && !/^\d+(?:-[a-z]{1,2})?(?:_extra_\d+)?$/i.test(key))) return null;
    return { id, key };
  } catch {
    return null;
  }
}

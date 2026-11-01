export const HYPOTHESIS_STATES = ['open', 'supported', 'contested', 'discarded'];
export const EVIDENCE_ROLES = ['supports', 'contradicts', 'context'];

export function validateHypotheses(hypotheses, records) {
  if (!Array.isArray(hypotheses) || hypotheses.length > 100) throw new Error('Limite de 100 hipóteses por dossiê; estrutura inválida.');
  const ids = new Set(), recordIds = new Set(records.map(({ id }) => id));
  for (const hypothesis of hypotheses) {
    if (!hypothesis || typeof hypothesis.id !== 'string' || !hypothesis.id || hypothesis.id.length > 100 || ids.has(hypothesis.id) ||
        typeof hypothesis.statement !== 'string' || hypothesis.statement.trim().length < 5 || hypothesis.statement.length > 1000 ||
        !HYPOTHESIS_STATES.includes(hypothesis.assessment)) throw new Error('Hipótese ou avaliação manual inválida.');
    ids.add(hypothesis.id);
    for (const field of ['rationale', 'gaps', 'questions']) {
      if (typeof hypothesis[field] !== 'string' || hypothesis[field].length > 5000) throw new Error('Justificação, lacunas ou perguntas inválidas (máximo 5000 caracteres).');
    }
    if (hypothesis.assessment !== 'open' && !hypothesis.rationale.trim()) throw new Error('Justifica a avaliação da hipótese; não basta mudar o estado.');
    if (!Array.isArray(hypothesis.evidence) || hypothesis.evidence.length > 100) throw new Error('Limite de 100 ligações de prova por hipótese.');
    const links = new Set();
    for (const evidence of hypothesis.evidence) {
      if (!evidence || !recordIds.has(evidence.recordId) || links.has(evidence.recordId) ||
          !EVIDENCE_ROLES.includes(evidence.relation) || typeof evidence.note !== 'string' ||
          !evidence.note.trim() || evidence.note.length > 5000) throw new Error('Ligação de prova inválida: registo existente, papel único e justificação são obrigatórios.');
      links.add(evidence.recordId);
    }
  }
  return hypotheses;
}

export function saveHypothesis(dossier, hypothesis) {
  const existing = dossier.hypotheses || [];
  const found = existing.some(({ id }) => id === hypothesis.id);
  const hypotheses = found ? existing.map((item) => item.id === hypothesis.id ? hypothesis : item) : [...existing, hypothesis];
  validateHypotheses(hypotheses, dossier.records);
  return { ...dossier, hypotheses: structuredClone(hypotheses) };
}

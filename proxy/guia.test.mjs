// Teste de interpretação jurídica: «node guia.test.mjs».
// Cada caso diz qual a área do guia e quais os artigos da Constituição que têm de aparecer à cabeça.
// Quando uma pesquisa real devolver uma interpretação fraca, acrescenta aqui o caso, corrige as chaves
// em guia.js e volta a correr: o teste impede que melhorias novas estraguem as antigas.
import { interpret } from './direito.js';
import { CRP, TOPICS, TOPIC_CRP } from './guia.js';

const CASES = [
  { q: 'habitação', topic: 'arrendamento', crp: [65] },
  { q: 'despejo', topic: 'arrendamento', crp: [65] },
  { q: 'renda da casa', topic: 'arrendamento', crp: [65] },
  { q: 'sem-abrigo', crp: [65] },
  { q: 'difamação', topic: 'honra', crp: [26, 37] },
  { q: 'direito de resposta', topic: 'resposta', crp: [37] },
  { q: 'liberdade de imprensa', topic: 'imprensa', crp: [38] },
  { q: 'sigilo profissional dos jornalistas', topic: 'sigilo', crp: [38] },
  { q: 'segredo de justiça', topic: 'justica', crp: [32] },
  { q: 'presunção de inocência', crp: [32] },
  { q: 'acesso a documentos administrativos', topic: 'acesso', crp: [268] },
  { q: 'proteção de dados pessoais', topic: 'dados', crp: [35] },
  { q: 'escutas telefónicas', crp: [34] },
  { q: 'despedimento', topic: 'trabalho', crp: [53] },
  { q: 'greve', topic: 'trabalho', crp: [57] },
  { q: 'salário mínimo', crp: [59] },
  { q: 'Serviço Nacional de Saúde', topic: 'saude', crp: [64] },
  { q: 'IRS', topic: 'impostos', crp: [103] },
  { q: 'consumidor', topic: 'consumo', crp: [60] },
  { q: 'ambiente', topic: 'ambiente', crp: [66] },
  { q: 'ensino', topic: 'educacao', crp: [74] },
  { q: 'divórcio', topic: 'familia', crp: [36] },
  { q: 'pensão de reforma', topic: 'seguranca-social', crp: [63] },
  { q: 'expropriação', topic: 'propriedade', crp: [62] },
  { q: 'ajuste direto', topic: 'contratacao', crp: [266] },
  { q: 'deficiência', topic: 'deficiencia', crp: [71] },
  { q: 'penhora', topic: 'dividas' },
  { q: 'asilo', topic: 'estrangeiros', crp: [33] },
  { q: 'manifestação', topic: 'participacao', crp: [45] },
  { q: 'ação popular', topic: 'participacao', crp: [52] },
  { q: 'eleições', topic: 'eleicoes', crp: [113] },
  { q: 'racismo', topic: 'odio', crp: [13] },
  { q: 'casamento', topic: 'familia', crp: [36] },
];

let failed = 0;
const fail = (msg) => { failed++; console.log(`  ✗ ${msg}`); };

for (const c of CASES) {
  const r = interpret(c.q);
  const ids = r.topics.map((t) => t.id);
  const crp = [...new Set([...(r.topics[0]?.crp || []), ...r.constitution].map((x) => x.art))];
  console.log(`${c.q}  →  ${ids.join(', ') || '(sem área)'}  |  CRP ${crp.join(', ') || '—'}`);
  if (c.topic && !ids.includes(c.topic)) fail(`falta a área «${c.topic}»`);
  if (c.topic && ids[0] !== c.topic) console.log(`  ! «${c.topic}» não é a primeira área`);
  for (const art of c.crp || []) if (!crp.slice(0, 4).includes(art)) fail(`falta o art. ${art} da CRP à cabeça`);
}

// Coerência dos dados.
const arts = new Set(CRP.map((c) => c.art));
if (arts.size !== CRP.length) fail('há artigos da CRP repetidos');
for (const [id, list] of Object.entries(TOPIC_CRP)) {
  if (!TOPICS.some((t) => t.id === id)) fail(`TOPIC_CRP refere área inexistente: ${id}`);
  for (const a of list) if (!arts.has(a)) fail(`TOPIC_CRP.${id} refere o art. ${a}, que não existe no catálogo`);
}
for (const t of TOPICS) if (!TOPIC_CRP[t.id]) fail(`a área «${t.id}» não tem artigos da CRP associados`);

console.log(failed ? `\n${failed} falha(s)` : '\nTudo certo');
process.exit(failed ? 1 : 0);

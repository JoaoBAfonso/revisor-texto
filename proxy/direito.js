// Pesquisa jurídica: interpreta o termo (área do direito, diplomas relevantes, citações como «Lei n.º 2/99»)
// e procura em fontes oficiais através do RSS de pesquisa web do Bing. Devolve títulos e excertos.
import { toText, decode } from './ciberduvidas.js';

const PER_QUERY = 5;

export const LAW_SOURCES = {
  dre: { name: 'Diário da República', kind: 'Legislação', domains: ['diariodarepublica.pt', 'dre.pt'] },
  pgdl: { name: 'PGDL', kind: 'Legislação anotada', domains: ['pgdlisboa.pt'] },
  dgsi: { name: 'DGSI (tribunais)', kind: 'Jurisprudência', domains: ['dgsi.pt'] },
  tc: { name: 'Tribunal Constitucional', kind: 'Jurisprudência', domains: ['tribunalconstitucional.pt'] },
  erc: { name: 'ERC', kind: 'Regulação dos media', domains: ['erc.pt'] },
  cnpd: { name: 'CNPD', kind: 'Proteção de dados', domains: ['cnpd.pt'] },
};

// Áreas com interesse jornalístico. «keys» são prefixos de palavras (sem acentos); «expand» é a pesquisa alargada.
const TOPICS = [
  {
    area: 'Crimes contra a honra',
    keys: ['difama', 'injuri', 'calunia', 'honra', 'ofensa a honra', 'bom nome'],
    note: 'Difamação (art. 180.º do Código Penal), injúria (181.º), publicidade e calúnia (183.º). Na imprensa, a responsabilidade segue a Lei de Imprensa. Cruza com a liberdade de expressão (CRP, art. 37.º).',
    refs: ['Código Penal, arts. 180.º a 189.º', 'Lei de Imprensa (Lei n.º 2/99)', 'Código Civil, art. 484.º', 'CRP, arts. 26.º e 37.º'],
    expand: 'crime difamação injúria Código Penal liberdade de expressão',
  },
  {
    area: 'Direito de resposta e retificação',
    keys: ['direito de resposta', 'retifica', 'resposta e retifica', 'desmentido'],
    note: 'Quem for visado por referência de facto inverídico ou erróneo, ou que ofenda a reputação, pode exigir resposta ou retificação. A ERC decide os recursos.',
    refs: ['Lei de Imprensa (Lei n.º 2/99), arts. 24.º a 27.º', 'Lei da Televisão (Lei n.º 27/2007)', 'Lei da Rádio (Lei n.º 54/2010)', 'Estatuto da ERC (Lei n.º 53/2005)'],
    expand: 'direito de resposta retificação ERC deliberação imprensa',
  },
  {
    area: 'Imagem, privacidade e vida privada',
    keys: ['imagem', 'privacidade', 'vida privada', 'intimidade', 'fotografia', 'gravacao', 'gravacoes', 'devassa', 'filmar', 'filmagem'],
    note: 'O direito à imagem (Código Civil, art. 79.º) tem exceções para figuras públicas e factos de interesse público. A devassa da vida privada e as gravações ilícitas são crime.',
    refs: ['Código Civil, arts. 79.º e 80.º', 'Código Penal, arts. 192.º e 199.º', 'CRP, art. 26.º'],
    expand: 'direito à imagem reserva da vida privada Código Civil jurisprudência',
  },
  {
    area: 'Proteção de dados pessoais',
    keys: ['dados pessoais', 'rgpd', 'protecao de dados', 'privacidade de dados', 'cnpd', 'dados sensiveis'],
    note: 'O RGPD prevê isenções e derrogações para fins jornalísticos (art. 85.º). A Lei n.º 58/2019 executa o RGPD em Portugal.',
    refs: ['RGPD (Regulamento (UE) 2016/679)', 'Lei n.º 58/2019', 'Estatuto do Jornalista (Lei n.º 1/99)'],
    expand: 'proteção de dados pessoais RGPD jornalismo liberdade de expressão',
  },
  {
    area: 'Segredo de justiça e processo penal',
    keys: ['segredo de justica', 'violacao de segredo', 'arguido', 'inquerito', 'acusacao', 'processo penal', 'presuncao de inocencia', 'escuta', 'pronuncia', 'detencao', 'prisao preventiva', 'medida de coacao'],
    note: 'A violação de segredo de justiça é crime (CP, art. 371.º). O CPP regula a publicidade do processo e o acesso dos jornalistas. Vigora a presunção de inocência (CRP, art. 32.º, n.º 2).',
    refs: ['Código de Processo Penal, arts. 86.º a 88.º', 'Código Penal, art. 371.º', 'CRP, art. 32.º'],
    expand: 'segredo de justiça comunicação social Código de Processo Penal',
  },
  {
    area: 'Sigilo profissional e estatuto do jornalista',
    keys: ['sigilo', 'fonte', 'fontes', 'jornalista', 'estatuto do jornalista', 'carteira profissional', 'deontologia', 'ccpj'],
    note: 'O jornalista tem direito ao sigilo das fontes de informação e só pode ser obrigado a revelá-las em condições excecionais, decididas por um tribunal superior.',
    refs: ['Estatuto do Jornalista (Lei n.º 1/99), art. 11.º', 'Código de Processo Penal, art. 135.º', 'CRP, art. 38.º'],
    expand: 'sigilo profissional jornalista fontes Estatuto do Jornalista',
  },
  {
    area: 'Liberdade de imprensa e regulação',
    keys: ['liberdade de imprensa', 'liberdade de expressao', 'censura', 'regulacao', 'comunicacao social', 'imprensa', 'erc', 'pluralismo', 'direcao editorial'],
    note: 'A CRP garante a liberdade de expressão e de imprensa (arts. 37.º e 38.º). A ERC regula os meios de comunicação social.',
    refs: ['CRP, arts. 37.º e 38.º', 'Lei de Imprensa (Lei n.º 2/99)', 'Estatuto da ERC (Lei n.º 53/2005)'],
    expand: 'liberdade de imprensa comunicação social ERC deliberação',
  },
  {
    area: 'Direitos de autor',
    keys: ['direito de autor', 'direitos de autor', 'plagio', 'copyright', 'citacao', 'propriedade intelectual', 'licenca', 'reproducao'],
    note: 'O Código do Direito de Autor permite certas utilizações livres, como a citação para fins de crítica ou informação (art. 75.º), com indicação da fonte e do autor.',
    refs: ['Código do Direito de Autor e Direitos Conexos (DL n.º 63/85), art. 75.º'],
    expand: 'direitos de autor citação utilização livre Código do Direito de Autor',
  },
  {
    area: 'Acesso a documentos administrativos',
    keys: ['acesso a documentos', 'documentos administrativos', 'lada', 'transparencia', 'cada', 'informacao publica', 'publicidade'],
    note: 'Qualquer pessoa tem direito de acesso a documentos administrativos (CRP, art. 268.º). A CADA emite pareceres sobre recusas.',
    refs: ['Lei n.º 26/2016 (LADA)', 'CRP, art. 268.º'],
    expand: 'acesso documentos administrativos CADA parecer Lei n.º 26/2016',
  },
  {
    area: 'Corrupção e crimes económicos',
    keys: ['corrupcao', 'suborno', 'peculato', 'trafico de influencia', 'branqueamento', 'fraude', 'burla', 'participacao economica', 'recebimento indevido', 'abuso de poder', 'prevaricacao', 'evasao fiscal', 'fuga ao fisco'],
    note: 'Corrupção ativa e passiva (CP, arts. 374.º e 373.º), peculato (375.º), tráfico de influência (335.º), branqueamento (368.º-A), burla (217.º). Confirma sempre a fase processual antes de usar «crime» ou «culpado».',
    refs: ['Código Penal, arts. 335.º, 368.º-A, 372.º a 375.º', 'Lei n.º 34/87 (crimes de responsabilidade de titulares de cargos políticos)'],
    expand: 'corrupção crime Código Penal acórdão tribunal',
  },
  {
    area: 'Crimes de ódio, discriminação e racismo',
    keys: ['racismo', 'discrimina', 'odio', 'xenofobia', 'incitamento', 'apologia', 'genocidio'],
    note: 'A discriminação e o incitamento ao ódio ou à violência são crime (CP, art. 240.º). A Lei n.º 93/2017 regula a prevenção e a proibição da discriminação.',
    refs: ['Código Penal, art. 240.º', 'Lei n.º 93/2017'],
    expand: 'discriminação racial crime ódio Código Penal',
  },
  {
    area: 'Menores e proteção de crianças',
    keys: ['menor', 'menores', 'crianca', 'criancas', 'jovem', 'adolescente', 'lei tutelar', 'cpcj', 'adocao', 'protecao de menores'],
    note: 'A identificação de crianças e jovens em perigo ou em processo tutelar está fortemente restringida. Convém consultar a lei antes de publicar nomes, imagens ou elementos que permitam identificá-los.',
    refs: ['Lei de Proteção de Crianças e Jovens em Perigo (Lei n.º 147/99)', 'Lei Tutelar Educativa (Lei n.º 166/99)', 'Lei de Imprensa (Lei n.º 2/99)'],
    expand: 'identificação de menores comunicação social proteção de crianças e jovens',
  },
  {
    area: 'Violência doméstica e crimes contra pessoas',
    keys: ['violencia domestica', 'homicidio', 'agressao', 'ofensa a integridade', 'abuso sexual', 'violacao', 'assedio', 'ameaca', 'sequestro', 'maus tratos', 'tentativa de homicidio'],
    note: 'Violência doméstica (CP, art. 152.º), homicídio (131.º), ofensa à integridade física (143.º), violação (164.º). Ao noticiar, ter cuidado com a identificação das vítimas.',
    refs: ['Código Penal, arts. 131.º, 143.º, 152.º, 164.º', 'Lei n.º 112/2009 (violência doméstica)'],
    expand: 'violência doméstica crime Código Penal acórdão',
  },
  {
    area: 'Desinformação e direitos digitais',
    keys: ['desinformacao', 'fake news', 'noticias falsas', 'direitos digitais', 'inteligencia artificial', 'redes sociais', 'plataformas', 'cibercrime'],
    note: 'A Carta Portuguesa de Direitos Humanos na Era Digital (Lei n.º 27/2021) prevê, no art. 6.º, a proteção contra a desinformação. O Regulamento dos Serviços Digitais da UE regula as plataformas.',
    refs: ['Lei n.º 27/2021 (Carta Portuguesa de Direitos Humanos na Era Digital)', 'Lei do Cibercrime (Lei n.º 109/2009)', 'Regulamento (UE) 2022/2065 (Serviços Digitais)'],
    expand: 'desinformação Carta Portuguesa de Direitos Humanos na Era Digital',
  },
  {
    area: 'Eleições e propaganda política',
    keys: ['eleicao', 'eleicoes', 'eleitoral', 'campanha eleitoral', 'propaganda', 'sondagem', 'sondagens', 'reflexao', 'referendo'],
    note: 'A cobertura jornalística de campanhas eleitorais tem regras próprias (igualdade de tratamento, dia de reflexão, publicação de sondagens). A CNE e a ERC fiscalizam.',
    refs: ['Lei Eleitoral da Assembleia da República (Lei n.º 14/79)', 'Lei das Sondagens (Lei n.º 10/2000)', 'Lei Orgânica n.º 1/2001 (eleições autárquicas)'],
    expand: 'cobertura jornalística campanha eleitoral sondagens ERC CNE',
  },
];

const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

// Reconhece citações diretas: «Lei n.º 2/99», «Decreto-Lei 63/85», «artigo 180.º do Código Penal».
function parseCitation(term) {
  const law = /\b(lei org[aâ]nica|lei|decreto[- ]lei|dec\.?[- ]lei|decreto|portaria)\s*(?:n\.?\s*[ºo°]?\s*)?(\d{1,3}(?:-[a-z])?\/\d{2,4})/i.exec(term);
  if (law) {
    const type = /org/i.test(law[1]) ? 'Lei Orgânica' : /dec/i.test(law[1]) ? (/lei/i.test(law[1]) ? 'Decreto-Lei' : 'Decreto') : /port/i.test(law[1]) ? 'Portaria' : 'Lei';
    const label = `${type} n.º ${law[2]}`;
    return { label, query: `"${label}"` };
  }
  const art = /\bart(?:igo|\.)?\s*(\d{1,3}(?:\.?[ºo°])?(?:-[a-z])?)/i.exec(term);
  const code = /c[oó]digo\s+(penal|civil|de processo penal|de processo civil|do trabalho|das sociedades comerciais|cooperativo)|\b(cpp|cpc|cp|cc|crp|rgpd)\b/i.exec(term);
  if (art && code) {
    const names = { penal: 'Código Penal', civil: 'Código Civil', 'de processo penal': 'Código de Processo Penal', 'de processo civil': 'Código de Processo Civil', 'do trabalho': 'Código do Trabalho', 'das sociedades comerciais': 'Código das Sociedades Comerciais', cooperativo: 'Código Cooperativo' };
    const short = { cpp: 'Código de Processo Penal', cpc: 'Código de Processo Civil', cp: 'Código Penal', cc: 'Código Civil', crp: 'Constituição da República Portuguesa', rgpd: 'RGPD' };
    const name = code[1] ? names[code[1].toLowerCase()] : short[code[2].toLowerCase()];
    const n = art[1].replace(/[ºo°.]/g, '');
    return { label: `${name}, art. ${n}.º`, query: `"${name}" "artigo ${n}.º"` };
  }
  return null;
}

export function interpret(term) {
  const text = ` ${norm(term)} `;
  const hits = TOPICS.map((t) => {
    const score = t.keys.reduce((s, k) => (new RegExp(`\\b${k.replace(/ /g, '\\s+')}`).test(text) ? s + 1 + k.length / 100 : s), 0);
    return { t, score };
  }).filter((h) => h.score > 0).sort((a, b) => b.score - a.score).slice(0, 2).map((h) => h.t);
  return {
    citation: parseCitation(term),
    topics: hits.map(({ area, note, refs, expand }) => ({ area, note, refs, expand })),
  };
}

const siteOf = (host) => Object.keys(LAW_SOURCES)
  .find((k) => LAW_SOURCES[k].domains.some((d) => host === d || host.endsWith(`.${d}`)));

const SUFFIX = /\s*(?:[-–|]|\.{3}|…)\s*(?:DR|Di[aá]rio da Rep[uú]blica(?: Eletr[oó]nico)?|DGSI|PGDL|IGFEJ(?: - Bases Jur[ií]dico[^|]*)?|Bases Jur[ií]dico[^|]*)\s*$/i;

// Os sites usam títulos genéricos («Acórdão do Tribunal da Relação de Lisboa»); junta-se o início do excerto.
function cleanTitle(title, description) {
  let t = title;
  for (let prev = ''; prev !== t;) { prev = t; t = t.replace(SUFFIX, ''); }
  t = t.replace(/^:+\s*/, '').replace(/^TC\s*>\s*Jurisprud[eê]ncia\s*>\s*Acord[aã]os\s*>\s*/i, '').replace(/[\s.]+$/, '');
  if (/^(mostradoc|acórdão do )/i.test(t) && description) {
    const snippet = description.replace(/\s+/g, ' ').slice(0, 90).replace(/\s+\S*$/, '');
    t = /^mostradoc/i.test(t) ? `${snippet}…` : `${t} — ${snippet}…`;
  }
  return t || 'Sem título';
}

// Os resultados do Bing são redirecionamentos (bing.com/ck/a?...&u=a1<base64url>); o endereço real está em «u».
function realUrl(href) {
  const u = new URL(decode(href)).searchParams.get('u');
  if (!u || !u.startsWith('a1')) return decode(href);
  const b64 = u.slice(2).replace(/-/g, '+').replace(/_/g, '/');
  return new TextDecoder().decode(Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0)));
}

function parseSerp(html, allowed) {
  const items = [];
  for (const part of html.split('class="b_algo"').slice(1)) {
    const h = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(part);
    if (!h) continue;
    let url;
    try { url = new URL(realUrl(h[1])); } catch { continue; }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
    const key = siteOf(url.hostname);
    if (!key || !allowed.includes(key)) continue;
    const p = /<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>([\s\S]*?)<\/p>/.exec(part) || /<p[^>]*>([\s\S]*?)<\/p>/.exec(part);
    const description = toText(p?.[1] || '').replace(/\u00ad/g, '').replace(/^\d{1,2} de \S+ de \d{4}\s*·\s*/, '');
    items.push({
      title: cleanTitle(toText(h[2]), description),
      description,
      url: url.href,
      site: key,
      source: LAW_SOURCES[key].name,
      kind: LAW_SOURCES[key].kind,
    });
  }
  return items;
}

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

function toItem(url, title, description, allowed) {
  const key = siteOf(url.hostname);
  if (!key || !allowed.includes(key)) return null;
  return { title: cleanTitle(title, description), description, url: url.href, site: key, source: LAW_SOURCES[key].name, kind: LAW_SOURCES[key].kind };
}

// Google via Serper.dev (chave SERPER_API_KEY): respeita bem o filtro «site:». É o motor preferido.
async function serper(query, allowed, env) {
  const sites = allowed.flatMap((k) => LAW_SOURCES[k].domains).map((d) => `site:${d}`).join(' OR ');
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': env.SERPER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: `${query} (${sites})`, gl: 'pt', hl: 'pt-pt', num: 10 }),
  });
  if (!res.ok) throw new Error(`Serper respondeu ${res.status}: ${(await res.text()).slice(0, 120)}`);
  const data = await res.json();
  return (data.organic || []).flatMap((o) => {
    try { return [toItem(new URL(o.link), o.title || '', o.snippet || '', allowed)].filter(Boolean); } catch { return []; }
  });
}

// Reserva sem chave: o Bing respeita o «site:» a partir de alguns IPs, mas não a partir da Cloudflare.
async function bing(query, allowed, perSite = false) {
  const domains = perSite ? [LAW_SOURCES[allowed[0]].domains[0]] : allowed.flatMap((k) => LAW_SOURCES[k].domains);
  const sites = domains.map((d) => `site:${d}`).join(' OR ');
  const q = encodeURIComponent(perSite ? `${query} ${sites}` : `${query} (${sites})`);
  const res = await fetch(`https://www.bing.com/search?q=${q}&setmkt=pt-PT&setlang=pt-PT&count=20`, {
    headers: { 'User-Agent': BROWSER_UA, 'Accept-Language': 'pt-PT,pt;q=0.9' },
  });
  if (!res.ok) throw new Error(`Bing respondeu ${res.status}`);
  return parseSerp(await res.text(), allowed);
}

export async function searchLaw(term, keys, env = {}) {
  const chosen = keys.filter((k) => LAW_SOURCES[k]);
  const interpretation = interpret(term);
  const useSerper = Boolean(env.SERPER_API_KEY);
  const run = (j) => (useSerper ? serper(j.query, j.keys, env) : bing(j.query, j.keys, j.perSite));
  const jobs = [];
  if (useSerper) jobs.push({ keys: chosen, query: `"${term}"`, related: false });
  else {
    chosen.forEach((k) => jobs.push({ keys: [k], query: term, perSite: true, related: false }));
    jobs.push({ keys: chosen, query: `"${term}"`, related: false });
  }
  if (interpretation.citation) jobs.push({ keys: chosen, query: interpretation.citation.query, related: false });
  const main = interpretation.topics[0];
  if (main) jobs.push({ keys: chosen, query: main.expand, related: true });

  const settled = await Promise.allSettled(jobs.map(run));
  const seen = new Set(), results = [], perSource = {};
  settled.forEach((s, i) => {
    if (s.status !== 'fulfilled') return;
    for (const r of s.value) {
      const norm = r.url.replace(/^https?:\/\/(www\.)?/, '').replace(/[?#].*$/, '');
      if (seen.has(norm) || (perSource[r.site] = (perSource[r.site] || 0) + 1) > PER_QUERY * 2) continue;
      seen.add(norm);
      results.push({ ...r, related: jobs[i].related });
    }
  });
  const failed = settled.every((s) => s.status === 'rejected') ? chosen : [];
  // Resultados diretos primeiro; os alargados (por área do direito) depois.
  results.sort((a, b) => Number(a.related) - Number(b.related));
  const more = `${term} (${chosen.flatMap((k) => LAW_SOURCES[k].domains).map((d) => `site:${d}`).join(' OR ')})`;
  return { term, interpretation, results, failed, provider: useSerper ? 'Google (Serper)' : 'Bing', moreUrl: `https://www.google.com/search?q=${encodeURIComponent(more)}` };
}

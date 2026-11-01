import test from 'node:test';
import assert from 'node:assert/strict';
import { teiaRequest, teiaCollect, highlightSegments, wikidataProfileQuery, normalizeWikidataProfile, drRequestBody, drDocumentUrl, TEIA_SOURCES } from './teia-sources.mjs';

function mockFetch(responder) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const { body, status = 200 } = responder(String(url), init);
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return { fetchImpl, calls };
}

test('valida e normaliza os pedidos da Teia', () => {
  assert.deepEqual(teiaRequest(new URLSearchParams({ fonte: 'dr', q: '  Solverde   SA ' })), { fonte: 'dr', q: 'Solverde SA', offset: 0 });
  assert.deepEqual(teiaRequest({ fonte: 'arquivo', q: 'Spinumviva', offset: '10' }), { fonte: 'arquivo', q: 'Spinumviva', offset: 10 });
  assert.deepEqual(teiaRequest({ fonte: 'wikidata', id: 'Q11764394' }), { fonte: 'wikidata', id: 'Q11764394' });
  assert.deepEqual(teiaRequest({ fonte: 'arquivo-site', site: 'https://www.Spinumviva.pt/clientes?x=1' }), { fonte: 'arquivo-site', site: 'spinumviva.pt' });
  assert.deepEqual(teiaRequest({ fonte: 'wikipedia', titulo: 'Caso Spinumviva' }), { fonte: 'wikipedia', titulo: 'Caso Spinumviva' });
  assert.throws(() => teiaRequest({ fonte: 'base', q: 'x' }), /não suportada/);
  assert.throws(() => teiaRequest({ fonte: 'dr', q: 'a' }), /entre 2 e 120/);
  assert.throws(() => teiaRequest({ fonte: 'dr', q: 'x'.repeat(121) }), /entre 2 e 120/);
  assert.throws(() => teiaRequest({ fonte: 'dr', q: 'ab\u0000c' }), /entre 2 e 120/);
  assert.throws(() => teiaRequest({ fonte: 'dr', q: 'Solverde', offset: '5' }), /Página/);
  assert.throws(() => teiaRequest({ fonte: 'dr', q: 'Solverde', offset: '200' }), /Página/);
  assert.throws(() => teiaRequest({ fonte: 'wikidata', id: 'Q1 } . ?s ?p ?o' }), /Wikidata inválido/);
  assert.throws(() => teiaRequest({ fonte: 'arquivo-site', site: 'localhost' }), /Domínio inválido/);
  assert.ok(Object.values(TEIA_SOURCES).every((s) => ['primaria', 'secundaria'].includes(s.natureza)));
});

test('converte excertos com destaques em segmentos sem HTML', () => {
  assert.deepEqual(highlightSegments("Convocam-se os accionistas da <span class='highlight'>SOLVERDE</span> - S&amp;A, no Casino"), ['Convocam-se os accionistas da ', 'SOLVERDE', ' - S&A, no Casino']);
  assert.deepEqual(highlightSegments('O caso <span class="searchmatch">Spinumviva</span> foi'), ['O caso ', 'Spinumviva', ' foi']);
  assert.deepEqual(highlightSegments('  sem destaque <i>nenhum</i> '), ['sem destaque nenhum']);
  assert.deepEqual(highlightSegments(null), ['']);
});

test('o perfil Wikidata pede cargos e organizações, mas não laços familiares', () => {
  const query = wikidataProfileQuery('Q11764394');
  for (const p of ['p:P39', 'p:P1830', 'p:P856', '"~P3320"']) assert.ok(query.includes(p), p);
  for (const p of ['P26', 'P22', 'P25', 'P40', 'P3373', 'P1038']) assert.ok(!new RegExp(`\\b${p}\\b`).test(query), p);
  assert.throws(() => wikidataProfileQuery('Q1 . }'), /inválido/);
});

test('normaliza o perfil Wikidata com datas, rótulos em português e sem duplicados', () => {
  const uri = (q) => ({ type: 'uri', value: `http://www.wikidata.org/entity/${q}` });
  const lit = (value, lang) => ({ type: 'literal', value, ...(lang ? { 'xml:lang': lang } : {}) });
  const date = (value) => ({ type: 'literal', value, datatype: 'http://www.w3.org/2001/XMLSchema#dateTime' });
  const position = { p: lit('P39'), v: uri('Q1723031'), vLabel: lit('Primeiro-Ministro de Portugal', 'pt'), start: date('2024-04-02T00:00:00Z') };
  const profile = normalizeWikidataProfile('Q11764394', [
    { p: lit('label'), v: lit('Luis Montenegro', 'en') },
    { p: lit('label'), v: lit('Luís Montenegro', 'pt') },
    { p: lit('description'), v: lit('político português', 'pt') },
    { p: lit('P569'), v: date('+1973-02-16T00:00:00Z') },
    position, position,
    { p: lit('~P488'), v: uri('Q595575'), vLabel: lit('Partido Social Democrata', 'pt'), start: date('2022-07-01T00:00:00Z') },
    { p: lit('P18'), v: { type: 'uri', value: 'http://commons.wikimedia.org/wiki/Special:FilePath/Foto.jpg' } },
    { p: lit('ptwiki'), v: { type: 'uri', value: 'https://pt.wikipedia.org/wiki/Lu%C3%ADs_Montenegro' } },
  ]);
  assert.equal(profile.nome, 'Luís Montenegro');
  assert.equal(profile.descricao, 'político português');
  assert.equal(profile.tituloArtigo, 'Luís Montenegro');
  assert.equal(profile.imagem, 'https://commons.wikimedia.org/wiki/Special:FilePath/Foto.jpg?width=240');
  assert.deepEqual(profile.afirmacoes, [
    { p: 'P569', valor: '1973-02-16' },
    { p: 'P39', valor: 'Primeiro-Ministro de Portugal', valorId: 'Q1723031', inicio: '2024-04-02' },
    { p: '~P488', valor: 'Partido Social Democrata', valorId: 'Q595575', inicio: '2022-07-01' },
  ]);
});

test('pesquisa o Diário da República com o modelo reduzido e normaliza diplomas e atos societários', async () => {
  const resultado = { hits: { total: { value: 31 }, hits: [
    { _source: { dbId: 576145, tipoConteudo: 'DiplomaLegis', tipo: 'Resolução do Conselho de Ministros', numero: '165/2001', dataPublicacao: '2001-12-10', serie: 'I', emissor: 'Presidência do Conselho de Ministros', sumario: '<p>Adjudica à SOLVERDE a concessão</p>', title: 'RCM 165/2001' },
      highlight: { texto: ["à <span class='highlight'>SOLVERDE</span> - Sociedade"] } },
    { _source: { dbId: 9500845, tipoConteudo: 'ActoSocietario', empresa: 'SOLVERDE, SA', concelho: 'ESPINHO', dataPublicacao: '2002-03-19', serie: 'III', fileId: 9500878, title: 'Diário da República n.º 66/2002, Série III' } },
  ] } };
  const { fetchImpl, calls } = mockFetch(() => ({ body: { versionInfo: { hasModuleVersionChanged: false, hasApiVersionChanged: false }, data: { Resultado: JSON.stringify(resultado) } } }));
  const out = await teiaCollect({ fonte: 'dr', q: 'Solverde', offset: 10 }, fetchImpl);
  const sent = JSON.parse(calls[0].init.body);
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['outsystems-locale'], 'pt-PT');
  assert.match(calls[0].init.headers['User-Agent'], /FumacaTeia/);
  assert.deepEqual(sent.screenData.variables.Pesquisa, { List: ['Solverde'] });
  assert.equal(sent.screenData.variables.StartIndex, 10);
  assert.equal(sent.screenData.variables.DestaqueExcertos, true);
  assert.equal(sent.screenData.variables.IsPesquisaSimples, true);
  assert.equal(out.natureza, 'primaria');
  assert.equal(out.total, 31);
  assert.equal(out.haMais, true);
  assert.deepEqual(out.itens[0], { id: '576145', conteudo: 'Diploma', tipo: 'Resolução do Conselho de Ministros', numero: '165/2001', data: '2001-12-10', serie: 'I',
    emissor: 'Presidência do Conselho de Ministros', sumario: 'Adjudica à SOLVERDE a concessão', titulo: 'RCM 165/2001', excertos: [['à ', 'SOLVERDE', ' - Sociedade']],
    url: 'https://diariodarepublica.pt/dr/detalhe/resolucao-do-conselho-de-ministros/165-2001-576145' });
  assert.equal(out.itens[1].conteudo, 'Ato societário');
  assert.equal(out.itens[1].empresa, 'SOLVERDE, SA');
  assert.equal(out.itens[1].url, 'https://dre.pt/application/file/9500878');
  assert.equal(drDocumentUrl({}), 'https://diariodarepublica.pt/dr/home');
  assert.equal(drRequestBody('x').screenData.variables.FiltrosDePesquisa.texto, '');
});

test('falha de forma explícita quando o Diário da República muda ou recusa a pesquisa', async () => {
  const changed = mockFetch(() => ({ body: { versionInfo: { hasApiVersionChanged: true }, data: {} } }));
  await assert.rejects(teiaCollect({ fonte: 'dr', q: 'Solverde', offset: 0 }, changed.fetchImpl), /mudou a aplicação/);
  const refused = mockFetch(() => ({ body: { versionInfo: {}, data: { Resultado: '', HasErrorPesquisa: true } } }));
  await assert.rejects(teiaCollect({ fonte: 'dr', q: 'Solverde', offset: 0 }, refused.fetchImpl), /não aceitou/);
});

test('lista páginas arquivadas de um site, com as mais reveladoras primeiro', async () => {
  const lines = [
    '{"url": "http://spinumviva.pt/", "timestamp": "20220123142527"}',
    'linha estragada',
    '{"url": "http://spinumviva.pt/clientes.html", "timestamp": "20220123142600"}',
    '{"url": "javascript:alert(1)", "timestamp": "20220123142600"}',
  ].join('\n');
  const { fetchImpl, calls } = mockFetch(() => ({ body: lines }));
  const out = await teiaCollect({ fonte: 'arquivo-site', site: 'spinumviva.pt' }, fetchImpl);
  const url = new URL(calls[0].url);
  assert.deepEqual(url.searchParams.getAll('filter'), ['mime:text/html', 'status:200']);
  assert.equal(url.searchParams.get('matchType'), 'domain');
  assert.deepEqual(out.itens.map((p) => [p.url, p.relevante]), [['http://spinumviva.pt/clientes.html', true], ['http://spinumviva.pt/', false]]);
  assert.equal(out.itens[1].arquivo, 'https://arquivo.pt/wayback/20220123142527/http://spinumviva.pt/');
  assert.equal(out.itens[1].data, '2022-01-23');
});

test('pesquisa no Arquivo.pt e descarta ligações fora do arquivo', async () => {
  const { fetchImpl } = mockFetch(() => ({ body: { estimated_nr_results: 2, response_items: [
    { title: 'Luimonteago, Lda', originalURL: 'https://racius.com/luimonteago-lda', linkToArchive: 'https://arquivo.pt/wayback/20241030043006/https://racius.com/luimonteago-lda', tstamp: '20241030043006', snippet: 'Outras empresas <em>Spinumviva</em>, Lda' },
    { title: 'Falso', originalURL: 'https://x.pt', linkToArchive: 'https://malicioso.example/x', tstamp: '20241030043006', snippet: '' },
  ] } }));
  const out = await teiaCollect({ fonte: 'arquivo', q: 'Spinumviva', offset: 0 }, fetchImpl);
  assert.equal(out.itens.length, 1);
  assert.deepEqual(out.itens[0].excerto, ['Outras empresas ', 'Spinumviva', ', Lda']);
  assert.equal(out.itens[0].data, '2024-10-30');
  assert.equal(out.natureza, 'secundaria');
});

test('lê um artigo da Wikipédia com ligação permanente à revisão', async () => {
  const { fetchImpl, calls } = mockFetch(() => ({ body: { query: { pages: [{ title: 'Caso Spinumviva', fullurl: 'https://pt.wikipedia.org/wiki/Caso_Spinumviva', extract: 'x'.repeat(60010), revisions: [{ revid: 72499724, timestamp: '2026-06-25T10:00:00Z' }] }] } } }));
  const out = await teiaCollect({ fonte: 'wikipedia', titulo: 'Caso Spinumviva' }, fetchImpl);
  assert.equal(new URL(calls[0].url).searchParams.get('titles'), 'Caso Spinumviva');
  assert.equal(out.revisao, 'https://pt.wikipedia.org/w/index.php?oldid=72499724');
  assert.equal(out.dataRevisao, '2026-06-25');
  assert.equal(out.texto.length, 60000);
  assert.equal(out.truncado, true);
  const missing = mockFetch(() => ({ body: { query: { pages: [{ title: 'Nada', missing: true }] } } }));
  await assert.rejects(teiaCollect({ fonte: 'wikipedia', titulo: 'Nada' }, missing.fetchImpl), /não encontrado/);
});

test('recusa respostas grandes demais, limitadas ou inválidas', async () => {
  const big = mockFetch(() => ({ body: `{"search":"${'x'.repeat(2 * 1024 * 1024)}"}` }));
  await assert.rejects(teiaCollect({ fonte: 'wikidata-pesquisa', q: 'Solverde', offset: 0 }, big.fetchImpl), /2 MiB/);
  const limited = mockFetch(() => ({ body: '', status: 429 }));
  await assert.rejects(teiaCollect({ fonte: 'arquivo', q: 'Solverde', offset: 0 }, limited.fetchImpl), /429/);
  const broken = mockFetch(() => ({ body: '<html>' }));
  await assert.rejects(teiaCollect({ fonte: 'wikidata', id: 'Q1' }, broken.fetchImpl), /JSON válido/);
});

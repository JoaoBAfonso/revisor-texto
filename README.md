# Revisor de Texto

Verificador ortográfico (português de Portugal e inglês US + UK) que corre inteiramente no browser, com Hunspell em WebAssembly.

- Executar localmente: `python -m http.server 8765` e abrir http://localhost:8765
- Publicar: GitHub Pages a partir da raiz do repositório (branch `main`).
- Dicionários ortográficos em `vendor/dict` (LGPL-3.0 ou MPL-2.0, ver licenças).

## Definições

- **Português:** Priberam, via proxy em `proxy/` (o Priberam não permite pedidos diretos a partir de outra página).
- **Inglês:** Wiktionary (API REST da Wikimedia), chamado diretamente do browser, sem proxy.

## Dúvidas (Ciberdúvidas)

Só em português: pesquisa a seleção (ou um termo escrito) no consultório do Ciberdúvidas e lista as 10 dúvidas mais relevantes, com ligação para a resposta. Passa pelo proxy (rota `/duvidas?q=`).

## Notícias

Só em português: pesquisa uma palavra ou expressão em Público, Expresso, RTP, SIC Notícias, TVI, Correio da Manhã e A Mensagem (sites à escolha). Os resultados vêm do RSS do Bing Notícias, via proxy (rota `/noticias?q=&sites=`), e ao clicar abre um popup com título, data e o resumo, com ligação para o artigo. O popup mostra o autor e um excerto do início da notícia (cerca de 1800 caracteres, quando o site o disponibiliza ao proxy; caso contrário, o resumo), e permite ligar a seleção do editor à notícia. Não se reproduz a notícia na íntegra.

## Ligações no editor

Seleciona texto e usa **Ligação** (ou Ctrl+K) para lhe associar um endereço (http, https ou e-mail). O texto fica sublinhado a azul sem mostrar o endereço; as ligações acompanham o texto ao editar, entram no histórico de desfazer e são guardadas com o rascunho. Com o cursor numa ligação aparece uma barra com Abrir, Editar e Remover (também Ctrl+clique abre). Colar um endereço sobre texto selecionado cria a ligação. **Copiar com ligações** copia HTML com as ligações para colar noutras aplicações.

## Direito e legislação

Só em português. Para cada palavra, expressão ou citação (ex.: «Lei n.º 2/99», «artigo 180 do Código Penal») o proxy (rota `/direito?q=&sources=`) **interpreta** o termo e devolve um **guia jurídico** (`proxy/guia.js`) com 25 áreas, de crimes contra a honra a trabalho, arrendamento, consumo, saúde, impostos, imigração, participação cívica e Administração Pública. Cada área traz: os teus direitos, como agir passo a passo, prazos (só os fixados de forma inequívoca na lei, com o artigo), argumentos úteis, onde recorrer (entidades com ligação) e diplomas que, ao tocar, lançam nova pesquisa. Há ainda um quadro de ferramentas gerais (apoio judiciário, Provedor de Justiça, denúncia ao Ministério Público, petição e ação popular).

O resultado está organizado por ordem de utilidade: **O que sabemos** (explicação, direitos à cabeça e prazo mais urgente) → **Perspetivas** (ângulos com pesquisas sugeridas, em `modelos.js`) → **Fontes** → **O que fazer** (passos, prazos, argumentos, entidades) → **Modelos prontos** (cerca de 18 cartas e requerimentos, como direito de resposta, acesso a documentos, RGPD, queixas à ERC, CNPD, CADA e ao Provedor, queixa-crime, impugnação de multas, consumo). Os campos dos modelos são preenchidos uma só vez e o nome, a morada e o contacto ficam guardados apenas no navegador; cada modelo pode ser copiado, inserido no editor ou descarregado.

A pesquisa cobre Diário da República, PGDL, tribunais (DGSI), Tribunal Constitucional, ERC, CNPD e, opcionalmente, CADA, Provedor de Justiça, Ministério Público, EUR-Lex e TEDH. Os resultados são ordenados por relevância e agrupados por tipo (legislação, jurisprudência…); a área identificada pode acrescentar automaticamente fontes recomendadas. Cada resultado abre num popup com o **texto integral** (rota `/texto?url=`, só para os domínios das fontes jurídicas; as notícias usam `/noticia`), ligação à fonte e o botão de ligar a seleção. O Diário da República, o EUR-Lex e o HUDOC só funcionam com JavaScript nos seus sites, por isso, nesses casos, o popup mostra o excerto e a lista avisa «só no site de origem». O conteúdo é orientativo e não substitui aconselhamento jurídico: confirma sempre prazos e texto em vigor na fonte oficial.

O Bing não respeita o filtro de sites a partir dos IPs da Cloudflare, por isso a pesquisa usa o Google via [Serper.dev](https://serper.dev) (plano gratuito) quando o segredo existe: `cd proxy; npx.cmd wrangler secret put SERPER_API_KEY`. Sem a chave, as notas e diplomas aparecem na mesma, mas os resultados da pesquisa podem vir vazios.

## Tradução (DeepL)

Traduz a seleção, ou o texto todo, entre português e inglês (Reino Unido ou EUA). O DeepL exige uma chave de API que não pode ficar numa página pública, por isso o pedido passa pelo proxy, que guarda a chave.

1. Criar uma conta em https://www.deepl.com/pro-api (o plano API Free chega para começar).
2. Desenvolvimento: `$env:DEEPL_API_KEY = "a-tua-chave"` e depois `node proxy/dev-server.mjs`.
3. Produção: `npx wrangler secret put DEEPL_API_KEY` no Worker.

O texto traduzido é enviado ao DeepL. O limite é de 5000 caracteres por pedido.

### Proxy

- Desenvolvimento: `node proxy/dev-server.mjs` (http://localhost:8787); o `config.js` já aponta para aí.
- Produção: publicar `proxy/` como Cloudflare Worker (`worker.js` + `priberam.js`), colocar o domínio do GitHub Pages em `ALLOWED_ORIGINS` no `worker.js` e o URL do Worker em `definitionApi` no `config.js`.

## Painéis recolhíveis, texto arrumado e Constituição

- Cada ferramenta (Definição, Dúvidas, Notícias, Direito, Tradução) e o painel de erros são painéis verticais que se expandem/recolhem; o estado fica guardado no navegador.
- O proxy arruma o texto de fontes externas (DGSI, PGDL, notícias) e isola artigos da CRP (/texto?artigo=N).
- A secção jurídica mostra primeiro os artigos da Constituição relevantes. O conhecimento está em proxy/guia.js e é validado por proxy/guia.test.mjs (node guia.test.mjs); é orientativo e deve ser revisto por um jurista.

## Toolbox

O site é agora uma toolbox com uma página inicial e uma vista por ferramenta (routing por hash): #/revisor, #/noticias e #/direito. Dentro de Direito há dois modos: **Guia** (#/direito) e **Legislação** (#/direito/lei[/diploma[/artigo]]). O antigo #/lei redireciona.

## Cérebro jurídico (parte de Direito e legislação)

É o conhecimento que guia a ferramenta de Direito. No Guia, cada pesquisa mostra a secção **A lei, por hierarquia** (normas-chave da área, diplomas da matéria e artigos completos agrupados da Constituição para baixo) antes das perspetivas, fontes externas, passos e modelos. No modo Legislação percorres a hierarquia, os diplomas, o índice de cada um e cada artigo com «remete para» e «citado por».

Corpus de ~1580 diplomas e ~84 000 artigos em data/lei: os diplomas-chave do PGDL (catálogo em proxy/corpus/catalog.mjs), toda a legislação **consolidada em vigor** listada por tema no Diário da República (screenservices do DRE, chamados a partir do Node), os diplomas citados no guia (quando não há consolidação, importa-se o texto original do ato) e ~100 atos de **direito da UE** em português (Tratados, Carta e direito derivado, via Cellar do Serviço das Publicações, corpus/eu.mjs). Não é literalmente toda a lei. Portarias, resoluções e despachos (grau 6) só são pesquisáveis por título/epígrafe; o texto dos graus 0 a 4 é indexado por inteiro.

- Regenerar: cd proxy; node corpus/dre.mjs [--list|--force|--limit N] (lista e descarrega do DRE; se o DRE mudar a aplicação, recapturar os modelos em corpus/dre/), node corpus/eu.mjs [--force] (direito da UE) e depois node corpus/build.mjs [--force|--only id,id|--index]. Escreve data/lei/<id>.json, meta.json, index.json, refs.json, heads.json e guia.json.
- Jurisprudência: node corpus/dgsi.mjs [--desde AAAA-MM-DD|--base jstj,jsta|--emit] percorre as bases do DGSI (STJ, STA, Relações), guarda o sumário de cada acórdão e liga-o aos artigos do corpus que cita («art. 483.º do CC» → cc:483). Escreve data/juris/<diploma>.json; o estado incremental fica em corpus/dgsi/. No modo Legislação, cada artigo mostra os acórdãos que o citam.
- Procedimentos e prazos: corpus/procedures.mjs compila TOPICS/prazos/normas de proxy/guia.js (fonte de autoria) em data/lei/guia.json, resolvendo cada citação a diploma/artigo e listando as que não estão no corpus. A base de cada prazo é uma ligação ao artigo.
- Cliente: lei.js pesquisa por tokens (os mesmos de proxy/corpus/tokens.mjs), reforça os diplomas da área identificada, agrupa por grau hierárquico e expõe window.brain (section, link, ref). Aceita atalhos como "artigo 37 CRP".
- Orientativo: o texto pode estar desatualizado. Confirma no Diário da República e consulta um jurista.

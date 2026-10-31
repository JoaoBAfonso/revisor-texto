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

## Tradução (DeepL)

Traduz a seleção, ou o texto todo, entre português e inglês (Reino Unido ou EUA). O DeepL exige uma chave de API que não pode ficar numa página pública, por isso o pedido passa pelo proxy, que guarda a chave.

1. Criar uma conta em https://www.deepl.com/pro-api (o plano API Free chega para começar).
2. Desenvolvimento: `$env:DEEPL_API_KEY = "a-tua-chave"` e depois `node proxy/dev-server.mjs`.
3. Produção: `npx wrangler secret put DEEPL_API_KEY` no Worker.

O texto traduzido é enviado ao DeepL. O limite é de 5000 caracteres por pedido.

### Proxy

- Desenvolvimento: `node proxy/dev-server.mjs` (http://localhost:8787); o `config.js` já aponta para aí.
- Produção: publicar `proxy/` como Cloudflare Worker (`worker.js` + `priberam.js`), colocar o domínio do GitHub Pages em `ALLOWED_ORIGINS` no `worker.js` e o URL do Worker em `definitionApi` no `config.js`.

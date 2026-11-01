// Endereço do proxy que consulta o Priberam (ver proxy/worker.js).
// Em desenvolvimento: node proxy/dev-server.mjs. Em produção: URL do Cloudflare Worker.
window.REVISOR_CONFIG = {
  definitionApi: 'https://revisor-texto-proxy.joaobafonso.workers.dev',
  // Índices públicos da Teia (Parlamento, contratos, declarações): https://github.com/JoaoBAfonso/fumaca-dados
  dataBase: 'https://joaobafonso.github.io/fumaca-dados/',
};

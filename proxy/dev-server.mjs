// Proxy local para desenvolvimento: node proxy/dev-server.mjs  (http://localhost:8787)
// Para a tradução, definir antes a chave: $env:DEEPL_API_KEY = "..."
import http from 'node:http';
import worker from './worker.js';

http.createServer(async (req, res) => {
  const headers = new Headers();
  if (req.headers.origin) headers.set('Origin', req.headers.origin);
  if (req.headers['content-type']) headers.set('Content-Type', req.headers['content-type']);

  let body;
  if (req.method === 'POST') {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = Buffer.concat(chunks);
  }

  const request = new Request(`http://localhost:8787${req.url}`, { method: req.method, headers, body });
  const response = await worker.fetch(request, { DEEPL_API_KEY: process.env.DEEPL_API_KEY });
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
}).listen(8787, () => console.log('Proxy em http://localhost:8787'));

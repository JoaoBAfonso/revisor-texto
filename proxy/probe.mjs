const [from, to] = process.argv.slice(2).map(Number);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/124.0 Safari/537.36';
const out = [];
async function one(nid) {
  try {
    const res = await fetch(`https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=${nid}&tabela=leis`, { headers: { 'User-Agent': UA } });
    const buf = await res.arrayBuffer();
    const html = new TextDecoder('windows-1252').decode(buf);
    const t = /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim();
    const h = /Início legislação[\s\S]{0,400}?<[^>]*>([^<]{5,200})</i.exec(html)?.[1]?.trim();
    out.push([nid, res.status, buf.byteLength, t, h].join(' | '));
  } catch (e) { out.push(`${nid} | ERR ${e.message}`); }
}
const ids = Array.from({ length: to - from + 1 }, (_, i) => from + i);
for (let i = 0; i < ids.length; i += 4) await Promise.all(ids.slice(i, i + 4).map(one));
console.log(out.sort((a, b) => parseInt(a) - parseInt(b)).join('\n'));

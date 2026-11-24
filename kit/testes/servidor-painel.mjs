// Servidor de arquivos que imita o que serve as páginas publicadas em sites.autonomia.site
// (framework/sites/entrega-nginx/nginx.conf do View): só GET e HEAD, tipo só pelas extensões que o
// painel aceita (o resto sai como application/octet-stream), X-Content-Type-Options nosniff,
// Referrer-Policy, faixa de bytes (vídeo), "try_files $uri $uri/ $uri.html" e index.html na pasta.
// Nenhum cabeçalho de quadro: o painel não manda X-Frame-Options nem CSP para as páginas publicadas.
// Só para os testes, só em 127.0.0.1. Serve a pasta onde o zip do pacote foi aberto.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const TIPOS = Object.freeze({
  html: 'text/html; charset=utf-8', htm: 'text/html; charset=utf-8', css: 'text/css; charset=utf-8',
  js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8', txt: 'text/plain; charset=utf-8', xml: 'application/xml; charset=utf-8',
  csv: 'text/csv; charset=utf-8', svg: 'image/svg+xml; charset=utf-8', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf', mp4: 'video/mp4', webm: 'video/webm',
  mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', pdf: 'application/pdf', webmanifest: 'application/manifest+json',
});

const tipoDe = (arquivo) => {
  const nome = path.basename(arquivo).toLowerCase();
  const ponto = nome.lastIndexOf('.');
  return (ponto > 0 && TIPOS[nome.slice(ponto + 1)]) || 'application/octet-stream';
};

const ehArquivo = (abs) => fs.existsSync(abs) && fs.statSync(abs).isFile();

// "try_files $uri $uri/ $uri.html =404": arquivo, pasta (com barra e index.html), ou .html.
function resolver(raiz, pedido) {
  const abs = path.join(raiz, ...pedido.split('/').filter(Boolean));
  if (!abs.startsWith(raiz)) return { status: 404 };
  if (ehArquivo(abs)) return { arquivo: abs };
  if (fs.existsSync(abs) && fs.statSync(abs).isDirectory()) {
    if (!pedido.endsWith('/')) return { status: 301, para: `${pedido.split('/').pop()}/` };
    const index = path.join(abs, 'index.html');
    return ehArquivo(index) ? { arquivo: index } : { status: 403 };
  }
  if (ehArquivo(`${abs}.html`)) return { arquivo: `${abs}.html` };
  return { status: 404 };
}

export async function servirComoOPainel(raiz) {
  const base = path.resolve(raiz);
  const pedidos = [];
  const srv = http.createServer((req, res) => {
    const comuns = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
    if (req.method !== 'GET' && req.method !== 'HEAD') return res.writeHead(405, comuns).end();
    let pedido;
    try {
      pedido = decodeURIComponent(new URL(req.url, 'http://127.0.0.1').pathname);
    } catch {
      return res.writeHead(400, comuns).end();
    }
    const r = resolver(base, pedido);
    pedidos.push({ caminho: pedido, status: r.status || 200, faixa: req.headers.range || '' });
    if (r.status === 301) return res.writeHead(301, { ...comuns, Location: r.para }).end();
    if (r.status) return res.writeHead(r.status, { ...comuns, 'Content-Type': 'text/html' }).end(String(r.status));
    const tamanho = fs.statSync(r.arquivo).size;
    const cabecalho = { ...comuns, 'Content-Type': tipoDe(r.arquivo), 'Accept-Ranges': 'bytes' };
    const faixa = req.headers.range;
    if (faixa && faixa.startsWith('bytes=') && !faixa.includes(',')) {
      const [a, b] = faixa.slice(6).split('-');
      const ini = a === '' ? Math.max(0, tamanho - Number(b)) : Number(a);
      const fim = a !== '' && b !== '' ? Math.min(Number(b), tamanho - 1) : tamanho - 1;
      if (!Number.isInteger(ini) || !Number.isInteger(fim) || ini > fim || ini >= tamanho) {
        return res.writeHead(416, { ...comuns, 'Content-Range': `bytes */${tamanho}` }).end();
      }
      pedidos[pedidos.length - 1].status = 206;
      res.writeHead(206, { ...cabecalho, 'Content-Length': fim - ini + 1, 'Content-Range': `bytes ${ini}-${fim}/${tamanho}` });
      if (req.method === 'HEAD') return res.end();
      return fs.createReadStream(r.arquivo, { start: ini, end: fim }).pipe(res);
    }
    res.writeHead(200, { ...cabecalho, 'Content-Length': tamanho });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(r.arquivo).pipe(res);
  });
  await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
  const origem = `http://127.0.0.1:${srv.address().port}`;
  return {
    origem,
    porta: srv.address().port,
    pedidos,
    fechar: () => new Promise((resolve) => { srv.closeAllConnections(); srv.close(resolve); }),
  };
}

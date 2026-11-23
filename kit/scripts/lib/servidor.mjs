// Servidor HTTP estático só de leitura: index e telas na mesma origem (os iframes precisam ler
// o documento um do outro; file:// bloqueia). Aceita Range (vídeo). Só serve dentro da raiz,
// conferida pelo caminho real (link simbólico para fora é recusado), e lê o arquivo aberto por
// esse caminho real. Falha de leitura encerra só aquela resposta; o servidor continua de pé.
// "/pasta/" devolve "/pasta/index.html"; "/pasta" redireciona para "/pasta/".
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

export const TIPOS = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.pdf': 'application/pdf',
  '.glb': 'model/gltf-binary',
});

// Rota que o servidor-sozinho responde com {pid, pasta} (o "abrir" confere antes de reaproveitar).
export const ROTA_IDENTIDADE = '/__estudio.json';

function caminhoDoPedido(url) {
  let fim = url.length;
  const q = url.indexOf('?');
  const h = url.indexOf('#');
  if (q !== -1) fim = Math.min(fim, q);
  if (h !== -1) fim = Math.min(fim, h);
  const caminho = decodeURIComponent(url.slice(0, fim));
  // Caractere de controle (quebra de linha, NUL…) não existe em nome de arquivo servido e quebraria o
  // cabeçalho do redirecionamento: vira 400.
  for (const ch of caminho) {
    const cod = ch.codePointAt(0);
    if (cod < 0x20 || cod === 0x7f) throw new Error('caractere de controle no caminho');
  }
  return caminho;
}

// Fora da base? "..", "../x" ou outro disco. "..notas.css" é um nome de arquivo comum, não sobe pasta.
export function foraDaBase(base, alvo) {
  const rel = path.relative(base, alvo);
  return rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel);
}

function responder(res, status, cabecalho = {}) {
  res.writeHead(status, { 'Content-Type': 'text/plain', ...cabecalho }).end(String(status));
}

// Endereço de redirecionamento "/pasta/" com cada pedaço codificado: "#" e "?" no nome de uma
// pasta continuam sendo parte do nome (encodeURI deixaria passar e o navegador cortaria ali).
export function enderecoDaPasta(pedido) {
  return `${pedido.split('/').map(encodeURIComponent).join('/')}/`;
}

// Caminho real (sem link) do arquivo, se ficar dentro do caminho real da base; senão null.
function realDentro(baseReal, arquivo) {
  let real;
  try {
    real = fs.realpathSync(arquivo);
  } catch {
    return null;
  }
  return foraDaBase(baseReal, real) ? null : real;
}

// Manda o arquivo já aberto (fd), inteiro ou um pedaço. Erro no meio encerra só esta resposta
// (500 se o cabeçalho ainda não saiu, senão corta a conexão). Nunca derruba o servidor.
function mandarArquivo(res, fd, status, cabecalho, faixa, criarLeitura) {
  let fluxo;
  try {
    fluxo = criarLeitura(fd, faixa);
  } catch {
    fecharFd(fd);
    responder(res, 500);
    return;
  }
  fluxo.on('error', () => {
    if (!res.headersSent) responder(res, 500);
    else res.destroy();
  });
  res.writeHead(status, cabecalho);
  // quem pediu desistiu no meio (vídeo pulado, aba fechada): fecha o arquivo
  res.on('close', () => fluxo.destroy());
  fluxo.pipe(res);
}

function fecharFd(fd) {
  try {
    fs.closeSync(fd);
  } catch {}
}

// virtuais: { '/caminho.html': '<html>…' } — conteúdo gerado em memória na mesma origem (o tipo vem
// da extensão do caminho). aoPedir(): chamado a cada pedido (o "abrir" usa para saber se ainda tem
// alguém olhando). abrirArquivo e criarLeitura: só para os testes simularem arquivo que some antes
// de abrir ou quebra no meio da leitura.
export function servir(raiz, { virtuais = {}, porta = 0, aoPedir, abrirArquivo, criarLeitura } = {}) {
  const base = path.resolve(raiz);
  const baseReal = fs.realpathSync(base);
  const abrirReal = abrirArquivo || ((real) => fs.openSync(real, 'r'));
  const ler = criarLeitura || ((fd, faixa) => fs.createReadStream(null, { fd, ...faixa }));
  const srv = http.createServer((req, res) => {
    try {
      atender(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'text/plain' }).end('500');
      else res.destroy();
    }
  });
  function atender(req, res) {
    if (aoPedir) aoPedir();
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      responder(res, 405);
      return;
    }
    let pedido;
    try {
      pedido = caminhoDoPedido(req.url || '/');
    } catch {
      responder(res, 400);
      return;
    }
    if (Object.hasOwn(virtuais, pedido)) {
      const tipoVirtual = TIPOS[path.extname(pedido).toLowerCase()] || TIPOS['.html'];
      res.writeHead(200, { 'Content-Type': tipoVirtual, 'Cache-Control': 'no-store' }).end(req.method === 'HEAD' ? undefined : virtuais[pedido]);
      return;
    }
    let arquivo = path.resolve(base, `.${pedido}`);
    if (foraDaBase(base, arquivo)) {
      responder(res, 403);
      return;
    }
    let st;
    try {
      st = fs.statSync(arquivo);
    } catch {
      responder(res, 404);
      return;
    }
    if (st.isDirectory()) {
      if (!pedido.endsWith('/')) {
        res.writeHead(301, { Location: enderecoDaPasta(pedido) }).end();
        return;
      }
      arquivo = path.join(arquivo, 'index.html');
    }
    // Contenção pelo caminho real: link simbólico (ou junção) que aponta para fora é 403,
    // inclusive o index.html de uma pasta.
    const real = realDentro(baseReal, arquivo);
    if (!real) {
      responder(res, fs.existsSync(arquivo) ? 403 : 404);
      return;
    }
    // Abre o caminho REAL já conferido (não o pedido, que pode ser um link trocado no meio) e
    // confere o que foi aberto: o que sai é exatamente o que foi conferido.
    let fd;
    try {
      fd = abrirReal(real);
    } catch {
      responder(res, fs.existsSync(real) ? 500 : 404);
      return;
    }
    try {
      st = fs.fstatSync(fd);
    } catch {
      fecharFd(fd);
      responder(res, 500);
      return;
    }
    if (!st.isFile()) {
      fecharFd(fd);
      responder(res, 404);
      return;
    }
    const tipo = TIPOS[path.extname(real).toLowerCase()] || 'application/octet-stream';
    const cabecalho = { 'Content-Type': tipo, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
    const range = req.headers.range;
    if (range && range.startsWith('bytes=')) {
      const [a, b] = range.slice(6).split('-');
      const ini = a === '' ? Math.max(0, st.size - Number(b)) : Number(a);
      const fim = a === '' || b === '' ? st.size - 1 : Math.min(Number(b), st.size - 1);
      if (!Number.isInteger(ini) || !Number.isInteger(fim) || ini > fim || ini >= st.size) {
        fecharFd(fd);
        res.writeHead(416, { 'Content-Range': `bytes */${st.size}` }).end();
        return;
      }
      const parcial = { ...cabecalho, 'Content-Range': `bytes ${ini}-${fim}/${st.size}`, 'Content-Length': fim - ini + 1 };
      if (req.method === 'HEAD') {
        fecharFd(fd);
        res.writeHead(206, parcial).end();
      } else mandarArquivo(res, fd, 206, parcial, { start: ini, end: fim }, ler);
      return;
    }
    const inteiro = { ...cabecalho, 'Content-Length': st.size };
    if (req.method === 'HEAD') {
      fecharFd(fd);
      res.writeHead(200, inteiro).end();
    } else mandarArquivo(res, fd, 200, inteiro, {}, ler);
  }
  return new Promise((res, rej) => {
    srv.on('error', rej);
    srv.listen(porta, '127.0.0.1', () =>
      res({
        porta: srv.address().port,
        origem: `http://127.0.0.1:${srv.address().port}`,
        fechar: () =>
          new Promise((r) => {
            srv.closeAllConnections?.();
            srv.close(() => r());
          }),
      }),
    );
  });
}

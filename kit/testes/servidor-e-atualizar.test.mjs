// Servidor local (pasta/ → index.html, nada fora da raiz) e atualização (preserva o usuário, volta atrás).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import { servir } from '../scripts/lib/servidor.mjs';
import { aplicarVersao, atualizarEstudio, acharRaizNova } from '../scripts/lib/atualizacao.mjs';

const temporaria = (prefixo) => fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
const escrever = (arq, texto) => {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, texto);
};

test('servidor: "/pasta/" devolve o index, "/pasta" redireciona, fora da raiz é 403, falta é 404', async () => {
  const raiz = temporaria('estudio-srv-');
  escrever(path.join(raiz, 'index.html'), '<p>raiz</p>');
  escrever(path.join(raiz, 'sub', 'index.html'), '<p>sub</p>');
  escrever(path.join(raiz, 'v.mp4'), '0123456789');
  const srv = await servir(raiz, { virtuais: { '/virtual.html': '<p>v</p>' } });
  try {
    const get = (p, init) => fetch(`${srv.origem}${p}`, { redirect: 'manual', ...init });
    assert.equal(await (await get('/')).text(), '<p>raiz</p>');
    assert.equal(await (await get('/sub/')).text(), '<p>sub</p>');
    const r = await get('/sub');
    assert.equal(r.status, 301);
    assert.equal(r.headers.get('location'), '/sub/');
    assert.equal((await get('/nada.html')).status, 404);
    assert.equal((await get('/..%2f..%2fetc%2fhosts')).status, 403);
    assert.equal(await (await get('/virtual.html')).text(), '<p>v</p>');
    const parte = await get('/v.mp4', { headers: { Range: 'bytes=2-4' } });
    assert.equal(parte.status, 206);
    assert.equal(await parte.text(), '234');
    assert.equal((await get('/index.html')).headers.get('content-type'), 'text/html; charset=utf-8');
  } finally {
    await srv.fechar();
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

function montarEstudio(raiz, versao, extra = {}) {
  escrever(path.join(raiz, 'VERSAO'), `${versao}\n`);
  escrever(path.join(raiz, 'kit', 'scripts', 'a.mjs'), `// ${versao}\n`);
  escrever(path.join(raiz, 'package.json'), '{"name":"x"}\n');
  for (const [arq, texto] of Object.entries(extra)) escrever(path.join(raiz, ...arq.split('/')), texto);
}

test('aplicarVersao troca o kit e preserva pastas do usuário e permissões locais', () => {
  const base = temporaria('estudio-upd-');
  try {
    const raiz = path.join(base, 'estudio');
    const nova = path.join(base, 'nova');
    montarEstudio(raiz, '1.0.0', {
      'apresentacoes/meu/brief.md': 'meu trabalho',
      'minha-marca/tokens.css': 'minha marca',
      '.claude/settings.local.json': '{"local":true}',
      '.claude/settings.json': '{"v":1}',
    });
    montarEstudio(nova, '1.1.0', { '.claude/settings.json': '{"v":2}', 'apresentacoes/LEIA-ME.txt': 'nao copiar por cima' });
    const ferr = path.join(raiz, '.ferramentas');
    const { copia } = aplicarVersao(raiz, nova, ferr);
    assert.equal(fs.readFileSync(path.join(raiz, 'VERSAO'), 'utf8').trim(), '1.1.0');
    assert.equal(fs.readFileSync(path.join(raiz, 'kit', 'scripts', 'a.mjs'), 'utf8'), '// 1.1.0\n');
    assert.equal(fs.readFileSync(path.join(raiz, 'apresentacoes', 'meu', 'brief.md'), 'utf8'), 'meu trabalho');
    assert.equal(fs.existsSync(path.join(raiz, 'apresentacoes', 'LEIA-ME.txt')), false);
    assert.equal(fs.readFileSync(path.join(raiz, 'minha-marca', 'tokens.css'), 'utf8'), 'minha marca');
    assert.equal(fs.readFileSync(path.join(raiz, '.claude', 'settings.json'), 'utf8'), '{"v":2}');
    assert.equal(fs.readFileSync(path.join(raiz, '.claude', 'settings.local.json'), 'utf8'), '{"local":true}');
    assert.equal(fs.readFileSync(path.join(copia, 'VERSAO'), 'utf8').trim(), '1.0.0');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('aplicarVersao volta tudo como estava se a troca falhar no meio', (t) => {
  if (process.platform === 'win32' || (process.getuid && process.getuid() === 0)) {
    t.skip('sem como negar leitura de pasta aqui (Windows ou root)');
    return;
  }
  const base = temporaria('estudio-upd-falha-');
  const travada = path.join(base, 'nova', 'zz-travada');
  try {
    const raiz = path.join(base, 'estudio');
    const nova = path.join(base, 'nova');
    montarEstudio(raiz, '1.0.0');
    montarEstudio(nova, '2.0.0');
    // uma pasta sem permissão de leitura na versão nova faz a cópia falhar no meio
    escrever(path.join(travada, 'x.txt'), 'x');
    fs.chmodSync(travada, 0o000);
    const ferr = path.join(raiz, '.ferramentas');
    assert.throws(() => aplicarVersao(raiz, nova, ferr), (e) => e.codigo === 'ATUALIZACAO_FALHOU');
    assert.equal(fs.readFileSync(path.join(raiz, 'VERSAO'), 'utf8').trim(), '1.0.0');
    assert.equal(fs.readFileSync(path.join(raiz, 'kit', 'scripts', 'a.mjs'), 'utf8'), '// 1.0.0\n');
    assert.deepEqual(fs.readdirSync(ferr).filter((n) => n.startsWith('versao-anterior-')), []);
  } finally {
    try { fs.chmodSync(travada, 0o755); } catch {}
    fs.rmSync(base, { recursive: true, force: true });
  }
});

function criarZip(pasta, zip) {
  // bsdtar (Mac e Windows) cria zip com -a; sem ele, o zip do sistema
  const tar = spawnSync('tar', ['-a', '-cf', zip, '-C', path.dirname(pasta), path.basename(pasta)]);
  if (tar.status === 0 && fs.existsSync(zip) && fs.readFileSync(zip).subarray(0, 2).toString('latin1') === 'PK') return true;
  fs.rmSync(zip, { force: true });
  const z = spawnSync('zip', ['-qr', zip, path.basename(pasta)], { cwd: path.dirname(pasta) });
  return z.status === 0 && fs.existsSync(zip);
}

test('atualizarEstudio com zip local: confere SHA-256, só sobe de versão e acha a raiz dentro do zip', async (t) => {
  const base = temporaria('estudio-zip-');
  try {
    const raiz = path.join(base, 'estudio');
    montarEstudio(raiz, '1.0.0', { 'apresentacoes/x/brief.md': 'fica' });
    const pacote = path.join(base, 'pacote', 'view-estudio');
    montarEstudio(pacote, '1.0.1', { 'package.json': '{"name":"x","dependencies":{"y":"1"}}\n' });
    const zip = path.join(base, 'view-estudio.zip');
    if (!criarZip(pacote, zip)) {
      t.skip('sem ferramenta para criar zip nesta máquina');
      return;
    }
    const ferr = path.join(raiz, '.ferramentas');
    // sem .sha256 ao lado: recusa
    await assert.rejects(atualizarEstudio({ raiz, ferr, origem: zip }), (e) => e.codigo === 'ATUALIZACAO_ARQUIVO_DIFERENTE');
    fs.writeFileSync(`${zip}.sha256`, `${'0'.repeat(64)}  view-estudio.zip\n`);
    await assert.rejects(atualizarEstudio({ raiz, ferr, origem: zip }), (e) => e.codigo === 'ATUALIZACAO_ARQUIVO_DIFERENTE');
    const hash = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
    fs.writeFileSync(`${zip}.sha256`, `${hash}  view-estudio.zip\n`);
    const r = await atualizarEstudio({ raiz, ferr, origem: zip });
    assert.equal(r.atualizou, true);
    assert.equal(r.para, '1.0.1');
    assert.equal(r.dependencias, true);
    assert.equal(fs.readFileSync(path.join(raiz, 'apresentacoes', 'x', 'brief.md'), 'utf8'), 'fica');
    const de_novo = await atualizarEstudio({ raiz, ferr, origem: zip });
    assert.equal(de_novo.atualizou, false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('atualizarEstudio recusa endereço que não é o oficial', async () => {
  await assert.rejects(
    atualizarEstudio({ raiz: os.tmpdir(), ferr: os.tmpdir(), origem: 'https://example.com/view-estudio.zip' }),
    (e) => e.codigo === 'ATUALIZACAO_ENDERECO_ESTRANHO',
  );
});

test('acharRaizNova acha VERSAO até dois níveis abaixo', () => {
  const base = temporaria('estudio-raiz-');
  try {
    escrever(path.join(base, 'a', 'VERSAO'), '1');
    assert.equal(acharRaizNova(base), path.join(base, 'a'));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('servidor: link simbólico para fora da raiz é 403, inclusive o index.html de pasta; "..notas.css" é 200', async (t) => {
  const base = temporaria('estudio-srv-link-');
  const raiz = path.join(base, 'deck');
  const fora = path.join(base, 'fora');
  escrever(path.join(raiz, 'index.html'), '<p>raiz</p>');
  escrever(path.join(raiz, '..notas.css'), 'body{}');
  escrever(path.join(fora, 'segredo.txt'), 'segredo');
  escrever(path.join(fora, 'index.html'), '<p>fora</p>');
  escrever(path.join(raiz, 'dentro', 'x.txt'), 'x');
  let comLink = true;
  try {
    fs.symlinkSync(path.join(fora, 'segredo.txt'), path.join(raiz, 'segredo.txt'));
    fs.symlinkSync(fora, path.join(raiz, 'pasta'), process.platform === 'win32' ? 'junction' : undefined);
    fs.symlinkSync(path.join(fora, 'index.html'), path.join(raiz, 'dentro', 'index.html'));
    fs.symlinkSync(path.join(raiz, 'dentro', 'x.txt'), path.join(raiz, 'atalho-dentro.txt'));
  } catch {
    comLink = false;
  }
  const srv = await servir(raiz);
  try {
    const get = (p) => fetch(`${srv.origem}${p}`, { redirect: 'manual' });
    const notas = await get('/..notas.css');
    assert.equal(notas.status, 200);
    assert.equal(await notas.text(), 'body{}');
    if (!comLink) {
      t.diagnostic('esta máquina não deixa criar link simbólico: parte do link pulada');
      return;
    }
    assert.equal((await get('/segredo.txt')).status, 403);
    assert.equal((await get('/pasta/segredo.txt')).status, 403);
    assert.equal((await get('/pasta/')).status, 403);
    assert.equal((await get('/dentro/')).status, 403);
    const dentro = await get('/atalho-dentro.txt');
    assert.equal(dentro.status, 200);
    assert.equal(await dentro.text(), 'x');
  } finally {
    await srv.fechar();
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('servidor: arquivo apagado antes de abrir dá 404, quebra no meio corta só a resposta, e o servidor continua de pé', async () => {
  const raiz = temporaria('estudio-srv-some-');
  escrever(path.join(raiz, 'index.html'), '<p>raiz</p>');
  escrever(path.join(raiz, 'some.mp4'), '0123456789');
  escrever(path.join(raiz, 'trancado.mp4'), '0123456789');
  escrever(path.join(raiz, 'quebra.mp4'), '0123456789');
  // "some": apagado entre a conferência e a abertura. "trancado": existe mas não abre.
  // "quebra": abre e dá erro no meio da leitura.
  const abrirArquivo = (real) => {
    if (real.endsWith('some.mp4')) fs.rmSync(real, { force: true });
    if (real.endsWith('trancado.mp4')) throw Object.assign(new Error('sem permissão'), { code: 'EACCES' });
    return fs.openSync(real, 'r');
  };
  const criarLeitura = (fd, faixa) => {
    const fluxo = fs.createReadStream(null, { fd, ...faixa });
    if (fs.fstatSync(fd).size === 10 && faixa.start === undefined) setImmediate(() => fluxo.destroy(new Error('disco sumiu')));
    return fluxo;
  };
  const srv = await servir(raiz, { abrirArquivo, criarLeitura });
  try {
    const get = (p, init) => fetch(`${srv.origem}${p}`, init);
    assert.equal((await get('/some.mp4')).status, 404);
    assert.equal((await get('/trancado.mp4', { headers: { Range: 'bytes=0-3' } })).status, 500);
    await get('/quebra.mp4').then((r) => r.text()).catch(() => 'cortado');
    assert.equal(await (await get('/')).text(), '<p>raiz</p>');
  } finally {
    await srv.fechar();
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('servidor: lê pelo caminho real já conferido (aberto como arquivo), nunca pelo link do pedido', async (t) => {
  const raiz = temporaria('estudio-srv-real-');
  escrever(path.join(raiz, 'dentro', 'x.txt'), 'x');
  try {
    fs.symlinkSync(path.join(raiz, 'dentro', 'x.txt'), path.join(raiz, 'atalho.txt'));
  } catch {
    fs.rmSync(raiz, { recursive: true, force: true });
    t.skip('esta máquina não deixa criar link simbólico');
    return;
  }
  const abertos = [];
  const abrirArquivo = (real) => {
    abertos.push(real);
    return fs.openSync(real, 'r');
  };
  const srv = await servir(raiz, { abrirArquivo });
  try {
    const r = await fetch(`${srv.origem}/atalho.txt`);
    assert.equal(r.status, 200);
    assert.equal(await r.text(), 'x');
    assert.deepEqual(abertos, [fs.realpathSync(path.join(raiz, 'dentro', 'x.txt'))]);
  } finally {
    await srv.fechar();
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('servidor: redirecionamento de pasta codifica cada pedaço ("a#b" e "a?b" chegam inteiros)', async () => {
  const raiz = temporaria('estudio-srv-redir-');
  escrever(path.join(raiz, 'a#b', 'index.html'), '<p>cerquilha</p>');
  escrever(path.join(raiz, 'a?b', 'index.html'), '<p>interrogacao</p>');
  escrever(path.join(raiz, 'c d', 'e#f', 'index.html'), '<p>fundo</p>');
  const srv = await servir(raiz);
  try {
    const get = (p) => fetch(`${srv.origem}${p}`, { redirect: 'manual' });
    const casos = [
      ['/a%23b', '/a%23b/', '<p>cerquilha</p>'],
      ['/a%3Fb', '/a%3Fb/', '<p>interrogacao</p>'],
      ['/c%20d/e%23f', '/c%20d/e%23f/', '<p>fundo</p>'],
    ];
    for (const [pedido, destino, texto] of casos) {
      const r = await get(pedido);
      assert.equal(r.status, 301, pedido);
      assert.equal(r.headers.get('location'), destino);
      assert.equal(await (await get(destino)).text(), texto);
    }
  } finally {
    await srv.fechar();
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('servidor: rota virtual .json sai com tipo JSON', async () => {
  const raiz = temporaria('estudio-srv-json-');
  const srv = await servir(raiz, { virtuais: { '/__estudio.json': '{"pid":1}' } });
  try {
    const r = await fetch(`${srv.origem}/__estudio.json`);
    assert.equal(r.headers.get('content-type'), 'application/json; charset=utf-8');
    assert.deepEqual(await r.json(), { pid: 1 });
  } finally {
    await srv.fechar();
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('servidor: caractere de controle no caminho dá 400 e o servidor continua de pé', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-controle-'));
  fs.mkdirSync(path.join(dir, 'a'));
  fs.writeFileSync(path.join(dir, 'index.html'), 'oi');
  const srv = await servir(dir);
  const pedir = (caminho) => new Promise((ok) => {
    const q = http.request({ host: '127.0.0.1', port: srv.porta, path: caminho }, (r) => {
      r.resume();
      ok(r.statusCode);
    });
    q.on('error', (e) => ok(`erro ${e.code}`));
    q.end();
  });
  try {
    assert.equal(await pedir('/%0a/..'), 400);
    assert.equal(await pedir('/a%0d%0aX:%201'), 400);
    assert.equal(await pedir('/%00'), 400);
    assert.equal(await pedir('/'), 200);
  } finally {
    await srv.fechar();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

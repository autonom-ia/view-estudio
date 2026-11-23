// Sessão que não deixa nada para trás quando falha, "abrir" que reaproveita só o servidor certo
// (um por apresentação, mesmo com dois pedidos ao mesmo tempo) e marca que entra no deck sem as notas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { abrirSessao } from '../scripts/lib/sessao.mjs';
import { servir, ROTA_IDENTIDADE } from '../scripts/lib/servidor.mjs';
import { copiarMarca } from '../scripts/lib/marca.mjs';
import { pegarTrava } from '../scripts/comandos/abrir.mjs';
import { openTab } from '../scripts/lib/cdp.mjs';
import net from 'node:net';
import http from 'node:http';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESPACHANTE = path.join(RAIZ, 'kit', 'scripts', 'estudio.mjs');
const temporaria = (prefixo) => fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
const escrever = (arq, texto) => {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, texto);
};

test('abrirSessao: falha depois de abrir o navegador fecha aba, navegador e servidor antes de subir o erro', async () => {
  for (const ondeFalha of ['openTab', 'send']) {
    const fechados = [];
    const pecas = {
      servir: async () => ({ origem: 'http://127.0.0.1:1', fechar: async () => { fechados.push('servidor'); } }),
      launch: async () => ({ porta: 1, close: () => { fechados.push('navegador'); } }),
      openTab: async () => {
        if (ondeFalha === 'openTab') throw new Error('aba não abriu');
        return {
          send: async () => { throw new Error('aba caiu'); },
          close: () => { fechados.push('aba'); },
          on: () => {},
        };
      },
    };
    await assert.rejects(abrirSessao('/nao-importa', {}, pecas), (e) => e.message.startsWith('aba'));
    const esperado = ondeFalha === 'openTab' ? ['navegador', 'servidor'] : ['aba', 'navegador', 'servidor'];
    assert.deepEqual(fechados, esperado, ondeFalha);
  }
});

function rodarEstudio(args, env) {
  return new Promise((resolver) => {
    const filho = spawn(process.execPath, [DESPACHANTE, ...args], { env: { ...process.env, ESTUDIO_NAO_ABRIR: '1', ...env } });
    let saida = '';
    filho.stdout.on('data', (d) => { saida += d; });
    filho.on('close', (codigo) => {
      const linhas = saida.trim().split('\n');
      resolver({ codigo, json: JSON.parse(linhas[linhas.length - 1]) });
    });
  });
}

function matar(pid) {
  try {
    process.kill(pid);
  } catch {}
}

function montarApresentacao(base, nome) {
  const apresentacoes = path.join(base, 'apresentacoes');
  escrever(path.join(apresentacoes, nome, 'deck', 'index.html'), `<p>${nome}</p>`);
  return apresentacoes;
}

test('abrir: dois pedidos ao mesmo tempo dão a mesma porta e um servidor só', async () => {
  const base = temporaria('estudio-abrir-');
  const ferr = path.join(base, '.ferramentas');
  const env = { ESTUDIO_APRESENTACOES: montarApresentacao(base, 'dupla'), ESTUDIO_FERRAMENTAS: ferr };
  const estado = path.join(ferr, 'servidores', 'dupla.json');
  let pid = null;
  try {
    const [a, b] = await Promise.all([
      rodarEstudio(['abrir', 'dupla', '--sem-navegador'], env),
      rodarEstudio(['abrir', 'dupla', '--sem-navegador'], env),
    ]);
    assert.equal(a.json.codigo, 'DECK_ABERTO', JSON.stringify(a.json));
    assert.equal(b.json.codigo, 'DECK_ABERTO', JSON.stringify(b.json));
    assert.equal(a.json.dados.porta, b.json.dados.porta);
    pid = JSON.parse(fs.readFileSync(estado, 'utf8')).pid;
    const quem = await (await fetch(`http://127.0.0.1:${a.json.dados.porta}${ROTA_IDENTIDADE}`)).json();
    assert.equal(quem.pid, pid);
    assert.equal(fs.existsSync(`${estado}.trava`), false);
    if (process.platform !== 'win32') {
      const ps = spawnSync('ps', ['-ax', '-o', 'pid=,command='], { encoding: 'utf8' });
      const servidores = ps.stdout.split('\n').filter((l) => l.includes('servidor-sozinho.mjs') && l.includes(estado));
      assert.equal(servidores.length, 1, servidores.join('\n'));
    }
    // um terceiro "abrir" reaproveita o mesmo
    const c = await rodarEstudio(['abrir', 'dupla', '--sem-navegador'], env);
    assert.equal(c.json.dados.porta, a.json.dados.porta);
  } finally {
    if (pid) matar(pid);
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('abrir: não reaproveita porta de servidor de outra pasta (nem de programa que não é o estúdio)', async () => {
  const base = temporaria('estudio-abrir-outro-');
  const ferr = path.join(base, '.ferramentas');
  const env = { ESTUDIO_APRESENTACOES: montarApresentacao(base, 'certa'), ESTUDIO_FERRAMENTAS: ferr };
  const estado = path.join(ferr, 'servidores', 'certa.json');
  const outraPasta = path.join(base, 'outra');
  escrever(path.join(outraPasta, 'index.html'), '<p>outra</p>');
  const intruso = await servir(outraPasta, { virtuais: { [ROTA_IDENTIDADE]: JSON.stringify({ pid: 1, pasta: outraPasta }) } });
  let pid = null;
  try {
    escrever(estado, JSON.stringify({ porta: intruso.porta, pid: 1, pasta: outraPasta }));
    const r = await rodarEstudio(['abrir', 'certa', '--sem-navegador'], env);
    assert.equal(r.json.codigo, 'DECK_ABERTO', JSON.stringify(r.json));
    assert.notEqual(r.json.dados.porta, intruso.porta);
    pid = JSON.parse(fs.readFileSync(estado, 'utf8')).pid;
    assert.equal(await (await fetch(`${r.json.dados.endereco}`)).text(), '<p>certa</p>');
  } finally {
    if (pid) matar(pid);
    await intruso.fechar();
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('copiarMarca leva tokens.css, logo e fontes com licença; marca.md, notas e rascunhos ficam', () => {
  const base = temporaria('estudio-marca-');
  try {
    const marca = path.join(base, 'minha-marca');
    escrever(path.join(marca, 'tokens.css'), ':root{}');
    escrever(path.join(marca, 'marca.md'), 'tom interno');
    escrever(path.join(marca, 'notas.txt'), 'nota');
    escrever(path.join(marca, 'LEIA-ME.txt'), 'leia');
    escrever(path.join(marca, 'logo.svg'), '<svg/>');
    escrever(path.join(marca, 'logo-original.ai'), 'x');
    escrever(path.join(marca, 'rascunhos', 'a.png'), 'x');
    escrever(path.join(marca, 'fontes', 'Marca.woff2'), 'f');
    escrever(path.join(marca, 'fontes', 'OFL-Marca.txt'), 'licença');
    escrever(path.join(marca, 'fontes', 'fonte-paga.psd'), 'x');
    const destino = path.join(base, 'deck', 'assets', 'marca');
    const r = copiarMarca(marca, destino);
    assert.deepEqual(r.copiados.sort(), ['fontes/Marca.woff2', 'fontes/OFL-Marca.txt', 'logo.svg', 'tokens.css']);
    assert.deepEqual(r.deixados.sort(), ['LEIA-ME.txt', 'fontes/fonte-paga.psd', 'logo-original.ai', 'marca.md', 'notas.txt', 'rascunhos/']);
    assert.equal(fs.existsSync(path.join(destino, 'marca.md')), false);
    assert.equal(fs.existsSync(path.join(destino, 'notas.txt')), false);
    assert.equal(fs.readFileSync(path.join(destino, 'tokens.css'), 'utf8'), ':root{}');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('nova: o deck recebe só a marca que a tela usa e o JSON diz o que ficou de fora', async () => {
  const base = temporaria('estudio-nova-marca-');
  try {
    const marca = path.join(base, 'minha-marca');
    escrever(path.join(marca, 'tokens.css'), ':root{}');
    escrever(path.join(marca, 'marca.md'), 'tom interno');
    escrever(path.join(marca, 'logo.png'), 'png');
    const env = { ESTUDIO_APRESENTACOES: path.join(base, 'apresentacoes'), ESTUDIO_MARCA: marca, ESTUDIO_FERRAMENTAS: path.join(base, '.ferramentas') };
    const r = await rodarEstudio(['nova', 'com-marca'], env);
    assert.equal(r.json.codigo, 'APRESENTACAO_CRIADA', JSON.stringify(r.json));
    assert.equal(r.json.dados.marca, 'minha-marca');
    assert.deepEqual(r.json.dados.marca_copiada.sort(), ['logo.png', 'tokens.css']);
    assert.deepEqual(r.json.dados.marca_fora_do_deck, ['marca.md']);
    const noDeck = path.join(base, 'apresentacoes', 'com-marca', 'deck', 'assets', 'marca');
    assert.equal(fs.existsSync(path.join(noDeck, 'marca.md')), false);
    assert.equal(fs.existsSync(path.join(noDeck, 'tokens.css')), true);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

// pid de um processo que já terminou (não existe mais)
const pidMorto = () => spawnSync(process.execPath, ['-e', '']).pid;
// processo vivo e parado, para ser "o outro dono" da trava
const processoVivo = () => spawn(process.execPath, ['-e', 'setTimeout(() => {}, 60000)'], { stdio: 'ignore' });

test('abrir: trava de pid morto é tomada na hora; de pid vivo nunca é tomada por idade', async () => {
  const base = temporaria('estudio-trava-abrir-');
  const arquivo = path.join(base, 'deck.json.trava');
  const outro = processoVivo();
  try {
    fs.writeFileSync(arquivo, JSON.stringify({ pid: pidMorto() }));
    const soltar = await pegarTrava(arquivo, { esperaMs: 2000 });
    assert.equal(JSON.parse(fs.readFileSync(arquivo, 'utf8')).pid, process.pid);
    soltar();
    assert.equal(fs.existsSync(arquivo), false);

    // trava de um processo vivo, "velha" de uma hora: continua dele
    fs.writeFileSync(arquivo, JSON.stringify({ pid: outro.pid }));
    const umaHoraAtras = new Date(Date.now() - 60 * 60 * 1000);
    fs.utimesSync(arquivo, umaHoraAtras, umaHoraAtras);
    await assert.rejects(pegarTrava(arquivo, { esperaMs: 300 }), (e) => e.codigo === 'SERVIDOR_NAO_SUBIU');
    assert.equal(JSON.parse(fs.readFileSync(arquivo, 'utf8')).pid, outro.pid);
  } finally {
    outro.kill();
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('abrir: soltar a trava não apaga a trava que agora é de outro processo', async () => {
  const base = temporaria('estudio-trava-soltar-');
  const arquivo = path.join(base, 'deck.json.trava');
  const outro = processoVivo();
  try {
    const soltar = await pegarTrava(arquivo, { esperaMs: 1000 });
    // outro processo tomou a vez (por exemplo, achou a nossa abandonada)
    fs.writeFileSync(arquivo, JSON.stringify({ pid: outro.pid }));
    soltar();
    assert.equal(JSON.parse(fs.readFileSync(arquivo, 'utf8')).pid, outro.pid);
  } finally {
    outro.kill();
    fs.rmSync(base, { recursive: true, force: true });
  }
});

// Um "DevTools" de mentira: /json/new parado (nunca responde) ou devolvendo um WebSocket que
// aceita a conexão e nunca completa o aperto de mão.
async function devtoolsMudo(modo) {
  const sockets = new Set();
  const tcp = net.createServer((s) => {
    sockets.add(s);
    s.on('close', () => sockets.delete(s));
  });
  await new Promise((r) => tcp.listen(0, '127.0.0.1', r));
  const fechados = [];
  tcp.on('connection', (s) => s.on('close', () => fechados.push(true)));
  const srv = http.createServer((req, res) => {
    if (modo === 'parado') return; // segura o pedido para sempre
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:${tcp.address().port}/devtools/page/1` }));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return {
    porta: srv.address().port,
    fechados,
    fechar: async () => {
      for (const s of sockets) s.destroy();
      srv.closeAllConnections();
      await new Promise((r) => srv.close(r));
      await new Promise((r) => tcp.close(r));
    },
  };
}

test('openTab: /json/new que não responde vira CHROME_NAO_ABRIU dentro do prazo', async () => {
  const falso = await devtoolsMudo('parado');
  try {
    const inicio = Date.now();
    await assert.rejects(openTab(falso.porta, { prazoMs: 300 }), (e) => e.codigo === 'CHROME_NAO_ABRIU');
    assert.ok(Date.now() - inicio < 3000, `demorou ${Date.now() - inicio} ms`);
  } finally {
    await falso.fechar();
  }
});

test('openTab: WebSocket que não abre vira CHROME_NAO_ABRIU e o socket é fechado', async () => {
  const falso = await devtoolsMudo('ws-mudo');
  try {
    const inicio = Date.now();
    await assert.rejects(openTab(falso.porta, { prazoMs: 300 }), (e) => e.codigo === 'CHROME_NAO_ABRIU');
    assert.ok(Date.now() - inicio < 3000, `demorou ${Date.now() - inicio} ms`);
    for (let k = 0; k < 20 && !falso.fechados.length; k += 1) await new Promise((r) => setTimeout(r, 50));
    assert.equal(falso.fechados.length, 1);
  } finally {
    await falso.fechar();
  }
});

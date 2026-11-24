// Ponta a ponta no Chrome: nova → checar → prints → pdf → teleprompter (com sincronia de verdade,
// animado e com movimento reduzido) → abrir; e um deck estragado de propósito que o checar precisa
// reprovar. Cada teste cria o próprio deck. Pula se não houver navegador. Com o estúdio instalado,
// usa o chrome-headless-shell de versão fixa de .ferramentas (lib/chrome.mjs).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { opcoesDoNavegador } from './fixtures/navegador.mjs';
import { abrirSessao } from '../scripts/lib/sessao.mjs';
import { openTab, navegar, esperar } from '../scripts/lib/cdp.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESPACHANTE = path.join(RAIZ, 'kit', 'scripts', 'estudio.mjs');
const opcoes = opcoesDoNavegador(240000);

let base;
let env;
function estudio(...args) {
  const r = spawnSync(process.execPath, [DESPACHANTE, ...args], { encoding: 'utf8', env, timeout: 200000 });
  const linhas = (r.stdout || '').trim().split('\n');
  let json = null;
  try {
    json = JSON.parse(linhas[linhas.length - 1]);
  } catch {}
  return { codigo: r.status, json, stderr: r.stderr };
}

before(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-nav-'));
  env = { ...process.env, ESTUDIO_APRESENTACOES: base, ESTUDIO_MARCA: path.join(base, 'sem-marca'), ESTUDIO_NAO_ABRIR: '1' };
});
after(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

test('molde passa no checar, vira prints por beat, PDF 16:9 e teleprompter', opcoes, () => {
  assert.equal(estudio('nova', 'ponta').codigo, 0);
  const chk = estudio('checar', 'ponta');
  assert.equal(chk.codigo, 0, JSON.stringify(chk.json && chk.json.dados.vermelhos));
  assert.equal(chk.json.dados.red, 0);
  assert.equal(chk.json.dados.telas, 3);
  assert.equal(chk.json.dados.beats, 9);
  assert.deepEqual(chk.json.dados.por_tela.map((t) => t.beats), [2, 3, 4]);

  const pr = estudio('prints', 'ponta');
  assert.equal(pr.codigo, 0);
  assert.equal(pr.json.dados.total, 9);
  assert.deepEqual(pr.json.avisos, []);
  const pasta = path.join(base, 'ponta', 'prints');
  const jpgs = fs.readdirSync(pasta).filter((n) => n.endsWith('.jpg')).sort();
  assert.deepEqual(jpgs.slice(0, 2), ['s01-capa-b0.jpg', 's01-capa-b1.jpg']);
  for (const j of jpgs) {
    const b = fs.readFileSync(path.join(pasta, j));
    assert.ok(b[0] === 0xff && b[1] === 0xd8 && b.length > 20000, `${j} não parece um JPEG com conteúdo`);
  }

  const pdf = estudio('pdf', 'ponta');
  assert.equal(pdf.codigo, 0, JSON.stringify(pdf.json));
  assert.equal(pdf.json.dados.paginas, 3);
  const bytes = fs.readFileSync(path.join(base, 'ponta', 'ponta.pdf')).toString('latin1');
  assert.equal(bytes.split('/MediaBox [0 0 1440 810]').length - 1, 3);

  const tp = estudio('teleprompter', 'ponta');
  assert.equal(tp.codigo, 0);
  assert.equal(tp.json.dados.beats, 9);
});

// Deck + teleprompter em duas abas do mesmo navegador. Cada teste cria o próprio deck.
// Foco emulado nas duas abas: aba de fundo não é estrangulada (senão o palco espera o teto de cada troca).
async function seguirDeck(nome, { reduzido = false } = {}) {
  assert.equal(estudio('nova', nome).codigo, 0);
  assert.equal(estudio('teleprompter', nome).codigo, 0);
  const deck = path.join(base, nome, 'deck');
  const sessao = await abrirSessao(deck);
  try {
    await sessao.tab.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    if (reduzido) await sessao.tab.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    await sessao.ir(sessao.url('index.html'));
    const prontoPalco = `(async () => { for (let k = 0; k < 100; k += 1) { if (window.__palco && window.__palco.atual() >= 0 && !window.__palco.ocupado()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()`;
    assert.equal(await sessao.tab.evaluate(prontoPalco), true);
    const tp = await openTab(sessao.portaDevtools);
    await tp.send('Page.enable');
    await tp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await navegar(tp, sessao.url('teleprompter.html'));
    const esperarIndice = async (alvo) => {
      for (let k = 0; k < 80; k += 1) {
        const i = await tp.evaluate('window.__teleprompter.atual()');
        if (i === alvo) return i;
        await esperar(100);
      }
      return tp.evaluate('window.__teleprompter.atual()');
    };
    const slide = 'window.__palco.frente().contentWindow';
    const estadoDaTela = () => sessao.tab.evaluate(`(() => { const w = ${slide}; const el = w.document.querySelector('[data-beat="1"]:not([data-entra="risca"]):not([data-entra="revela"])');
      return { ...w.__slide.state(), beat1: w.getComputedStyle(el).visibility }; })()`);
    // o hello do teleprompter faz o palco reemitir a posição atual (tela 1, beat 0)
    assert.equal(await esperarIndice(0), 0);
    const antes = await estadoDaTela();
    assert.equal(antes.beat, 0, JSON.stringify(antes));
    assert.equal(antes.reduzido, reduzido);
    assert.equal(antes.beat1, 'hidden', 'o beat 1 não pode abrir já na tela');
    await sessao.tab.send('Page.bringToFront');
    await sessao.tab.evaluate(`${slide}.__slide.advance()`);
    assert.equal(await esperarIndice(1), 1);
    // animado, o elemento entra durante a animação; reduzido, entra na hora (corte seco)
    let depois = await estadoDaTela();
    for (let k = 0; !reduzido && k < 30 && depois.beat1 !== 'visible'; k += 1) {
      await esperar(100);
      depois = await estadoDaTela();
    }
    assert.equal(depois.beat, 1, JSON.stringify(depois));
    assert.equal(depois.beat1, 'visible');
    await sessao.tab.evaluate('window.__palco.proximo()');
    const troca = await esperarIndice(2);
    const estado = await sessao.tab.evaluate('({ atual: window.__palco.atual(), ocupado: window.__palco.ocupado() })');
    assert.equal(troca, 2, JSON.stringify(estado));
    tp.close();
  } finally {
    await sessao.fechar();
  }
}

test('teleprompter segue o deck (tela e beat) pelo canal estudio-roteiro', opcoes, async () => {
  await seguirDeck('segue');
});

test('movimento reduzido tira a animação, não a sequência: beat a beat, com o teleprompter junto', opcoes, async () => {
  await seguirDeck('reduzido', { reduzido: true });
});

test('abrir sobe o servidor do deck e devolve os endereços', opcoes, async () => {
  assert.equal(estudio('nova', 'aberto').codigo, 0);
  assert.equal(estudio('teleprompter', 'aberto').codigo, 0);
  const r = estudio('abrir', '--sem-navegador', 'aberto');
  assert.equal(r.codigo, 0, JSON.stringify(r.json));
  const resp = await fetch(r.json.dados.endereco);
  assert.equal(resp.status, 200);
  assert.ok(r.json.dados.teleprompter);
  const estado = path.join(RAIZ, '.ferramentas', 'servidores', 'aberto.json');
  const { pid } = JSON.parse(fs.readFileSync(estado, 'utf8'));
  process.kill(pid);
  fs.rmSync(estado, { force: true });
});

test('checar reprova deck com CDN, <select>, texto pequeno, colisão, imagem ausente e fonte não declarada', opcoes, () => {
  assert.equal(estudio('nova', 'estragado').codigo, 0);
  const arq = path.join(base, 'estragado', 'deck', 'slides', 's02-numero.html');
  let html = fs.readFileSync(arq, 'utf8');
  const estrago = [
    '<script src="https://cdn.exemplo.invalid/lib.js"></script>',
    '<select aria-label="x"><option>a</option></select>',
    '<p style="position:absolute;left:130px;top:640px;font-size:12px" data-beat="1">letra miúda</p>',
    '<p style="position:absolute;left:140px;top:620px;font-size:40px" data-beat="1">texto por cima da leitura</p>',
    '<img src="../assets/nao-existe.png" alt="">',
    '<p style="position:absolute;left:1200px;top:900px;font-size:30px;font-family:\'Fonte Inexistente\'">fonte fantasma</p>',
  ].join('\n');
  html = html.replace('<div class="palco-tela">', `<div class="palco-tela">\n${estrago}`);
  fs.writeFileSync(arq, html);
  const r = estudio('checar', 'estragado');
  assert.equal(r.codigo, 2, JSON.stringify(r.json));
  assert.equal(r.json.codigo, 'CHECAGEM_REPROVADA');
  const tipos = new Set(r.json.dados.vermelhos.map((v) => v.tipo));
  for (const t of ['endereco-externo', 'select-nativo', 'texto-pequeno', 'colisao', 'arquivo-quebrado', 'fonte-nao-declarada']) {
    assert.ok(tipos.has(t), `faltou ${t}: ${JSON.stringify([...tipos])}`);
  }
  const pequeno = r.json.dados.vermelhos.find((v) => v.tipo === 'texto-pequeno');
  assert.equal(pequeno.beat, 1);
});

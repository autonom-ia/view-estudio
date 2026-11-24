// Contraste no checar: a conta da WCAG sobre a foto do fundo (sem navegador) e, no Chrome, uma tela
// que reprova (texto claro sobre degradê claro, texto branco sobre foto clara) e o que não pode virar
// alarme: letra grande e escura (prova que a foto sai sem a letra), texto recuado de propósito e
// texto decorativo com aria-hidden. Pula a parte do navegador se não houver Chrome.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { opcoesDoNavegador } from './fixtures/navegador.mjs';
import { razao, medirNaFoto, anotarContraste, minimoPara, MINIMO_NORMAL, MINIMO_GRANDE } from '../scripts/lib/contraste.mjs';

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
  return { codigo: r.status, json };
}

before(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-contraste-'));
  env = { ...process.env, ESTUDIO_APRESENTACOES: base, ESTUDIO_MARCA: path.join(base, 'sem-marca'), ESTUDIO_NAO_ABRIR: '1' };
});
after(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

// Imagem de mentira {w, h, px}: metade de cima de uma cor, metade de baixo de outra.
function imagem(w, h, cima, baixo) {
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const c = y < h / 2 ? cima : baixo;
      px.set([c[0], c[1], c[2], 255], (y * w + x) * 4);
    }
  }
  return { w, h, px };
}

test('contraste: razão da WCAG, mínimo por tamanho e a parte mais fraca do fundo', () => {
  assert.equal(Math.round(razao({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 }) * 100) / 100, 21);
  assert.equal(Math.round(razao({ r: 118, g: 118, b: 118 }, { r: 255, g: 255, b: 255 }) * 100) / 100, 4.54);
  assert.equal(minimoPara(18, 400), MINIMO_NORMAL);
  assert.equal(minimoPara(20, 700), MINIMO_GRANDE);
  assert.equal(minimoPara(24, 400), MINIMO_GRANDE);
  // texto preto: fundo todo branco passa; metade preta atrás dele reprova (a parte fraca manda)
  const preto = { cor: { r: 0, g: 0, b: 0, a: 1 }, op: 1, caixas: [{ x: 0, y: 0, w: 40, h: 40 }], px: 20, peso: 400, nome: 'p' };
  const branco = medirNaFoto(imagem(40, 40, [255, 255, 255], [255, 255, 255]), preto, 1);
  assert.ok(branco.razao > 20);
  const metade = medirNaFoto(imagem(40, 40, [255, 255, 255], [10, 10, 10]), preto, 1);
  assert.ok(metade.razao < 1.2, JSON.stringify(metade));
  // opacidade entra na conta: preto a 30% sobre branco não passa
  const fraco = medirNaFoto(imagem(40, 40, [255, 255, 255], [255, 255, 255]), { ...preto, op: 0.3 }, 1);
  assert.ok(fraco.razao < MINIMO_NORMAL);
  // foto menor que a tela: as caixas são lidas na escala da foto; caixa fora da foto não mede
  assert.ok(medirNaFoto(imagem(20, 20, [255, 255, 255], [255, 255, 255]), preto, 0.5).razao > 20);
  assert.equal(medirNaFoto(imagem(20, 20, [0, 0, 0], [0, 0, 0]), { ...preto, caixas: [{ x: 100, y: 100, w: 10, h: 10 }] }, 1), null);
  const red = [];
  const warn = [];
  anotarContraste(preto, metade, red, warn);
  anotarContraste({ ...preto, px: 40 }, { razao: 3.5, minimo: MINIMO_GRANDE, fundo: '#000000', texto: '#555555' }, red, warn);
  assert.deepEqual(red.map((v) => v.tipo), ['contraste']);
  assert.deepEqual(warn.map((v) => v.tipo), ['contraste-justo']);
  assert.ok(red[0].detalhe.startsWith('1.'), red[0].detalhe);
});

// PNG de uma cor só (o navegador desenha), sem biblioteca.
function png(w, h, [r, g, b]) {
  const pedaco = (tipo, dados) => {
    const t = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(t) >>> 0);
    return Buffer.concat([tam, t, crc]);
  };
  const cab = Buffer.alloc(13);
  cab.writeUInt32BE(w, 0);
  cab.writeUInt32BE(h, 4);
  cab[8] = 8;
  cab[9] = 2;
  const linha = Buffer.alloc(1 + w * 3);
  for (let x = 0; x < w; x += 1) linha.set([r, g, b], 1 + x * 3);
  const cru = Buffer.concat(Array.from({ length: h }, () => linha));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pedaco('IHDR', cab), pedaco('IDAT', zlib.deflateSync(cru)), pedaco('IEND', Buffer.alloc(0))]);
}

const TELA = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Contraste</title>
<link rel="stylesheet" href="../assets/marca/tokens.css">
<link rel="stylesheet" href="../assets/vendor/palco/tela.css">
<style>
.palco-tela{background:linear-gradient(90deg,#ffffff 0%,#f2f2f2 100%);font-family:Arial,sans-serif}
.forte{position:absolute;left:100px;top:80px;font-size:160px;font-weight:900;color:#111;line-height:1}
.fraco{position:absolute;left:100px;top:320px;font-size:30px;color:#c4c4c4}
.foto{position:absolute;left:1000px;top:300px;width:800px;height:300px;background:url(../assets/clara.png) center/cover}
.sobre-foto{position:absolute;left:1040px;top:400px;font-size:40px;color:#ffffff}
.recua{position:absolute;left:100px;top:520px;font-size:40px;color:#222}
.marca-dagua{position:absolute;left:100px;top:700px;font-size:220px;font-weight:900;color:#000;opacity:.06}
</style>
</head>
<body>
<div class="palco-tela">
  <p class="forte" data-beat="0">Letra preta</p>
  <p class="fraco" data-beat="1">cinza claro sobre fundo claro</p>
  <div class="foto"></div>
  <p class="sobre-foto" data-beat="1">branco sobre foto clara</p>
  <p class="recua" data-beat="0" data-recua="1">fala de antes, agora recuada</p>
  <p class="marca-dagua" aria-hidden="true">AURORA</p>
</div>
<script src="../assets/vendor/gsap/gsap.min.js"></script>
<script src="../assets/vendor/palco/cena.js"></script>
</body>
</html>
`;

test('contraste no Chrome: reprova o fraco no fundo de verdade e não acusa letra escura, recuo nem marca d\'água', opcoes, () => {
  assert.equal(estudio('nova', 'contraste').codigo, 0);
  const deck = path.join(base, 'contraste', 'deck');
  fs.writeFileSync(path.join(deck, 'slides', 's04-contraste.html'), TELA);
  fs.writeFileSync(path.join(deck, 'assets', 'clara.png'), png(64, 32, [235, 235, 225]));
  const index = path.join(deck, 'index.html');
  const secao = '<section class="slide" id="t04"><iframe data-src="slides/s04-contraste.html"></iframe></section>';
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('  </div>\n</div>', `    ${secao}\n  </div>\n</div>`));
  const r = estudio('checar', 'contraste');
  assert.equal(r.codigo, 2, JSON.stringify(r.json));
  const da4 = r.json.dados.vermelhos.filter((v) => v.tela === 's04-contraste.html');
  const contraste = da4.filter((v) => v.tipo === 'contraste');
  const nomes = contraste.map((v) => `${v.beat}:${v.detalhe.split('"')[1]}`).sort();
  assert.deepEqual(nomes, ['1:branco sobre foto clara', '1:cinza claro sobre fundo claro'], JSON.stringify(da4));
  for (const v of contraste) assert.ok(Number(v.detalhe.split(':')[0]) < 2, v.detalhe);
  // as telas do molde continuam passando: contraste só aparece na tela nova
  assert.deepEqual(r.json.dados.vermelhos.filter((v) => v.tela !== 's04-contraste.html'), []);
  assert.ok(r.json.dados.contraste_medido > 20);
  // o que fica fora da medida de propósito é dito, com motivo e contagem
  const fora = r.json.dados.amarelos.filter((w) => w.tela === 's04-contraste.html' && w.tipo === 'contraste-fora-da-medida');
  assert.deepEqual(fora.map((w) => `${w.beat}:${w.detalhe}`), [
    '0:1 texto decorativo (aria-hidden) fora da medida de contraste',
    '1:1 texto decorativo (aria-hidden) e 1 texto recuado de propósito (data-recua) fora da medida de contraste',
  ]);
});

// Tela com texto que escurece no clique por transição de CSS (5 s), texto de SVG claro (reprova) e
// texto de SVG escuro e grosso (passa só se a foto do fundo sair sem a letra do SVG).
const TELA_TRANSICAO = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>Transição</title>
<link rel="stylesheet" href="../assets/marca/tokens.css">
<link rel="stylesheet" href="../assets/vendor/palco/tela.css">
<style>
.palco-tela{background:#ffffff;font-family:Arial,sans-serif}
.muda{position:absolute;left:100px;top:100px;font-size:30px;color:#e8e8e8;transition:color 5s linear}
.muda.escuro{color:#111111}
.svg{position:absolute;left:100px;top:400px}
</style>
</head>
<body>
<div class="palco-tela">
  <p class="muda">texto que escurece no clique</p>
  <p data-beat="1" style="position:absolute;left:100px;top:250px;font-size:30px;color:#111">segundo clique</p>
  <svg class="svg" width="900" height="120" viewBox="0 0 900 120"><text x="0" y="80" font-size="48" fill="#e6e6e6">svg claro no fundo branco</text></svg>
  <svg style="position:absolute;left:100px;top:600px" width="1200" height="200" viewBox="0 0 1200 200"><text x="0" y="150" font-size="160" font-weight="900" fill="#111">SVG ESCURO</text></svg>
</div>
<script>
window.CENA = {
  beats: { 1: () => document.querySelector('.muda').classList.add('escuro') },
  assentar: (n) => document.querySelector('.muda').classList.toggle('escuro', n >= 1),
};
</script>
<script src="../assets/vendor/gsap/gsap.min.js"></script>
<script src="../assets/vendor/palco/cena.js"></script>
</body>
</html>
`;

// 61 textos escuros em fundo claro: passa do teto de 60 por clique.
function telaComMuitos(n) {
  const ps = [];
  for (let k = 0; k < n; k += 1) {
    ps.push(`<p style="position:absolute;left:${60 + (k % 4) * 460}px;top:${40 + Math.floor(k / 4) * 62}px;font-size:20px;color:#111">item ${String.fromCharCode(97 + (k % 26))}${k}</p>`);
  }
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Muitos</title>
<link rel="stylesheet" href="../assets/marca/tokens.css"><link rel="stylesheet" href="../assets/vendor/palco/tela.css">
<style>.palco-tela{background:#fff;font-family:Arial,sans-serif}</style></head><body><div class="palco-tela">
${ps.join('\n')}
</div><script src="../assets/vendor/gsap/gsap.min.js"></script><script src="../assets/vendor/palco/cena.js"></script></body></html>`;
}

test('contraste no Chrome: transição de cor termina antes da medida, texto de SVG é medido pelo fill, teto avisado', opcoes, () => {
  assert.equal(estudio('nova', 'transicao').codigo, 0);
  const deck = path.join(base, 'transicao', 'deck');
  fs.writeFileSync(path.join(deck, 'slides', 's04-transicao.html'), TELA_TRANSICAO);
  fs.writeFileSync(path.join(deck, 'slides', 's05-muitos.html'), telaComMuitos(61));
  const index = path.join(deck, 'index.html');
  const secoes = ['s04-transicao', 's05-muitos'].map((n, k) => `    <section class="slide" id="t0${k + 4}"><iframe data-src="slides/${n}.html"></iframe></section>`).join('\n');
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('  </div>\n</div>', `${secoes}\n  </div>\n</div>`));
  const r = estudio('checar', 'transicao');
  const contraste = r.json.dados.vermelhos.filter((v) => v.tipo === 'contraste').map((v) => `${v.tela}|${v.beat}|${v.detalhe.split('"')[1]}`).sort();
  // beat 0: o texto claro reprova (é a cor dele); beat 1: já escureceu (a transição terminou)
  assert.deepEqual(contraste, [
    's04-transicao.html|0|svg claro no fundo branco',
    's04-transicao.html|0|texto que escurece no clique',
    's04-transicao.html|1|svg claro no fundo branco',
  ], JSON.stringify(r.json.dados.vermelhos));
  const teto = r.json.dados.amarelos.filter((w) => w.tela === 's05-muitos.html' && w.tipo === 'contraste-nao-medido');
  assert.equal(teto.length, 1, JSON.stringify(r.json.dados.amarelos));
  assert.ok(teto[0].detalhe.startsWith('61 textos') && teto[0].detalhe.includes('1 sem medir'), teto[0].detalhe);
});

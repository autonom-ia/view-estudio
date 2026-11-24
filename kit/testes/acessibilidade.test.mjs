// Acessibilidade com o axe-core (versão fixa em kit/vendor/axe/, com licença e crédito): o molde
// passa; uma imagem sem texto alternativo que só existe no beat do meio reprova (por isso a conferência
// é por beat); uma tela sem idioma reprova; as regras de página que não cabem numa tela ficam
// desligadas com motivo. Pula a parte do navegador se não houver Chrome.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acharNavegador } from '../scripts/lib/chrome.mjs';
import { DESLIGADAS, versaoDoAxe, rodarAxe } from '../scripts/comandos/acessibilidade.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT = path.join(RAIZ, 'kit');
const DESPACHANTE = path.join(KIT, 'scripts', 'estudio.mjs');
const opcoes = { skip: acharNavegador() ? false : 'sem Chrome, Edge ou Chromium nesta máquina', timeout: 240000 };

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
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-acessibilidade-'));
  env = { ...process.env, ESTUDIO_APRESENTACOES: base, ESTUDIO_MARCA: path.join(base, 'sem-marca'), ESTUDIO_NAO_ABRIR: '1' };
});
after(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

test('axe: versão fixa no cabeçalho do arquivo, licença ao lado e crédito em CREDITOS.md', () => {
  const versao = versaoDoAxe();
  assert.ok(versao && versao.split('.').length === 3, String(versao));
  const cabeca = fs.readFileSync(path.join(KIT, 'vendor', 'axe', 'axe.min.js'), 'utf8').slice(0, 200);
  assert.ok(cabeca.includes(`axe v${versao}`), `axe.min.js não é a versão ${versao}`);
  assert.ok(fs.readFileSync(path.join(KIT, 'vendor', 'axe', 'LICENSE'), 'utf8').includes('Mozilla Public License'));
  const creditos = fs.readFileSync(path.join(RAIZ, 'CREDITOS.md'), 'utf8');
  assert.ok(creditos.includes(`axe-core ${versao}`) && creditos.includes('MPL-2.0'), 'CREDITOS.md sem o axe-core');
});

test('axe: cada regra desligada tem motivo, e o pedido ao axe leva as desligadas', () => {
  assert.deepEqual(Object.keys(DESLIGADAS).sort(), ['color-contrast', 'landmark-one-main', 'page-has-heading-one', 'region']);
  for (const [regra, motivo] of Object.entries(DESLIGADAS)) assert.ok(typeof motivo === 'string' && motivo.length > 10, regra);
  const script = rodarAxe();
  for (const regra of Object.keys(DESLIGADAS)) assert.ok(script.includes(`"${regra}":{"enabled":false}`), regra);
  assert.ok(script.includes('"iframes":false'));
});

test('acessibilidade no Chrome: molde passa; imagem sem texto alternativo no beat do meio e tela sem idioma reprovam', opcoes, () => {
  assert.equal(estudio('nova', 'acessivel').codigo, 0);
  const ok = estudio('acessibilidade', 'acessivel');
  assert.equal(ok.codigo, 0, JSON.stringify(ok.json && ok.json.dados));
  assert.equal(ok.json.codigo, 'ACESSIBILIDADE_OK');
  assert.equal(ok.json.dados.medidas, 10, 'index + 9 beats');

  assert.equal(estudio('nova', 'inacessivel').codigo, 0);
  const slides = path.join(base, 'inacessivel', 'deck', 'slides');
  const s03 = path.join(slides, 's03-movimentos.html');
  const img = '<img src="../assets/marca/logo-que-nao-existe.svg" style="position:absolute;left:1500px;top:100px;width:200px;height:80px" data-beat="1" data-sai="2">';
  fs.writeFileSync(s03, fs.readFileSync(s03, 'utf8').replace('<div class="palco-tela">', `<div class="palco-tela">\n${img}`));
  const s02 = path.join(slides, 's02-numero.html');
  fs.writeFileSync(s02, fs.readFileSync(s02, 'utf8').replace('<html lang="pt-BR">', '<html>'));
  const r = estudio('acessibilidade', 'inacessivel');
  assert.equal(r.codigo, 2, JSON.stringify(r.json));
  assert.equal(r.json.codigo, 'ACESSIBILIDADE_REPROVADA');
  const achados = r.json.dados.vermelhos.map((v) => `${v.tela}|${v.beat}|${v.regra}`).sort();
  assert.deepEqual(achados, ['s02-numero.html|0|html-has-lang', 's03-movimentos.html|1|image-alt'], JSON.stringify(r.json.dados.vermelhos));

  // tela que o index pede e não existe reprova (não some calada da conferência)
  const index = path.join(base, 'inacessivel', 'deck', 'index.html');
  const secao = '<section class="slide" id="t09"><iframe data-src="slides/s09-sumiu.html"></iframe></section>';
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('  </div>\n</div>', `    ${secao}\n  </div>\n</div>`));
  const sumiu = estudio('acessibilidade', 'inacessivel');
  assert.ok(sumiu.json.dados.vermelhos.some((v) => v.regra === 'tela-sem-arquivo' && v.nos[0].alvo === 'slides/s09-sumiu.html'), JSON.stringify(sumiu.json.dados.vermelhos));
});

// A apresentação publicada de verdade: o zip do pacote (o mesmo conteúdo que o publicar manda) é
// aberto numa pasta e servido por um servidor que imita o do painel (servidor-painel.mjs: só os
// tipos que o painel aceita, nosniff, faixa de bytes, sem o servidor do "abrir"). No Chrome: a
// apresentação abre, nenhum arquivo falta, nada vem de fora, o vídeo de cena toca pela faixa de
// bytes, e o teleprompter, se alguém o publicasse ao lado, acompanharia os cliques (prova de que
// deixá-lo fora é escolha de privacidade, não limitação técnica). Pula sem Chrome; o vídeo pula
// sem ffmpeg.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { NOME, rodar, conferirTudo } from './publicar-apoio.mjs';
import { servirComoOPainel } from './servidor-painel.mjs';
import { lerZip } from '../scripts/lib/zip.mjs';
import { caminhosDe } from '../scripts/lib/apresentacao.mjs';
import { acharNavegador } from '../scripts/lib/chrome.mjs';
import { abrirSessao } from '../scripts/lib/sessao.mjs';
import { launch, openTab, navegar, esperar } from '../scripts/lib/cdp.mjs';

const opcoes = { skip: acharNavegador() ? false : 'sem Chrome, Edge ou Chromium nesta máquina', timeout: 240000 };
// Teto de cada pedido ao navegador: a suíte inteira abre vários Chrome ao mesmo tempo e, em máquina
// carregada, a aba do teleprompter demora mais que os 10 s padrão para responder.
const TETO_CARREGADO = 45000;
const temFfmpeg = () => spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status === 0;

// 2 s de vídeo H.264 com o índice no começo, como o render de cena grava em deck/assets/<cena>.mp4.
function gravarVideo(destino) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x180:rate=25',
    '-pix_fmt', 'yuv420p', '-c:v', 'libx264', '-movflags', '+faststart', destino], { encoding: 'utf8' });
  return r.status === 0 && fs.existsSync(destino);
}

// Diz em que passo o navegador parou de responder (o erro do DevTools não diz).
async function passo(rotulo, promessa) {
  try {
    return await promessa;
  } catch (erro) {
    throw new Error(`${rotulo}: ${erro.message}`);
  }
}

function abrirZip(bytes, pasta) {
  for (const e of lerZip(bytes)) {
    const abs = path.join(pasta, ...e.nome.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, e.dados);
  }
}

test('publicada de verdade: abre sem o servidor do estúdio, vídeo de cena toca, teleprompter acompanharia', opcoes, async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-no-ar-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const apresentacoes = path.join(base, 'apresentacoes');
  const env = { ESTUDIO_APRESENTACOES: apresentacoes, ESTUDIO_MARCA: path.join(base, 'sem-marca'), ESTUDIO_FERRAMENTAS: path.join(base, 'ferr') };
  assert.equal((await rodar(['nova', NOME], env)).codigo, 0);
  assert.equal((await rodar(['teleprompter', NOME], env)).codigo, 0);
  const c = caminhosDe(NOME, apresentacoes);
  const comVideo = temFfmpeg() && gravarVideo(path.join(c.assets, 'abertura.mp4'));
  if (comVideo) {
    const capa = path.join(c.slides, 's01-capa.html');
    const video = '<video id="cena-teste" src="../assets/abertura.mp4" muted playsinline preload="auto" style="position:absolute;left:0;top:0;width:320px;height:180px"></video>';
    fs.writeFileSync(capa, fs.readFileSync(capa, 'utf8').replace('<div class="palco-tela">', `<div class="palco-tela">\n${video}`));
  } else {
    t.diagnostic('sem ffmpeg: a parte do vídeo de cena não rodou');
  }
  conferirTudo(c); // a conferência em si tem teste próprio; aqui interessa o que sai no ar
  const p = await rodar(['pacote', NOME], env);
  assert.deepEqual([p.codigo, p.json.codigo], [0, 'PACOTE_PRONTO'], p.saida);
  const noAr = path.join(base, 'no-ar');
  abrirZip(fs.readFileSync(path.join(c.pasta, `${NOME}-apresentacao.zip`)), noAr);
  assert.equal(fs.existsSync(path.join(noAr, 'teleprompter.html')), false, 'o teleprompter não sobe');
  // só para provar a decisão: o teleprompter posto ao lado, na mesma origem
  fs.copyFileSync(c.teleprompter, path.join(noAr, 'teleprompter.html'));

  const sessao = await abrirSessao(noAr, {}, { servir: servirComoOPainel, launch, openTab });
  try {
    await sessao.tab.send('Emulation.setFocusEmulationEnabled', { enabled: true });
    await passo('abrir o index', sessao.ir(sessao.url('index.html')));
    const prontoPalco = '(async () => { for (let k = 0; k < 100; k += 1) { if (window.__palco && window.__palco.atual() >= 0 && !window.__palco.ocupado()) return true; await new Promise((r) => setTimeout(r, 100)); } return false; })()';
    assert.equal(await passo('esperar o palco', sessao.tab.evaluate(prontoPalco, TETO_CARREGADO)), true, 'o palco montou servido como no painel');

    if (comVideo) {
      // Cada pedido ao navegador é curto (máquina carregada não estoura o teto de uma avaliação):
      // dá o play e depois consulta o tempo do vídeo daqui, sem esperar dentro da página.
      const video = "window.__palco.frente().contentDocument.getElementById('cena-teste')";
      const tipo = await passo('ler o vídeo', sessao.tab.evaluate(`${video} ? ${video}.canPlayType('video/mp4; codecs="avc1.42E01E"') : 'sem-video'`));
      assert.notEqual(tipo, 'sem-video');
      let tocou = { tipo };
      if (tipo) {
        await passo('dar o play', sessao.tab.evaluate(`(${video}.play().catch(() => {}), true)`));
        for (let k = 0; k < 100; k += 1) {
          tocou = { tipo, ...(await passo('ver o vídeo andar', sessao.tab.evaluate(`({ tempo: ${video}.currentTime, estado: ${video}.readyState, duracao: ${video}.duration })`))) };
          if (tocou.tempo > 0) break;
          await esperar(100);
        }
      }
      const doVideo = sessao.srv.pedidos.filter((q) => q.caminho === '/assets/abertura.mp4');
      assert.ok(doVideo.length > 0 && doVideo.every((q) => q.status === 200 || q.status === 206), JSON.stringify(doVideo));
      if (tocou.tipo) {
        assert.ok(tocou.tempo > 0 && tocou.estado >= 2 && Math.round(tocou.duracao) === 2, JSON.stringify(tocou));
        assert.ok(doVideo.some((q) => q.status === 206), 'o navegador pediu o vídeo por faixa de bytes');
      } else {
        t.diagnostic('este navegador não toca H.264 (chrome-headless-shell sem o codec): conferido só o envio do vídeo');
      }
    }
    const { externos, quebrados } = sessao.rede();
    assert.deepEqual([externos, quebrados], [[], []], 'nada falta e nada vem de fora');

    const tp = await openTab(sessao.portaDevtools);
    try {
      await tp.send('Page.enable');
      await tp.send('Emulation.setFocusEmulationEnabled', { enabled: true });
      await passo('abrir o teleprompter', navegar(tp, sessao.url('teleprompter.html')));
      const esperarIndice = async (alvo) => {
        for (let k = 0; k < 80; k += 1) {
          if ((await passo('ler o teleprompter', tp.evaluate('window.__teleprompter.atual()', TETO_CARREGADO))) === alvo) return alvo;
          await esperar(100);
        }
        return tp.evaluate('window.__teleprompter.atual()', TETO_CARREGADO);
      };
      assert.equal(await esperarIndice(0), 0);
      await sessao.tab.send('Page.bringToFront');
      await passo('avançar o clique', sessao.tab.evaluate('window.__palco.frente().contentWindow.__slide.advance()', TETO_CARREGADO));
      assert.equal(await esperarIndice(1), 1, 'o teleprompter acompanha o clique sem o servidor do estúdio');
    } finally {
      tp.close();
    }
  } finally {
    await sessao.fechar();
  }
});

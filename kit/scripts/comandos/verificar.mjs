// Confere se o estúdio está pronto: Node, navegador (Chrome, Edge, Chromium ou o do instalador),
// a peça de acessibilidade (axe, vem no kit), HyperFrames (só para cena em vídeo) e ffmpeg (idem).
// Navegador, Node e axe são obrigatórios.
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, KIT, FERR, EH_WINDOWS } from '../lib/caminhos.mjs';
import { versaoDoAxe } from './acessibilidade.mjs';
import { acharNavegador } from '../lib/chrome.mjs';
import { comoChamar, VERSAO_HYPERFRAMES } from '../lib/hyperframes.mjs';
import { lerVersao } from '../lib/atualizacao.mjs';
import { launch } from '../lib/cdp.mjs';
import { aviso, reprovado } from '../lib/saida.mjs';

const NODE_MINIMO = 22;

export default async function verificar({ opcoes }) {
  const itens = {};
  const avisos = [];
  const faltando = [];

  const maior = Number(process.versions.node.split('.')[0]);
  itens.node = { ok: maior >= NODE_MINIMO, versao: process.versions.node };
  if (!itens.node.ok) faltando.push('node');

  const nav = acharNavegador();
  itens.navegador = { ok: !!nav, caminho: nav ? nav.caminho : null, tipo: nav ? nav.tipo : null };
  if (!nav) faltando.push('navegador');
  else if (opcoes.rapido !== true) {
    try {
      const n = await launch({ largura: 800, altura: 600 });
      n.close();
      itens.navegador.abriu = true;
    } catch {
      itens.navegador.ok = false;
      itens.navegador.abriu = false;
      faltando.push('navegador');
    }
  }

  const axe = path.join(KIT, 'vendor', 'axe', 'axe.min.js');
  itens.axe = { ok: fs.existsSync(axe), versao: versaoDoAxe() };
  if (!itens.axe.ok) faltando.push('axe');

  const hf = comoChamar();
  itens.hyperframes = { ok: !!hf, versao: VERSAO_HYPERFRAMES, origem: hf ? hf.origem : null };
  if (!hf || hf.origem !== 'node_modules') avisos.push(aviso('HYPERFRAMES_SO_PELA_INTERNET', {}));

  const ffmpeg = path.join(FERR, 'bin', EH_WINDOWS ? 'ffmpeg.exe' : 'ffmpeg');
  itens.ffmpeg = { ok: fs.existsSync(ffmpeg) };
  if (!itens.ffmpeg.ok) avisos.push(aviso('FFMPEG_FALTANDO', {}));

  itens.versao = lerVersao(RAIZ);
  if (faltando.length) reprovado('VERIFICACAO_FALHOU', { faltando, itens });
  return { ok: true, codigo: 'ESTUDIO_PRONTO', avisos, dados: itens };
}

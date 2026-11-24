// Apoio dos testes do comando publicar: roda o estúdio como processo, prepara uma apresentação de
// verdade e um serviço falso (servico-falso.mjs, só em 127.0.0.1), e grava uma chave aceita como o
// login gravaria. Nunca fala com o painel real.
// Portado do Site Estúdio (kit/testes/publicar-apoio.mjs), adaptado a apresentacoes/<nome>/deck/.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { subirServicoFalso } from './servico-falso.mjs';
import { gravarChave } from '../scripts/lib/publicar-guarda.mjs';
import { caminhosDe } from '../scripts/lib/apresentacao.mjs';
import { anotarConferencia, impressaoDaApresentacao, CONFERENCIAS } from '../scripts/lib/conferencias.mjs';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESPACHANTE = path.join(RAIZ, 'kit', 'scripts', 'estudio.mjs');
export const MENSAGENS = JSON.parse(fs.readFileSync(path.join(RAIZ, 'kit', 'mensagens.json'), 'utf8'));
export const NO_WINDOWS = process.platform === 'win32';
export const NOME = 'minha-aula';
export const modo = (arquivo) => fs.statSync(arquivo).mode & 0o777;

export function rodar(args, env) {
  return new Promise((resolve, reject) => {
    const filho = spawn(process.execPath, [DESPACHANTE, ...args], { env: { ...process.env, ESTUDIO_NAO_ABRIR: '1', ...env } });
    let stdout = '';
    let stderr = '';
    filho.stdout.on('data', (d) => { stdout += d; });
    filho.stderr.on('data', (d) => { stderr += d; });
    filho.on('error', reject);
    filho.on('close', (codigo) => {
      const linhas = stdout.trim().split('\n');
      resolve({ codigo, json: JSON.parse(linhas[linhas.length - 1]), saida: stdout + stderr });
    });
  });
}

// Uma apresentação de verdade: abertura + uma tela + foto incompressível de ~4 KB (com parte de 1000
// bytes, vira 5+ partes), o teleprompter e um rascunho (que nunca sobem), brief e roteiro.
export function criarApresentacao(apresentacoes, nome = NOME) {
  const c = caminhosDe(nome, apresentacoes);
  const arquivos = {
    'deck/index.html': '<title>Minha aula</title><iframe src="slides/s01-capa.html"></iframe>',
    'deck/slides/s01-capa.html': '<h1>Capa</h1><img src="../assets/foto.txt">',
    'deck/assets/foto.txt': crypto.randomBytes(3000).toString('base64'),
    'deck/teleprompter.html': '<p>Fala inteira de quem apresenta</p>',
    'deck/_lab/rascunho.html': '<p>rascunho</p>',
    'brief.md': '# Brief\n',
    'roteiro/S01.json': '{"fala":"Bom dia."}\n',
  };
  for (const [rel, texto] of Object.entries(arquivos)) {
    const abs = path.join(c.pasta, ...rel.split('/'));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, texto);
  }
  return c;
}

// As três conferências aprovadas para a apresentação como está agora (o que o checar, o fatos e o
// acessibilidade anotam quando aprovam).
export function conferirTudo(c) {
  const impressao = impressaoDaApresentacao(c);
  for (const comando of CONFERENCIAS) anotarConferencia(c, comando, impressao, true);
}

export async function preparar(t, opcoes, envExtra = {}, { conferida = true } = {}) {
  const servico = await subirServicoFalso(opcoes);
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-publicar-'));
  const apresentacoes = path.join(base, 'apresentacoes');
  const c = criarApresentacao(apresentacoes);
  if (conferida) conferirTudo(c);
  const ferr = path.join(base, 'ferr');
  const env = {
    ESTUDIO_PUBLICAR_URL: servico.base, ESTUDIO_FERRAMENTAS: ferr, ESTUDIO_APRESENTACOES: apresentacoes,
    ESTUDIO_PUBLICAR_INTERVALO_MS: '20', ESTUDIO_PUBLICAR_PRAZO_MS: '300', ...envExtra,
  };
  t.after(async () => {
    await servico.fechar();
    fs.rmSync(base, { recursive: true, force: true });
  });
  return { servico, ferr, env, c, publicar: (...extra) => rodar(['publicar', NOME, ...extra], env) };
}

// Chave aceita pelo serviço falso, gravada como o login gravaria.
export function darChave(ctx) {
  ctx.servico.estado.chaves.add('se_pub_chave-de-teste');
  gravarChave(ctx.servico.base, 'se_pub_chave-de-teste', '', ctx.ferr);
}

// HyperFrames (vídeo a partir de HTML) com versão fixa. Usa o pacote instalado em node_modules
// (npm ci, versão travada no package.json); sem ele, chama o npx com a mesma versão fixa.
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ, FERR, EH_WINDOWS } from './caminhos.mjs';
import { rodar } from './executar.mjs';
import { acharNavegador } from './chrome.mjs';

export const VERSAO_HYPERFRAMES = '0.8.181';
export const BIN_LOCAL = path.join(RAIZ, 'node_modules', 'hyperframes', 'bin', 'hyperframes.mjs');

function versaoLocal() {
  try {
    return JSON.parse(fs.readFileSync(path.join(RAIZ, 'node_modules', 'hyperframes', 'package.json'), 'utf8')).version;
  } catch {
    return null;
  }
}

// npx sem shell: o npx-cli.js do npm que vem junto com este Node.
function npxCli() {
  const dir = path.dirname(process.execPath);
  const candidatos = EH_WINDOWS
    ? [path.join(dir, 'node_modules', 'npm', 'bin', 'npx-cli.js')]
    : [path.join(dir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js')];
  return candidatos.find((c) => fs.existsSync(c)) || null;
}

// Como chamar: { programa, prefixo, origem } ou null.
export function comoChamar() {
  if (fs.existsSync(BIN_LOCAL) && versaoLocal() === VERSAO_HYPERFRAMES) {
    return { programa: process.execPath, prefixo: [BIN_LOCAL], origem: 'node_modules' };
  }
  const npx = npxCli();
  if (npx) return { programa: process.execPath, prefixo: [npx, '--yes', `hyperframes@${VERSAO_HYPERFRAMES}`], origem: 'npx' };
  return null;
}

export function ambienteHyperframes(base = process.env, ferr = FERR) {
  const env = { ...base };
  const def = (k, v) => {
    if (!env[k]) env[k] = v;
  };
  def('HYPERFRAMES_CACHE_DIR', path.join(ferr, 'cache', 'hyperframes'));
  def('npm_config_cache', path.join(ferr, 'cache', 'npm'));
  def('PUPPETEER_CACHE_DIR', path.join(ferr, 'cache', 'puppeteer'));
  env.HYPERFRAMES_NO_TELEMETRY = '1';
  env.HYPERFRAMES_NO_UPDATE_CHECK = '1';
  env.HYPERFRAMES_SKIP_SKILLS = '1';
  env.npm_config_update_notifier = 'false';
  env.npm_config_fund = 'false';
  env.npm_config_audit = 'false';
  const bin = path.join(ferr, 'bin');
  const ffmpeg = path.join(bin, EH_WINDOWS ? 'ffmpeg.exe' : 'ffmpeg');
  const ffprobe = path.join(bin, EH_WINDOWS ? 'ffprobe.exe' : 'ffprobe');
  if (fs.existsSync(ffmpeg)) def('HYPERFRAMES_FFMPEG_PATH', ffmpeg);
  if (fs.existsSync(ffprobe)) def('HYPERFRAMES_FFPROBE_PATH', ffprobe);
  // O motor usa o mesmo navegador que o resto do estúdio, achado do mesmo jeito (acharNavegador):
  // ESTUDIO_CHROME, se a pessoa escolheu; senão o navegador escondido gravado pelo instalador em
  // .ferramentas/navegador.txt. O ambiente.sh e o estudio.cmd já exportam isto quando o arquivo
  // existe; aqui cobre quem chamou o kit sem eles. Chrome do sistema não entra: a versão dele muda
  // sozinha, e o hyperframes tem o navegador dele como reserva.
  const nav = acharNavegador(env, ferr);
  if (nav && nav.tipo !== 'sistema') def('HYPERFRAMES_BROWSER_PATH', nav.caminho);
  const chavePath = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'PATH';
  env[chavePath] = [bin, path.dirname(process.execPath), env[chavePath] || ''].filter(Boolean).join(path.delimiter);
  return env;
}

export async function hyperframes(argumentos, opcoes = {}) {
  const chamada = comoChamar();
  if (!chamada) return { codigo: -1, saida: '', erro: 'hyperframes indisponível', naoAchou: true };
  return rodar(chamada.programa, [...chamada.prefixo, ...argumentos], { env: ambienteHyperframes(), timeoutMs: 60 * 60 * 1000, ...opcoes });
}

// Renderiza num arquivo temporário ao lado de "saida" e só troca o vídeo anterior depois de um
// render bom (código 0, arquivo existe e tem tamanho > 0). Falha: o temporário some e o vídeo
// anterior fica como estava. "renderizar(temporario)" devolve { codigo, saida, erro } (o do rodar);
// é injetável para os testes simularem um render sem o motor.
export async function renderizarSemPerderOAnterior(saida, renderizar) {
  const temporario = path.join(path.dirname(saida), `.renderizando-${process.pid}-${path.basename(saida)}`);
  fs.rmSync(temporario, { force: true });
  let r;
  try {
    r = await renderizar(temporario);
  } catch (e) {
    fs.rmSync(temporario, { force: true });
    throw e;
  }
  let tamanho = 0;
  try {
    tamanho = fs.statSync(temporario).size;
  } catch {}
  if (r.codigo !== 0 || tamanho <= 0) {
    fs.rmSync(temporario, { force: true });
    return { ...r, ok: false, tamanho };
  }
  fs.renameSync(temporario, saida);
  return { ...r, ok: true, tamanho };
}

// Sobe um servidor local na pasta deck/ e abre o deck no navegador (e o teleprompter, se existir).
// O servidor fica de pé em segundo plano e desliga sozinho depois de 3 horas parado.
// --sem-navegador: só sobe o servidor e devolve os endereços.
// --pasta: só abre a pasta da apresentação no Finder ou no Explorer (sem servidor).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao } from '../lib/apresentacao.mjs';
import { abrir as abrirNoSistema } from '../lib/abrir.mjs';
import { FERR, relativoARaiz } from '../lib/caminhos.mjs';
import { falha } from '../lib/saida.mjs';
import { esperar } from '../lib/cdp.mjs';
import { ROTA_IDENTIDADE } from '../lib/servidor.mjs';
import { tentarTrava, soltarTrava } from '../lib/trava.mjs';

const SOZINHO = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'lib', 'servidor-sozinho.mjs');
// Quanto um "abrir" espera a vez enquanto outro, vivo, está subindo o servidor.
const ESPERA_TRAVA_MS = 15 * 1000;

const mesmaPasta = (a, b) => path.resolve(a) === path.resolve(b);

// A porta gravada só vale se o servidor nela disser que é do estúdio e desta pasta.
export async function servidorVivo(estado, pastaEsperada) {
  if (!fs.existsSync(estado)) return null;
  try {
    const { porta } = JSON.parse(fs.readFileSync(estado, 'utf8'));
    if (!Number.isInteger(porta)) return null;
    const r = await fetch(`http://127.0.0.1:${porta}${ROTA_IDENTIDADE}`, { signal: AbortSignal.timeout(2000) });
    if (!r.ok) return null;
    const quem = await r.json();
    return typeof quem.pasta === 'string' && mesmaPasta(quem.pasta, pastaEsperada) ? porta : null;
  } catch {
    return null;
  }
}

// Trava por projeto: só um "abrir" por vez decide se sobe servidor. A trava guarda {pid}; a de um
// "abrir" que morreu no meio (pid que não existe mais) é tomada na hora, e a de um vivo nunca é
// tomada por idade: espera até esperaMs e desiste. Devolve a função que solta (só a própria trava).
export async function pegarTrava(arquivo, { esperaMs = ESPERA_TRAVA_MS } = {}) {
  const limite = Date.now() + esperaMs;
  for (;;) {
    if (tentarTrava(arquivo).pegou) return () => soltarTrava(arquivo);
    if (Date.now() > limite) falha('SERVIDOR_NAO_SUBIU', { detalhe: 'outro "abrir" segurou a vez por tempo demais' });
    await esperar(100);
  }
}

async function subirServidor(deck, estado) {
  const soltar = await pegarTrava(`${estado}.trava`);
  try {
    let porta = await servidorVivo(estado, deck);
    if (porta) return porta;
    fs.rmSync(estado, { force: true });
    const filho = spawn(process.execPath, [SOZINHO, deck, estado], { detached: true, stdio: 'ignore', windowsHide: true });
    filho.unref();
    for (let k = 0; k < 50 && !porta; k += 1) {
      await esperar(100);
      porta = await servidorVivo(estado, deck);
    }
    if (!porta) {
      // desistiu: o filho não pode subir mais tarde e gravar um estado que ninguém está esperando
      try {
        filho.kill();
      } catch {}
      // e o estado que ele chegou a gravar (só o dele) não fica apontando para um processo morto
      try {
        if (JSON.parse(fs.readFileSync(estado, 'utf8')).pid === filho.pid) fs.rmSync(estado, { force: true });
      } catch {}
      falha('SERVIDOR_NAO_SUBIU', {});
    }
    return porta;
  } finally {
    soltar();
  }
}

export default async function abrir(args) {
  const nome = nomeDaApresentacao(args);
  const c = abrirApresentacao(nome);
  if (args.opcoes.pasta === true) {
    abrirNoSistema(c.pasta);
    return { ok: true, codigo: 'PASTA_ABERTA', arquivos: { pasta: relativoARaiz(c.pasta) }, dados: { nome } };
  }
  const pastaEstado = path.join(FERR, 'servidores');
  fs.mkdirSync(pastaEstado, { recursive: true });
  const estado = path.join(pastaEstado, `${nome}.json`);
  const porta = (await servidorVivo(estado, c.deck)) || (await subirServidor(c.deck, estado));
  const deck = `http://127.0.0.1:${porta}/index.html`;
  const temTeleprompter = fs.existsSync(c.teleprompter);
  const teleprompter = temTeleprompter ? `http://127.0.0.1:${porta}/teleprompter.html` : null;
  if (args.opcoes['sem-navegador'] !== true) {
    abrirNoSistema(deck);
    if (teleprompter) abrirNoSistema(teleprompter);
  }
  return {
    ok: true,
    codigo: 'DECK_ABERTO',
    arquivos: { deck: c.rel('deck', 'index.html') },
    dados: { endereco: deck, teleprompter, porta },
  };
}

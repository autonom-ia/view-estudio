// Navegador sem janela + DevTools Protocol, sem dependência (WebSocket nativo do Node 22+).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { acharNavegador, ehShell } from './chrome.mjs';
import { EH_WINDOWS, EH_MAC } from './caminhos.mjs';
import { falha } from './saida.mjs';

export const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const TETO_CHAMADA_MS = 30000;
// Prazo TOTAL para o navegador subir (inclusive um /json/version que conecta e não responde).
const TETO_SUBIDA_MS = 20000;
// Prazo para a aba nova: o /json/new e a conexão do WebSocket do DevTools, cada um.
export const TETO_ABA_MS = 10000;
// Cada consulta do laço de subida espera no máximo isto (e nunca além do prazo total).
const TETO_CONSULTA_MS = 2000;

function portaLivre() {
  return new Promise((res, rej) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => res(port));
    });
    srv.on('error', rej);
  });
}

// Abre o navegador. largura/altura = tamanho da janela (viewport inicial).
export async function launch({ largura = 1920, altura = 1080 } = {}) {
  const achado = acharNavegador();
  if (!achado) falha('CHROME_NAO_ACHADO', {});
  const porta = await portaLivre();
  const perfil = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-cdp-'));
  const args = [
    ehShell(achado.caminho) ? '--headless' : '--headless=new',
    `--remote-debugging-port=${porta}`,
    `--user-data-dir=${perfil}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--hide-scrollbars',
    '--mute-audio',
    '--disable-extensions',
    '--disable-background-networking',
    // Aba que não está na frente (o teleprompter ao lado do deck, nos testes e na conferência) não
    // vira processo de segundo plano: no Mac carregado, o sistema a deixava sem CPU e o DevTools
    // parava de responder.
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--autoplay-policy=no-user-gesture-required',
    '--force-device-scale-factor=1',
    `--window-size=${largura},${altura}`,
  ];
  if (!EH_MAC && !EH_WINDOWS) args.push('--no-sandbox');
  const proc = spawn(achado.caminho, [...args, 'about:blank'], { stdio: 'ignore', windowsHide: true });
  let morreu = false;
  proc.on('error', () => {
    morreu = true;
  });
  proc.on('exit', () => {
    morreu = true;
  });
  const close = () => {
    try {
      proc.kill('SIGKILL');
    } catch {}
    // o Windows segura o perfil por um instante depois de matar o processo
    setTimeout(() => {
      try {
        fs.rmSync(perfil, { recursive: true, force: true });
      } catch {}
    }, 300);
  };
  const limite = Date.now() + TETO_SUBIDA_MS;
  while (Date.now() < limite && !morreu) {
    const restante = Math.max(1, Math.min(TETO_CONSULTA_MS, limite - Date.now()));
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/json/version`, { signal: AbortSignal.timeout(restante) });
      if (r.ok) return { porta, close, navegador: achado };
    } catch {
      /* subindo (ou a consulta venceu o prazo) */
    }
    await esperar(150);
  }
  close();
  falha('CHROME_NAO_ABRIU', { navegador: achado.caminho });
  return null;
}

// Conecta o WebSocket do DevTools com prazo: venceu ou deu erro, fecha o socket e devolve false.
function conectar(ws, prazoMs) {
  return new Promise((res) => {
    const desistir = () => {
      clearTimeout(t);
      try {
        ws.close();
      } catch {}
      res(false);
    };
    const t = setTimeout(desistir, prazoMs);
    ws.onopen = () => {
      clearTimeout(t);
      res(true);
    };
    ws.onerror = desistir;
  });
}

// Abre uma aba nova. prazoMs vale para o /json/new (corpo incluído) e para o WebSocket abrir.
export async function openTab(porta, { prazoMs = TETO_ABA_MS } = {}) {
  let info = null;
  for (const metodo of ['PUT', 'GET']) {
    try {
      const signal = AbortSignal.timeout(prazoMs);
      const r = await fetch(`http://127.0.0.1:${porta}/json/new?about:blank`, { method: metodo, signal });
      if (r.ok) {
        info = await r.json();
        break;
      }
    } catch {
      /* tenta o próximo */
    }
  }
  if (!info || typeof info.webSocketDebuggerUrl !== 'string') falha('CHROME_NAO_ABRIU', { detalhe: 'aba nova' });
  let ws;
  try {
    ws = new WebSocket(info.webSocketDebuggerUrl);
  } catch {
    falha('CHROME_NAO_ABRIU', { detalhe: 'endereço do DevTools inválido' });
  }
  if (!(await conectar(ws, prazoMs))) falha('CHROME_NAO_ABRIU', { detalhe: 'o DevTools da aba nova não respondeu' });
  let id = 0;
  const pend = new Map();
  const ouvintes = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pend.has(m.id)) {
      const { res, rej } = pend.get(m.id);
      pend.delete(m.id);
      if (m.error) rej(new Error(m.error.message));
      else res(m.result);
    } else if (m.method) ouvintes.forEach((f) => f(m));
  };
  ws.onclose = () => {
    for (const { rej } of pend.values()) rej(new Error('DevTools fechou a conexão'));
    pend.clear();
  };
  const send = (method, params = {}, teto = TETO_CHAMADA_MS) =>
    new Promise((res, rej) => {
      id += 1;
      const i = id;
      const t = setTimeout(() => {
        pend.delete(i);
        rej(new Error(`DevTools não respondeu: ${method}`));
      }, teto);
      pend.set(i, {
        res: (v) => {
          clearTimeout(t);
          res(v);
        },
        rej: (e) => {
          clearTimeout(t);
          rej(e);
        },
      });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  const evaluate = async (expression, teto) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, teto);
    if (r.exceptionDetails) {
      const ex = r.exceptionDetails.exception;
      throw new Error((ex && ex.description) || r.exceptionDetails.text || 'erro na página');
    }
    return r.result.value;
  };
  return {
    send,
    evaluate,
    on: (f) => ouvintes.push(f),
    off: (f) => {
      const k = ouvintes.indexOf(f);
      if (k !== -1) ouvintes.splice(k, 1);
    },
    close: () => ws.close(),
  };
}

// Navega e espera o documento terminar de carregar.
export async function navegar(tab, url, teto = 30000) {
  await tab.send('Page.navigate', { url });
  const inicio = Date.now();
  await esperar(50);
  while (Date.now() - inicio < teto) {
    try {
      const pronto = await tab.evaluate(`document.readyState === 'complete' && location.href !== 'about:blank'`, 5000);
      if (pronto) return;
    } catch {
      /* contexto trocando durante a navegação */
    }
    await esperar(80);
  }
  throw new Error(`a página não terminou de carregar: ${url}`);
}

export async function lerStream(tab, handle) {
  const partes = [];
  for (;;) {
    const r = await tab.send('IO.read', { handle, size: 4 * 1024 * 1024 });
    partes.push(Buffer.from(r.data, r.base64Encoded ? 'base64' : 'utf8'));
    if (r.eof) break;
  }
  await tab.send('IO.close', { handle });
  return Buffer.concat(partes);
}

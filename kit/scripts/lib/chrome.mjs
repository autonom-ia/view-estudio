// Acha um navegador baseado no Chromium para medir, fotografar e imprimir.
// Ordem: ESTUDIO_CHROME (caminho forçado) → chrome-headless-shell do instalador, quando o estúdio
// foi instalado (.ferramentas/instalacao.json; versão fixa, igual no Mac e no Windows) → Chrome,
// Chromium ou Edge do sistema (versão muda sozinha) → chrome-headless-shell achado em .ferramentas/.
import fs from 'node:fs';
import path from 'node:path';
import { EH_WINDOWS, EH_MAC, FERR } from './caminhos.mjs';

function candidatosDoSistema(env = process.env) {
  if (EH_MAC) {
    const apps = [
      'Google Chrome.app/Contents/MacOS/Google Chrome',
      'Chromium.app/Contents/MacOS/Chromium',
      'Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      'Brave Browser.app/Contents/MacOS/Brave Browser',
    ];
    const bases = ['/Applications'];
    if (env.HOME) bases.push(path.join(env.HOME, 'Applications'));
    return bases.flatMap((b) => apps.map((a) => path.join(b, a)));
  }
  if (EH_WINDOWS) {
    const bases = [env.PROGRAMFILES, env['PROGRAMFILES(X86)'], env.LOCALAPPDATA].filter(Boolean);
    const rel = [
      ['Google', 'Chrome', 'Application', 'chrome.exe'],
      ['Microsoft', 'Edge', 'Application', 'msedge.exe'],
      ['Chromium', 'Application', 'chrome.exe'],
    ];
    return bases.flatMap((b) => rel.map((r) => path.join(b, ...r)));
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
    '/snap/bin/chromium',
  ];
}

const NOME_SHELL = EH_WINDOWS ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';

// Procura o chrome-headless-shell dentro de .ferramentas (layout do @puppeteer/browsers).
export function procurarShell(raiz = FERR) {
  const achados = [];
  const andar = (dir, nivel) => {
    if (nivel > 6) return;
    let nomes;
    try {
      nomes = fs.readdirSync(dir);
    } catch {
      return;
    }
    for (const nome of nomes) {
      if (nome === 'node_modules' || nome === 'cache' || nome.startsWith('versao-anterior')) continue;
      const c = path.join(dir, nome);
      let info;
      try {
        info = fs.statSync(c);
      } catch {
        continue;
      }
      if (info.isDirectory()) andar(c, nivel + 1);
      else if (nome === NOME_SHELL) achados.push(c);
    }
  };
  andar(raiz, 0);
  achados.sort();
  return achados[achados.length - 1] || '';
}

// Caminho exato gravado pelo instalador em .ferramentas/navegador.txt (se o arquivo ainda existe).
function shellDoInstalador(ferr) {
  try {
    const linha = fs.readFileSync(path.join(ferr, 'navegador.txt'), 'utf8').split('\n')[0].trim();
    return linha && fs.existsSync(linha) ? linha : '';
  } catch {
    return '';
  }
}

// Devolve { caminho, tipo } ou null. tipo: 'forcado' | 'sistema' | 'shell'.
export function acharNavegador(env = process.env, ferr = FERR) {
  const forcado = env.ESTUDIO_CHROME;
  if (forcado && fs.existsSync(forcado)) return { caminho: forcado, tipo: 'forcado' };
  if (fs.existsSync(path.join(ferr, 'instalacao.json'))) {
    const fixo = shellDoInstalador(ferr) || procurarShell(ferr);
    if (fixo) return { caminho: fixo, tipo: 'shell' };
  }
  for (const c of candidatosDoSistema(env)) if (fs.existsSync(c)) return { caminho: c, tipo: 'sistema' };
  const shell = procurarShell(ferr);
  if (shell) return { caminho: shell, tipo: 'shell' };
  return null;
}

export function ehShell(caminho) {
  return path.basename(caminho).startsWith('chrome-headless-shell');
}

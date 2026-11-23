// Abre arquivo, pasta ou endereço no programa padrão (Finder, Explorer, navegador).
// ESTUDIO_NAO_ABRIR=1 desliga (testes e CI).
import { spawn } from 'node:child_process';
import { EH_WINDOWS, EH_MAC } from './caminhos.mjs';

export function abrir(alvo) {
  if (process.env.ESTUDIO_NAO_ABRIR === '1') return false;
  try {
    let filho;
    if (EH_MAC) filho = spawn('open', [alvo], { detached: true, stdio: 'ignore' });
    else if (EH_WINDOWS) {
      filho = spawn('cmd.exe', ['/d', '/s', '/c', `start "" "${alvo}"`], {
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
        windowsVerbatimArguments: true,
      });
    } else filho = spawn('xdg-open', [alvo], { detached: true, stdio: 'ignore' });
    filho.on('error', () => {});
    filho.unref();
    return true;
  } catch {
    return false;
  }
}

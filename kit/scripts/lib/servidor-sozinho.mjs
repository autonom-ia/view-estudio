// Servidor local que fica de pé depois que o comando "abrir" termina (processo separado).
// Uso: node servidor-sozinho.mjs <pasta> <arquivo-de-estado>
// Grava {porta, pid, pasta} no arquivo de estado (escrita atômica) e responde /__estudio.json com
// {pid, pasta}, para o "abrir" saber que a porta é mesmo dele e da pasta certa.
// Desliga sozinho depois de 3 horas sem nenhum pedido; só apaga o estado se ele ainda for seu.
import fs from 'node:fs';
import path from 'node:path';
import { servir, ROTA_IDENTIDADE } from './servidor.mjs';

const OCIOSO_MS = 3 * 60 * 60 * 1000;
const [pastaArg, estado] = process.argv.slice(2);
const pasta = path.resolve(pastaArg);
let ultimo = Date.now();
const identidade = JSON.stringify({ pid: process.pid, pasta });
const srv = await servir(pasta, { virtuais: { [ROTA_IDENTIDADE]: identidade }, aoPedir: () => { ultimo = Date.now(); } });
const tmp = `${estado}.${process.pid}.tmp`;
fs.writeFileSync(tmp, JSON.stringify({ porta: srv.porta, pid: process.pid, pasta }));
fs.renameSync(tmp, estado);

function estadoEhMeu() {
  try {
    return JSON.parse(fs.readFileSync(estado, 'utf8')).pid === process.pid;
  } catch {
    return false;
  }
}

setInterval(async () => {
  if (Date.now() - ultimo > OCIOSO_MS) {
    await srv.fechar();
    if (estadoEhMeu()) {
      try { fs.rmSync(estado, { force: true }); } catch {}
    }
    process.exit(0);
  }
}, 60000);

// Trava de arquivo com dono: criada com 'wx' (só um processo consegue) e guarda {pid}.
// Trava cujo dono não existe mais (process.kill(pid, 0) dá ESRCH) pode ser tomada; idade não conta,
// porque um processo vivo e lento ainda está trabalhando. Soltar só apaga a trava que é deste processo.
import fs from 'node:fs';

// Trava sem pid legível (o dono morreu entre criar e escrever, ou o arquivo veio estragado): só é
// tomada depois deste prazo, para não tirar a vez de quem acabou de criar e ainda vai escrever.
const PRAZO_SEM_DONO_MS = 10 * 1000;

export function pidVivo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    // EPERM: existe, só não é nosso. Qualquer coisa diferente de ESRCH conta como vivo.
    return e.code !== 'ESRCH';
  }
}

// undefined: não existe trava. null: existe, sem pid legível. Número: o pid do dono.
export function donoDaTrava(arquivo) {
  let texto;
  try {
    texto = fs.readFileSync(arquivo, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return undefined;
    return null;
  }
  try {
    const { pid } = JSON.parse(texto);
    return Number.isInteger(pid) ? pid : null;
  } catch {
    return null;
  }
}

function abandonada(arquivo, dono) {
  if (dono !== null) return !pidVivo(dono);
  try {
    return Date.now() - fs.statSync(arquivo).mtimeMs > PRAZO_SEM_DONO_MS;
  } catch {
    return true;
  }
}

// Uma tentativa (sem esperar): { pegou: true } ou { pegou: false, dono }.
export function tentarTrava(arquivo) {
  for (let tentativa = 0; tentativa < 3; tentativa += 1) {
    try {
      const fd = fs.openSync(arquivo, 'wx');
      try {
        fs.writeSync(fd, JSON.stringify({ pid: process.pid }));
      } finally {
        fs.closeSync(fd);
      }
      return { pegou: true };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
    }
    const dono = donoDaTrava(arquivo);
    if (dono === undefined) continue;
    if (!abandonada(arquivo, dono)) return { pegou: false, dono };
    // Confere de novo antes de apagar: se outro processo já tomou a trava, ela não é mais a abandonada.
    if (donoDaTrava(arquivo) === dono) fs.rmSync(arquivo, { force: true });
  }
  return { pegou: false, dono: donoDaTrava(arquivo) ?? null };
}

// Apaga a trava só se ela ainda for deste processo. Devolve true se apagou.
export function soltarTrava(arquivo) {
  if (donoDaTrava(arquivo) !== process.pid) return false;
  fs.rmSync(arquivo, { force: true });
  return true;
}

// Onde o estúdio guarda o pedido de acesso e a chave de publicação: .ferramentas/publicar/,
// fora do git (.gitignore cobre .ferramentas/). Pasta 0700, arquivos 0600, escrita atômica.
// No Windows a permissão vem do perfil do usuário (a pasta do estúdio fica dentro dele).
// Portado do Site Estúdio (lib/publicar-guarda.mjs).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { FERR } from './caminhos.mjs';
import { KitErro } from './saida.mjs';

export const pastaPublicar = (ferr = FERR) => path.join(ferr, 'publicar');
export const arquivoPedido = (ferr = FERR) => path.join(pastaPublicar(ferr), 'pedido.json');
export const arquivoChave = (ferr = FERR) => path.join(pastaPublicar(ferr), 'chave.json');
// Envio cujo concluir ficou sem resposta: a próxima publicação do site confere antes de mandar de novo.
export const arquivoConferir = (nome, ferr = FERR) => path.join(pastaPublicar(ferr), `conferir-${nome}.json`);

// Pedido guardado há mais que isso (pelo relógio deste computador, contra ele mesmo) é lixo.
const GUARDA_DO_PEDIDO_MS = 24 * 60 * 60 * 1000;

// Grava só para o dono: cria o temporário já 0600 e troca pelo rename.
export function gravarPrivado(arquivo, objeto) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true, mode: 0o700 });
  const tmp = `${arquivo}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(objeto)}\n`, { mode: 0o600, flag: 'wx' });
  try {
    fs.renameSync(tmp, arquivo);
  } catch (erro) {
    fs.rmSync(tmp, { force: true });
    throw erro;
  }
}

// Objeto guardado, ou null se não existe. Arquivo estragado é apagado (vale como "não tem").
export function lerPrivado(arquivo) {
  let texto;
  try {
    texto = fs.readFileSync(arquivo, 'utf8');
  } catch (erro) {
    if (erro.code === 'ENOENT') return null;
    throw new KitErro('ARQUIVO_INVALIDO', { arquivo: path.basename(arquivo), detalhe: String(erro.code || erro.message) });
  }
  try {
    const obj = JSON.parse(texto);
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) return obj;
  } catch {
    // cai no apagar abaixo
  }
  apagar(arquivo);
  return null;
}

export function apagar(arquivo) {
  fs.rmSync(arquivo, { force: true });
}

// Chave guardada para este serviço, ou null. Chave de outro serviço (teste local) não vale aqui.
export function lerChave(base, ferr = FERR) {
  const guardada = lerPrivado(arquivoChave(ferr));
  if (!guardada || guardada.servico !== base || typeof guardada.chave !== 'string' || !guardada.chave) return null;
  return guardada.chave;
}

export function gravarChave(base, chave, email, ferr = FERR) {
  gravarPrivado(arquivoChave(ferr), { servico: base, chave, email: typeof email === 'string' ? email : '', criada_em: Date.now() });
}

// Pedido de acesso guardado para este serviço, ou null (de outro serviço ou lixo é apagado).
// Não compara o expira_em do serviço com o relógio daqui: os relógios podem discordar, e o serviço
// estende o prazo quando a pessoa autoriza. Quem diz que o pedido acabou é o serviço (404/410).
export function lerPedido(base, ferr = FERR, agora = Date.now()) {
  const p = lerPrivado(arquivoPedido(ferr));
  if (!p) return null;
  const valido = p.servico === base && typeof p.codigo_dispositivo === 'string' && p.codigo_dispositivo &&
    typeof p.codigo_curto === 'string' && !(Number.isFinite(p.guardado_em) && agora - p.guardado_em > GUARDA_DO_PEDIDO_MS);
  if (valido) return p;
  apagar(arquivoPedido(ferr));
  return null;
}

export function gravarPedido(base, pedido, ferr = FERR) {
  gravarPrivado(arquivoPedido(ferr), { servico: base, ...pedido, guardado_em: Date.now() });
}

// Envio cujo concluir ficou sem resposta: { versao_antes, sha256 } (a versão que estava no ar antes e
// o SHA-256 do pacote que foi mandado), ou null. Sem sha256 (arquivo antigo) vale como nenhum.
export function lerConferir(base, nome, ferr = FERR) {
  const c = lerPrivado(arquivoConferir(nome, ferr));
  const versaoOk = c && (c.versao_antes === null || Number.isInteger(c.versao_antes));
  if (versaoOk && c.servico === base && typeof c.sha256 === 'string' && c.sha256.length === 64) return c;
  if (c) apagar(arquivoConferir(nome, ferr));
  return null;
}

export function gravarConferir(base, nome, versaoAntes, sha256, ferr = FERR) {
  gravarPrivado(arquivoConferir(nome, ferr), { servico: base, versao_antes: versaoAntes, sha256 });
}

// --sair: apaga chave e pedido. Devolve o que existia.
export function esquecerTudo(ferr = FERR) {
  const tinha = { chave: fs.existsSync(arquivoChave(ferr)), pedido: fs.existsSync(arquivoPedido(ferr)) };
  apagar(arquivoChave(ferr));
  apagar(arquivoPedido(ferr));
  return tinha;
}

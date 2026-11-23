// Onde ficam as coisas: raiz do repositório, pasta de ferramentas e pastas do usuário.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const EH_WINDOWS = process.platform === 'win32';
export const EH_MAC = process.platform === 'darwin';

export const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const KIT = path.join(RAIZ, 'kit');

// Pasta de ferramentas: sempre dentro do estúdio (Mac e Windows). Desinstalar é apagar uma pasta.
export const NOME_PASTA_FERRAMENTAS = '.ferramentas';

export function pastaFerramentas(raiz = RAIZ, env = process.env) {
  if (env.ESTUDIO_FERRAMENTAS) return path.resolve(env.ESTUDIO_FERRAMENTAS);
  return path.join(raiz, NOME_PASTA_FERRAMENTAS);
}

export const FERR = pastaFerramentas();

// Pastas do usuário. Os testes apontam para pastas temporárias pelas variáveis de ambiente.
export function pastaApresentacoes(env = process.env) {
  if (env.ESTUDIO_APRESENTACOES) return path.resolve(env.ESTUDIO_APRESENTACOES);
  return path.join(RAIZ, 'apresentacoes');
}

export function pastaMarca(env = process.env) {
  if (env.ESTUDIO_MARCA) return path.resolve(env.ESTUDIO_MARCA);
  return path.join(RAIZ, 'minha-marca');
}

// Pastas que nunca são tocadas por "atualizar".
export const PASTAS_DO_USUARIO = Object.freeze(['minha-marca', 'apresentacoes', 'referencias']);

const PERMITIDOS = 'abcdefghijklmnopqrstuvwxyz0123456789-';
const TAMANHO_MAXIMO_NOME = 60;

// Nomes de dispositivo do Windows: uma pasta com esse nome (com ou sem extensão) não pode ser
// criada nem aberta lá, e a apresentação ficaria presa no Mac.
const RESERVADOS_DO_WINDOWS = Object.freeze([
  'con', 'prn', 'aux', 'nul',
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `com${n}`),
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `lpt${n}`),
]);

// "con", "CON", "con.algo", "Nul.txt"… O Windows olha só o que vem antes do primeiro ponto.
export function nomeReservadoDoWindows(nome) {
  const antesDoPonto = String(nome).split('.')[0].trim().toLowerCase();
  return RESERVADOS_DO_WINDOWS.includes(antesDoPonto);
}

// Nome de apresentação: minúsculas, números e hífen; começa com letra ou número; não é nome de
// dispositivo do Windows.
export function nomeValido(nome) {
  if (typeof nome !== 'string' || nome.length === 0 || nome.length > TAMANHO_MAXIMO_NOME) return false;
  if (nome.startsWith('-') || nome.endsWith('-')) return false;
  for (const ch of nome) if (!PERMITIDOS.includes(ch)) return false;
  return !nomeReservadoDoWindows(nome);
}

// Sugere um nome válido a partir de um texto qualquer (tira acento, troca espaço por hífen).
export function sugerirNome(texto) {
  const semAcento = String(texto || '').normalize('NFD');
  let saida = '';
  for (const ch of semAcento.toLowerCase()) {
    if (PERMITIDOS.includes(ch)) saida += ch;
    else if (ch === ' ' || ch === '_' || ch === '.') saida += '-';
  }
  while (saida.includes('--')) saida = saida.replaceAll('--', '-');
  while (saida.startsWith('-')) saida = saida.slice(1);
  while (saida.endsWith('-')) saida = saida.slice(0, -1);
  saida = saida.slice(0, TAMANHO_MAXIMO_NOME);
  while (saida.endsWith('-')) saida = saida.slice(0, -1);
  // nome de dispositivo do Windows ganha um "-1" e vira um nome comum ("con" → "con-1")
  if (nomeReservadoDoWindows(saida)) saida = `${saida}-1`;
  return saida;
}

export function relativoARaiz(caminho) {
  const r = path.relative(RAIZ, caminho);
  if (r.startsWith('..') || path.isAbsolute(r)) return caminho.split(path.sep).join('/');
  return r.split(path.sep).join('/');
}

export function existe(caminho) {
  try {
    fs.accessSync(caminho);
    return true;
  } catch {
    return false;
  }
}

export function ehPasta(caminho) {
  try {
    return fs.statSync(caminho).isDirectory();
  } catch {
    return false;
  }
}

export function garantirPasta(caminho) {
  fs.mkdirSync(caminho, { recursive: true });
  return caminho;
}

export class ErroDeLink extends Error {
  constructor(caminho) {
    super(`link simbólico não é copiado: ${caminho}`);
    this.code = 'ESTUDIO_LINK';
    this.caminho = caminho;
  }
}

// Copia uma pasta inteira (sem .DS_Store nem Thumbs.db). Nunca segue link simbólico (nem junção
// do Windows): por padrão, um link é erro (ErroDeLink); com { links: 'recriar' }, o próprio link
// é recriado no destino apontando para o mesmo alvo, sem copiar o que está do outro lado.
export function copiarPasta(origem, destino, { links = 'erro' } = {}) {
  const raiz = fs.lstatSync(origem);
  if (raiz.isSymbolicLink()) throw new ErroDeLink(origem);
  fs.mkdirSync(destino, { recursive: true });
  for (const nome of fs.readdirSync(origem)) {
    if (nome === '.DS_Store' || nome === 'Thumbs.db') continue;
    const de = path.join(origem, nome);
    const para = path.join(destino, nome);
    const info = fs.lstatSync(de);
    if (info.isSymbolicLink()) {
      if (links !== 'recriar') throw new ErroDeLink(de);
      recriarLink(de, para);
    } else if (info.isDirectory()) copiarPasta(de, para, { links });
    else if (info.isFile()) fs.copyFileSync(de, para);
    else throw new ErroDeLink(de);
  }
}

// Recria o link de "de" em "para" (mesmo alvo). No Windows, link de pasta vira junção.
export function recriarLink(de, para) {
  const alvo = fs.readlinkSync(de);
  let tipo;
  if (EH_WINDOWS) {
    let ehDir = false;
    try {
      ehDir = fs.statSync(de).isDirectory();
    } catch {}
    tipo = ehDir ? 'junction' : 'file';
  }
  fs.symlinkSync(alvo, para, tipo);
}

// Pasta de verdade (lstat): link simbólico ou junção para uma pasta não conta.
function ehPastaSemSeguir(caminho) {
  try {
    return fs.lstatSync(caminho).isDirectory();
  } catch {
    return false;
  }
}

// Lista arquivos de uma pasta, recursivo, com caminho relativo em "/". Não entra em link
// simbólico: o link aparece como um item (quem apaga uma sobra apaga o link, nunca o alvo).
export function listarArquivos(base, rel = '') {
  const dir = path.join(base, rel);
  if (!ehPasta(dir)) return [];
  const saida = [];
  for (const nome of fs.readdirSync(dir).sort()) {
    if (nome === '.DS_Store' || nome === 'Thumbs.db') continue;
    const r = rel ? `${rel}/${nome}` : nome;
    if (ehPastaSemSeguir(path.join(base, r))) saida.push(...listarArquivos(base, r));
    else saida.push(r);
  }
  return saida;
}

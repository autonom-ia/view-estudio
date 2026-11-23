// Leitura e escrita de JSON e texto. A escrita é atômica: arquivo temporário e depois rename.
import fs from 'node:fs';
import path from 'node:path';
import { falha } from './saida.mjs';
import { relativoARaiz } from './caminhos.mjs';

export function lerTexto(caminho) {
  const texto = fs.readFileSync(caminho, 'utf8');
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

export function lerJson(caminho, padrao) {
  if (!fs.existsSync(caminho)) {
    if (padrao !== undefined) return padrao;
    falha('ARQUIVO_NAO_ACHADO', { arquivo: relativoARaiz(caminho) });
  }
  try {
    return JSON.parse(lerTexto(caminho));
  } catch (erro) {
    falha('ARQUIVO_INVALIDO', { arquivo: relativoARaiz(caminho), detalhe: String(erro.message) });
  }
  return padrao;
}

export function escreverTexto(caminho, texto) {
  fs.mkdirSync(path.dirname(caminho), { recursive: true });
  const tmp = `${caminho}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, texto);
  try {
    fs.renameSync(tmp, caminho);
  } catch {
    fs.copyFileSync(tmp, caminho);
    fs.rmSync(tmp, { force: true });
  }
}

export function escreverJson(caminho, objeto) {
  escreverTexto(caminho, `${JSON.stringify(objeto, null, 2)}\n`);
}

// Lê um arquivo CHAVE=VALOR (instalar/versoes.env). Linhas com # são comentário.
export function lerEnv(caminho) {
  const saida = {};
  if (!fs.existsSync(caminho)) return saida;
  for (const linhaBruta of lerTexto(caminho).split('\n')) {
    const linha = linhaBruta.trim();
    if (!linha || linha.startsWith('#')) continue;
    const igual = linha.indexOf('=');
    if (igual < 1) continue;
    saida[linha.slice(0, igual).trim()] = linha.slice(igual + 1).trim();
  }
  return saida;
}

// Vermelho não vai para o ar. O "checar", o "fatos" e o "acessibilidade", quando aprovam, anotam em
// revisao/conferencias.json a impressão digital da apresentação que conferiram; o "publicar" e o
// "pacote" só seguem quando as três aprovações valem para a apresentação como ela está agora.
// A impressão (SHA-256) cobre o que vai para o ar (os arquivos do pacote, lib/pacote.mjs) e o que as
// conferências leem fora dele (brief.md, com a tabela de fatos, e roteiro/, com a fala). É tirada no
// começo da conferência: o que mudar durante ela já não bate. Conferência que reprova apaga a sua.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { listarArquivos } from './caminhos.mjs';
import { arquivosDoPacote } from './pacote.mjs';
import { escreverJson } from './json.mjs';

export const CONFERENCIAS = Object.freeze(['checar', 'fatos', 'acessibilidade']);

const arquivoDasConferencias = (c) => path.join(c.revisao, 'conferencias.json');

// Arquivo que falta ou estragado vale como "nenhuma conferência": quem perde é só a pressa.
function lerAnotadas(c) {
  try {
    const v = JSON.parse(fs.readFileSync(arquivoDasConferencias(c), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

export function impressaoDaApresentacao(c) {
  const h = crypto.createHash('sha256');
  // Link entra pelo destino escrito nele, sem seguir (link para pasta não derruba a conferência; o
  // pacote recusa link de qualquer jeito). Arquivo que sumiu no meio entra vazio.
  const conteudo = (abs) => {
    let st;
    try {
      st = fs.lstatSync(abs);
    } catch {
      return Buffer.alloc(0);
    }
    if (st.isSymbolicLink()) return Buffer.from(`link:${fs.readlinkSync(abs)}`);
    return st.isFile() ? fs.readFileSync(abs) : Buffer.alloc(0);
  };
  const juntar = (rotulo, abs) => {
    h.update(`${rotulo}\0`);
    h.update(conteudo(abs));
    h.update('\0');
  };
  for (const rel of arquivosDoPacote(c.deck).arquivos) juntar(`deck/${rel}`, path.join(c.deck, ...rel.split('/')));
  juntar('brief.md', c.brief);
  for (const rel of listarArquivos(c.roteiro)) juntar(`roteiro/${rel}`, path.join(c.roteiro, ...rel.split('/')));
  return h.digest('hex');
}

// Anota o resultado de uma conferência: aprovada guarda a impressão tirada no começo; reprovada apaga.
export function anotarConferencia(c, comando, impressao, aprovada) {
  const novo = { ...lerAnotadas(c) };
  if (aprovada) novo[comando] = { impressao, em: new Date().toISOString() };
  else delete novo[comando];
  fs.mkdirSync(c.revisao, { recursive: true });
  escreverJson(arquivoDasConferencias(c), novo);
}

// As conferências que faltam (nunca rodaram, reprovaram, ou a apresentação mudou depois delas).
export function conferenciasQueFaltam(c) {
  const anotadas = lerAnotadas(c);
  const agora = impressaoDaApresentacao(c);
  return CONFERENCIAS.filter((cmd) => !(anotadas[cmd] && anotadas[cmd].impressao === agora));
}

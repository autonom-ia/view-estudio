// O que o painel de sites.autonomia.site recusa num pacote, conferido aqui antes de enviar, para a
// pessoa saber o motivo em palavras simples e não mandar duzentos megas à toa. Espelha
// framework/sites/painel/publicacao/pacote-regras.mjs e pacote-indice.mjs (repositório view_autonomia):
// tipo de arquivo fora da lista, nome com "\", ":", caractere de controle ou de direção de texto,
// pedaço de caminho com mais de 255 bytes ou caminho com mais de 1024, oculto (só .well-known/ na
// raiz passa), dois nomes iguais mudando só maiúscula (ou arquivo com o nome de uma pasta), mais de
// 10.000 arquivos, falta de index.html na raiz e mais de 200 MB. Sem expressão regular: laço por
// caractere, split, startsWith e endsWith.
import { reprovado } from './saida.mjs';

export const TETO_MB = 200;
export const MAX_ARQUIVOS = 10000;
const MB = 1024 * 1024;
const PEDACO_MAX_BYTES = 255;
const NOME_MAX_BYTES = 1024;
const PASTA_OCULTA_PERMITIDA = '.well-known';
// Faixas de caracteres que mudam a direção do texto (nome que se lê diferente do que é).
const DIRECAO = Object.freeze([[0x200e, 0x200f], [0x202a, 0x202e], [0x2066, 0x2069]]);

export const TIPOS_ACEITOS = Object.freeze([
  'html', 'htm', 'css', 'js', 'mjs', 'json', 'txt', 'xml', 'csv', 'svg',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico',
  'woff', 'woff2', 'ttf', 'otf',
  'mp4', 'webm', 'mp3', 'ogg', 'wav',
  'pdf', 'webmanifest', 'map',
  // 3D: modelo (glb, ou gltf com o bin dele) e o decodificador (wasm), aceitos pelo painel desde
  // autonom-ia/view_autonomia#125.
  'glb', 'gltf', 'bin', 'wasm',
]);

export const tipoAceito = (rel) => {
  const baixo = rel.split('/').pop().toLowerCase();
  return TIPOS_ACEITOS.some((ext) => baixo.endsWith(`.${ext}`));
};

const ehControle = (codigo) => codigo < 0x20 || (codigo >= 0x7f && codigo <= 0x9f) || DIRECAO.some(([de, ate]) => codigo >= de && codigo <= ate);

// O nome (caminho relativo à raiz do pacote) passa nas regras de nome do painel?
export function nomeAceito(rel) {
  if (rel === '' || rel.startsWith('/') || Buffer.byteLength(rel) > NOME_MAX_BYTES) return false;
  for (const letra of rel) {
    if (letra === '\\' || letra === ':' || ehControle(letra.codePointAt(0))) return false;
  }
  return rel.split('/').every((pedaco, posicao) => {
    if (pedaco === '' || pedaco === '.' || pedaco === '..') return false;
    if (Buffer.byteLength(pedaco) > PEDACO_MAX_BYTES) return false;
    return !pedaco.startsWith('.') || (posicao === 0 && pedaco === PASTA_OCULTA_PERMITIDA);
  });
}

// Pares de nomes que o painel trata como o mesmo (maiúscula, forma do acento) e arquivo com o nome
// de uma pasta. Devolve [[primeiro, segundo], ...].
export function nomesRepetidos(nomes) {
  const arquivos = new Map();
  const pastas = new Map();
  const repetidos = [];
  for (const rel of nomes) {
    const chave = rel.normalize('NFC').toLowerCase();
    if (arquivos.has(chave)) repetidos.push([arquivos.get(chave), rel]);
    else if (pastas.has(chave)) repetidos.push([pastas.get(chave), rel]);
    else arquivos.set(chave, rel);
    const partes = chave.split('/');
    const originais = rel.split('/');
    for (let k = 1; k < partes.length; k += 1) {
      const pasta = partes.slice(0, k).join('/');
      if (!pastas.has(pasta)) pastas.set(pasta, `${originais.slice(0, k).join('/')}/`);
    }
  }
  for (const [pasta, original] of pastas) if (arquivos.has(pasta)) repetidos.push([original, arquivos.get(pasta)]);
  return repetidos;
}

const comDeck = (rel) => `deck/${rel}`;

// Reprova (saída 2) com o primeiro motivo que o painel teria para recusar o pacote.
export function conferirParaOPainel(pacote) {
  if (!pacote.nomes.includes('index.html')) reprovado('DECK_SEM_INDEX', { arquivo: 'deck/index.html' });
  if (pacote.nomes.length > MAX_ARQUIVOS) reprovado('PUBLICAR_ARQUIVOS_DEMAIS', { arquivos: pacote.nomes.length, maximo: MAX_ARQUIVOS });
  const nomesRuins = pacote.nomes.filter((rel) => !nomeAceito(rel));
  if (nomesRuins.length) reprovado('PUBLICAR_NOME_DE_ARQUIVO_RECUSADO', { arquivos: nomesRuins.map(comDeck) });
  const recusados = pacote.nomes.filter((rel) => !tipoAceito(rel));
  if (recusados.length) reprovado('PUBLICAR_TIPO_NAO_ACEITO', { arquivos: recusados.map(comDeck) });
  const repetidos = nomesRepetidos(pacote.nomes);
  if (repetidos.length) reprovado('PUBLICAR_NOMES_REPETIDOS', { pares: repetidos.map((par) => par.map(comDeck)) });
  const maior = Math.max(pacote.zip.length, pacote.conteudoBytes);
  if (maior > TETO_MB * MB) reprovado('PUBLICAR_SITE_GRANDE_DEMAIS', { mb: Math.ceil(maior / MB), mb_max: TETO_MB });
}

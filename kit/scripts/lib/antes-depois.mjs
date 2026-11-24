// Onde mora o "antes e depois" de uma apresentação: apresentacoes/<nome>/revisao/antes-depois/, com
// antes/ (o que a mudança pode tocar: deck/, roteiro/, cenas/ e brief.md, guardados pelo "antes"),
// manifesto.json (o que existia e os arquivos pesados ligados), mudancas.json (escrito pelo
// assistente), estado.json (em aberto até a pessoa escolher), fotos/ e index.html (a página do
// "comparar"). Tudo fora de deck/: nada disso vai para a apresentação nem para o PDF.
// Portado do Site Estúdio (lib/antes-depois.mjs), adaptado a telas, cliques e vídeo de cena.
//
// Vídeo de cena não é duplicado. Arquivo pesado (vídeo, áudio, ou 2 MB ou mais) entra no antes como
// link fixo (hard link): o mesmo arquivo no disco, sem ocupar espaço de novo, no Mac, no Windows e no
// Linux. Isso é seguro porque o "cena" grava o vídeo novo ao lado e troca pelo nome (o arquivo antigo
// continua inteiro no antes). O que não é seguro é gravar por cima do mesmo arquivo: então o
// manifesto guarda a impressão digital (SHA-256) de cada pesado, e "comparar" e "escolher" recusam
// (ANTES_VIDEO_MUDOU) em vez de comparar ou devolver um antes que já não é o antes. Sem link fixo
// (outro disco), o arquivo é copiado; o resto é copiado com clonagem quando o disco sabe (APFS no
// Mac: cópia que não ocupa espaço até mudar).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { listarArquivos, ehPasta, existe, recriarLink } from './caminhos.mjs';
import { escreverJson } from './json.mjs';

export const MINIMO_DE_MUDANCAS = 2;
export const MAXIMO_DE_MUDANCAS = 3;

// O que uma mudança numa apresentação pode tocar (relativo à pasta da apresentação).
export const ITENS_GUARDADOS = Object.freeze(['deck', 'roteiro', 'cenas', 'brief.md']);

export const EXTENSOES_PESADAS = Object.freeze(['.mp4', '.webm', '.mov', '.m4v', '.mp3', '.m4a', '.wav', '.ogg']);
export const PESADO_BYTES = 2 * 1024 * 1024;

// As três respostas do "Qual fica?".
export const ESCOLHAS = Object.freeze(['depois', 'antes', 'outro']);

export function caminhosDoAntesDepois(c) {
  const pasta = path.join(c.revisao, 'antes-depois');
  return {
    pasta,
    antes: path.join(pasta, 'antes'),
    manifesto: path.join(pasta, 'manifesto.json'),
    mudancas: path.join(pasta, 'mudancas.json'),
    estado: path.join(pasta, 'estado.json'),
    fotos: path.join(pasta, 'fotos'),
    pagina: path.join(pasta, 'index.html'),
  };
}

export function ehPesado(nome, bytes) {
  const baixo = nome.toLowerCase();
  return bytes >= PESADO_BYTES || EXTENSOES_PESADAS.some((ext) => baixo.endsWith(ext));
}

export function impressao(arquivo) {
  return crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex');
}

// Guarda um arquivo: pesado vira link fixo (sem duplicar); o resto, cópia (clonada se der).
// Devolve 'link' ou 'copia'.
function guardarArquivo(de, para, pesado) {
  fs.mkdirSync(path.dirname(para), { recursive: true });
  if (pesado) {
    try {
      fs.linkSync(de, para);
      return 'link';
    } catch {
      // outro disco ou sistema sem link fixo: cai na cópia
    }
  }
  fs.copyFileSync(de, para, fs.constants.COPYFILE_FICLONE);
  return 'copia';
}

// Copia uma pasta (ou um arquivo) com a regra acima. Link simbólico não é seguido: o próprio link é
// recriado com o mesmo alvo (voltar ao antes devolve o link, sem copiar o que está do outro lado).
// Acrescenta em "pesados" os pesados guardados ({ rel, sha256, bytes, modo }).
function guardarItem(origem, destino, rel, pesados) {
  const info = fs.lstatSync(origem);
  if (info.isSymbolicLink()) {
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    recriarLink(origem, destino);
    return;
  }
  if (info.isDirectory()) {
    for (const nome of fs.readdirSync(origem).sort()) {
      if (nome === '.DS_Store' || nome === 'Thumbs.db') continue;
      guardarItem(path.join(origem, nome), path.join(destino, nome), `${rel}/${nome}`, pesados);
    }
    return;
  }
  if (!info.isFile()) return;
  const pesado = ehPesado(origem, info.size);
  const modo = guardarArquivo(origem, destino, pesado);
  if (pesado && pesados) pesados.push({ rel, sha256: impressao(origem), bytes: info.size, modo });
}

// Guarda os ITENS_GUARDADOS da apresentação em "antes". Devolve o manifesto.
export function guardarAntes(pastaDaApresentacao, antes) {
  fs.rmSync(antes, { recursive: true, force: true });
  fs.mkdirSync(antes, { recursive: true });
  const itens = [];
  const pesados = [];
  for (const item of ITENS_GUARDADOS) {
    const de = path.join(pastaDaApresentacao, item);
    if (!existe(de)) continue;
    itens.push(item);
    guardarItem(de, path.join(antes, item), item, pesados);
  }
  return { itens, pesados };
}

// Pesados do antes que mudaram desde o "antes" (alguém gravou por cima do mesmo arquivo).
export function pesadosAlterados(antes, manifesto) {
  const lista = Array.isArray(manifesto && manifesto.pesados) ? manifesto.pesados : [];
  return lista
    .filter((p) => {
      const arq = path.join(antes, ...String(p.rel).split('/'));
      return !fs.existsSync(arq) || impressao(arq) !== p.sha256;
    })
    .map((p) => p.rel);
}

// Devolve a apresentação ao que o antes guardou. Cada item é montado ao lado primeiro e só depois
// trocado, para uma cópia que falhe no meio nunca deixar a apresentação pela metade. Item que não
// existia no antes (uma cena criada na tentativa) sai.
export function restaurarAntes(pastaDaApresentacao, antes, manifesto) {
  const tinha = new Set(Array.isArray(manifesto && manifesto.itens) ? manifesto.itens : []);
  const restaurados = [];
  for (const item of ITENS_GUARDADOS) {
    const atual = path.join(pastaDaApresentacao, item);
    if (!tinha.has(item)) {
      if (existe(atual)) {
        fs.rmSync(atual, { recursive: true, force: true });
        restaurados.push(`-${item}`);
      }
      continue;
    }
    const novo = `${atual}.trocando`;
    fs.rmSync(novo, { recursive: true, force: true });
    guardarItem(path.join(antes, item), novo, item, null);
    fs.rmSync(atual, { recursive: true, force: true });
    fs.renameSync(novo, atual);
    restaurados.push(item);
  }
  return restaurados;
}

// Só as mudanças com título de verdade contam. "telas" (opcional) diz em que telas a mudança está:
// números (2) ou nomes de arquivo ("s02-numero.html"). Devolve { pedido, mudancas, ignoradas }.
export function lerMudancas(json) {
  const pedido = typeof json?.pedido === 'string' ? json.pedido.trim() : '';
  const lista = Array.isArray(json?.mudancas) ? json.mudancas : [];
  const mudancas = [];
  for (const m of lista) {
    const titulo = typeof m?.titulo === 'string' ? m.titulo.trim() : '';
    if (!titulo) continue;
    const telas = Array.isArray(m.telas) ? m.telas.filter((t) => typeof t === 'string' || Number.isInteger(t)) : [];
    mudancas.push({ titulo, porque: typeof m.porque === 'string' ? m.porque.trim() : '', telas });
  }
  return { pedido, mudancas, ignoradas: lista.length - mudancas.length };
}

// Duas pastas com os mesmos arquivos e o mesmo conteúdo, byte a byte?
export function pastasIguais(a, b) {
  const la = listarArquivos(a);
  const lb = listarArquivos(b);
  if (la.length !== lb.length || la.some((r, i) => r !== lb[i])) return false;
  return la.every((r) => {
    const x = path.join(a, ...r.split('/'));
    const y = path.join(b, ...r.split('/'));
    const lx = fs.lstatSync(x);
    const ly = fs.lstatSync(y);
    // link simbólico: igual quando os dois são link para o mesmo alvo (o alvo não é lido)
    if (lx.isSymbolicLink() || ly.isSymbolicLink()) return lx.isSymbolicLink() && ly.isSymbolicLink() && fs.readlinkSync(x) === fs.readlinkSync(y);
    const sx = fs.statSync(x);
    const sy = fs.statSync(y);
    if (sx.size !== sy.size) return false;
    if (sx.ino === sy.ino && sx.dev === sy.dev) return true;
    return fs.readFileSync(x).equals(fs.readFileSync(y));
  });
}

// Um item (pasta ou arquivo) igual ao guardado? Pasta com pastasIguais; arquivo, byte a byte.
function itemIgual(a, b) {
  if (ehPasta(a) || ehPasta(b)) return ehPasta(a) && ehPasta(b) && pastasIguais(a, b);
  if (!existe(a) || !existe(b)) return existe(a) === existe(b);
  return fs.readFileSync(a).equals(fs.readFileSync(b));
}

// A apresentação está igual ao que o antes guardou, em tudo o que uma mudança pode tocar? Item que
// não existia no antes e passou a existir (uma cena nova) conta como mudança.
export function igualAoAntes(pastaDaApresentacao, antes, manifesto) {
  const tinha = new Set(Array.isArray(manifesto && manifesto.itens) ? manifesto.itens : []);
  return ITENS_GUARDADOS.every((item) => {
    const atual = path.join(pastaDaApresentacao, item);
    if (!tinha.has(item)) return !existe(atual);
    return itemIgual(path.join(antes, item), atual);
  });
}

// Depois do "Qual fica?" resolvido (depois ou antes), o antes e as fotos saem: o vídeo velho que só
// o antes segurava não fica ocupando o disco. Ficam estado.json (para dizer que já foi resolvido) e
// mudancas.json (o que foi pedido e mudado).
export function fecharAntes(ad, escolha) {
  fs.rmSync(ad.antes, { recursive: true, force: true });
  fs.rmSync(ad.fotos, { recursive: true, force: true });
  fs.rmSync(ad.pagina, { force: true });
  fs.rmSync(ad.manifesto, { force: true });
  escreverJson(ad.estado, { aberto: false, escolha });
}

export const temAntes = (ad) => ehPasta(ad.antes);

// Onde mora o "antes e depois" de uma apresentação: apresentacoes/<nome>/revisao/antes-depois/, com
// antes/ (o que a mudança pode tocar: deck/, roteiro/, cenas/ e brief.md, guardados pelo "antes"),
// manifesto.json (o que existia e os arquivos pesados ligados), mudancas.json (escrito pelo
// assistente), estado.json (em aberto até a pessoa escolher), fotos/ e index.html (a página do
// "comparar") e tentativa/ (a versão que a pessoa viu e recusou, guardada pelo "escolher" antes de
// voltar, até o próximo "antes"). Tudo fora de deck/: nada disso vai para a apresentação nem para o PDF.
// Portado do Site Estúdio (lib/antes-depois.mjs), adaptado a telas, cliques e vídeo de cena.
//
// Vídeo de cena não é duplicado. Arquivo pesado (vídeo, áudio, ou 2 MB ou mais) entra no antes como
// link fixo (hard link): o mesmo arquivo no disco, sem ocupar espaço de novo, no Mac, no Windows e no
// Linux. Isso é seguro porque o "cena" grava o vídeo novo ao lado e troca pelo nome (o arquivo antigo
// continua inteiro no antes). O que não é seguro é gravar por cima do mesmo arquivo: então o
// manifesto guarda a impressão digital (SHA-256) de cada pesado, e "comparar" e "escolher" recusam
// (ANTES_VIDEO_MUDOU) em vez de comparar ou devolver um antes que já não é o antes. O arquivo não
// fica só para leitura: o link fixo é o mesmo arquivo da apresentação, e travá-lo travaria o vídeo
// da própria pessoa. Sem link fixo (outro disco, disco sem esse recurso), o arquivo é copiado; o resto é copiado com clonagem quando o disco sabe (APFS no Mac:
// cópia que não ocupa espaço até mudar).
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

// Erros do link fixo que querem dizer "este disco não faz link fixo aqui": outro disco (EXDEV),
// sistema sem o recurso (EPERM, ENOTSUP) ou arquivo com links demais (EMLINK). Nesses, copia.
// Qualquer outro erro (falta de espaço, arquivo sumido) sobe como veio.
export const ERROS_SEM_LINK_FIXO = Object.freeze(['EXDEV', 'EPERM', 'ENOTSUP', 'EMLINK']);
export const semLinkFixo = (erro) => Boolean(erro) && ERROS_SEM_LINK_FIXO.includes(erro.code);

// Arquivo lido aos pedaços: vídeo de cena pode ter centenas de MB e não precisa caber na memória.
const BLOCO = 1024 * 1024;

// As três respostas do "Qual fica?".
export const ESCOLHAS = Object.freeze(['depois', 'antes', 'outro']);

export function caminhosDoAntesDepois(c) {
  const pasta = path.join(c.revisao, 'antes-depois');
  return {
    pasta,
    antes: path.join(pasta, 'antes'),
    tentativa: path.join(pasta, 'tentativa'),
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

function lerAosPedacos(arquivo, cada) {
  const fd = fs.openSync(arquivo, 'r');
  try {
    const buf = Buffer.allocUnsafe(BLOCO);
    for (let lidos = fs.readSync(fd, buf); lidos > 0; lidos = fs.readSync(fd, buf)) cada(buf.subarray(0, lidos));
  } finally {
    fs.closeSync(fd);
  }
}

export function impressao(arquivo) {
  const hash = crypto.createHash('sha256');
  lerAosPedacos(arquivo, (pedaco) => hash.update(pedaco));
  return hash.digest('hex');
}

// Mesmo conteúdo, byte a byte, lendo os dois aos pedaços.
// Lê até encher o bloco ou o arquivo acabar: uma leitura pode devolver menos que o pedido (disco de
// rede, por exemplo) sem o arquivo ter acabado. Devolve quantos bytes leu.
function lerBloco(fd, buf, ler) {
  let total = 0;
  while (total < buf.length) {
    const lidos = ler(fd, buf, total, buf.length - total, null);
    if (lidos === 0) break;
    total += lidos;
  }
  return total;
}

// "ler" é injetável (fs.readSync) para os testes simularem leitura curta.
export function mesmoConteudo(x, y, ler = fs.readSync) {
  const fx = fs.openSync(x, 'r');
  const fy = fs.openSync(y, 'r');
  try {
    const bx = Buffer.allocUnsafe(BLOCO);
    const by = Buffer.allocUnsafe(BLOCO);
    for (;;) {
      const lx = lerBloco(fx, bx, ler);
      const ly = lerBloco(fy, by, ler);
      if (lx !== ly) return false;
      if (lx === 0) return true;
      if (!bx.subarray(0, lx).equals(by.subarray(0, ly))) return false;
    }
  } finally {
    fs.closeSync(fx);
    fs.closeSync(fy);
  }
}

// O mesmo arquivo no disco (link fixo)? Só quando o sistema dá um número de arquivo de verdade
// (maior que zero) e o disco é o mesmo; sem isso, quem decide é o conteúdo. Recebe stat com bigint
// (no Windows o número passa do que um Number guarda sem arredondar).
export function mesmoArquivo(sx, sy) {
  return sx.ino > 0n && sx.ino === sy.ino && sx.dev === sy.dev;
}

// Guarda um arquivo: pesado vira link fixo (sem duplicar); o resto, cópia (clonada se der).
// Devolve 'link' ou 'copia'.
function guardarArquivo(de, para, pesado) {
  fs.mkdirSync(path.dirname(para), { recursive: true });
  if (pesado) {
    try {
      fs.linkSync(de, para);
      return 'link';
    } catch (erro) {
      if (!semLinkFixo(erro)) throw erro;
    }
  }
  fs.copyFileSync(de, para, fs.constants.COPYFILE_FICLONE);
  return 'copia';
}

// O que o link aponta: 'arquivo', 'pasta' ou null (atalho quebrado, o alvo não existe).
function alvoDoLink(origem) {
  try {
    return fs.statSync(origem).isDirectory() ? 'pasta' : 'arquivo';
  } catch (erro) {
    if (erro.code === 'ENOENT' || erro.code === 'ENOTDIR') return null;
    throw erro;
  }
}

// Recria o link simbólico. No Windows sem modo de desenvolvedor, criar link de arquivo dá EPERM:
// aí o arquivo para onde ele aponta é copiado (o conteúdo fica igual; o atalho vira cópia) e entra
// em "atalhos" para o aviso. Atalho quebrado (o alvo não existe) não tem o que copiar: fica de fora
// e entra em "quebrados". Link de pasta vira junção, que não precisa de licença; outro erro sobe.
function guardarLink(origem, destino, rel, ctx) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  try {
    (ctx.criarLink || recriarLink)(origem, destino);
  } catch (erro) {
    if (erro.code !== 'EPERM') throw erro;
    const alvo = alvoDoLink(origem);
    if (alvo === 'pasta') throw erro;
    if (alvo === null) {
      if (ctx.quebrados) ctx.quebrados.push(rel);
      return;
    }
    fs.copyFileSync(origem, destino);
    if (ctx.atalhos) ctx.atalhos.push(rel);
  }
}

// Copia uma pasta (ou um arquivo) com a regra acima. Link simbólico não é seguido: o próprio link é
// recriado com o mesmo alvo (voltar ao antes devolve o link, sem copiar o que está do outro lado).
// ctx.pesados recebe os pesados guardados ({ rel, sha256, bytes, modo }). ctx.atalhos
// recebe os links que viraram cópia; ctx.criarLink é injetável para os testes.
function guardarItem(origem, destino, rel, ctx = {}) {
  const info = fs.lstatSync(origem);
  if (info.isSymbolicLink()) {
    guardarLink(origem, destino, rel, ctx);
    return;
  }
  if (info.isDirectory()) {
    for (const nome of fs.readdirSync(origem).sort()) {
      if (nome === '.DS_Store' || nome === 'Thumbs.db') continue;
      guardarItem(path.join(origem, nome), path.join(destino, nome), `${rel}/${nome}`, ctx);
    }
    return;
  }
  if (!info.isFile()) return;
  const pesado = ehPesado(origem, info.size);
  const modo = guardarArquivo(origem, destino, pesado);
  const { pesados } = ctx;
  if (!pesado || !pesados) return;
  pesados.push({ rel, sha256: impressao(origem), bytes: info.size, modo });
}

// Guarda os ITENS_GUARDADOS da apresentação em "antes". Devolve o manifesto ({ itens, pesados,
// atalhos, quebrados }: atalhos são os links que viraram cópia; quebrados, os que ficaram de fora
// por não apontarem para nada).
export function guardarAntes(pastaDaApresentacao, antes, { criarLink } = {}) {
  fs.rmSync(antes, { recursive: true, force: true });
  fs.mkdirSync(antes, { recursive: true });
  const itens = [];
  const pesados = [];
  const atalhos = [];
  const quebrados = [];
  for (const item of ITENS_GUARDADOS) {
    const de = path.join(pastaDaApresentacao, item);
    if (!existe(de)) continue;
    itens.push(item);
    guardarItem(de, path.join(antes, item), item, { pesados, atalhos, quebrados, criarLink });
  }
  return { itens, pesados, atalhos, quebrados };
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

// Devolve a apresentação ao que o antes guardou. Item que não existia no antes (uma cena criada na
// tentativa) sai. Ver restaurarDe.
export function restaurarAntes(pastaDaApresentacao, antes, manifesto, opcoes = {}) {
  const itens = Array.isArray(manifesto && manifesto.itens) ? manifesto.itens : [];
  return restaurarDe(pastaDaApresentacao, antes, itens, opcoes);
}

// Falha numa troca: diz qual item não trocou. A apresentação nunca fica sem o item (ver trocarItem).
export class ErroDeRestauracao extends Error {
  constructor(item, causa) {
    super(causa && causa.message ? causa.message : String(causa));
    this.codigo = 'RESTAURACAO_FALHOU';
    this.item = item;
    this.cause = causa;
  }
}

// Devolve a apresentação ao que está em "origem" (o antes, ou a tentativa quando uma troca anterior
// falhou), item por item. "renomear" é injetável para os testes simularem uma troca que falha.
export function restaurarDe(pastaDaApresentacao, origem, itens, { renomear = fs.renameSync } = {}) {
  const tinha = new Set(itens);
  const restaurados = [];
  for (const item of ITENS_GUARDADOS) {
    let feito;
    try {
      feito = trocarItem(pastaDaApresentacao, origem, item, tinha.has(item), renomear);
    } catch (erro) {
      throw new ErroDeRestauracao(item, erro);
    }
    if (feito) restaurados.push(feito);
  }
  return restaurados;
}

const existeSemSeguir = (caminho) => {
  try {
    fs.lstatSync(caminho);
    return true;
  } catch {
    return false;
  }
};

// Os nomes ao lado que uma troca usa: o novo é montado em .trocando e o atual sai por .descartando.
export const sobrasDaTroca = (atual) => ({ novo: `${atual}.trocando`, velho: `${atual}.descartando` });

// Sobra de uma troca que parou no meio (o programa morreu entre os dois nomes): se o item sumiu e
// o .descartando ficou, ele volta para o lugar. O .trocando é só uma cópia montada e sai.
function recuperarSobra(atual, renomear) {
  const { novo, velho } = sobrasDaTroca(atual);
  if (!existeSemSeguir(atual) && existeSemSeguir(velho)) renomear(velho, atual);
  fs.rmSync(novo, { recursive: true, force: true });
}

// Põe de volta no lugar todo item que uma troca parada no meio deixou fora (o deck sem index.html
// não abre). Só devolve o .descartando quando o item sumiu; nada é apagado além do .trocando.
export function recuperarSobras(pastaDaApresentacao, renomear = fs.renameSync) {
  for (const item of ITENS_GUARDADOS) recuperarSobra(path.join(pastaDaApresentacao, item), renomear);
}

// Troca um item sem deixar a apresentação sem ele: o novo é montado ao lado (.trocando), o atual
// vai para .descartando, o novo entra no lugar e só então o descartado sai. Se a entrada do novo
// falhar, o atual volta. Sobra de uma troca anterior: o item volta ao lugar primeiro
// (recuperarSobra); um .descartando que sobra com o item no lugar é a versão vista (já guardada na
// tentativa, que o "escolher" grava antes de qualquer troca) ou o antes, nunca a única cópia.
function trocarItem(pasta, origem, item, existia, renomear) {
  const atual = path.join(pasta, item);
  const { novo, velho } = sobrasDaTroca(atual);
  recuperarSobra(atual, renomear);
  fs.rmSync(velho, { recursive: true, force: true });
  if (!existia) {
    if (!existeSemSeguir(atual)) return null;
    fs.rmSync(atual, { recursive: true, force: true });
    return `-${item}`;
  }
  guardarItem(path.join(origem, item), novo, item);
  const tinhaAtual = existeSemSeguir(atual);
  if (tinhaAtual) renomear(atual, velho);
  try {
    renomear(novo, atual);
  } catch (erro) {
    if (tinhaAtual) renomear(velho, atual);
    fs.rmSync(novo, { recursive: true, force: true });
    throw erro;
  }
  fs.rmSync(velho, { recursive: true, force: true });
  return item;
}

// Guarda a versão que a pessoa viu (a tentativa) antes de voltar ao antes, em tentativa/, com o
// vídeo ligado como no antes. Fica até o próximo "antes" (ou o "depois"); uma tentativa nova
// substitui a anterior. Montada ao lado e trocada no fim. Se uma troca parou no meio, a versão vista
// de um item pode estar no .descartando (o item no lugar já é o antes, ou sumiu): é dele que a
// tentativa copia. Nada da apresentação é apagado aqui. Devolve os itens guardados.
export function guardarTentativa(pastaDaApresentacao, ad) {
  const montando = `${ad.tentativa}.guardando`;
  fs.rmSync(montando, { recursive: true, force: true });
  const itens = [];
  for (const item of ITENS_GUARDADOS) {
    const atual = path.join(pastaDaApresentacao, item);
    const { velho } = sobrasDaTroca(atual);
    const de = existeSemSeguir(velho) ? velho : atual;
    if (!existeSemSeguir(de)) continue;
    itens.push(item);
    guardarItem(de, path.join(montando, item), item);
  }
  fs.mkdirSync(montando, { recursive: true });
  fs.rmSync(ad.tentativa, { recursive: true, force: true });
  fs.renameSync(montando, ad.tentativa);
  return itens;
}

// Número escrito como texto ("2", " 3 "): vira número, para marcar a tela certa na página.
function telaComoNumero(t) {
  const limpo = t.trim();
  if (!limpo || [...limpo].some((ch) => ch < '0' || ch > '9')) return t;
  return Number(limpo);
}

// Só as mudanças com título de verdade contam. "telas" (opcional) diz em que telas a mudança está:
// números (2, ou "2" em texto) ou nomes de arquivo ("s02-numero.html"). Devolve { pedido, mudancas, ignoradas }.
export function lerMudancas(json) {
  const pedido = typeof json?.pedido === 'string' ? json.pedido.trim() : '';
  const lista = Array.isArray(json?.mudancas) ? json.mudancas : [];
  const mudancas = [];
  for (const m of lista) {
    const titulo = typeof m?.titulo === 'string' ? m.titulo.trim() : '';
    if (!titulo) continue;
    const telas = Array.isArray(m.telas)
      ? m.telas.filter((t) => typeof t === 'string' || Number.isInteger(t)).map((t) => (typeof t === 'string' ? telaComoNumero(t) : t))
      : [];
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
    const sx = fs.statSync(x, { bigint: true });
    const sy = fs.statSync(y, { bigint: true });
    if (sx.size !== sy.size) return false;
    if (mesmoArquivo(sx, sy)) return true;
    return mesmoConteudo(x, y);
  });
}

// Um item (pasta ou arquivo) igual ao guardado? Pasta com pastasIguais; arquivo, byte a byte.
function itemIgual(a, b) {
  if (ehPasta(a) || ehPasta(b)) return ehPasta(a) && ehPasta(b) && pastasIguais(a, b);
  if (!existe(a) || !existe(b)) return existe(a) === existe(b);
  return mesmoConteudo(a, b);
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
// o antes segurava não fica ocupando o disco. Ficam estado.json (para dizer que já foi resolvido),
// mudancas.json (o que foi pedido e mudado) e tentativa/ (a versão vista, até o próximo "antes").
// Com "depois", sai também a tentativa/ de um "outro" anterior: a pessoa ficou com a versão de agora.
// Devolve se havia tentativa e ela saiu.
export function fecharAntes(ad, escolha) {
  const tentativaSaiu = escolha === 'depois' && existeSemSeguir(ad.tentativa);
  if (tentativaSaiu) fs.rmSync(ad.tentativa, { recursive: true, force: true });
  fs.rmSync(ad.antes, { recursive: true, force: true });
  fs.rmSync(ad.fotos, { recursive: true, force: true });
  fs.rmSync(ad.pagina, { force: true });
  fs.rmSync(ad.manifesto, { force: true });
  escreverJson(ad.estado, { aberto: false, escolha });
  return tentativaSaiu;
}

export const temAntes = (ad) => ehPasta(ad.antes);
export const temTentativa = (ad) => ehPasta(ad.tentativa);

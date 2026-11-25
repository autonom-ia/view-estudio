// Monta o pacote de uma apresentação: o .zip da pasta deck/, em memória, com o SHA-256 e a contagem.
// É a apresentação pronta para abrir em qualquer navegador: index.html na raiz, as telas (slides/) e
// assets/ (letras, vendor, fotos e os vídeos de cena), com caminhos relativos e nada de fora.
// Usado pelo "pacote" (grava o zip, para hospedar onde a pessoa quiser) e pelo "publicar" (envia).
//
// O que nunca sobe: tudo o que mora fora de deck/ (brief, roteiro, coleta, revisao, prints, cenas e
// as composições *-hf/) e, dentro de deck/, o que não é da apresentação no ar:
// - teleprompter.html: leva a fala inteira e as notas de quem apresenta. Ele funciona publicado (o
//   aviso de tela e clique é BroadcastChannel, da mesma origem, sem o servidor do "abrir"), mas o
//   link do ar vai para a plateia, e a fala é de quem apresenta. Fica no computador.
// - rascunho: arquivo ou pasta que começa com "_" no topo de deck/ (_lab/, _rascunho.html; dentro
//   de assets/ ou slides/ o "_" é nome comum, como assets/_logo.png) e pasta terminada em -hf;
// - anotação (.md) e arquivo-fonte de desenho (.psd, .ai…).
// Antes de montar, recusa (saída 2):
// - PACOTE_ARQUIVO_PRIVADO: o que não pode ir para a internet: arquivo ou pasta oculta (só a pasta
//   .well-known/ na raiz passa, como no painel), link, .env, chave, e cópia de segurança (nome
//   terminado em .old, .backup, .bak, .orig, .tmp, .swp ou ~, e pasta backup, backups, old, _old ou tmp);
// - PACOTE_CITA_ARQUIVO_FORA: uma página, estilo ou script do pacote cita um arquivo que fica fora
//   dele (rascunho, teleprompter, anotação): no ar, a tela quebraria.
// Portado do Site Estúdio (lib/pacote.mjs), adaptado ao deck.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { listarArquivos } from './caminhos.mjs';
import { montarZip } from './zip.mjs';
import { reprovado } from './saida.mjs';
import { ehLicencaDeFonte } from './marca.mjs';

export const FORA_DO_PACOTE = Object.freeze(['.md', '.psd', '.ai', '.sketch', '.fig', '.xcf', '.afdesign', '.indd']);
export const TELEPROMPTER = 'teleprompter.html';
// Vídeo e áudio já vêm comprimidos: vão para o zip como estão.
const SEM_COMPRIMIR = Object.freeze(['.mp4', '.webm', '.mov', '.m4v', '.mp3', '.m4a', '.wav', '.ogg', '.woff2', '.jpg', '.jpeg', '.png', '.webp', '.avif']);
// Arquivos que os serviços de hospedagem leem pelo nome, sem nenhuma página citar.
const LIDOS_PELO_SERVIDOR = Object.freeze(['robots.txt', 'favicon.ico', 'cname', '_headers', '_redirects', '404.html']);
// Textos que citam outros arquivos. O .gltf (modelo 3D em texto) cita os .bin e as texturas dele.
const TEXTOS_QUE_CITAM = Object.freeze(['.html', '.css', '.js', '.mjs', '.json', '.webmanifest', '.xml', '.svg', '.gltf']);

const extensao = (rel) => {
  const nome = rel.split('/').pop().toLowerCase();
  const ponto = nome.lastIndexOf('.');
  return ponto > 0 ? nome.slice(ponto) : '';
};

// Rascunho: "_" na frente só no topo de deck/; pasta -hf (composição de cena) em qualquer lugar.
function ehRascunho(rel) {
  const pedacos = rel.split('/');
  const topo = pedacos[0];
  if (topo.startsWith('_') && !LIDOS_PELO_SERVIDOR.includes(topo.toLowerCase())) return true;
  return pedacos.slice(0, -1).some((pasta) => pasta.toLowerCase().endsWith('-hf'));
}

// Lixo que o sistema cria sozinho: o Finder (.DS_Store e ._nome, em pen drive), o Windows
// (Thumbs.db, desktop.ini). Nunca vai para o zip e não reprova.
const LIXO_DO_SISTEMA = Object.freeze(['.ds_store', 'thumbs.db', 'desktop.ini']);
export const ehLixoDoSistema = (nome) => LIXO_DO_SISTEMA.includes(nome.toLowerCase()) || nome.startsWith('._');

// Fica fora do pacote (sem reprovar): teleprompter, rascunho, anotação, arquivo-fonte de desenho e
// lixo do sistema.
export function foraDoPacote(rel) {
  if (rel === TELEPROMPTER) return true;
  if (ehLixoDoSistema(rel.split('/').pop())) return true;
  if (ehRascunho(rel)) return true;
  return FORA_DO_PACOTE.includes(extensao(rel));
}

// O único oculto que o painel aceita: a pasta .well-known/ na raiz (verificação de domínio).
const PASTA_OCULTA_PERMITIDA = '.well-known';
const FINS_DE_CHAVE = Object.freeze(['.pem', '.key']);
// Cópia de segurança e rascunho: valem para arquivo e para pasta ("assets.old/").
const FINS_DE_COPIA = Object.freeze(['.old', '.backup', '.bak', '.orig', '.tmp', '.swp', '~']);
const PASTAS_DE_COPIA = Object.freeze(['backup', 'backups', 'old', '_old', 'tmp']);

// Este nome (de arquivo ou pasta) pode estar na internet? naRaiz: está direto em deck/.
export function nomePrivado(nome, ehPasta, naRaiz = false) {
  const baixo = nome.toLowerCase();
  if (baixo.startsWith('.') && !(ehPasta && naRaiz && baixo === PASTA_OCULTA_PERMITIDA)) return true;
  if (FINS_DE_COPIA.some((fim) => baixo.endsWith(fim))) return true;
  if (ehPasta) return PASTAS_DE_COPIA.includes(baixo);
  if (baixo.includes('.env') || baixo.startsWith('id_rsa')) return true;
  return FINS_DE_CHAVE.some((fim) => baixo.endsWith(fim));
}

// Anda a pasta sem seguir link e devolve o que não pode ir (caminho relativo, "/" no fim se pasta).
export function arquivosPrivados(pasta, rel = '') {
  const achados = [];
  for (const nome of fs.readdirSync(path.join(pasta, ...rel.split('/').filter(Boolean))).sort()) {
    if (ehLixoDoSistema(nome)) continue;
    const r = rel ? `${rel}/${nome}` : nome;
    const st = fs.lstatSync(path.join(pasta, ...r.split('/')));
    if (st.isSymbolicLink()) achados.push(r);
    else if (st.isDirectory()) {
      if (nomePrivado(nome, true, rel === '')) achados.push(`${r}/`);
      else achados.push(...arquivosPrivados(pasta, r));
    } else if (nomePrivado(nome, false, rel === '')) achados.push(r);
  }
  return achados;
}

// O .gltf cita os arquivos dele como endereço ("roda%20dianteira.bin"): vale também o nome decodificado.
// Cada texto do JSON é decodificado sozinho (buffers, imagens e extensões), para um "%" solto num campo
// não estragar os outros. O BOM do começo não conta; JSON quebrado tenta o texto inteiro.
const BOM = '\uFEFF';
const decodificado = (texto) => {
  try {
    return decodeURIComponent(texto);
  } catch {
    return texto;
  }
};
const textosDoJson = (valor) => {
  if (typeof valor === 'string') return [valor];
  if (valor && typeof valor === 'object') return Object.values(valor).flatMap(textosDoJson);
  return [];
};
function comoCita(rel, texto) {
  if (extensao(rel) !== '.gltf') return texto;
  const semBom = texto.startsWith(BOM) ? texto.slice(BOM.length) : texto;
  let modelo;
  try {
    modelo = JSON.parse(semBom);
  } catch {
    return `${texto}\n${decodificado(semBom)}`;
  }
  const nomes = textosDoJson(modelo).filter((t) => t.includes('%') && !t.startsWith('data:')).map(decodificado);
  return [texto, ...nomes].join('\n');
}

const lerTextos = (pasta, arquivos) => arquivos
  .filter((rel) => TEXTOS_QUE_CITAM.includes(extensao(rel)))
  .map((rel) => ({ rel, texto: comoCita(rel, fs.readFileSync(path.join(pasta, ...rel.split('/')), 'utf8')) }));

// Letra que continua um nome de arquivo ou pasta (o resto, como aspas, parêntese, espaço, "?" e "#",
// termina o nome).
const continuaNome = (ch) => ch !== undefined && (ch.toLowerCase() !== ch.toUpperCase() || (ch >= '0' && ch <= '9') || '_-.~%'.includes(ch));

// O texto cita o caminho inteiro, e não só um pedaço de outro nome ("data.md" não cita "a.md";
// "assets/_lab/x.png" não cita "_lab/x.png")? Antes do caminho só vale fim de nome, ou "./" e "../".
export function citaCaminho(texto, caminho) {
  let i = texto.indexOf(caminho);
  while (i !== -1) {
    const depois = texto[i + caminho.length];
    let k = i;
    for (;;) {
      if (k >= 3 && texto.startsWith('../', k - 3)) k -= 3;
      else if (k >= 2 && texto.startsWith('./', k - 2)) k -= 2;
      else break;
    }
    const antes = texto[k - 1];
    if (!continuaNome(antes) && antes !== '/' && !continuaNome(depois) && depois !== '/') return true;
    i = texto.indexOf(caminho, i + 1);
  }
  return false;
}

// O texto cita este nome de arquivo inteiro, e não só um pedaço de outro ("data.png" não cita
// "a.png"; "a.png.bak" também não)? Antes e depois do nome só vale o que termina um nome, inclusive a
// "/" da pasta.
export function citaNome(texto, nome) {
  let i = texto.indexOf(nome);
  while (i !== -1) {
    if (!continuaNome(texto[i - 1]) && !continuaNome(texto[i + nome.length])) return true;
    i = texto.indexOf(nome, i + 1);
  }
  return false;
}

// Arquivos que ficam fora do pacote e que uma página, estilo ou script do pacote cita, pelo caminho a
// partir da raiz de deck/ ou a partir da pasta de quem cita ("../_lab/foto.png"). [{ arquivo, citado_em }]
export function citadosForaDoPacote(pasta, arquivos, fora) {
  const textos = lerTextos(pasta, arquivos);
  const achados = [];
  for (const rel of fora) {
    const quem = textos.find((t) => {
      const relativo = path.posix.relative(path.posix.dirname(t.rel), rel);
      return citaCaminho(t.texto, rel) || citaCaminho(t.texto, relativo);
    });
    if (quem) achados.push({ arquivo: `deck/${rel}`, citado_em: `deck/${quem.rel}` });
  }
  return achados;
}

// Arquivos (fora as páginas) cujo nome inteiro não aparece em nenhuma página, CSS, script ou manifesto.
export function arquivosNaoCitados(pasta, arquivos) {
  const textos = lerTextos(pasta, arquivos);
  const soltos = [];
  for (const rel of arquivos) {
    const nome = rel.split('/').pop();
    if (extensao(rel) === '.html' || LIDOS_PELO_SERVIDOR.includes(nome.toLowerCase())) continue;
    if (ehLicencaDeFonte(nome) || nome.toUpperCase().startsWith('LICENSE')) continue;
    if (!textos.some((t) => t.rel !== rel && citaNome(t.texto, nome))) soltos.push(rel);
  }
  return soltos;
}

// Os arquivos de deck/ que vão para o ar (caminho relativo a deck/) e os que ficam de fora.
export function arquivosDoPacote(deck) {
  const todos = listarArquivos(deck);
  const fora = todos.filter((rel) => foraDoPacote(rel) && !ehLixoDoSistema(rel.split('/').pop()));
  return { arquivos: todos.filter((rel) => !foraDoPacote(rel)), fora };
}

// Monta o zip de deck/ sem gravar nada. Recusa com PACOTE_ARQUIVO_PRIVADO (saída 2) antes de ler
// qualquer arquivo para o zip. Caminhos devolvidos são relativos a deck/.
export function montarPacote(deck) {
  const privados = arquivosPrivados(deck);
  if (privados.length) reprovado('PACOTE_ARQUIVO_PRIVADO', { arquivos: privados.map((r) => `deck/${r}`) });
  const { arquivos, fora } = arquivosDoPacote(deck);
  const citados = citadosForaDoPacote(deck, arquivos, fora);
  if (citados.length) reprovado('PACOTE_CITA_ARQUIVO_FORA', { arquivos: citados });
  const entradas = arquivos.map((rel) => {
    const abs = path.join(deck, ...rel.split('/'));
    return { nome: rel, dados: fs.readFileSync(abs), data: fs.statSync(abs).mtime, guardar: SEM_COMPRIMIR.includes(extensao(rel)) };
  });
  const zip = montarZip(entradas);
  // Impressão do conteúdo: nomes e bytes, em ordem, sem a data dos arquivos (que muda o zip). É ela
  // que diz se um envio sem resposta era deste mesmo conteúdo.
  const impressao = crypto.createHash('sha256');
  for (const e of [...entradas].sort((a, b) => (a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0))) {
    impressao.update(`${e.nome}\0${e.dados.length}\0`);
    impressao.update(e.dados);
  }
  return {
    zip,
    sha256: crypto.createHash('sha256').update(zip).digest('hex'),
    impressao: impressao.digest('hex'),
    arquivos: entradas.length,
    nomes: arquivos,
    telas: arquivos.filter((a) => a.endsWith('.html') && a !== 'index.html').length,
    videos: arquivos.filter((a) => ['.mp4', '.webm'].includes(extensao(a))).length,
    conteudoBytes: entradas.reduce((s, e) => s + e.dados.length, 0),
    foraDoPacote: fora,
    naoCitados: arquivosNaoCitados(deck, arquivos),
  };
}

// Atualização do estúdio (adaptada do Estúdio de Reels): baixa o zip da versão nova só do endereço
// oficial, confere o SHA-256 publicado ao lado, troca só se a VERSAO subiu, preserva as pastas do
// usuário e guarda a versão anterior para voltar se algo falhar no meio.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { rodar } from './executar.mjs';
import { KitErro } from './saida.mjs';
import { lerEnv, lerTexto } from './json.mjs';
import { PASTAS_DO_USUARIO, NOME_PASTA_FERRAMENTAS, copiarPasta, recriarLink } from './caminhos.mjs';
import { tentarTrava, soltarTrava } from './trava.mjs';

export const DONO_OFICIAL = 'autonom-ia';
export const REPOSITORIO_OFICIAL = 'view-estudio';
export const ENDERECO_OFICIAL = `https://github.com/${DONO_OFICIAL}/${REPOSITORIO_OFICIAL}/`;
export const ENDERECO_PADRAO = `${ENDERECO_OFICIAL}releases/latest/download/view-estudio.zip`;
// Nunca trocados: trabalho do usuário, programas instalados, git e as permissões locais.
export const PRESERVADOS = Object.freeze([...PASTAS_DO_USUARIO, NOME_PASTA_FERRAMENTAS, 'node_modules', '.git']);
// Para onde o GitHub redireciona o download de um release.
export const HOSTS_DE_DOWNLOAD = Object.freeze(['github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com']);
export const MAX_REDIRECIONAMENTOS = 5;
const COPIAS_GUARDADAS = 2;
// Pastas de configuração dos assistentes: trocadas inteiras, mas as skills que a pessoa (ou um
// instalador como o do hyperframes) pôs nelas voltam para o lugar.
const PASTAS_DE_SKILLS = Object.freeze(['.claude', '.agents']);
const LIXO_DO_SISTEMA = Object.freeze(['.ds_store', 'thumbs.db']);
// Uma atualização por instalação: a trava fica em .ferramentas/ e guarda o pid de quem atualiza.
export const NOME_TRAVA = 'atualizando.trava';

const erro = (codigo, dados = {}) => new KitErro(codigo, dados, 1);

// Nome comparável em disco que não diferencia maiúsculas (APFS, NTFS): NFC e minúsculas.
export const nomeNormal = (nome) => String(nome).normalize('NFC').toLowerCase();
const PRESERVADOS_NORMAIS = new Set(PRESERVADOS.map(nomeNormal));

export function lerVersao(raiz) {
  const arq = path.join(raiz, 'VERSAO');
  if (!fs.existsSync(arq)) return null;
  return lerTexto(arq).trim() || null;
}

// -1, 0 ou 1. "1.10.0" > "1.9.3". Partes que não são número contam como 0.
export function compararVersoes(a, b) {
  const pa = String(a || '0').split('.').map((p) => Number(p) || 0);
  const pb = String(b || '0').split('.').map((p) => Number(p) || 0);
  for (let k = 0; k < Math.max(pa.length, pb.length); k += 1) {
    const x = pa[k] || 0;
    const y = pb[k] || 0;
    if (x !== y) return x > y ? 1 : -1;
  }
  return 0;
}

// https, sem usuário, senha nem porta. Devolve o URL lido ou null.
function urlSegura(texto) {
  if (typeof texto !== 'string' || texto.includes('\\')) return null;
  let u;
  try {
    u = new URL(texto);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return null;
  return u;
}

// Endereço de origem da atualização: só os releases do repositório oficial. O caminho é lido
// depois de normalizado pelo URL (que resolve "..") e qualquer "%" no texto cru é recusado
// (um "%2e%2e" escondido não chega a virar caminho de outro repositório).
export function enderecoAceito(texto) {
  if (typeof texto !== 'string' || texto.includes('%')) return false;
  const u = urlSegura(texto);
  if (!u || u.hostname !== 'github.com') return false;
  return u.pathname.startsWith(`/${DONO_OFICIAL}/${REPOSITORIO_OFICIAL}/releases/`);
}

// Destino de um redirecionamento do download: só os hosts do GitHub que servem releases.
export function destinoDeDownloadAceito(texto) {
  const u = urlSegura(texto);
  return Boolean(u) && HOSTS_DE_DOWNLOAD.includes(u.hostname);
}

export function enderecoConfigurado(raiz) {
  const env = lerEnv(path.join(raiz, 'instalar', 'versoes.env'));
  return env.ESTUDIO_ATUALIZAR_URL || ENDERECO_PADRAO;
}

const sha256 = (arquivo) => crypto.createHash('sha256').update(fs.readFileSync(arquivo)).digest('hex');
const primeiraPalavra = (texto) => String(texto).trim().split(' ')[0].split('\t')[0].trim().toLowerCase();

// Baixa seguindo os redirecionamentos à mão (no máximo 5), conferindo cada destino.
// "buscar" existe para os testes (padrão: fetch).
export async function baixar(url, destino, buscar = fetch) {
  let atual = url;
  for (let salto = 0; salto <= MAX_REDIRECIONAMENTOS; salto += 1) {
    let r;
    try {
      r = await buscar(atual, { redirect: 'manual' });
    } catch (e) {
      throw erro('ATUALIZACAO_DOWNLOAD_FALHOU', { url, detalhe: String(e.message) });
    }
    if (r.status >= 300 && r.status < 400) {
      const local = r.headers.get('location');
      if (!local) throw erro('ATUALIZACAO_DOWNLOAD_FALHOU', { url, status: r.status });
      let proximo;
      try {
        proximo = new URL(local, atual).href;
      } catch {
        throw erro('ATUALIZACAO_ENDERECO_ESTRANHO', { url: local });
      }
      if (!destinoDeDownloadAceito(proximo)) throw erro('ATUALIZACAO_ENDERECO_ESTRANHO', { url: proximo });
      atual = proximo;
      continue;
    }
    if (!r.ok) throw erro('ATUALIZACAO_DOWNLOAD_FALHOU', { url, status: r.status });
    fs.writeFileSync(destino, Buffer.from(await r.arrayBuffer()));
    return atual;
  }
  throw erro('ATUALIZACAO_DOWNLOAD_FALHOU', { url, detalhe: `mais de ${MAX_REDIRECIONAMENTOS} redirecionamentos` });
}

// Pega o zip (local ou do endereço oficial) e confere o SHA-256.
export async function obterZip(origem, tmp, buscar = fetch) {
  const zip = path.join(tmp, 'novo.zip');
  let esperado;
  if (fs.existsSync(origem)) {
    if (!fs.existsSync(`${origem}.sha256`)) throw erro('ATUALIZACAO_ARQUIVO_DIFERENTE', { motivo: 'falta o .sha256 ao lado do zip' });
    esperado = primeiraPalavra(lerTexto(`${origem}.sha256`));
    fs.copyFileSync(origem, zip);
  } else {
    if (!enderecoAceito(origem)) throw erro('ATUALIZACAO_ENDERECO_ESTRANHO', { url: origem });
    await baixar(`${origem}.sha256`, path.join(tmp, 'novo.zip.sha256'), buscar);
    esperado = primeiraPalavra(lerTexto(path.join(tmp, 'novo.zip.sha256')));
    await baixar(origem, zip, buscar);
  }
  if (esperado.length !== 64 || sha256(zip) !== esperado) throw erro('ATUALIZACAO_ARQUIVO_DIFERENTE', { motivo: 'SHA-256 não confere' });
  return zip;
}

export async function extrairZip(zip, destino) {
  fs.mkdirSync(destino, { recursive: true });
  const tentativas = [
    ['tar', ['-xf', zip, '-C', destino]],
    ['unzip', ['-q', '-o', zip, '-d', destino]],
  ];
  for (const [prog, args] of tentativas) {
    const r = await rodar(prog, args, { timeoutMs: 5 * 60 * 1000 });
    if (r.codigo === 0) return true;
  }
  throw erro('ATUALIZACAO_ZIP_NAO_ABRIU', {});
}

// Anda a árvore extraída sem seguir nada: link simbólico, junção ou qualquer coisa que não seja
// arquivo ou pasta comum recusa o zip inteiro.
export function recusarLinks(dir, base = dir) {
  for (const nome of fs.readdirSync(dir)) {
    const c = path.join(dir, nome);
    const info = fs.lstatSync(c);
    if (info.isSymbolicLink() || (!info.isDirectory() && !info.isFile())) {
      throw erro('ATUALIZACAO_ARQUIVO_DIFERENTE', { motivo: 'o zip tem link simbólico', arquivo: path.relative(base, c).split(path.sep).join('/') });
    }
    if (info.isDirectory()) recusarLinks(c, base);
  }
}

// Acha a raiz da versão nova (a pasta com VERSAO), até 2 níveis abaixo.
export function acharRaizNova(dir, nivel = 0) {
  if (fs.existsSync(path.join(dir, 'VERSAO'))) return dir;
  if (nivel >= 2) return null;
  for (const nome of fs.readdirSync(dir)) {
    const c = path.join(dir, nome);
    if (fs.lstatSync(c).isDirectory()) {
      const achou = acharRaizNova(c, nivel + 1);
      if (achou) return achou;
    }
  }
  return null;
}

// Itens de topo do zip que, num disco que não diferencia maiúsculas, cairiam por cima de uma
// pasta preservada (APRESENTACOES, Minha-Marca…) ou da VERSAO, ou um por cima do outro: recusa.
export function conferirNomesDeTopo(nomes) {
  const vistos = new Map();
  for (const nome of nomes) {
    const n = nomeNormal(nome);
    if (PRESERVADOS_NORMAIS.has(n) && !PRESERVADOS.includes(nome)) {
      throw erro('ATUALIZACAO_ARQUIVO_DIFERENTE', { motivo: 'o zip tem um item com o nome de uma pasta sua', arquivo: nome });
    }
    if (n === 'versao' && nome !== 'VERSAO') throw erro('ATUALIZACAO_ARQUIVO_DIFERENTE', { motivo: 'nome de VERSAO diferente', arquivo: nome });
    if (vistos.has(n)) throw erro('ATUALIZACAO_ARQUIVO_DIFERENTE', { motivo: 'dois itens com o mesmo nome', arquivo: nome });
    vistos.set(n, nome);
  }
}

function mesmoConteudo(a, b) {
  const ea = fs.existsSync(a);
  const eb = fs.existsSync(b);
  if (!ea || !eb) return ea === eb;
  return sha256(a) === sha256(b);
}

// O que a versão nova mudou que pede o instalador de novo: pacotes (npm) ou versões fixas
// (Node, navegador, FFmpeg) em instalar/versoes.env.
export function dependenciasQueMudaram(raiz, nova) {
  const quais = [];
  if (!mesmoConteudo(path.join(raiz, 'package.json'), path.join(nova, 'package.json'))
    || !mesmoConteudo(path.join(raiz, 'package-lock.json'), path.join(nova, 'package-lock.json'))) quais.push('pacotes');
  if (!mesmoConteudo(path.join(raiz, 'instalar', 'versoes.env'), path.join(nova, 'instalar', 'versoes.env'))) quais.push('versoes');
  return quais;
}

function limparCopiasAntigas(ferr) {
  if (!fs.existsSync(ferr)) return;
  const lista = fs.readdirSync(ferr).filter((n) => n.startsWith('versao-anterior-')).sort();
  for (const n of lista.slice(0, Math.max(0, lista.length - COPIAS_GUARDADAS))) fs.rmSync(path.join(ferr, n), { recursive: true, force: true });
}

function carimbo() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Cópia em JavaScript puro: erro de leitura vira exceção comum (o cpSync nativo pode derrubar o processo).
function copiarItem(de, para) {
  const info = fs.lstatSync(de);
  if (info.isDirectory()) copiarPasta(de, para);
  else fs.copyFileSync(de, para);
}

const existeSemSeguir = (c) => {
  try {
    fs.lstatSync(c);
    return true;
  } catch {
    return false;
  }
};

// Devolve à versão nova o que é da pessoa dentro das pastas trocadas: as permissões locais e as
// skills que não vieram na versão nova. Copia (não move): a cópia anterior fica inteira para a volta.
function recolocarDoUsuario(raiz, antigo) {
  const local = path.join(antigo, '.claude', 'settings.local.json');
  if (existeSemSeguir(local)) {
    fs.mkdirSync(path.join(raiz, '.claude'), { recursive: true });
    fs.copyFileSync(local, path.join(raiz, '.claude', 'settings.local.json'));
  }
  const recolocadas = [];
  for (const pasta of PASTAS_DE_SKILLS) {
    const velhas = path.join(antigo, pasta, 'skills');
    if (!existeSemSeguir(velhas) || !fs.lstatSync(velhas).isDirectory()) continue;
    const novas = path.join(raiz, pasta, 'skills');
    const jaTem = new Set(existeSemSeguir(novas) ? fs.readdirSync(novas).map(nomeNormal) : []);
    for (const nome of fs.readdirSync(velhas)) {
      if (jaTem.has(nomeNormal(nome)) || LIXO_DO_SISTEMA.includes(nomeNormal(nome))) continue;
      const de = path.join(velhas, nome);
      const para = path.join(novas, nome);
      fs.mkdirSync(novas, { recursive: true });
      const info = fs.lstatSync(de);
      if (info.isSymbolicLink()) recriarLink(de, para);
      else if (info.isDirectory()) copiarPasta(de, para, { links: 'recriar' });
      else fs.copyFileSync(de, para);
      recolocadas.push(`${pasta}/skills/${nome}`);
    }
  }
  return recolocadas;
}

const EXECUTAVEIS = Object.freeze(['estudio', path.join('instalar', 'instalar.sh'), path.join('instalar', 'ambiente.sh'), path.join('instalar', 'verificar.sh')]);

// Troca item por item; a VERSAO é sempre o último passo. Qualquer falha no meio (inclusive ao
// devolver as permissões locais e as skills da pessoa) devolve tudo do backup.
// "antesDaVersao" existe para os testes simularem uma falha no fim.
export function aplicarVersao(raiz, nova, ferr, { antesDaVersao } = {}) {
  const topoNovo = fs.readdirSync(nova);
  conferirNomesDeTopo(topoNovo);
  const nomesNovos = new Set(topoNovo.map(nomeNormal));
  const fica = (nome) => PRESERVADOS_NORMAIS.has(nomeNormal(nome)) || LIXO_DO_SISTEMA.includes(nomeNormal(nome)) || nome === 'VERSAO';
  const itens = topoNovo.filter((n) => !fica(n));
  // itens de topo que a versão nova não tem mais: vão para a cópia anterior
  const sumidos = fs.readdirSync(raiz).filter((n) => !fica(n) && !nomesNovos.has(nomeNormal(n)));
  // Pasta exclusiva (mkdtemp): duas trocas no mesmo segundo nunca dividem a mesma cópia anterior.
  // O carimbo vem antes do sufixo aleatório, então limparCopiasAntigas continua ordenando por data.
  fs.mkdirSync(ferr, { recursive: true });
  const antigo = fs.mkdtempSync(path.join(ferr, `versao-anterior-${carimbo()}-`));
  const trocados = [];
  let falhou = null;
  let recolocadas = [];
  let etapa = '';
  try {
    for (const nome of itens) {
      etapa = nome;
      if (existeSemSeguir(path.join(raiz, nome))) fs.renameSync(path.join(raiz, nome), path.join(antigo, nome));
      trocados.push(nome);
      copiarItem(path.join(nova, nome), path.join(raiz, nome));
    }
    for (const nome of sumidos) {
      etapa = nome;
      fs.renameSync(path.join(raiz, nome), path.join(antigo, nome));
      trocados.push(nome);
    }
    etapa = '.claude/settings.local.json';
    recolocadas = recolocarDoUsuario(raiz, antigo);
    if (process.platform !== 'win32') {
      for (const nome of EXECUTAVEIS) if (fs.existsSync(path.join(raiz, nome))) fs.chmodSync(path.join(raiz, nome), 0o755);
    }
    if (antesDaVersao) antesDaVersao();
    etapa = 'VERSAO';
    if (existeSemSeguir(path.join(raiz, 'VERSAO'))) fs.renameSync(path.join(raiz, 'VERSAO'), path.join(antigo, 'VERSAO'));
    trocados.push('VERSAO');
    fs.copyFileSync(path.join(nova, 'VERSAO'), path.join(raiz, 'VERSAO'));
  } catch (e) {
    falhou = { nome: etapa, detalhe: String(e.message) };
  }
  if (falhou) {
    let voltou = true;
    for (const nome of [...trocados].reverse()) {
      try {
        fs.rmSync(path.join(raiz, nome), { recursive: true, force: true });
        if (existeSemSeguir(path.join(antigo, nome))) fs.renameSync(path.join(antigo, nome), path.join(raiz, nome));
      } catch {
        voltou = false;
      }
    }
    if (voltou) {
      fs.rmSync(antigo, { recursive: true, force: true });
      throw erro('ATUALIZACAO_FALHOU', { arquivo: falhou.nome, detalhe: falhou.detalhe });
    }
    throw erro('ATUALIZACAO_INCOMPLETA', { arquivo: falhou.nome, copia_anterior: antigo });
  }
  limparCopiasAntigas(ferr);
  return { copia: antigo, sumidos, recolocadas };
}

// Trava exclusiva da instalação. Dono vivo: ATUALIZACAO_EM_ANDAMENTO. Dono morto: a trava é tomada.
export function pegarTravaDeAtualizacao(ferr) {
  fs.mkdirSync(ferr, { recursive: true });
  const arquivo = path.join(ferr, NOME_TRAVA);
  const r = tentarTrava(arquivo);
  if (!r.pegou) throw erro('ATUALIZACAO_EM_ANDAMENTO', { pid: r.dono });
  return arquivo;
}

export async function atualizarEstudio({ raiz, ferr, origem, buscar = fetch }) {
  const trava = pegarTravaDeAtualizacao(ferr);
  let tmp = null;
  try {
    // lida só depois da trava: outra atualização pode ter acabado de trocar a versão
    const de = lerVersao(raiz);
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-atualizar-'));
    const zip = await obterZip(origem, tmp, buscar);
    const extraido = path.join(tmp, 'novo');
    await extrairZip(zip, extraido);
    recusarLinks(extraido);
    const nova = acharRaizNova(extraido);
    if (!nova) throw erro('ATUALIZACAO_ARQUIVO_DIFERENTE', { motivo: 'o zip não tem VERSAO' });
    const para = lerVersao(nova);
    if (compararVersoes(para, de) <= 0) return { atualizou: false, de, para };
    const mudaram = dependenciasQueMudaram(raiz, nova);
    const r = aplicarVersao(raiz, nova, ferr);
    return { atualizou: true, de, para, copia: r.copia, sumidos: r.sumidos, recolocadas: r.recolocadas, dependencias: mudaram.length > 0, mudaram };
  } finally {
    if (tmp) fs.rmSync(tmp, { recursive: true, force: true });
    soltarTrava(trava);
  }
}

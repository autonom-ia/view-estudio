// Guarda a apresentação como está agora, antes de uma mudança, para o "comparar" mostrar o antes e
// o depois. Uso: ./estudio antes <nome> [--de-novo]. Guarda deck/, roteiro/, cenas/ e brief.md (vídeo
// e arquivo pesado como link fixo, sem duplicar: lib/antes-depois.mjs) e deixa um mudancas.json de
// molde para o assistente preencher com 2 ou 3 mudanças concretas.
// Enquanto a pessoa não escolhe (./estudio escolher), o antes fica em aberto e não é trocado: rodar
// "antes" de novo reprova com ANTES_EM_ABERTO, para a tentativa recusada nunca virar o "antes".
// --de-novo troca mesmo assim (só quando a pessoa pediu para partir de como a apresentação está agora),
// mas nunca com uma volta ao antes parada no meio (estado.restauracao_pendente): aí a apresentação está
// meio no antes e tentativa/ guarda a única cópia inteira da versão vista.
// O que sai da comparação anterior (antes, versão vista, fotos, pedido) vai listado em dados.apagados.
// Nada é apagado antes de o novo estar inteiro: a comparação nova é montada ao lado
// (revisao/antes-depois.guardando) e entra no lugar da anterior de uma vez (lib/antes-depois.mjs,
// trocarPasta). A anterior é fechada antes da troca: se a troca falha (no Windows, um arquivo aberto em
// outro programa), reprova com ANTES_NAO_TROCADO, a apresentação não muda e o "escolher" não usa uma
// comparação que a pessoa pediu para deixar. Rodar "antes" de novo termina. Troca feita com a cópia
// velha ainda ao lado (não saiu agora) vale, com o aviso SOBRA_DA_TROCA.
// Portado do Site Estúdio (comando "antes").
import fs from 'node:fs';
import path from 'node:path';
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao } from '../lib/apresentacao.mjs';
import { listarArquivos, relativoARaiz } from '../lib/caminhos.mjs';
import { escreverJson, lerJson } from '../lib/json.mjs';
import { aviso, reprovado } from '../lib/saida.mjs';
import { caminhosDoAntesDepois, guardarAntes, lerMudancas, recuperarComparacao, temAntes, trocarPasta } from '../lib/antes-depois.mjs';

// O que da comparação anterior vai sair (o antes, a versão vista, as fotos e o pedido), para o
// assistente saber o que foi apagado. null quando não havia nada.
function oQueSai(ad) {
  const contar = (pasta) => listarArquivos(pasta).length;
  let mudancas = { pedido: '', mudancas: [] };
  try {
    mudancas = lerMudancas(JSON.parse(fs.readFileSync(ad.mudancas, 'utf8')));
  } catch (erro) {
    if (erro.code !== 'ENOENT' && !(erro instanceof SyntaxError)) throw erro;
  }
  const saem = {
    antes: contar(ad.antes),
    tentativa: contar(ad.tentativa),
    fotos: contar(ad.fotos),
    pedido: mudancas.pedido,
    mudancas: mudancas.mudancas.map((m) => m.titulo),
  };
  const nada = !saem.antes && !saem.tentativa && !saem.fotos && !saem.pedido && !saem.mudancas.length;
  return nada ? null : saem;
}

// Atalho que virou cópia e atalho quebrado que ficou de fora (Windows sem licença de atalho).
export function avisosDosAtalhos({ atalhos = [], quebrados = [] }) {
  const avisos = [];
  if (atalhos.length) avisos.push(aviso('ATALHO_VIROU_COPIA', { arquivos: atalhos }));
  if (quebrados.length) avisos.push(aviso('ATALHO_QUEBRADO_FORA', { arquivos: quebrados }));
  return avisos;
}

// A comparação nova (antes/, manifesto.json, mudancas.json e estado.json), montada ao lado e trocada
// inteira. Devolve { manifesto, sobra }.
function trocarComparacao(c, ad) {
  const montando = `${ad.pasta}.guardando`;
  const em = (arquivo) => path.join(montando, path.relative(ad.pasta, arquivo));
  fs.rmSync(montando, { recursive: true, force: true });
  const manifesto = guardarAntes(c.pasta, em(ad.antes));
  escreverJson(em(ad.manifesto), manifesto);
  escreverJson(em(ad.mudancas), { pedido: '', mudancas: [] });
  escreverJson(em(ad.estado), { aberto: true });
  const { sobra } = trocarPasta(montando, ad.pasta, fs.renameSync, { mover: true });
  return { manifesto, sobra };
}

export default async function antes(args) {
  const nome = nomeDaApresentacao(args);
  const c = abrirApresentacao(nome);
  const ad = caminhosDoAntesDepois(c);
  recuperarComparacao(ad);
  const estado = lerJson(ad.estado, { aberto: false });
  const pendente = estado.restauracao_pendente === true;
  if (temAntes(ad) && estado.aberto === true && (pendente || args.opcoes['de-novo'] !== true)) {
    reprovado('ANTES_EM_ABERTO', { nome, restauracao_pendente: pendente });
  }
  const apagados = oQueSai(ad);
  if (fs.existsSync(ad.estado)) escreverJson(ad.estado, { aberto: false, escolha: typeof estado.escolha === 'string' ? estado.escolha : '' });
  let troca;
  try {
    troca = trocarComparacao(c, ad);
  } catch (erro) {
    // Só erro do sistema de arquivos (EPERM, EBUSY, EACCES...) vira reprovação, e só o código dele sai
    // (a mensagem traz caminhos da pessoa). Outro erro é defeito do estúdio e sobe como é.
    if (typeof erro?.code !== 'string' || typeof erro.syscall !== 'string') throw erro;
    reprovado('ANTES_NAO_TROCADO', { nome, erro: erro.code });
  }
  const { manifesto, sobra } = troca;
  const avisos = [...avisosDosAtalhos(manifesto), ...(sobra ? [aviso('SOBRA_DA_TROCA', { sobra: relativoARaiz(sobra) })] : [])];
  return {
    ok: true,
    codigo: 'ANTES_GUARDADO',
    avisos,
    arquivos: { antes: c.rel('revisao', 'antes-depois', 'antes'), mudancas: c.rel('revisao', 'antes-depois', 'mudancas.json') },
    dados: {
      itens: manifesto.itens,
      arquivos: listarArquivos(ad.antes).length,
      pesados: manifesto.pesados.length,
      pesados_sem_duplicar: manifesto.pesados.filter((p) => p.modo === 'link').length,
      apagados,
    },
  };
}

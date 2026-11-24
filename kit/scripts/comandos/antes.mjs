// Guarda a apresentação como está agora, antes de uma mudança, para o "comparar" mostrar o antes e
// o depois. Uso: ./estudio antes <nome> [--de-novo]. Guarda deck/, roteiro/, cenas/ e brief.md (vídeo
// e arquivo pesado como link fixo, sem duplicar: lib/antes-depois.mjs) e deixa um mudancas.json de
// molde para o assistente preencher com 2 ou 3 mudanças concretas.
// Enquanto a pessoa não escolhe (./estudio escolher), o antes fica em aberto e não é trocado: rodar
// "antes" de novo reprova com ANTES_EM_ABERTO, para a tentativa recusada nunca virar o "antes".
// --de-novo troca mesmo assim (só quando a pessoa pediu para partir de como a apresentação está agora).
// O que sai da comparação anterior (antes, versão vista, fotos, pedido) vai listado em dados.apagados.
// Portado do Site Estúdio (comando "antes").
import fs from 'node:fs';
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao } from '../lib/apresentacao.mjs';
import { listarArquivos } from '../lib/caminhos.mjs';
import { escreverJson, lerJson } from '../lib/json.mjs';
import { aviso, reprovado } from '../lib/saida.mjs';
import { caminhosDoAntesDepois, guardarAntes, lerMudancas, temAntes } from '../lib/antes-depois.mjs';

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

export default async function antes(args) {
  const nome = nomeDaApresentacao(args);
  const c = abrirApresentacao(nome);
  const ad = caminhosDoAntesDepois(c);
  const estado = lerJson(ad.estado, { aberto: false });
  if (temAntes(ad) && estado.aberto === true && args.opcoes['de-novo'] !== true) reprovado('ANTES_EM_ABERTO', { nome });
  const apagados = oQueSai(ad);
  fs.rmSync(ad.pasta, { recursive: true, force: true });
  const manifesto = guardarAntes(c.pasta, ad.antes);
  escreverJson(ad.manifesto, manifesto);
  escreverJson(ad.mudancas, { pedido: '', mudancas: [] });
  escreverJson(ad.estado, { aberto: true });
  return {
    ok: true,
    codigo: 'ANTES_GUARDADO',
    avisos: manifesto.atalhos.length || manifesto.quebrados.length
      ? [aviso('ATALHO_VIROU_COPIA', { arquivos: manifesto.atalhos, quebrados: manifesto.quebrados })]
      : [],
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

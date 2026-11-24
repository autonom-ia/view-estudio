// Guarda a apresentação como está agora, antes de uma mudança, para o "comparar" mostrar o antes e
// o depois. Uso: ./estudio antes <nome> [--de-novo]. Guarda deck/, roteiro/, cenas/ e brief.md (vídeo
// e arquivo pesado como link fixo, sem duplicar: lib/antes-depois.mjs) e deixa um mudancas.json de
// molde para o assistente preencher com 2 ou 3 mudanças concretas.
// Enquanto a pessoa não escolhe (./estudio escolher), o antes fica em aberto e não é trocado: rodar
// "antes" de novo reprova com ANTES_EM_ABERTO, para a tentativa recusada nunca virar o "antes".
// --de-novo troca mesmo assim (só quando a pessoa pediu para partir de como a apresentação está agora).
// Portado do Site Estúdio (comando "antes").
import fs from 'node:fs';
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao } from '../lib/apresentacao.mjs';
import { listarArquivos } from '../lib/caminhos.mjs';
import { escreverJson, lerJson } from '../lib/json.mjs';
import { reprovado } from '../lib/saida.mjs';
import { caminhosDoAntesDepois, guardarAntes, temAntes } from '../lib/antes-depois.mjs';

export default async function antes(args) {
  const nome = nomeDaApresentacao(args);
  const c = abrirApresentacao(nome);
  const ad = caminhosDoAntesDepois(c);
  const estado = lerJson(ad.estado, { aberto: false });
  if (temAntes(ad) && estado.aberto === true && args.opcoes['de-novo'] !== true) reprovado('ANTES_EM_ABERTO', { nome });
  fs.rmSync(ad.pasta, { recursive: true, force: true });
  const manifesto = guardarAntes(c.pasta, ad.antes);
  escreverJson(ad.manifesto, manifesto);
  escreverJson(ad.mudancas, { pedido: '', mudancas: [] });
  escreverJson(ad.estado, { aberto: true });
  return {
    ok: true,
    codigo: 'ANTES_GUARDADO',
    arquivos: { antes: c.rel('revisao', 'antes-depois', 'antes'), mudancas: c.rel('revisao', 'antes-depois', 'mudancas.json') },
    dados: {
      itens: manifesto.itens,
      arquivos: listarArquivos(ad.antes).length,
      pesados: manifesto.pesados.length,
      pesados_sem_duplicar: manifesto.pesados.filter((p) => p.modo === 'link').length,
    },
  };
}

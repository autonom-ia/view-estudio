// Aplica a resposta da pessoa ao "Qual fica?" do antes e depois.
// Uso: ./estudio escolher <nome> <depois|antes|outro>.
//   depois: fica o que mudou; o antes é fechado (o próximo pedido vago guarda um antes novo).
//   antes:  deck/, roteiro/, cenas/ e brief.md voltam ao que o "antes" guardou; o antes é fechado.
//   outro:  tudo volta ao que foi guardado e o antes continua em aberto, para a nova tentativa ainda
//           ser comparada com o original. As mudanças da tentativa recusada saem do mudancas.json.
// Antes de voltar (antes ou outro), a versão que a pessoa viu é guardada em tentativa/, com o vídeo
// ligado como no antes: fica até o próximo "antes" ou o "depois". Uma só: um segundo "outro" troca a
// tentativa anterior pela nova (dados.tentativa_substituida). Nada é apagado sem cópia.
// Ordem que aguenta o programa morrer no meio: tentativa guardada, depois o estado
// "restauracao_pendente" gravado, e só então a primeira troca; o estado só é limpo no fim. Com ele,
// rodar de novo continua de onde parou, sem guardar por cima da tentativa a apresentação pela
// metade. Troca que falha (no Windows, um vídeo aberto em outro programa) vira RESTAURACAO_FALHOU.
// Com "depois" nesse estado, a tentativa volta inteira. Troca feita com a cópia velha ainda ao lado
// (no Windows, um arquivo dela aberto em outro programa) vale, com o aviso SOBRA_DA_TROCA.
// Fechar o antes grava a escolha e apaga a cópia guardada e as fotos (lib/antes-depois.mjs,
// fecharAntes); com "depois", também a tentativa de um "outro" anterior. O que não sai vira
// SOBRA_DA_TROCA. Guardar a versão vista que falha (antes de qualquer troca) vira RESTAURACAO_FALHOU
// com dados.item "tentativa".
// "pecas.renomear" é injetável para os testes simularem uma troca que falha ou morre no meio.
// Portado do Site Estúdio (comando "escolher").
import fs from 'node:fs';
import { nomeDaApresentacao } from '../lib/args.mjs';
import { relativoARaiz } from '../lib/caminhos.mjs';
import { abrirApresentacao } from '../lib/apresentacao.mjs';
import { escreverJson, lerJson } from '../lib/json.mjs';
import { aviso, falha, reprovado } from '../lib/saida.mjs';
import {
  caminhosDoAntesDepois,
  fecharAntes,
  guardarTentativa,
  pesadosAlterados,
  restaurarAntes,
  restaurarDe,
  temAntes,
  temTentativa,
  ESCOLHAS,
} from '../lib/antes-depois.mjs';

// Erro do sistema de arquivos (EPERM, EBUSY, EACCES...): vira código; outro erro é defeito e sobe.
const doDisco = (erro) => typeof erro?.code === 'string' && typeof erro.syscall === 'string';

const CODIGO = Object.freeze({ depois: 'FICOU_O_DEPOIS', antes: 'VOLTOU_COMO_ESTAVA', outro: 'PRONTO_PARA_OUTRO_CAMINHO' });

export default async function escolher(args, pecas = {}) {
  const renomear = pecas.renomear || fs.renameSync;
  const nome = nomeDaApresentacao(args);
  const escolha = args.posicionais[1] || '';
  if (!ESCOLHAS.includes(escolha)) falha('ARGUMENTO_INVALIDO', { argumento: '<escolha>', valor: escolha, opcoes: ESCOLHAS });
  // uma troca que parou no meio pode ter deixado o deck fora do lugar: abrirApresentacao o põe de volta
  const c = abrirApresentacao(nome);
  const ad = caminhosDoAntesDepois(c);
  const estado = lerJson(ad.estado, { aberto: false });
  if (estado.aberto === false && typeof estado.escolha === 'string') reprovado('ANTES_JA_RESOLVIDO', { nome, escolha: estado.escolha });
  if (!temAntes(ad) || estado.aberto !== true) falha('ANTES_NAO_GUARDADO', { nome });

  const manifesto = lerJson(ad.manifesto, { itens: [], pesados: [] });
  const pendente = estado.restauracao_pendente === true;
  let tentativa = pendente && Array.isArray(estado.tentativa_itens) ? estado.tentativa_itens : [];
  const relTentativa = c.rel('revisao', 'antes-depois', 'tentativa');
  // o estado pendente é gravado antes da primeira troca e só sai no fim (outro) ou ao fechar
  const trocar = (fazer) => {
    escreverJson(ad.estado, { aberto: true, restauracao_pendente: true, tentativa_itens: tentativa });
    try {
      return fazer();
    } catch (erro) {
      if (erro.codigo !== 'RESTAURACAO_FALHOU') throw erro;
      return falha('RESTAURACAO_FALHOU', { nome, escolha, item: erro.item, erro: erro.message, tentativa: relTentativa });
    }
  };

  let troca = { restaurados: [], sobras: [] };
  let substituida = false;
  if (escolha !== 'depois') {
    const alterados = pesadosAlterados(ad.antes, manifesto);
    if (alterados.length) falha('ANTES_VIDEO_MUDOU', { nome, arquivos: alterados });
    if (!pendente) {
      substituida = temTentativa(ad);
      try {
        tentativa = guardarTentativa(c.pasta, ad);
      } catch (erro) {
        // nada voltou ainda: a apresentação continua como a pessoa viu, e rodar de novo guarda e volta
        if (!doDisco(erro)) throw erro;
        falha('RESTAURACAO_FALHOU', { nome, escolha, item: 'tentativa', erro: erro.code, tentativa: relTentativa });
      }
    }
    troca = trocar(() => restaurarAntes(c.pasta, ad.antes, manifesto, { renomear }));
  } else if (pendente) {
    // uma volta anterior parou no meio: "depois" é a versão vista inteira, guardada na tentativa
    troca = trocar(() => restaurarDe(c.pasta, ad.tentativa, tentativa, { renomear }));
  }
  let fechamento = { tentativaApagada: false, sobras: [] };
  if (escolha === 'outro') {
    const { pedido } = lerJson(ad.mudancas, { pedido: '' });
    escreverJson(ad.mudancas, { pedido: typeof pedido === 'string' ? pedido : '', mudancas: [] });
    escreverJson(ad.estado, { aberto: true });
  } else {
    fechamento = fecharAntes(ad, escolha);
  }
  const guardouTentativa = escolha !== 'depois';
  const avisos = [
    ...(substituida ? [aviso('TENTATIVA_SUBSTITUIDA', { tentativa: relTentativa })] : []),
    ...[...troca.sobras, ...fechamento.sobras].map((sobra) => aviso('SOBRA_DA_TROCA', { sobra: relativoARaiz(sobra) })),
  ];
  const { restaurados } = troca;
  return {
    ok: true,
    codigo: CODIGO[escolha],
    avisos,
    arquivos: { mudancas: c.rel('revisao', 'antes-depois', 'mudancas.json'), ...(guardouTentativa ? { tentativa: relTentativa } : {}) },
    dados: {
      escolha,
      restaurados,
      ...(guardouTentativa ? { tentativa, tentativa_substituida: substituida } : { tentativa_apagada: fechamento.tentativaApagada }),
    },
  };
}

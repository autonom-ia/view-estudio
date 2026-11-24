// Aplica a resposta da pessoa ao "Qual fica?" do antes e depois.
// Uso: ./estudio escolher <nome> <depois|antes|outro>.
//   depois: fica o que mudou; o antes é fechado (o próximo pedido vago guarda um antes novo).
//   antes:  deck/, roteiro/, cenas/ e brief.md voltam ao que o "antes" guardou; o antes é fechado.
//   outro:  tudo volta ao que foi guardado e o antes continua em aberto, para a nova tentativa ainda
//           ser comparada com o original. As mudanças da tentativa recusada saem do mudancas.json.
// Fechar o antes apaga a cópia guardada e as fotos (lib/antes-depois.mjs, fecharAntes).
// Portado do Site Estúdio (comando "escolher").
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao } from '../lib/apresentacao.mjs';
import { escreverJson, lerJson } from '../lib/json.mjs';
import { falha, reprovado } from '../lib/saida.mjs';
import {
  caminhosDoAntesDepois,
  fecharAntes,
  pesadosAlterados,
  restaurarAntes,
  temAntes,
  ESCOLHAS,
} from '../lib/antes-depois.mjs';

const CODIGO = Object.freeze({ depois: 'FICOU_O_DEPOIS', antes: 'VOLTOU_COMO_ESTAVA', outro: 'PRONTO_PARA_OUTRO_CAMINHO' });

export default async function escolher(args) {
  const nome = nomeDaApresentacao(args);
  const escolha = args.posicionais[1] || '';
  if (!ESCOLHAS.includes(escolha)) falha('ARGUMENTO_INVALIDO', { argumento: '<escolha>', valor: escolha, opcoes: ESCOLHAS });
  const c = abrirApresentacao(nome);
  const ad = caminhosDoAntesDepois(c);
  const estado = lerJson(ad.estado, { aberto: false });
  if (estado.aberto === false && typeof estado.escolha === 'string') reprovado('ANTES_JA_RESOLVIDO', { nome, escolha: estado.escolha });
  if (!temAntes(ad) || estado.aberto !== true) falha('ANTES_NAO_GUARDADO', { nome });

  let restaurados = [];
  if (escolha !== 'depois') {
    const manifesto = lerJson(ad.manifesto, { itens: [], pesados: [] });
    const alterados = pesadosAlterados(ad.antes, manifesto);
    if (alterados.length) falha('ANTES_VIDEO_MUDOU', { nome, arquivos: alterados });
    restaurados = restaurarAntes(c.pasta, ad.antes, manifesto);
  }
  if (escolha === 'outro') {
    const { pedido } = lerJson(ad.mudancas, { pedido: '' });
    escreverJson(ad.mudancas, { pedido: typeof pedido === 'string' ? pedido : '', mudancas: [] });
  } else {
    fecharAntes(ad, escolha);
  }
  return {
    ok: true,
    codigo: CODIGO[escolha],
    arquivos: { mudancas: c.rel('revisao', 'antes-depois', 'mudancas.json') },
    dados: { escolha, restaurados },
  };
}

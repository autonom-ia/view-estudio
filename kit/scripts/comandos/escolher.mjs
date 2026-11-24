// Aplica a resposta da pessoa ao "Qual fica?" do antes e depois.
// Uso: ./estudio escolher <nome> <depois|antes|outro>.
//   depois: fica o que mudou; o antes é fechado (o próximo pedido vago guarda um antes novo).
//   antes:  deck/, roteiro/, cenas/ e brief.md voltam ao que o "antes" guardou; o antes é fechado.
//   outro:  tudo volta ao que foi guardado e o antes continua em aberto, para a nova tentativa ainda
//           ser comparada com o original. As mudanças da tentativa recusada saem do mudancas.json.
// Antes de voltar (antes ou outro), a versão que a pessoa viu é guardada em tentativa/, com o vídeo
// ligado como no antes: fica até o próximo "antes". Nada é apagado sem cópia.
// Troca que falha no meio (no Windows, um vídeo aberto em outro programa) vira RESTAURACAO_FALHOU e
// deixa o estado "restauracao_pendente": rodar de novo continua de onde parou, sem guardar por cima
// da tentativa a apresentação pela metade. Com "depois" nesse estado, a tentativa volta inteira.
// Fechar o antes apaga a cópia guardada e as fotos (lib/antes-depois.mjs, fecharAntes).
// Portado do Site Estúdio (comando "escolher").
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao } from '../lib/apresentacao.mjs';
import { escreverJson, lerJson } from '../lib/json.mjs';
import { falha, reprovado } from '../lib/saida.mjs';
import {
  caminhosDoAntesDepois,
  fecharAntes,
  guardarTentativa,
  pesadosAlterados,
  restaurarAntes,
  restaurarDe,
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

  const manifesto = lerJson(ad.manifesto, { itens: [], pesados: [] });
  const pendente = estado.restauracao_pendente === true;
  let tentativa = pendente && Array.isArray(estado.tentativa_itens) ? estado.tentativa_itens : [];
  const relTentativa = c.rel('revisao', 'antes-depois', 'tentativa');
  const trocar = (fazer) => {
    try {
      return fazer();
    } catch (erro) {
      if (erro.codigo !== 'RESTAURACAO_FALHOU') throw erro;
      escreverJson(ad.estado, { aberto: true, restauracao_pendente: true, tentativa_itens: tentativa });
      return falha('RESTAURACAO_FALHOU', { nome, escolha, item: erro.item, erro: erro.message, tentativa: relTentativa });
    }
  };

  let restaurados = [];
  if (escolha !== 'depois') {
    const alterados = pesadosAlterados(ad.antes, manifesto);
    if (alterados.length) falha('ANTES_VIDEO_MUDOU', { nome, arquivos: alterados });
    if (!pendente) tentativa = guardarTentativa(c.pasta, ad);
    restaurados = trocar(() => restaurarAntes(c.pasta, ad.antes, manifesto));
  } else if (pendente) {
    // uma volta anterior falhou no meio: "depois" é a versão vista inteira, guardada na tentativa
    restaurados = trocar(() => restaurarDe(c.pasta, ad.tentativa, tentativa));
  }
  if (escolha === 'outro') {
    const { pedido } = lerJson(ad.mudancas, { pedido: '' });
    escreverJson(ad.mudancas, { pedido: typeof pedido === 'string' ? pedido : '', mudancas: [] });
    escreverJson(ad.estado, { aberto: true });
  } else {
    fecharAntes(ad, escolha);
  }
  const guardouTentativa = escolha !== 'depois';
  return {
    ok: true,
    codigo: CODIGO[escolha],
    arquivos: { mudancas: c.rel('revisao', 'antes-depois', 'mudancas.json'), ...(guardouTentativa ? { tentativa: relTentativa } : {}) },
    dados: { escolha, restaurados, ...(guardouTentativa ? { tentativa } : {}) },
  };
}

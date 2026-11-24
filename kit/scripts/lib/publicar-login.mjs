// Login do estúdio por código (modelo da RFC 8628), sem servidor no computador da pessoa:
// 1. sem pedido guardado: pede um ao serviço (POST /api/estudio/login/iniciar), guarda em
//    .ferramentas/publicar/pedido.json, tenta abrir o navegador na página de ligar e devolve na hora
//    PUBLICAR_AGUARDANDO_LOGIN com o código curto. Devolver na hora é de propósito: a pessoa precisa
//    ver o código para digitar no navegador, e o assistente só mostra a saída quando o processo acaba.
// 2. com pedido guardado: consulta (POST /api/estudio/login/consultar) a cada intervalo, até o prazo.
//    Aprovado: grava a chave (0600, atômico), apaga o pedido e devolve a chave, dizendo se a aprovação
//    chegou durante a espera (aí a chamada já gastou tempo e não publica junto). Sem aprovação no
//    prazo: PUBLICAR_AGUARDANDO_LOGIN de novo, com o mesmo pedido para a próxima chamada.
//    O pedido guardado não vence pelo relógio daqui: o serviço responde 404/410 quando ele acabou.
// O código de dispositivo e a chave nunca vão para "dados".
// Portado do Site Estúdio (lib/publicar-login.mjs).
import os from 'node:os';
import { KitErro } from './saida.mjs';
import { abrir as abrirNoSistema } from './abrir.mjs';
import { chamar, esperar, enderecoSeguro, ErroDeRede, semConexao, erroDoServico } from './publicar-servico.mjs';
import { arquivoPedido, apagar, lerPedido, gravarPedido, gravarChave } from './publicar-guarda.mjs';
import { FERR } from './caminhos.mjs';

const PREFIXO_CHAVE = 'se_pub_';
const LIMITE_NOME_MAQUINA = 60;

function aguardando(pedido, novo) {
  return {
    ok: false,
    codigo: 'PUBLICAR_AGUARDANDO_LOGIN',
    dados: { codigo_curto: pedido.codigo_curto, endereco: pedido.endereco, expira_em: pedido.expira_em, pedido_novo: novo },
  };
}

function nomeDaMaquina() {
  const nome = String(os.hostname() || '').trim();
  return nome.slice(0, LIMITE_NOME_MAQUINA) || 'computador sem nome';
}

// Pede um código novo ao serviço, guarda e tenta abrir o navegador.
async function iniciar(cfg, ferr) {
  let r;
  try {
    r = await chamar(cfg, 'POST', '/api/estudio/login/iniciar', { json: { nome_maquina: nomeDaMaquina() } });
  } catch (erro) {
    if (erro instanceof ErroDeRede) throw semConexao(erro);
    throw erro;
  }
  if (r.status === 429) throw new KitErro('PUBLICAR_MUITAS_TENTATIVAS', {});
  if (r.status !== 200 || !r.corpo || r.corpo.ok !== true) throw erroDoServico(r);
  const c = r.corpo;
  const endereco = enderecoSeguro(c.endereco, cfg, true);
  const valido = typeof c.codigo_dispositivo === 'string' && c.codigo_dispositivo && codigoCurtoValido(c.codigo_curto) &&
    Number.isFinite(c.expira_em) && endereco;
  if (!valido) throw new KitErro('PUBLICAR_RESPOSTA_ESTRANHA', { status: r.status });
  const pedido = { codigo_dispositivo: c.codigo_dispositivo, codigo_curto: c.codigo_curto, endereco, expira_em: c.expira_em };
  gravarPedido(cfg.base, pedido, ferr);
  abrirNoSistema(endereco);
  return pedido;
}

// Uma consulta. Devolve { chave, email } (aprovado), 'aguardando', 'acabou' (pedido morto) ou
// um ErroDeRede (sem resposta: tenta de novo na próxima volta).
async function consultar(cfg, pedido) {
  let r;
  try {
    r = await chamar(cfg, 'POST', '/api/estudio/login/consultar', { json: { codigo_dispositivo: pedido.codigo_dispositivo } });
  } catch (erro) {
    if (erro instanceof ErroDeRede) return erro;
    throw erro;
  }
  const c = r.corpo || {};
  if (r.status === 200 && c.ok === true && c.estado === 'entregue') {
    if (typeof c.chave !== 'string' || !c.chave.startsWith(PREFIXO_CHAVE)) throw new KitErro('PUBLICAR_RESPOSTA_ESTRANHA', { status: r.status });
    return { chave: c.chave, email: c.email };
  }
  if (r.status === 202 || (r.status === 200 && c.estado === 'aguardando')) return 'aguardando';
  if (r.status === 403) throw new KitErro('PUBLICAR_LOGIN_RECUSADO', {});
  if (r.status === 429) throw new KitErro('PUBLICAR_MUITAS_TENTATIVAS', {});
  if (r.status === 404 || r.status === 410) return 'acabou';
  throw erroDoServico(r);
}

// Consulta até o prazo. Devolve { chave, email, esperou }, 'aguardando' ou 'acabou'. Se nenhuma consulta teve
// resposta, o serviço está fora de alcance: PUBLICAR_SEM_CONEXAO (o pedido fica guardado).
async function consultarAtePrazo(cfg, pedido, ferr) {
  const limite = Date.now() + cfg.tempos.prazoMs;
  let ultimoErroDeRede = null;
  let respondeu = false;
  for (let volta = 1; ; volta += 1) {
    let r;
    try {
      r = await consultar(cfg, pedido);
    } catch (erro) {
      if (erro instanceof KitErro && erro.codigo === 'PUBLICAR_LOGIN_RECUSADO') apagar(arquivoPedido(ferr));
      throw erro;
    }
    if (r instanceof ErroDeRede) ultimoErroDeRede = r;
    else if (r !== 'aguardando') return typeof r === 'string' ? r : { ...r, esperou: volta > 1 };
    else respondeu = true;
    if (Date.now() + cfg.tempos.intervaloMs > limite) {
      if (!respondeu && ultimoErroDeRede) throw semConexao(ultimoErroDeRede);
      return 'aguardando';
    }
    await esperar(cfg.tempos.intervaloMs);
  }
}

// O código curto vai para a frase que a pessoa lê e digita: só letras maiúsculas, dígitos e hífen.
const CODIGO_CURTO_MAX = 16;
const CARACTERES_DO_CODIGO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-';
export function codigoCurtoValido(texto) {
  return typeof texto === 'string' && texto.length > 0 && texto.length <= CODIGO_CURTO_MAX &&
    [...texto].every((letra) => CARACTERES_DO_CODIGO.includes(letra));
}

// Devolve { chave, esperou } quando há acesso, ou { resultado } (PUBLICAR_AGUARDANDO_LOGIN) para devolver já.
export async function entrar(cfg, ferr = FERR) {
  const guardado = lerPedido(cfg.base, ferr);
  if (!guardado) return { resultado: aguardando(await iniciar(cfg, ferr), true) };
  const r = await consultarAtePrazo(cfg, guardado, ferr);
  if (r === 'aguardando') return { resultado: aguardando(guardado, false) };
  apagar(arquivoPedido(ferr));
  // Pedido vencido, já usado ou desconhecido no serviço: começa outro e mostra o código novo.
  if (r === 'acabou') return { resultado: aguardando(await iniciar(cfg, ferr), true) };
  gravarChave(cfg.base, r.chave, r.email, ferr);
  return { chave: r.chave, esperou: r.esperou };
}

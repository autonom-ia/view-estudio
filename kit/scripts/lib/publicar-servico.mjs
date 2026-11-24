// Conversa com o serviço de publicação (sites.autonomia.site): endereço, tempos, chamadas HTTP e a
// tradução dos códigos de erro do serviço para os códigos do estúdio (kit/mensagens.json).
// A chave de publicação só viaja no cabeçalho Authorization: nunca entra em erro, log ou "dados".
// Portado do Site Estúdio (lib/publicar-servico.mjs): a mesma API serve sites e apresentações.
import { KitErro } from './saida.mjs';

export const SERVICO = 'https://sites.autonomia.site';
const LOCAL = '127.0.0.1';

// Tempos de produção: consulta a cada 5 s, por até 90 s. As esperas (cadeado, conferência depois de um
// concluir sem resposta) também param no que sobra do orçamento da chamada inteira: 100 s contados do
// começo, para a chamada terminar antes do prazo de 2 min que o assistente dá por padrão. O envio das
// partes não tem como caber num orçamento fixo; por isso a skill por-no-ar manda rodar com 5 min.
export const TEMPOS_PADRAO = Object.freeze({ intervaloMs: 5000, prazoMs: 90000, orcamentoMs: 100000 });
const TEMPO_DE_CHAMADA_MS = 30000;
const TEMPO_DE_PARTE_MS = 90000;
// O concluir cola as partes, abre o pacote e publica no servidor: espera mais que uma chamada comum,
// mas para antes do corte de 60 s do proxy na frente do serviço.
export const TEMPO_DE_CONCLUIR_MS = 55000;

// Erros do serviço com tradução própria. O que não estiver aqui vira PUBLICAR_RECUSADO.
const TRADUCAO = Object.freeze({
  SLUG_INVALIDO: 'PUBLICAR_NOME_RECUSADO',
  CHAVE_INVALIDA: 'PUBLICAR_CHAVE_RECUSADA',
  SITE_DE_OUTRA_PESSOA: 'PUBLICAR_SITE_DE_OUTRA_PESSOA',
  LIMITE_DE_SITES: 'PUBLICAR_LIMITE_DE_SITES',
  SITE_GRANDE_DEMAIS: 'PUBLICAR_SITE_GRANDE_DEMAIS',
  LIMITE_DO_DIA: 'PUBLICAR_LIMITE_DO_DIA',
  LIMITE_DA_SEMANA: 'PUBLICAR_LIMITE_DA_SEMANA',
  PUBLICACAO_DESLIGADA: 'PUBLICAR_DESLIGADA',
  SEM_ESPACO: 'PUBLICAR_SEM_ESPACO',
  ENVIO_INEXISTENTE: 'PUBLICAR_ENVIO_PERDIDO',
  PARTE_DIFERENTE: 'PUBLICAR_ENVIO_FALHOU',
  PARTE_GRANDE_DEMAIS: 'PUBLICAR_ENVIO_FALHOU',
  PARTE_CORROMPIDA: 'PUBLICAR_ENVIO_FALHOU',
  FALTAM_PARTES: 'PUBLICAR_ENVIO_FALHOU',
  PACOTE_CORROMPIDO: 'PUBLICAR_ENVIO_FALHOU',
  VERSAO_INEXISTENTE: 'PUBLICAR_VERSAO_INEXISTENTE',
  // Além do contrato: o servidor real também devolve estes.
  PUBLICACAO_INCOMPLETA: 'PUBLICAR_NO_AR_AJUSTANDO',
  SITE_INEXISTENTE: 'PUBLICAR_SITE_AINDA_NAO_PUBLICADO',
  SITE_FORA_DO_AR: 'PUBLICAR_SITE_TIRADO_DO_AR',
  ENVIO_EM_ANDAMENTO: 'PUBLICAR_ENVIO_EM_ANDAMENTO',
  PARTE_INVALIDA: 'PUBLICAR_ENVIO_FALHOU',
  VERSAO_RUIM: 'PUBLICAR_VERSAO_RUIM',
  PARTE_EM_ANDAMENTO: 'PUBLICAR_ESPERE_UM_POUCO',
  ADICIONAR_ESPERE: 'PUBLICAR_ESPERE_UM_POUCO',
  CONFERIR_ESPERE: 'PUBLICAR_ESPERE_UM_POUCO',
});
export const CODIGOS_TRADUZIDOS = Object.freeze([...new Set(Object.values(TRADUCAO)), 'PUBLICAR_PACOTE_RECUSADO', 'PUBLICAR_RECUSADO']);

// Falha de rede (sem resposta do serviço). Quem chama decide se tenta de novo.
export class ErroDeRede extends Error {}

const inteiroPositivo = (texto) => {
  const n = Number(texto);
  return Number.isInteger(n) && n > 0 ? n : null;
};

// Endereço de teste aceito: só http://127.0.0.1:<porta>, sem caminho, usuário, busca ou âncora.
export function enderecoDeTesteAceito(texto) {
  let u;
  try {
    u = new URL(String(texto));
  } catch {
    return false;
  }
  return (
    u.protocol === 'http:' && u.hostname === LOCAL && inteiroPositivo(u.port) !== null &&
    u.username === '' && u.password === '' && u.pathname === '/' && u.search === '' && u.hash === ''
  );
}

// { base, teste, tempos }. Variável de teste inválida é erro explícito: nunca cai para o serviço real.
export function configuracao(env = process.env) {
  const pedido = env.ESTUDIO_PUBLICAR_URL;
  if (pedido === undefined || pedido === '') return { base: SERVICO, teste: false, tempos: TEMPOS_PADRAO };
  if (!enderecoDeTesteAceito(pedido)) throw new KitErro('PUBLICAR_ENDERECO_DE_TESTE_INVALIDO', { variavel: 'ESTUDIO_PUBLICAR_URL' });
  const tempos = { ...TEMPOS_PADRAO };
  const variaveis = [['ESTUDIO_PUBLICAR_INTERVALO_MS', 'intervaloMs'], ['ESTUDIO_PUBLICAR_PRAZO_MS', 'prazoMs'], ['ESTUDIO_PUBLICAR_ORCAMENTO_MS', 'orcamentoMs']];
  for (const [nome, campo] of variaveis) {
    if (env[nome] === undefined) continue;
    const n = inteiroPositivo(env[nome]);
    if (n === null) throw new KitErro('ARGUMENTO_INVALIDO', { argumento: nome, valor: String(env[nome]) });
    tempos[campo] = n;
  }
  return { base: new URL(pedido).origin, teste: true, tempos: Object.freeze(tempos) };
}

// Endereço que o serviço mandou abrir ou consultar: https (ou o local, em teste), sem usuário e senha.
// Devolve o endereço normalizado por URL (aspas e espaços saem codificados) ou null.
export function enderecoSeguro(texto, cfg, mesmaOrigem = false) {
  let u;
  try {
    u = new URL(String(texto));
  } catch {
    return null;
  }
  if (u.username !== '' || u.password !== '') return null;
  if (mesmaOrigem) return u.origin === cfg.base ? u.href : null;
  if (u.protocol === 'https:') return u.href;
  return cfg.teste && u.protocol === 'http:' && u.hostname === LOCAL ? u.href : null;
}

export const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Quanto uma espera pode durar: o prazo, sem passar do que sobra do orçamento da chamada
// (cfg.inicio é a hora em que a chamada começou; sem ele, vale só o prazo).
export function prazoDaEspera(cfg) {
  if (!Number.isFinite(cfg.inicio)) return cfg.tempos.prazoMs;
  return Math.max(0, Math.min(cfg.tempos.prazoMs, cfg.inicio + cfg.tempos.orcamentoMs - Date.now()));
}

// Uma chamada ao serviço. Devolve { status, corpo } (corpo = JSON ou null). Sem resposta: ErroDeRede.
export async function chamar(cfg, metodo, caminho, { chave, json, bytes, cabecalhos = {}, tempoMs } = {}) {
  const headers = { accept: 'application/json', ...cabecalhos };
  if (chave) headers.authorization = `Bearer ${chave}`;
  let body;
  if (json !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(json);
  } else if (bytes !== undefined) {
    headers['content-type'] = 'application/octet-stream';
    body = bytes;
  }
  const limite = tempoMs || (bytes !== undefined ? TEMPO_DE_PARTE_MS : TEMPO_DE_CHAMADA_MS);
  let resposta;
  let texto;
  try {
    resposta = await fetch(`${cfg.base}${caminho}`, { method: metodo, headers, body, redirect: 'error', signal: AbortSignal.timeout(limite) });
    texto = await resposta.text();
  } catch (erro) {
    // Só o nome do erro e a causa: a mensagem do fetch nunca leva cabeçalho, mas não arriscamos.
    const causa = erro && erro.cause && erro.cause.code ? erro.cause.code : (erro && erro.name) || 'erro';
    throw new ErroDeRede(String(causa));
  }
  let corpo = null;
  try {
    corpo = texto ? JSON.parse(texto) : null;
  } catch {
    corpo = null;
  }
  return { status: resposta.status, corpo: corpo && typeof corpo === 'object' && !Array.isArray(corpo) ? corpo : null };
}

// Erro do serviço traduzido para o estúdio. A frase do serviço vai em dados.detalhe (passa pelo sanear).
export function erroDoServico(resposta) {
  const corpo = resposta.corpo || {};
  const codigoServico = typeof corpo.codigo === 'string' ? corpo.codigo : '';
  const frase = typeof corpo.mensagem === 'string' ? corpo.mensagem : typeof corpo.erro === 'string' ? corpo.erro : '';
  let codigo = TRADUCAO[codigoServico];
  if (!codigo && resposta.status === 401) codigo = 'PUBLICAR_CHAVE_RECUSADA';
  if (!codigo && resposta.status === 422 && codigoServico.startsWith('PACOTE_')) codigo = 'PUBLICAR_PACOTE_RECUSADO';
  if (!codigo) codigo = 'PUBLICAR_RECUSADO';
  return new KitErro(codigo, { status: resposta.status, codigo_do_servico: codigoServico, detalhe: frase.slice(0, 300) });
}

// Resposta esperada (status na lista e corpo com ok:true) ou erro traduzido.
export function exigir(resposta, ...status) {
  if (status.includes(resposta.status) && resposta.corpo && resposta.corpo.ok === true) return resposta.corpo;
  if (resposta.status >= 200 && resposta.status < 300) throw new KitErro('PUBLICAR_RESPOSTA_ESTRANHA', { status: resposta.status });
  throw erroDoServico(resposta);
}

export function semConexao(erro) {
  return new KitErro('PUBLICAR_SEM_CONEXAO', { detalhe: erro instanceof ErroDeRede ? erro.message : String(erro) });
}

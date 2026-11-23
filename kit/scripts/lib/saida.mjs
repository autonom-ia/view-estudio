// Contrato de saída: a última linha do stdout de todo comando é um JSON numa linha só.
// {"ok":bool,"comando":"…","codigo":"…","resumo":"…","arquivos":{},"avisos":[],"dados":{}}
// Saída 0 = ok · 1 = erro · 2 = reprovado na conferência.
// O assistente traduz "codigo" (e o "codigo" de cada aviso) por kit/mensagens.json.
import fs from 'node:fs';
import path from 'node:path';
import { KIT } from './caminhos.mjs';
import { sanear } from './executar.mjs';

export class KitErro extends Error {
  constructor(codigo, dados = {}, sair = 1) {
    super(codigo);
    this.codigo = codigo;
    this.dados = dados;
    this.sair = sair;
  }
}

// Erro de execução (saída 1).
export function falha(codigo, dados = {}) {
  throw new KitErro(codigo, dados, 1);
}

// Reprovação na conferência (saída 2).
export function reprovado(codigo, dados = {}) {
  throw new KitErro(codigo, dados, 2);
}

export function aviso(codigo, dados = {}) {
  return { codigo, dados };
}

let cacheMensagens = null;
export function mensagens() {
  if (cacheMensagens) return cacheMensagens;
  try {
    cacheMensagens = JSON.parse(fs.readFileSync(path.join(KIT, 'mensagens.json'), 'utf8'));
  } catch {
    cacheMensagens = {};
  }
  return cacheMensagens;
}

export function textoDoCodigo(codigo) {
  const m = mensagens()[codigo];
  return m ? m.texto : '';
}

// Só o texto livre (vindo de processo filho, exceção ou rede) passa pelo sanear. Nome, título
// e caminho ficam intactos: um nome longo de apresentação não pode virar <REDACTED>.
const CAMPOS_LIVRES = Object.freeze(['detalhe', 'erro', 'saida']);

function limparLivre(valor) {
  if (typeof valor === 'string') return sanear(valor);
  if (Array.isArray(valor)) return valor.map(limparLivre);
  if (valor && typeof valor === 'object') return limpar(valor);
  return valor;
}

function limpar(valor) {
  if (Array.isArray(valor)) return valor.map(limpar);
  if (valor && typeof valor === 'object') {
    const novo = {};
    for (const [k, v] of Object.entries(valor)) novo[k] = CAMPOS_LIVRES.includes(k) ? limparLivre(v) : limpar(v);
    return novo;
  }
  return valor;
}

export function montarResultado(comando, resultado) {
  const ok = Boolean(resultado.ok);
  return {
    ok,
    comando,
    codigo: resultado.codigo || (ok ? 'OK' : 'DESCONHECIDO'),
    resumo: resultado.resumo || textoDoCodigo(resultado.codigo) || '',
    arquivos: resultado.arquivos || {},
    avisos: limpar(resultado.avisos || []),
    dados: limpar(resultado.dados === undefined ? {} : resultado.dados),
  };
}

export function imprimirResultado(comando, resultado) {
  process.stdout.write(`${JSON.stringify(montarResultado(comando, resultado))}\n`);
}

export function resultadoDeErro(erro) {
  if (erro instanceof KitErro) {
    return { ok: false, codigo: erro.codigo, dados: erro.dados, resumo: textoDoCodigo(erro.codigo) || erro.codigo, sair: erro.sair };
  }
  const detalhe = sanear(String((erro && erro.stack) || erro)).split('\n').slice(0, 6).join('\n');
  return { ok: false, codigo: 'DESCONHECIDO', dados: { detalhe }, resumo: textoDoCodigo('DESCONHECIDO'), sair: 1 };
}

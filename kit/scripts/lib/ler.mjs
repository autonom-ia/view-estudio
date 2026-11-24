// Junta as duas leituras (perfil do Google e site atual), salva o que leu em
// apresentacoes/<nome>/coleta/ e põe os fatos, com fonte e data, numa parte própria e marcada da
// tabela de fatos do brief.md (lib/registros.mjs). Com só o nome do negócio e a cidade, o site atual
// vem do perfil do Google. Uma fonte que falha vira aviso; a outra segue.
// Portado do Site Estúdio (lib/ler.mjs), sem o Instagram (fica para depois, por decisão do produto).
import fs from 'node:fs';
import path from 'node:path';
import { lerGoogle, BASE_GOOGLE } from './ler-google.mjs';
import { lerSite, ehSiteDoNegocio } from './ler-site.mjs';
import { hoje, antesDoPrazo, TempoEsgotado } from './leitor.mjs';
import { escreverJson, escreverTexto } from './json.mjs';
import { aviso } from './saida.mjs';
import { sanear } from './executar.mjs';
import * as R from './registros.mjs';

export { ehSiteDoNegocio };

const LIMITE_DO_DETALHE = 300;
const INICIOS_LOCAIS = Object.freeze(['ws://', 'wss://', 'http://127.0.0.1', 'http://localhost', 'https://127.0.0.1']);
const ESPACOS = Object.freeze([' ', '\n', '\r', '\t']);

// Troca cada endereço local (o do DevTools, com o identificador da conexão) por um marcador.
export function semEnderecosLocais(texto) {
  let saida = '';
  let palavra = '';
  const fechar = () => {
    const local = INICIOS_LOCAIS.some((ini) => palavra.toLowerCase().includes(ini));
    saida += local ? '<endereço local>' : palavra;
    palavra = '';
  };
  for (const ch of String(texto)) {
    if (ESPACOS.includes(ch)) {
      fechar();
      saida += ch;
    } else palavra += ch;
  }
  fechar();
  return saida;
}

// O erro como vai para a saída: sem endereço local e sem nada com cara de segredo.
export function detalheDoErro(e) {
  return sanear(semEnderecosLocais(String((e && e.message) || e))).slice(0, LIMITE_DO_DETALHE);
}

// Teto da leitura inteira: passa dele, para e grava o que já leu. O assistente espera 10 minutos.
export const TETO_DA_LEITURA_MS = 8 * 60 * 1000;

async function tentar(fn) {
  try {
    return { ok: true, valor: await fn() };
  } catch (e) {
    if (e instanceof TempoEsgotado) return { ok: false, esgotou: true };
    return { ok: false, detalhe: detalheDoErro(e) };
  }
}

async function parteGoogle(busca, ctx) {
  const r = await tentar(() => antesDoPrazo(lerGoogle(ctx.leitor, busca, { base: ctx.bases.google }), ctx.prazo));
  if (r.esgotou) {
    ctx.esgotou = true;
    return null;
  }
  if (!r.ok) {
    ctx.avisos.push(aviso('LER_GOOGLE_FALHOU', { busca, detalhe: r.detalhe }));
    return null;
  }
  const g = r.valor;
  if (!g.achou) {
    ctx.avisos.push(aviso('LER_GOOGLE_NAO_ACHOU', { busca, motivo: g.motivo }));
    return null;
  }
  // O texto das avaliações fica só aqui, sem o nome de quem escreveu; não vira fato do brief.
  escreverJson(path.join(ctx.pasta, 'google', 'lugar.json'), g);
  if (g.alternativas.length) ctx.avisos.push(aviso('LER_GOOGLE_PRIMEIRO_DA_LISTA', { escolhido: g.lugar.nome, outros: g.alternativas }));
  if (!g.lugar.horario.length) ctx.avisos.push(aviso('LER_GOOGLE_SEM_HORARIO', { nome: g.lugar.nome }));
  ctx.registros.push(...R.registrosDoGoogle(g, ctx.data));
  ctx.dados.google = { nome: g.lugar.nome, fonte: g.lugar.fonte, dias_com_horario: g.lugar.horario.length, avaliacoes: g.avaliacoes.length };
  return g;
}

async function parteSite(endereco, referencia, ctx) {
  const opcoes = { pasta: path.join(ctx.pasta, 'site'), aoAvancar: ctx.aoAvancar, prazo: ctx.prazo, referencia, permitirEnderecoLocal: ctx.permitirEnderecoLocal };
  const r = await tentar(() => lerSite(ctx.leitor, endereco, opcoes));
  if (!r.ok) {
    ctx.avisos.push(aviso('LER_SITE_FALHOU', { endereco, detalhe: r.detalhe }));
    return null;
  }
  const s = r.valor;
  if (s.desvio) {
    ctx.avisos.push(aviso('LER_SITE_OUTRO_ENDERECO', { endereco, final: s.desvio }));
    return null;
  }
  if (s.esgotou) ctx.esgotou = true;
  if (!s.paginas.length) return null;
  const dir = path.join(ctx.pasta, 'site');
  escreverJson(path.join(dir, 'paginas.json'), s.paginas.map(({ texto, ...resto }) => resto));
  escreverTexto(path.join(dir, 'texto.md'), R.textoDoSite(s.paginas, ctx.data));
  if (s.duvidosos.length) ctx.avisos.push(aviso('LER_SITE_CONTATO_DE_TERCEIRO', { contatos: s.duvidosos }));
  ctx.registros.push(...R.registrosDoSite(s, ctx.data));
  ctx.dados.site = { endereco: s.inicio, paginas: s.paginas.length, fotos: s.fotos.length, fora_do_site: s.foraDoSite.length };
  return s;
}

// "casa.com.br" vira "https://casa.com.br": a pessoa costuma passar o endereço sem o começo.
export function comEsquema(endereco) {
  const t = String(endereco || '').trim();
  if (!t) return '';
  return t.includes('://') ? t : `https://${t}`;
}

// O endereço de site a ler: o que a pessoa passou, se for site de negócio (rede social, página de
// links e loja de pedidos viram aviso); senão, o do perfil do Google, se for site de negócio.
function siteParaLer(pedido, g, ctx) {
  const doPedido = comEsquema(pedido.site);
  if (doPedido && ehSiteDoNegocio(doPedido)) return doPedido;
  if (doPedido) ctx.avisos.push(aviso('LER_SITE_OUTRO_ENDERECO', { endereco: pedido.site, final: doPedido }));
  const doGoogle = g && g.lugar.site;
  return doGoogle && ehSiteDoNegocio(doGoogle) ? doGoogle : '';
}

// Grava a parte lida no brief.md. Marca quebrada: não mexe no brief (aviso); o que foi lido fica
// em coleta/. Antes de reescrever, guarda o brief anterior em coleta/brief-antes-da-leitura.md.
const BOM = '\uFEFF';

function gravarNoBrief(registros, ctx, brief) {
  const bruto = fs.existsSync(brief) ? fs.readFileSync(brief, 'utf8') : '';
  const comBom = bruto.startsWith(BOM); // o Bloco de Notas antigo do Windows grava assim: mantém
  const atual = comBom ? bruto.slice(1) : bruto;
  const junto = R.juntarNoBrief(atual, R.secaoLida(registros, ctx.data));
  const novo = junto === null ? null : `${comBom ? BOM : ''}${junto}`;
  if (novo === null) {
    ctx.avisos.push(aviso('LER_BRIEF_MARCADOR_QUEBRADO', { inicio: R.MARCA_INICIO, fim: R.MARCA_FIM }));
    return false;
  }
  if (fs.existsSync(brief)) escreverTexto(path.join(ctx.pasta, 'brief-antes-da-leitura.md'), bruto);
  escreverTexto(brief, novo);
  return true;
}

// pedido: { negocio, google, site }. opcoes: { pasta (coleta/), brief (brief.md), leitor, bases,
// data, aoAvancar }. Só os testes passam tetoMs (teto da leitura) e permitirEnderecoLocal (fotos
// servidas em 127.0.0.1); o comando nunca. Devolve { avisos, dados, registros }.
export async function lerFontes(pedido, opcoes) {
  const ctx = {
    leitor: opcoes.leitor,
    pasta: opcoes.pasta,
    bases: { google: BASE_GOOGLE, ...(opcoes.bases || {}) },
    data: opcoes.data || hoje(),
    aoAvancar: opcoes.aoAvancar || (() => {}),
    prazo: Date.now() + (opcoes.tetoMs ?? TETO_DA_LEITURA_MS),
    permitirEnderecoLocal: opcoes.permitirEnderecoLocal === true,
    esgotou: false,
    avisos: [],
    registros: [],
    dados: {},
  };
  const busca = pedido.google || pedido.negocio || '';
  const g = busca ? await parteGoogle(busca, ctx) : null;
  const endereco = siteParaLer(pedido, g, ctx);
  const referencia = {
    nomes: [g && g.lugar.nome, String(pedido.negocio || '').split(',')[0]].filter(Boolean),
    telefones: [g && g.lugar.telefone].filter(Boolean),
  };
  if (endereco && Date.now() < ctx.prazo) await parteSite(endereco, referencia, ctx);
  else if (endereco) ctx.esgotou = true;
  if (ctx.esgotou) ctx.avisos.push(aviso('LER_TEMPO_ESGOTADO', { minutos: Math.round((opcoes.tetoMs ?? TETO_DA_LEITURA_MS) / 60000) }));
  const registros = R.semRepetir(ctx.registros);
  let noBrief = false;
  if (registros.length) {
    escreverJson(path.join(ctx.pasta, 'fatos-lidos.json'), registros);
    noBrief = gravarNoBrief(registros, ctx, opcoes.brief);
  }
  return { avisos: ctx.avisos, dados: { ...ctx.dados, fatos_registrados: registros.length, fatos_no_brief: noBrief, data: ctx.data }, registros };
}

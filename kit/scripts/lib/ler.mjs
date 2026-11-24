// Junta as duas leituras (perfil do Google e site atual), salva o que leu em
// apresentacoes/<nome>/coleta/ e põe os fatos, com fonte e data, numa parte própria e marcada da
// tabela de fatos do brief.md (lib/registros.mjs). Com só o nome do negócio e a cidade, o site atual
// vem do perfil do Google. Uma fonte que falha vira aviso; a outra segue.
// Portado do Site Estúdio (lib/ler.mjs), sem o Instagram (fica para depois, por decisão do produto).
import fs from 'node:fs';
import path from 'node:path';
import { lerGoogle, BASE_GOOGLE } from './ler-google.mjs';
import { lerSite, ehSiteDoNegocio } from './ler-site.mjs';
import { hoje } from './leitor.mjs';
import { escreverJson, escreverTexto, lerTexto } from './json.mjs';
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

async function tentar(fn) {
  try {
    return { ok: true, valor: await fn() };
  } catch (e) {
    return { ok: false, detalhe: detalheDoErro(e) };
  }
}

async function parteGoogle(busca, ctx) {
  const r = await tentar(() => lerGoogle(ctx.leitor, busca, { base: ctx.bases.google }));
  if (!r.ok) {
    ctx.avisos.push(aviso('LER_GOOGLE_FALHOU', { busca, detalhe: r.detalhe }));
    return null;
  }
  const g = r.valor;
  if (!g.achou) {
    ctx.avisos.push(aviso('LER_GOOGLE_NAO_ACHOU', { busca, motivo: g.motivo }));
    return null;
  }
  escreverJson(path.join(ctx.pasta, 'google', 'lugar.json'), g);
  if (g.alternativas.length) ctx.avisos.push(aviso('LER_GOOGLE_PRIMEIRO_DA_LISTA', { escolhido: g.lugar.nome, outros: g.alternativas }));
  if (!g.lugar.horario.length) ctx.avisos.push(aviso('LER_GOOGLE_SEM_HORARIO', { nome: g.lugar.nome }));
  ctx.registros.push(...R.registrosDoGoogle(g, ctx.data));
  ctx.dados.google = { nome: g.lugar.nome, fonte: g.lugar.fonte, dias_com_horario: g.lugar.horario.length, avaliacoes: g.avaliacoes.length };
  return g;
}

async function parteSite(endereco, ctx) {
  const r = await tentar(() => lerSite(ctx.leitor, endereco, { pasta: path.join(ctx.pasta, 'site'), aoAvancar: ctx.aoAvancar }));
  if (!r.ok) {
    ctx.avisos.push(aviso('LER_SITE_FALHOU', { endereco, detalhe: r.detalhe }));
    return null;
  }
  const s = r.valor;
  if (s.desvio) {
    ctx.avisos.push(aviso('LER_SITE_OUTRO_ENDERECO', { endereco, final: s.desvio }));
    return null;
  }
  const dir = path.join(ctx.pasta, 'site');
  escreverJson(path.join(dir, 'paginas.json'), s.paginas.map(({ texto, ...resto }) => resto));
  escreverTexto(path.join(dir, 'texto.md'), R.textoDoSite(s.paginas, ctx.data));
  ctx.registros.push(...R.registrosDoSite(s, ctx.data));
  ctx.dados.site = { endereco: s.inicio, paginas: s.paginas.length, fotos: s.fotos.length };
  return s;
}

// pedido: { negocio, google, site }. opcoes: { pasta (coleta/), brief (brief.md), leitor, bases,
// data, aoAvancar }. Devolve { avisos, dados, registros }.
export async function lerFontes(pedido, opcoes) {
  const ctx = {
    leitor: opcoes.leitor,
    pasta: opcoes.pasta,
    bases: { google: BASE_GOOGLE, ...(opcoes.bases || {}) },
    data: opcoes.data || hoje(),
    aoAvancar: opcoes.aoAvancar || (() => {}),
    avisos: [],
    registros: [],
    dados: {},
  };
  const busca = pedido.google || pedido.negocio || '';
  const g = busca ? await parteGoogle(busca, ctx) : null;
  const candidatos = [pedido.site, g && g.lugar.site].filter(Boolean);
  const endereco = pedido.site || candidatos.find(ehSiteDoNegocio) || '';
  if (endereco) await parteSite(endereco, ctx);
  const registros = R.semRepetir(ctx.registros);
  if (registros.length) {
    escreverJson(path.join(ctx.pasta, 'fatos-lidos.json'), registros);
    const atual = fs.existsSync(opcoes.brief) ? lerTexto(opcoes.brief) : '';
    escreverTexto(opcoes.brief, R.juntarNoBrief(atual, R.secaoLida(registros, ctx.data)));
  }
  return { avisos: ctx.avisos, dados: { ...ctx.dados, fatos_registrados: registros.length, data: ctx.data }, registros };
}

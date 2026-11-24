// Roda o axe-core (versão fixa em kit/vendor/axe/) dentro de cada tela, em cada beat assentado (o
// que entra no clique 2 e sai no 4 só existe no meio), e uma vez no index do deck (a moldura: idioma,
// título, botões e o nome de cada tela para o leitor de tela). Regras WCAG 2.0, 2.1 e 2.2 (A e AA)
// e boas práticas. RED: violação "critical" ou "serious". WARN: "moderate" e "minor". A mesma
// violação no mesmo elemento em vários beats conta uma vez.
// Portado do Site Estúdio (comando "acessibilidade"), sem o teste de teclado do menu (é de site).
import fs from 'node:fs';
import path from 'node:path';
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao } from '../lib/apresentacao.mjs';
import { abrirSessao, telasDoIndex } from '../lib/sessao.mjs';
import { ESPERAR_PRONTA, ASSENTAR } from '../lib/pagina.mjs';
import { KIT } from '../lib/caminhos.mjs';
import { falha } from '../lib/saida.mjs';
import { progresso } from '../lib/executar.mjs';

export const PASTA_AXE = path.join(KIT, 'vendor', 'axe');
export const ETIQUETAS = Object.freeze(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22a', 'wcag22aa', 'best-practice']);
const GRAVES = new Set(['critical', 'serious']);

// Regras desligadas numa tela de apresentação, cada uma com o motivo:
export const DESLIGADAS = Object.freeze({
  // o contraste é medido pelo checar, em cada beat, contra o fundo de verdade (foto da tela sem a
  // letra), com a mesma régua da WCAG. Ligada aqui, o mesmo texto reprovaria duas vezes, e a do axe
  // não sabe ler degradê, foto nem vídeo (é o fundo de quase toda tela).
  'color-contrast': 'medido pelo checar, contra a foto da tela',
  // uma tela é um quadro 16:9 dentro do deck, não uma página: não tem cabeçalho, menu nem rodapé
  // para separar em regiões (<main>, <nav>), nem um "título 1" obrigatório (uma tela de número só
  // tem o número). Ligadas, avisariam em toda tela, e aviso que sempre aparece ninguém lê.
  region: 'tela não tem regiões de página',
  'landmark-one-main': 'tela não tem regiões de página',
  'page-has-heading-one': 'tela de número ou de foto não tem título 1',
});

export function versaoDoAxe() {
  try {
    return fs.readFileSync(path.join(PASTA_AXE, 'VERSAO'), 'utf8').trim();
  } catch {
    return null;
  }
}

// Script que roda o axe dentro da página. iframes:false: o axe não espera resposta das telas dentro
// do index (cada tela é conferida por conta própria).
export function rodarAxe() {
  const regras = {};
  for (const r of Object.keys(DESLIGADAS)) regras[r] = { enabled: false };
  const opcoes = { runOnly: { type: 'tag', values: [...ETIQUETAS] }, rules: regras, resultTypes: ['violations'], iframes: false };
  return `(async () => {
    const r = await window.axe.run(document, ${JSON.stringify(opcoes)});
    return r.violations.map((v) => ({
      regra: v.id,
      impacto: v.impact || 'minor',
      ajuda: v.help,
      nos: v.nodes.slice(0, 4).map((n) => ({ alvo: n.target.join(' '), resumo: String(n.failureSummary || '').split('\\n').slice(0, 2).join(' ') })),
      total: v.nodes.length,
    }));
  })()`;
}

async function conferir(sessao, codigoAxe, onde, beat, vistos, red, warn) {
  // uma vez por página carregada (os beats da mesma tela reaproveitam)
  if (!(await sessao.tab.evaluate('!!window.axe'))) await sessao.tab.evaluate(`${codigoAxe}\n;void 0`, 60000);
  const violacoes = await sessao.tab.evaluate(rodarAxe(), 60000);
  for (const v of violacoes) {
    const chave = `${onde}|${v.regra}|${v.nos.map((n) => n.alvo).join(',')}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);
    const item = { tela: onde, ...(beat === null ? {} : { beat }), ...v };
    if (GRAVES.has(v.impacto)) red.push(item);
    else warn.push(item);
  }
}

const ESPERAR_PALCO = `(async () => {
  const inicio = Date.now();
  while (Date.now() - inicio < 8000) {
    if (window.__palco && window.__palco.atual() === 0 && !window.__palco.ocupado()) return true;
    await new Promise((r) => setTimeout(r, 100));
  }
  return false;
})()`;

export default async function acessibilidade(args) {
  const nome = nomeDaApresentacao(args);
  const c = abrirApresentacao(nome);
  const arquivoAxe = path.join(PASTA_AXE, 'axe.min.js');
  if (!fs.existsSync(arquivoAxe)) falha('AXE_AUSENTE', { arquivo: 'kit/vendor/axe/axe.min.js' });
  const codigoAxe = fs.readFileSync(arquivoAxe, 'utf8');
  const red = [];
  const warn = [];
  const vistos = new Set();
  let medidas = 0;
  const sessao = await abrirSessao(c.deck);
  try {
    const telas = (await telasDoIndex(sessao)).filter((t) => t.rel && fs.existsSync(path.join(c.deck, ...t.rel.split('/'))));
    progresso('Conferindo a acessibilidade do index...');
    await sessao.ir(sessao.url('index.html'));
    await sessao.tab.evaluate(ESPERAR_PALCO);
    await conferir(sessao, codigoAxe, 'index', null, vistos, red, warn);
    medidas += 1;
    for (const t of telas) {
      progresso(`Conferindo a acessibilidade de ${t.arquivo}...`);
      await sessao.ir(t.url);
      const pronta = await sessao.tab.evaluate(ESPERAR_PRONTA);
      const ultimo = pronta.contrato ? pronta.last : 0;
      for (let n = 0; n <= ultimo; n += 1) {
        await sessao.tab.evaluate(ASSENTAR(n));
        await conferir(sessao, codigoAxe, t.arquivo, n, vistos, red, warn);
        medidas += 1;
      }
    }
  } finally {
    await sessao.fechar();
  }
  const aprovado = red.length === 0;
  return {
    ok: aprovado,
    codigo: aprovado ? (warn.length ? 'ACESSIBILIDADE_COM_AVISOS' : 'ACESSIBILIDADE_OK') : 'ACESSIBILIDADE_REPROVADA',
    sair: aprovado ? 0 : 2,
    avisos: warn.length ? [{ codigo: 'ACESSIBILIDADE_COM_AVISOS', dados: { total: warn.length } }] : [],
    arquivos: { deck: c.rel('deck', 'index.html') },
    dados: {
      axe: versaoDoAxe(),
      medidas,
      desligadas: DESLIGADAS,
      red: red.length,
      warn: warn.length,
      vermelhos: red,
      amarelos: warn,
    },
  };
}

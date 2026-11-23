// Confere o deck no Chrome: estrutura (vendor local, nenhum endereço externo, fontes que carregam,
// links e mídia), e em cada tela × beat assentado: colisão de texto, texto < 18 px a 1920, texto fora
// da tela. RED reprova (saída 2). WARN avisa. Também confere roteiro × beats e <select> nativo.
import fs from 'node:fs';
import path from 'node:path';
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao, lerRoteiro, numeroDoNome } from '../lib/apresentacao.mjs';
import { abrirSessao, telasDoIndex } from '../lib/sessao.mjs';
import { ESPERAR_PRONTA, ASSENTAR, ESTATICO, MEDIR } from '../lib/pagina.mjs';
import { progresso } from '../lib/executar.mjs';
import { esperar } from '../lib/cdp.mjs';

export const LIMITES = Object.freeze({
  texto_minimo: 18, // px na tela de 1920
  sobreposicao: 8, // px nos dois eixos para contar como colisão
  vazamento: 4, // px além da tela ou do recorte
  respiro_titulo: 16, // px entre título e o texto logo abaixo
  maximo: 15, // achados por tela e beat
});

const VENDOR_OBRIGATORIO = [['assets', 'vendor', 'palco', 'palco.js']];

function conferirArquivos(c, red) {
  for (const partes of VENDOR_OBRIGATORIO) {
    if (!fs.existsSync(path.join(c.deck, ...partes))) red.push({ tela: 'index', tipo: 'vendor-ausente', detalhe: partes.join('/') });
  }
}

async function conferirIndex(sessao, red) {
  sessao.zerarRede();
  await sessao.ir(sessao.url('index.html'));
  const est = await sessao.tab.evaluate(ESTATICO);
  const palco = await sessao.tab.evaluate(`(async () => {
    const inicio = Date.now();
    while (Date.now() - inicio < 8000) {
      if (window.__palco && window.__palco.atual() === 0 && !window.__palco.ocupado()) return { ok: true, total: window.__palco.total };
      await new Promise((r) => setTimeout(r, 100));
    }
    return { ok: !!window.__palco, total: window.__palco ? window.__palco.total : 0, preso: true };
  })()`);
  if (!palco.ok) red.push({ tela: 'index', tipo: 'palco-ausente', detalhe: 'o index não carregou assets/vendor/palco/palco.js' });
  else if (palco.preso) red.push({ tela: 'index', tipo: 'palco-preso', detalhe: 'a primeira tela não apareceu em 8 s' });
  anotarEstatico('index', est, sessao.rede(), red);
}

function anotarEstatico(tela, est, rede, red) {
  if (est.selects > 0) red.push({ tela, tipo: 'select-nativo', detalhe: `${est.selects} <select> na tela` });
  const externos = new Set([...est.externos.map((e) => e.url), ...rede.externos]);
  for (const url of externos) red.push({ tela, tipo: 'endereco-externo', detalhe: url });
  const quebrados = new Map();
  for (const q of [...est.quebrados, ...rede.quebrados]) quebrados.set(q.url, q.status || q.erro || 0);
  for (const [url, status] of quebrados) red.push({ tela, tipo: 'arquivo-quebrado', detalhe: `${url} (${status || 'sem resposta'})` });
  for (const f of est.fontesComErro) red.push({ tela, tipo: 'fonte-quebrada', detalhe: f });
  for (const f of est.fantasmas) red.push({ tela, tipo: 'fonte-nao-declarada', detalhe: f });
}

export default async function checar(args) {
  const nome = nomeDaApresentacao(args);
  const c = abrirApresentacao(nome);
  const red = [];
  const warn = [];
  const telasMedidas = [];
  conferirArquivos(c, red);

  const sessao = await abrirSessao(c.deck);
  try {
    const telas = await telasDoIndex(sessao);
    if (!telas.length) red.push({ tela: 'index', tipo: 'sem-telas', detalhe: 'nenhuma <section> com iframe data-src' });
    await conferirIndex(sessao, red);

    for (const t of telas) {
      const rotulo = t.arquivo || t.id;
      if (!t.rel) {
        red.push({ tela: t.id, tipo: 'tela-sem-arquivo', detalhe: t.url ? `fora do deck: ${t.url}` : 'section sem data-src' });
        continue;
      }
      if (!fs.existsSync(path.join(c.deck, ...t.rel.split('/')))) {
        red.push({ tela: rotulo, tipo: 'tela-sem-arquivo', detalhe: t.rel });
        continue;
      }
      progresso(`Conferindo ${rotulo}...`);
      sessao.zerarRede();
      await sessao.ir(t.url);
      const pronta = await sessao.tab.evaluate(ESPERAR_PRONTA);
      const est = await sessao.tab.evaluate(ESTATICO);
      if (!pronta.contrato) warn.push({ tela: rotulo, tipo: 'sem-contrato', detalhe: 'a tela não carregou cena.js (window.__slide): beats não medidos' });
      const beats = pronta.contrato ? pronta.last : 0;
      for (let n = 0; n <= beats; n += 1) {
        await sessao.tab.evaluate(ASSENTAR(n));
        const m = await sessao.tab.evaluate(MEDIR(LIMITES));
        for (const r of m.red) red.push({ tela: rotulo, beat: n, ...r });
        for (const w of m.warn) warn.push({ tela: rotulo, beat: n, ...w });
      }
      await esperar(50);
      anotarEstatico(rotulo, est, sessao.rede(), red);
      telasMedidas.push({ tela: rotulo, numero: numeroDoNome(t.arquivo), beats: beats + 1 });
    }
  } finally {
    await sessao.fechar();
  }

  // roteiro × telas (aviso: o teleprompter depende disso)
  const roteiro = lerRoteiro(c.roteiro);
  for (const p of roteiro.problemas) warn.push({ tela: 'roteiro', tipo: 'roteiro-invalido', detalhe: `${p.arquivo}: ${p.problema}` });
  for (const t of telasMedidas) {
    if (t.numero === null) {
      warn.push({ tela: t.tela, tipo: 'tela-sem-numero', detalhe: 'o nome do arquivo precisa de número (s01-…) para o teleprompter' });
      continue;
    }
    const r = roteiro.telas.find((x) => x.tela === t.numero);
    if (!r) warn.push({ tela: t.tela, tipo: 'roteiro-ausente', detalhe: `falta roteiro/S${String(t.numero).padStart(2, '0')}.json (a tela tem ${t.beats} beats)` });
    else if (r.beats.length !== t.beats) warn.push({ tela: t.tela, tipo: 'roteiro-descasado', detalhe: `a tela tem ${t.beats} beats e o roteiro tem ${r.beats.length}` });
  }

  const aprovado = red.length === 0;
  return {
    ok: aprovado,
    codigo: aprovado ? (warn.length ? 'CHECAGEM_COM_AVISOS' : 'CHECAGEM_OK') : 'CHECAGEM_REPROVADA',
    sair: aprovado ? 0 : 2,
    avisos: warn.length ? [{ codigo: 'CHECAGEM_COM_AVISOS', dados: { total: warn.length } }] : [],
    arquivos: { deck: c.rel('deck', 'index.html') },
    dados: {
      telas: telasMedidas.length,
      beats: telasMedidas.reduce((s, t) => s + t.beats, 0),
      por_tela: telasMedidas.map((t) => ({ tela: t.tela, beats: t.beats })),
      red: red.length,
      warn: warn.length,
      vermelhos: red,
      amarelos: warn,
      limites: LIMITES,
    },
  };
}

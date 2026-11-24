// Revisão mais curta e estável, sem navegador: o resumo de cada rodada, o contexto que os
// revisores da rodada seguinte recebem (régua + aceitos e recusados, sem nota nenhuma), e as duas
// metas medidas em separado: passar com 8,5 em até 2 rodadas; estabilidade de até 0,3 por lente
// numa reavaliação do mesmo estado da apresentação, sem conserto entre as duas notas.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validarRodada, trajetoria, montarContexto, proximaRodada } from '../scripts/lib/rodadas.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESPACHANTE = path.join(RAIZ, 'kit', 'scripts', 'estudio.mjs');
const REGUA = fs.readFileSync(path.join(RAIZ, 'kit', 'regua-revisao.md'), 'utf8');
const SKILL = fs.readFileSync(path.join(RAIZ, '.claude', 'skills', 'revisar', 'SKILL.md'), 'utf8');

let base;
let env;
function estudio(...args) {
  const r = spawnSync(process.execPath, [DESPACHANTE, ...args], { encoding: 'utf8', env, timeout: 60000 });
  const linhas = (r.stdout || '').trim().split('\n');
  return { codigo: r.status, json: JSON.parse(linhas[linhas.length - 1]) };
}
before(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-rev-'));
  env = { ...process.env, ESTUDIO_APRESENTACOES: base, ESTUDIO_MARCA: path.join(base, 'sem-marca'), ESTUDIO_NAO_ABRIR: '1' };
});
after(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

const PLATEIA = Object.freeze({ promessa: 'agendar sem fila', pedido: 'aprovar o piloto', sem_fala: true });
const rodada = (n, notas, extra = {}) => ({
  rodada: n,
  notas,
  plateia: { ...PLATEIA },
  bloqueios: [],
  aceitos: [],
  recusados: [],
  ...extra,
});
const OITO = Object.freeze({ arte: 8, geral: 8, fatos: 8, qa: 8 });

test('rodada-N.json: valida notas de 0 a 10, as 4 lentes, o número da rodada, as listas e a plateia', () => {
  assert.deepEqual(validarRodada(rodada(1, { ...OITO }), 1), []);
  const erros = validarRodada({ rodada: 2, notas: { arte: 11, geral: '8' }, aceitos: [{}], recusados: 'nada' }, 1);
  for (const parte of ['"rodada" deveria ser 1', 'nota "arte"', 'nota "geral"', 'nota "fatos"', 'nota "qa"', 'aceitos[0] sem "problema"', '"recusados" precisa ser uma lista', 'falta "plateia"']) {
    assert.ok(erros.some((e) => e.includes(parte)), `${parte} em ${erros.join(' | ')}`);
  }
  assert.deepEqual(validarRodada([], 1), ['não é um objeto']);
  // o teste da plateia é obrigatório e "sem_fala" é sim ou não, não texto
  const plateiaRuim = validarRodada(rodada(1, { ...OITO }, { plateia: { promessa: '', pedido: 'aprovar', sem_fala: 'sim' } }), 1);
  assert.ok(plateiaRuim.some((e) => e.includes('plateia.promessa')), plateiaRuim.join(' | '));
  assert.ok(plateiaRuim.some((e) => e.includes('plateia.sem_fala')), plateiaRuim.join(' | '));
  // a reavaliação é opcional, mas quando vem traz as 4 notas
  const reavRuim = validarRodada(rodada(1, { ...OITO }, { reavaliacao: { notas: { arte: 8 } } }), 1);
  assert.ok(reavRuim.some((e) => e.includes('reavaliacao') && e.includes('"qa"')), reavRuim.join(' | '));
});

test('trajetória: média de uma casa para mostrar, passa com 8,5 e nenhuma lente abaixo de 7,5', () => {
  const t = trajetoria([
    rodada(1, { arte: 7.3, geral: 7.4, fatos: 7.4, qa: 8.6 }),
    rodada(2, { arte: 8.4, geral: 8.6, fatos: 8.8, qa: 9.0 }),
  ]);
  assert.deepEqual(t.notas.map((n) => [n.rodada, n.media, n.passou]), [[1, 7.7, false], [2, 8.7, true]]);
  assert.equal(t.passou_na_rodada, 2);
  // média alta não basta: uma lente abaixo de 7,5 ou um bloqueio seguram a rodada
  assert.equal(trajetoria([rodada(1, { arte: 7.4, geral: 9.5, fatos: 9.5, qa: 9.5 })]).notas[0].passou, false);
  const bloqueada = trajetoria([rodada(1, { arte: 9, geral: 9, fatos: 9, qa: 9 }, { bloqueios: ['fato sem fonte'] })]);
  assert.deepEqual([bloqueada.notas[0].passou, bloqueada.passou_na_rodada], [false, null]);
});

test('trajetória: 8,45 não vira 8,5 para passar; 8,5 exato passa', () => {
  const quase = trajetoria([rodada(1, { arte: 8.4, geral: 8.5, fatos: 8.4, qa: 8.5 })]);
  assert.deepEqual([quase.notas[0].passou, quase.passou_na_rodada], [false, null]);
  const exato = trajetoria([rodada(1, { arte: 8.4, geral: 8.6, fatos: 8.5, qa: 8.5 })]);
  assert.deepEqual([exato.notas[0].media, exato.notas[0].passou], [8.5, true]);
});

test('trajetória: plateia que não sabe o que fazer no fim bloqueia sozinha e o geral acima de 7 é acusado', () => {
  const semFala = { ...PLATEIA, sem_fala: false };
  const t = trajetoria([rodada(1, { arte: 9, geral: 8.5, fatos: 9, qa: 9 }, { plateia: semFala })]);
  assert.deepEqual([t.notas[0].passou, t.passou_na_rodada, t.notas[0].bloqueios], [false, null, 1]);
  assert.deepEqual(t.notas[0].alertas, ['plateia_sem_fala', 'geral_acima_do_teto']);
  const noTeto = trajetoria([rodada(1, { arte: 9, geral: 7, fatos: 9, qa: 9 }, { plateia: semFala })]);
  assert.deepEqual(noTeto.notas[0].alertas, ['plateia_sem_fala']);
  assert.deepEqual(trajetoria([rodada(1, { arte: 9, geral: 9, fatos: 9, qa: 9 })]).notas[0].alertas, []);
});

test('trajetória: promessa ou pedido que não batem com o brief põem o geral no teto 7, sem virar bloqueio', () => {
  const naoBate = { ...PLATEIA, bate_com_brief: false };
  const acima = trajetoria([rodada(1, { arte: 9, geral: 8.5, fatos: 9, qa: 9 }, { plateia: naoBate })]);
  assert.deepEqual(acima.notas[0].alertas, ['plateia_nao_bate', 'geral_acima_do_teto']);
  assert.equal(acima.notas[0].bloqueios, 0);
  const os2 = trajetoria([rodada(1, { arte: 9, geral: 8, fatos: 9, qa: 9 }, { plateia: { ...naoBate, sem_fala: false } })]);
  assert.deepEqual(os2.notas[0].alertas, ['plateia_sem_fala', 'plateia_nao_bate', 'geral_acima_do_teto']);
  // "bate_com_brief" é sim ou não; ausente não acusa nada
  const ruim = validarRodada(rodada(1, { ...OITO }, { plateia: { ...naoBate, bate_com_brief: 'não' } }), 1);
  assert.ok(ruim.some((e) => e.includes('plateia.bate_com_brief')), ruim.join(' | '));
});

test('metas separadas: rodadas por passou_na_rodada; estabilidade só por reavaliação do mesmo estado', () => {
  const semMedida = trajetoria([rodada(1, { arte: 9, geral: 9, fatos: 9, qa: 9 })]);
  assert.equal(semMedida.estabilidade, null);
  assert.deepEqual(semMedida.metas, { em_ate_2_rodadas: true, estabilidade: null });
  // subir de 7,7 para 8,7 com conserto no meio é progresso, não instabilidade
  const r1 = rodada(1, { arte: 7.3, geral: 7.4, fatos: 7.4, qa: 8.6 });
  const r2 = rodada(2, { arte: 8.4, geral: 8.6, fatos: 8.8, qa: 9.0 }, { reavaliacao: { notas: { arte: 8.6, geral: 8.4, fatos: 8.8, qa: 9.1 } } });
  const t = trajetoria([r1, r2]);
  assert.deepEqual(t.estabilidade, { arte: 0.2, geral: 0.2, fatos: 0, qa: 0.1, media: 0, rodadas: [2] });
  assert.deepEqual(t.metas, { em_ate_2_rodadas: true, estabilidade: true });
  const instavel = trajetoria([rodada(1, { arte: 9, geral: 9, fatos: 9, qa: 9 }, { reavaliacao: { notas: { arte: 8.4, geral: 9, fatos: 9, qa: 9 } } })]);
  assert.deepEqual([instavel.estabilidade.arte, instavel.metas.estabilidade], [0.6, false]);
  // passou só na terceira: a regra deixa, mas o indicador de 2 rodadas acusa
  const tarde = trajetoria([rodada(1, { ...OITO }), rodada(2, { ...OITO }), rodada(3, { arte: 9, geral: 9, fatos: 9, qa: 9 })]);
  assert.deepEqual([tarde.passou_na_rodada, tarde.metas.em_ate_2_rodadas], [3, false]);
});

test('contexto: régua sem meta nem ruído; decisões sem nota nenhuma, da rodada mais nova para a mais velha', () => {
  const primeira = montarContexto(1, REGUA, []);
  assert.ok(primeira.includes('## Régua das notas') && primeira.includes('primeira rodada'));
  for (const ancora of ['ruído', '0,3', 'problema novo', '8,5 em']) assert.ok(!REGUA.includes(ancora), `régua traz "${ancora}"`);
  for (const lente of ['### Diretor de arte', '### Diretor geral', '### Revisor de fatos', '### QA', '**Teto:**']) assert.ok(REGUA.includes(lente), lente);
  const ctx = montarContexto(3, REGUA, [
    rodada(1, { arte: 7, geral: 7, fatos: 7, qa: 8 }, { recusados: [{ lente: 'arte', problema: 'centralizar o pico', porque: 'o piloto aprovado pede o pico à esquerda' }] }),
    rodada(2, { arte: 8.4, geral: 8.6, fatos: 8.8, qa: 9 }, { aceitos: [{ lente: 'qa', tela: 4, problema: 'legenda encosta no gráfico no passo 2', conserto: 'legenda subiu 24 px' }] }),
  ]);
  assert.ok(ctx.indexOf('### Rodada 2') >= 0 && ctx.indexOf('### Rodada 2') < ctx.indexOf('### Rodada 1'), ctx);
  for (const nota of ['média', '8,7', '7,3', '8.6', '8,6']) assert.ok(!ctx.includes(nota), `contexto traz "${nota}"`);
  assert.ok(ctx.includes('- QA (tela 4). legenda encosta no gráfico no passo 2: legenda subiu 24 px'), ctx);
  assert.ok(ctx.includes('- Diretor de arte. centralizar o pico: o piloto aprovado pede o pico à esquerda'), ctx);
  assert.ok(ctx.includes('Não reabra sem fato novo'));
});

test('skill revisar: o diretor geral faz o teste da plateia antes de ler o contexto; meta e ruído fora do pedido', () => {
  const geral = SKILL.split('\n').find((l) => l.startsWith('**Diretor geral.**'));
  assert.ok(geral, 'parágrafo do diretor geral');
  const fotos = geral.indexOf('do último passo de cada tela');
  const contexto = geral.indexOf('contexto-rN.md');
  assert.ok(fotos >= 0 && contexto > fotos, 'as fotos vêm antes do contexto no pedido do diretor geral');
  assert.ok(!SKILL.includes('Todo pedido começa com'), 'regra geral contradiz o diretor geral');
  const lentes = SKILL.slice(SKILL.indexOf('## 3. As 4 lentes'), SKILL.indexOf('## 4.'));
  for (const ancora of ['0,3', 'ruído', '8,5']) assert.ok(!lentes.includes(ancora), `lentes trazem "${ancora}"`);
  // o teto da régua e a skill dizem a mesma coisa, e o formato do rodada-N.json está na skill
  assert.ok(REGUA.includes('promessa ou pedido final errados, ou não dá para saber o que fazer no fim só pelas telas'));
  assert.ok(SKILL.includes('Plateia com resposta que não bate com o brief, ou com "não" na terceira pergunta, põe o diretor geral no teto 7'));
  for (const campo of ['"plateia"', '"sem_fala"', '"bate_com_brief"', '"aceitos"', '"recusados"']) assert.ok(SKILL.includes(campo), campo);
  assert.ok(SKILL.includes('./estudio revisao <nome> --rodada N'));
});

test('revisao: escreve contexto-rN.md, avisa rodada ilegível e devolve a trajetória das notas', () => {
  assert.equal(estudio('nova', 'rev').codigo, 0);
  const pasta = path.join(base, 'rev', 'revisao');
  assert.equal(proximaRodada(pasta), 1, 'sem pasta de revisão, a primeira rodada');
  fs.mkdirSync(pasta, { recursive: true });
  const r1 = rodada(1, { arte: 7.6, geral: 7.8, fatos: 8.0, qa: 8.6 }, { recusados: [{ lente: 'fatos', problema: 'tirar o ano da tela 2', porque: 'a planilha confirma' }] });
  fs.writeFileSync(path.join(pasta, 'rodada-1.json'), JSON.stringify(r1));
  fs.writeFileSync(path.join(pasta, 'rodada-1.md'), '# Rodada 1\n');
  fs.writeFileSync(path.join(pasta, 'rodada-2.md'), '# Rodada 2\n');
  fs.writeFileSync(path.join(pasta, 'rodada-2.json'), '{ "rodada": 2, ');
  const r = estudio('revisao', 'rev');
  assert.equal(r.codigo, 0, JSON.stringify(r.json));
  assert.equal(r.json.codigo, 'REVISAO_PRONTA');
  assert.equal(r.json.dados.rodada, 3);
  assert.deepEqual(r.json.dados.rodadas_anteriores, [1]);
  assert.deepEqual(r.json.avisos.map((a) => a.codigo), ['RODADA_ILEGIVEL']);
  assert.deepEqual(r.json.dados.notas.map((n) => n.media), [8]);
  const ctx = fs.readFileSync(path.join(pasta, 'contexto-r3.md'), 'utf8');
  assert.ok(ctx.startsWith('# Contexto da rodada 3'));
  assert.ok(ctx.includes('## Régua das notas') && ctx.includes('tirar o ano da tela 2: a planilha confirma'));
  // a rodada pode ser escolhida; fora de 1 a 99 é argumento inválido
  assert.equal(estudio('revisao', 'rev', '--rodada', '1').json.dados.rodada, 1);
  assert.ok(fs.readFileSync(path.join(pasta, 'contexto-r1.md'), 'utf8').includes('primeira rodada'));
  const ruim = estudio('revisao', 'rev', '--rodada', '0');
  assert.deepEqual([ruim.codigo, ruim.json.codigo], [1, 'ARGUMENTO_INVALIDO']);
  // apresentação que não existe
  assert.equal(estudio('revisao', 'nao-existe').json.codigo, 'APRESENTACAO_NAO_ACHADA');
});

// Comando publicar fora do caminho feliz (achados da revisão): relógio local diferente do serviço,
// orçamento de tempo de uma chamada, resposta do concluir que se perde, códigos que o servidor real
// devolve além do contrato e o --sair que não revoga a chave no serviço.
// Portado do Site Estúdio (kit/testes/publicar-revisao.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { RAIZ, MENSAGENS, NOME, rodar, preparar, darChave } from './publicar-apoio.mjs';
import { TEMPO_DE_CONCLUIR_MS, configuracao } from '../scripts/lib/publicar-servico.mjs';
import { arquivoChave, arquivoPedido, arquivoConferir, gravarPedido, lerPedido } from '../scripts/lib/publicar-guarda.mjs';

const UMA_HORA = 3600000;

test('pedido vencido no relógio deste computador continua sendo consultado: quem diz que acabou é o serviço', async (t) => {
  const ctx = await preparar(t);
  ctx.servico.estado.expiraDelta = -UMA_HORA; // relógio local uma hora adiantado
  const r1 = await ctx.publicar();
  assert.equal(r1.json.codigo, 'PUBLICAR_AGUARDANDO_LOGIN');
  ctx.servico.aprovar();
  const r2 = await ctx.publicar();
  assert.equal(r2.json.codigo, 'PUBLICADO', r2.saida);
  assert.equal(ctx.servico.estado.iniciados, 1, 'não abriu um pedido novo');
  assert.ok(ctx.servico.estado.consultas >= 1, 'consultou o pedido guardado');
});

test('pedido guardado há mais de um dia (relógio deste computador) é lixo e sai', (t) => {
  const ferr = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-pedido-'));
  t.after(() => fs.rmSync(ferr, { recursive: true, force: true }));
  const pedido = { codigo_dispositivo: 'disp', codigo_curto: 'BCDF-GHJK', endereco: 'http://127.0.0.1:9/estudio/ligar', expira_em: 1 };
  gravarPedido('http://127.0.0.1:9', pedido, ferr);
  assert.equal(lerPedido('http://127.0.0.1:9', ferr).codigo_curto, 'BCDF-GHJK', 'expira_em do serviço no passado não apaga');
  assert.equal(lerPedido('http://127.0.0.1:9', ferr, Date.now() + 25 * UMA_HORA), null);
  assert.equal(fs.existsSync(arquivoPedido(ferr)), false);
});

test('aprovação que chega durante a espera devolve PUBLICAR_ACESSO_LIBERADO e publica só na próxima chamada', async (t) => {
  // Prazo longo: a aprovação chega na 2ª consulta, e a máquina carregada não pode encerrar a espera antes.
  const ctx = await preparar(t, {}, { ESTUDIO_PUBLICAR_PRAZO_MS: '20000' });
  await ctx.publicar();
  ctx.servico.estado.aprovarNaConsulta = ctx.servico.estado.consultas + 2; // 1ª consulta: aguardando; 2ª: aprovado
  const r2 = await ctx.publicar();
  assert.deepEqual([r2.codigo, r2.json.codigo], [0, 'PUBLICAR_ACESSO_LIBERADO'], r2.saida);
  assert.equal(ctx.servico.estado.publicados.length, 0, 'não publicou na mesma chamada');
  assert.equal(fs.existsSync(arquivoChave(ctx.ferr)), true);
  const r3 = await ctx.publicar();
  assert.equal(r3.json.codigo, 'PUBLICADO');
  assert.equal(ctx.servico.estado.iniciados, 1);
});

test('a espera do cadeado cabe no orçamento total da chamada', async (t) => {
  const ctx = await preparar(t, {}, { ESTUDIO_PUBLICAR_PRAZO_MS: '30000', ESTUDIO_PUBLICAR_ORCAMENTO_MS: '1' });
  darChave(ctx);
  ctx.servico.estado.enderecoDoSite = `${ctx.servico.base}/fora/`;
  const inicio = Date.now();
  const r = await ctx.publicar();
  assert.equal(r.json.codigo, 'PUBLICADO_CERTIFICADO_PENDENTE');
  // o prazo do cadeado é 30 s; a chamada tem de voltar bem antes (a folga cobre o Node lento do CI)
  assert.ok(Date.now() - inicio < 15000, 'não esperou o prazo inteiro do cadeado');
  assert.equal(configuracao({}).tempos.orcamentoMs, 100000);
  assert.ok(TEMPO_DE_CONCLUIR_MS > 30000 && TEMPO_DE_CONCLUIR_MS < 60000, 'concluir espera mais que uma chamada comum, abaixo do corte do proxy');
});

test('concluir sem resposta (queda ou 504 do proxy): confere na lista do painel e acha a versão nova', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  ctx.servico.estado.concluirCai = 'socket';
  const r1 = await ctx.publicar();
  assert.deepEqual([r1.codigo, r1.json.codigo, r1.json.dados.versao], [0, 'PUBLICADO', 1], r1.saida);
  ctx.servico.estado.concluirCai = '504';
  const r2 = await ctx.publicar();
  assert.deepEqual([r2.json.codigo, r2.json.dados.versao], ['PUBLICADO', 2], r2.saida);
  assert.equal(ctx.servico.estado.publicados.length, 2, 'nenhuma publicação a mais');
});

test('concluir sem resposta e sem versão nova ainda: PUBLICAR_CONCLUSAO_INCERTA; a próxima chamada confere antes de mandar', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  ctx.servico.estado.concluirCai = 'sem_publicar';
  const r1 = await ctx.publicar();
  assert.deepEqual([r1.codigo, r1.json.codigo], [1, 'PUBLICAR_CONCLUSAO_INCERTA'], r1.saida);
  assert.ok(!MENSAGENS.PUBLICAR_CONCLUSAO_INCERTA.texto.includes('nada foi'), 'não promete que nada mudou');
  assert.equal(fs.existsSync(arquivoConferir(NOME, ctx.ferr)), true);
  ctx.servico.publicarPendentes(); // o serviço terminou depois
  const r2 = await ctx.publicar();
  assert.deepEqual([r2.json.codigo, r2.json.dados.versao], ['PUBLICADO', 1], r2.saida);
  assert.equal(ctx.servico.estado.aberturas, 1, 'não mandou a apresentação de novo');
  assert.equal(fs.existsSync(arquivoConferir(NOME, ctx.ferr)), false);
});

test('concluir que de fato não publicou: a próxima chamada confere, não acha e manda de novo', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  ctx.servico.estado.concluirCai = 'sem_publicar';
  assert.equal((await ctx.publicar()).json.codigo, 'PUBLICAR_CONCLUSAO_INCERTA');
  ctx.servico.estado.pendentes.length = 0; // o serviço desistiu
  const r2 = await ctx.publicar();
  assert.deepEqual([r2.json.codigo, r2.json.dados.versao, ctx.servico.estado.aberturas], ['PUBLICADO', 1, 2]);
});

test('códigos que o servidor real devolve além do contrato têm frase própria e verdadeira', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const est = ctx.servico.estado;
  est.erroAoConcluir = { status: 500, codigo: 'PUBLICACAO_INCOMPLETA' };
  assert.equal((await ctx.publicar()).json.codigo, 'PUBLICAR_NO_AR_AJUSTANDO');
  est.erroAoConcluir = null;
  const casos = [
    ['erroAoVoltar', 500, 'PUBLICACAO_INCOMPLETA', 'PUBLICAR_NO_AR_AJUSTANDO'],
    ['erroAoVoltar', 404, 'SITE_INEXISTENTE', 'PUBLICAR_SITE_AINDA_NAO_PUBLICADO'],
    ['erroAoVoltar', 409, 'SITE_FORA_DO_AR', 'PUBLICAR_SITE_TIRADO_DO_AR'],
    ['erroAoVoltar', 422, 'VERSAO_RUIM', 'PUBLICAR_VERSAO_RUIM'],
    ['erroAoAbrir', 409, 'SITE_FORA_DO_AR', 'PUBLICAR_SITE_TIRADO_DO_AR'],
    ['erroAoAbrir', 409, 'ENVIO_EM_ANDAMENTO', 'PUBLICAR_ENVIO_EM_ANDAMENTO'],
  ];
  for (const [campo, status, codigoServico, codigo] of casos) {
    est.erroAoVoltar = null;
    est.erroAoAbrir = null;
    est[campo] = { status, codigo: codigoServico };
    const r = campo === 'erroAoVoltar' ? await ctx.publicar('--voltar') : await ctx.publicar();
    assert.equal(r.json.codigo, codigo, codigoServico);
    assert.equal(r.json.resumo, MENSAGENS[codigo].texto);
  }
  assert.ok(!MENSAGENS.PUBLICAR_RECUSADO.texto.includes('não foi alterado'), 'a frase genérica não afirma o que não sabe');
  assert.ok(MENSAGENS.PUBLICAR_NO_AR_AJUSTANDO.texto.includes('foi para o ar'), 'diz que a apresentação subiu');
});

test('--sair avisa que, para cortar de vez, é preciso revogar este computador na conta', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const r = await rodar(['publicar', '--sair'], ctx.env);
  assert.equal(r.json.dados.revogar_em, `${ctx.servico.base}/conta`);
  const m = MENSAGENS.PUBLICAR_SAIU;
  assert.ok(!m.texto.includes('não publica mais'), 'não promete que o acesso acabou');
  assert.ok(m.acao.includes('revogar'));
  const skill = fs.readFileSync(path.join(RAIZ, '.claude', 'skills', 'por-no-ar', 'SKILL.md'), 'utf8');
  assert.ok(skill.includes('revogue este computador'), 'a skill manda revogar na conta');
  assert.ok(skill.includes('300000'), 'a skill dá ao publicar um prazo que cabe a chamada inteira');
});

// O que é só do View na publicação (o resto, portado do Site Estúdio, está em publicar.test.mjs e
// publicar-revisao.test.mjs): vermelho não vai para o ar (as três conferências aprovadas para a
// apresentação como está agora), o que sobe e o que nunca sobe (teleprompter, rascunho, brief,
// roteiro), a guarda de arquivo privado, o nome no ar (--no-ar, guardado para as próximas vezes),
// tipo de arquivo que o painel recusa, o teto, e o comando pacote. Serviço falso, só em 127.0.0.1.
// O teste do fim roda o checar, o acessibilidade e o fatos de verdade (pula sem Chrome).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { NOME, MENSAGENS, rodar, preparar, darChave, conferirTudo } from './publicar-apoio.mjs';
import { lerZip } from '../scripts/lib/zip.mjs';
import { montarPacote, foraDoPacote } from '../scripts/lib/pacote.mjs';
import { conferenciasQueFaltam, anotarConferencia, impressaoDaApresentacao, CONFERENCIAS } from '../scripts/lib/conferencias.mjs';
import { caminhosDe } from '../scripts/lib/apresentacao.mjs';
import { conferirParaOPainel, tipoAceito, nomeAceito, nomesRepetidos, TETO_MB, MAX_ARQUIVOS } from '../scripts/lib/regras-do-painel.mjs';
import { acharNavegador } from '../scripts/lib/chrome.mjs';
import { KitErro } from '../scripts/lib/saida.mjs';

const escrever = (c, rel, texto) => {
  const abs = path.join(c.pasta, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, texto);
};
const nadaChegouAoServico = (ctx) => {
  const e = ctx.servico.estado;
  assert.deepEqual([e.iniciados, e.aberturas, e.publicados.length, e.autorizacoes.length], [0, 0, 0, 0], 'nada chegou ao serviço');
};

test('sem as conferências aprovadas, nem publica nem empacota, e não fala com o serviço', async (t) => {
  const ctx = await preparar(t, {}, {}, { conferida: false });
  darChave(ctx);
  const r = await ctx.publicar();
  assert.deepEqual([r.codigo, r.json.codigo], [2, 'PUBLICAR_CONFERIR_ANTES'], r.saida);
  assert.deepEqual(r.json.dados.faltam, ['checar', 'fatos', 'acessibilidade']);
  assert.equal(r.json.resumo, MENSAGENS.PUBLICAR_CONFERIR_ANTES.texto);
  nadaChegouAoServico(ctx);
  const p = await rodar(['pacote', NOME], ctx.env);
  assert.deepEqual([p.codigo, p.json.codigo], [2, 'PUBLICAR_CONFERIR_ANTES']);
  assert.equal(fs.existsSync(path.join(ctx.c.pasta, `${NOME}-apresentacao.zip`)), false);
});

test('conferência vale para a apresentação como estava: mudar tela, brief ou roteiro pede de novo; teleprompter e rascunho não', async (t) => {
  const ctx = await preparar(t, {}, {}, { conferida: false });
  const { c } = ctx;
  conferirTudo(c);
  assert.deepEqual(conferenciasQueFaltam(c), []);
  // o que não sobe nem é conferido não derruba a aprovação
  escrever(c, 'deck/teleprompter.html', '<p>fala nova</p>');
  escrever(c, 'deck/_lab/outro.html', '<p>outro rascunho</p>');
  escrever(c, 'prints/s01-b0.jpg', 'jpg');
  escrever(c, 'no-ar.json', '{}');
  assert.deepEqual(conferenciasQueFaltam(c), []);
  for (const rel of ['deck/slides/s01-capa.html', 'brief.md', 'roteiro/S01.json']) {
    conferirTudo(c);
    escrever(c, rel, `${fs.readFileSync(path.join(c.pasta, ...rel.split('/')), 'utf8')} mudou`);
    assert.deepEqual(conferenciasQueFaltam(c), ['checar', 'fatos', 'acessibilidade'], rel);
  }
  // uma conferência que reprova apaga só a sua
  conferirTudo(c);
  anotarConferencia(c, 'fatos', impressaoDaApresentacao(c), false);
  assert.deepEqual(conferenciasQueFaltam(c), ['fatos']);
  // arquivo de conferências estragado vale como "nenhuma"
  fs.writeFileSync(path.join(c.revisao, 'conferencias.json'), '{ estragado');
  assert.deepEqual(conferenciasQueFaltam(c), [...CONFERENCIAS]);
  darChave(ctx);
  const r = await ctx.publicar();
  assert.equal(r.json.codigo, 'PUBLICAR_CONFERIR_ANTES');
  nadaChegouAoServico(ctx);
});

test('o que sobe: deck pronto, sem teleprompter, rascunho, brief nem roteiro; vídeo vai sem recomprimir', async (t) => {
  const ctx = await preparar(t);
  const { c } = ctx;
  const video = crypto.randomBytes(2000);
  fs.writeFileSync(path.join(c.deck, 'assets', 'cena.mp4'), video);
  escrever(c, 'deck/slides/s02-cena.html', '<video src="../assets/cena.mp4"></video>');
  escrever(c, 'deck/slides/s02-hf/index.html', '<p>composição</p>');
  escrever(c, 'deck/notas.md', 'anotação');
  for (const lixo of ['deck/.DS_Store', 'deck/assets/._foto.txt', 'deck/slides/desktop.ini', 'deck/Thumbs.db']) escrever(c, lixo, 'lixo do sistema');
  conferirTudo(c);
  darChave(ctx);
  const r = await ctx.publicar();
  assert.deepEqual([r.codigo, r.json.codigo], [0, 'PUBLICADO'], r.saida);
  const [publicado] = ctx.servico.estado.publicados;
  assert.equal(publicado.slug, NOME);
  const zip = lerZip(publicado.zip);
  assert.deepEqual(zip.map((e) => e.nome).sort(), ['assets/cena.mp4', 'assets/foto.txt', 'index.html', 'slides/s01-capa.html', 'slides/s02-cena.html']);
  assert.ok(zip.every((e) => e.crcOk));
  const mp4 = zip.find((e) => e.nome === 'assets/cena.mp4');
  assert.equal(mp4.metodo, 0, 'vídeo vai guardado como está');
  assert.ok(mp4.dados.equals(video));
  assert.deepEqual(r.json.dados.fora_do_pacote.sort(), ['deck/_lab/rascunho.html', 'deck/notas.md', 'deck/slides/s02-hf/index.html', 'deck/teleprompter.html']);
  assert.deepEqual([r.json.dados.telas, r.json.dados.videos], [2, 1]);
  for (const rel of ['teleprompter.html', '_lab/x.html', '_rascunho.html', 'slides/s02-hf/i.html', 'notas.md', 'arte.psd']) assert.equal(foraDoPacote(rel), true, rel);
  for (const rel of ['index.html', 'slides/teleprompter.html', '_headers', 'assets/_logo.png', 'slides/_fundo.html', 'assets/cena.mp4', 'assets/x-hf']) assert.equal(foraDoPacote(rel), false, rel);
  // o endereço publicado fica guardado na apresentação
  const noAr = JSON.parse(fs.readFileSync(path.join(c.pasta, 'no-ar.json'), 'utf8'));
  assert.deepEqual([noAr.nome, noAr.endereco, noAr.versao], [NOME, `${ctx.servico.base}/no-ar/${NOME}/`, 1]);
});

test('arquivo privado em deck/ (senha, chave, cópia, oculto) reprova antes de montar e nada sobe', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  for (const rel of ['deck/.env', 'deck/assets/chave.pem', 'deck/slides/s01-capa.html.bak', 'deck/assets/backup/foto.txt']) {
    escrever(ctx.c, rel, 'segredo');
    conferirTudo(ctx.c);
    const r = await ctx.publicar();
    assert.deepEqual([r.codigo, r.json.codigo], [2, 'PACOTE_ARQUIVO_PRIVADO'], rel);
    const esperado = rel.endsWith('backup/foto.txt') ? 'deck/assets/backup/' : rel;
    assert.ok(r.json.dados.arquivos.includes(esperado), `${rel}: ${JSON.stringify(r.json.dados.arquivos)}`);
    fs.rmSync(path.join(ctx.c.pasta, ...esperado.split('/').filter(Boolean)), { recursive: true });
  }
  if (!process.platform.startsWith('win')) {
    fs.symlinkSync(os.tmpdir(), path.join(ctx.c.deck, 'assets', 'atalho'));
    assert.deepEqual(conferenciasQueFaltam(ctx.c).length, 3, 'link para pasta não derruba a conferência');
    conferirTudo(ctx.c);
    const r = await ctx.publicar();
    assert.deepEqual([r.json.codigo, r.json.dados.arquivos], ['PACOTE_ARQUIVO_PRIVADO', ['deck/assets/atalho']]);
  }
  nadaChegouAoServico(ctx);
});

test('nome no ar: --no-ar publica com outro endereço, fica guardado e vale para a próxima e para --voltar', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const outro = await ctx.publicar('--no-ar', 'aula-da-ana');
  assert.deepEqual([outro.codigo, outro.json.codigo, outro.json.dados.nome], [0, 'PUBLICADO', 'aula-da-ana'], outro.saida);
  assert.equal(outro.json.dados.endereco, `${ctx.servico.base}/no-ar/aula-da-ana/`);
  const deNovo = await ctx.publicar();
  assert.deepEqual([deNovo.json.dados.nome, deNovo.json.dados.versao], ['aula-da-ana', 2]);
  assert.deepEqual(ctx.servico.estado.publicados.map((p) => p.slug), ['aula-da-ana', 'aula-da-ana']);
  const volta = await ctx.publicar('--voltar');
  assert.deepEqual([volta.json.codigo, volta.json.dados.nome], ['PUBLICAR_VERSAO_VOLTOU', 'aula-da-ana']);
  const ruim = await ctx.publicar('--no-ar', 'Aula Da Ana');
  assert.deepEqual([ruim.codigo, ruim.json.codigo, ruim.json.dados.sugestao], [1, 'NOME_INVALIDO', 'aula-da-ana']);
  const vazio = await ctx.publicar('--no-ar');
  assert.equal(vazio.json.codigo, 'ARGUMENTO_FALTANDO');
  ctx.servico.estado.erroAoAbrir = { status: 403, codigo: 'SITE_DE_OUTRA_PESSOA' };
  const dono = await ctx.publicar('--no-ar', 'nome-de-alguem');
  assert.equal(dono.json.codigo, 'PUBLICAR_SITE_DE_OUTRA_PESSOA');
  assert.ok(MENSAGENS.PUBLICAR_SITE_DE_OUTRA_PESSOA.acao.includes('--no-ar'), 'a ação manda perguntar outro nome e usar --no-ar');
  assert.equal(JSON.parse(fs.readFileSync(path.join(ctx.c.pasta, 'no-ar.json'), 'utf8')).nome, 'aula-da-ana', 'o recusado não fica guardado');
});

test('endereço com outra coisa da pessoa no ar: pergunta antes; --por-cima troca; depois não pergunta mais', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const e = ctx.servico.estado;
  e.publicados.push({ slug: NOME, versao: 1, zip: Buffer.from('o site dela') }); // um site dela com o mesmo nome
  const r = await ctx.publicar();
  assert.deepEqual([r.codigo, r.json.codigo, r.json.dados.nome], [2, 'PUBLICAR_ENDERECO_JA_EM_USO', NOME], r.saida);
  assert.equal(e.aberturas, 0, 'não mandou nada');
  assert.equal(fs.existsSync(path.join(ctx.c.pasta, 'no-ar.json')), false);
  const volta = await ctx.publicar('--voltar');
  assert.deepEqual([volta.codigo, volta.json.codigo], [2, 'PUBLICAR_ENDERECO_JA_EM_USO'], 'voltar ali mexeria no site dela');
  assert.deepEqual(e.voltas, []);
  const troca = await ctx.publicar('--por-cima');
  assert.deepEqual([troca.codigo, troca.json.codigo, troca.json.dados.versao], [0, 'PUBLICADO', 2], troca.saida);
  const depois = await ctx.publicar();
  assert.deepEqual([depois.json.codigo, depois.json.dados.versao], ['PUBLICADO', 3], 'o endereço já é desta apresentação');
});

test('queda no meio: o endereço fica anotado antes do envio; recusa do painel antes de publicar desfaz a anotação', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const arquivo = path.join(ctx.c.pasta, 'no-ar.json');
  ctx.servico.estado.erroAoAbrir = { status: 409, codigo: 'LIMITE_DE_SITES' };
  assert.equal((await ctx.publicar()).json.codigo, 'PUBLICAR_LIMITE_DE_SITES');
  assert.equal(fs.existsSync(arquivo), false, 'recusa antes de publicar não deixa o endereço anotado');
  ctx.servico.estado.erroAoAbrir = null;
  ctx.servico.estado.concluirCai = 'sem_publicar';
  assert.equal((await ctx.publicar()).json.codigo, 'PUBLICAR_CONCLUSAO_INCERTA');
  assert.equal(JSON.parse(fs.readFileSync(arquivo, 'utf8')).nome, NOME, 'pode estar no ar: o endereço fica anotado');
  ctx.servico.publicarPendentes();
  const r = await ctx.publicar();
  assert.deepEqual([r.json.codigo, r.json.dados.versao], ['PUBLICADO', 1], 'não pergunta de novo nem manda outra vez');
});

test('tipo que o painel não aceita (vídeo .mov) reprova antes de enviar; o pacote para outra hospedagem leva', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  escrever(ctx.c, 'deck/assets/cena.mov', 'mov');
  escrever(ctx.c, 'deck/slides/s02-cena.html', '<video src="../assets/cena.mov"></video>');
  conferirTudo(ctx.c);
  const r = await ctx.publicar();
  assert.deepEqual([r.codigo, r.json.codigo, r.json.dados.arquivos], [2, 'PUBLICAR_TIPO_NAO_ACEITO', ['deck/assets/cena.mov']]);
  nadaChegouAoServico(ctx);
  const p = await rodar(['pacote', NOME], ctx.env);
  assert.deepEqual([p.codigo, p.json.codigo], [0, 'PACOTE_PRONTO'], p.saida);
  for (const bom of ['a.mp4', 'b.WEBM', 'c/d.woff2', 'e.svg', 'f.json', 'g.pdf']) assert.equal(tipoAceito(bom), true, bom);
  for (const ruim of ['a.mov', 'b.m4v', 'CNAME', '_headers', 'c.psd', 'd']) assert.equal(tipoAceito(ruim), false, ruim);
});

test('teto do painel: pacote ou conteúdo acima de 200 MB reprova antes de enviar', () => {
  const MB = 1024 * 1024;
  const pacote = (zipBytes, conteudoBytes) => ({ zip: { length: zipBytes }, conteudoBytes, nomes: ['index.html'] });
  assert.equal(TETO_MB, 200);
  assert.doesNotThrow(() => conferirParaOPainel(pacote(TETO_MB * MB, TETO_MB * MB)));
  for (const [z, c] of [[TETO_MB * MB + 1, 1], [1, TETO_MB * MB + 1]]) {
    assert.throws(() => conferirParaOPainel(pacote(z, c)), (e) => e instanceof KitErro && e.codigo === 'PUBLICAR_SITE_GRANDE_DEMAIS' && e.dados.mb_max === 200 && e.dados.mb === 201);
  }
});

test('pacote: zip e SHA-256 ao lado, sem o que não sobe, e o mesmo conteúdo que o publicar manda', async (t) => {
  const ctx = await preparar(t);
  const p = await rodar(['pacote', NOME], ctx.env);
  assert.deepEqual([p.codigo, p.json.codigo], [0, 'PACOTE_PRONTO'], p.saida);
  assert.equal(p.json.resumo, MENSAGENS.PACOTE_PRONTO.texto);
  const zip = path.join(ctx.c.pasta, `${NOME}-apresentacao.zip`);
  const bytes = fs.readFileSync(zip);
  const sha = crypto.createHash('sha256').update(bytes).digest('hex');
  assert.equal(fs.readFileSync(`${zip}.sha256`, 'utf8'), `${sha}  ${NOME}-apresentacao.zip\n`);
  assert.deepEqual(lerZip(bytes).map((e) => e.nome).sort(), ['assets/foto.txt', 'index.html', 'slides/s01-capa.html']);
  assert.deepEqual(p.json.dados.fora_do_pacote.sort(), ['deck/_lab/rascunho.html', 'deck/teleprompter.html']);
  assert.equal(p.json.dados.telas, 1);
  assert.deepEqual(lerZip(montarPacote(ctx.c.deck).zip).map((e) => e.nome).sort(), lerZip(bytes).map((e) => e.nome).sort());
});

const COM_NAVEGADOR = { skip: acharNavegador() ? false : 'sem Chrome, Edge ou Chromium nesta máquina', timeout: 240000 };

test('no Chrome: checar e acessibilidade aprovados anotam a conferência; fatos que reprova apaga a sua; teleprompter não derruba nada', COM_NAVEGADOR, async (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-conferencias-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const env = { ESTUDIO_APRESENTACOES: base, ESTUDIO_MARCA: path.join(base, 'sem-marca'), ESTUDIO_FERRAMENTAS: path.join(base, 'ferr'), ESTUDIO_PUBLICAR_URL: 'http://127.0.0.1:9/' };
  assert.equal((await rodar(['nova', 'conferida'], env)).codigo, 0);
  const c = caminhosDe('conferida', base);
  const lerAnotadas = () => JSON.parse(fs.readFileSync(path.join(c.revisao, 'conferencias.json'), 'utf8'));
  anotarConferencia(c, 'fatos', impressaoDaApresentacao(c), true); // como se uma rodada antiga tivesse aprovado
  for (const comando of ['checar', 'acessibilidade']) {
    const r = await rodar([comando, 'conferida'], env);
    assert.equal(r.codigo, 0, `${comando}: ${r.saida.slice(-600)}`);
    assert.equal(lerAnotadas()[comando].impressao, impressaoDaApresentacao(c), comando);
  }
  const fatos = await rodar(['fatos', 'conferida'], env);
  assert.equal(fatos.codigo, 2, 'o molde reprova no fatos (fonte do exemplo)');
  assert.equal(lerAnotadas().fatos, undefined, 'a reprovação apaga a aprovação antiga');
  assert.equal((await rodar(['teleprompter', 'conferida'], env)).codigo, 0);
  assert.ok(fs.existsSync(c.teleprompter));
  assert.deepEqual(conferenciasQueFaltam(c), ['fatos'], 'gerar o teleprompter não pede conferência de novo');
  const r = await rodar(['publicar', 'conferida'], env);
  assert.deepEqual([r.codigo, r.json.codigo, r.json.dados.faltam], [2, 'PUBLICAR_CONFERIR_ANTES', ['fatos']]);
});

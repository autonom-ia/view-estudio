// Achados da revisão do bloco D (PR #6), cada um com o caso que o reproduzia:
// 1. envio sem resposta no concluir e apresentação mudada depois: a próxima publicação manda a nova,
//    nunca responde PUBLICADO com o que já estava no ar;
// 2. o que o painel recusa por nome (barra invertida, controle, direção de texto, oculto), repetidos
//    por maiúscula, mais de 10.000 arquivos e falta de index, conferido antes de enviar;
// 3. endereço só reservado (envio que não publicou, sem versão) não pede --por-cima;
// 4. no-ar.json só vale como prova de dono se a versão anotada é a que está no ar; --voltar anota;
// 5. "_" só exclui no topo de deck/; página que cita arquivo que fica fora reprova antes de montar;
// 6. .nojekyll é oculto como qualquer outro; só .well-known/ na raiz passa;
// 7. PARTE_EM_ANDAMENTO se reenvia; os pedidos de espera do painel têm frase própria.
// Serviço falso só em 127.0.0.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { NOME, MENSAGENS, rodar, preparar, darChave, conferirTudo } from './publicar-apoio.mjs';
import { lerZip } from '../scripts/lib/zip.mjs';
import { conferirParaOPainel, nomeAceito, nomesRepetidos, MAX_ARQUIVOS } from '../scripts/lib/regras-do-painel.mjs';
import { KitErro } from '../scripts/lib/saida.mjs';

const escrever = (c, rel, texto) => {
  const abs = path.join(c.pasta, ...rel.split('/'));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, texto);
};
const lerNoAr = (ctx) => JSON.parse(fs.readFileSync(path.join(ctx.c.pasta, 'no-ar.json'), 'utf8'));
const nomesDoZip = (zip) => lerZip(zip).map((e) => e.nome).sort();

test('1. concluir sem resposta, apresentação mudada depois: a versão nova sobe (nunca PUBLICADO com a antiga)', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const e = ctx.servico.estado;
  e.concluirCai = 'sem_publicar';
  assert.equal((await ctx.publicar()).json.codigo, 'PUBLICAR_CONCLUSAO_INCERTA');
  ctx.servico.publicarPendentes(); // a versão A entrou no ar depois
  escrever(ctx.c, 'deck/slides/s01-capa.html', '<h1>Capa nova</h1><img src="../assets/foto.txt">');
  conferirTudo(ctx.c);
  const r = await ctx.publicar();
  assert.deepEqual([r.codigo, r.json.codigo, r.json.dados.versao], [0, 'PUBLICADO', 2], r.saida);
  assert.equal(e.aberturas, 2, 'mandou a apresentação nova');
  const capa = lerZip(e.publicados[1].zip).find((x) => x.nome === 'slides/s01-capa.html');
  assert.ok(capa.dados.toString('utf8').includes('Capa nova'), 'o que está no ar é a versão nova');
});

test('1b. concluir sem resposta e a versão nova no ar é de outro pacote (outro tamanho): manda de novo', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const e = ctx.servico.estado;
  e.concluirCai = 'sem_publicar';
  assert.equal((await ctx.publicar()).json.codigo, 'PUBLICAR_CONCLUSAO_INCERTA');
  e.pendentes.length = 0; // o nosso não entrou; entrou outra coisa no lugar
  e.publicados.push({ slug: NOME, versao: 1, zip: Buffer.from('outra coisa') });
  e.noAr.set(NOME, 1);
  const r = await ctx.publicar();
  assert.deepEqual([r.json.codigo, r.json.dados.versao, e.aberturas], ['PUBLICADO', 2, 2], r.saida);
});

test('2. regras de nome do painel: barra invertida, controle, direção de texto, oculto, repetidos, quantidade e index', () => {
  for (const bom of ['index.html', 'assets/foto.png', '.well-known/x.txt', 'assets/_logo.png', 'slides/ação.html']) assert.equal(nomeAceito(bom), true, bom);
  const ruins = ['a\\b.png', 'a:b.png', 'a\u0007.png', 'fo‮to.png', 'assets/.escondido.png', 'assets/.well-known/x.txt',
    `${'a'.repeat(256)}.png`, '../fora.png', 'a//b.png'];
  for (const ruim of ruins) assert.equal(nomeAceito(ruim), false, JSON.stringify(ruim));
  assert.deepEqual(nomesRepetidos(['index.html', 'assets/Foto.png', 'assets/foto.png']), [['assets/Foto.png', 'assets/foto.png']]);
  assert.deepEqual(nomesRepetidos(['á.png', 'á.png']), [['á.png', 'á.png']], 'mesma letra em formas diferentes');
  assert.deepEqual(nomesRepetidos(['assets', 'assets/x.png']), [['assets/', 'assets']]);
  assert.deepEqual(nomesRepetidos(['index.html', 'assets/a.png', 'assets/b.png']), []);
  const pacote = (nomes) => ({ nomes, zip: { length: 10 }, conteudoBytes: 10 });
  const codigo = (nomes) => {
    try {
      conferirParaOPainel(pacote(nomes));
      return 'ok';
    } catch (erro) {
      assert.ok(erro instanceof KitErro && erro.sair === 2, String(erro));
      return erro.codigo;
    }
  };
  assert.equal(codigo(['index.html', 'assets/a.png']), 'ok');
  assert.equal(codigo(['slides/s01.html']), 'DECK_SEM_INDEX');
  assert.equal(codigo(['index.html', 'a:b.png']), 'PUBLICAR_NOME_DE_ARQUIVO_RECUSADO');
  assert.equal(codigo(['index.html', 'assets/A.png', 'assets/a.png']), 'PUBLICAR_NOMES_REPETIDOS');
  assert.equal(codigo(['index.html', ...Array.from({ length: MAX_ARQUIVOS }, (_, k) => `assets/${k}.png`)]), 'PUBLICAR_ARQUIVOS_DEMAIS');
  assert.equal(codigo(['index.html', ...Array.from({ length: MAX_ARQUIVOS - 1 }, (_, k) => `assets/${k}.png`)]), 'ok');
  for (const novo of ['PUBLICAR_NOME_DE_ARQUIVO_RECUSADO', 'PUBLICAR_NOMES_REPETIDOS', 'PUBLICAR_ARQUIVOS_DEMAIS', 'PUBLICAR_ESPERE_UM_POUCO', 'PACOTE_CITA_ARQUIVO_FORA']) {
    assert.ok(MENSAGENS[novo] && MENSAGENS[novo].texto && MENSAGENS[novo].acao, novo);
  }
});

test('3. endereço só reservado por um envio que não publicou (sem versão) não pede --por-cima', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  ctx.servico.estado.sitesVazios.push(NOME);
  const r = await ctx.publicar();
  assert.deepEqual([r.codigo, r.json.codigo], [0, 'PUBLICADO'], r.saida);
});

test('4. no-ar.json só prova dono com a versão que está no ar; outra versão (outro computador, cópia) pede --por-cima; --voltar anota', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const e = ctx.servico.estado;
  assert.equal((await ctx.publicar()).json.dados.versao, 1);
  assert.equal(lerNoAr(ctx).versao, 1);
  assert.equal((await ctx.publicar()).json.dados.versao, 2);
  // voltar para a 1 anota a 1: a próxima publicação não pergunta nada
  const volta = await ctx.publicar('--voltar', '1');
  assert.deepEqual([volta.json.codigo, lerNoAr(ctx).versao, lerNoAr(ctx).nome], ['PUBLICAR_VERSAO_VOLTOU', 1, NOME]);
  assert.equal((await ctx.publicar()).json.dados.versao, 3);
  // alguém publica a versão 4 por outro caminho (outro computador, cópia da pasta)
  e.publicados.push({ slug: NOME, versao: 4, zip: Buffer.from('de outro lugar') });
  e.noAr.set(NOME, 4);
  const r = await ctx.publicar();
  assert.deepEqual([r.codigo, r.json.codigo, r.json.dados.versao_no_ar, r.json.dados.versao_desta], [2, 'PUBLICAR_ENDERECO_JA_EM_USO', 4, 3], r.saida);
  const v = await ctx.publicar('--voltar');
  assert.equal(v.json.codigo, 'PUBLICAR_ENDERECO_JA_EM_USO', 'voltar também não mexe no que não é desta apresentação');
  assert.equal(e.aberturas, 3, 'nada foi mandado');
  const troca = await ctx.publicar('--por-cima');
  assert.deepEqual([troca.json.codigo, troca.json.dados.versao, lerNoAr(ctx).versao], ['PUBLICADO', 5, 5]);
});

test('5. "_" só fica fora no topo de deck/; tela que cita arquivo que fica fora reprova antes de montar', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  escrever(ctx.c, 'deck/assets/_logo.png', 'png');
  escrever(ctx.c, 'deck/slides/s01-capa.html', '<h1>Capa</h1><img src="../assets/foto.txt"><img src="../assets/_logo.png">');
  conferirTudo(ctx.c);
  const ok = await ctx.publicar();
  assert.deepEqual([ok.codigo, ok.json.codigo], [0, 'PUBLICADO'], ok.saida);
  assert.ok(nomesDoZip(ctx.servico.estado.publicados[0].zip).includes('assets/_logo.png'));
  for (const [arquivo, cita] of [['deck/_lab/foto.png', '../_lab/foto.png'], ['deck/slides/s02-hf/cena.mp4', 's02-hf/cena.mp4'], ['deck/notas.md', '../notas.md']]) {
    escrever(ctx.c, arquivo, 'fora');
    escrever(ctx.c, 'deck/slides/s01-capa.html', `<h1>Capa</h1><img src="../assets/foto.txt"><img src="${cita}">`);
    conferirTudo(ctx.c);
    const r = await ctx.publicar();
    assert.deepEqual([r.codigo, r.json.codigo], [2, 'PACOTE_CITA_ARQUIVO_FORA'], `${arquivo}: ${r.saida}`);
    assert.deepEqual(r.json.dados.arquivos, [{ arquivo, citado_em: 'deck/slides/s01-capa.html' }]);
    const p = await rodar(['pacote', NOME], ctx.env);
    assert.equal(p.json.codigo, 'PACOTE_CITA_ARQUIVO_FORA', 'o pacote para outra hospedagem também');
    fs.rmSync(path.join(ctx.c.pasta, ...arquivo.split('/')));
  }
  assert.equal(ctx.servico.estado.aberturas, 1);
});

test('6. .nojekyll é oculto como qualquer outro; só .well-known/ direto em deck/ passa', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  escrever(ctx.c, 'deck/.nojekyll', '');
  conferirTudo(ctx.c);
  const r = await ctx.publicar();
  assert.deepEqual([r.json.codigo, r.json.dados.arquivos], ['PACOTE_ARQUIVO_PRIVADO', ['deck/.nojekyll']]);
  fs.rmSync(path.join(ctx.c.deck, '.nojekyll'));
  escrever(ctx.c, 'deck/assets/.well-known/x.txt', 'x');
  conferirTudo(ctx.c);
  const fundo = await ctx.publicar();
  assert.deepEqual([fundo.json.codigo, fundo.json.dados.arquivos], ['PACOTE_ARQUIVO_PRIVADO', ['deck/assets/.well-known/']]);
  fs.rmSync(path.join(ctx.c.deck, 'assets', '.well-known'), { recursive: true });
  escrever(ctx.c, 'deck/.well-known/security.txt', 'Contact: mailto:x@exemplo.com');
  conferirTudo(ctx.c);
  const raiz = await ctx.publicar();
  assert.equal(raiz.json.codigo, 'PUBLICADO', raiz.saida);
  assert.ok(nomesDoZip(ctx.servico.estado.publicados[0].zip).includes('.well-known/security.txt'));
  assert.ok(!MENSAGENS.PACOTE_ARQUIVO_PRIVADO.acao.includes('arquivo .nojekyll'), 'a frase não promete o .nojekyll');
});

test('7. PARTE_EM_ANDAMENTO se reenvia; pedidos de espera do painel viram PUBLICAR_ESPERE_UM_POUCO', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const e = ctx.servico.estado;
  e.parteEmAndamento.add(0);
  const r = await ctx.publicar();
  assert.deepEqual([r.codigo, r.json.codigo], [0, 'PUBLICADO'], r.saida);
  assert.equal(e.tentativasDaParte.get(0), 2);
  for (const [status, codigoServico] of [[429, 'ADICIONAR_ESPERE'], [429, 'CONFERIR_ESPERE'], [409, 'PARTE_EM_ANDAMENTO']]) {
    e.erroAoAbrir = { status, codigo: codigoServico };
    const espera = await ctx.publicar();
    assert.deepEqual([espera.codigo, espera.json.codigo], [1, 'PUBLICAR_ESPERE_UM_POUCO'], codigoServico);
    assert.equal(espera.json.resumo, MENSAGENS.PUBLICAR_ESPERE_UM_POUCO.texto);
  }
});

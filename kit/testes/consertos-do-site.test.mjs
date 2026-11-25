// Consertos que a revisão do Site Estúdio achou em código que o View tem igual (autonom-ia/site-estudio#16,
// autonom-ia/view-estudio#8), cada um com o caso que o reproduzia aqui:
// 1. envio pendente: o registro guarda as versões de antes e o tamanho do pacote; só a única versão nova
//    com esse tamanho conta como desta pasta (publicação de outro lugar depois pede --por-cima); a chave
//    da pasta é o caminho com a caixa que está no disco;
// 2. troca de pasta: a limpeza que falha depois da troca feita devolve a sobra (SOBRA_DA_TROCA) em vez
//    de reprovar; a tentativa guarda o item no lugar, nunca a sobra velha;
// 3. "antes" monta a comparação nova ao lado e troca inteira (ANTES_NAO_TROCADO se não der), e nunca
//    apaga tentativa/ com uma volta parada no meio;
// 4. arquivo sem uso compara o nome inteiro ("foto.png" não é citado por "minhafoto.png");
// 5. o painel aceita 3D (glb, gltf, bin, wasm), e a conferência antes de enviar também; o .gltf cita
//    pelo nome decodificado; a recusa de 3D do painel tem mensagem própria (view_autonomia#126).
// Achados da revisão do PR #9: envio aberto não desfaz o registro (o concluir pode ter publicado);
// no-ar.json com o nome que a pasta usa; sobra presa não trava a troca seguinte; rollback que falha
// não esconde a causa; a comparação fora do lugar volta ao abrir; guardar a tentativa e fechar o
// antes que falham viram código e aviso; montagem pela metade sai.
// Serviço falso só em 127.0.0.1.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { NOME, MENSAGENS, RAIZ, rodar, preparar, darChave, conferirTudo } from './publicar-apoio.mjs';
import { trocarPasta } from '../scripts/lib/antes-depois.mjs';
import { citaNome, arquivosNaoCitados, montarPacote } from '../scripts/lib/pacote.mjs';
import { conferirParaOPainel, tipoAceito } from '../scripts/lib/regras-do-painel.mjs';

const DESPACHANTE = path.join(RAIZ, 'kit', 'scripts', 'estudio.mjs');
const ehRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const SEM_CHMOD = process.platform === 'win32' || ehRoot ? 'no Windows (e como root) a permissão não trava a remoção' : false;

function escrever(arquivo, texto) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, texto);
}
const ler = (arquivo) => fs.readFileSync(arquivo, 'utf8');
const capaDe = (ctx) => path.join(ctx.c.deck, 'slides', 's01-capa.html');
const lerDonos = (ctx) => JSON.parse(ler(path.join(ctx.ferr, 'publicar', 'donos.json')));

// --- 1. envio pendente ---

test('1a. envio pendente guarda as versões de antes e o tamanho do pacote', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const e = ctx.servico.estado;
  assert.equal((await ctx.publicar()).json.dados.versao, 1);
  e.concluirCai = 'sem_publicar';
  escrever(capaDe(ctx), '<h1>Segunda</h1><img src="../assets/foto.txt">');
  conferirTudo(ctx.c);
  assert.equal((await ctx.publicar()).json.codigo, 'PUBLICAR_CONCLUSAO_INCERTA');
  const registro = lerDonos(ctx)[fs.realpathSync.native(ctx.c.pasta)][NOME];
  assert.deepEqual([registro.pendente, registro.versao, registro.versoes_antes], [true, 1, [1]]);
  assert.equal(registro.envio_bytes, e.pendentes[0].zip.length, 'o tamanho é o do pacote enviado');
});

test('1b. envio que caiu no meio: a única versão nova é desta pasta; com outra publicação depois, pede --por-cima', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const e = ctx.servico.estado;
  assert.equal((await ctx.publicar()).json.dados.versao, 1);
  e.concluirCai = 'sem_publicar';
  escrever(capaDe(ctx), '<h1>Segunda</h1><img src="../assets/foto.txt">');
  conferirTudo(ctx.c);
  assert.equal((await ctx.publicar()).json.codigo, 'PUBLICAR_CONCLUSAO_INCERTA');
  ctx.servico.publicarPendentes(); // a deste envio entrou no ar (versão 2)
  e.publicados.push({ slug: NOME, versao: 3, zip: Buffer.from('de outro computador') });
  e.noAr.set(NOME, 3);
  const r = await ctx.publicar();
  assert.deepEqual([r.json.codigo, r.json.dados.versao_no_ar], ['PUBLICAR_ENDERECO_JA_EM_USO', 3], r.saida);
  assert.equal((await ctx.publicar('--por-cima')).json.codigo, 'PUBLICADO');
});

test('1c. envio que caiu no meio e só ele entrou no ar: a próxima publicação segue sem pedir nada', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const e = ctx.servico.estado;
  assert.equal((await ctx.publicar()).json.dados.versao, 1);
  e.concluirCai = 'sem_publicar';
  escrever(capaDe(ctx), '<h1>Segunda</h1><img src="../assets/foto.txt">');
  conferirTudo(ctx.c);
  assert.equal((await ctx.publicar()).json.codigo, 'PUBLICAR_CONCLUSAO_INCERTA');
  ctx.servico.publicarPendentes();
  escrever(capaDe(ctx), '<h1>Terceira</h1><img src="../assets/foto.txt">');
  conferirTudo(ctx.c);
  const r = await ctx.publicar();
  assert.deepEqual([r.json.codigo, r.json.dados.versao], ['PUBLICADO', 3], r.saida);
});

test('1d. a mesma pasta escrita com outra caixa é a mesma dona (disco que não diferencia maiúscula)', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const outraCaixa = path.join(path.dirname(ctx.env.ESTUDIO_APRESENTACOES), 'APRESENTACOES');
  if (!fs.existsSync(outraCaixa)) {
    t.skip('este disco diferencia maiúscula: "APRESENTACOES" é outra pasta');
    return;
  }
  assert.equal((await ctx.publicar()).json.dados.versao, 1);
  const r = await rodar(['publicar', NOME], { ...ctx.env, ESTUDIO_APRESENTACOES: outraCaixa });
  assert.deepEqual([r.json.codigo, r.json.dados.versao], ['PUBLICADO', 2], r.saida);
});

test('1e. concluir publica e responde com erro fora da lista: o pendente fica, e a próxima publicação segue', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const e = ctx.servico.estado;
  assert.equal((await ctx.publicar()).json.dados.versao, 1);
  e.erroAoConcluir = { status: 500, codigo: 'FALHA_QUE_NINGUEM_LISTOU' };
  escrever(capaDe(ctx), '<h1>Segunda</h1><img src="../assets/foto.txt">');
  conferirTudo(ctx.c);
  const falhou = await ctx.publicar();
  assert.equal(falhou.json.ok, false, falhou.saida);
  assert.equal(e.noAr.get(NOME), 2, 'o painel publicou mesmo assim');
  assert.equal(lerDonos(ctx)[fs.realpathSync.native(ctx.c.pasta)][NOME].pendente, true, 'o registro não foi desfeito');
  e.erroAoConcluir = null;
  escrever(capaDe(ctx), '<h1>Terceira</h1><img src="../assets/foto.txt">');
  conferirTudo(ctx.c);
  const r = await ctx.publicar();
  assert.deepEqual([r.json.codigo, r.json.dados.versao], ['PUBLICADO', 3], r.saida);
});

test('1f. concluir publica e a resposta vem estranha (sem endereço que sirva): a próxima publicação segue', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const e = ctx.servico.estado;
  assert.equal((await ctx.publicar()).json.dados.versao, 1);
  e.enderecoDoSite = 'javascript:alert(1)';
  escrever(capaDe(ctx), '<h1>Segunda</h1><img src="../assets/foto.txt">');
  conferirTudo(ctx.c);
  assert.equal((await ctx.publicar()).json.codigo, 'PUBLICAR_RESPOSTA_ESTRANHA');
  assert.equal(e.noAr.get(NOME), 2);
  e.enderecoDoSite = null;
  escrever(capaDe(ctx), '<h1>Terceira</h1><img src="../assets/foto.txt">');
  conferirTudo(ctx.c);
  const r = await ctx.publicar();
  assert.deepEqual([r.json.codigo, r.json.dados.versao], ['PUBLICADO', 3], r.saida);
});

test('1g. recusa do painel ao abrir o envio desfaz o registro: nada foi enviado', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  ctx.servico.estado.erroAoAbrir = { status: 409, codigo: 'LIMITE_DE_SITES' };
  assert.equal((await ctx.publicar()).json.codigo, 'PUBLICAR_LIMITE_DE_SITES');
  const donos = path.join(ctx.ferr, 'publicar', 'donos.json');
  assert.equal(fs.existsSync(donos) ? (lerDonos(ctx)[fs.realpathSync.native(ctx.c.pasta)] ?? null) : null, null);
});

test('1h. o painel devolve outro nome no concluir: no-ar.json guarda o nome que esta pasta usa, e a próxima vai ao mesmo endereço', async (t) => {
  const ctx = await preparar(t);
  darChave(ctx);
  const e = ctx.servico.estado;
  e.slugNaResposta = 'outro-nome';
  assert.equal((await ctx.publicar()).json.codigo, 'PUBLICADO');
  assert.equal(JSON.parse(ler(path.join(ctx.c.pasta, 'no-ar.json'))).nome, NOME);
  e.slugNaResposta = null;
  const r = await ctx.publicar();
  assert.deepEqual([r.json.codigo, r.json.dados.versao, e.publicados.map((p) => p.slug)], ['PUBLICADO', 2, [NOME, NOME]], r.saida);
});

// --- 2 e 3. antes e depois ---

function estudio(env, ...args) {
  const r = spawnSync(process.execPath, [DESPACHANTE, ...args], { encoding: 'utf8', env: { ...process.env, ESTUDIO_NAO_ABRIR: '1', ...env } });
  return { codigo: r.status, json: JSON.parse(r.stdout.trim().split('\n').pop()), erro: r.stderr };
}

// Uma apresentação feita pelo "nova", com a tela 2 marcada para saber qual versão está no lugar.
function bolo(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-consertos-'));
  t.after(() => {
    destravar(base);
    fs.rmSync(base, { recursive: true, force: true });
  });
  const env = {
    ESTUDIO_APRESENTACOES: path.join(base, 'apresentacoes'),
    ESTUDIO_MARCA: path.join(base, 'sem-marca'),
    ESTUDIO_FERRAMENTAS: path.join(base, 'ferr'),
  };
  assert.equal(estudio(env, 'nova', 'bolo').codigo, 0);
  const pasta = path.join(env.ESTUDIO_APRESENTACOES, 'bolo');
  const slide = path.join(pasta, 'deck', 'slides', 's02-numero.html');
  const original = ler(slide);
  const marcar = (marca) => fs.writeFileSync(slide, `${original}<!-- ${marca} -->`);
  marcar('original');
  return { env, pasta, slide, marcar, ad: path.join(pasta, 'revisao', 'antes-depois') };
}

// Pasta que o sistema não deixa apagar (no Mac e no Linux, sem permissão de escrita): faz a parte de
// dentro de uma troca concluída sobrar, como um arquivo aberto no Windows.
function travar(pasta) {
  const trava = path.join(pasta, 'trava');
  escrever(path.join(trava, 'aberto.txt'), 'em uso');
  fs.chmodSync(trava, 0o500);
}
function destravar(pasta) {
  if (!fs.existsSync(pasta)) return;
  for (const nome of fs.readdirSync(pasta)) {
    const caminho = path.join(pasta, nome);
    if (!fs.lstatSync(caminho).isDirectory()) continue;
    if (nome === 'trava') fs.chmodSync(caminho, 0o700);
    destravar(caminho);
  }
}

test('2a. troca: falha na entrada do novo devolve o atual inteiro e não deixa sobra; arquivo também troca', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-troca-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const origem = path.join(base, 'antes');
  const destino = path.join(base, 'deck');
  escrever(path.join(origem, 'a.txt'), 'antes');
  escrever(path.join(destino, 'a.txt'), 'visto');
  const travado = (de, para) => {
    if (de.endsWith('.trocando')) throw Object.assign(new Error('arquivo aberto em outro programa'), { code: 'EPERM' });
    fs.renameSync(de, para);
  };
  assert.throws(() => trocarPasta(origem, destino, travado), { code: 'EPERM' });
  assert.equal(ler(path.join(destino, 'a.txt')), 'visto');
  assert.deepEqual(fs.readdirSync(base).sort(), ['antes', 'deck']);
  assert.deepEqual(trocarPasta(origem, destino), { sobras: [] });
  assert.equal(ler(path.join(destino, 'a.txt')), 'antes');
  // brief.md é arquivo, não pasta; com "mover", a origem entra pelo nome
  escrever(path.join(base, 'brief.md'), '# visto');
  escrever(path.join(base, 'brief.md.novo'), '# antes');
  assert.deepEqual(trocarPasta(path.join(base, 'brief.md.novo'), path.join(base, 'brief.md'), fs.renameSync, { mover: true }), { sobras: [] });
  assert.equal(ler(path.join(base, 'brief.md')), '# antes');
  assert.deepEqual(fs.readdirSync(base).sort(), ['antes', 'brief.md', 'deck']);
});

test('2b. troca feita com a cópia velha presa: vale e devolve a sobra; com ela ainda presa, a troca seguinte a põe de lado e segue', { skip: SEM_CHMOD }, (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-troca-sobra-'));
  t.after(() => {
    destravar(base);
    fs.rmSync(base, { recursive: true, force: true });
  });
  const origem = path.join(base, 'antes');
  const destino = path.join(base, 'deck');
  escrever(path.join(origem, 'a.txt'), 'antes');
  escrever(path.join(destino, 'a.txt'), 'visto');
  travar(destino);
  assert.deepEqual(trocarPasta(origem, destino), { sobras: [`${destino}.descartando`] });
  assert.equal(ler(path.join(destino, 'a.txt')), 'antes', 'a troca valeu');
  // a trava continua: a próxima troca não falha, põe a sobra de lado com outro nome e segue
  escrever(path.join(origem, 'a.txt'), 'de novo');
  const segunda = trocarPasta(origem, destino);
  assert.equal(segunda.sobras.length, 1, JSON.stringify(segunda));
  assert.ok(path.basename(segunda.sobras[0]).startsWith('deck.descartando.presa-'), segunda.sobras[0]);
  assert.equal(ler(path.join(destino, 'a.txt')), 'de novo');
  // ainda presa: continua sobra, sem falhar
  assert.deepEqual(trocarPasta(origem, destino), { sobras: segunda.sobras });
  destravar(base);
  assert.deepEqual(trocarPasta(origem, destino), { sobras: [] });
  assert.deepEqual(fs.readdirSync(base).sort(), ['antes', 'deck'], 'solta a trava, a troca seguinte apaga tudo');
});

test('2d. entrada do novo e volta do atual falhando: sobe o primeiro erro, e a troca seguinte põe o atual de volta e termina', (t) => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-troca-volta-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const origem = path.join(base, 'antes');
  const destino = path.join(base, 'deck');
  escrever(path.join(origem, 'a.txt'), 'antes');
  escrever(path.join(destino, 'a.txt'), 'visto');
  const tudoTravado = (de, para) => {
    if (de.endsWith('.trocando')) throw Object.assign(new Error('arquivo aberto'), { code: 'EPERM' });
    if (de.endsWith('.descartando') && para === destino) throw Object.assign(new Error('volta presa'), { code: 'EBUSY' });
    fs.renameSync(de, para);
  };
  assert.throws(() => trocarPasta(origem, destino, tudoTravado), { code: 'EPERM' }, 'a causa, não o erro da volta');
  assert.equal(ler(path.join(`${destino}.descartando`, 'a.txt')), 'visto', 'o atual está inteiro ao lado');
  assert.deepEqual(trocarPasta(origem, destino), { sobras: [] });
  assert.equal(ler(path.join(destino, 'a.txt')), 'antes');
  assert.deepEqual(fs.readdirSync(base).sort(), ['antes', 'deck']);
});

test('2c. escolher com a cópia velha presa: volta com aviso, e a tentativa seguinte guarda a versão no lugar, nunca a sobra', { skip: SEM_CHMOD }, (t) => {
  const { env, pasta, slide, marcar, ad } = bolo(t);
  assert.equal(estudio(env, 'antes', 'bolo').json.codigo, 'ANTES_GUARDADO');
  marcar('primeira vista');
  travar(path.join(pasta, 'deck'));
  const r = estudio(env, 'escolher', 'bolo', 'antes');
  assert.deepEqual([r.codigo, r.json.codigo], [0, 'VOLTOU_COMO_ESTAVA'], JSON.stringify(r.json) + r.erro);
  assert.deepEqual(r.json.avisos.map((a) => a.codigo), ['SOBRA_DA_TROCA']);
  assert.ok(r.json.avisos[0].dados.sobra.endsWith('deck.descartando'));
  assert.ok(ler(slide).endsWith('<!-- original -->'), 'a troca valeu');
  // A pessoa fechou o programa (a trava sai), mas a sobra continua ao lado: é a primeira versão vista.
  destravar(pasta);
  assert.ok(fs.existsSync(path.join(pasta, 'deck.descartando')));
  assert.equal(estudio(env, 'antes', 'bolo').json.codigo, 'ANTES_GUARDADO');
  marcar('segunda vista');
  assert.equal(estudio(env, 'escolher', 'bolo', 'outro').json.codigo, 'PRONTO_PARA_OUTRO_CAMINHO');
  assert.ok(ler(path.join(ad, 'tentativa', 'deck', 'slides', 's02-numero.html')).endsWith('<!-- segunda vista -->'));
  assert.equal(fs.existsSync(path.join(pasta, 'deck.descartando')), false);
});

test('3a. "antes --de-novo" com volta parada no meio reprova e não apaga a versão vista', (t) => {
  const { env, pasta, marcar, ad } = bolo(t);
  assert.equal(estudio(env, 'antes', 'bolo').json.codigo, 'ANTES_GUARDADO');
  marcar('vista');
  // o que um "escolher antes" que parou no meio deixa: versão vista guardada e a volta pendente
  const vista = path.join(ad, 'tentativa', 'deck', 'slides', 's02-numero.html');
  fs.cpSync(path.join(pasta, 'deck'), path.join(ad, 'tentativa', 'deck'), { recursive: true });
  marcar('original');
  fs.writeFileSync(path.join(ad, 'estado.json'), JSON.stringify({ aberto: true, restauracao_pendente: true, tentativa_itens: ['deck'] }));
  const r = estudio(env, 'antes', 'bolo', '--de-novo');
  assert.deepEqual([r.codigo, r.json.codigo, r.json.dados.restauracao_pendente], [2, 'ANTES_EM_ABERTO', true], JSON.stringify(r.json));
  assert.ok(ler(vista).endsWith('<!-- vista -->'));
  assert.ok(MENSAGENS.ANTES_EM_ABERTO.acao.includes('restauracao_pendente'));
});

test('3b. "antes" troca a comparação inteira de uma vez e não deixa nada ao lado', (t) => {
  const { env, pasta, marcar, ad } = bolo(t);
  assert.equal(estudio(env, 'antes', 'bolo').json.codigo, 'ANTES_GUARDADO');
  marcar('mudou');
  fs.writeFileSync(path.join(ad, 'mudancas.json'), JSON.stringify({ pedido: 'mais vida', mudancas: [{ titulo: 'Letra maior' }] }));
  const r = estudio(env, 'antes', 'bolo', '--de-novo');
  assert.equal(r.json.codigo, 'ANTES_GUARDADO', JSON.stringify(r.json) + r.erro);
  assert.equal(r.json.dados.apagados.pedido, 'mais vida');
  assert.ok(ler(path.join(ad, 'antes', 'deck', 'slides', 's02-numero.html')).endsWith('<!-- mudou -->'));
  assert.deepEqual(JSON.parse(ler(path.join(ad, 'estado.json'))), { aberto: true });
  assert.deepEqual(JSON.parse(ler(path.join(ad, 'mudancas.json'))), { pedido: '', mudancas: [] });
  assert.ok(fs.existsSync(path.join(ad, 'manifesto.json')));
  const soltos = fs.readdirSync(path.join(pasta, 'revisao')).filter((n) => n.startsWith('antes-depois.'));
  assert.deepEqual(soltos, []);
});

test('3c. comparação que ficou fora numa troca parada no meio volta ao lugar ao abrir a apresentação, em qualquer comando', (t) => {
  const { env, ad, marcar } = bolo(t);
  assert.equal(estudio(env, 'antes', 'bolo').json.codigo, 'ANTES_GUARDADO');
  marcar('vista');
  fs.renameSync(ad, `${ad}.descartando`);
  const outro = estudio(env, 'escolher', 'bolo', 'outro');
  assert.equal(outro.json.codigo, 'PRONTO_PARA_OUTRO_CAMINHO', 'o escolher acha a comparação, nunca ANTES_NAO_GUARDADO');
  assert.deepEqual(outro.json.avisos.map((a) => [a.codigo, a.dados.itens]), [['APRESENTACAO_POSTA_DE_VOLTA', ['revisao/antes-depois']]]);
  assert.equal(fs.existsSync(`${ad}.descartando`), false);
  assert.ok(MENSAGENS.APRESENTACAO_POSTA_DE_VOLTA.acao.includes('revisao/antes-depois'));
  fs.renameSync(ad, `${ad}.descartando`);
  const r = estudio(env, 'antes', 'bolo');
  assert.equal(r.json.codigo, 'ANTES_EM_ABERTO', 'a comparação de antes voltou e continua em aberto');
  const denovo = estudio(env, 'antes', 'bolo', '--de-novo');
  assert.equal(denovo.json.codigo, 'ANTES_GUARDADO');
  assert.ok(denovo.json.dados.apagados.antes > 0, 'diz o que da comparação anterior saiu');
});

test('3d. "antes" que não consegue trocar reprova com código, a apresentação não muda e a comparação anterior fica fechada', { skip: SEM_CHMOD }, (t) => {
  const { env, pasta, slide, marcar } = bolo(t);
  const revisao = path.join(pasta, 'revisao');
  t.after(() => fs.existsSync(revisao) && fs.chmodSync(revisao, 0o700));
  assert.equal(estudio(env, 'antes', 'bolo').json.codigo, 'ANTES_GUARDADO');
  marcar('mudou');
  fs.chmodSync(revisao, 0o500);
  const r = estudio(env, 'antes', 'bolo', '--de-novo');
  fs.chmodSync(revisao, 0o700);
  assert.deepEqual([r.codigo, r.json.codigo], [2, 'ANTES_NAO_TROCADO'], JSON.stringify(r.json) + r.erro);
  assert.equal(r.json.dados.erro, 'EACCES');
  assert.ok(ler(slide).endsWith('<!-- mudou -->'), 'a apresentação não mudou');
  assert.equal(estudio(env, 'escolher', 'bolo', 'antes').json.codigo, 'ANTES_JA_RESOLVIDO', 'a comparação anterior não é usada');
  assert.equal(estudio(env, 'antes', 'bolo').json.codigo, 'ANTES_GUARDADO', 'rodar de novo termina');
});

test('2e. escolher que não consegue guardar a versão vista: RESTAURACAO_FALHOU com item "tentativa", nada volta, e a segunda vez termina', { skip: SEM_CHMOD }, (t) => {
  const { env, slide, marcar, ad } = bolo(t);
  t.after(() => fs.existsSync(ad) && fs.chmodSync(ad, 0o700));
  assert.equal(estudio(env, 'antes', 'bolo').json.codigo, 'ANTES_GUARDADO');
  marcar('vista');
  fs.chmodSync(ad, 0o500);
  const r = estudio(env, 'escolher', 'bolo', 'antes');
  fs.chmodSync(ad, 0o700);
  assert.deepEqual([r.codigo, r.json.codigo, r.json.dados.item, r.json.dados.erro], [1, 'RESTAURACAO_FALHOU', 'tentativa', 'EACCES'], JSON.stringify(r.json) + r.erro);
  assert.ok(ler(slide).endsWith('<!-- vista -->'), 'nada voltou');
  assert.equal(JSON.parse(ler(path.join(ad, 'estado.json'))).restauracao_pendente, undefined, 'a volta nem começou');
  const volta = estudio(env, 'escolher', 'bolo', 'antes');
  assert.equal(volta.json.codigo, 'VOLTOU_COMO_ESTAVA', JSON.stringify(volta.json));
  assert.ok(ler(path.join(ad, 'tentativa', 'deck', 'slides', 's02-numero.html')).endsWith('<!-- vista -->'));
  assert.ok(MENSAGENS.RESTAURACAO_FALHOU.acao.includes('"tentativa"'));
});

test('2f. escolher com a cópia do antes presa ao fechar: a escolha vale e fica gravada, e o que não saiu vira aviso', { skip: SEM_CHMOD }, (t) => {
  const { env, pasta, slide, marcar, ad } = bolo(t);
  assert.equal(estudio(env, 'antes', 'bolo').json.codigo, 'ANTES_GUARDADO');
  marcar('vista');
  travar(path.join(ad, 'antes', 'deck'));
  const r = estudio(env, 'escolher', 'bolo', 'antes');
  assert.deepEqual([r.codigo, r.json.codigo], [0, 'VOLTOU_COMO_ESTAVA'], JSON.stringify(r.json) + r.erro);
  assert.deepEqual(r.json.avisos.map((a) => a.codigo), ['SOBRA_DA_TROCA']);
  assert.ok(r.json.avisos[0].dados.sobra.endsWith('antes-depois/antes'), r.json.avisos[0].dados.sobra);
  assert.ok(ler(slide).endsWith('<!-- original -->'));
  assert.deepEqual(JSON.parse(ler(path.join(ad, 'estado.json'))), { aberto: false, escolha: 'antes' });
  assert.equal(estudio(env, 'escolher', 'bolo', 'antes').json.codigo, 'ANTES_JA_RESOLVIDO');
  destravar(pasta);
  assert.equal(estudio(env, 'antes', 'bolo').json.codigo, 'ANTES_GUARDADO', 'o próximo antes leva a sobra junto');
  assert.deepEqual(fs.readdirSync(path.join(pasta, 'revisao')).filter((n) => n.startsWith('antes-depois.')), []);
});

test('3e. "antes" que falha no meio da montagem não deixa a cópia pela metade ocupando o disco', { skip: SEM_CHMOD }, (t) => {
  const { env, pasta } = bolo(t);
  const trancada = path.join(pasta, 'deck', 'trancada');
  escrever(path.join(trancada, 'x.txt'), 'x');
  fs.chmodSync(trancada, 0o000);
  t.after(() => fs.existsSync(trancada) && fs.chmodSync(trancada, 0o700));
  const r = estudio(env, 'antes', 'bolo');
  fs.chmodSync(trancada, 0o700);
  assert.deepEqual([r.codigo, r.json.codigo], [2, 'ANTES_NAO_TROCADO'], JSON.stringify(r.json) + r.erro);
  assert.deepEqual(fs.readdirSync(path.join(pasta, 'revisao')).filter((n) => n.startsWith('antes-depois')), []);
  assert.ok(MENSAGENS.ANTES_NAO_TROCADO.acao.includes('não o repita à pessoa'));
});

// --- 4. arquivo sem uso ---

test('4. aviso de arquivo sem uso compara o nome inteiro', (t) => {
  assert.equal(citaNome('<img src="assets/minhafoto.png">', 'foto.png'), false);
  assert.equal(citaNome('<img src="assets/data.png">', 'a.png'), false);
  assert.equal(citaNome('<img src="assets/a.png">', 'a.png'), true);
  assert.equal(citaNome("url('a.png?v=2')", 'a.png'), true);
  assert.equal(citaNome('<img src="a.png.bak">', 'a.png'), false);
  assert.equal(citaNome('a.png', 'a.png'), true, 'no começo e no fim do texto');
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-citados-'));
  t.after(() => fs.rmSync(pasta, { recursive: true, force: true }));
  escrever(path.join(pasta, 'index.html'), '<img src="assets/minhafoto.png">');
  escrever(path.join(pasta, 'assets', 'minhafoto.png'), 'x');
  escrever(path.join(pasta, 'assets', 'foto.png'), 'x');
  assert.deepEqual(arquivosNaoCitados(pasta, ['index.html', 'assets/foto.png', 'assets/minhafoto.png']), ['assets/foto.png']);
});

// --- 5. 3D ---

test('5. modelo 3D e decodificador (glb, gltf, bin, wasm) passam na conferência do painel', (t) => {
  for (const nome of ['modelo.glb', 'cena.GLTF', 'cena.bin', 'draco/decoder.wasm']) assert.equal(tipoAceito(nome), true, nome);
  const deck = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-3d-'));
  t.after(() => fs.rmSync(deck, { recursive: true, force: true }));
  escrever(path.join(deck, 'index.html'), '<title>3D</title><iframe src="slides/s01-modelo.html"></iframe>');
  escrever(path.join(deck, 'slides', 's01-modelo.html'), '<script src="../assets/3d/ver.js"></script>');
  escrever(path.join(deck, 'assets', '3d', 'ver.js'), "carregar('modelo.glb', 'cena.gltf', 'decoder.wasm');");
  for (const nome of ['modelo.glb', 'decoder.wasm']) escrever(path.join(deck, 'assets', '3d', nome), 'x');
  // o .bin só é citado pelo .gltf: conta como usado
  escrever(path.join(deck, 'assets', '3d', 'cena.gltf'), '{"buffers":[{"uri":"cena.bin"}]}');
  escrever(path.join(deck, 'assets', '3d', 'cena.bin'), 'x');
  const pacote = montarPacote(deck);
  assert.doesNotThrow(() => conferirParaOPainel(pacote));
  assert.deepEqual(pacote.naoCitados, []);
  assert.ok(MENSAGENS.PUBLICAR_TIPO_NAO_ACEITO.acao.includes('glb'));
  // o .gltf cita como endereço: "peca%20a.bin" é o arquivo "peca a.bin"
  escrever(path.join(deck, 'assets', '3d', 'cena.gltf'), '{"asset":{"version":"2.0"},"buffers":[{"uri":"peca%20a.bin"}]}');
  fs.renameSync(path.join(deck, 'assets', '3d', 'cena.bin'), path.join(deck, 'assets', '3d', 'peca a.bin'));
  assert.deepEqual(montarPacote(deck).naoCitados, []);
  // endereço malformado no .gltf ("%E0%A4%A") não derruba o pacote: vale o texto como está
  escrever(path.join(deck, 'assets', '3d', 'cena.gltf'), '{"buffers":[{"uri":"peca a.bin"}],"x":"%E0%A4%A"}');
  assert.deepEqual(montarPacote(deck).naoCitados, []);
});

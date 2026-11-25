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
// 5. o painel aceita 3D (glb, gltf, bin, wasm), e a conferência antes de enviar também.
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
  assert.deepEqual(trocarPasta(origem, destino), { sobra: null });
  assert.equal(ler(path.join(destino, 'a.txt')), 'antes');
  // brief.md é arquivo, não pasta; com "mover", a origem entra pelo nome
  escrever(path.join(base, 'brief.md'), '# visto');
  escrever(path.join(base, 'brief.md.novo'), '# antes');
  assert.deepEqual(trocarPasta(path.join(base, 'brief.md.novo'), path.join(base, 'brief.md'), fs.renameSync, { mover: true }), { sobra: null });
  assert.equal(ler(path.join(base, 'brief.md')), '# antes');
  assert.deepEqual(fs.readdirSync(base).sort(), ['antes', 'brief.md', 'deck']);
});

test('2b. troca feita com a cópia velha presa: vale e devolve a sobra, em vez de falhar', { skip: SEM_CHMOD }, (t) => {
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
  assert.deepEqual(trocarPasta(origem, destino), { sobra: `${destino}.descartando` });
  assert.equal(ler(path.join(destino, 'a.txt')), 'antes', 'a troca valeu');
  destravar(base);
  assert.deepEqual(trocarPasta(origem, destino), { sobra: null });
  assert.equal(fs.existsSync(`${destino}.descartando`), false, 'a troca seguinte apaga a sobra');
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

test('3c. comparação que ficou fora numa troca parada no meio volta ao lugar no "antes" seguinte', (t) => {
  const { env, ad } = bolo(t);
  assert.equal(estudio(env, 'antes', 'bolo').json.codigo, 'ANTES_GUARDADO');
  fs.renameSync(ad, `${ad}.descartando`);
  const r = estudio(env, 'antes', 'bolo');
  assert.equal(r.json.codigo, 'ANTES_EM_ABERTO', 'a comparação de antes voltou e continua em aberto');
  assert.equal(fs.existsSync(`${ad}.descartando`), false);
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
});

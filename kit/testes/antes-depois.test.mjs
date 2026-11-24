// Antes e depois: o "antes" guarda o que a mudança pode tocar sem duplicar vídeo (link fixo, com a
// impressão digital conferida), o "comparar" mostra só as telas e os cliques que mudaram, e o
// "escolher" fica com o depois, volta ao antes ou volta ao ponto de partida para outro caminho.
// A parte do navegador pula se não houver Chrome.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acharNavegador } from '../scripts/lib/chrome.mjs';
import {
  guardarAntes, pesadosAlterados, restaurarAntes, igualAoAntes, lerMudancas, ehPesado, PESADO_BYTES,
  caminhosDoAntesDepois, fecharAntes, impressao, mesmoArquivo, mesmoConteudo, pastasIguais, semLinkFixo, guardarTentativa,
  ErroDeRestauracao,
} from '../scripts/lib/antes-depois.mjs';
import { renderizarSemPerderOAnterior } from '../scripts/lib/hyperframes.mjs';
import { telasMudadas, paginaDeComparacao, nomeDaFoto, fotosDiferentes, NOTA_SEM_MOVIMENTO } from '../scripts/lib/comparacao.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESPACHANTE = path.join(RAIZ, 'kit', 'scripts', 'estudio.mjs');
const opcoes = { skip: acharNavegador() ? false : 'sem Chrome, Edge ou Chromium nesta máquina', timeout: 300000 };

let base;
before(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-antes-depois-'));
});
after(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

function escrever(arquivo, conteudo) {
  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(arquivo, conteudo);
}

// Gravável por alguém? (no Windows, só para leitura aparece como 0o444)
const gravavel = (arquivo) => (fs.statSync(arquivo).mode & 0o222) !== 0;
// Como root, só para leitura não impede gravar: a checagem de "gravar dá erro" pula.
const ehRoot = typeof process.getuid === 'function' && process.getuid() === 0;

function apresentacaoDeBrinquedo(nome) {
  const pasta = path.join(base, nome);
  escrever(path.join(pasta, 'deck', 'index.html'), '<section data-src="slides/s01-capa.html"></section>');
  escrever(path.join(pasta, 'deck', 'slides', 's01-capa.html'), '<h1>Capa</h1>');
  escrever(path.join(pasta, 'deck', 'assets', 'cena.mp4'), 'video-original');
  escrever(path.join(pasta, 'roteiro', 'S01.json'), '{"tela":1,"beats":[{"fala":"Oi."}]}');
  escrever(path.join(pasta, 'brief.md'), '# Brief');
  return pasta;
}

test('antes-depois: vídeo e arquivo de 2 MB ou mais são pesados; o resto não', () => {
  assert.equal(ehPesado('cena.MP4', 10), true);
  assert.equal(ehPesado('foto.jpg', PESADO_BYTES), true);
  assert.equal(ehPesado('foto.jpg', PESADO_BYTES - 1), false);
});

test('antes-depois: guarda deck, roteiro e brief; vídeo vira link fixo (sem duplicar), o resto é cópia', () => {
  const pasta = apresentacaoDeBrinquedo('guardar');
  const antes = path.join(pasta, 'revisao', 'antes-depois', 'antes');
  const m = guardarAntes(pasta, antes);
  assert.deepEqual(m.itens, ['deck', 'roteiro', 'brief.md'], 'cenas/ não existia, não entra');
  assert.equal(m.pesados.length, 1);
  assert.equal(m.pesados[0].rel, 'deck/assets/cena.mp4');
  assert.equal(m.pesados[0].modo, 'link');
  const video = fs.statSync(path.join(pasta, 'deck', 'assets', 'cena.mp4'));
  const guardado = fs.statSync(path.join(antes, 'deck', 'assets', 'cena.mp4'));
  assert.equal(guardado.ino, video.ino, 'o vídeo do antes é o mesmo arquivo no disco');
  assert.equal(gravavel(path.join(pasta, 'deck', 'assets', 'cena.mp4')), true, 'o vídeo da apresentação não fica travado');
  assert.notEqual(fs.statSync(path.join(antes, 'deck', 'slides', 's01-capa.html')).ino, fs.statSync(path.join(pasta, 'deck', 'slides', 's01-capa.html')).ino);
  assert.deepEqual(m.atalhos, []);
  assert.equal(igualAoAntes(pasta, antes, m), true);
});

// Criar link simbólico de arquivo no Windows pede modo de desenvolvedor (EPERM sem ele): o teste
// que precisa de um link de verdade pula lá. O caminho do EPERM é testado aqui embaixo, injetado.
const semLinkSimbolico = process.platform === 'win32' ? 'link simbólico de arquivo no Windows pede modo de desenvolvedor' : false;

test('antes-depois: link simbólico é recriado com o mesmo alvo, não seguido', { skip: semLinkSimbolico }, () => {
  const pasta = apresentacaoDeBrinquedo('atalho');
  fs.symlinkSync(path.join(pasta, 'brief.md'), path.join(pasta, 'deck', 'atalho.md'));
  const antes = path.join(pasta, 'revisao', 'antes-depois', 'antes');
  const m = guardarAntes(pasta, antes);
  assert.equal(fs.lstatSync(path.join(antes, 'deck', 'atalho.md')).isSymbolicLink(), true);
  assert.equal(fs.readlinkSync(path.join(antes, 'deck', 'atalho.md')), path.join(pasta, 'brief.md'));
  assert.equal(igualAoAntes(pasta, antes, m), true);
});

test('antes-depois: sem licença para criar link (EPERM), o arquivo apontado vira cópia e entra no aviso', { skip: semLinkSimbolico }, () => {
  const pasta = apresentacaoDeBrinquedo('atalho-sem-licenca');
  fs.symlinkSync(path.join(pasta, 'brief.md'), path.join(pasta, 'deck', 'atalho.md'));
  const antes = path.join(pasta, 'revisao', 'antes-depois', 'antes');
  const criarLink = () => {
    throw Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
  };
  const m = guardarAntes(pasta, antes, { criarLink });
  assert.deepEqual(m.atalhos, ['deck/atalho.md']);
  const guardado = path.join(antes, 'deck', 'atalho.md');
  assert.equal(fs.lstatSync(guardado).isFile(), true);
  assert.equal(fs.readFileSync(guardado, 'utf8'), '# Brief');
  // outro erro não vira cópia: sobe
  const outro = () => {
    throw Object.assign(new Error('sem espaço'), { code: 'ENOSPC' });
  };
  assert.throws(() => guardarAntes(pasta, antes, { criarLink: outro }), (e) => e.code === 'ENOSPC');
  // atalho quebrado (o alvo não existe): fica de fora e entra em "quebrados", sem erro
  fs.symlinkSync(path.join(pasta, 'sumiu.md'), path.join(pasta, 'deck', 'quebrado.md'));
  const q = guardarAntes(pasta, antes, { criarLink });
  assert.deepEqual(q.quebrados, ['deck/quebrado.md']);
  assert.deepEqual(q.atalhos, ['deck/atalho.md']);
  assert.equal(fs.existsSync(path.join(antes, 'deck', 'quebrado.md')), false);
});

test('antes-depois: vídeo trocado pelo nome mantém o antes; gravado por cima do mesmo arquivo é pego', () => {
  const pasta = apresentacaoDeBrinquedo('video');
  const antes = path.join(pasta, 'revisao', 'antes-depois', 'antes');
  const m = guardarAntes(pasta, antes);
  const video = path.join(pasta, 'deck', 'assets', 'cena.mp4');
  // como o "cena" faz: grava ao lado e troca pelo nome
  fs.writeFileSync(`${video}.novo`, 'video-novo');
  fs.renameSync(`${video}.novo`, video);
  assert.deepEqual(pesadosAlterados(antes, m), []);
  assert.equal(fs.readFileSync(path.join(antes, 'deck', 'assets', 'cena.mp4'), 'utf8'), 'video-original');
  assert.equal(igualAoAntes(pasta, antes, m), false);
  // gravar por cima do mesmo arquivo muda o antes junto: comparar e escolher precisam recusar
  const m2 = guardarAntes(pasta, antes);
  fs.writeFileSync(video, 'video-por-cima');
  assert.deepEqual(pesadosAlterados(antes, m2), ['deck/assets/cena.mp4']);
});

test('antes-depois: restaurar volta cada item e tira o que a tentativa criou', () => {
  const pasta = apresentacaoDeBrinquedo('restaurar');
  const antes = path.join(pasta, 'revisao', 'antes-depois', 'antes');
  const m = guardarAntes(pasta, antes);
  escrever(path.join(pasta, 'deck', 'slides', 's01-capa.html'), '<h1>Capa nova</h1>');
  escrever(path.join(pasta, 'deck', 'slides', 's02-novo.html'), '<h1>Nova</h1>');
  escrever(path.join(pasta, 'cenas', 'abertura', 'index.html'), 'cena criada na tentativa');
  escrever(path.join(pasta, 'brief.md'), '# Brief mudado');
  assert.equal(igualAoAntes(pasta, antes, m), false);
  const feitos = restaurarAntes(pasta, antes, m);
  assert.deepEqual(feitos, ['deck', 'roteiro', '-cenas', 'brief.md']);
  assert.equal(fs.readFileSync(path.join(pasta, 'deck', 'slides', 's01-capa.html'), 'utf8'), '<h1>Capa</h1>');
  assert.equal(fs.existsSync(path.join(pasta, 'deck', 'slides', 's02-novo.html')), false);
  assert.equal(fs.existsSync(path.join(pasta, 'cenas')), false);
  assert.equal(fs.readFileSync(path.join(pasta, 'brief.md'), 'utf8'), '# Brief');
  assert.equal(fs.statSync(path.join(pasta, 'deck', 'assets', 'cena.mp4')).ino, fs.statSync(path.join(antes, 'deck', 'assets', 'cena.mp4')).ino, 'o vídeo volta sem cópia');
  assert.equal(igualAoAntes(pasta, antes, m), true);
});

test('antes-depois: troca que falha no meio não deixa a apresentação sem o item nem sobra ao lado', () => {
  const pasta = apresentacaoDeBrinquedo('troca-falha');
  const antes = path.join(pasta, 'revisao', 'antes-depois', 'antes');
  const m = guardarAntes(pasta, antes);
  escrever(path.join(pasta, 'deck', 'slides', 's01-capa.html'), '<h1>Capa nova</h1>');
  escrever(path.join(pasta, 'roteiro', 'S01.json'), '{"tela":1,"beats":[{"fala":"Fala nova."}]}');
  const roteiro = path.join(pasta, 'roteiro');
  // a entrada do roteiro de antes no lugar falha (no Windows: arquivo aberto em outro programa)
  const renomear = (de, para) => {
    if (para === roteiro && de === `${roteiro}.trocando`) throw Object.assign(new Error('arquivo em uso'), { code: 'EBUSY' });
    fs.renameSync(de, para);
  };
  assert.throws(() => restaurarAntes(pasta, antes, m, { renomear }), (e) => e instanceof ErroDeRestauracao && e.codigo === 'RESTAURACAO_FALHOU' && e.item === 'roteiro');
  assert.equal(fs.readFileSync(path.join(pasta, 'deck', 'slides', 's01-capa.html'), 'utf8'), '<h1>Capa</h1>', 'o deck já tinha voltado');
  assert.equal(fs.readFileSync(path.join(roteiro, 'S01.json'), 'utf8'), '{"tela":1,"beats":[{"fala":"Fala nova."}]}', 'o roteiro volta ao que estava, inteiro');
  assert.deepEqual(fs.readdirSync(pasta).filter((n) => n.endsWith('.trocando') || n.endsWith('.descartando')), []);
  // de novo, sem falha: termina
  assert.deepEqual(restaurarAntes(pasta, antes, m), ['deck', 'roteiro', 'brief.md']);
  assert.equal(igualAoAntes(pasta, antes, m), true);
});

test('antes-depois: a tentativa é guardada inteira, com o vídeo ligado, e uma nova toma o lugar dela', () => {
  const pasta = apresentacaoDeBrinquedo('tentativa');
  const ad = caminhosDoAntesDepois({ revisao: path.join(pasta, 'revisao') });
  const m = guardarAntes(pasta, ad.antes);
  escrever(path.join(pasta, 'deck', 'slides', 's01-capa.html'), '<h1>Tentativa 1</h1>');
  escrever(path.join(pasta, 'cenas', 'abertura', 'index.html'), 'cena da tentativa');
  const video = path.join(pasta, 'deck', 'assets', 'cena.mp4');
  fs.writeFileSync(`${video}.novo`, 'video-da-tentativa');
  fs.renameSync(`${video}.novo`, video);
  assert.deepEqual(guardarTentativa(pasta, ad, m), ['deck', 'roteiro', 'cenas', 'brief.md']);
  assert.equal(fs.readFileSync(path.join(ad.tentativa, 'deck', 'slides', 's01-capa.html'), 'utf8'), '<h1>Tentativa 1</h1>');
  assert.equal(fs.readFileSync(path.join(ad.tentativa, 'cenas', 'abertura', 'index.html'), 'utf8'), 'cena da tentativa');
  assert.equal(fs.statSync(path.join(ad.tentativa, 'deck', 'assets', 'cena.mp4')).ino, fs.statSync(video).ino, 'vídeo da tentativa sem cópia');
  restaurarAntes(pasta, ad.antes, m);
  assert.equal(fs.readFileSync(path.join(ad.tentativa, 'deck', 'assets', 'cena.mp4'), 'utf8'), 'video-da-tentativa', 'voltar não mexe na tentativa');
  escrever(path.join(pasta, 'deck', 'slides', 's01-capa.html'), '<h1>Tentativa 2</h1>');
  guardarTentativa(pasta, ad, m);
  assert.equal(fs.readFileSync(path.join(ad.tentativa, 'deck', 'slides', 's01-capa.html'), 'utf8'), '<h1>Tentativa 2</h1>');
  assert.equal(fs.existsSync(`${ad.tentativa}.guardando`), false);
  // fechar o antes não apaga a tentativa
  escrever(ad.manifesto, JSON.stringify(m));
  fecharAntes(ad, 'antes');
  assert.equal(fs.existsSync(path.join(ad.tentativa, 'deck', 'slides', 's01-capa.html')), true);
});

test('antes-depois: "cena" troca pelo nome e o antes fica com o vídeo antigo inteiro', async () => {
  const pasta = apresentacaoDeBrinquedo('cena-troca');
  const antes = path.join(pasta, 'revisao', 'antes-depois', 'antes');
  const m = guardarAntes(pasta, antes);
  const video = path.join(pasta, 'deck', 'assets', 'cena.mp4');
  const r = await renderizarSemPerderOAnterior(video, async (tmp) => {
    fs.writeFileSync(tmp, 'video-novo');
    return { codigo: 0, saida: '', erro: '' };
  });
  assert.equal(r.ok, true);
  assert.equal(fs.readFileSync(video, 'utf8'), 'video-novo');
  assert.equal(fs.readFileSync(path.join(antes, 'deck', 'assets', 'cena.mp4'), 'utf8'), 'video-original');
  assert.deepEqual(pesadosAlterados(antes, m), []);
});

test('antes-depois: link fixo só cai na cópia quando o disco não faz link; outro erro sobe', () => {
  for (const code of ['EXDEV', 'EPERM', 'ENOTSUP', 'EMLINK']) assert.equal(semLinkFixo({ code }), true, code);
  for (const code of ['ENOSPC', 'ENOENT', 'EACCES', undefined]) assert.equal(semLinkFixo({ code }), false, String(code));
  assert.equal(semLinkFixo(null), false);
});

test('antes-depois: mesmo arquivo só com número de arquivo de verdade e mesmo disco; senão, o conteúdo decide', () => {
  assert.equal(mesmoArquivo({ ino: 7n, dev: 1n }, { ino: 7n, dev: 1n }), true);
  assert.equal(mesmoArquivo({ ino: 0n, dev: 1n }, { ino: 0n, dev: 1n }), false, 'número zero não é número de arquivo');
  assert.equal(mesmoArquivo({ ino: 7n, dev: 1n }, { ino: 7n, dev: 2n }), false, 'outro disco');
  const a = path.join(base, 'iguais-a');
  const b = path.join(base, 'iguais-b');
  escrever(path.join(a, 'x.txt'), 'mesmo texto');
  escrever(path.join(b, 'x.txt'), 'mesmo texto');
  assert.equal(pastasIguais(a, b), true);
  escrever(path.join(b, 'x.txt'), 'outro texto');
  assert.equal(pastasIguais(a, b), false);
});

test('antes-depois: leitura curta (disco de rede) não faz arquivos iguais parecerem diferentes', () => {
  const a = path.join(base, 'curta-a.bin');
  const b = path.join(base, 'curta-b.bin');
  const dados = crypto.randomBytes(5000);
  fs.writeFileSync(a, dados);
  fs.writeFileSync(b, dados);
  // cada leitura devolve no máximo 3 bytes (ou 7, para os dois lados não andarem iguais)
  let vez = 0;
  const curta = (fd, buf, desde, quanto, pos) => {
    vez += 1;
    return fs.readSync(fd, buf, desde, Math.min(quanto, vez % 2 ? 3 : 7), pos);
  };
  assert.equal(mesmoConteudo(a, b, curta), true);
  const outro = Buffer.from(dados);
  outro[4999] ^= 1;
  fs.writeFileSync(b, outro);
  assert.equal(mesmoConteudo(a, b, curta), false);
});

test('antes-depois: impressão digital lida aos pedaços dá o mesmo SHA-256 do arquivo inteiro', () => {
  const arquivo = path.join(base, 'grande.bin');
  const dados = crypto.randomBytes(2 * 1024 * 1024 + 123);
  fs.writeFileSync(arquivo, dados);
  assert.equal(impressao(arquivo), crypto.createHash('sha256').update(dados).digest('hex'));
});

test('antes-depois: só mudança com título conta; telas aceita número e nome de arquivo', () => {
  const r = lerMudancas({
    pedido: ' mais vida ',
    mudancas: [{ titulo: ' Letra maior ', porque: 'lê do fundo', telas: [2, 's03-movimentos.html', 2.5, null, '4', ' 5 ', '6a'] }, { titulo: '' }, { porque: 'x' }],
  });
  assert.equal(r.pedido, 'mais vida');
  assert.equal(r.ignoradas, 2);
  assert.deepEqual(r.mudancas, [{ titulo: 'Letra maior', porque: 'lê do fundo', telas: [2, 's03-movimentos.html', 4, 5, '6a'] }], 'número em texto vira número');
  assert.deepEqual(lerMudancas(null), { pedido: '', mudancas: [], ignoradas: 0 });
});

// PNG de verdade (8 bits, RGB), ponto a ponto: cor(x, y) devolve [r, g, b].
function png(w, h, cor) {
  const pedaco = (tipo, dados) => {
    const t = Buffer.concat([Buffer.from(tipo, 'ascii'), dados]);
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(t) >>> 0);
    return Buffer.concat([tam, t, crc]);
  };
  const cab = Buffer.alloc(13);
  cab.writeUInt32BE(w, 0);
  cab.writeUInt32BE(h, 4);
  cab[8] = 8;
  cab[9] = 2;
  const linhas = [];
  for (let y = 0; y < h; y += 1) {
    const linha = Buffer.alloc(1 + w * 3);
    for (let x = 0; x < w; x += 1) linha.set(cor(x, y), 1 + x * 3);
    linhas.push(linha);
  }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), pedaco('IHDR', cab), pedaco('IDAT', zlib.deflateSync(Buffer.concat(linhas))), pedaco('IEND', Buffer.alloc(0))]);
}
const hex = (h) => [Number.parseInt(h.slice(1, 3), 16), Number.parseInt(h.slice(3, 5), 16), Number.parseInt(h.slice(5, 7), 16)];
const liso = (cor, w = 4, h = 4) => png(w, h, () => hex(cor));

test('comparação: troca de cor de 20 e de 6 no canal muda a foto', () => {
  assert.equal(fotosDiferentes(liso('#FFA000'), liso('#FF8C00')), true, 'âmbar para âmbar mais escuro (20)');
  assert.equal(fotosDiferentes(liso('#F6F4EF'), liso('#F4F1E8')), true, 'creme para creme (7)');
  assert.equal(fotosDiferentes(liso('#F6F4EF'), liso('#F0F4EF')), true, 'diferença de 6');
  assert.equal(fotosDiferentes(liso('#F6F4EF'), liso('#F6F4EF')), false);
});

test('comparação: diferença mínima de desenho não vira mudança', () => {
  const texto = (x, y) => ((x + y) % 7 === 0 ? [40, 40, 40] : [246, 244, 239]);
  const a = png(100, 100, texto);
  // serrilhado que varia 1 ou 2 em toda a borda das letras
  const b = png(100, 100, (x, y) => texto(x, y).map((v) => ((x + y) % 7 === 0 ? v + 2 : v)));
  assert.equal(fotosDiferentes(a, b), false);
  // dois pontos soltos muito diferentes em 10 mil
  const c = png(100, 100, (x, y) => ((x === 3 && y === 3) || (x === 90 && y === 50) ? [0, 0, 0] : texto(x, y)));
  assert.equal(fotosDiferentes(a, c), false);
});

const beat = (texto, cor = 0) => ({ texto, jpeg: Buffer.from('x'), png: Buffer.from([cor]) });
const roteiro = (falas) => ({ telas: falas.map((f, k) => ({ tela: k + 1, beats: f.map((fala) => ({ fala })) })) });

test('comparação: entra só a tela que mudou, no clique que mudou; tela nova e tela que saiu também', () => {
  const antes = [
    { arquivo: 's01-capa.html', numero: 1, titulo: 'Capa', beats: [beat('Oi')] },
    { arquivo: 's02-numero.html', numero: 2, titulo: 'Número', beats: [beat('38%'), beat('antes das 8')] },
    { arquivo: 's03-fala.html', numero: 3, titulo: 'Fala', beats: [beat('Três')] },
    { arquivo: 's04-sai.html', numero: 4, titulo: 'Sai', beats: [beat('Tchau')] },
  ];
  const depois = [
    { arquivo: 's01-capa.html', numero: 1, titulo: 'Capa', beats: [beat('Oi')] },
    { arquivo: 's02-numero.html', numero: 2, titulo: 'Número', beats: [beat('38%'), beat('antes das 9')] },
    { arquivo: 's03-fala.html', numero: 3, titulo: 'Fala', beats: [beat('Três')] },
    { arquivo: 's05-nova.html', numero: 5, titulo: 'Nova', beats: [beat('Olá')] },
  ];
  const telas = telasMudadas(antes, depois, roteiro([['a'], ['b', 'c'], ['d']]), roteiro([['a'], ['b', 'c'], ['d mudada']]));
  assert.deepEqual(telas.map((t) => [t.arquivo, t.situacao, t.cliques.filter((c) => c.mudou).map((c) => c.beat)]), [
    ['s02-numero.html', 'mudou', [1]],
    ['s03-fala.html', 'mudou', [0]],
    ['s05-nova.html', 'nova', [0]],
    ['s04-sai.html', 'saiu', [0]],
  ]);
});

test('comparação: estilo diferente no mesmo clique (cor de um detalhe) conta como mudança', () => {
  const comEstilo = (estilo) => ({ texto: 'Fonte', jpeg: Buffer.from('x'), png: Buffer.from([0]), estilo });
  const antes = [{ arquivo: 's02-numero.html', numero: 2, titulo: 'Número', beats: [comEstilo(['P rgb(93, 89, 117)']), comEstilo(['P rgb(93, 89, 117)'])] }];
  const depois = [{ arquivo: 's02-numero.html', numero: 2, titulo: 'Número', beats: [comEstilo(['P rgb(93, 89, 117)']), comEstilo(['P rgb(113, 89, 117)'])] }];
  const telas = telasMudadas(antes, depois, roteiro([[]]), roteiro([[]]));
  assert.deepEqual(telas.map((t) => t.cliques.filter((c) => c.mudou).map((c) => c.beat)), [[1]]);
});

test('comparação: a página numera as mudanças, marca as telas, não tem <select> e escapa o texto', () => {
  const telas = [{
    arquivo: 's02-numero.html', numero: 2, titulo: 'Número <b>', situacao: 'mudou',
    cliques: [
      { beat: 0, antes: beat('a'), depois: beat('a'), falaAntes: 'x', falaDepois: 'x', mudou: false },
      { beat: 1, antes: beat('a'), depois: beat('b'), falaAntes: 'fala velha', falaDepois: 'fala nova', mudou: true },
    ],
  }];
  const html = paginaDeComparacao({
    pedido: 'mais <vida>',
    mudancas: [{ titulo: 'Letra maior', porque: 'lê do fundo', telas: [2] }, { titulo: 'Cor quente', porque: 'mais calor', telas: ['s09.html'] }],
    telas,
  });
  assert.ok(html.includes('Você pediu: mais &lt;vida&gt;'));
  assert.ok(html.includes('Número &lt;b&gt;'));
  assert.ok(html.includes('aria-label="mudanças 1"'), 'só a mudança 1 diz ter passado pela tela 2');
  assert.ok(html.includes(`fotos/${nomeDaFoto('antes', 's02-numero.html', 1)}`));
  assert.ok(html.includes(`fotos/${nomeDaFoto('depois', 's02-numero.html', 1)}`));
  assert.ok(!html.includes(nomeDaFoto('antes', 's02-numero.html', 0)), 'clique igual não ganha foto');
  assert.ok(html.includes('Igual ao de antes.'));
  assert.ok(html.includes('fala velha') && html.includes('fala nova'));
  assert.ok(!html.includes('<select'));
  assert.ok(html.includes(NOTA_SEM_MOVIMENTO), 'a página diz que vídeo e movimento não entram');
  assert.equal(nomeDaFoto('antes', 's02-numero.html', 1), 'antes-s02-numero-b1.jpg');
  // nome de arquivo com espaço, # ou acento vai codificado no endereço da foto
  const estranha = paginaDeComparacao({ pedido: '', mudancas: [], telas: [{ ...telas[0], arquivo: 's02 número#1.html' }] });
  assert.ok(estranha.includes(`fotos/${encodeURIComponent(nomeDaFoto('antes', 's02 número#1.html', 1))}`));
  assert.ok(!estranha.includes('fotos/antes-s02 número#1'));
});

// --- pelos comandos ---

const ambiente = (nome) => ({
  ...process.env,
  ESTUDIO_APRESENTACOES: path.join(base, nome, 'apresentacoes'),
  ESTUDIO_MARCA: path.join(base, nome, 'sem-marca'),
  ESTUDIO_FERRAMENTAS: path.join(base, nome, '.ferramentas'),
  ESTUDIO_NAO_ABRIR: '1',
});

const semTrava = process.platform === 'win32' || ehRoot ? 'pasta só para leitura não impede gravar no Windows nem como root' : false;

test('escolher: volta que falha vira RESTAURACAO_FALHOU, nada se perde e a segunda vez termina', { skip: semTrava }, () => {
  const env = ambiente('volta-falha');
  assert.equal(estudio(env, 'nova', 'bolo').codigo, 0);
  const pasta = path.join(env.ESTUDIO_APRESENTACOES, 'bolo');
  const slide = path.join(pasta, 'deck', 'slides', 's02-numero.html');
  const tentativa = path.join(pasta, 'revisao', 'antes-depois', 'tentativa');
  assert.equal(estudio(env, 'antes', 'bolo').json.codigo, 'ANTES_GUARDADO');
  trocarNoArquivo(slide, 'A manhã já é nossa.', 'Versão que a pessoa viu.');
  fs.chmodSync(pasta, 0o555);
  let r;
  try {
    r = estudio(env, 'escolher', 'bolo', 'antes');
  } finally {
    fs.chmodSync(pasta, 0o755);
  }
  assert.equal(r.codigo, 1, JSON.stringify(r.json));
  assert.equal(r.json.codigo, 'RESTAURACAO_FALHOU');
  assert.equal(r.json.dados.item, 'deck');
  assert.ok(fs.readFileSync(slide, 'utf8').includes('Versão que a pessoa viu.'), 'a apresentação ficou inteira');
  assert.ok(fs.readFileSync(path.join(tentativa, 'deck', 'slides', 's02-numero.html'), 'utf8').includes('Versão que a pessoa viu.'));
  // a segunda vez não guarda por cima da tentativa o que estiver na apresentação
  trocarNoArquivo(slide, 'Versão que a pessoa viu.', 'Meio do caminho.');
  const volta = estudio(env, 'escolher', 'bolo', 'antes');
  assert.equal(volta.json.codigo, 'VOLTOU_COMO_ESTAVA', JSON.stringify(volta.json));
  assert.ok(fs.readFileSync(slide, 'utf8').includes('A manhã já é nossa.'));
  assert.ok(fs.readFileSync(path.join(tentativa, 'deck', 'slides', 's02-numero.html'), 'utf8').includes('Versão que a pessoa viu.'));
  assert.equal(path.resolve(RAIZ, volta.json.arquivos.tentativa), tentativa);
});

test('antes --de-novo diz o que da comparação anterior foi apagado', () => {
  const env = ambiente('de-novo');
  assert.equal(estudio(env, 'nova', 'bolo').codigo, 0);
  const pasta = path.join(env.ESTUDIO_APRESENTACOES, 'bolo');
  const primeiro = estudio(env, 'antes', 'bolo');
  assert.equal(primeiro.json.dados.apagados, null, 'não havia comparação anterior');
  fs.writeFileSync(path.join(pasta, 'revisao', 'antes-depois', 'mudancas.json'), JSON.stringify({ pedido: 'mais vida', mudancas: [{ titulo: 'Letra maior' }] }));
  const r = estudio(env, 'antes', 'bolo', '--de-novo');
  assert.equal(r.json.codigo, 'ANTES_GUARDADO');
  assert.equal(r.json.dados.apagados.antes, primeiro.json.dados.arquivos);
  assert.equal(r.json.dados.apagados.tentativa, 0);
  assert.equal(r.json.dados.apagados.pedido, 'mais vida');
  assert.deepEqual(r.json.dados.apagados.mudancas, ['Letra maior']);
});

test('mensagens do antes e depois: não manda desfazer de memória e diz de onde recriar o arquivo pesado', () => {
  const m = JSON.parse(fs.readFileSync(path.join(RAIZ, 'kit', 'mensagens.json'), 'utf8'));
  assert.ok(m.ANTES_NAO_GUARDADO.acao.startsWith('Não desfaça de memória'));
  assert.ok(m.ANTES_NAO_GUARDADO.texto.includes('não dá para mostrar o antes e o depois'));
  assert.ok(m.ANTES_VIDEO_MUDOU.texto.startsWith('Um arquivo pesado'));
  assert.ok(m.ANTES_VIDEO_MUDOU.acao.includes('substituído') && m.ANTES_VIDEO_MUDOU.acao.includes('revisao/antes-depois/antes/cenas/'));
  assert.ok(m.NADA_MUDOU.texto.includes('Vídeo e movimento não entram'));
});

test('escolher: com a volta pendente, "depois" devolve a versão vista inteira', { skip: semTrava }, () => {
  const env = ambiente('depois-pendente');
  assert.equal(estudio(env, 'nova', 'bolo').codigo, 0);
  const pasta = path.join(env.ESTUDIO_APRESENTACOES, 'bolo');
  const slide = path.join(pasta, 'deck', 'slides', 's02-numero.html');
  assert.equal(estudio(env, 'antes', 'bolo').json.codigo, 'ANTES_GUARDADO');
  trocarNoArquivo(slide, 'A manhã já é nossa.', 'Versão que a pessoa viu.');
  fs.chmodSync(pasta, 0o555);
  try {
    assert.equal(estudio(env, 'escolher', 'bolo', 'outro').json.codigo, 'RESTAURACAO_FALHOU');
  } finally {
    fs.chmodSync(pasta, 0o755);
  }
  trocarNoArquivo(slide, 'Versão que a pessoa viu.', 'Meio do caminho.');
  const r = estudio(env, 'escolher', 'bolo', 'depois');
  assert.equal(r.json.codigo, 'FICOU_O_DEPOIS', JSON.stringify(r.json));
  assert.ok(fs.readFileSync(slide, 'utf8').includes('Versão que a pessoa viu.'));
});

function estudio(env, ...args) {
  const r = spawnSync(process.execPath, [DESPACHANTE, ...args], { encoding: 'utf8', env, timeout: 280000 });
  const linhas = (r.stdout || '').trim().split('\n');
  let json = null;
  try {
    json = JSON.parse(linhas[linhas.length - 1]);
  } catch {}
  return { codigo: r.status, json, erro: r.stderr };
}

function trocarNoArquivo(arquivo, de, para) {
  const texto = fs.readFileSync(arquivo, 'utf8');
  assert.ok(texto.includes(de), `${arquivo} não tem "${de}"`);
  fs.writeFileSync(arquivo, texto.replace(de, para));
}

test('antes, comparar e escolher: só a tela e o clique que mudaram, vídeo sem cópia, e as três respostas', opcoes, async () => {
  const apresentacoes = path.join(base, 'apresentacoes');
  const ferr = path.join(base, '.ferramentas');
  const env = { ...process.env, ESTUDIO_APRESENTACOES: apresentacoes, ESTUDIO_MARCA: path.join(base, 'sem-marca'), ESTUDIO_FERRAMENTAS: ferr, ESTUDIO_NAO_ABRIR: '1' };
  const estadoServidor = path.join(ferr, 'servidores', 'comparar-cafe.json');
  try {
    assert.equal(estudio(env, 'nova', 'cafe').codigo, 0);
    const pasta = path.join(apresentacoes, 'cafe');
    const video = path.join(pasta, 'deck', 'assets', 'abertura.mp4');
    fs.writeFileSync(video, 'video-da-cena');
    const ad = path.join(pasta, 'revisao', 'antes-depois');
    const mudancas = path.join(ad, 'mudancas.json');

    const a = estudio(env, 'antes', 'cafe');
    assert.equal(a.codigo, 0, JSON.stringify(a.json));
    assert.equal(a.json.codigo, 'ANTES_GUARDADO');
    assert.equal(a.json.dados.pesados_sem_duplicar, 1);
    assert.equal(fs.statSync(path.join(ad, 'antes', 'deck', 'assets', 'abertura.mp4')).ino, fs.statSync(video).ino);

    // o antes em aberto não é trocado por engano
    const denovo = estudio(env, 'antes', 'cafe');
    assert.equal(denovo.codigo, 2);
    assert.equal(denovo.json.codigo, 'ANTES_EM_ABERTO');

    const poucas = estudio(env, 'comparar', 'cafe', '--sem-navegador');
    assert.equal(poucas.codigo, 2);
    assert.equal(poucas.json.codigo, 'POUCAS_MUDANCAS');

    fs.writeFileSync(mudancas, JSON.stringify({
      pedido: 'mais vida',
      mudancas: [
        { titulo: 'A virada ficou mais direta', porque: 'a sala entende no primeiro olhar', telas: [2] },
        { titulo: 'A fala de março diz o ganho', porque: 'quem ouve sabe por que importa', telas: [3] },
      ],
    }));
    const igual = estudio(env, 'comparar', 'cafe', '--sem-navegador');
    assert.equal(igual.codigo, 2);
    assert.equal(igual.json.codigo, 'NADA_MUDOU');

    // muda o texto do 3º clique da tela 2 e a fala do 2º clique da tela 3
    trocarNoArquivo(path.join(pasta, 'deck', 'slides', 's02-numero.html'), 'A manhã já é nossa.', 'A manhã é toda nossa.');
    trocarNoArquivo(path.join(pasta, 'roteiro', 'S03.json'), 'Primeiro, em março,', 'Logo em março,');

    const c = estudio(env, 'comparar', 'cafe', '--sem-navegador');
    assert.equal(c.codigo, 0, JSON.stringify(c.json) + c.erro);
    assert.equal(c.json.codigo, 'COMPARACAO_PRONTA');
    assert.deepEqual(c.json.dados.telas.map((t) => [t.tela, t.situacao, t.cliques_mudados]), [[2, 'mudou', [2]], [3, 'mudou', [1]]]);
    const fotos = fs.readdirSync(path.join(ad, 'fotos')).sort();
    assert.deepEqual(fotos, ['antes-s02-numero-b2.jpg', 'antes-s03-movimentos-b1.jpg', 'depois-s02-numero-b2.jpg', 'depois-s03-movimentos-b1.jpg']);
    const pagina = await (await fetch(c.json.dados.endereco)).text();
    assert.ok(pagina.includes('Você pediu: mais vida'));
    assert.ok(pagina.includes('A virada ficou mais direta') && pagina.includes('a sala entende no primeiro olhar'));
    assert.ok(!pagina.includes('id="s01-capa.html"'), 'tela que não mudou não aparece');
    assert.ok(pagina.includes('Logo em março,'));
    const foto = await fetch(new URL('fotos/depois-s02-numero-b2.jpg', c.json.dados.endereco));
    assert.equal(foto.status, 200);
    assert.equal(foto.headers.get('content-type'), 'image/jpeg');

    // outro caminho: volta ao ponto de partida, o antes continua em aberto e as mudanças recusadas saem
    const outro = estudio(env, 'escolher', 'cafe', 'outro');
    assert.equal(outro.json.codigo, 'PRONTO_PARA_OUTRO_CAMINHO');
    assert.ok(fs.readFileSync(path.join(pasta, 'deck', 'slides', 's02-numero.html'), 'utf8').includes('A manhã já é nossa.'));
    assert.ok(fs.readFileSync(path.join(pasta, 'roteiro', 'S03.json'), 'utf8').includes('Primeiro, em março,'));
    assert.deepEqual(JSON.parse(fs.readFileSync(mudancas, 'utf8')), { pedido: 'mais vida', mudancas: [] });
    // a versão vista fica guardada, com o vídeo ligado
    assert.ok(fs.readFileSync(path.join(ad, 'tentativa', 'deck', 'slides', 's02-numero.html'), 'utf8').includes('A manhã é toda nossa.'));
    assert.ok(fs.readFileSync(path.join(ad, 'tentativa', 'roteiro', 'S03.json'), 'utf8').includes('Logo em março,'));
    assert.equal(fs.statSync(path.join(ad, 'tentativa', 'deck', 'assets', 'abertura.mp4')).ino, fs.statSync(video).ino);
    assert.equal(fs.statSync(video).ino, fs.statSync(path.join(ad, 'antes', 'deck', 'assets', 'abertura.mp4')).ino);

    // troca de cor pequena (20 no vermelho) num texto pequeno: aparece nos cliques em que ele está
    trocarNoArquivo(path.join(pasta, 'deck', 'slides', 's02-numero.html'), '.fonte{position:absolute;left:130px;bottom:80px;font-size:20px;color:var(--cor-apoio)}', '.fonte{position:absolute;left:130px;bottom:80px;font-size:20px;color:#715975}');
    fs.writeFileSync(mudancas, JSON.stringify({ pedido: 'mais vida', mudancas: [{ titulo: 'Fonte em outro tom', telas: [2] }, { titulo: 'Só isso', telas: [2] }] }));
    const cor = estudio(env, 'comparar', 'cafe', '--sem-navegador');
    assert.equal(cor.json.codigo, 'COMPARACAO_PRONTA', JSON.stringify(cor.json) + cor.erro);
    assert.deepEqual(cor.json.dados.telas.map((t) => [t.tela, t.situacao, t.cliques_mudados]), [[2, 'mudou', [1, 2]]]);

    // voltar como estava: fecha o antes e apaga a cópia
    trocarNoArquivo(path.join(pasta, 'deck', 'slides', 's02-numero.html'), 'A manhã já é nossa.', 'Outra tentativa.');
    const volta = estudio(env, 'escolher', 'cafe', 'antes');
    assert.equal(volta.json.codigo, 'VOLTOU_COMO_ESTAVA');
    assert.ok(fs.readFileSync(path.join(pasta, 'deck', 'slides', 's02-numero.html'), 'utf8').includes('A manhã já é nossa.'));
    assert.equal(fs.existsSync(path.join(ad, 'antes')), false);
    assert.equal(fs.existsSync(path.join(ad, 'fotos')), false);
    assert.ok(fs.readFileSync(path.join(ad, 'tentativa', 'deck', 'slides', 's02-numero.html'), 'utf8').includes('Outra tentativa.'), 'a versão vista fica até o próximo antes');
    assert.equal(fs.readFileSync(video, 'utf8'), 'video-da-cena');
    const resolvido = estudio(env, 'escolher', 'cafe', 'depois');
    assert.equal(resolvido.codigo, 2);
    assert.equal(resolvido.json.codigo, 'ANTES_JA_RESOLVIDO');
    assert.equal(estudio(env, 'comparar', 'cafe', '--sem-navegador').json.codigo, 'ANTES_JA_RESOLVIDO');

    // vídeo gravado por cima do mesmo arquivo: comparar e voltar recusam; ficar com o depois pode
    assert.equal(estudio(env, 'antes', 'cafe').json.codigo, 'ANTES_GUARDADO');
    assert.equal(fs.existsSync(path.join(ad, 'tentativa')), false, 'o próximo antes apaga a tentativa');
    fs.writeFileSync(video, 'video-gravado-por-cima');
    fs.writeFileSync(mudancas, JSON.stringify({ pedido: 'x', mudancas: [{ titulo: 'um' }, { titulo: 'dois' }] }));
    const videoMudou = estudio(env, 'comparar', 'cafe', '--sem-navegador');
    assert.equal(videoMudou.codigo, 1);
    assert.equal(videoMudou.json.codigo, 'ANTES_VIDEO_MUDOU');
    assert.deepEqual(videoMudou.json.dados.arquivos, ['deck/assets/abertura.mp4']);
    assert.equal(estudio(env, 'escolher', 'cafe', 'antes').json.codigo, 'ANTES_VIDEO_MUDOU');
    assert.equal(estudio(env, 'escolher', 'cafe', 'depois').json.codigo, 'FICOU_O_DEPOIS');
    assert.equal(fs.readFileSync(video, 'utf8'), 'video-gravado-por-cima');

    const invalida = estudio(env, 'escolher', 'cafe', 'talvez');
    assert.equal(invalida.json.codigo, 'ARGUMENTO_INVALIDO');
  } finally {
    try {
      process.kill(JSON.parse(fs.readFileSync(estadoServidor, 'utf8')).pid);
    } catch {}
  }
});

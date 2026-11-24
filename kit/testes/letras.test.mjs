// Letras leves e com licença: leitura do catálogo do Google Fonts (sem rede: as respostas são de
// mentira, no formato real), o comando "fonte" tudo ou nada, a conferência das letras do deck e o
// destino (minha-marca/fontes ou a marca de uma apresentação). Portado do Site Estúdio.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acharNavegador } from '../scripts/lib/chrome.mjs';
import {
  lerMetadados, lerPesos, pedidoDoCss2, blocosDoCss, enderecoPermitido, nomeProprio, slugDaFamilia,
  familiaValida, arquivoDaLicenca,
} from '../scripts/lib/fontes-google.mjs';
import { baixarFonte } from '../scripts/comandos/fonte.mjs';
import { conferirLetras, anotarLetras, familiaDoArquivo, familiaDaLicenca } from '../scripts/lib/letras.mjs';

const META_VARIAVEL = `name: "Letra Teste"
license: "OFL"
fonts {
  name: "Letra Teste"
  style: "normal"
  weight: 400
}
fonts {
  name: "Letra Teste"
  style: "italic"
  weight: 400
}
axes {
  tag: "wdth"
  min_value: 75.0
  max_value: 100.0
}
axes {
  tag: "wght"
  min_value: 300.0
  max_value: 800.0
}
source {
  files {
    dest_file: "OFL.txt"
  }
}
`;
const META_ESTATICA = 'name: "Outra Letra"\nlicense: "OFL"\nfonts {\n  style: "normal"\n  weight: 400\n}\nfonts {\n  style: "normal"\n  weight: 700\n}\n';

const face = (alfabeto, url, extra = '') => `/* ${alfabeto} */
@font-face {
  font-family: 'Letra Teste';
  font-style: normal;
  font-weight: 300 800;
  font-display: swap;
  src: url(${url}) format('woff2');
  unicode-range: U+0000-00FF, U+0131;${extra}
}
`;
const CSS = face('latin-ext', 'https://fonts.gstatic.com/s/x/ext.woff2') + face('latin', 'https://fonts.gstatic.com/s/x/lat.woff2');

test('catálogo: metadados, pesos e o pedido ao css2 com eixos em ordem alfabética', () => {
  const m = lerMetadados(META_VARIAVEL);
  assert.equal(m.nome, 'Letra Teste');
  assert.equal(m.licenca, 'OFL');
  assert.deepEqual(m.eixos, [{ tag: 'wdth', min: 75, max: 100 }, { tag: 'wght', min: 300, max: 800 }]);
  assert.deepEqual(m.estilos.map((s) => s.estilo), ['normal', 'italic']);
  assert.equal(pedidoDoCss2(m), 'family=Letra+Teste:wght@300..800&display=swap');
  assert.equal(pedidoDoCss2(m, { pesos: lerPesos('400..900') }), 'family=Letra+Teste:wght@400..800&display=swap');
  assert.equal(pedidoDoCss2(m, { italico: true, larguras: true }), 'family=Letra+Teste:ital,wdth,wght@0,75..100,300..800;1,75..100,300..800&display=swap');
  assert.equal(pedidoDoCss2(m, { pesos: lerPesos('900') }), null);
  const e = lerMetadados(META_ESTATICA);
  assert.equal(pedidoDoCss2(e), 'family=Outra+Letra:wght@400;700&display=swap');
  assert.equal(pedidoDoCss2(e, { pesos: lerPesos('700') }), 'family=Outra+Letra:wght@700&display=swap');
  assert.equal(pedidoDoCss2(e, { pesos: lerPesos('400..600') }), 'family=Outra+Letra:wght@400&display=swap');
  assert.equal(lerPesos('abc'), null);
  assert.equal(lerPesos('400,2000'), null);
});

test('catálogo: nomes próprios, licença com o nome da família e só os hosts do catálogo', () => {
  assert.equal(slugDaFamilia('Big Shoulders Display'), 'bigshouldersdisplay');
  assert.equal(nomeProprio('Big Shoulders Display'), 'BigShouldersDisplay');
  assert.equal(arquivoDaLicenca('LetraTeste', 'ofl'), 'OFL-LetraTeste.txt');
  assert.equal(arquivoDaLicenca('LetraTeste', 'apache'), 'LICENCA-LetraTeste.txt');
  for (const boa of ['Inter', 'Big Shoulders Display', 'M PLUS 1p']) assert.equal(familiaValida(boa), true, boa);
  for (const ruim of ['', '../x', 'a/b', 'Letra"', 'x'.repeat(61)]) assert.equal(familiaValida(ruim), false, ruim);
  assert.equal(enderecoPermitido('https://fonts.gstatic.com/s/a.woff2'), true);
  for (const ruim of ['http://fonts.gstatic.com/a', 'https://fonts.gstatic.com.mal.example/a', 'https://u:p@fonts.gstatic.com/a', 'https://fonts.gstatic.com:8443/a', 'nada']) {
    assert.equal(enderecoPermitido(ruim), false, ruim);
  }
  const blocos = blocosDoCss(CSS);
  assert.deepEqual(blocos.map((b) => [b.alfabeto, b.url, b.formato, b.peso]), [
    ['latin-ext', 'https://fonts.gstatic.com/s/x/ext.woff2', 'woff2', '300 800'],
    ['latin', 'https://fonts.gstatic.com/s/x/lat.woff2', 'woff2', '300 800'],
  ]);
});

// Um fetch de mentira: devolve o que está no mapa, 404 no resto, e anota cada endereço pedido.
function catalogoDeMentira(mapa) {
  const pedidos = [];
  const buscar = async (url) => {
    pedidos.push(url);
    const corpo = mapa[url.split('?')[0]];
    if (corpo === undefined) return new Response('nao achei', { status: 404 });
    return new Response(corpo, { status: 200 });
  };
  return { buscar, pedidos };
}
const RAW = 'https://raw.githubusercontent.com/google/fonts/main';
const LETRA = Buffer.from('wOF2-de-mentira');

test('fonte: baixa só o alfabeto latino em .woff2 e a licença com o nome próprio, e devolve o @font-face', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-fonte-'));
  try {
    const { buscar, pedidos } = catalogoDeMentira({
      [`${RAW}/ofl/letrateste/METADATA.pb`]: META_VARIAVEL,
      [`${RAW}/ofl/letrateste/OFL.txt`]: 'SIL Open Font License 1.1',
      'https://fonts.googleapis.com/css2': CSS,
      'https://fonts.gstatic.com/s/x/lat.woff2': LETRA,
    });
    const r = await baixarFonte({ familia: 'Letra Teste', pasta, buscar });
    assert.deepEqual(fs.readdirSync(pasta).sort(), ['LetraTeste-latin.woff2', 'OFL-LetraTeste.txt']);
    assert.deepEqual(r.arquivos, ['LetraTeste-latin.woff2']);
    assert.equal(r.licenca, 'OFL-LetraTeste.txt');
    assert.ok(r.css.startsWith('@font-face{font-family:"Letra Teste";src:url("fontes/LetraTeste-latin.woff2") format("woff2");font-weight:300 800;'), r.css);
    // a tela de apresentação espera a letra (block), em vez de piscar com a do sistema
    assert.ok(r.css.includes('font-display:block'), r.css);
    assert.equal(pedidos.includes('https://fonts.gstatic.com/s/x/ext.woff2'), false, 'o alfabeto estendido não é baixado');
    assert.deepEqual(conferirLetras(pasta).semLicenca, []);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

// Família estática: o css2 devolve um @font-face por peso, cada um com o seu arquivo.
const faceEstatica = (peso) => face('latin', `https://fonts.gstatic.com/s/y/${peso}.woff2`).split('Letra Teste').join('Outra Letra').split('300 800').join(String(peso));
const ESTATICA = {
  [`${RAW}/ofl/outraletra/METADATA.pb`]: META_ESTATICA,
  [`${RAW}/ofl/outraletra/OFL.txt`]: 'SIL Open Font License 1.1',
  'https://fonts.gstatic.com/s/y/400.woff2': Buffer.from('wOF2-400'),
  'https://fonts.gstatic.com/s/y/700.woff2': Buffer.from('wOF2-700-negrito'),
};

test('fonte: família estática guarda cada peso no seu arquivo, e baixar outro peso depois não apaga o primeiro', async () => {
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-fonte-'));
  try {
    const dois = catalogoDeMentira({ ...ESTATICA, 'https://fonts.googleapis.com/css2': faceEstatica(400) + faceEstatica(700) });
    const r = await baixarFonte({ familia: 'Outra Letra', pasta, buscar: dois.buscar });
    assert.deepEqual(r.arquivos, ['OutraLetra-400-latin.woff2', 'OutraLetra-700-latin.woff2']);
    const faces = r.css.split('\n');
    assert.equal(faces.length, 2, r.css);
    assert.ok(faces[0].includes('url("fontes/OutraLetra-400-latin.woff2")') && faces[0].includes('font-weight:400;'), faces[0]);
    assert.ok(faces[1].includes('url("fontes/OutraLetra-700-latin.woff2")') && faces[1].includes('font-weight:700;'), faces[1]);
    assert.equal(fs.readFileSync(path.join(pasta, 'OutraLetra-700-latin.woff2'), 'utf8'), 'wOF2-700-negrito');
    // segunda vez, só o 700: o arquivo do 400 continua o 400
    const um = catalogoDeMentira({ ...ESTATICA, 'https://fonts.googleapis.com/css2': faceEstatica(700) });
    await baixarFonte({ familia: 'Outra Letra', pasta, buscar: um.buscar });
    assert.equal(fs.readFileSync(path.join(pasta, 'OutraLetra-400-latin.woff2'), 'utf8'), 'wOF2-400');
    assert.deepEqual(conferirLetras(pasta).semLicenca, []);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('fonte: dois @font-face que cairiam no mesmo arquivo param tudo, em vez de sumir com um em silêncio', async () => {
  const pasta = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-fonte-')), 'fontes');
  try {
    const { buscar } = catalogoDeMentira({ ...ESTATICA, 'https://fonts.googleapis.com/css2': faceEstatica(700) + faceEstatica(700) });
    await assert.rejects(baixarFonte({ familia: 'Outra Letra', pasta, buscar }), (e) => e.codigo === 'FONTE_NAO_ACHADA');
    assert.equal(fs.existsSync(pasta), false);
  } finally {
    fs.rmSync(path.dirname(pasta), { recursive: true, force: true });
  }
});

test('fonte: tudo ou nada; sem licença, fora do catálogo ou com endereço estranho, nada é escrito', async () => {
  const pasta = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-fonte-')), 'fontes');
  const casos = [
    [{ [`${RAW}/ofl/letrateste/METADATA.pb`]: META_VARIAVEL }, 'FONTE_SEM_LICENCA'],
    [{}, 'FONTE_NAO_ACHADA'],
    [{
      [`${RAW}/ofl/letrateste/METADATA.pb`]: META_VARIAVEL,
      [`${RAW}/ofl/letrateste/OFL.txt`]: 'OFL',
      'https://fonts.googleapis.com/css2': face('latin', 'https://cdn.mal.example/x.woff2'),
    }, 'FONTE_DOWNLOAD_FALHOU'],
    [{
      [`${RAW}/ofl/letrateste/METADATA.pb`]: META_VARIAVEL,
      [`${RAW}/ofl/letrateste/OFL.txt`]: 'OFL',
      'https://fonts.googleapis.com/css2': CSS,
    }, 'FONTE_DOWNLOAD_FALHOU'],
  ];
  try {
    for (const [mapa, codigo] of casos) {
      await assert.rejects(baixarFonte({ familia: 'Letra Teste', pasta, buscar: catalogoDeMentira(mapa).buscar }), (e) => e.codigo === codigo);
      assert.equal(fs.existsSync(pasta), false, `${codigo}: escreveu algo`);
    }
  } finally {
    fs.rmSync(path.dirname(pasta), { recursive: true, force: true });
  }
});

test('letras: a licença vale só para a família com o mesmo nome (sem prefixo)', () => {
  assert.equal(familiaDoArquivo('Inter[opsz,wght].ttf'), 'inter');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-letras-nome-'));
  const por = (nome) => fs.writeFileSync(path.join(base, nome), Buffer.alloc(10));
  try {
    // a licença do Roboto Mono não cobre o Roboto, nem a do Inter cobre o Inter Tight
    por('Roboto-latin.woff2');
    por('OFL-RobotoMono.txt');
    por('InterTight-latin.woff2');
    por('OFL-Inter.txt');
    assert.deepEqual(conferirLetras(base).semLicenca.map((s) => s.familia).sort(), ['intertight', 'roboto']);
    // e ao contrário: a do Roboto não cobre o Roboto Mono
    por('RobotoMono-latin.woff2');
    por('OFL-Roboto.txt');
    por('OFL-InterTight.txt');
    por('Inter-latin.woff2');
    assert.deepEqual(conferirLetras(base).semLicenca, []);
    fs.rmSync(path.join(base, 'OFL-RobotoMono.txt'));
    assert.deepEqual(conferirLetras(base).semLicenca.map((s) => s.familia), ['robotomono']);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('letras do deck: licença com nome próprio por família, OFL.txt só vale para uma família, peso e formato', () => {
  assert.equal(familiaDoArquivo('BigShouldersDisplay-latin.woff2'), 'bigshouldersdisplay');
  assert.equal(familiaDoArquivo('Figtree.ttf'), 'figtree');
  assert.equal(familiaDoArquivo('Inter_18pt-Regular.ttf'), 'inter', 'estático por tamanho óptico');
  assert.equal(familiaDaLicenca('OFL-BigShouldersDisplay.txt'), 'bigshouldersdisplay');
  assert.equal(familiaDaLicenca('OFL.txt'), '');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-letras-'));
  const por = (rel, tamanho = 10) => {
    const c = path.join(base, ...rel.split('/'));
    fs.mkdirSync(path.dirname(c), { recursive: true });
    fs.writeFileSync(c, Buffer.alloc(tamanho));
  };
  try {
    // uma família e licença genérica: vale
    por('assets/marca/fontes/Uma-latin.woff2');
    por('assets/marca/fontes/OFL.txt');
    assert.deepEqual(conferirLetras(base).semLicenca, []);
    // duas famílias e uma licença genérica: a segunda fica sem (o caso do piloto)
    por('assets/marca/fontes/Outra.ttf', 120 * 1024);
    const r = conferirLetras(base);
    assert.equal(r.semLicenca.length, 2);
    por('assets/marca/fontes/OFL-Uma.txt');
    por('assets/marca/fontes/OFL-Outra.txt');
    const ok = conferirLetras(base);
    assert.deepEqual(ok.semLicenca, []);
    assert.deepEqual(ok.pesadas, ['assets/marca/fontes/Outra.ttf']);
    const red = [];
    const warn = [];
    anotarLetras(base, red, warn);
    assert.deepEqual(red, []);
    assert.deepEqual(warn.map((w) => w.tipo), ['fonte-pesada'], JSON.stringify(warn));
    assert.ok(warn[0].detalhe.includes('Outra.ttf'), warn[0].detalhe);
    fs.rmSync(path.join(base, 'assets', 'marca', 'fontes', 'OFL-Outra.txt'));
    anotarLetras(base, red, warn);
    assert.deepEqual(red.map((v) => v.tipo), ['fonte-sem-licenca']);
    assert.ok(red[0].detalhe.includes('Outra.ttf'), red[0].detalhe);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESPACHANTE = path.join(RAIZ, 'kit', 'scripts', 'estudio.mjs');
let base;
let env;
function estudio(...args) {
  const r = spawnSync(process.execPath, [DESPACHANTE, ...args], { encoding: 'utf8', env, timeout: 200000 });
  const linhas = (r.stdout || '').trim().split('\n');
  let json = null;
  try {
    json = JSON.parse(linhas[linhas.length - 1]);
  } catch {}
  return { codigo: r.status, json };
}
before(() => {
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-letras-cmd-'));
  env = { ...process.env, ESTUDIO_APRESENTACOES: base, ESTUDIO_MARCA: path.join(base, 'sem-marca'), ESTUDIO_NAO_ABRIR: '1' };
});
after(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

test('fonte: nome de família e apresentação conferidos antes de qualquer pedido à internet', () => {
  const semFamilia = estudio('fonte');
  assert.equal(semFamilia.codigo, 1);
  assert.equal(semFamilia.json.codigo, 'ARGUMENTO_FALTANDO');
  assert.equal(estudio('fonte', '../x').json.codigo, 'ARGUMENTO_INVALIDO');
  assert.equal(estudio('fonte', 'Inter', '--pesos', 'muito').json.codigo, 'ARGUMENTO_INVALIDO');
  assert.equal(estudio('fonte', 'Inter', '--apresentacao').json.codigo, 'ARGUMENTO_FALTANDO');
  assert.equal(estudio('fonte', 'Inter', '--apresentacao', 'Nome Ruim').json.codigo, 'ARGUMENTO_INVALIDO');
  const sem = estudio('fonte', 'Inter', '--apresentacao', 'nao-existe');
  assert.equal(sem.json.codigo, 'APRESENTACAO_NAO_ACHADA');
  assert.equal(fs.existsSync(path.join(base, 'sem-marca')), false, 'nada foi escrito');
});

test('checar no Chrome: letra sem a licença da família reprova; .ttf só avisa', { skip: acharNavegador() ? false : 'sem Chrome, Edge ou Chromium nesta máquina', timeout: 240000 }, () => {
  assert.equal(estudio('nova', 'letras').codigo, 0);
  const fontes = path.join(base, 'letras', 'deck', 'assets', 'marca', 'fontes');
  const ok = estudio('checar', 'letras');
  assert.equal(ok.codigo, 0, JSON.stringify(ok.json && ok.json.dados.vermelhos));
  assert.ok(ok.json.dados.amarelos.some((w) => w.tipo === 'fonte-pesada' && w.detalhe.includes('Fraunces-Variable.ttf')));
  fs.rmSync(path.join(fontes, 'OFL-DMSans.txt'));
  const r = estudio('checar', 'letras');
  assert.equal(r.codigo, 2, JSON.stringify(r.json));
  const red = r.json.dados.vermelhos.filter((v) => v.tipo === 'fonte-sem-licenca');
  assert.equal(red.length, 1, JSON.stringify(r.json.dados.vermelhos));
  assert.ok(red[0].detalhe.includes('DMSans-Variable.woff2'), red[0].detalhe);
});

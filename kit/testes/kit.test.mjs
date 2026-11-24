// Peças do kit sem navegador: argumentos, nomes, contrato JSON, roteiro, teleprompter, espelho, versões.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { lerArgs } from '../scripts/lib/args.mjs';
import { nomeValido, sugerirNome, nomeReservadoDoWindows } from '../scripts/lib/caminhos.mjs';
import { sanear } from '../scripts/lib/executar.mjs';
import { montarResultado, resultadoDeErro, preencher, textoDoCodigo, KitErro } from '../scripts/lib/saida.mjs';
import { resultadoDaVersao } from '../scripts/comandos/versao.mjs';
import { numeroDoNome, ehArquivoDeRoteiro, lerRoteiro } from '../scripts/lib/apresentacao.mjs';
import { montarTeleprompter, jsonParaScript } from '../scripts/lib/teleprompter.mjs';
import { conferirEspelhos, gerarEspelhos } from '../scripts/lib/espelho.mjs';
import { compararVersoes, enderecoAceito } from '../scripts/lib/atualizacao.mjs';
import { lerEnv } from '../scripts/lib/json.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESPACHANTE = path.join(RAIZ, 'kit', 'scripts', 'estudio.mjs');
const temporaria = (prefixo) => fs.mkdtempSync(path.join(os.tmpdir(), prefixo));

function rodarEstudio(args, env = {}) {
  const r = spawnSync(process.execPath, [DESPACHANTE, ...args], { encoding: 'utf8', env: { ...process.env, ESTUDIO_NAO_ABRIR: '1', ...env } });
  const linhas = r.stdout.trim().split('\n');
  return { codigo: r.status, json: JSON.parse(linhas[linhas.length - 1]), stdout: r.stdout, stderr: r.stderr };
}

test('lerArgs separa posicionais, --chave valor, --chave=valor e --chave sozinha', () => {
  const a = lerArgs(['exemplo', '--titulo', 'Meu deck', '--qualidade=70', 'comp', '--criar']);
  assert.deepEqual(a.posicionais, ['exemplo', 'comp']);
  assert.deepEqual(a.opcoes, { titulo: 'Meu deck', qualidade: '70', criar: true });
});

test('lerArgs: opção sem valor não engole o nome, antes ou depois dele', () => {
  for (const ordem of [['--sem-navegador', 'exemplo'], ['exemplo', '--sem-navegador']]) {
    const a = lerArgs(ordem);
    assert.deepEqual(a.posicionais, ['exemplo'], ordem.join(' '));
    assert.equal(a.opcoes['sem-navegador'], true);
  }
  for (const chave of ['criar', 'conferir', 'rapido', 'pasta']) {
    const a = lerArgs([`--${chave}`, 'nome', '--titulo', 'T']);
    assert.deepEqual(a.posicionais, ['nome'], chave);
    assert.deepEqual(a.opcoes, { [chave]: true, titulo: 'T' });
  }
});

test('nome de apresentação: só minúsculas, números e hífen; sugestão tira acento e espaço', () => {
  assert.equal(nomeValido('cafe-aurora-2027'), true);
  for (const ruim of ['', 'Café', 'a b', '../x', '-a', 'a-', 'a/b', 'a.b']) assert.equal(nomeValido(ruim), false, ruim);
  assert.equal(sugerirNome('Café Aurora: Plano 2027!'), 'cafe-aurora-plano-2027');
});

test('nome de apresentação: nome de dispositivo do Windows é recusado e a sugestão vira nome usável', () => {
  for (const nome of ['con', 'prn', 'aux', 'nul', 'com1', 'com9', 'lpt1', 'lpt9']) {
    assert.equal(nomeValido(nome), false, nome);
    const sugestao = sugerirNome(nome.toUpperCase());
    assert.equal(sugestao, `${nome}-1`);
    assert.equal(nomeValido(sugestao), true, sugestao);
  }
  for (const nome of ['CON', 'Con.algo', 'nul.txt', 'lpt1.deck']) assert.equal(nomeReservadoDoWindows(nome), true, nome);
  // parecidos que o Windows aceita
  for (const nome of ['console', 'com10', 'com0', 'lpt', 'nulo', 'con-1', 'aux-deck']) assert.equal(nomeValido(nome), true, nome);
  // "con.algo" vira "con-algo", que já é um nome comum
  assert.equal(sugerirNome('con.algo'), 'con-algo');
  assert.equal(sugerirNome(`${'a'.repeat(59)} b`), 'a'.repeat(59));
});

test('nova: título com "$&", "$\'" e "$1" entra como texto, sem virar comando do replace', () => {
  const base = temporaria('estudio-titulo-cifrao-');
  try {
    const titulo = "A $& B $' C $` D $1";
    const r = rodarEstudio(['nova', 'cifrao', '--titulo', titulo], { ESTUDIO_APRESENTACOES: base, ESTUDIO_MARCA: path.join(base, 'sem-marca') });
    assert.equal(r.codigo, 0, r.stdout);
    const index = fs.readFileSync(path.join(base, 'cifrao', 'deck', 'index.html'), 'utf8');
    assert.ok(index.includes("<title>A $&amp; B $' C $` D $1</title>"), index.slice(0, 400));
    assert.equal(index.includes('{{TITULO}}'), false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('sanear esconde sequências longas parecidas com segredo', () => {
  const segredo = 'a'.repeat(20) + 'B'.repeat(20);
  assert.equal(sanear(`chave=${segredo} ok`), 'chave=<REDACTED> ok');
  assert.equal(sanear('curto_123'), 'curto_123');
});

test('contrato: resultado sempre tem ok, comando, codigo, resumo, arquivos, avisos e dados', () => {
  const r = montarResultado('x', { ok: true });
  assert.deepEqual(Object.keys(r).sort(), ['arquivos', 'avisos', 'codigo', 'comando', 'dados', 'ok', 'resumo']);
});

test('contrato: só o texto livre (detalhe, erro, saida) passa pelo sanear; nome e caminho ficam', () => {
  const longo = 'apresentacao-para-investidores-do-cafe-aurora';
  const segredo = 'k'.repeat(40);
  const r = montarResultado('nova', {
    ok: false,
    codigo: 'X',
    arquivos: { pasta: `apresentacoes/${longo}` },
    avisos: [{ codigo: 'Y', dados: { detalhe: `token ${segredo}` } }],
    dados: { nome: longo, detalhe: `falhou com ${segredo}`, quebrados: [{ url: `/${longo}/a.png`, erro: segredo }] },
  });
  assert.equal(r.arquivos.pasta, `apresentacoes/${longo}`);
  assert.equal(r.dados.nome, longo);
  assert.equal(r.dados.detalhe, 'falhou com <REDACTED>');
  assert.equal(r.dados.quebrados[0].url, `/${longo}/a.png`);
  assert.equal(r.dados.quebrados[0].erro, '<REDACTED>');
  assert.equal(r.avisos[0].dados.detalhe, 'token <REDACTED>');
});

test('nova com nome de 45 letras devolve o caminho inteiro (nada de <REDACTED>)', () => {
  const base = temporaria('estudio-longo-');
  try {
    const nome = 'apresentacao-para-investidores-do-cafe-aurora';
    const r = rodarEstudio(['nova', nome], { ESTUDIO_APRESENTACOES: base, ESTUDIO_MARCA: path.join(base, 'sem-marca') });
    assert.equal(r.codigo, 0, r.stdout);
    assert.ok(r.json.arquivos.pasta.endsWith(nome), r.json.arquivos.pasta);
    assert.equal(r.json.dados.nome, nome);
    assert.equal(r.stdout.includes('REDACTED'), false);
    const pasta = rodarEstudio(['abrir', '--pasta', nome], { ESTUDIO_APRESENTACOES: base });
    assert.equal(pasta.codigo, 0, pasta.stdout);
    assert.equal(pasta.json.codigo, 'PASTA_ABERTA');
    assert.ok(pasta.json.arquivos.pasta.endsWith(nome));
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('navegador: com o estúdio instalado, vale o chrome-headless-shell de versão fixa', async () => {
  const { acharNavegador } = await import('../scripts/lib/chrome.mjs');
  const ferr = temporaria('estudio-ferr-');
  try {
    const nomeShell = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
    const dir = path.join(ferr, 'navegador', 'chrome-headless-shell', 'x-1.0');
    fs.mkdirSync(dir, { recursive: true });
    const exe = path.join(dir, nomeShell);
    fs.writeFileSync(exe, '');
    const semForcado = { ...process.env };
    delete semForcado.ESTUDIO_CHROME;
    fs.writeFileSync(path.join(ferr, 'instalacao.json'), '{}');
    assert.deepEqual(acharNavegador(semForcado, ferr), { caminho: exe, tipo: 'shell' });
    fs.writeFileSync(path.join(ferr, 'navegador.txt'), `${exe}\n`);
    assert.deepEqual(acharNavegador(semForcado, ferr), { caminho: exe, tipo: 'shell' });
    assert.equal(acharNavegador({ ...semForcado, ESTUDIO_CHROME: exe }, ferr).tipo, 'forcado');
  } finally {
    fs.rmSync(ferr, { recursive: true, force: true });
  }
});

test('despachante: comando desconhecido sai 1 com JSON na última linha', () => {
  const r = rodarEstudio(['nao-existe']);
  assert.equal(r.codigo, 1);
  assert.equal(r.json.ok, false);
  assert.equal(r.json.codigo, 'COMANDO_DESCONHECIDO');
  assert.ok(r.json.dados.disponiveis.includes('checar'));
});

// Os {{campos}} de cada texto de kit/mensagens.json e o que o comando manda em "dados".
// Texto novo com {{campo}} entra aqui, com o campo que o comando de fato envia.
const CAMPOS_ENVIADOS = Object.freeze({
  VERSAO: ['versao'],
  JA_ATUALIZADO: ['de'],
  ESTUDIO_ATUALIZADO: ['de', 'para'],
  PDF_PRONTO: ['paginas'],
  APRESENTACAO_JA_EXISTE: ['nome'],
});

test('resumo: os {{campos}} do mensagens.json são os que o comando manda, e saem preenchidos', () => {
  const mensagens = JSON.parse(fs.readFileSync(path.join(RAIZ, 'kit', 'mensagens.json'), 'utf8'));
  const comCampos = Object.entries(mensagens).filter(([codigo, m]) => !codigo.startsWith('_') && m.texto.includes('{{'));
  assert.deepEqual(comCampos.map(([codigo]) => codigo).sort(), Object.keys(CAMPOS_ENVIADOS).sort());
  for (const [codigo, m] of comCampos) {
    const campos = m.texto.split('{{').slice(1).map((pedaco) => pedaco.split('}}')[0]);
    assert.deepEqual([...new Set(campos)].sort(), [...CAMPOS_ENVIADOS[codigo]].sort(), codigo);
    const dados = Object.fromEntries(campos.map((campo) => [campo, `valor-${campo}`]));
    for (const r of [montarResultado('x', { ok: true, codigo, dados }), resultadoDeErro(new KitErro(codigo, dados))]) {
      assert.ok(!r.resumo.includes('{{') && !r.resumo.includes('}}'), `${codigo}: ${r.resumo}`);
      for (const campo of campos) assert.ok(r.resumo.includes(`valor-${campo}`), `${codigo} sem ${campo}`);
    }
  }
  // campo ausente ou que não é texto nem número some com o marcador
  assert.equal(montarResultado('x', { ok: true, codigo: 'VERSAO', dados: {} }).resumo, 'Esta é a versão  do estúdio.');
  assert.ok(!montarResultado('x', { ok: true, codigo: 'VERSAO', dados: { versao: { x: 1 } } }).resumo.includes('[object'));
  assert.equal(preencher('a {{constructor}} b {{toString}}', {}), 'a  b ', 'campo herdado não entra');
  assert.equal(preencher('sem fecho {{x', { x: 'y' }), 'sem fecho {{x');
  assert.equal(preencher('{{n}} páginas', { n: 0 }), '0 páginas');
});

// Cada ponto do kit que emite o código (falha, reprovado, aviso ou "codigo: '...'"), lido como
// texto até o fim da instrução (o primeiro ";"), sem expressão regular.
const PASTA_SCRIPTS = path.join(RAIZ, 'kit', 'scripts');
function arquivosDoKit(pasta) {
  const lista = [];
  for (const nome of fs.readdirSync(pasta)) {
    const c = path.join(pasta, nome);
    if (fs.statSync(c).isDirectory()) lista.push(...arquivosDoKit(c));
    else if (nome.endsWith('.mjs')) lista.push(c);
  }
  return lista;
}
function emissoes(codigo) {
  const achados = [];
  for (const arquivo of arquivosDoKit(PASTA_SCRIPTS)) {
    const texto = fs.readFileSync(arquivo, 'utf8');
    for (const prefixo of [`falha('${codigo}'`, `reprovado('${codigo}'`, `aviso('${codigo}'`, `codigo: '${codigo}'`]) {
      let i = texto.indexOf(prefixo);
      while (i !== -1) {
        const fim = texto.indexOf(';', i);
        achados.push({ arquivo: path.relative(RAIZ, arquivo), trecho: texto.slice(i, fim === -1 ? undefined : fim) });
        i = texto.indexOf(prefixo, i + prefixo.length);
      }
    }
  }
  return achados;
}
const ehDeNome = (ch) => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_' || ch === '$';
const vizinho = (texto, i, passo) => {
  let j = i;
  while (j >= 0 && j < texto.length && (texto[j] === ' ' || texto[j] === '\n')) j += passo;
  return texto[j] || '';
};
// O campo aparece como chave de objeto: "{ campo," "campo:" "campo }" (inclusive a forma curta).
function temChave(trecho, campo) {
  let i = trecho.indexOf(campo);
  while (i !== -1) {
    const fim = i + campo.length;
    const inteiro = !ehDeNome(trecho[i - 1] || '') && !ehDeNome(trecho[fim] || '');
    if (inteiro && '{,'.includes(vizinho(trecho, i - 1, -1)) && ':,}'.includes(vizinho(trecho, fim, 1))) return true;
    i = trecho.indexOf(campo, fim);
  }
  return false;
}

test('resumo: todo {{campo}} de cada código é mandado por todos os pontos do kit que emitem esse código', () => {
  assert.equal(temChave("falha('X', { nome, pasta: p })", 'nome'), true);
  assert.equal(temChave("codigo: 'X', dados: { de: r.de }", 'de'), true);
  assert.equal(temChave("codigo: 'X', dados: { outro: r.de }", 'de'), false, 'r.de é valor, não chave');
  const mensagens = JSON.parse(fs.readFileSync(path.join(RAIZ, 'kit', 'mensagens.json'), 'utf8'));
  for (const [codigo, m] of Object.entries(mensagens)) {
    if (codigo.startsWith('_') || !m.texto.includes('{{')) continue;
    const campos = [...new Set(m.texto.split('{{').slice(1).map((pedaco) => pedaco.split('}}')[0]))];
    const pontos = emissoes(codigo);
    assert.ok(pontos.length > 0, `${codigo}: nenhum ponto do kit emite este código`);
    for (const { arquivo, trecho } of pontos) {
      for (const campo of campos) assert.ok(temChave(trecho, campo), `${codigo} em ${arquivo} não manda "${campo}": ${trecho.slice(0, 160)}`);
    }
  }
});

test('textoDoCodigo: código herdado (constructor, __proto__) não acha nada e não quebra', () => {
  for (const c of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.equal(textoDoCodigo(c), '', c);
    assert.equal(montarResultado('x', { ok: false, codigo: c }).resumo, '', c);
    assert.equal(resultadoDeErro(new KitErro(c)).resumo, c, c);
  }
  assert.equal(textoDoCodigo(undefined), '');
  assert.equal(preencher(undefined, {}), '');
  assert.equal(preencher(42, {}), '');
  assert.equal(textoDoCodigo('OK'), 'Pronto.');
});

test('versao sem o arquivo VERSAO: avisa VERSAO_NAO_ACHADA e o resumo diz isso, sem buraco na frase', () => {
  const sem = montarResultado('versao', resultadoDaVersao(null));
  assert.deepEqual(sem.avisos.map((a) => a.codigo), ['VERSAO_NAO_ACHADA']);
  assert.equal(sem.resumo, textoDoCodigo('VERSAO_NAO_ACHADA'));
  assert.ok(sem.resumo.length > 0 && !sem.resumo.includes('versão  do'), sem.resumo);
  assert.equal(sem.dados.versao, null);
  const com = montarResultado('versao', resultadoDaVersao('1.1.0', { version: '1.1.0' }));
  assert.deepEqual([com.avisos, com.resumo, com.dados.pacote], [[], 'Esta é a versão 1.1.0 do estúdio.', '1.1.0']);
});

test('resumo de verdade: versao e nova repetida saem com o valor no lugar do {{campo}}', () => {
  const v = rodarEstudio(['versao']);
  const versao = fs.readFileSync(path.join(RAIZ, 'VERSAO'), 'utf8').trim();
  assert.equal(v.json.resumo, `Esta é a versão ${versao} do estúdio.`);
  const base = temporaria('estudio-resumo-');
  try {
    const env = { ESTUDIO_APRESENTACOES: base };
    assert.equal(rodarEstudio(['nova', 'repetida'], env).codigo, 0);
    const deNovo = rodarEstudio(['nova', 'repetida'], env);
    assert.equal(deNovo.json.codigo, 'APRESENTACAO_JA_EXISTE');
    assert.equal(deNovo.json.resumo, 'Já existe uma apresentação chamada repetida.');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('despachante: versao sai 0 e informa o HyperFrames fixo', () => {
  const r = rodarEstudio(['versao']);
  assert.equal(r.codigo, 0);
  assert.equal(r.json.dados.hyperframes, '0.8.181');
});

test('nova: nome inválido vira NOME_INVALIDO com sugestão; nome repetido não sobrescreve', () => {
  const base = temporaria('estudio-nova-');
  try {
    const ruim = rodarEstudio(['nova', 'Meu Deck'], { ESTUDIO_APRESENTACOES: base });
    assert.equal(ruim.codigo, 1);
    assert.equal(ruim.json.codigo, 'NOME_INVALIDO');
    assert.equal(ruim.json.dados.sugestao, 'meu-deck');
    const marca = path.join(base, 'sem-marca');
    const ok = rodarEstudio(['nova', 'teste', '--titulo', 'Título <x>'], { ESTUDIO_APRESENTACOES: base, ESTUDIO_MARCA: marca });
    assert.equal(ok.codigo, 0, ok.stdout);
    assert.equal(ok.json.avisos[0].codigo, 'MARCA_DE_EXEMPLO');
    const index = fs.readFileSync(path.join(base, 'teste', 'deck', 'index.html'), 'utf8');
    assert.ok(index.includes('<title>Título &lt;x&gt;</title>'));
    assert.ok(fs.existsSync(path.join(base, 'teste', 'deck', 'assets', 'marca', 'tokens.css')));
    const deNovo = rodarEstudio(['nova', 'teste'], { ESTUDIO_APRESENTACOES: base });
    assert.equal(deNovo.json.codigo, 'APRESENTACAO_JA_EXISTE');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('nova usa minha-marca quando existe tokens.css', () => {
  const base = temporaria('estudio-marca-');
  try {
    const marca = path.join(base, 'marca');
    fs.mkdirSync(marca);
    fs.writeFileSync(path.join(marca, 'tokens.css'), ':root{--cor-fundo:#fff}\n');
    fs.writeFileSync(path.join(marca, 'LEIA-ME.txt'), 'leia');
    const r = rodarEstudio(['nova', 'com-marca'], { ESTUDIO_APRESENTACOES: path.join(base, 'ap'), ESTUDIO_MARCA: marca });
    assert.equal(r.json.dados.marca, 'minha-marca');
    const destino = path.join(base, 'ap', 'com-marca', 'deck', 'assets', 'marca');
    assert.equal(fs.readFileSync(path.join(destino, 'tokens.css'), 'utf8'), ':root{--cor-fundo:#fff}\n');
    assert.equal(fs.existsSync(path.join(destino, 'LEIA-ME.txt')), false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('número da tela vem do 1º número do nome do arquivo', () => {
  assert.equal(numeroDoNome('s01-capa.html'), 1);
  assert.equal(numeroDoNome('s12b-x3.html'), 12);
  assert.equal(numeroDoNome('capa.html'), null);
  assert.equal(ehArquivoDeRoteiro('S01.json'), true);
  assert.equal(ehArquivoDeRoteiro('s7.json'), true);
  for (const n of ['S.json', 'S1a.json', 'X01.json', 'S01.md']) assert.equal(ehArquivoDeRoteiro(n), false, n);
});

test('lerRoteiro ordena por tela e aponta beats sem fala e telas repetidas', () => {
  const pasta = temporaria('estudio-roteiro-');
  try {
    fs.writeFileSync(path.join(pasta, 'S02.json'), JSON.stringify({ tela: 2, titulo: 'b', beats: [{ fala: 'oi' }] }));
    fs.writeFileSync(path.join(pasta, 'S01.json'), JSON.stringify({ tela: 1, titulo: 'a', beats: [{ fala: 'um' }, { rotulo: 'x' }] }));
    fs.writeFileSync(path.join(pasta, 'S3.json'), JSON.stringify({ tela: 2, beats: [{ fala: 'c' }] }));
    fs.writeFileSync(path.join(pasta, 'notas.json'), '{}');
    const { telas, problemas } = lerRoteiro(pasta);
    assert.deepEqual(telas.map((t) => t.tela), [1, 2, 2]);
    assert.ok(problemas.some((p) => p.problema === 'beat 1 sem fala'));
    assert.ok(problemas.some((p) => p.problema === 'tela 2 repetida'));
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('teleprompter embute o roteiro sem permitir fechar o <script>', () => {
  const html = montarTeleprompter([{ tela: 1, titulo: 'Capa', beats: [{ rotulo: 'r', fala: 'Olá </script><b>x</b>', nota: '' }] }], 'Deck <1>');
  assert.equal(html.split('</script>').length - 1, 1);
  assert.ok(html.includes('Deck &lt;1&gt; · teleprompter'));
  assert.ok(html.includes("new BroadcastChannel('estudio-roteiro')"));
  assert.equal(jsonParaScript('a<b'), '"a\\u003cb"');
});

test('espelho: gera cópias iguais, confere, acusa diferença, remove sobra e deixa a skill da pessoa', () => {
  const raiz = temporaria('estudio-espelho-');
  try {
    fs.writeFileSync(path.join(raiz, 'AGENTS.md'), '# agentes\n');
    fs.mkdirSync(path.join(raiz, '.claude', 'skills', 'revisar'), { recursive: true });
    fs.writeFileSync(path.join(raiz, '.claude', 'skills', 'revisar', 'SKILL.md'), 'revisar\n');
    // sobra dentro de uma skill do estúdio: some
    fs.mkdirSync(path.join(raiz, '.agents', 'skills', 'revisar'), { recursive: true });
    fs.writeFileSync(path.join(raiz, '.agents', 'skills', 'revisar', 'velho.md'), 'velho\n');
    // skill da própria pessoa, só em .agents (para o Codex): fica e não reprova a conferência
    fs.mkdirSync(path.join(raiz, '.agents', 'skills', 'minha'), { recursive: true });
    fs.writeFileSync(path.join(raiz, '.agents', 'skills', 'minha', 'SKILL.md'), 'minha\n');
    assert.equal(conferirEspelhos(raiz).ok, false);
    const feito = gerarEspelhos(raiz);
    assert.deepEqual(feito.apagados, ['.agents/skills/revisar/velho.md']);
    assert.equal(fs.existsSync(path.join(raiz, '.agents', 'skills', 'revisar', 'velho.md')), false);
    assert.equal(fs.readFileSync(path.join(raiz, '.agents', 'skills', 'minha', 'SKILL.md'), 'utf8'), 'minha\n');
    assert.equal(conferirEspelhos(raiz).ok, true);
    fs.writeFileSync(path.join(raiz, 'CLAUDE.md'), '# mexido\n');
    const r = conferirEspelhos(raiz);
    assert.equal(r.ok, false);
    assert.equal(r.diferencas[0].arquivo, 'CLAUDE.md');
    const cmd = rodarEstudio(['espelhar', '--conferir'], { ESTUDIO_RAIZ_ESPELHO: raiz });
    assert.equal(cmd.codigo, 2);
    assert.equal(cmd.json.codigo, 'ESPELHO_DIFERENTE');
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
  }
});

test('espelho: limpa pasta vazia só nas skills administradas, sem atravessar link e sem tropeçar em link quebrado', (t) => {
  const raiz = temporaria('estudio-espelho-vazia-');
  const fora = temporaria('estudio-espelho-fora-');
  try {
    fs.writeFileSync(path.join(raiz, 'AGENTS.md'), '# agentes\n');
    fs.mkdirSync(path.join(raiz, '.claude', 'skills', 'revisar'), { recursive: true });
    fs.writeFileSync(path.join(raiz, '.claude', 'skills', 'revisar', 'SKILL.md'), 'revisar\n');
    // sobra numa subpasta de skill administrada: a subpasta vazia some
    fs.mkdirSync(path.join(raiz, '.agents', 'skills', 'revisar', 'velha'), { recursive: true });
    fs.writeFileSync(path.join(raiz, '.agents', 'skills', 'revisar', 'velha', 'x.md'), 'x\n');
    // pasta vazia da pessoa (não administrada): fica
    fs.mkdirSync(path.join(raiz, '.agents', 'skills', 'minha', 'rascunhos'), { recursive: true });
    // pasta de fora, com uma subpasta vazia e um arquivo, alcançável por link
    fs.mkdirSync(path.join(fora, 'vazia'), { recursive: true });
    fs.writeFileSync(path.join(fora, 'guardado.md'), 'meu\n');
    let comLink = true;
    try {
      fs.symlinkSync(fora, path.join(raiz, '.agents', 'skills', 'revisar', 'atalho'), process.platform === 'win32' ? 'junction' : undefined);
      fs.symlinkSync(path.join(raiz, 'nao-existe'), path.join(raiz, '.agents', 'skills', 'quebrado'));
      fs.symlinkSync(path.join(raiz, 'nao-existe'), path.join(raiz, '.agents', 'skills', 'revisar', 'quebrado'));
    } catch {
      comLink = false;
    }
    gerarEspelhos(raiz);
    assert.equal(fs.existsSync(path.join(raiz, '.agents', 'skills', 'revisar', 'velha')), false);
    assert.equal(fs.existsSync(path.join(raiz, '.agents', 'skills', 'minha', 'rascunhos')), true);
    assert.equal(conferirEspelhos(raiz).ok, true);
    if (!comLink) {
      t.diagnostic('esta máquina não deixa criar link simbólico: parte do link pulada');
      return;
    }
    // o que estava do outro lado do link não foi tocado
    assert.equal(fs.existsSync(path.join(fora, 'vazia')), true);
    assert.equal(fs.readFileSync(path.join(fora, 'guardado.md'), 'utf8'), 'meu\n');
    // link quebrado da pessoa fica; sobra (link) dentro da skill administrada sai sem levar o alvo
    assert.equal(fs.lstatSync(path.join(raiz, '.agents', 'skills', 'quebrado')).isSymbolicLink(), true);
    assert.equal(fs.existsSync(path.join(raiz, '.agents', 'skills', 'revisar', 'atalho')), false);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
    fs.rmSync(fora, { recursive: true, force: true });
  }
});

test('o repositório está espelhado (AGENTS.md = CLAUDE.md, .claude/skills = .agents/skills)', (t) => {
  if (!fs.existsSync(path.join(RAIZ, 'AGENTS.md')) || !fs.existsSync(path.join(RAIZ, '.claude', 'skills'))) {
    t.skip('AGENTS.md ou .claude/skills ainda não existem');
    return;
  }
  const r = conferirEspelhos(RAIZ);
  assert.deepEqual(r.diferencas, []);
});

test('versões: comparação numérica e endereço de atualização só do repositório oficial', () => {
  assert.equal(compararVersoes('1.10.0', '1.9.3'), 1);
  assert.equal(compararVersoes('1.0.0', '1.0'), 0);
  assert.equal(compararVersoes('0.9.9', '1.0.0'), -1);
  assert.equal(enderecoAceito('https://github.com/autonom-ia/view-estudio/releases/latest/download/view-estudio.zip'), true);
  for (const ruim of ['https://github.com/outra/view-estudio/x.zip', 'https://github.com/autonom-ia/view-estudio/../x.zip',
    'https://x@github.com/autonom-ia/view-estudio/a.zip', 'http://github.com/autonom-ia/view-estudio/a.zip']) {
    assert.equal(enderecoAceito(ruim), false, ruim);
  }
});

test('lerEnv lê CHAVE=VALOR e ignora comentário', () => {
  const pasta = temporaria('estudio-env-');
  try {
    const arq = path.join(pasta, 'v.env');
    fs.writeFileSync(arq, '# comentario\nA=1\n\nURL=https://x/y?a=b\n');
    assert.deepEqual(lerEnv(arq), { A: '1', URL: 'https://x/y?a=b' });
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('cena: o motor usa o mesmo navegador do acharNavegador (navegador.txt primeiro), mesmo sem o ambiente.sh', async () => {
  const { ambienteHyperframes } = await import('../scripts/lib/hyperframes.mjs');
  const ferr = temporaria('estudio-hf-nav-');
  try {
    const nomeShell = process.platform === 'win32' ? 'chrome-headless-shell.exe' : 'chrome-headless-shell';
    // um shell que o procurarShell acharia sozinho, e outro gravado pelo instalador em navegador.txt
    const achavel = path.join(ferr, 'navegador', 'chrome-headless-shell', 'v1', nomeShell);
    const gravado = path.join(ferr, 'outro-lugar', nomeShell);
    for (const a of [achavel, gravado]) {
      fs.mkdirSync(path.dirname(a), { recursive: true });
      fs.writeFileSync(a, '');
    }
    fs.writeFileSync(path.join(ferr, 'navegador.txt'), `${gravado}\n`);
    fs.writeFileSync(path.join(ferr, 'instalacao.json'), '{}');
    const semNada = { PATH: process.env.PATH || '' };
    assert.equal(ambienteHyperframes(semNada, ferr).HYPERFRAMES_BROWSER_PATH, gravado);
    // quem a pessoa escolheu (ESTUDIO_CHROME) manda
    assert.equal(ambienteHyperframes({ ...semNada, ESTUDIO_CHROME: achavel }, ferr).HYPERFRAMES_BROWSER_PATH, achavel);
    // e um HYPERFRAMES_BROWSER_PATH já definido não é trocado
    assert.equal(ambienteHyperframes({ ...semNada, HYPERFRAMES_BROWSER_PATH: achavel }, ferr).HYPERFRAMES_BROWSER_PATH, achavel);
    // sem navegador.txt (e sem o shell gravado), cai no shell achado na pasta
    fs.rmSync(path.join(ferr, 'navegador.txt'));
    fs.rmSync(gravado);
    assert.equal(ambienteHyperframes(semNada, ferr).HYPERFRAMES_BROWSER_PATH, achavel);
  } finally {
    fs.rmSync(ferr, { recursive: true, force: true });
  }
});

test('cena: render que falha ou sai vazio mantém o vídeo anterior; render bom troca', async () => {
  const { renderizarSemPerderOAnterior } = await import('../scripts/lib/hyperframes.mjs');
  const pasta = temporaria('estudio-cena-troca-');
  try {
    const saida = path.join(pasta, 'abertura.mp4');
    fs.writeFileSync(saida, 'video antigo');
    const temporarios = [];
    // falha do motor depois de escrever metade
    const falhou = await renderizarSemPerderOAnterior(saida, async (tmp) => {
      temporarios.push(tmp);
      fs.writeFileSync(tmp, 'meio');
      return { codigo: 1, saida: '', erro: 'quebrou' };
    });
    assert.equal(falhou.ok, false);
    assert.equal(fs.readFileSync(saida, 'utf8'), 'video antigo');
    // código 0 mas arquivo vazio
    const vazio = await renderizarSemPerderOAnterior(saida, async (tmp) => {
      fs.writeFileSync(tmp, '');
      return { codigo: 0, saida: '', erro: '' };
    });
    assert.equal(vazio.ok, false);
    assert.equal(fs.readFileSync(saida, 'utf8'), 'video antigo');
    // código 0 sem arquivo nenhum
    assert.equal((await renderizarSemPerderOAnterior(saida, async () => ({ codigo: 0 }))).ok, false);
    // o motor lança: o erro sobe e o anterior fica
    await assert.rejects(renderizarSemPerderOAnterior(saida, async (tmp) => {
      fs.writeFileSync(tmp, 'x');
      throw new Error('sem motor');
    }), (e) => e.message === 'sem motor');
    assert.equal(fs.readFileSync(saida, 'utf8'), 'video antigo');
    // render bom: troca
    const bom = await renderizarSemPerderOAnterior(saida, async (tmp) => {
      fs.writeFileSync(tmp, 'video novo');
      return { codigo: 0, saida: '', erro: '' };
    });
    assert.equal(bom.ok, true);
    assert.equal(fs.readFileSync(saida, 'utf8'), 'video novo');
    // o temporário fica ao lado, com outro nome, e nada sobra na pasta
    assert.equal(path.dirname(temporarios[0]), pasta);
    assert.notEqual(temporarios[0], saida);
    assert.deepEqual(fs.readdirSync(pasta), ['abertura.mp4']);
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('espelho: nunca escreve nem apaga através de link (pasta pessoal fica intocada)', () => {
  const raiz = temporaria('estudio-espelho-link-');
  const pessoal = temporaria('estudio-pessoal-');
  try {
    fs.writeFileSync(path.join(raiz, 'AGENTS.md'), '# agentes\n');
    fs.mkdirSync(path.join(raiz, '.claude', 'skills', 'revisar', 'ref'), { recursive: true });
    fs.writeFileSync(path.join(raiz, '.claude', 'skills', 'revisar', 'SKILL.md'), 'oficial\n');
    fs.writeFileSync(path.join(raiz, '.claude', 'skills', 'revisar', 'ref', 'a.md'), 'a\n');
    fs.writeFileSync(path.join(pessoal, 'SKILL.md'), 'minha\n');
    fs.writeFileSync(path.join(pessoal, 'nota.md'), 'nota\n');
    fs.mkdirSync(path.join(raiz, '.agents', 'skills'), { recursive: true });
    // a pasta da skill do estúdio virou link para uma pasta da pessoa
    fs.symlinkSync(pessoal, path.join(raiz, '.agents', 'skills', 'revisar'), 'dir');
    assert.equal(conferirEspelhos(raiz).ok, false);
    gerarEspelhos(raiz);
    assert.equal(fs.readFileSync(path.join(pessoal, 'SKILL.md'), 'utf8'), 'minha\n');
    assert.equal(fs.readFileSync(path.join(pessoal, 'nota.md'), 'utf8'), 'nota\n');
    assert.equal(fs.lstatSync(path.join(raiz, '.agents', 'skills', 'revisar')).isSymbolicLink(), false);
    assert.equal(fs.readFileSync(path.join(raiz, '.agents', 'skills', 'revisar', 'SKILL.md'), 'utf8'), 'oficial\n');
    assert.equal(conferirEspelhos(raiz).ok, true);
    // subpasta virou link: mesma regra
    fs.rmSync(path.join(raiz, '.agents', 'skills', 'revisar', 'ref'), { recursive: true });
    fs.symlinkSync(pessoal, path.join(raiz, '.agents', 'skills', 'revisar', 'ref'), 'dir');
    gerarEspelhos(raiz);
    assert.deepEqual(fs.readdirSync(pessoal).sort(), ['SKILL.md', 'nota.md']);
    assert.equal(conferirEspelhos(raiz).ok, true);
    // .agents/skills inteira como link: recusa
    fs.rmSync(path.join(raiz, '.agents', 'skills'), { recursive: true });
    fs.symlinkSync(pessoal, path.join(raiz, '.agents', 'skills'), 'dir');
    assert.throws(() => gerarEspelhos(raiz));
    assert.deepEqual(fs.readdirSync(pessoal).sort(), ['SKILL.md', 'nota.md']);
  } finally {
    fs.rmSync(raiz, { recursive: true, force: true });
    fs.rmSync(pessoal, { recursive: true, force: true });
  }
});

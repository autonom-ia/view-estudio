// Atualização: endereço oficial sem atalhos, redirecionamento conferido, nomes que colidem em
// disco sem maiúsculas, links simbólicos no zip, VERSAO por último, itens que sumiram e skills
// da pessoa.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  aplicarVersao,
  atualizarEstudio,
  baixar,
  enderecoAceito,
  destinoDeDownloadAceito,
  dependenciasQueMudaram,
  recusarLinks,
  conferirNomesDeTopo,
  NOME_TRAVA,
} from '../scripts/lib/atualizacao.mjs';
import { copiarPasta } from '../scripts/lib/caminhos.mjs';

const temporaria = (prefixo) => fs.mkdtempSync(path.join(os.tmpdir(), prefixo));
const escrever = (arq, texto) => {
  fs.mkdirSync(path.dirname(arq), { recursive: true });
  fs.writeFileSync(arq, texto);
};
const ler = (...partes) => fs.readFileSync(path.join(...partes), 'utf8');

function montarEstudio(raiz, versao, extra = {}) {
  escrever(path.join(raiz, 'VERSAO'), `${versao}\n`);
  escrever(path.join(raiz, 'kit', 'scripts', 'a.mjs'), `// ${versao}\n`);
  escrever(path.join(raiz, 'package.json'), '{"name":"x"}\n');
  for (const [arq, texto] of Object.entries(extra)) escrever(path.join(raiz, ...arq.split('/')), texto);
}

// Links simbólicos: no Windows pedem privilégio; sem ele, o teste pula.
function podeCriarLink(base) {
  try {
    fs.symlinkSync(base, path.join(base, 'teste-link'));
    fs.rmSync(path.join(base, 'teste-link'));
    return true;
  } catch {
    return false;
  }
}

test('enderecoAceito: só https://github.com/autonom-ia/view-estudio/releases/…, sem atalhos', () => {
  const ok = 'https://github.com/autonom-ia/view-estudio/releases/latest/download/view-estudio.zip';
  assert.equal(enderecoAceito(ok), true);
  assert.equal(enderecoAceito('https://github.com/autonom-ia/view-estudio/releases/download/v1.0.1/view-estudio.zip'), true);
  const ataques = [
    'https://github.com/autonom-ia/view-estudio/%2e%2e/%2e%2e/outra-org/x/releases/latest/download/view-estudio.zip',
    'https://github.com/autonom-ia/view-estudio/releases/%2e%2e/%2e%2e/%2e%2e/outra-org/x/releases/a.zip',
    'https://github.com/autonom-ia/view-estudio/releases/../../../outra-org/x/releases/a.zip',
    'https://github.com/autonom-ia/view-estudio/../outra/releases/a.zip',
    'http://github.com/autonom-ia/view-estudio/releases/latest/download/view-estudio.zip',
    'https://github.com:8443/autonom-ia/view-estudio/releases/latest/download/view-estudio.zip',
    'https://alguem:senha@github.com/autonom-ia/view-estudio/releases/latest/download/view-estudio.zip',
    'https://github.com.exemplo.net/autonom-ia/view-estudio/releases/latest/download/view-estudio.zip',
    'https://github.com/autonom-ia/view-estudio-falso/releases/latest/download/view-estudio.zip',
    'https://github.com/autonom-ia/view-estudio/archive/main.zip',
    'https://github.com\\autonom-ia/view-estudio/releases/a.zip',
    'file:///tmp/view-estudio.zip',
    '',
    null,
  ];
  for (const a of ataques) assert.equal(enderecoAceito(a), false, String(a));
});

test('destinoDeDownloadAceito: só os hosts do GitHub que servem releases', () => {
  assert.equal(destinoDeDownloadAceito('https://objects.githubusercontent.com/x/y.zip'), true);
  assert.equal(destinoDeDownloadAceito('https://release-assets.githubusercontent.com/x'), true);
  assert.equal(destinoDeDownloadAceito('https://github.com/autonom-ia/view-estudio/releases/download/v1/x.zip'), true);
  assert.equal(destinoDeDownloadAceito('http://objects.githubusercontent.com/x'), false);
  assert.equal(destinoDeDownloadAceito('https://exemplo.net/x.zip'), false);
  assert.equal(destinoDeDownloadAceito('https://u:p@objects.githubusercontent.com/x'), false);
  assert.equal(destinoDeDownloadAceito('https://objects.githubusercontent.com:444/x'), false);
});

// fetch de mentira: cada URL devolve um redirecionamento ou um corpo.
function falsoFetch(mapa, vistos) {
  return async (url, init) => {
    vistos.push({ url, redirect: init && init.redirect });
    const r = mapa[url];
    if (!r) return new Response('nada', { status: 404 });
    if (r.para) return new Response(null, { status: 302, headers: { location: r.para } });
    return new Response(r.corpo, { status: 200 });
  };
}

test('baixar segue redirecionamento só para hosts aceitos, à mão e no máximo 5 vezes', async () => {
  const base = temporaria('estudio-baixar-');
  try {
    const destino = path.join(base, 'x.zip');
    const inicio = 'https://github.com/autonom-ia/view-estudio/releases/latest/download/view-estudio.zip';
    const vistos = [];
    const final = await baixar(inicio, destino, falsoFetch({
      [inicio]: { para: 'https://github.com/autonom-ia/view-estudio/releases/download/v1.0.1/view-estudio.zip' },
      'https://github.com/autonom-ia/view-estudio/releases/download/v1.0.1/view-estudio.zip': { para: 'https://release-assets.githubusercontent.com/abc?x=1' },
      'https://release-assets.githubusercontent.com/abc?x=1': { corpo: 'ZIP' },
    }, vistos));
    assert.equal(ler(destino), 'ZIP');
    assert.equal(final, 'https://release-assets.githubusercontent.com/abc?x=1');
    assert.ok(vistos.every((v) => v.redirect === 'manual'));

    await assert.rejects(
      baixar(inicio, destino, falsoFetch({ [inicio]: { para: 'https://exemplo.net/mal.zip' } }, [])),
      (e) => e.codigo === 'ATUALIZACAO_ENDERECO_ESTRANHO',
    );
    await assert.rejects(
      baixar(inicio, destino, falsoFetch({ [inicio]: { para: 'http://objects.githubusercontent.com/x' } }, [])),
      (e) => e.codigo === 'ATUALIZACAO_ENDERECO_ESTRANHO',
    );
    const laco = { [inicio]: { para: 'https://objects.githubusercontent.com/1' } };
    for (let k = 1; k <= 10; k += 1) laco[`https://objects.githubusercontent.com/${k}`] = { para: `https://objects.githubusercontent.com/${k + 1}` };
    const vistosLaco = [];
    await assert.rejects(baixar(inicio, destino, falsoFetch(laco, vistosLaco)), (e) => e.codigo === 'ATUALIZACAO_DOWNLOAD_FALHOU');
    assert.equal(vistosLaco.length, 6);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('atualizarEstudio recusa endereço com %2e%2e antes de baixar qualquer coisa', async () => {
  const vistos = [];
  await assert.rejects(
    atualizarEstudio({
      raiz: os.tmpdir(),
      ferr: os.tmpdir(),
      origem: 'https://github.com/autonom-ia/view-estudio/%2e%2e/%2e%2e/outra-org/x/releases/latest/download/view-estudio.zip',
      buscar: falsoFetch({}, vistos),
    }),
    (e) => e.codigo === 'ATUALIZACAO_ENDERECO_ESTRANHO',
  );
  assert.equal(vistos.length, 0);
});

test('aplicarVersao recusa item de topo que colide com pasta preservada sem ser idêntico', () => {
  const base = temporaria('estudio-colide-');
  try {
    for (const intruso of ['APRESENTACOES', 'Minha-Marca', 'REFERENCIAS', '.Ferramentas', 'Node_Modules']) {
      const raiz = path.join(base, `estudio-${intruso}`);
      const nova = path.join(base, `nova-${intruso}`);
      montarEstudio(raiz, '1.0.0', { 'apresentacoes/meu/brief.md': 'meu', 'minha-marca/tokens.css': 'minha' });
      montarEstudio(nova, '1.1.0', { [`${intruso}/x.txt`]: 'do zip' });
      const ferr = path.join(raiz, '.ferramentas');
      assert.throws(() => aplicarVersao(raiz, nova, ferr), (e) => e.codigo === 'ATUALIZACAO_ARQUIVO_DIFERENTE', intruso);
      assert.equal(ler(raiz, 'VERSAO').trim(), '1.0.0');
      assert.equal(ler(raiz, 'apresentacoes', 'meu', 'brief.md'), 'meu');
      assert.equal(ler(raiz, 'minha-marca', 'tokens.css'), 'minha');
      assert.equal(fs.existsSync(ferr) ? fs.readdirSync(ferr).length : 0, 0);
    }
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('conferirNomesDeTopo: preservado idêntico passa; variação de maiúscula, VERSAO trocada ou par repetido recusa', () => {
  conferirNomesDeTopo(['VERSAO', 'kit', 'apresentacoes', 'minha-marca', '.claude']);
  const recusa = (nomes) => assert.throws(() => conferirNomesDeTopo(nomes), (e) => e.codigo === 'ATUALIZACAO_ARQUIVO_DIFERENTE', nomes.join(','));
  recusa(['VERSAO', 'Apresentacoes']);
  recusa(['VERSAO', 'MINHA-MARCA']);
  recusa(['VERSAO', 'versao']);
  recusa(['Versao']);
  recusa(['VERSAO', 'Kit', 'kit']);
  recusa(['VERSAO', 'REFERENCIAS']);
});

test('recusarLinks acha link simbólico em qualquer nível da árvore extraída', (t) => {
  const base = temporaria('estudio-links-');
  try {
    if (!podeCriarLink(base)) {
      t.skip('esta máquina não deixa criar link simbólico');
      return;
    }
    const raiz = path.join(base, 'novo', 'view-estudio');
    montarEstudio(raiz, '1.0.1');
    recusarLinks(path.join(base, 'novo'));
    fs.symlinkSync(os.homedir(), path.join(raiz, 'kit', 'casa'));
    assert.throws(() => recusarLinks(path.join(base, 'novo')), (e) => e.codigo === 'ATUALIZACAO_ARQUIVO_DIFERENTE' && e.dados.arquivo === 'view-estudio/kit/casa');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('copiarPasta não segue link simbólico: erro por padrão, link recriado se pedido', (t) => {
  const base = temporaria('estudio-copiar-');
  try {
    if (!podeCriarLink(base)) {
      t.skip('esta máquina não deixa criar link simbólico');
      return;
    }
    const fora = path.join(base, 'fora');
    escrever(path.join(fora, 'segredo.txt'), 'segredo');
    const origem = path.join(base, 'origem');
    escrever(path.join(origem, 'a.txt'), 'a');
    fs.symlinkSync(fora, path.join(origem, 'atalho'));
    assert.throws(() => copiarPasta(origem, path.join(base, 'destino')), (e) => e.code === 'ESTUDIO_LINK');
    copiarPasta(origem, path.join(base, 'destino2'), { links: 'recriar' });
    assert.equal(fs.lstatSync(path.join(base, 'destino2', 'atalho')).isSymbolicLink(), true);
    assert.equal(fs.readlinkSync(path.join(base, 'destino2', 'atalho')), fora);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

function criarZip(pasta, zip) {
  const tar = spawnSync('tar', ['-a', '-cf', zip, '-C', path.dirname(pasta), path.basename(pasta)]);
  if (tar.status === 0 && fs.existsSync(zip) && fs.readFileSync(zip).subarray(0, 2).toString('latin1') === 'PK') return true;
  fs.rmSync(zip, { force: true });
  const z = spawnSync('zip', ['-qry', zip, path.basename(pasta)], { cwd: path.dirname(pasta) });
  return z.status === 0 && fs.existsSync(zip);
}

test('atualizarEstudio recusa zip que traz link simbólico e não troca nada', async (t) => {
  const base = temporaria('estudio-zip-link-');
  try {
    if (!podeCriarLink(base)) {
      t.skip('esta máquina não deixa criar link simbólico');
      return;
    }
    const raiz = path.join(base, 'estudio');
    montarEstudio(raiz, '1.0.0');
    const pacote = path.join(base, 'pacote', 'view-estudio');
    montarEstudio(pacote, '1.0.1');
    fs.symlinkSync(os.homedir(), path.join(pacote, 'kit', 'casa'));
    const zip = path.join(base, 'view-estudio.zip');
    if (!criarZip(pacote, zip)) {
      t.skip('sem ferramenta para criar zip nesta máquina');
      return;
    }
    const hash = crypto.createHash('sha256').update(fs.readFileSync(zip)).digest('hex');
    fs.writeFileSync(`${zip}.sha256`, `${hash}  view-estudio.zip\n`);
    const ferr = path.join(raiz, '.ferramentas');
    await assert.rejects(atualizarEstudio({ raiz, ferr, origem: zip }), (e) => e.codigo === 'ATUALIZACAO_ARQUIVO_DIFERENTE');
    assert.equal(ler(raiz, 'VERSAO').trim(), '1.0.0');
    assert.equal(fs.existsSync(path.join(raiz, 'kit', 'casa')), false);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('aplicarVersao: falha ao devolver as permissões locais volta tudo e a VERSAO não muda', () => {
  const base = temporaria('estudio-fim-');
  try {
    const raiz = path.join(base, 'estudio');
    const nova = path.join(base, 'nova');
    montarEstudio(raiz, '1.0.0', { '.claude/settings.local.json': '{"local":true}', '.claude/settings.json': '{"v":1}' });
    montarEstudio(nova, '2.0.0', { '.claude/settings.json': '{"v":2}' });
    const ferr = path.join(raiz, '.ferramentas');
    assert.throws(
      () => aplicarVersao(raiz, nova, ferr, { antesDaVersao: () => { throw new Error('falha simulada no fim'); } }),
      (e) => e.codigo === 'ATUALIZACAO_FALHOU',
    );
    assert.equal(ler(raiz, 'VERSAO').trim(), '1.0.0');
    assert.equal(ler(raiz, 'kit', 'scripts', 'a.mjs'), '// 1.0.0\n');
    assert.equal(ler(raiz, '.claude', 'settings.json'), '{"v":1}');
    assert.equal(ler(raiz, '.claude', 'settings.local.json'), '{"local":true}');
    assert.deepEqual(fs.readdirSync(ferr).filter((n) => n.startsWith('versao-anterior-')), []);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('aplicarVersao: settings.local.json ilegível derruba a troca inteira antes da VERSAO', (t) => {
  if (process.platform === 'win32' || (process.getuid && process.getuid() === 0)) {
    t.skip('sem como negar leitura de arquivo aqui (Windows ou root)');
    return;
  }
  const base = temporaria('estudio-local-');
  const local = path.join(base, 'estudio', '.claude', 'settings.local.json');
  try {
    const raiz = path.join(base, 'estudio');
    const nova = path.join(base, 'nova');
    montarEstudio(raiz, '1.0.0', { '.claude/settings.local.json': '{"local":true}' });
    montarEstudio(nova, '2.0.0', { '.claude/settings.json': '{"v":2}' });
    fs.chmodSync(local, 0o000);
    const ferr = path.join(raiz, '.ferramentas');
    assert.throws(() => aplicarVersao(raiz, nova, ferr), (e) => e.codigo === 'ATUALIZACAO_FALHOU' && e.dados.arquivo === '.claude/settings.local.json');
    assert.equal(ler(raiz, 'VERSAO').trim(), '1.0.0');
    assert.equal(ler(raiz, 'kit', 'scripts', 'a.mjs'), '// 1.0.0\n');
    assert.equal(fs.existsSync(local), true);
  } finally {
    try { fs.chmodSync(local, 0o644); } catch {}
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('aplicarVersao guarda na cópia anterior o item de topo que a versão nova apagou (e devolve na falha)', () => {
  const base = temporaria('estudio-sumiu-');
  try {
    const raiz = path.join(base, 'estudio');
    const nova = path.join(base, 'nova');
    montarEstudio(raiz, '1.0.0', { 'velho.md': 'saiu na versão nova', 'pasta-velha/x.txt': 'x', '.DS_Store': 'lixo' });
    montarEstudio(nova, '1.1.0');
    const ferr = path.join(raiz, '.ferramentas');
    // falha no fim: os sumidos voltam
    assert.throws(() => aplicarVersao(raiz, nova, ferr, { antesDaVersao: () => { throw new Error('x'); } }), (e) => e.codigo === 'ATUALIZACAO_FALHOU');
    assert.equal(ler(raiz, 'velho.md'), 'saiu na versão nova');
    assert.equal(ler(raiz, 'pasta-velha', 'x.txt'), 'x');
    // sem falha: vão para a cópia anterior
    const r = aplicarVersao(raiz, nova, ferr);
    assert.deepEqual([...r.sumidos].sort(), ['pasta-velha', 'velho.md']);
    assert.equal(fs.existsSync(path.join(raiz, 'velho.md')), false);
    assert.equal(fs.existsSync(path.join(raiz, 'pasta-velha')), false);
    assert.equal(ler(r.copia, 'velho.md'), 'saiu na versão nova');
    assert.equal(ler(r.copia, 'pasta-velha', 'x.txt'), 'x');
    assert.equal(fs.existsSync(path.join(raiz, '.DS_Store')), true);
    assert.equal(fs.existsSync(path.join(raiz, '.ferramentas')), true);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('aplicarVersao recoloca as skills da pessoa em .claude/skills e .agents/skills', (t) => {
  const base = temporaria('estudio-skills-');
  try {
    const raiz = path.join(base, 'estudio');
    const nova = path.join(base, 'nova');
    montarEstudio(raiz, '1.0.0', {
      '.claude/skills/revisar/SKILL.md': 'revisar velho',
      '.claude/skills/minha-skill/SKILL.md': 'minha',
      '.claude/skills/hyperframes-cli/SKILL.md': 'hf',
      '.agents/skills/revisar/SKILL.md': 'revisar velho',
      '.agents/skills/minha-skill/SKILL.md': 'minha',
    });
    montarEstudio(nova, '1.1.0', {
      '.claude/skills/revisar/SKILL.md': 'revisar novo',
      '.agents/skills/revisar/SKILL.md': 'revisar novo',
    });
    const comLink = podeCriarLink(base);
    if (comLink) fs.symlinkSync(path.join(raiz, '.agents', 'skills', 'minha-skill'), path.join(raiz, '.claude', 'skills', 'ligada'));
    const ferr = path.join(raiz, '.ferramentas');
    const r = aplicarVersao(raiz, nova, ferr);
    assert.equal(ler(raiz, '.claude', 'skills', 'revisar', 'SKILL.md'), 'revisar novo');
    assert.equal(ler(raiz, '.agents', 'skills', 'revisar', 'SKILL.md'), 'revisar novo');
    assert.equal(ler(raiz, '.claude', 'skills', 'minha-skill', 'SKILL.md'), 'minha');
    assert.equal(ler(raiz, '.claude', 'skills', 'hyperframes-cli', 'SKILL.md'), 'hf');
    assert.equal(ler(raiz, '.agents', 'skills', 'minha-skill', 'SKILL.md'), 'minha');
    assert.ok(r.recolocadas.includes('.claude/skills/minha-skill'));
    // a cópia anterior continua inteira
    assert.equal(ler(r.copia, '.claude', 'skills', 'minha-skill', 'SKILL.md'), 'minha');
    if (comLink) assert.equal(fs.lstatSync(path.join(raiz, '.claude', 'skills', 'ligada')).isSymbolicLink(), true);
    else t.diagnostic('sem link simbólico nesta máquina: parte do link pulada');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('dependenciasQueMudaram olha pacotes e instalar/versoes.env', () => {
  const base = temporaria('estudio-deps-');
  try {
    const raiz = path.join(base, 'a');
    const nova = path.join(base, 'b');
    montarEstudio(raiz, '1.0.0', { 'instalar/versoes.env': 'NODE_VERSAO=24.0.0\n', 'package-lock.json': '{}' });
    montarEstudio(nova, '1.1.0', { 'instalar/versoes.env': 'NODE_VERSAO=24.0.0\n', 'package-lock.json': '{}' });
    assert.deepEqual(dependenciasQueMudaram(raiz, nova), []);
    escrever(path.join(nova, 'instalar', 'versoes.env'), 'NODE_VERSAO=24.1.0\n');
    assert.deepEqual(dependenciasQueMudaram(raiz, nova), ['versoes']);
    escrever(path.join(nova, 'package-lock.json'), '{"x":1}');
    assert.deepEqual(dependenciasQueMudaram(raiz, nova), ['pacotes', 'versoes']);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('a mensagem DEPENDENCIAS_MUDARAM manda rodar o instalador de novo', () => {
  const m = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '..', 'mensagens.json'), 'utf8')).DEPENDENCIAS_MUDARAM;
  assert.ok(m.acao.includes('instalador de novo'));
  assert.ok(m.acao.includes('instalar-estudio'));
});

test('duas atualizações ao mesmo tempo: a segunda sai com ATUALIZACAO_EM_ANDAMENTO e a trava é solta no fim', async () => {
  const base = temporaria('estudio-trava-atualizar-');
  try {
    const raiz = path.join(base, 'estudio');
    montarEstudio(raiz, '1.0.0');
    const ferr = path.join(raiz, '.ferramentas');
    const origem = 'https://github.com/autonom-ia/view-estudio/releases/latest/download/view-estudio.zip';
    let liberar;
    const segura = new Promise((r) => { liberar = r; });
    // a primeira fica parada no download até o teste liberar; então o download falha
    const buscar = async () => {
      await segura;
      return { status: 404, ok: false, headers: new Headers() };
    };
    const primeira = atualizarEstudio({ raiz, ferr, origem, buscar });
    await assert.rejects(atualizarEstudio({ raiz, ferr, origem, buscar }), (e) => e.codigo === 'ATUALIZACAO_EM_ANDAMENTO');
    assert.equal(JSON.parse(ler(ferr, NOME_TRAVA)).pid, process.pid);
    liberar();
    await assert.rejects(primeira, (e) => e.codigo === 'ATUALIZACAO_DOWNLOAD_FALHOU');
    assert.equal(fs.existsSync(path.join(ferr, NOME_TRAVA)), false);
    assert.equal(ler(raiz, 'VERSAO').trim(), '1.0.0');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('atualização: trava de um processo que já morreu é tomada; de um vivo, não', async () => {
  const base = temporaria('estudio-trava-velha-');
  const morto = spawnSync(process.execPath, ['-e', '']);
  try {
    const raiz = path.join(base, 'estudio');
    montarEstudio(raiz, '1.0.0');
    const ferr = path.join(raiz, '.ferramentas');
    fs.mkdirSync(ferr, { recursive: true });
    const origem = 'https://github.com/autonom-ia/view-estudio/releases/latest/download/view-estudio.zip';
    const buscar = async () => ({ status: 404, ok: false, headers: new Headers() });
    // morto: a atualização segue (e falha no download, não na trava)
    fs.writeFileSync(path.join(ferr, NOME_TRAVA), JSON.stringify({ pid: morto.pid }));
    await assert.rejects(atualizarEstudio({ raiz, ferr, origem, buscar }), (e) => e.codigo === 'ATUALIZACAO_DOWNLOAD_FALHOU');
    // vivo (o pai deste teste): não toma
    fs.writeFileSync(path.join(ferr, NOME_TRAVA), JSON.stringify({ pid: process.ppid }));
    await assert.rejects(atualizarEstudio({ raiz, ferr, origem, buscar }), (e) => e.codigo === 'ATUALIZACAO_EM_ANDAMENTO' && e.dados.pid === process.ppid);
    assert.equal(JSON.parse(ler(ferr, NOME_TRAVA)).pid, process.ppid);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('aplicarVersao: cada troca tem a sua cópia anterior, mesmo duas no mesmo segundo', () => {
  const base = temporaria('estudio-copia-unica-');
  try {
    const raiz = path.join(base, 'estudio');
    const ferr = path.join(raiz, '.ferramentas');
    montarEstudio(raiz, '1.0.0');
    const v2 = path.join(base, 'v2');
    const v3 = path.join(base, 'v3');
    montarEstudio(v2, '2.0.0');
    montarEstudio(v3, '3.0.0');
    const a = aplicarVersao(raiz, v2, ferr);
    const b = aplicarVersao(raiz, v3, ferr);
    assert.notEqual(a.copia, b.copia);
    assert.ok(path.basename(a.copia).startsWith('versao-anterior-'));
    assert.equal(ler(a.copia, 'VERSAO').trim(), '1.0.0');
    assert.equal(ler(b.copia, 'VERSAO').trim(), '2.0.0');
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

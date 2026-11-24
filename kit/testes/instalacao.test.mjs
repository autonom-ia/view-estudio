// Instalação numa entrada só: a ação "tudo" no Mac e no Windows, liberada nas permissões do
// estúdio, e o I-01 sem pergunta (a caixinha do "tudo" é o sim da pessoa). Sem rede.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, ...rel.split('/')), 'utf8');
const lerJson = (rel) => JSON.parse(ler(rel));

test('instalação numa entrada só: "tudo" no Mac e no Windows, liberado nas permissões do estúdio', () => {
  const sh = ler('instalar/instalar.sh');
  assert.ok(sh.includes('  tudo) acao_tudo ;;'));
  assert.ok(sh.includes('"acoes":["tudo",'));
  const ps1 = ler('instalar/instalar.ps1');
  assert.ok(ps1.includes("'tudo' { Invoke-AcaoTudo }"));
  assert.ok(ps1.includes("acoes = @('tudo',"));
  const permitidos = lerJson('.claude/settings.json').permissions.allow;
  for (const p of [
    'Bash(bash instalar/instalar.sh tudo:*)',
    'Bash(bash instalar/instalar.sh verificar:*)',
    'Bash(powershell.exe -NoProfile -ExecutionPolicy Bypass -File instalar/instalar.ps1 tudo:*)',
    'PowerShell(powershell.exe -NoProfile -ExecutionPolicy Bypass -File instalar/instalar.ps1 tudo *)',
    'Bash(./estudio:*)',
    'Write(./apresentacoes/**)',
  ]) {
    assert.ok(permitidos.includes(p), p);
  }
  // o que apaga ou move fica pedindo licença
  for (const p of permitidos) for (const perigo of ['desinstalar', 'mudar-pasta', 'rm ']) assert.equal(p.includes(perigo), false, p);
  // o I-01 não é pergunta: a caixinha do "tudo" é o sim da pessoa
  const i01 = lerJson('instalar/mensagens.json').textos['I-01'];
  assert.equal(i01.opcoes, undefined);
  assert.ok(i01.depois.includes('"tudo"'));
  const skill = ler('.claude/skills/instalar-estudio/SKILL.md');
  assert.ok(skill.includes('rode `tudo`'));
});

test('"tudo": o ffmpeg é opcional e não para a instalação; os obrigatórios param', () => {
  const sh = ler('instalar/instalar.sh');
  const tudo = sh.slice(sh.indexOf('acao_tudo() {'), sh.indexOf('# ---------------------------------------------------------------- despacho'));
  assert.ok(tudo.includes('[ "$(obrigatorio "$id")" = "true" ]'), 'o sh só sai no meio por passo obrigatório');
  const ps1 = ler('instalar/instalar.ps1');
  const tudoPs = ps1.slice(ps1.indexOf('function Invoke-AcaoTudo'), ps1.indexOf('# ---------------------------------------------------------------- despacho'));
  assert.ok(tudoPs.includes('(Test-Obrigatorio $id)'), 'o ps1 só sai no meio por passo obrigatório');
  // e a skill sabe o que dizer quando só o ffmpeg ficou de fora
  assert.ok(ler('.claude/skills/instalar-estudio/SKILL.md').includes('`I-15-so-ffmpeg`'));
  assert.ok(lerJson('instalar/mensagens.json').textos['I-15-so-ffmpeg']);
});

test('instalação: o "tudo" roda com o tempo máximo da ferramenta, nunca com os 2 minutos padrão', () => {
  for (const arquivo of ['.claude/skills/instalar-estudio/SKILL.md', 'instalar/comandos-unicos.md', 'README.md']) {
    assert.ok(ler(arquivo).includes('`timeout: 600000`'), arquivo);
  }
  assert.ok(ler('.claude/skills/instalar-estudio/SKILL.md').includes('`run_in_background: true`'));
});

test('instalador do Mac: ação desconhecida lista "tudo" (sem rede, sem instalar nada)', { skip: process.platform !== 'darwin' }, () => {
  assert.equal(spawnSync('bash', ['-n', path.join(RAIZ, 'instalar', 'instalar.sh')]).status, 0);
  const r = spawnSync('bash', [path.join(RAIZ, 'instalar', 'instalar.sh'), 'nao-existe'], { encoding: 'utf8' });
  const ultima = JSON.parse(r.stdout.trim().split('\n').pop());
  assert.equal(r.status, 1);
  assert.equal(ultima.codigo, 'ACAO_DESCONHECIDA');
  assert.equal(ultima.dados.acoes[0], 'tudo');
});

// Ferramentas de verdade deste computador, sem o FFmpeg: uma pasta temporária com links para o Node
// e o mesmo navegador.txt. Só roda no Mac com o estúdio instalado (não baixa nada).
const FERR_REAL = path.join(RAIZ, '.ferramentas');
const temInstalado = process.platform === 'darwin' && fs.existsSync(path.join(FERR_REAL, 'node', 'bin', 'node')) && fs.existsSync(path.join(FERR_REAL, 'navegador.txt')) && fs.existsSync(path.join(RAIZ, 'node_modules'));

function verificarCom(montar) {
  const ferr = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-verificar-'));
  try {
    fs.symlinkSync(path.join(FERR_REAL, 'node'), path.join(ferr, 'node'));
    montar(ferr);
    const r = spawnSync('bash', [path.join(RAIZ, 'instalar', 'instalar.sh'), 'verificar'], { encoding: 'utf8', env: { ...process.env, ESTUDIO_FERRAMENTAS: ferr }, timeout: 120000 });
    return { status: r.status, json: JSON.parse(r.stdout.trim().split('\n').pop()) };
  } finally {
    fs.rmSync(ferr, { recursive: true, force: true });
  }
}

test('verificar: só o FFmpeg faltando fica ok (o item sai opcional); obrigatório faltando reprova', { skip: !temInstalado && 'sem o estúdio instalado neste Mac' }, () => {
  const semFfmpeg = verificarCom((ferr) => fs.copyFileSync(path.join(FERR_REAL, 'navegador.txt'), path.join(ferr, 'navegador.txt')));
  assert.equal(semFfmpeg.status, 0, JSON.stringify(semFfmpeg.json));
  assert.equal(semFfmpeg.json.ok, true);
  assert.deepEqual(semFfmpeg.json.opcionais_faltando, ['ffmpeg']);
  const ff = semFfmpeg.json.itens.find((i) => i.id === 'ffmpeg');
  assert.deepEqual([ff.ok, ff.opcional, ff.passo], [false, true, 'ffmpeg']);
  for (const i of semFfmpeg.json.itens) if (i.id !== 'ffmpeg') assert.equal(i.opcional, undefined, i.id);
  // sem o navegador (obrigatório), a verificação reprova mesmo com o resto pronto
  const semNavegador = verificarCom(() => {});
  assert.equal(semNavegador.status, 1);
  assert.equal(semNavegador.json.ok, false);
  assert.equal(semNavegador.json.itens.find((i) => i.id === 'navegador').ok, false);
});

test('verificar no Windows espelha o Mac: ok só pelos obrigatórios, ffmpeg opcional no item', () => {
  const ps1 = ler('instalar/instalar.ps1');
  const v = ps1.slice(ps1.indexOf('function Invoke-AcaoVerificar'), ps1.indexOf('function Save-Instalacao'));
  assert.ok(v.includes("$opcional = ($Id -eq 'ffmpeg' -or $Id -eq 'ffprobe')"));
  assert.ok(v.includes('if ($opcional) { $o.opcional = $true }'));
  assert.ok(v.includes('$ok = ($script:Falhas -eq 0)'));
  assert.ok(v.includes('opcionais_faltando = $script:Opcionais.ToArray()'));
  assert.ok(!v.includes('$ok = ($script:Prontos -eq $total)'), 'o Windows não pode exigir o ffmpeg para ficar ok');
});

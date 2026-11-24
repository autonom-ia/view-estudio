// Fato com fonte mecânico: a leitura sem regex (números, telefone, @), a tabela de fatos do brief.md
// (só vale linha com fonte; a fonte do exemplo não vale) e, no Chrome, o comando "fatos" lendo cada
// tela em cada beat e a fala do roteiro. Pula a parte do navegador se não houver Chrome.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acharNavegador } from '../scripts/lib/chrome.mjs';
import {
  sequenciasNumericas, palavrasComArroba, lerTabelaDeFatos, montarLastro, conferirTexto, FONTE_DE_EXEMPLO,
} from '../scripts/lib/fatos.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT = path.join(RAIZ, 'kit');
const DESPACHANTE = path.join(KIT, 'scripts', 'estudio.mjs');
const opcoes = { skip: acharNavegador() ? false : 'sem Chrome, Edge ou Chromium nesta máquina', timeout: 240000 };

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
  base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-fatos-'));
  env = { ...process.env, ESTUDIO_APRESENTACOES: base, ESTUDIO_MARCA: path.join(base, 'sem-marca'), ESTUDIO_NAO_ABRIR: '1' };
});
after(() => {
  fs.rmSync(base, { recursive: true, force: true });
});

test('fatos: acha números com 3+ dígitos, telefone, preço, ano e @, sem expressão regular', () => {
  const t = 'Desde 2019. Ligue (11) 0000-0000 ou 0800 123 4567. Café R$ 18,00, pão R$ 9. Abre 6h50. Rua X, 120, casa 2. Siga @cafe.aurora, ou escreva para ola@cafe.example.';
  assert.deepEqual(sequenciasNumericas(t).map((s) => s.trecho), ['2019', '(11) 0000-0000', '0800 123 4567', '18,00', '120']);
  assert.deepEqual(palavrasComArroba(t), ['@cafe.aurora', 'ola@cafe.example']);
});

test('fatos: só vale linha com fonte; número de uma linha não empresta dígitos de outra', () => {
  const md = [
    '## Fatos e números (com fonte)',
    '| Fato | Fonte | Data |',
    '|---|---|---|',
    '| Telefone (11) 4198-2000 | cartão da loja | 2026 |',
    '| Temos 3.500 clientes | | |',
    '| Abriu em 2021 | a dona | 2026 |',
    '| E-mail ola@casa.example | a dona | 2026 |',
    '',
    '## Sequência de telas',
    '| Tela | Mensagem |',
    '|---|---|',
    '| 1 | 1982 fora da tabela de fatos |',
  ].join('\n');
  const linhas = lerTabelaDeFatos(md);
  assert.equal(linhas.length, 4);
  assert.equal(linhas.filter((l) => l.comFonte).length, 3);
  const lastro = montarLastro(linhas);
  const r = conferirTexto({ texto: 'Desde 1982. Ligue (11) 4198-2000. Desde 2021. Temos 3.500 fãs. Ramal 4.198. ola@casa.example @outra', enderecos: ['tel:+551141982000', 'mailto:ola@casa.example', 'mailto:x@y.example'] }, lastro);
  assert.deepEqual(r.faltam.map((f) => `${f.tipo}:${f.trecho}:${f.motivo}`).sort(), [
    'arroba:@outra:fora-de-fatos',
    'email:mailto:x@y.example:fora-de-fatos',
    'numero:1982:fora-de-fatos',
    'numero:3.500:linha-sem-fonte',
  ]);
});

test('molde: todo número das telas está na tabela de fatos do brief.md, só com a fonte do exemplo', () => {
  const linhas = lerTabelaDeFatos(fs.readFileSync(path.join(KIT, 'molde', 'brief.md'), 'utf8'));
  assert.ok(linhas.length >= 3);
  // a fonte do molde é a constante única de lib/fatos.mjs, e nunca conta como fonte
  for (const l of linhas) {
    assert.equal(l.fonte, FONTE_DE_EXEMPLO, l.fato);
    assert.equal(l.exemplo, true, l.fato);
    assert.equal(l.comFonte, false, l.fato);
  }
  const lastro = montarLastro(linhas);
  const pasta = path.join(KIT, 'molde', 'deck', 'slides');
  let texto = '';
  for (const n of fs.readdirSync(pasta)) {
    const html = fs.readFileSync(path.join(pasta, n), 'utf8');
    texto += html.slice(html.indexOf('<body>'), html.indexOf('<script')).split('<').map((p) => p.slice(p.indexOf('>') + 1)).join(' ');
  }
  const r = conferirTexto({ texto }, lastro);
  assert.ok(r.conferidos >= 3, 'as telas do molde precisam ter número para o exemplo valer');
  assert.deepEqual(r.faltam.filter((f) => f.motivo !== 'fonte-de-exemplo'), []);
});

// Uma tela com um telefone que só aparece no beat 1 e sai no beat 2, e um número na fala do roteiro.
function estragarFatos(nome) {
  const pasta = path.join(base, nome);
  const brief = path.join(pasta, 'brief.md');
  fs.writeFileSync(brief, fs.readFileSync(brief, 'utf8').replaceAll(FONTE_DE_EXEMPLO, 'Teste automatizado do estúdio'));
  const tela = path.join(pasta, 'deck', 'slides', 's03-movimentos.html');
  const extra = '<p style="position:absolute;left:140px;top:960px;font-size:28px" data-beat="1" data-sai="2">Ligue (11) 4321-9876</p>';
  fs.writeFileSync(tela, fs.readFileSync(tela, 'utf8').replace('<div class="palco-tela">', `<div class="palco-tela">\n${extra}`));
  const roteiro = path.join(pasta, 'roteiro', 'S02.json');
  const doc = JSON.parse(fs.readFileSync(roteiro, 'utf8'));
  doc.beats[1].fala = 'Foram 1.250 cafés vendidos antes das oito.';
  fs.writeFileSync(roteiro, JSON.stringify(doc, null, 2));
  return { pasta, brief };
}

test('fatos no Chrome: o molde reprova com a fonte do exemplo; número de um beat do meio e da fala também', opcoes, () => {
  assert.equal(estudio('nova', 'molde-fatos').codigo, 0);
  const molde = estudio('fatos', 'molde-fatos');
  assert.equal(molde.codigo, 2, JSON.stringify(molde.json));
  assert.equal(molde.json.codigo, 'FATOS_SEM_FONTE');
  assert.ok(molde.json.dados.vermelhos.length >= 3);
  assert.deepEqual(molde.json.dados.vermelhos.filter((v) => v.motivo !== 'fonte-de-exemplo'), []);
  assert.equal(molde.json.dados.beats, 9);
  assert.equal(molde.json.dados.falas, 9);

  assert.equal(estudio('nova', 'estragado-fatos').codigo, 0);
  const { brief } = estragarFatos('estragado-fatos');
  const r = estudio('fatos', 'estragado-fatos');
  assert.equal(r.codigo, 2, JSON.stringify(r.json));
  const achados = r.json.dados.vermelhos.map((v) => `${v.tela}|${v.beat === undefined ? '-' : v.beat}|${v.trecho}`).sort();
  assert.deepEqual(achados, ['roteiro/S02.json|1|1.250', 's03-movimentos.html|-|(11) 4321-9876']);

  // com as duas linhas na tabela, com fonte, passa
  const linhas = '| Telefone da loja: (11) 4321-9876 | cartão da loja | 2026-11 |\n| 1.250 cafés antes das oito em junho | planilha de vendas | 2026-11 |\n';
  fs.writeFileSync(brief, fs.readFileSync(brief, 'utf8').replace('|---|---|---|\n', `|---|---|---|\n${linhas}`));
  const ok = estudio('fatos', 'estragado-fatos');
  assert.equal(ok.codigo, 0, JSON.stringify(ok.json && ok.json.dados.vermelhos));
  assert.equal(ok.json.codigo, 'FATOS_OK');
});

test('fatos no Chrome: brief sem tabela preenchida avisa FATOS_SEM_TABELA', opcoes, () => {
  assert.equal(estudio('nova', 'sem-tabela').codigo, 0);
  fs.writeFileSync(path.join(base, 'sem-tabela', 'brief.md'), '# Brief\n\nSem fatos ainda.\n');
  const r = estudio('fatos', 'sem-tabela');
  assert.equal(r.codigo, 2);
  assert.ok(r.json.avisos.some((a) => a.codigo === 'FATOS_SEM_TABELA'), JSON.stringify(r.json.avisos));
  assert.ok(r.json.dados.vermelhos.every((v) => v.motivo === 'fora-de-fatos'));
});

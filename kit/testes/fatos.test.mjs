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
import { opcoesDoNavegador } from './fixtures/navegador.mjs';
import {
  sequenciasNumericas, palavrasComArroba, lerTabelaDeFatos, montarLastro, conferirTexto, FONTE_DE_EXEMPLO,
  numerosMarcados, numerosDaLinha, celulasDaLinha, tabelaDeFatosIlegivel,
} from '../scripts/lib/fatos.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT = path.join(RAIZ, 'kit');
const DESPACHANTE = path.join(KIT, 'scripts', 'estudio.mjs');
const opcoes = opcoesDoNavegador(240000);

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

test('fatos: número com % ou com mil/milhão/bilhão pede fonte mesmo com menos de 3 dígitos', () => {
  assert.deepEqual(numerosMarcados('Cresceu 38% e 2,5 % ao mês; 40 mil clientes, 3 milhões de reais, 12,5% e 7 dias').map((m) => m.chave),
    ['38%', '2,5%', '40 mil', '3 milhoes']);
  const lastro = montarLastro(lerTabelaDeFatos('| Fato | Fonte |\n|---|---|\n| 38% das vendas antes das 8 | caixa da loja |\n| 3 milhões de reais em 2025 | balanço |\n| 7% de desconto | |'));
  const r = conferirTexto({ texto: '38% das vendas. 3 milhoes de reais. 40 mil clientes. 7% de desconto. 3 lojas.' }, lastro);
  assert.deepEqual(r.faltam.map((f) => `${f.trecho}:${f.motivo}`).sort(), ['40 mil:fora-de-fatos', '7%:linha-sem-fonte']);
});

test('fatos: a vírgula decimal faz parte do número ("2,5%" não libera "25%"; "12,5%" não libera "125")', () => {
  const lastro = montarLastro(lerTabelaDeFatos('| Fato | Fonte |\n|---|---|\n| Cresceu 2,5% ao mês | balanço |\n| 12,5% dos pedidos | sistema |\n| Ticket de R$ 1.250,90 | caixa |'));
  const r = conferirTexto({ texto: 'Cresceu 25% ao mês. 125 clientes. 2,5% ao mês. 12,5% dos pedidos. R$ 1.250,90 de ticket.' }, lastro);
  assert.deepEqual(r.faltam.map((f) => `${f.trecho}:${f.motivo}`).sort(), ['125:fora-de-fatos', '25%:fora-de-fatos']);
});

test('fatos: número de uma linha só se junta pelo separador de número, não atravessa palavras', () => {
  assert.equal(numerosDaLinha('1 de 3 pedidos (33%)').has('133'), false);
  assert.ok(numerosDaLinha('(11) 4198-2000').has('1141982000'));
  assert.ok(numerosDaLinha('1 250 cafés').has('1250'), 'espaço fino é separador de milhar');
  const lastro = montarLastro(lerTabelaDeFatos('| Fato | Fonte |\n|---|---|\n| 1 de 3 pedidos (33%) | sistema |'));
  assert.deepEqual(conferirTexto({ texto: 'Foram 133 pedidos.' }, lastro).faltam.map((f) => f.trecho), ['133']);
});

test('fatos: tabela com ou sem barra nas bordas, barra escapada na célula, e tabela ilegível avisada', () => {
  assert.deepEqual(celulasDaLinha('| Preço \\| à vista | loja |'), ['Preço | à vista', 'loja']);
  const semBorda = lerTabelaDeFatos('Fato | Fonte | Data\n--- | --- | ---\nAbriu em 2019 | a dona | 2026\n\nTexto solto 1982 | nada');
  assert.deepEqual(semBorda.map((l) => [l.fato, l.fonte, l.comFonte]), [['Abriu em 2019', 'a dona', true]]);
  const escapada = lerTabelaDeFatos('| Fato | Fonte |\n|:--|--:|\n| R$ 120 \\| R$ 150 | tabela de preços \\| 2026 |');
  assert.deepEqual(escapada.map((l) => [l.fato, l.fonte]), [['R$ 120 | R$ 150', 'tabela de preços | 2026']]);
  // sem a linha separadora: a tabela não vale, e isso é dito (em vez de tudo virar fora-de-fatos)
  const md = '| Fato | Fonte |\n| Abriu em 2019 | a dona |';
  assert.equal(lerTabelaDeFatos(md).length, 0);
  assert.equal(tabelaDeFatosIlegivel(md), true);
  assert.equal(tabelaDeFatosIlegivel('# Brief sem tabela'), false);
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
  assert.ok(r.faltam.some((f) => f.trecho === '38%'), 'o 38% do molde também pede fonte (e a do exemplo não vale)');
});

// Uma tela com um telefone que só aparece no beat 1 e sai no beat 2, e um número na fala do roteiro.
function estragarFatos(nome) {
  const pasta = path.join(base, nome);
  const brief = path.join(pasta, 'brief.md');
  fs.writeFileSync(brief, fs.readFileSync(brief, 'utf8').replaceAll(FONTE_DE_EXEMPLO, 'Teste automatizado do estúdio'));
  const tela = path.join(pasta, 'deck', 'slides', 's03-movimentos.html');
  // um telefone que só aparece no beat 1, e um número que nunca aparece (opacidade 0 o tempo todo)
  const extra = '<p style="position:absolute;left:140px;top:960px;font-size:28px" data-beat="1" data-sai="2">Ligue (11) 4321-9876</p>'
    + '<p style="position:absolute;left:900px;top:960px;font-size:28px;opacity:0">número escondido 98765</p>';
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

test('fatos no Chrome: brief sem tabela avisa FATOS_SEM_TABELA; tabela que não se lê avisa FATOS_TABELA_ILEGIVEL; tela sem arquivo reprova', opcoes, () => {
  assert.equal(estudio('nova', 'sem-tabela').codigo, 0);
  const brief = path.join(base, 'sem-tabela', 'brief.md');
  fs.writeFileSync(brief, '# Brief\n\nSem fatos ainda.\n');
  const r = estudio('fatos', 'sem-tabela');
  assert.equal(r.codigo, 2);
  assert.ok(r.json.avisos.some((a) => a.codigo === 'FATOS_SEM_TABELA'), JSON.stringify(r.json.avisos));
  assert.ok(r.json.dados.vermelhos.every((v) => v.motivo === 'fora-de-fatos'));

  fs.writeFileSync(brief, '# Brief\n\n| Fato | Fonte |\n| Abriu em 2027 | a dona |\n');
  const ilegivel = estudio('fatos', 'sem-tabela');
  assert.ok(ilegivel.json.avisos.some((a) => a.codigo === 'FATOS_TABELA_ILEGIVEL'), JSON.stringify(ilegivel.json.avisos));

  const index = path.join(base, 'sem-tabela', 'deck', 'index.html');
  const secao = '<section class="slide" id="t09"><iframe data-src="slides/s09-sumiu.html"></iframe></section>';
  fs.writeFileSync(index, fs.readFileSync(index, 'utf8').replace('  </div>\n</div>', `    ${secao}\n  </div>\n</div>`));
  const sumiu = estudio('fatos', 'sem-tabela');
  assert.ok(sumiu.json.dados.vermelhos.some((v) => v.tipo === 'tela-sem-arquivo' && v.trecho === 'slides/s09-sumiu.html'), JSON.stringify(sumiu.json.dados.vermelhos));
});

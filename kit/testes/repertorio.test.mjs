// Repertório de apresentações (kit/repertorio/): o formato de todas as fichas, só link e nenhuma
// imagem, toda ficha conferida com data, o como-usar com cada ação, a skill nova-apresentacao
// estudando o repertório antes da direção visual, e a chegada pela atualização. A conferência de
// rede (manutencao/links-do-repertorio.mjs) fica fora do npm test; aqui só a classificação.
// Formato adaptado do Site Estúdio (kit/testes/repertorio.test.mjs) para apresentações.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classificar, linksDoRepertorio } from '../scripts/manutencao/links-do-repertorio.mjs';
import { PRESERVADOS } from '../scripts/lib/atualizacao.mjs';

const KIT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const RAIZ = path.join(KIT, '..');
const PASTA = path.join(KIT, 'repertorio');

// O que a plateia faz depois: um arquivo <ação>.json por ação.
const ACOES = ['investir', 'aplicar', 'aderir', 'confiar'];
const CAMPOS = ['id', 'nome', 'link', 'ondeVer', 'formato', 'plateia', 'duvida', 'estrutura', 'abertura', 'ancora', 'revelacao', 'fecho', 'naoCopiar', 'conferidaEm'];
// Texto que termina em ponto final; a dúvida termina em interrogação.
const FRASES = ['ondeVer', 'formato', 'plateia', 'estrutura', 'abertura', 'ancora', 'revelacao', 'fecho', 'naoCopiar'];
const TEXTO_MAXIMO = 240;
const FICHAS_POR_ACAO = 4;
const EXTENSOES_DE_IMAGEM = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.heic', '.bmp', '.tif', '.tiff', '.ico'];
const PERMITIDOS_NO_ID = 'abcdefghijklmnopqrstuvwxyz0123456789-';

const mesmasChaves = (obj, chaves) => obj !== null && typeof obj === 'object' && !Array.isArray(obj)
  && JSON.stringify(Object.keys(obj).sort()) === JSON.stringify([...chaves].sort());
const temImagem = (texto) => EXTENSOES_DE_IMAGEM.some((ext) => texto.toLowerCase().includes(ext));

function problemasDoTexto(nome, valor, fim) {
  if (typeof valor !== 'string' || valor.trim() !== valor || valor.length < 3) return [`${nome} vazio ou com espaço sobrando`];
  const p = [];
  if (valor.length > TEXTO_MAXIMO) p.push(`${nome} passa de ${TEXTO_MAXIMO} caracteres`);
  if (valor.includes('—') || valor.includes('–')) p.push(`${nome} tem travessão`);
  if (temImagem(valor)) p.push(`${nome} cita arquivo de imagem`);
  if (fim && !valor.endsWith(fim)) p.push(`${nome} não termina em "${fim}"`);
  return p;
}

function problemasDoLink(link) {
  let u;
  try {
    u = new URL(link);
  } catch {
    return ['link não é endereço'];
  }
  const p = [];
  if (u.protocol !== 'https:') p.push('link sem https');
  if (u.username || u.password || u.port) p.push('link com usuário, senha ou porta');
  if (u.search || u.hash) p.push('link com ? ou #');
  if (u.href !== link) p.push('link fora da forma normal');
  if (temImagem(u.pathname)) p.push('link aponta para imagem');
  const partes = u.hostname.split('.');
  if (partes.length < 2 || partes.every((x) => x !== '' && [...x].every((c) => c >= '0' && c <= '9'))) p.push('link sem domínio público');
  return p;
}

// conferidaEm: o dia em que a ficha foi conferida no próprio link, AAAA-MM-DD, nunca no futuro.
const HOJE = new Date().toISOString().slice(0, 10);
function dataValida(v) {
  if (typeof v !== 'string' || v.length !== 10) return false;
  const [ano, mes, dia] = v.split('-');
  const digitos = (x, n) => typeof x === 'string' && x.length === n && [...x].every((c) => c >= '0' && c <= '9');
  if (!digitos(ano, 4) || !digitos(mes, 2) || !digitos(dia, 2)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v && v <= HOJE;
}

function problemasDaFicha(f) {
  if (!mesmasChaves(f, CAMPOS)) return [`campos diferentes de: ${CAMPOS.join(', ')}`];
  const p = [];
  if (!dataValida(f.conferidaEm)) p.push('conferidaEm fora do formato AAAA-MM-DD ou no futuro');
  const idOk = typeof f.id === 'string' && f.id.length >= 2 && !f.id.startsWith('-') && !f.id.endsWith('-')
    && [...f.id].every((c) => PERMITIDOS_NO_ID.includes(c));
  if (!idOk) p.push('id fora do formato (minúsculas, números e hífen)');
  p.push(...problemasDoTexto('nome', f.nome), ...problemasDoTexto('duvida', f.duvida, '?'));
  for (const c of FRASES) p.push(...problemasDoTexto(c, f[c], '.'));
  p.push(...problemasDoLink(f.link));
  return p;
}

function lerRepertorio() {
  return ACOES.map((acao) => ({ acao, arquivo: `${acao}.json`, dados: JSON.parse(fs.readFileSync(path.join(PASTA, `${acao}.json`), 'utf8')) }));
}
const todasAsFichas = () => lerRepertorio().flatMap((r) => r.dados.fichas.map((f) => ({ ...f, acao: r.acao })));
const ler = (rel) => fs.readFileSync(path.join(RAIZ, rel), 'utf8');

test('o repertório tem um arquivo por ação da plateia, e cada um diz o que ela sai querendo', () => {
  const jsons = fs.readdirSync(PASTA).filter((n) => n.endsWith('.json')).sort();
  assert.deepEqual(jsons, ACOES.map((a) => `${a}.json`).sort());
  for (const { acao, arquivo, dados } of lerRepertorio()) {
    assert.ok(mesmasChaves(dados, ['acao', 'plateiaQuer', 'fichas']), `${arquivo}: campos acao, plateiaQuer e fichas`);
    assert.equal(dados.acao, acao, `${arquivo}: acao diferente do nome do arquivo`);
    assert.deepEqual(problemasDoTexto('plateiaQuer', dados.plateiaQuer, '.'), [], arquivo);
    assert.ok(Array.isArray(dados.fichas) && dados.fichas.length >= FICHAS_POR_ACAO, `${arquivo}: pelo menos ${FICHAS_POR_ACAO} fichas`);
  }
});

test('a data de conferência é AAAA-MM-DD de verdade e nunca no futuro', () => {
  for (const v of ['2026-11-24', '2024-02-29']) assert.equal(dataValida(v), true, v);
  for (const v of ['2026-13-01', '2026-02-30', '2023-02-29', '24/11/2026', '2026-1-24', '9999-12-31', 20261124, null]) assert.equal(dataValida(v), false, String(v));
});

test('toda ficha segue o formato, com link conferido e data', () => {
  const achados = [];
  for (const { acao, ...ficha } of todasAsFichas()) for (const p of problemasDaFicha(ficha)) achados.push(`${acao}/${ficha.id}: ${p}`);
  assert.deepEqual(achados, []);
});

test('a conferência de ficha acusa campo a mais, link inseguro, imagem, dúvida sem interrogação e data falsa', () => {
  const boa = todasAsFichas()[0];
  const { acao, ...base } = boa;
  assert.deepEqual(problemasDaFicha(base), []);
  assert.ok(problemasDaFicha({ ...base, print: 'x.png' })[0].startsWith('campos diferentes'));
  assert.ok(problemasDaFicha({ ...base, link: 'http://exemplo.com/' }).includes('link sem https'));
  assert.ok(problemasDaFicha({ ...base, link: 'https://exemplo.com/a?b=1' }).includes('link com ? ou #'));
  assert.ok(problemasDaFicha({ ...base, ancora: 'A foto capa.jpg.' }).includes('ancora cita arquivo de imagem'));
  assert.ok(problemasDaFicha({ ...base, duvida: 'Sem pergunta.' }).includes('duvida não termina em "?"'));
  assert.ok(problemasDaFicha({ ...base, conferidaEm: '2099-01-01' }).includes('conferidaEm fora do formato AAAA-MM-DD ou no futuro'));
});

test('sem id nem link repetido, e cada ação com formatos variados', () => {
  const fichas = todasAsFichas();
  assert.ok(fichas.length >= ACOES.length * FICHAS_POR_ACAO, `${fichas.length} fichas`);
  const repetidos = (campo) => fichas.map((f) => f[campo]).filter((v, i, todos) => todos.indexOf(v) !== i);
  assert.deepEqual(repetidos('id'), []);
  assert.deepEqual(repetidos('link'), []);
  assert.ok(new Set(fichas.map((f) => new URL(f.link).hostname)).size >= 6, 'fontes variadas');
});

test('o repertório é só texto: nenhum print, foto ou logo de marca', () => {
  const arquivos = fs.readdirSync(PASTA, { recursive: true }).map(String);
  assert.deepEqual(arquivos.filter((n) => !fs.statSync(path.join(PASTA, n)).isDirectory() && !n.endsWith('.json') && !n.endsWith('.md')), []);
  assert.ok(!arquivos.some(temImagem));
});

test('o como-usar lista cada ação, manda conferir o link e separa site que recusa leitor de site fora do ar', () => {
  const como = ler('kit/repertorio/como-usar.md');
  for (const acao of ACOES) assert.ok(como.includes(`\`${acao}.json\``), acao);
  assert.ok(como.includes('Só link, nunca imagem'));
  assert.ok(como.includes('não saiu do ar'));
  assert.ok(como.includes('Referências estudadas'));
  assert.ok(como.includes('antes'), 'estudar antes de desenhar');
});

test('a skill nova-apresentacao estuda o repertório antes da sequência de telas e da direção visual', () => {
  const skill = ler('.claude/skills/nova-apresentacao/SKILL.md');
  const etapa2 = skill.indexOf('## Etapa 2.');
  const repertorio = skill.indexOf('kit/repertorio/', etapa2);
  const sequencia = skill.indexOf('**Sequência de telas**', etapa2);
  const tese = skill.indexOf('**Tese visual**', etapa2);
  const designSkills = skill.indexOf('`frontend-design`', etapa2);
  assert.ok(etapa2 !== -1 && repertorio > etapa2, 'repertório na etapa 2');
  assert.ok(repertorio < sequencia && repertorio < tese && repertorio < designSkills, 'antes da sequência, da tese visual e das skills de design');
  assert.ok(skill.includes('**Referências estudadas**'));
  assert.ok(ler('AGENTS.md').includes('kit/repertorio/'));
});

test('o repertório chega pela atualização: kit nunca é pasta preservada', () => {
  assert.ok(!PRESERVADOS.includes('kit'));
});

test('conferência de rede: resposta normal é no ar; bloqueio é "recusa leitor", nunca "fora do ar"', () => {
  assert.equal(classificar({ status: 200 }), 'no-ar');
  for (const status of [202, 401, 403, 405, 429]) assert.equal(classificar({ status }), 'recusa-leitor', String(status));
  for (const status of [404, 410]) assert.equal(classificar({ status }), 'fora-do-ar', String(status));
  assert.equal(classificar({ status: 500 }), 'erro-do-site');
  assert.equal(classificar({ erro: 'TimeoutError' }), 'sem-resposta');
  assert.equal(classificar({ erro: 'ENOTFOUND' }), 'fora-do-ar');
  const links = linksDoRepertorio();
  assert.equal(links.length, todasAsFichas().length);
  for (const l of links) assert.ok(l.acao && l.id && l.link.startsWith('https://'), JSON.stringify(l));
});

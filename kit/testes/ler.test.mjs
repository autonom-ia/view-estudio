// Leitura do negócio (comando "ler"): perfil do Google e site atual, sem login, com cada fato indo
// para a parte "Lido pelo estúdio" da tabela de fatos do brief.md (um lugar só para fatos). As
// proteções (opção sem valor, site de terceiro, redirecionamento) rodam com leitor falso; a leitura
// de ponta a ponta roda no navegador contra páginas SINTÉTICAS (fixtures/fontes-sinteticas.mjs) e
// pula sem navegador. Portado do Site Estúdio (ler.test, ler-protecoes.test, ler-navegador.test).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acharNavegador } from '../scripts/lib/chrome.mjs';
import { horarioDoLugar, notaDoLugar, dadosDoLugar, enderecoDaBusca, ehDiaDaSemana } from '../scripts/lib/ler-google.mjs';
import { linksDoMesmoSite, contatosDosLinks, fatosDoJsonLd, abriuNoMesmoSite, lerSite } from '../scripts/lib/ler-site.mjs';
import { celula, secaoLida, juntarNoBrief, registrosDoGoogle, MARCA_INICIO, MARCA_FIM } from '../scripts/lib/registros.mjs';
import { ehSiteDoNegocio, lerFontes, semEnderecosLocais } from '../scripts/lib/ler.mjs';
import { dimensoes } from '../scripts/lib/baixar.mjs';
import { acharObjetos, hoje, abrirLeitor } from '../scripts/lib/leitor.mjs';
import { lerTabelaDeFatos, montarLastro, conferirTexto } from '../scripts/lib/fatos.mjs';
import { servirFontes, NEGOCIO, AUTORES } from './fixtures/fontes-sinteticas.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DESPACHANTE = path.join(RAIZ, 'kit', 'scripts', 'estudio.mjs');
const MOLDE_BRIEF = path.join(RAIZ, 'kit', 'molde', 'brief.md');
const DATA = '2026-11-24';

function rodarLer(args, { criar = true } = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-ler-'));
  try {
    if (criar) fs.mkdirSync(path.join(base, 'teste-ler'));
    const env = { ...process.env, ESTUDIO_APRESENTACOES: base, ESTUDIO_MARCA: path.join(base, 'sem-marca'), ESTUDIO_FERRAMENTAS: path.join(base, 'ferr') };
    const r = spawnSync(process.execPath, [DESPACHANTE, 'ler', 'teste-ler', ...args], { encoding: 'utf8', env });
    const linhas = r.stdout.trim().split('\n');
    return { status: r.status, json: JSON.parse(linhas[linhas.length - 1]) };
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

test('ler sem nome, Google nem site: LER_SEM_ENDERECO; apresentação que não existe: APRESENTACAO_NAO_ACHADA', () => {
  const r = rodarLer([]);
  assert.equal(r.status, 1);
  assert.equal(r.json.codigo, 'LER_SEM_ENDERECO');
  assert.ok(r.json.resumo.length > 0);
  assert.equal(rodarLer(['--negocio', 'Casa, Cidade'], { criar: false }).json.codigo, 'APRESENTACAO_NAO_ACHADA');
});

test('opção sem valor (--negocio, --site, --google) é erro, nunca fonte pulada em silêncio', () => {
  for (const [args, nome] of [
    [['--negocio', '--site', 'https://casa.example/'], '--negocio'],
    [['--negocio', 'Casa, Cidade', '--site'], '--site'],
    [['--google', '   ', '--negocio', 'Casa, Cidade'], '--google'],
  ]) {
    const r = rodarLer(args);
    assert.equal(r.status, 1, args.join(' '));
    assert.equal(r.json.codigo, 'ARGUMENTO_INVALIDO', args.join(' '));
    assert.equal(r.json.dados.argumento, nome, args.join(' '));
  }
});

test('o Instagram não é lido: o ler não aceita --instagram como fonte e o kit não tem leitor dele', () => {
  const r = rodarLer(['--instagram', 'casa']);
  assert.equal(r.json.codigo, 'LER_SEM_ENDERECO');
  const libs = fs.readdirSync(path.join(RAIZ, 'kit', 'scripts', 'lib'));
  assert.ok(!libs.some((n) => n.toLowerCase().includes('instagram')), libs.join(', '));
});

test('horário do Google: tabela do painel; sem tabela, os rótulos de cada dia', () => {
  const linhas = [['domingo', 'Fechado'], ['segunda-feira', '07:00–12:00\n14:00–19:00'], ['Nota', '5'], ['segunda-feira', 'repetido']];
  assert.deepEqual(horarioDoLugar({ linhas }), [{ dia: 'domingo', horas: 'Fechado' }, { dia: 'segunda-feira', horas: '07:00–12:00, 14:00–19:00' }]);
  const rotulos = ['terça-feira, 10:00 a 12:00, 14:00 a 20:00, Copiar horário de funcionamento', 'Endereço: Rua, 1', 'Mostrar horário'];
  assert.deepEqual(horarioDoLugar({ linhas: [], rotulos }), [{ dia: 'terça-feira', horas: '10:00 a 12:00, 14:00 a 20:00' }]);
  assert.ok(ehDiaDaSemana('Sábado') && ehDiaDaSemana('monday') && !ehDiaDaSemana('Horário'));
});

test('nota, telefone e endereço do Google; busca pelo nome ou pelo link dado', () => {
  assert.deepEqual(notaDoLugar('4,7\n(112.695)'), { nota: '4,7', total: '112.695' });
  const l = dadosDoLugar({ url: 'https://g.example/maps/place/X/data=1?hl=pt&entry=ttu', nome: ' X ', endereco: 'Endereço: Rua Y, 2 ', telefone: '', telefoneId: 'phone:tel:0000', linhas: [], rotulos: [], nota: '' });
  assert.deepEqual([l.nome, l.endereco, l.telefone, l.fonte], ['X', 'Rua Y, 2', '0000', 'https://g.example/maps/place/X/data=1']);
  assert.equal(enderecoDaBusca('Casa Exemplo, Cidade', 'https://g.example'), 'https://g.example/maps/search/Casa%20Exemplo%2C%20Cidade?hl=pt-BR');
  assert.equal(enderecoDaBusca('https://maps.example/abc'), 'https://maps.example/abc');
});

test('site: só páginas do mesmo endereço, sem arquivo nem âncora; contatos e JSON-LD', () => {
  const links = ['https://www.casa.example/a#x', 'https://casa.example/a', 'https://casa.example/menu.PDF', 'https://fora.example/', 'tel:+5500', 'mailto:oi@casa.example', 'https://wa.me/5511?text=oi', 'https://api.whatsapp.com/send?phone=5522'];
  assert.deepEqual(linksDoMesmoSite(links, 'https://casa.example/'), ['https://casa.example/a']);
  assert.deepEqual(contatosDosLinks([...links, 'tel:+5500']).map((c) => `${c.tipo}:${c.valor}`), ['Telefone:+5500', 'E-mail:oi@casa.example', 'WhatsApp:5511', 'WhatsApp:5522']);
  const ld = JSON.stringify({ '@graph': [{ telephone: '1', address: 'Rua A', openingHours: ['Mo-Fr 08:00-18:00'] }] });
  assert.deepEqual(fatosDoJsonLd([ld, 'quebrado']).map((f) => f.tipo), ['Telefone', 'Endereço', 'Horário']);
});

test('rede social, conversa, loja de pedidos, link curto e página de links não contam como site do negócio', () => {
  assert.ok(ehSiteDoNegocio('https://casa.example/'));
  for (const u of ['https://www.instagram.com/casa', 'https://wa.me/55', 'https://m.facebook.com/casa', 'tel:1', 'nada', 'https://www.ifood.com.br/delivery/x', 'https://bit.ly/abc', 'https://linktr.ee/x', 'https://maps.app.goo.gl/x']) {
    assert.ok(!ehSiteDoNegocio(u), u);
  }
  assert.ok(abriuNoMesmoSite('http://casa.example/', 'https://www.casa.example/inicio'));
  assert.ok(!abriuNoMesmoSite('https://casa.example/', 'https://outra.example/'));
  assert.ok(!abriuNoMesmoSite('https://casa.example/', 'https://www.ifood.com.br/delivery/x'));
});

// Leitor falso: toda página pedida "abre" em `final` (o endereço depois do redirecionamento).
function leitorQueRedireciona(final, links) {
  const visitas = [];
  return {
    visitas,
    ir: async (url) => visitas.push(url),
    avaliar: async (fn) => (fn.name === 'lerPaginaDoSite' ? { url: final, titulo: 'T', descricao: '', titulos: [], texto: 'texto', links, imagens: [], jsonld: [] } : true),
  };
}

test('site que redireciona para outro endereço: lê só a primeira página e nada dele vai para o brief', async () => {
  const leitor = leitorQueRedireciona('https://www.ifood.com.br/delivery/outra', ['tel:+550000', 'mailto:contato@terceiro.example']);
  const s = await lerSite(leitor, 'https://bit.ly/abc');
  assert.equal(s.desvio, 'https://www.ifood.com.br/delivery/outra');
  assert.equal(leitor.visitas.length, 1);
  const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-ler-prot-'));
  try {
    const brief = path.join(pasta, 'brief.md');
    fs.writeFileSync(brief, '# Brief\n');
    const r = await lerFontes({ site: 'https://casa.example/' }, { pasta: path.join(pasta, 'coleta'), brief, leitor: leitorQueRedireciona('https://www.ifood.com.br/delivery/outra', ['tel:+550000']), data: DATA });
    assert.deepEqual(r.avisos.map((a) => a.codigo), ['LER_SITE_OUTRO_ENDERECO']);
    assert.equal(r.registros.length, 0);
    assert.equal(fs.readFileSync(brief, 'utf8'), '# Brief\n');
  } finally {
    fs.rmSync(pasta, { recursive: true, force: true });
  }
});

test('registros do Google entram com fonte e data, sem nome de quem avaliou, e o fatos os aceita', () => {
  const g = { lugar: { nome: 'Casa', endereco: 'Rua A, 100', telefone: '(00) 0000-1234', site: '', horario: [{ dia: 'terça-feira', horas: '07:00–19:00' }], nota: '4,8', total: '37', fonte: 'https://g.example/maps/place/Casa' }, avaliacoes: [{ estrelas: '5', texto: 'Ótimo | bom', quando: 'há 1 mês' }, { estrelas: '4', texto: '', quando: '' }] };
  const regs = registrosDoGoogle(g, DATA);
  assert.equal(regs.length, 6);
  const md = juntarNoBrief('# Brief\n', secaoLida(regs, DATA));
  const linhas = lerTabelaDeFatos(md);
  assert.equal(linhas.length, 6);
  assert.ok(linhas.every((l) => l.comFonte));
  assert.ok(linhas.some((l) => l.fato === 'Avaliação no Google (5 estrelas, há 1 mês): "Ótimo / bom"'));
  assert.deepEqual(conferirTexto({ texto: 'Ligue (00) 0000-1234, Rua A, 100' }, montarLastro(linhas)).faltam, []);
});

test('brief do molde: a parte lida entra dentro de "Fatos e números", depois da tabela de cima, e a segunda leitura troca só ela', () => {
  const molde = fs.readFileSync(MOLDE_BRIEF, 'utf8');
  const um = juntarNoBrief(molde, secaoLida([{ fato: 'Telefone: (00) 0000-1111', fonte: 'Perfil do Google, https://g.example/maps/place/A', data: DATA }], DATA));
  const iFatos = um.indexOf('## Fatos e números');
  const iLido = um.indexOf(MARCA_INICIO);
  const iMaterial = um.indexOf('## Material disponível');
  assert.ok(iFatos < iLido && iLido < iMaterial, 'entre a seção de fatos e a seguinte');
  assert.ok(um.slice(iFatos, iLido).includes('| Plano de expansão do Café Aurora'), 'a tabela de cima fica antes');
  const linhas = lerTabelaDeFatos(um);
  assert.equal(linhas.filter((l) => l.exemplo).length, 3, 'a tabela de cima continua lida');
  assert.ok(linhas.some((l) => l.fato === 'Telefone: (00) 0000-1111' && l.comFonte));
  const dois = juntarNoBrief(`${um}\nnota minha no fim\n`, secaoLida([{ fato: 'B', fonte: 'f', data: DATA }], DATA));
  assert.equal(dois.split(MARCA_INICIO).length, 2);
  assert.equal(dois.split(MARCA_FIM).length, 2);
  assert.ok(dois.includes('nota minha no fim') && dois.includes('| B |') && !dois.includes('0000-1111'));
  assert.equal(dois.slice(0, dois.indexOf(MARCA_INICIO)), um.slice(0, um.indexOf(MARCA_INICIO)), 'o resto do brief fica igual');
});

test('brief sem seção de fatos ganha a seção; sem brief, nasce só com ela', () => {
  const md = juntarNoBrief('# Brief\n\n## Objetivo\nVender.\n', secaoLida([{ fato: 'A', fonte: 'f', data: DATA }], DATA));
  assert.ok(md.startsWith('# Brief\n\n## Objetivo\nVender.\n\n## Fatos e números (com fonte)\n\n<!-- estudio:lido:inicio -->'));
  assert.ok(juntarNoBrief('', secaoLida([{ fato: 'A', fonte: 'f', data: DATA }], DATA)).startsWith('## Fatos e números (com fonte)\n'));
});

test('célula de tabela, tamanho da foto pelo cabeçalho, endereço local escondido, acharObjetos e hoje', () => {
  assert.equal(celula('a | b\n\nc\t d'), 'a / b c d');
  assert.equal(celula('x'.repeat(10), 5), 'xxxx…');
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x05, 0x46, 0x04, 0x38, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(dimensoes(jpeg), { largura: 1080, altura: 1350 });
  assert.deepEqual(dimensoes(Buffer.from('texto qualquer')), { largura: 0, altura: 0 });
  assert.equal(semEnderecosLocais('falhou ws://127.0.0.1:9222/devtools/x aqui'), 'falhou <endereço local> aqui');
  const compartilhado = { alvo: 1 };
  assert.equal(acharObjetos({ a: [compartilhado, { b: compartilhado }] }, (o) => 'alvo' in o).length, 1);
  assert.equal(hoje(new Date(2026, 0, 5)), '2026-01-05');
});

// --- de ponta a ponta, no navegador, contra páginas sintéticas ---

const SEM_NAVEGADOR = !acharNavegador();
const noNavegador = { skip: SEM_NAVEGADOR ? 'sem Chrome, Edge ou Chromium nesta máquina' : false, timeout: 240000 };
let srv;
let leitor;
let pasta;
let brief;
let r;

before(async () => {
  if (SEM_NAVEGADOR) return;
  srv = await servirFontes();
  leitor = await abrirLeitor();
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-ler-nav-'));
  brief = path.join(pasta, 'brief.md');
  fs.copyFileSync(MOLDE_BRIEF, brief);
  r = await lerFontes({ negocio: NEGOCIO }, { pasta: path.join(pasta, 'coleta'), brief, leitor, bases: { google: srv.origem }, data: DATA });
});

after(async () => {
  leitor?.fechar();
  await srv?.fechar();
  if (pasta) fs.rmSync(pasta, { recursive: true, force: true });
});

const codigos = () => r.avisos.map((a) => a.codigo);
const lidas = () => {
  const md = fs.readFileSync(brief, 'utf8');
  return lerTabelaDeFatos(md.slice(md.indexOf(MARCA_INICIO)));
};

test('Google: horário de cada dia vem do painel do lugar, com a fonte do lugar e a data; trecho de busca nunca', noNavegador, () => {
  const horario = lidas().filter((l) => l.fato.startsWith('Horário de '));
  assert.deepEqual(
    horario.map((l) => l.fato),
    ['Horário de segunda-feira: Fechado', 'Horário de terça-feira: 07:00–12:00, 14:00–19:00', 'Horário de quarta-feira: 07:00–19:00', 'Horário de sábado: 08:00–13:00'],
  );
  for (const l of horario) assert.ok(l.comFonte && l.fonte.startsWith('Perfil do Google, ') && l.fonte.includes('/maps/place/'), l.fonte);
  assert.ok(!fs.readFileSync(brief, 'utf8').includes('24 horas'));
  const fatoDe = (inicio) => lidas().find((l) => l.fato.startsWith(inicio));
  assert.equal(fatoDe('Endereço: ').fato, 'Endereço: Rua Inventada, 100 - Bairro Exemplo, Cidade Exemplo - UF');
  assert.equal(fatoDe('Telefone: ').fato, 'Telefone: (00) 0000-1234');
  assert.equal(fatoDe('Nota no Google').fato, 'Nota no Google: 4,8 (37 avaliações)');
  assert.ok(codigos().includes('LER_GOOGLE_PRIMEIRO_DA_LISTA'), 'dois resultados: pede confirmação');
});

test('avaliações do Google sem o nome de quem escreveu, em nenhum arquivo', noNavegador, () => {
  const avaliacoes = lidas().filter((l) => l.fato.startsWith('Avaliação no Google'));
  assert.equal(avaliacoes.length, 2);
  assert.ok(avaliacoes[0].fato.includes('5 estrelas, há 2 semanas'));
  assert.ok(avaliacoes[0].fato.includes('e o atendimento foi ótimo'), 'o "Mais" foi aberto');
  const tudo = [brief, path.join(pasta, 'coleta', 'google', 'lugar.json'), path.join(pasta, 'coleta', 'fatos-lidos.json')].map((a) => fs.readFileSync(a, 'utf8')).join('\n');
  for (const autor of AUTORES) assert.ok(!tudo.includes(autor), autor);
});

test('site atual achado pelo Google e lido inteiro; arquivo e endereço de fora não são visitados', noNavegador, () => {
  assert.equal(r.dados.site.paginas, 2);
  assert.ok(!srv.pedidos.some((p) => p.includes('tabela-de-precos.pdf')));
  const fatos = lidas().map((l) => l.fato);
  assert.ok(fatos.includes('Telefone declarado pelo site atual: (00) 0000-1234'));
  assert.ok(fatos.includes('Horário declarado pelo site atual: Wednesday: 07:00 a 19:00'));
  assert.ok(fatos.includes('E-mail no site atual: ola@casa.example'));
  assert.equal(r.dados.site.fotos, 1, 'só a foto com 600 pontos ou mais');
  assert.ok(fs.existsSync(path.join(pasta, 'coleta', 'site', 'fotos', 'foto-01.png')));
  assert.ok(fs.readFileSync(path.join(pasta, 'coleta', 'site', 'texto.md'), 'utf8').includes('Fale com a gente.'));
});

test('brief.md: a tabela de cima fica, a parte lida entra uma vez, com data em toda linha', noNavegador, () => {
  const md = fs.readFileSync(brief, 'utf8');
  assert.ok(md.includes('| Plano de expansão do Café Aurora'));
  assert.equal(md.split(MARCA_INICIO).length, 2);
  const linhas = md.slice(md.indexOf(MARCA_INICIO), md.indexOf(MARCA_FIM)).split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Fato'));
  assert.ok(linhas.length >= 12, String(linhas.length));
  for (const l of linhas) assert.ok(l.endsWith(`| ${DATA} |`), l);
  assert.equal(r.dados.fatos_registrados, linhas.length);
  assert.ok(md.indexOf(MARCA_FIM) < md.indexOf('## Material disponível'));
});

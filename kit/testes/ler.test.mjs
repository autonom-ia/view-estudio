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
import http from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { opcoesDoNavegador, TEM_NAVEGADOR, exigirNavegador } from './fixtures/navegador.mjs';
import { horarioDoLugar, notaDoLugar, dadosDoLugar, enderecoDaBusca, ehDiaDaSemana } from '../scripts/lib/ler-google.mjs';
import { linksDoMesmoSite, contatosDosLinks, fatosDoJsonLd, abriuNoMesmoSite, lerSite } from '../scripts/lib/ler-site.mjs';
import { celula, secaoLida, juntarNoBrief, registrosDoGoogle, MARCA_INICIO, MARCA_FIM } from '../scripts/lib/registros.mjs';
import { ehSiteDoNegocio, lerFontes, semEnderecosLocais, TETO_DA_LEITURA_MS } from '../scripts/lib/ler.mjs';
import { dimensoes, baixar, ehEnderecoInterno } from '../scripts/lib/baixar.mjs';
import { acharObjetos, hoje, abrirLeitor, TempoEsgotado } from '../scripts/lib/leitor.mjs';
import { lerTabelaDeFatos, montarLastro, conferirTexto } from '../scripts/lib/fatos.mjs';
import { servirFontes, NEGOCIO, AUTORES, AGENCIA } from './fixtures/fontes-sinteticas.mjs';

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
  const ld = JSON.stringify({ '@graph': [{ '@type': 'LocalBusiness', name: 'Casa', telephone: '1', address: 'Rua A', openingHours: ['Mo-Fr 08:00-18:00'] }] });
  const ref = { host: 'casa.example', nomes: ['Casa'] };
  assert.deepEqual(fatosDoJsonLd([ld, 'quebrado'], ref).fatos.map((f) => f.tipo), ['Telefone', 'Endereço', 'Horário']);
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

test('registros do Google entram com fonte e data; texto de avaliação nunca vira fato (pode citar alguém), a nota sim', () => {
  const g = { lugar: { nome: 'Casa', endereco: 'Rua A, 100', telefone: '(00) 0000-1234', site: '', horario: [{ dia: 'terça-feira', horas: '07:00–19:00' }], nota: '4,8', total: '37', fonte: 'https://g.example/maps/place/Casa' }, avaliacoes: [{ estrelas: '5', texto: 'A Joana do caixa foi ótima', quando: 'há 1 mês' }, { estrelas: '4', texto: '', quando: '' }] };
  const regs = registrosDoGoogle(g, DATA);
  assert.equal(regs.length, 5);
  assert.ok(!JSON.stringify(regs).includes('Joana'), 'texto de avaliação fora da tabela de fatos');
  assert.ok(!regs.some((r) => r.fato.startsWith('Avaliação')));
  const md = juntarNoBrief('# Brief\n', secaoLida(regs, DATA));
  const linhas = lerTabelaDeFatos(md);
  assert.equal(linhas.length, 5);
  assert.ok(linhas.every((l) => l.comFonte));
  assert.ok(linhas.some((l) => l.fato === 'Nota no Google: 4,8 (37 avaliações)'));
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
  assert.equal(celula('abc😀😀😀', 5), 'abc😀…', 'corta por caractere inteiro, nunca no meio do emoji');
  assert.ok(!celula('😀'.repeat(500)).includes('\uFFFD'));
  for (const ch of Array.from(celula('😀'.repeat(500)))) assert.ok(ch === '😀' || ch === '…');
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0x05, 0x46, 0x04, 0x38, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
  assert.deepEqual(dimensoes(jpeg), { largura: 1080, altura: 1350 });
  assert.deepEqual(dimensoes(Buffer.from('texto qualquer')), { largura: 0, altura: 0 });
  assert.equal(semEnderecosLocais('falhou ws://127.0.0.1:9222/devtools/x aqui'), 'falhou <endereço local> aqui');
  const compartilhado = { alvo: 1 };
  assert.equal(acharObjetos({ a: [compartilhado, { b: compartilhado }] }, (o) => 'alvo' in o).length, 1);
  assert.equal(hoje(new Date(2026, 0, 5)), '2026-01-05');
});

// --- proteções da leitura, com leitor falso (sem navegador) ---

// Leitor falso de um site: cada endereço pedido abre a página do mapa (com o endereço final dela).
// esperaMs: quanto cada página demora para abrir.
function leitorDeSite(mapa, { esperaMs = 0 } = {}) {
  const visitas = [];
  let atual = null;
  return {
    visitas,
    ir: async (url) => {
      visitas.push(url);
      if (esperaMs) await new Promise((r) => setTimeout(r, esperaMs));
      atual = typeof mapa === 'function' ? mapa(url) : mapa[url];
      if (!atual) throw new Error('não abriu');
    },
    avaliar: async (fn) => (fn.name === 'lerPaginaDoSite' ? { titulo: '', descricao: '', titulos: [], texto: 'texto', links: [], imagens: [], jsonld: [], ...atual } : true),
  };
}

function comPasta(fn) {
  return async () => {
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-ler-prot-'));
    try {
      await fn(pasta);
    } finally {
      fs.rmSync(pasta, { recursive: true, force: true });
    }
  };
}

const rodapeDeAgencia = 'https://wa.me/5599999990000';
const ldDoNegocio = JSON.stringify({ '@type': 'BicycleStore', name: 'Casa Exemplo', telephone: '(00) 0000-1234' });
const ldDaAgencia = JSON.stringify({ '@type': 'Organization', name: 'Agência Inventada', url: 'https://agencia.example/', telephone: '(99) 9999-0000', email: 'oi@agencia.example' });
const SITE_COM_AGENCIA = {
  'https://casa.example/': { url: 'https://casa.example/', titulo: 'Casa Exemplo', links: ['https://casa.example/contato', 'tel:+5500000001234', rodapeDeAgencia], jsonld: [ldDoNegocio, ldDaAgencia] },
  'https://casa.example/contato': { url: 'https://casa.example/contato', titulo: 'Contato', links: ['mailto:ola@casa.example', rodapeDeAgencia, 'https://wa.me/5500000001234'] },
};

test('site com rodapé de agência: contato e JSON-LD de terceiro viram aviso, nunca fato do negócio', comPasta(async (pasta) => {
  const brief = path.join(pasta, 'brief.md');
  const r = await lerFontes({ site: 'https://casa.example/' }, { pasta: path.join(pasta, 'coleta'), brief, leitor: leitorDeSite(SITE_COM_AGENCIA), data: DATA });
  const fatos = r.registros.map((x) => x.fato);
  assert.ok(fatos.includes('Telefone declarado pelo site atual: (00) 0000-1234'), fatos.join('\n'));
  assert.ok(fatos.includes('E-mail no site atual: ola@casa.example'));
  assert.ok(fatos.includes('WhatsApp no site atual: 5500000001234'), 'repetido em toda página, mas é o telefone do próprio negócio');
  const md = fs.readFileSync(brief, 'utf8');
  for (const deOutro of ['5599999990000', '9999-0000', 'agencia.example']) assert.ok(!md.includes(deOutro) && !fatos.join(' ').includes(deOutro), deOutro);
  const a = r.avisos.find((x) => x.codigo === 'LER_SITE_CONTATO_DE_TERCEIRO');
  assert.ok(a, r.avisos.map((x) => x.codigo).join(', '));
  const duvidosos = a.dados.contatos.map((c) => `${c.motivo}|${c.valor}`);
  assert.ok(duvidosos.includes('em-todas-as-paginas|5599999990000'), duvidosos.join(', '));
  assert.ok(duvidosos.includes('dados-de-outro|(99) 9999-0000') && duvidosos.includes('dados-de-outro|oi@agencia.example'), duvidosos.join(', '));
}));

test('JSON-LD só vale como fato se for de negócio (Organization, LocalBusiness ou subtipo) e do próprio site', () => {
  const ref = { host: 'casa.example', nomes: ['Casa Exemplo'] };
  const caso = (o) => fatosDoJsonLd([JSON.stringify(o)], ref);
  assert.equal(caso({ '@type': 'Restaurant', name: 'Casa Exemplo', telephone: '1' }).fatos.length, 1);
  assert.equal(caso({ '@type': 'Organization', url: 'https://www.casa.example/', name: 'Outro nome', telephone: '1' }).fatos.length, 1, 'url do site');
  assert.equal(caso({ '@type': ['Thing', 'https://schema.org/HairSalon'], name: 'casa exemplo', telephone: '1' }).fatos.length, 1);
  assert.equal(caso({ '@type': 'LocalBusiness', name: 'CasaExemplo', telephone: '1' }).fatos.length, 1, 'nome colado igual ao nome do negócio');
  assert.equal(fatosDoJsonLd([JSON.stringify({ '@type': 'LocalBusiness', name: 'Doce Lar', telephone: '1' })], { host: 'www.docelar.com.br', nomes: [] }).fatos.length, 1, 'nome colado igual ao do endereço');
  for (const o of [
    { '@type': 'Person', name: 'Casa Exemplo', telephone: '1' },
    { '@type': 'WebSite', name: 'Casa Exemplo', telephone: '1' },
    { name: 'Casa Exemplo', telephone: '1' },
    { '@type': 'Organization', name: 'Agência Inventada', telephone: '1' },
    { '@type': 'LocalBusiness', name: 'Casa Exemplo', url: 'https://agencia.example/', telephone: '1' },
    { '@type': 'Organization', name: 'Casa Exemplo Agência Digital', telephone: '1' },
    { '@type': 'Organization', name: 'Exemplos Web', telephone: '1' },
    { '@type': 'LocalBusiness', name: '', telephone: '1' },
  ]) {
    const r = caso(o);
    assert.equal(r.fatos.length, 0, JSON.stringify(o));
    assert.equal(r.outros.length, 1, JSON.stringify(o));
  }
  const comPonto = caso({ '@type': 'Store', name: 'Casa Exemplo', address: { '@type': 'PostalAddress', streetAddress: 'Rua A' }, contactPoint: { '@type': 'ContactPoint', telephone: '2' } });
  assert.deepEqual(comPonto.fatos.map((f) => `${f.tipo}:${f.valor}`), ['Telefone:2', 'Endereço:Rua A']);
  assert.equal(comPonto.outros.length, 0, 'endereço e contactPoint do negócio não viram "de outro"');
});

test('site de uma página só, com referência própria: contato do corpo é fato; o que está só no rodapé (e difere) vira aviso', comPasta(async (pasta) => {
  const mapa = {
    'https://casa.example/': {
      url: 'https://casa.example/',
      titulo: 'Casa Exemplo',
      links: ['mailto:ola@casa.example', 'https://wa.me/5511988887777', 'mailto:ola@casa.example', rodapeDeAgencia],
      rodape: ['mailto:ola@casa.example', rodapeDeAgencia],
      jsonld: [ldDoNegocio],
    },
  };
  const r = await lerFontes({ site: 'https://casa.example/' }, { pasta: path.join(pasta, 'coleta'), brief: path.join(pasta, 'brief.md'), leitor: leitorDeSite(mapa), data: DATA });
  const fatos = r.registros.map((x) => x.fato);
  assert.ok(fatos.includes('E-mail no site atual: ola@casa.example'), 'no corpo e no rodapé: é do negócio');
  assert.ok(fatos.includes('WhatsApp no site atual: 5511988887777'), 'só no corpo: é do negócio');
  assert.ok(!fatos.join(' ').includes('5599999990000'));
  const a = r.avisos.find((x) => x.codigo === 'LER_SITE_CONTATO_DE_TERCEIRO');
  assert.deepEqual(a.dados.contatos.map((c) => `${c.motivo}|${c.valor}`), ['so-no-rodape|5599999990000']);
}));

test('sem referência própria (nem Google nem contato no JSON-LD do negócio): contato repetido fica fato, com aviso leve', comPasta(async (pasta) => {
  const cabecalho = 'https://wa.me/5511977776666';
  const mapa = {
    'https://casa.example/': { url: 'https://casa.example/', titulo: 'Casa Exemplo', links: [cabecalho, 'https://casa.example/sobre'] },
    'https://casa.example/sobre': { url: 'https://casa.example/sobre', titulo: 'Sobre', links: [cabecalho, 'mailto:ola@casa.example'] },
  };
  const r = await lerFontes({ site: 'https://casa.example/' }, { pasta: path.join(pasta, 'coleta'), brief: path.join(pasta, 'brief.md'), leitor: leitorDeSite(mapa), data: DATA });
  const fatos = r.registros.map((x) => x.fato);
  assert.ok(fatos.includes('WhatsApp no site atual: 5511977776666'), fatos.join('\n'));
  assert.ok(fatos.includes('E-mail no site atual: ola@casa.example'));
  assert.ok(fs.readFileSync(path.join(pasta, 'brief.md'), 'utf8').includes('5511977776666'));
  assert.ok(!r.avisos.some((a) => a.codigo === 'LER_SITE_CONTATO_DE_TERCEIRO'));
  const leve = r.avisos.find((a) => a.codigo === 'LER_SITE_CONTATO_A_CONFERIR');
  assert.ok(leve, r.avisos.map((a) => a.codigo).join(', '));
  assert.deepEqual(leve.dados.contatos.map((c) => `${c.motivo}|${c.valor}`), ['em-todas-as-paginas|5511977776666']);
}));

test('página seguinte que redireciona para outro endereço fica de fora; só a primeira para a leitura', comPasta(async (pasta) => {
  const mapa = {
    'https://casa.example/': { url: 'https://casa.example/', titulo: 'Casa Exemplo', links: ['https://casa.example/loja', 'https://casa.example/sobre', 'tel:+5500000001234'] },
    'https://casa.example/loja': { url: 'https://www.ifood.com.br/delivery/outra', links: ['tel:+5588888880000', 'https://www.ifood.com.br/x'] },
    'https://casa.example/sobre': { url: 'https://www.casa.example/sobre', links: [] },
  };
  const s = await lerSite(leitorDeSite(mapa), 'https://casa.example/');
  assert.deepEqual(s.paginas.map((p) => p.url), ['https://casa.example/', 'https://www.casa.example/sobre']);
  assert.deepEqual(s.foraDoSite, [{ pedida: 'https://casa.example/loja', abriu: 'https://www.ifood.com.br/delivery/outra' }]);
  const r = await lerFontes({ site: 'https://casa.example/' }, { pasta: path.join(pasta, 'coleta'), brief: path.join(pasta, 'brief.md'), leitor: leitorDeSite(mapa), data: DATA });
  assert.ok(!JSON.stringify(r.registros).includes('8888880000'));
  assert.ok(!r.registros.some((x) => x.fonte.includes('ifood')));
  assert.equal(r.dados.site.fora_do_site, 1);
}));

test('--site de rede social ou página de links não é lido: aviso para a pessoa confirmar; sem "https://" ele completa', comPasta(async (pasta) => {
  for (const site of ['https://www.instagram.com/casa', 'linktr.ee/casa', 'https://wa.me/5511']) {
    const leitor = leitorDeSite({});
    const r = await lerFontes({ site }, { pasta: path.join(pasta, 'coleta'), brief: path.join(pasta, 'brief.md'), leitor, data: DATA });
    assert.equal(leitor.visitas.length, 0, site);
    assert.deepEqual(r.avisos.map((a) => a.codigo), ['LER_SITE_OUTRO_ENDERECO'], site);
    assert.equal(r.avisos[0].dados.endereco, site);
  }
  const leitor = leitorDeSite({ 'https://casa.example/': { url: 'https://casa.example/', titulo: 'Casa', links: [] } });
  await lerFontes({ site: 'casa.example' }, { pasta: path.join(pasta, 'coleta'), brief: path.join(pasta, 'brief.md'), leitor, data: DATA });
  assert.deepEqual(leitor.visitas, ['https://casa.example/']);
}));

test('marca da parte lida quebrada: o brief não muda e nada se perde; brief certo é guardado em coleta/ antes', comPasta(async (pasta) => {
  const secao = secaoLida([{ fato: 'A', fonte: 'f', data: DATA }], DATA);
  const quebrados = [
    `# Brief\n${MARCA_INICIO}\ntexto da pessoa que não pode sumir\n`,
    `# Brief\ntexto da pessoa\n${MARCA_FIM}\n`,
    `# Brief\n${MARCA_INICIO}\nx\n${MARCA_FIM}\nmeio da pessoa\n${MARCA_INICIO}\ny\n${MARCA_FIM}\n`,
    `# Brief\n${MARCA_FIM}\nmeio da pessoa\n${MARCA_INICIO}\n`,
    `# Brief\n${MARCA_INICIO}\n${MARCA_INICIO}\nmeio\n${MARCA_FIM}\n`,
  ];
  const leitor = () => leitorDeSite({ 'https://casa.example/': { url: 'https://casa.example/', titulo: 'Casa', links: ['mailto:ola@casa.example'] } });
  for (const [i, md] of quebrados.entries()) {
    assert.equal(juntarNoBrief(md, secao), null, `caso ${i}`);
    const dir = path.join(pasta, `q${i}`);
    fs.mkdirSync(dir);
    const brief = path.join(dir, 'brief.md');
    fs.writeFileSync(brief, md);
    const r = await lerFontes({ site: 'https://casa.example/' }, { pasta: path.join(dir, 'coleta'), brief, leitor: leitor(), data: DATA });
    assert.equal(fs.readFileSync(brief, 'utf8'), md, `caso ${i}: o brief ficou igual`);
    assert.ok(r.avisos.some((a) => a.codigo === 'LER_BRIEF_MARCADOR_QUEBRADO'), `caso ${i}`);
    assert.equal(r.dados.fatos_no_brief, false);
    assert.ok(fs.readFileSync(path.join(dir, 'coleta', 'fatos-lidos.json'), 'utf8').includes('ola@casa.example'), 'o lido fica em coleta/');
  }
  const dir = path.join(pasta, 'certo');
  fs.mkdirSync(dir);
  const brief = path.join(dir, 'brief.md');
  fs.writeFileSync(brief, '# Brief\nminha nota\n');
  const r = await lerFontes({ site: 'https://casa.example/' }, { pasta: path.join(dir, 'coleta'), brief, leitor: leitor(), data: DATA });
  assert.equal(r.dados.fatos_no_brief, true);
  assert.equal(fs.readFileSync(path.join(dir, 'coleta', 'brief-antes-da-leitura.md'), 'utf8'), '# Brief\nminha nota\n');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['brief.md', 'coleta'], 'nenhuma cópia solta ao lado do brief');
}));

test('brief salvo com BOM (Bloco de Notas antigo) continua com ele, e o texto da pessoa fica', comPasta(async (pasta) => {
  const brief = path.join(pasta, 'brief.md');
  fs.writeFileSync(brief, '\uFEFF# Brief\r\nminha frase\r\n');
  const leitor = leitorDeSite({ 'https://casa.example/': { url: 'https://casa.example/', titulo: 'Casa', links: ['mailto:ola@casa.example', 'https://casa.example/b'] }, 'https://casa.example/b': { url: 'https://casa.example/b', links: [] } });
  await lerFontes({ site: 'https://casa.example/' }, { pasta: path.join(pasta, 'coleta'), brief, leitor, data: DATA });
  const md = fs.readFileSync(brief, 'utf8');
  assert.ok(md.startsWith('\uFEFF# Brief\r\nminha frase\r\n'), JSON.stringify(md.slice(0, 40)));
  assert.ok(md.includes('ola@casa.example') && !md.split('\r\n').join('').includes('\n'));
}));

test('brief com fim de linha misturado: cada linha que já existia fica com o fim dela', () => {
  const md = '# Brief\r\nlinha LF\nlinha CRLF\r\n\r\n## Fatos e números\r\n\r\n| Fato | Fonte |\n|---|---|\r\n| X | Y |\n\r\n## Material\nfim';
  const um = juntarNoBrief(md, secaoLida([{ fato: 'A', fonte: 'f', data: DATA }], DATA));
  assert.ok(um.startsWith('# Brief\r\nlinha LF\nlinha CRLF\r\n\r\n## Fatos e números\r\n\r\n| Fato | Fonte |\n|---|---|\r\n| X | Y |\n'), JSON.stringify(um.slice(0, 120)));
  assert.ok(um.endsWith('\r\n## Material\nfim'), JSON.stringify(um.slice(-30)));
  assert.ok(um.includes(`${MARCA_INICIO}\r\n`), 'linha nova usa o fim mais usado (CRLF)');
  const dois = juntarNoBrief(um, secaoLida([{ fato: 'B', fonte: 'f', data: DATA }], DATA));
  assert.equal(dois.slice(0, dois.indexOf(MARCA_INICIO)), um.slice(0, um.indexOf(MARCA_INICIO)));
  assert.equal(dois.slice(dois.indexOf(MARCA_FIM)), um.slice(um.indexOf(MARCA_FIM)));
  assert.ok(dois.includes('| B | f |') && !dois.includes('| A | f |'));
});

test('brief com fim de linha do Windows (CRLF) continua todo em CRLF depois da leitura', () => {
  const md = '# Brief\r\n\r\n## Fatos e números\r\n\r\n| Fato | Fonte |\r\n|---|---|\r\n| X | Y |\r\n\r\n## Material\r\nfim\r\n';
  const um = juntarNoBrief(md, secaoLida([{ fato: 'A', fonte: 'f', data: DATA }], DATA));
  assert.ok(um.includes(MARCA_INICIO) && um.includes('| A | f |'));
  assert.equal(um.split('\r\n').join('').includes('\n'), false, 'nenhuma quebra sozinha');
  const dois = juntarNoBrief(um, secaoLida([{ fato: 'B', fonte: 'f', data: DATA }], DATA));
  assert.equal(dois.split('\r\n').join('').includes('\n'), false);
  assert.ok(dois.includes('| B | f |') && !dois.includes('| A | f |') && dois.endsWith('## Material\r\nfim\r\n'));
  assert.equal(juntarNoBrief('# Brief\n', secaoLida([], DATA)).includes('\r'), false, 'arquivo com LF fica em LF');
});

test('teto de tempo: a leitura para no teto, grava o que já leu e avisa', comPasta(async (pasta) => {
  // Site sem fim: cada página leva 50 ms e aponta para a próxima. Margens largas: a máquina do
  // teste pode estar ocupada; o que importa é parar perto do teto, e não ler para sempre.
  const mapa = (url) => {
    const n = Number(new URL(url).pathname.split('/').pop() || 0);
    return { url, titulo: 'Casa', links: [`https://casa.example/p/${n + 1}`, `mailto:p${n}@casa.example`] };
  };
  const brief = path.join(pasta, 'brief.md');
  const inicio = Date.now();
  const r = await lerFontes({ site: 'https://casa.example/' }, { pasta: path.join(pasta, 'coleta'), brief, leitor: leitorDeSite(mapa, { esperaMs: 50 }), data: DATA, tetoMs: 1000 });
  assert.ok(Date.now() - inicio < 6000, `parou em ${Date.now() - inicio} ms`);
  assert.ok(r.avisos.some((a) => a.codigo === 'LER_TEMPO_ESGOTADO'), r.avisos.map((a) => a.codigo).join(', '));
  assert.ok(r.dados.site.paginas >= 1 && r.dados.site.paginas < 30, String(r.dados.site.paginas));
  assert.ok(fs.readFileSync(brief, 'utf8').includes('p0@casa.example'), 'o que já leu foi para o brief');
  // Google que nunca responde: para no teto também, e o site nem começa.
  const parado = { ir: () => new Promise(() => {}), avaliar: async () => null, esperarAte: async () => null };
  const inicio2 = Date.now();
  const r2 = await lerFontes({ negocio: 'Casa, Cidade', site: 'https://casa.example/' }, { pasta: path.join(pasta, 'coleta2'), brief: path.join(pasta, 'b2.md'), leitor: parado, data: DATA, tetoMs: 200 });
  assert.ok(Date.now() - inicio2 < 5000, `parou em ${Date.now() - inicio2} ms`);
  assert.deepEqual(r2.avisos.map((a) => a.codigo), ['LER_TEMPO_ESGOTADO']);
  assert.equal(fs.existsSync(path.join(pasta, 'b2.md')), false);
}));

test('teto de tempo: conta do início do comando (navegador incluído) e cobre o laço das fotos', comPasta(async (pasta) => {
  const leitor = leitorDeSite({ 'https://casa.example/': { url: 'https://casa.example/', titulo: 'Casa', links: [] } });
  const r = await lerFontes({ site: 'https://casa.example/' }, { pasta: path.join(pasta, 'coleta'), brief: path.join(pasta, 'b.md'), leitor, data: DATA, inicio: Date.now() - TETO_DA_LEITURA_MS });
  assert.equal(leitor.visitas.length, 0, 'o tempo já tinha acabado ao abrir o navegador');
  assert.deepEqual(r.avisos.map((a) => a.codigo), ['LER_TEMPO_ESGOTADO']);
  const comando = fs.readFileSync(path.join(RAIZ, 'kit', 'scripts', 'comandos', 'ler.mjs'), 'utf8');
  const marca = comando.indexOf('const inicio = Date.now()');
  assert.ok(marca !== -1 && marca < comando.indexOf('abrirLeitor()') && comando.includes('inicio })'), 'o comando mede antes de abrir o navegador e passa o instante');
  // Fotos: um download que nunca termina não segura a leitura além do prazo.
  const imagens = [1, 2, 3].map((n) => ({ src: `https://fotos.example/${n}.jpg`, largura: 800, altura: 600, alt: '' }));
  const comFotos = leitorDeSite({ 'https://casa.example/': { url: 'https://casa.example/', titulo: 'Casa', links: [], imagens } });
  const baixarFoto = () => new Promise(() => {});
  const inicio = Date.now();
  const s = await lerSite(comFotos, 'https://casa.example/', { pasta: path.join(pasta, 'site'), prazo: Date.now() + 300, baixarFoto });
  assert.ok(Date.now() - inicio < 3000, `parou em ${Date.now() - inicio} ms`);
  assert.equal(s.esgotou, true);
  assert.equal(s.paginas.length, 1, 'a página lida fica');
}));

test('foto: a consulta do nome tem prazo próprio e respeita o prazo da leitura', comPasta(async (pasta) => {
  const parado = () => new Promise(() => {});
  const inicio = Date.now();
  await assert.rejects(baixar('https://fotos.example/a.jpg', path.join(pasta, 'a.jpg'), { consultarNome: parado, tetoDoNomeMs: 100 }), (e) => !(e instanceof TempoEsgotado) && e.message.includes('não respondeu'));
  await assert.rejects(baixar('https://fotos.example/a.jpg', path.join(pasta, 'a.jpg'), { consultarNome: parado, prazo: Date.now() + 150 }), (e) => e instanceof TempoEsgotado);
  assert.ok(Date.now() - inicio < 3000, `parou em ${Date.now() - inicio} ms`);
  const interno = async () => [{ address: '10.0.0.5', family: 4 }];
  await assert.rejects(baixar('https://fotos.example/a.jpg', path.join(pasta, 'a.jpg'), { consultarNome: interno }), (e) => e.message.includes('endereço interno'));
  assert.equal(fs.existsSync(path.join(pasta, 'a.jpg')), false);
}));

test('o comando ler nunca liga as opções só de teste (teto curto e endereço local)', () => {
  const comando = fs.readFileSync(path.join(RAIZ, 'kit', 'scripts', 'comandos', 'ler.mjs'), 'utf8');
  for (const opcao of ['tetoMs', 'permitirEnderecoLocal']) assert.ok(!comando.includes(opcao), opcao);
});

test('Google: o "Mais" das avaliações é clicado uma vez só, mesmo quando o texto demora a aparecer', async () => {
  const chamadas = [];
  let leituras = 0;
  const lido = { url: 'https://g.example/maps/place/Casa', nome: 'Casa', endereco: '', telefone: '', telefoneId: '', site: '', linhas: [], rotulos: [], nota: '' };
  const respostas = {
    estadoDaBusca: () => 'lugar',
    enderecoDoLugar: () => lido.url,
    lerLugarNaPagina: () => lido,
    abrirAvaliacoes: () => true,
    haAvaliacoes: () => true,
    abrirTextosInteiros: () => 1,
    lerAvaliacoesNaPagina: () => {
      leituras += 1;
      return leituras < 3 ? null : [{ estrelas: '5 estrelas', texto: 'bom', quando: '' }];
    },
  };
  const avaliar = async (fn) => {
    chamadas.push(fn.name);
    return respostas[fn.name]();
  };
  const leitor = {
    ir: async () => {},
    avaliar,
    esperarAte: async (fn) => {
      for (let i = 0; i < 10; i += 1) {
        const v = await avaliar(fn);
        if (v) return v;
      }
      return null;
    },
  };
  const { lerGoogle } = await import('../scripts/lib/ler-google.mjs');
  const g = await lerGoogle(leitor, 'Casa');
  assert.equal(g.avaliacoes.length, 1);
  assert.equal(chamadas.filter((n) => n === 'abrirTextosInteiros').length, 1, chamadas.join(', '));
  assert.ok(chamadas.filter((n) => n === 'lerAvaliacoesNaPagina').length >= 3);
});

// Servidor de fotos em 127.0.0.1: grande com tamanho declarado, grande sem tamanho (aos pedaços),
// pequena, e um redirecionamento.
function servirFotos() {
  const pedidos = [];
  const srvFotos = http.createServer((req, res) => {
    pedidos.push(req.url);
    if (req.url === '/grande-com-tamanho') return res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': '5000' }).end(Buffer.alloc(5000));
    if (req.url === '/grande-sem-tamanho') {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      for (let i = 0; i < 5; i += 1) res.write(Buffer.alloc(1000));
      return res.end();
    }
    if (req.url === '/pequena') return res.writeHead(200, { 'Content-Type': 'image/png' }).end(Buffer.alloc(100));
    if (req.url === '/desvio') return res.writeHead(302, { Location: '/pequena' }).end();
    return res.writeHead(404).end();
  });
  return new Promise((resolve) => srvFotos.listen(0, '127.0.0.1', () => resolve({ origem: `http://127.0.0.1:${srvFotos.address().port}`, pedidos, fechar: () => new Promise((f) => srvFotos.close(() => f())) })));
}

test('foto: só http/https, nunca endereço interno; teto de tamanho pelo cabeçalho e aos pedaços', comPasta(async (pasta) => {
  for (const h of ['127.0.0.1', '10.0.0.8', '172.16.0.1', '172.31.255.1', '192.168.1.1', '169.254.169.254', '[::1]', 'localhost', 'loja.localhost', '[::ffff:7f00:1]', '[fd00::1]', '0.0.0.0']) assert.ok(ehEnderecoInterno(h), h);
  for (const h of ['8.8.8.8', '172.32.0.1', 'casa.example', '[2001:db8::1]']) assert.ok(!ehEnderecoInterno(h), h);
  const fotos = await servirFotos();
  const destino = path.join(pasta, 'f.png');
  try {
    for (const url of [`${fotos.origem}/pequena`, `http://localhost:${new URL(fotos.origem).port}/pequena`, 'file:///etc/hosts', 'ftp://casa.example/f.png']) {
      await assert.rejects(baixar(url, destino), url);
    }
    assert.equal(fotos.pedidos.length, 0, 'endereço interno nem é pedido');
    const local = { permitirEnderecoLocal: true, tetoBytes: 2000 };
    assert.equal((await baixar(`${fotos.origem}/pequena`, destino, local)).bytes, 100);
    assert.equal((await baixar(`${fotos.origem}/desvio`, destino, local)).bytes, 100, 'segue o redirecionamento, conferindo cada endereço');
    await assert.rejects(baixar(`${fotos.origem}/grande-com-tamanho`, path.join(pasta, 'g1.png'), local), (e) => e.message.includes('grande demais'));
    await assert.rejects(baixar(`${fotos.origem}/grande-sem-tamanho`, path.join(pasta, 'g2.png'), local), (e) => e.message.includes('grande demais'));
    assert.ok(!fs.existsSync(path.join(pasta, 'g1.png')) && !fs.existsSync(path.join(pasta, 'g2.png')), 'nada gravado');
  } finally {
    await fotos.fechar();
  }
}));

test('teste de navegador: sem Chrome é pulado fora do CI; no CI (variável ligada) roda e falha', () => {
  assert.equal(opcoesDoNavegador(1, { tem: false, exige: false }).skip, 'sem Chrome, Edge ou Chromium nesta máquina');
  assert.equal(opcoesDoNavegador(1, { tem: false, exige: true }).skip, false);
  assert.equal(opcoesDoNavegador(1, { tem: true, exige: false }).skip, false);
  assert.throws(() => exigirNavegador(false), (e) => e.message.includes('ESTUDIO_TESTES_EXIGEM_NAVEGADOR'));
  const ci = fs.readFileSync(path.join(RAIZ, '.github', 'workflows', 'testes.yml'), 'utf8');
  assert.ok(ci.includes("ESTUDIO_TESTES_EXIGEM_NAVEGADOR: '1'"), 'o CI liga a variável');
});

// --- de ponta a ponta, no navegador, contra páginas sintéticas ---

const noNavegador = opcoesDoNavegador(240000);
let srv;
let leitor;
let pasta;
let brief;
let r;

before(async () => {
  if (!TEM_NAVEGADOR) return;
  srv = await servirFontes();
  leitor = await abrirLeitor();
  pasta = fs.mkdtempSync(path.join(os.tmpdir(), 'estudio-ler-nav-'));
  brief = path.join(pasta, 'brief.md');
  fs.copyFileSync(MOLDE_BRIEF, brief);
  // As fotos sintéticas são servidas em 127.0.0.1: só aqui, no teste, o endereço local é aceito.
  r = await lerFontes({ negocio: NEGOCIO }, { pasta: path.join(pasta, 'coleta'), brief, leitor, bases: { google: srv.origem }, data: DATA, permitirEnderecoLocal: true });
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
  exigirNavegador();
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

test('avaliações do Google: texto inteiro (um clique no "Mais") só em coleta/, nunca no brief; nome de quem escreveu em nenhum arquivo', noNavegador, () => {
  exigirNavegador();
  assert.equal(lidas().filter((l) => l.fato.startsWith('Avaliação')).length, 0);
  const lugar = JSON.parse(fs.readFileSync(path.join(pasta, 'coleta', 'google', 'lugar.json'), 'utf8'));
  assert.equal(lugar.avaliacoes.length, 2);
  assert.equal(lugar.avaliacoes[0].texto, 'Revisão rápida perfeito e o atendimento foi ótimo.', 'o "Mais" abriu uma vez, e não fechou de novo');
  const doBrief = [brief, path.join(pasta, 'coleta', 'fatos-lidos.json')].map((a) => fs.readFileSync(a, 'utf8')).join('\n');
  assert.ok(!doBrief.includes('Revisão rápida') && !doBrief.includes('Entrega no horário'));
  const tudo = `${doBrief}\n${JSON.stringify(lugar)}`;
  for (const autor of AUTORES) assert.ok(!tudo.includes(autor), autor);
});

test('site atual achado pelo Google e lido inteiro; arquivo e endereço de fora não são visitados; rodapé da agência fica fora dos fatos', noNavegador, () => {
  exigirNavegador();
  assert.equal(r.dados.site.paginas, 2);
  assert.ok(!srv.pedidos.some((p) => p.includes('tabela-de-precos.pdf')));
  const fatos = lidas().map((l) => l.fato);
  assert.ok(fatos.includes('Telefone declarado pelo site atual: (00) 0000-1234'));
  assert.ok(fatos.includes('Horário declarado pelo site atual: Wednesday: 07:00 a 19:00'));
  assert.ok(fatos.includes('E-mail no site atual: ola@casa.example'));
  const md = fs.readFileSync(brief, 'utf8');
  for (const deOutro of [AGENCIA.whatsapp, AGENCIA.telefone, AGENCIA.nome]) assert.ok(!md.includes(deOutro), deOutro);
  const a = r.avisos.find((x) => x.codigo === 'LER_SITE_CONTATO_DE_TERCEIRO');
  assert.ok(a, codigos().join(', '));
  assert.deepEqual(a.dados.contatos.map((c) => c.valor).sort(), [AGENCIA.telefone, AGENCIA.whatsapp].sort());
  assert.equal(r.dados.site.fotos, 1, 'só a foto com 600 pontos ou mais');
  assert.ok(fs.existsSync(path.join(pasta, 'coleta', 'site', 'fotos', 'foto-01.png')));
  assert.ok(fs.readFileSync(path.join(pasta, 'coleta', 'site', 'texto.md'), 'utf8').includes('Fale com a gente.'));
});

test('brief.md: a tabela de cima fica, a parte lida entra uma vez, com data em toda linha', noNavegador, () => {
  exigirNavegador();
  const md = fs.readFileSync(brief, 'utf8');
  assert.ok(md.includes('| Plano de expansão do Café Aurora'));
  assert.equal(md.split(MARCA_INICIO).length, 2);
  const linhas = md.slice(md.indexOf(MARCA_INICIO), md.indexOf(MARCA_FIM)).split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Fato'));
  assert.ok(linhas.length >= 10, String(linhas.length));
  for (const l of linhas) assert.ok(l.endsWith(`| ${DATA} |`), l);
  assert.equal(r.dados.fatos_registrados, linhas.length);
  assert.ok(md.indexOf(MARCA_FIM) < md.indexOf('## Material disponível'));
  assert.equal(fs.readFileSync(path.join(pasta, 'coleta', 'brief-antes-da-leitura.md'), 'utf8'), fs.readFileSync(MOLDE_BRIEF, 'utf8'), 'o brief de antes ficou guardado');
});

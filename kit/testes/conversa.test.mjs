// Conversa sem jargão, coleta em duas perguntas e uma frase de andamento a cada passo da revisão.
// Tudo o que é mostrado à pessoa (os textos de kit/mensagens.json e de instalar/mensagens.json, as
// falas entre aspas das skills e do AGENTS.md e a porta de entrada do README) não pode ter palavra
// técnica. A comparação é por palavra, sem acento e sem diferença de maiúscula, sem expressão regular.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ler = (rel) => fs.readFileSync(path.join(RAIZ, ...rel.split('/')), 'utf8');
const lerJson = (rel) => JSON.parse(ler(rel));

// Palavras que a pessoa nunca lê. O nome do aplicativo Terminal fica de fora: a pessoa precisa
// achá-lo na tela. As da segunda linha são do jeito de fazer apresentação no estúdio: a pessoa
// ouve "tela", "clique" e "apresentação", nunca "deck" ou "beat".
const PROIBIDAS = Object.freeze([
  'rodada', 'rodadas', 'nota', 'notas', 'json', 'pasta', 'pastas', 'comando', 'comandos', 'zip',
  'preflight', 'revisor', 'revisores', 'revisora', 'revisoras', 'script', 'scripts', 'viewport', 'cdn',
  'sandbox', 'npm', 'build', 'log', 'logs', 'html', 'css', 'md', 'mjs',
  'deck', 'decks', 'beat', 'beats', 'gsap', 'iframe', 'render',
]);

const ehMarcaDeAcento = (ch) => ch.codePointAt(0) >= 0x300 && ch.codePointAt(0) <= 0x36f;
const semAcento = (s) => [...s.normalize('NFD')].filter((ch) => !ehMarcaDeAcento(ch)).join('').toLowerCase();

// Tira o que está entre {{ }}: é o nome de um valor que o assistente troca, não texto lido.
function semMarcadores(texto) {
  let saida = '';
  let resto = texto;
  for (;;) {
    const ini = resto.indexOf('{{');
    if (ini === -1) return saida + resto;
    const fim = resto.indexOf('}}', ini + 2);
    if (fim === -1) return saida + resto;
    saida += `${resto.slice(0, ini)} `;
    resto = resto.slice(fim + 2);
  }
}

function palavras(texto) {
  const lista = [];
  let atual = '';
  for (const ch of `${semAcento(semMarcadores(texto))} `) {
    if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9')) atual += ch;
    else {
      if (atual) lista.push(atual);
      atual = '';
    }
  }
  return lista;
}

export const palavrasProibidas = (texto) => palavras(texto).filter((p) => PROIBIDAS.includes(p));

function falasDoKit() {
  return Object.entries(lerJson('kit/mensagens.json'))
    .filter(([codigo]) => !codigo.startsWith('_'))
    .map(([codigo, m]) => ({ onde: `kit/mensagens.json ${codigo}`, texto: m.texto }));
}

const CAMPOS_DE_FALA = Object.freeze(['texto', 'nome', 'frase', 'consequencia', 'pronto']);
function falasDoInstalador() {
  const json = lerJson('instalar/mensagens.json');
  const falas = [];
  for (const grupo of ['textos', 'itens', 'erros']) {
    for (const [codigo, m] of Object.entries(json[grupo])) {
      for (const [campo, valor] of Object.entries(m)) {
        const onde = `instalar/mensagens.json ${grupo}.${codigo}.${campo}`;
        if (typeof valor === 'string' && (CAMPOS_DE_FALA.includes(campo) || campo.startsWith('linha_'))) falas.push({ onde, texto: valor });
        if (Array.isArray(valor) && campo.startsWith('opcoes')) for (const o of valor) falas.push({ onde, texto: o });
      }
    }
  }
  return falas;
}

// Linhas de um Markdown sem o cabeçalho YAML e sem bloco de código.
function linhasDeTexto(markdown) {
  const linhas = markdown.split('\n');
  let i = 0;
  if (linhas[0] === '---') {
    i = linhas.indexOf('---', 1) + 1;
  }
  const saida = [];
  let emCodigo = false;
  for (; i < linhas.length; i += 1) {
    if (linhas[i].trim().startsWith('```')) {
      emCodigo = !emCodigo;
      continue;
    }
    if (!emCodigo) saida.push(linhas[i]);
  }
  return saida;
}

// Separa uma linha em falas (trechos entre aspas retas) e no resto (a instrução ao assistente).
// Fora das aspas, o que está entre crases é nome de código ou de arquivo, não é lido pela pessoa, e
// aspas ali dentro não abrem fala. Dentro de uma fala, a crase é só enfeite: o nome entre crases é
// dito à pessoa e é conferido como o resto.
export function separarLinha(linha) {
  const falas = [];
  let resto = '';
  let fala = '';
  let emFala = false;
  let emCrase = false;
  for (const ch of linha) {
    if (emFala) {
      if (ch === '"') {
        falas.push(fala);
        fala = '';
        emFala = false;
      } else if (ch !== '`') fala += ch;
    } else if (ch === '`') {
      emCrase = !emCrase;
      resto += ' ';
    } else if (emCrase) continue;
    else if (ch === '"') {
      emFala = true;
      resto += ' ';
    } else resto += ch;
  }
  return { falas, resto };
}

// Fala de skill: o trecho entre aspas retas. Trecho com <marcador> é molde de arquivo ou pedido a
// outro assistente (as lentes da revisão), nunca é dito à pessoa.
export function falasDoMarkdown(markdown) {
  const falas = [];
  for (const linha of linhasDeTexto(markdown)) {
    for (const t of separarLinha(linha).falas) {
      const ini = t.indexOf('<');
      if (ini !== -1 && t.indexOf('>', ini) !== -1) continue;
      if (t.trim()) falas.push(t);
    }
  }
  return falas;
}

// Fala sem aspas: a frase que manda dizer algo à pessoa ("Diga à pessoa a nota", "explique que o
// PDF está na pasta"). Vale da palavra que manda falar até o fim da frase; "nunca diga" e
// "não mostre" são proibição, não fala.
const VERBOS_DE_FALA = Object.freeze(['diga', 'explique', 'conte', 'avise', 'mostre', 'pergunte', 'fale', 'responda']);
const NEGACOES = Object.freeze(['nunca', 'nao', 'nem', 'sem']);
export function instrucoesDeFala(markdown) {
  const trechos = [];
  for (const linha of linhasDeTexto(markdown)) {
    for (const frase of separarLinha(linha).resto.split('. ')) {
      const lista = palavras(frase);
      const k = lista.findIndex((p) => VERBOS_DE_FALA.includes(p));
      if (k === -1 || (k > 0 && NEGACOES.includes(lista[k - 1]))) continue;
      trechos.push(lista.slice(k).join(' '));
    }
  }
  return trechos;
}

const SKILLS = path.join(RAIZ, '.claude', 'skills');
function falasDasSkills() {
  const falas = [];
  for (const skill of fs.readdirSync(SKILLS).sort()) {
    const arquivo = path.join(SKILLS, skill, 'SKILL.md');
    if (!fs.existsSync(arquivo)) continue;
    const markdown = fs.readFileSync(arquivo, 'utf8');
    for (const texto of [...falasDoMarkdown(markdown), ...instrucoesDeFala(markdown)]) falas.push({ onde: `.claude/skills/${skill}/SKILL.md`, texto });
  }
  const agents = ler('AGENTS.md');
  for (const texto of [...falasDoMarkdown(agents), ...instrucoesDeFala(agents)]) falas.push({ onde: 'AGENTS.md', texto });
  return falas;
}

// Tira o endereço dos links do Markdown, "[texto](endereço)": só o texto é lido pela pessoa.
function semEnderecoDeLink(texto) {
  let saida = '';
  let resto = texto;
  for (;;) {
    const ini = resto.indexOf('](');
    const fim = ini === -1 ? -1 : resto.indexOf(')', ini);
    if (fim === -1) return saida + resto;
    saida += `${resto.slice(0, ini)}]`;
    resto = resto.slice(fim + 1);
  }
}

function portaDeEntrada() {
  const readme = ler('README.md');
  const ini = readme.indexOf('<!-- porta-de-entrada');
  const fim = readme.indexOf('<!-- /porta-de-entrada -->');
  assert.ok(ini !== -1 && fim > ini, 'README sem a porta de entrada marcada');
  const corpo = readme.slice(readme.indexOf('-->', ini) + 3, fim);
  return [{ onde: 'README.md (porta de entrada)', texto: semEnderecoDeLink(linhasDeTexto(corpo).join('\n')) }];
}

test('o filtro de jargão acha a palavra inteira, sem acento nem maiúscula, e ignora {{ }}', () => {
  assert.deepEqual(palavrasProibidas('O .zip está na Pasta da apresentação'), ['zip', 'pasta']);
  assert.deepEqual(palavrasProibidas('Os REVISORES deram a nota da rodada'), ['revisores', 'nota', 'rodada']);
  assert.deepEqual(palavrasProibidas('Abri o Deck: cada Beat entra com um clique'), ['deck', 'beat']);
  assert.deepEqual(palavrasProibidas('As suas apresentações continuam em {{pasta_do_estudio}}.'), []);
  assert.deepEqual(palavrasProibidas('anotação, pastel, logo, login e debate não são jargão'), []);
  assert.deepEqual(falasDoMarkdown('---\ndescription: "pasta"\n---\nDiga: "Pronto." e `"zip"`\n```\n"json"\n```\n"Leia <x.json>"'), ['Pronto.']);
});

test('o filtro lê o nome entre crases dentro da fala e a fala sem aspas', () => {
  // crase dentro de aspas não esconde a palavra: a pessoa lê o nome
  assert.deepEqual(falasDoMarkdown('Diga: "Abra o `index.html`"'), ['Abra o index.html']);
  assert.deepEqual(palavrasProibidas(falasDoMarkdown('"Abra o `index.html`"').join(' ')), ['html']);
  // fala sem aspas: da palavra que manda falar até o fim da frase; "nunca diga" é proibição
  const md = [
    '- **Não passou:** pare. Diga à pessoa, em até 4 frases, a nota e o que falta.',
    'Nunca diga nota. Rode `./estudio pdf` e diga o texto de `PDF_PRONTO`.',
    '4. Explique em poucas linhas: o PDF está na pasta `apresentacoes`; nada foi publicado.',
    'Se sim, mostre o caminho. Para você: é pela pasta de skills.',
  ].join('\n');
  assert.deepEqual(instrucoesDeFala(md).map(palavrasProibidas), [['nota'], [], ['pasta'], []]);
});

test('nenhuma mensagem mostrada à pessoa tem palavra técnica', () => {
  const falas = [...falasDoKit(), ...falasDoInstalador(), ...falasDasSkills(), ...portaDeEntrada()];
  // o extrator não pode passar por estar vazio
  assert.ok(falasDoKit().length >= 40);
  assert.ok(falasDoInstalador().length >= 40);
  assert.ok(falasDasSkills().length >= 40);
  const achados = [];
  for (const { onde, texto } of falas) {
    const ruins = palavrasProibidas(texto);
    if (ruins.length) achados.push(`${onde}: ${ruins.join(', ')} em "${texto.slice(0, 90)}"`);
  }
  assert.deepEqual(achados, []);
});

test('coleta: só duas perguntas obrigatórias (o assunto e a plateia, e o que ela faz depois); o resto é opcional e pode ser delegado', () => {
  const skill = ler('.claude/skills/nova-apresentacao/SKILL.md');
  const ini = skill.indexOf('**Perguntas obrigatórias (só estas duas)**');
  assert.ok(ini !== -1, 'nova-apresentacao sem o bloco das perguntas obrigatórias');
  const bloco = skill.slice(ini, skill.indexOf('\n\n', ini));
  const perguntas = bloco.split('\n').filter((l) => l.length > 2 && l[0] >= '0' && l[0] <= '9' && l[1] === '.');
  assert.equal(perguntas.length, 2, bloco);
  assert.ok(perguntas[0].includes('para quem'), perguntas[0]);
  assert.ok(perguntas[1].includes('depois'), perguntas[1]);
  assert.ok(skill.includes('"Pode decidir por mim ★"'));
  assert.ok(skill.includes('Tempo, formato, material e gosto visual são sempre opcionais'));
  // a marca não abre outra rodada de perguntas antes da apresentação
  assert.ok(ler('AGENTS.md').includes('Não pare para perguntar: a marca nasce junto com a primeira apresentação'));
  assert.ok(ler('.claude/skills/minha-marca/SKILL.md').includes('Vinda da skill `nova-apresentacao` (a primeira apresentação), não pergunte nada.'));
});

test('revisão: uma frase de andamento antes de cada passo, todas em kit/mensagens.json', () => {
  const kit = lerJson('kit/mensagens.json');
  const nova = ler('.claude/skills/nova-apresentacao/SKILL.md');
  const revisar = ler('.claude/skills/revisar/SKILL.md');
  for (const c of ['ANDAMENTO_ABRI', 'ANDAMENTO_CONFERENCIA', 'ANDAMENTO_FOTOS', 'ANDAMENTO_OLHARES', 'ANDAMENTO_AJUSTES', 'ANDAMENTO_PRONTO']) {
    assert.ok(kit[c], `${c} em kit/mensagens.json`);
    assert.ok(nova.includes(c), `${c} na nova-apresentacao`);
  }
  assert.ok(revisar.includes('`ANDAMENTO_*`'), 'a revisar manda dizer as frases de andamento');
});

test('porta de entrada: diz onde começar e não promete o que não mediu', () => {
  const porta = portaDeEntrada()[0].texto;
  assert.ok(porta.includes('escolha o que tem o seu nome') && porta.includes('casinha'));
  const registro = ler('instalar/comandos-unicos.md');
  assert.ok(registro.includes('**Situação da medição:'));
  assert.ok(registro.includes('PASTA_NA_NUVEM') && registro.includes('mudar-pasta'));
});

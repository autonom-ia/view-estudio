// Regras do repositório: códigos de mensagem existem, nada de expressão regular, nada privado,
// nenhum <select> nativo nem endereço externo no molde.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ESTE = fileURLToPath(import.meta.url);
const KIT = path.join(path.dirname(ESTE), '..');
const RAIZ = path.join(KIT, '..');

// Pastas que não são nossas ou não são código versionado.
const IGNORAR = new Set(['.git', 'node_modules', '.ferramentas', 'apresentacoes', 'referencias', 'minha-marca']);
// Bibliotecas de terceiros copiadas sem alteração.
const TERCEIROS = [['vendor', 'gsap'], ['vendor', 'lenis']].map((p) => p.join(path.sep));

function arquivos(pasta, fins) {
  const lista = [];
  if (!fs.existsSync(pasta)) return lista;
  for (const nome of fs.readdirSync(pasta)) {
    if (IGNORAR.has(nome)) continue;
    const c = path.join(pasta, nome);
    if (fs.statSync(c).isDirectory()) lista.push(...arquivos(c, fins));
    else if (fins.some((f) => nome.endsWith(f))) lista.push(c);
  }
  return lista;
}
const deTerceiros = (arquivo) => TERCEIROS.some((t) => arquivo.includes(t));
const rel = (a) => path.relative(RAIZ, a).split(path.sep).join('/');

const ehCodigo = (s) => s.length >= 2 && [...s].every((ch) => (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_');

function literaisDepois(texto, prefixo) {
  const achados = [];
  let i = texto.indexOf(prefixo);
  while (i !== -1) {
    const ini = i + prefixo.length;
    const fim = texto.indexOf("'", ini);
    if (fim !== -1) achados.push(texto.slice(ini, fim));
    i = texto.indexOf(prefixo, ini);
  }
  return achados;
}

test('todo código usado no kit existe em kit/mensagens.json', () => {
  const mensagens = JSON.parse(fs.readFileSync(path.join(KIT, 'mensagens.json'), 'utf8'));
  const faltando = [];
  for (const arquivo of arquivos(path.join(KIT, 'scripts'), ['.mjs'])) {
    const texto = fs.readFileSync(arquivo, 'utf8');
    for (const prefixo of ["falha('", "reprovado('", "aviso('", "codigo: '", "erro('", "KitErro('"]) {
      for (const c of literaisDepois(texto, prefixo)) if (ehCodigo(c) && !mensagens[c]) faltando.push(`${c} (${rel(arquivo)})`);
    }
    for (const c of literaisDepois(texto, "? '")) if (ehCodigo(c) && c.includes('_') && !mensagens[c]) faltando.push(`${c} (${rel(arquivo)})`);
  }
  assert.deepEqual(faltando, []);
});

test('toda mensagem do kit tem texto e ação', () => {
  const mensagens = JSON.parse(fs.readFileSync(path.join(KIT, 'mensagens.json'), 'utf8'));
  for (const [codigo, m] of Object.entries(mensagens)) {
    assert.ok(typeof m.texto === 'string' && m.texto.trim(), `${codigo} sem texto`);
    assert.ok(typeof m.acao === 'string' && m.acao.trim(), `${codigo} sem ação`);
  }
});

test('códigos do kit não colidem com os do instalador', (t) => {
  const arquivo = path.join(RAIZ, 'instalar', 'mensagens.json');
  if (!fs.existsSync(arquivo)) {
    t.skip('instalar/mensagens.json ainda não existe');
    return;
  }
  const kit = JSON.parse(fs.readFileSync(path.join(KIT, 'mensagens.json'), 'utf8'));
  // O instalador agrupa os códigos (erros, sucesso, textos); junta os grupos para comparar.
  const bruto = JSON.parse(fs.readFileSync(arquivo, 'utf8'));
  const inst = { ...(bruto.erros || {}), ...(bruto.sucesso || {}), ...(bruto.textos || {}) };
  assert.ok(Object.keys(inst).length > 10, 'instalar/mensagens.json sem os grupos erros/sucesso/textos');
  const comuns = new Set(['DESCONHECIDO', 'ESTUDIO_NAO_INSTALADO']);
  const iguais = Object.keys(kit).filter((c) => !c.startsWith('_') && !comuns.has(c) && inst[c] !== undefined);
  assert.deepEqual(iguais, []);
});

// Montados em pedaços para este arquivo não se acusar.
const B = '/';
const PROIBIDOS_JS = [
  `new Reg${'Exp'}`, `Reg${'Exp'}(`, `.mat${'ch'}(`, `.mat${'chAll'}(`, `.sea${'rch'}(`, `.ex${'ec'}(`,
];

// Acha literal de expressão regular em JavaScript: uma "/" em posição de valor (depois de
// = ( , : ! & | ? ; { [ + - * % < > ~ ^, de return/typeof/… ou no começo), seguida de algo que
// não seja "/" nem "*", fora de string, de template e de comentário. Laço de caracteres com estado.
const ANTES_DE_VALOR = '=(,:!&|?;{[+-*%<>~^';
const PALAVRAS_ANTES_DE_VALOR = ['return', 'typeof', 'case', 'do', 'else', 'in', 'of', 'new', 'delete', 'void', 'throw', 'instanceof', 'yield', 'await'];
const ehLetraDeNome = (ch) => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch === '_' || ch === '$';
const ehEspaco = (ch) => ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';

function literaisDeRegex(codigo) {
  const achados = [];
  const pilha = []; // 'template' ou 'chave' (profundidade de { dentro de ${ })
  let ultimo = ''; // último caractere significativo fora de string e comentário
  let palavra = ''; // última palavra lida (para return, typeof…)
  let linha = 1;
  let i = 0;
  const n = codigo.length;
  if (codigo.startsWith('#!')) while (i < n && codigo[i] !== '\n') i += 1; // linha #!/usr/bin/env node
  const pularString = (aspas) => {
    i += 1;
    while (i < n && codigo[i] !== aspas) {
      if (codigo[i] === '\\') i += 1;
      else if (codigo[i] === '\n') linha += 1;
      i += 1;
    }
    i += 1;
  };
  // dentro de template: volta 'fim' (crase) ou 'expressao' (${)
  const pularTemplate = () => {
    while (i < n) {
      const ch = codigo[i];
      if (ch === '\\') { i += 2; continue; }
      if (ch === '\n') linha += 1;
      if (ch === '`') { i += 1; return 'fim'; }
      if (ch === '$' && codigo[i + 1] === '{') { i += 2; return 'expressao'; }
      i += 1;
    }
    return 'fim';
  };
  while (i < n) {
    const ch = codigo[i];
    if (ch === '\n') { linha += 1; i += 1; continue; }
    if (ehEspaco(ch)) { i += 1; continue; }
    if (ch === '/' && codigo[i + 1] === '/') {
      while (i < n && codigo[i] !== '\n') i += 1;
      continue;
    }
    if (ch === '/' && codigo[i + 1] === '*') {
      i += 2;
      while (i < n && !(codigo[i] === '*' && codigo[i + 1] === '/')) { if (codigo[i] === '\n') linha += 1; i += 1; }
      i += 2;
      continue;
    }
    if (ch === "'" || ch === '"') { pularString(ch); ultimo = ch; palavra = ''; continue; }
    if (ch === '`') {
      i += 1;
      if (pularTemplate() === 'expressao') { pilha.push(0); ultimo = '{'; } else ultimo = '`';
      palavra = '';
      continue;
    }
    if (ch === '{' && pilha.length) pilha[pilha.length - 1] += 1;
    if (ch === '}' && pilha.length) {
      if (pilha[pilha.length - 1] === 0) {
        pilha.pop();
        i += 1;
        if (pularTemplate() === 'expressao') { pilha.push(0); ultimo = '{'; } else ultimo = '`';
        palavra = '';
        continue;
      }
      pilha[pilha.length - 1] -= 1;
    }
    if (ch === '/') {
      const posicaoDeValor = ultimo === '' || ANTES_DE_VALOR.includes(ultimo) || PALAVRAS_ANTES_DE_VALOR.includes(palavra);
      if (posicaoDeValor) {
        let fim = i + 1;
        while (fim < n && codigo[fim] !== '\n' && fim - i < 40) fim += 1;
        achados.push({ linha, trecho: codigo.slice(i, fim) });
        // pula o corpo do literal para não confundir o resto
        i += 1;
        let classe = false;
        while (i < n && codigo[i] !== '\n') {
          const c = codigo[i];
          if (c === '\\') { i += 2; continue; }
          if (c === '[') classe = true;
          else if (c === ']') classe = false;
          else if (c === '/' && !classe) break;
          i += 1;
        }
        i += 1;
        while (i < n && ehLetraDeNome(codigo[i])) i += 1;
        ultimo = ')';
        palavra = '';
        continue;
      }
    }
    if (ehLetraDeNome(ch)) {
      let fim = i;
      while (fim < n && ehLetraDeNome(codigo[fim])) fim += 1;
      palavra = codigo.slice(i, fim);
      ultimo = codigo[fim - 1];
      i = fim;
      continue;
    }
    ultimo = ch;
    palavra = '';
    i += 1;
  }
  return achados;
}

// Num .html, só o que está dentro de <script>…</script> é JavaScript.
function scriptsDoHtml(html) {
  const blocos = [];
  const baixo = html.toLowerCase();
  let i = baixo.indexOf('<script');
  while (i !== -1) {
    const ini = baixo.indexOf('>', i);
    const fim = baixo.indexOf('</script', ini);
    if (ini === -1 || fim === -1) break;
    blocos.push(html.slice(ini + 1, fim));
    i = baixo.indexOf('<script', fim);
  }
  return blocos;
}

test('o detector de literal acha regex e não acusa divisão, comentário nem string', () => {
  const r = (t) => literaisDeRegex(t).length;
  assert.equal(r(`const r = ${B}abc${B};`), 1);
  assert.equal(r(`x = ${B}a+${B}g`), 1);
  assert.equal(r(`if (${B}abc${B}.test(s)) f();`), 1);
  assert.equal(r(`const f = (s) => ${B}x${B}.test(s);`), 1);
  assert.equal(r(`return ${B}x${B}i;`), 1);
  assert.equal(r(`s.split(${B},${B});`), 1);
  assert.equal(r(`const t = \`a\${[${B}x${B}][0]}b\`;`), 1);
  assert.equal(r(`const m = a ${B} b; const k = (c + d) ${B} 2; const z = v[0] ${B} 3;`), 0);
  assert.equal(r(`// a = ${B}x${B}\n/* (${B}y${B}) */ const u = 'http:${B}${B}x' + "a${B}b" + \`c${B}\${a ${B} 2}d\`;`), 0);
}); 
const PROIBIDOS_SH = [`=${'~'}`, `grep -${'E'}`, `grep -${'P'}`, `egrep`];
const PROIBIDOS_PS1 = [`-mat${'ch'} `, `-repl${'ace'} `, `-spl${'it'} `, `[reg${'ex'}]`, `Select-String -Pat${'tern'}`];

test('nenhuma expressão regular no código do repositório', () => {
  const achados = [];
  const checar = (lista, proibidos) => {
    for (const arquivo of lista) {
      if (arquivo === ESTE || deTerceiros(arquivo)) continue;
      const texto = fs.readFileSync(arquivo, 'utf8');
      for (const p of proibidos) if (texto.includes(p)) achados.push(`${rel(arquivo)}: ${p}`);
    }
  };
  checar(arquivos(RAIZ, ['.mjs', '.js', '.html', '.cjs']), PROIBIDOS_JS);
  for (const arquivo of arquivos(RAIZ, ['.mjs', '.js', '.cjs', '.html'])) {
    if (arquivo === ESTE || deTerceiros(arquivo)) continue;
    const texto = fs.readFileSync(arquivo, 'utf8');
    const blocos = arquivo.endsWith('.html') ? scriptsDoHtml(texto) : [texto];
    for (const bloco of blocos) for (const a of literaisDeRegex(bloco)) achados.push(`${rel(arquivo)}:${a.linha}: ${a.trecho}`);
  }
  checar([...arquivos(RAIZ, ['.sh']), path.join(RAIZ, 'estudio')].filter((a) => fs.existsSync(a)), PROIBIDOS_SH);
  checar(arquivos(RAIZ, ['.ps1']), PROIBIDOS_PS1);
  assert.deepEqual(achados, []);
});

// Nomes, domínios e servidores que não podem aparecer em nada publicado. Ficam aqui só como
// impressão digital (SHA-256, primeiros 24 caracteres), para o próprio teste não publicar os nomes.
// Cada palavra do texto (e cada pedaço dela separado por . - _) é conferida contra a lista.
const DIGITAIS = new Set([
  '138df632fd0de2067dfcd75b', '064d1e677b995c1f68eaf774', '7dce9376d2930f33ae0c841c', '186f25181aaf249af7fa5a5a',
  '344bff8b2788383a072daddf', 'd4dfebb4d4870361bcf38648', 'd65c0627d93f1b36bcc53664', '86b468bf8549504c71446c7d',
  '791e0160c30baee8322e49f0', '0c9469351793cc965bc41d22', '7499155658c3de953e2f7685', 'f08b9ed777b422e9031ea92f',
  '6013de0381f648b7f2151888', '5542b87967a040b52faa59e7',
]);
// sigla de três letras: só em maiúsculas e como palavra inteira (MENSAGENS não conta)
const DIGITAL_SIGLA = '09ddf36201cda6a7b9c8ace9';
const digital = (s) => crypto.createHash('sha256').update(s).digest('hex').slice(0, 24);
const CAMINHO_DE_MAQUINA = `/Us${'ers/'}`;

function palavrasDoTexto(texto) {
  const lista = [];
  let atual = '';
  const ehDaPalavra = (ch) => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch > '\u007f' || ch === '.' || ch === '-' || ch === '_';
  for (const ch of `${texto} `) {
    if (ehDaPalavra(ch)) atual += ch;
    else {
      if (atual) lista.push(atual);
      atual = '';
    }
  }
  return lista;
}

function achadosPrivados(texto) {
  const achados = new Set();
  for (const palavra of palavrasDoTexto(texto.normalize('NFC'))) {
    const pedacos = [palavra];
    for (const sep of ['.', '-', '_']) for (const p of palavra.split(sep)) if (p && p !== palavra) pedacos.push(p);
    for (const p of pedacos) {
      if (DIGITAIS.has(digital(p.toLowerCase()))) achados.add(digital(p.toLowerCase()));
      if (digital(p) === DIGITAL_SIGLA) achados.add('sigla');
    }
  }
  if (texto.includes(CAMINHO_DE_MAQUINA)) achados.add('caminho de máquina');
  return [...achados];
}

test('a impressão digital acha o nome mesmo dentro de domínio, caminho ou e-mail', () => {
  assert.deepEqual(achadosPrivados('nada aqui, MENSAGENS, ensaio'), []);
  assert.equal(achadosPrivados(`x@${['clau', 'dete'].join('')}.example`).length, 1);
  assert.equal(achadosPrivados(`cidade ${['E', 'NS'].join('')}.`).length, 1);
});

test('nada privado no repositório (clientes, domínios, servidores, caminhos de máquina)', () => {
  const lista = arquivos(RAIZ, ['.mjs', '.js', '.json', '.html', '.css', '.md', '.txt', '.sh', '.ps1', '.cmd', '.yml', '.env', '.svg'])
    .filter((a) => a !== ESTE && !deTerceiros(a) && !a.endsWith('package-lock.json'));
  for (const extra of ['estudio', 'VERSAO', '.gitignore']) if (fs.existsSync(path.join(RAIZ, extra))) lista.push(path.join(RAIZ, extra));
  const achados = [];
  for (const arquivo of lista) {
    const texto = fs.readFileSync(arquivo, 'utf8');
    for (const a of achadosPrivados(texto)) achados.push(`${rel(arquivo)}: ${a}`);
  }
  assert.deepEqual(achados, []);
});

test('molde sem <select> nativo, sem endereço externo e com o andaime das telas', () => {
  const htmls = arquivos(path.join(KIT, 'molde'), ['.html']).concat(arquivos(path.join(KIT, 'molde-cena'), ['.html']));
  assert.ok(htmls.length >= 4);
  for (const h of htmls) {
    const t = fs.readFileSync(h, 'utf8').toLowerCase();
    assert.equal(t.includes('<select'), false, `${rel(h)} tem <select>`);
    for (const attr of ['src="http', "src='http", 'href="http', "href='http", 'url(http', 'url("http', "url('http"]) {
      assert.equal(t.includes(attr), false, `${rel(h)} aponta para fora (${attr})`);
    }
  }
  const slides = arquivos(path.join(KIT, 'molde', 'deck', 'slides'), ['.html']);
  for (const s of slides) {
    const t = fs.readFileSync(s, 'utf8');
    assert.ok(t.includes('../assets/vendor/gsap/gsap.min.js'), `${rel(s)} sem gsap local`);
    assert.ok(t.includes('../assets/vendor/palco/cena.js'), `${rel(s)} sem cena.js`);
    assert.ok(t.includes('data-beat='), `${rel(s)} sem beats`);
    assert.ok(t.indexOf('cena.js') > t.indexOf('gsap.min.js'), `${rel(s)}: cena.js precisa vir depois do gsap`);
  }
  for (const v of ['gsap/gsap.min.js', 'lenis/lenis.min.js', 'palco/palco.js', 'palco/cena.js', 'palco/tela.css']) {
    assert.ok(fs.existsSync(path.join(KIT, 'molde', 'deck', 'assets', 'vendor', ...v.split('/'))), v);
  }
  const palco = fs.readFileSync(path.join(KIT, 'molde', 'deck', 'assets', 'vendor', 'palco', 'palco.js'), 'utf8');
  const cena = fs.readFileSync(path.join(KIT, 'molde', 'deck', 'assets', 'vendor', 'palco', 'cena.js'), 'utf8');
  assert.ok(palco.includes("BroadcastChannel('estudio-roteiro')"));
  assert.ok(cena.includes("BroadcastChannel('estudio-roteiro')"));
});

test('cada tela do molde tem roteiro com o mesmo número de beats', () => {
  const slides = fs.readdirSync(path.join(KIT, 'molde', 'deck', 'slides')).sort();
  const beatsDaTela = (texto) => {
    let maior = 0;
    for (const chave of ['data-beat="', 'data-recua="', 'data-sai="']) {
      let i = texto.indexOf(chave);
      while (i !== -1) {
        const fim = texto.indexOf('"', i + chave.length);
        maior = Math.max(maior, Number(texto.slice(i + chave.length, fim)));
        i = texto.indexOf(chave, fim);
      }
    }
    return maior + 1;
  };
  slides.forEach((nome, k) => {
    const roteiro = JSON.parse(fs.readFileSync(path.join(KIT, 'molde', 'roteiro', `S0${k + 1}.json`), 'utf8'));
    const texto = fs.readFileSync(path.join(KIT, 'molde', 'deck', 'slides', nome), 'utf8');
    assert.equal(roteiro.beats.length, beatsDaTela(texto), nome);
  });
});

test('workflows: ações fixadas por SHA do commit e Node igual ao de instalar/versoes.env', () => {
  const env = fs.readFileSync(path.join(RAIZ, 'instalar', 'versoes.env'), 'utf8').split('\n');
  const linhaNode = env.find((l) => l.startsWith('NODE_VERSAO='));
  assert.ok(linhaNode, 'versoes.env sem NODE_VERSAO');
  const nodeFixo = linhaNode.slice('NODE_VERSAO='.length).trim();
  const ehHex = (t) => t.length === 40 && [...t].every((ch) => (ch >= '0' && ch <= '9') || (ch >= 'a' && ch <= 'f'));
  const pasta = path.join(RAIZ, '.github', 'workflows');
  const problemas = [];
  for (const nome of fs.readdirSync(pasta).filter((n) => n.endsWith('.yml'))) {
    for (const bruta of fs.readFileSync(path.join(pasta, nome), 'utf8').split('\n')) {
      const l = bruta.trim();
      const usa = l.indexOf('uses:');
      if (usa !== -1 && !l.startsWith('#')) {
        const alvo = l.slice(usa + 'uses:'.length).trim().split(' ')[0];
        const arroba = alvo.lastIndexOf('@');
        if (arroba === -1 || !ehHex(alvo.slice(arroba + 1))) problemas.push(`${nome}: ${alvo}`);
      }
      if (l.startsWith('node-version:')) {
        const v = l.slice('node-version:'.length).trim().split("'").join('').split('"').join('');
        if (v !== nodeFixo) problemas.push(`${nome}: node-version ${v} (versoes.env: ${nodeFixo})`);
      }
    }
  }
  assert.deepEqual(problemas, []);
});

test('estudio.cmd: a linha que roda o Node termina em "& exit /b" e o erro sem Node não repete argumento', () => {
  const linhas = fs.readFileSync(path.join(RAIZ, 'estudio.cmd'), 'utf8').split('\n').map((l) => l.trim());
  const rodar = linhas.filter((l) => l.includes('kit\\scripts\\estudio.mjs') && !l.toLowerCase().startsWith('rem'));
  assert.equal(rodar.length, 1, 'uma linha só chama o estudio.mjs');
  assert.ok(rodar[0].endsWith('%* & exit /b'), rodar[0]);
  const ecos = linhas.filter((l) => l.toLowerCase().startsWith('echo {'));
  assert.ok(ecos.length >= 1);
  for (const e of ecos) {
    assert.equal(e.includes('%~1'), false, e);
    assert.equal(e.includes('%1'), false, e);
    assert.ok(e.includes('"comando":""'), e);
  }
});

test('.gitattributes: CRLF para *.cmd e *.ps1, LF para os scripts de shell', () => {
  const linhas = fs.readFileSync(path.join(RAIZ, '.gitattributes'), 'utf8').split('\n').map((l) => l.trim().split(' ').filter(Boolean).join(' '));
  for (const esperado of ['*.cmd text eol=crlf', '*.ps1 text eol=crlf', '*.sh text eol=lf', 'estudio text eol=lf']) {
    assert.ok(linhas.includes(esperado), esperado);
  }
});

// Valor entre aspas (simples ou duplas) logo depois de um prefixo, na primeira linha que começa com ele.
function valorDepois(texto, prefixo) {
  const linha = texto.split('\n').map((l) => l.trim()).find((l) => l.startsWith(prefixo));
  if (!linha) return null;
  const resto = linha.slice(prefixo.length).trim();
  const aspas = resto[0];
  if (aspas !== '"' && aspas !== "'") return null;
  const fim = resto.indexOf(aspas, 1);
  return fim === -1 ? null : resto.slice(1, fim);
}

test('a versão é a mesma nos 6 lugares (VERSAO, package.json, package-lock.json ×2, instalar.sh, instalar.ps1)', () => {
  const versao = fs.readFileSync(path.join(RAIZ, 'VERSAO'), 'utf8').trim();
  assert.ok(versao.split('.').length === 3, `VERSAO estranha: ${versao}`);
  const pacote = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
  const trava = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package-lock.json'), 'utf8'));
  const sh = fs.readFileSync(path.join(RAIZ, 'instalar', 'instalar.sh'), 'utf8');
  const ps1 = fs.readFileSync(path.join(RAIZ, 'instalar', 'instalar.ps1'), 'utf8');
  const lugares = {
    'package.json version': pacote.version,
    'package-lock.json version': trava.version,
    'package-lock.json packages[""].version': trava.packages && trava.packages[''] && trava.packages[''].version,
    'instalar/instalar.sh VERSAO_ESTUDIO': valorDepois(sh, 'VERSAO_ESTUDIO='),
    'instalar/instalar.ps1 $script:VersaoEstudio': valorDepois(ps1, '$script:VersaoEstudio ='),
  };
  const diferentes = Object.entries(lugares).filter(([, v]) => v !== versao).map(([k, v]) => `${k} = ${v} (VERSAO = ${versao})`);
  assert.deepEqual(diferentes, []);
});

test('receita "Publicar uma versão" lista os 6 lugares e faz o zip da tag', () => {
  const doc = fs.readFileSync(path.join(RAIZ, 'instalar', 'comandos-unicos.md'), 'utf8');
  const ini = doc.indexOf('## Publicar uma versão');
  assert.ok(ini !== -1, 'falta a seção "## Publicar uma versão"');
  const fimRel = doc.indexOf('\n## ', ini + 5);
  const secao = doc.slice(ini, fimRel === -1 ? doc.length : fimRel);
  for (const item of ['VERSAO', 'package.json', 'package-lock.json', 'VERSAO_ESTUDIO', '$script:VersaoEstudio', 'git archive --format=zip --prefix=', '.sha256']) {
    assert.ok(secao.includes(item), `falta ${item}`);
  }
  assert.ok(secao.includes(' vX.Y.Z'), 'o zip sai da tag, não do HEAD');
});

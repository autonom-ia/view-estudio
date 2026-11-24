// Letras do catálogo livre do Google Fonts, já leves: a rota css2 devolve cada fonte em .woff2,
// recortada por alfabeto (só "latin" serve para o português). A licença vem do repositório oficial
// (github.com/google/fonts) e é guardada com o nome da família, para duas licenças nunca se
// sobrescreverem. Tudo aqui é leitura de texto, sem expressão regular e sem rede: a rede fica no
// comando "fonte", que entrega as respostas para estas funções. Portado do Site Estúdio
// (kit/scripts/lib/fontes-google.mjs); a diferença é o font-display (veja cssDasFontes).

export const RAW = 'https://raw.githubusercontent.com/google/fonts/main';
export const CSS2 = 'https://fonts.googleapis.com/css2';
export const HOSTS_PERMITIDOS = Object.freeze(['fonts.googleapis.com', 'fonts.gstatic.com', 'raw.githubusercontent.com']);

// Pasta do repositório oficial por licença, e o nome do arquivo de licença em cada uma.
export const LICENCAS = Object.freeze([
  Object.freeze({ pasta: 'ofl', arquivo: 'OFL.txt', prefixo: 'OFL' }),
  Object.freeze({ pasta: 'apache', arquivo: 'LICENSE.txt', prefixo: 'LICENCA' }),
  Object.freeze({ pasta: 'ufl', arquivo: 'UFL.txt', prefixo: 'LICENCA' }),
]);

// O css2 só devolve .woff2 para navegador moderno; com outro agente, devolve .ttf.
export const AGENTE_MODERNO = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const ehLetraOuNumero = (ch) => (ch >= 'a' && ch <= 'z') || (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9');

// Nome de família aceito: letras, números e espaço (é assim no catálogo: "Big Shoulders Display").
export function familiaValida(familia) {
  const t = String(familia || '').trim();
  if (!t || t.length > 60) return false;
  return [...t].every((ch) => ch === ' ' || ehLetraOuNumero(ch));
}

// "Big Shoulders Display" → "bigshouldersdisplay" (o nome da pasta no repositório oficial).
export function slugDaFamilia(familia) {
  return [...String(familia).toLowerCase()].filter(ehLetraOuNumero).join('');
}

// "Big Shoulders Display" → "BigShouldersDisplay" (o nome próprio dos arquivos e da licença).
export function nomeProprio(familia) {
  return String(familia)
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((p) => [...p].filter(ehLetraOuNumero).join(''))
    .map((p) => p.slice(0, 1).toUpperCase() + p.slice(1))
    .join('');
}

const semAspas = (v) => {
  const t = v.trim();
  return t.startsWith('"') && t.endsWith('"') && t.length >= 2 ? t.slice(1, -1) : t;
};

// METADATA.pb (texto de protobuf) → { nome, licenca, eixos: [{tag,min,max}], estilos: [{estilo,peso}] }.
export function lerMetadados(texto) {
  const meta = { nome: '', licenca: '', eixos: [], estilos: [] };
  const pilha = [];
  let atual = null;
  for (const bruta of String(texto).split('\n')) {
    const linha = bruta.trim();
    if (!linha) continue;
    if (linha.endsWith('{')) {
      const bloco = linha.slice(0, -1).trim();
      pilha.push(bloco);
      if (pilha.length === 1 && bloco === 'axes') atual = { tag: '', min: 0, max: 0 };
      else if (pilha.length === 1 && bloco === 'fonts') atual = { estilo: 'normal', peso: 400 };
      continue;
    }
    if (linha === '}') {
      const bloco = pilha.pop();
      if (pilha.length === 0 && atual) {
        if (bloco === 'axes' && atual.tag) meta.eixos.push(atual);
        if (bloco === 'fonts') meta.estilos.push(atual);
        atual = null;
      }
      continue;
    }
    const dois = linha.indexOf(':');
    if (dois < 1) continue;
    const chave = linha.slice(0, dois).trim();
    const valor = semAspas(linha.slice(dois + 1));
    if (pilha.length === 0) {
      if (chave === 'name') meta.nome = valor;
      else if (chave === 'license') meta.licenca = valor;
    } else if (pilha.length === 1 && atual) {
      if (chave === 'tag') atual.tag = valor;
      else if (chave === 'min_value') atual.min = Number(valor);
      else if (chave === 'max_value') atual.max = Number(valor);
      else if (chave === 'style') atual.estilo = valor;
      else if (chave === 'weight') atual.peso = Number(valor);
    }
  }
  return meta;
}

// --pesos "400..800" (faixa) ou "400,700" (lista). Vazio: todos os que a família tem.
export function lerPesos(texto) {
  if (texto === undefined || texto === true || texto === '') return null;
  const t = String(texto).trim();
  const ponto = t.indexOf('..');
  const numeros = ponto === -1 ? t.split(',').map((p) => Number(p.trim())) : [Number(t.slice(0, ponto)), Number(t.slice(ponto + 2))];
  if (!numeros.length || numeros.some((n) => !Number.isInteger(n) || n < 1 || n > 1000)) return null;
  return { min: Math.min(...numeros), max: Math.max(...numeros), lista: [...new Set(numeros)].sort((a, b) => a - b), faixa: ponto !== -1 };
}

const faixa = (e) => (e.min === e.max ? String(e.min) : `${e.min}..${e.max}`);

// O valor de "family=" do css2: eixos em ordem alfabética (ital, wdth, wght), uma tupla por estilo.
// Sem eixo de peso (família estática): os pesos que existem, dentro do pedido.
export function pedidoDoCss2(meta, { pesos = null, italico = false, larguras = false } = {}) {
  const nome = meta.nome.split(' ').filter(Boolean).join('+');
  const temItalico = italico && meta.estilos.some((s) => s.estilo === 'italic');
  const estilos = temItalico ? [0, 1] : [0];
  const wght = meta.eixos.find((e) => e.tag === 'wght');
  const wdth = larguras ? meta.eixos.find((e) => e.tag === 'wdth') : undefined;
  const tags = [];
  if (temItalico) tags.push('ital');
  if (wdth) tags.push('wdth');
  tags.push('wght');
  let tuplas;
  if (wght) {
    const min = pesos ? Math.max(wght.min, pesos.min) : wght.min;
    const max = pesos ? Math.min(wght.max, pesos.max) : wght.max;
    if (min > max) return null;
    const partes = [...(wdth ? [faixa(wdth)] : []), faixa({ min, max })];
    tuplas = estilos.map((i) => [...(temItalico ? [String(i)] : []), ...partes].join(','));
  } else {
    tuplas = [];
    for (const i of estilos) {
      const estilo = i ? 'italic' : 'normal';
      const existentes = [...new Set(meta.estilos.filter((s) => s.estilo === estilo).map((s) => s.peso))].sort((a, b) => a - b);
      const escolhidos = pesos ? existentes.filter((p) => (pesos.faixa ? p >= pesos.min && p <= pesos.max : pesos.lista.includes(p))) : existentes;
      for (const p of escolhidos) tuplas.push([...(temItalico ? [String(i)] : []), String(p)].join(','));
    }
    if (!tuplas.length) return null;
  }
  return `family=${nome}:${tags.join(',')}@${tuplas.join(';')}&display=swap`;
}

// Resposta do css2 → um bloco por @font-face, com o alfabeto do comentário que vem antes dele.
export function blocosDoCss(texto) {
  const t = String(texto);
  const blocos = [];
  let alfabeto = '';
  let i = 0;
  while (i < t.length) {
    const comentario = t.indexOf('/*', i);
    const face = t.indexOf('@font-face', i);
    if (face === -1) break;
    if (comentario !== -1 && comentario < face) {
      const fim = t.indexOf('*/', comentario);
      if (fim === -1) break;
      alfabeto = t.slice(comentario + 2, fim).trim();
      i = fim + 2;
      continue;
    }
    const abre = t.indexOf('{', face);
    const fecha = t.indexOf('}', abre);
    if (abre === -1 || fecha === -1) break;
    const bloco = { alfabeto, familia: '', estilo: 'normal', peso: '', largura: '', url: '', formato: '', unicode: '' };
    for (const decl of t.slice(abre + 1, fecha).split(';')) {
      const dois = decl.indexOf(':');
      if (dois < 1) continue;
      const chave = decl.slice(0, dois).trim();
      const valor = decl.slice(dois + 1).trim();
      if (chave === 'font-family') bloco.familia = valor.split("'").join('').split('"').join('');
      else if (chave === 'font-style') bloco.estilo = valor;
      else if (chave === 'font-weight') bloco.peso = valor;
      else if (chave === 'font-stretch') bloco.largura = valor;
      else if (chave === 'unicode-range') bloco.unicode = valor;
      else if (chave === 'src') {
        const ini = valor.indexOf('url(');
        const fim = valor.indexOf(')', ini);
        if (ini !== -1 && fim !== -1) bloco.url = semAspas(valor.slice(ini + 4, fim).split("'").join(''));
        const f = valor.indexOf('format(');
        if (f !== -1) bloco.formato = valor.slice(f + 7, valor.indexOf(')', f)).split("'").join('').split('"').join('');
      }
    }
    blocos.push(bloco);
    i = fecha + 1;
  }
  return blocos;
}

// Endereço só dos três hosts do catálogo, sempre https.
export function enderecoPermitido(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && HOSTS_PERMITIDOS.includes(u.hostname) && !u.username && !u.password && !u.port;
  } catch {
    return false;
  }
}

const soDigitos = (texto) => [...String(texto)].filter((ch) => ch >= '0' && ch <= '9').join('');
const ehFaixa = (valor) => String(valor).trim().includes(' ');

// Nome do arquivo de um @font-face. Faixa de peso variável ("100 900"): um arquivo serve todos os
// pesos, "Família-latin.woff2". Peso único (família estática): cada peso é um arquivo, então o peso
// vai no nome, "Família-700-latin.woff2"; sem isso, o segundo peso apagaria o primeiro. Largura
// fora do normal (100%) também vai: "Família-700-largura75-latin.woff2".
export function arquivoDoBloco(proprio, bloco) {
  const partes = [proprio];
  if (bloco.estilo === 'italic') partes.push('Italic');
  const unico = bloco.peso && !ehFaixa(bloco.peso);
  if (unico) partes.push(soDigitos(bloco.peso));
  const largura = soDigitos(bloco.largura);
  if (unico && largura && largura !== '100' && !ehFaixa(bloco.largura)) partes.push(`largura${largura}`);
  partes.push(bloco.alfabeto);
  return `${partes.join('-')}.woff2`;
}

export function arquivoDaLicenca(proprio, pastaDaLicenca) {
  const l = LICENCAS.find((x) => x.pasta === pastaDaLicenca) || LICENCAS[0];
  return `${l.prefixo}-${proprio}.txt`;
}

// As linhas @font-face para o topo de tokens.css, com caminho relativo a fontes/. "block", não
// "swap": a tela de apresentação espera a letra em vez de piscar com a do sistema (as fotos, o PDF
// e o primeiro clique ao vivo saem já com a letra da marca). É o que kit/marca-exemplo usa.
export function cssDasFontes(familia, itens) {
  return itens
    .map(({ arquivo, bloco }) => {
      const partes = [
        `font-family:"${familia}"`,
        `src:url("fontes/${arquivo}") format("woff2")`,
        bloco.peso ? `font-weight:${bloco.peso}` : '',
        bloco.largura ? `font-stretch:${bloco.largura}` : '',
        `font-style:${bloco.estilo || 'normal'}`,
        'font-display:block',
        bloco.unicode ? `unicode-range:${bloco.unicode}` : '',
      ].filter(Boolean);
      return `@font-face{${partes.join(';')}}`;
    })
    .join('\n');
}

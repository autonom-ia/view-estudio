// Fato com fonte, sem expressão regular: varredura caractere a caractere do texto das telas.
// O que se procura são os pedaços que ninguém erra de boa-fé: sequência com 3 ou mais dígitos
// (número, telefone, CEP, preço, ano), número de qualquer tamanho com % ("38%", "2,5%") ou com
// mil, milhão, bilhão ("40 mil"), palavra com @ (e-mail, perfil) e os endereços tel: e mailto:
// dos links. Cada um precisa estar na tabela de fatos do brief.md, numa linha com fonte. A regra
// para quem escreve continua "todo número com fonte"; a máquina pega estes casos.
// Portado do Site Estúdio (kit/scripts/lib/fatos.mjs); lá a tabela mora em fatos.md.

// Fonte dos fatos do molde (negócio fictício). Linha com esta fonte conta como sem fonte e vira
// RED fonte-de-exemplo. O brief.md do molde usa exatamente este texto (um teste confere).
export const FONTE_DE_EXEMPLO = 'Exemplo fictício do View Estúdio';
export const ehFonteDeExemplo = (fonte) => String(fonte || '').toLowerCase().includes(FONTE_DE_EXEMPLO.toLowerCase());

// Separadores dentro de um número: ponto, vírgula, hífen, barra, parênteses, espaço, espaço que não
// quebra (U+00A0) e espaço fino (U+202F e U+2009).
const SEPARADORES = '.,-/()    ';
const ehDigito = (ch) => ch >= '0' && ch <= '9';
const ehEspaco = (ch) => ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r' || ch === ' ' || ch === ' ' || ch === ' ';
const PONTUACAO_DE_BORDA = '.,;:!?()[]{}"\'«»“”‘’<>';
// Palavras que fazem de um número pequeno um número grande ("40 mil"): conferidas como o % é.
export const GRANDEZAS = Object.freeze(['mil', 'milhão', 'milhao', 'milhões', 'milhoes', 'bilhão', 'bilhao', 'bilhões', 'bilhoes']);

export function soDigitos(texto) {
  let s = '';
  for (const ch of String(texto)) if (ehDigito(ch)) s += ch;
  return s;
}

// Chave de um número em português: ponto e espaço são milhar e somem; a vírgula entre dígitos é a
// decimal e fica ("2,5" ≠ "25", "1.250,90" → "1250,90"). Hífen, barra e parênteses somem
// (telefone, CEP, data).
export function chaveNumerica(texto) {
  const t = String(texto);
  let s = '';
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    if (ehDigito(ch)) s += ch;
    else if (ch === ',' && ehDigito(t[i - 1] || '') && ehDigito(t[i + 1] || '')) s += ',';
  }
  return s;
}

// Pedaços de um número separados pela vírgula decimal: "12,5" → ["12", "5"].
function partesDecimais(trecho) {
  const t = String(trecho);
  const partes = [];
  let atual = '';
  for (let i = 0; i < t.length; i += 1) {
    if (t[i] === ',' && ehDigito(t[i - 1] || '') && ehDigito(t[i + 1] || '')) {
      partes.push(atual);
      atual = '';
    } else atual += t[i];
  }
  partes.push(atual);
  return partes;
}

// Corridas de dígitos contíguos: "(11) 0000-0000" → ["11", "0000", "0000"].
export function corridas(texto) {
  const lista = [];
  let atual = '';
  for (const ch of String(texto)) {
    if (ehDigito(ch)) atual += ch;
    else if (atual) {
      lista.push(atual);
      atual = '';
    }
  }
  if (atual) lista.push(atual);
  return lista;
}

// Todas as sequências numéricas: dígitos ligados por separador de número. Uma vírgula seguida de
// espaço encerra a sequência (é lista, não número). Devolve { trecho, digitos, fim } (fim = índice
// logo depois do último dígito).
function sequencias(texto) {
  const t = String(texto);
  const achados = [];
  let i = 0;
  while (i < t.length) {
    if (!ehDigito(t[i])) {
      i += 1;
      continue;
    }
    let inicio = i;
    if (inicio > 0 && t[inicio - 1] === '(') inicio -= 1;
    let ultimo = i;
    let j = i;
    while (j < t.length) {
      const ch = t[j];
      if (ehDigito(ch)) {
        ultimo = j;
        j += 1;
      } else if (ch === ',' && ehEspaco(t[j + 1] || '')) break;
      else if (SEPARADORES.includes(ch)) j += 1;
      else break;
    }
    const trecho = t.slice(inicio, ultimo + 1);
    achados.push({ trecho, digitos: chaveNumerica(trecho), qtd: soDigitos(trecho).length, fim: ultimo + 1 });
    i = Math.max(ultimo + 1, i + 1);
  }
  return achados;
}

// Sequências numéricas com 3+ dígitos.
export function sequenciasNumericas(texto) {
  return sequencias(texto).filter((s) => s.qtd >= 3).map(({ trecho, digitos }) => ({ trecho, digitos }));
}

// O que vem logo depois do número: "%" (com ou sem espaço antes) ou uma palavra de GRANDEZAS.
function marcaDepois(t, fim) {
  let k = fim;
  while (k < t.length && ehEspaco(t[k])) k += 1;
  if (t[k] === '%') return '%';
  let palavra = '';
  while (k < t.length && !ehEspaco(t[k]) && !PONTUACAO_DE_BORDA.includes(t[k])) {
    palavra += t[k];
    k += 1;
  }
  const baixo = palavra.toLowerCase();
  // "milhões" e "milhoes" são a mesma grandeza: a chave vai sem acento
  return GRANDEZAS.includes(baixo) ? baixo.replaceAll('õ', 'o').replaceAll('ã', 'a') : '';
}

// Números com menos de 3 dígitos que ainda assim pedem fonte: com % ou com mil/milhão/bilhão.
// Os de 3+ dígitos já entram por sequenciasNumericas. Devolve { trecho, digitos, chave }.
export function numerosMarcados(texto) {
  const t = String(texto);
  const achados = [];
  for (const s of sequencias(t)) {
    if (s.qtd === 0 || s.qtd >= 3) continue;
    const marca = marcaDepois(t, s.fim);
    if (!marca) continue;
    const chave = `${s.digitos}${marca === '%' ? '%' : ` ${marca}`}`;
    achados.push({ trecho: t.slice(s.fim - s.trecho.length, s.fim).trim() + (marca === '%' ? '%' : ` ${marca}`), digitos: s.digitos, chave });
  }
  return achados;
}

function semBorda(palavra) {
  let ini = 0;
  let fim = palavra.length;
  while (ini < fim && PONTUACAO_DE_BORDA.includes(palavra[ini]) && palavra[ini] !== '@') ini += 1;
  while (fim > ini && PONTUACAO_DE_BORDA.includes(palavra[fim - 1])) fim -= 1;
  return palavra.slice(ini, fim);
}

// Palavras com @ (e-mail, perfil de rede social), sem a pontuação das pontas.
export function palavrasComArroba(texto) {
  const achados = [];
  let palavra = '';
  const fechar = () => {
    const p = semBorda(palavra);
    if (p.includes('@') && p.length > 1) achados.push(p);
    palavra = '';
  };
  for (const ch of String(texto)) {
    if (ehEspaco(ch)) fechar();
    else palavra += ch;
  }
  fechar();
  return achados;
}

// Células de uma linha de tabela Markdown, com ou sem barra nas bordas (as duas formas valem no
// GFM). "\|" é uma barra dentro da célula, não divisão. Caractere a caractere, sem regex.
export function celulasDaLinha(linha) {
  const t = String(linha).trim();
  const celulas = [];
  let atual = '';
  for (let k = 0; k < t.length; k += 1) {
    const ch = t[k];
    if (ch === '\\' && t[k + 1] === '|') {
      atual += '|';
      k += 1;
    } else if (ch === '|') {
      celulas.push(atual.trim());
      atual = '';
    } else atual += ch;
  }
  celulas.push(atual.trim());
  if (t.startsWith('|')) celulas.shift();
  if (t.endsWith('|') && !t.endsWith('\\|')) celulas.pop();
  return celulas;
}

const temBarra = (linha) => celulasDaLinha(linha).length >= 2;
const ehSeparador = (celulas) => celulas.length >= 2 && celulas.every((c) => c.length > 0 && c.includes('-') && [...c].every((ch) => ch === '-' || ch === ':' || ch === ' '));
const ehCabecalhoDeFatos = (celulas) => {
  const baixo = celulas.map((c) => c.toLowerCase());
  return baixo.includes('fato') && baixo.includes('fonte');
};

// Lê o brief.md: tabelas Markdown com colunas "Fato" e "Fonte". A tabela começa na linha com Fato e
// Fonte seguida do separador (---) e vai até a primeira linha em branco ou sem barra. Linha sem fonte
// não vale, e a fonte do exemplo do molde não é fonte.
export function lerTabelaDeFatos(markdown) {
  const linhas = [];
  const brutas = String(markdown || '').split('\n');
  for (let k = 0; k < brutas.length; k += 1) {
    const cab = celulasDaLinha(brutas[k]);
    if (!temBarra(brutas[k]) || !ehCabecalhoDeFatos(cab) || k + 1 >= brutas.length || !ehSeparador(celulasDaLinha(brutas[k + 1]))) continue;
    const baixo = cab.map((c) => c.toLowerCase());
    const colFato = baixo.indexOf('fato');
    const colFonte = baixo.indexOf('fonte');
    let m = k + 2;
    for (; m < brutas.length; m += 1) {
      const bruta = brutas[m];
      if (!bruta.trim() || !temBarra(bruta)) break;
      const celulas = celulasDaLinha(bruta);
      const fato = celulas[colFato] || '';
      const fonte = celulas[colFonte] || '';
      if (!fato) continue;
      const exemplo = ehFonteDeExemplo(fonte);
      linhas.push({ fato, fonte, comFonte: fonte.length > 0 && !exemplo, exemplo });
    }
    k = m - 1;
  }
  return linhas;
}

// O brief parece ter uma tabela de fatos (uma linha com barra, Fato e Fonte) que não foi lida
// (faltou a linha separadora logo abaixo do cabeçalho, por exemplo)?
export function tabelaDeFatosIlegivel(markdown) {
  const brutas = String(markdown || '').split('\n');
  const parece = brutas.some((b) => temBarra(b) && ehCabecalhoDeFatos(celulasDaLinha(b)));
  return parece && lerTabelaDeFatos(markdown).length === 0;
}

// Todos os números que uma linha sustenta: para cada número da linha (dígitos ligados por separador
// de número), as combinações de corridas CONTÍGUAS dentro dele. "(11) 0000-0000" sustenta 110000,
// 00000000, 1100000000…; "1 de 3 pedidos (33%)" não sustenta 133 (são três números).
export function numerosDaLinha(texto, dentro = new Set()) {
  for (const s of sequencias(texto)) {
    if (s.qtd >= 3) dentro.add(s.digitos);
    // as combinações nunca atravessam a vírgula decimal: "12,5%" não sustenta "125"
    for (const parte of partesDecimais(s.trecho)) {
      const cs = corridas(parte);
      for (let i = 0; i < cs.length; i += 1) {
        let junto = '';
        for (let j = i; j < cs.length; j += 1) {
          junto += cs[j];
          if (junto.length >= 3) dentro.add(junto);
        }
      }
    }
  }
  return dentro;
}

export function montarLastro(linhas) {
  const numeros = new Set();
  const semFonte = new Set();
  const doExemplo = new Set();
  const textos = [];
  const textosDoExemplo = [];
  const marcados = new Set();
  const marcadosSemFonte = new Set();
  const marcadosDoExemplo = new Set();
  for (const l of linhas) {
    const chaves = numerosMarcados(l.fato).map((m) => m.chave);
    if (l.comFonte) {
      numerosDaLinha(l.fato, numeros);
      for (const c of chaves) marcados.add(c);
      textos.push(l.fato.toLowerCase());
    } else if (l.exemplo) {
      numerosDaLinha(l.fato, doExemplo);
      for (const c of chaves) marcadosDoExemplo.add(c);
      textosDoExemplo.push(l.fato.toLowerCase());
    } else {
      numerosDaLinha(l.fato, semFonte);
      for (const c of chaves) marcadosSemFonte.add(c);
    }
  }
  return {
    numeros, semFonte, doExemplo, marcados, marcadosSemFonte, marcadosDoExemplo,
    texto: textos.join('\n'), textoDoExemplo: textosDoExemplo.join('\n'),
  };
}

// Por que um número não tem lastro: a linha dele tem a fonte do exemplo, não tem fonte, ou não existe.
function motivoDoNumero(digitos, lastro) {
  if (lastro.doExemplo && lastro.doExemplo.has(digitos)) return 'fonte-de-exemplo';
  return lastro.semFonte.has(digitos) ? 'linha-sem-fonte' : 'fora-de-fatos';
}

function motivoDoTexto(trecho, lastro) {
  return lastro.textoDoExemplo && lastro.textoDoExemplo.includes(trecho) ? 'fonte-de-exemplo' : 'fora-de-fatos';
}

function numeroTemLastro(seq, lastro) {
  if (lastro.numeros.has(seq.digitos)) return true;
  // "2019 2021": cada pedaço separado por espaço com a sua própria fonte também vale
  const pedacos = [];
  let atual = '';
  for (const ch of seq.trecho) {
    if (ehEspaco(ch)) {
      if (atual) pedacos.push(atual);
      atual = '';
    } else atual += ch;
  }
  if (atual) pedacos.push(atual);
  if (pedacos.length < 2) return false;
  let algum = false;
  for (const p of pedacos) {
    if (soDigitos(p).length < 3) continue;
    const d = chaveNumerica(p);
    algum = true;
    if (!lastro.numeros.has(d)) return false;
  }
  return algum;
}

function telefoneTemLastro(digitos, lastro) {
  if (lastro.numeros.has(digitos)) return true;
  // +55 11 … no link e (11) … no texto: o fim do número basta, se tiver 8 dígitos ou mais
  for (const n of lastro.numeros) if (n.length >= 8 && digitos.endsWith(n)) return true;
  return false;
}

// Confere o texto de uma tela (ou de uma fala do roteiro) contra o lastro. Devolve a lista do que não tem fonte.
export function conferirTexto({ texto, enderecos = [] }, lastro) {
  const faltam = [];
  const vistos = new Set();
  const anotar = (tipo, trecho, motivo) => {
    const chave = `${tipo}|${trecho}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);
    faltam.push({ tipo, trecho, motivo });
  };
  let conferidos = 0;
  for (const seq of sequenciasNumericas(texto)) {
    conferidos += 1;
    if (!numeroTemLastro(seq, lastro)) anotar('numero', seq.trecho.trim(), motivoDoNumero(seq.digitos, lastro));
  }
  for (const m of numerosMarcados(texto)) {
    conferidos += 1;
    if (lastro.marcados && lastro.marcados.has(m.chave)) continue;
    const motivo = lastro.marcadosDoExemplo && lastro.marcadosDoExemplo.has(m.chave) ? 'fonte-de-exemplo'
      : lastro.marcadosSemFonte && lastro.marcadosSemFonte.has(m.chave) ? 'linha-sem-fonte' : 'fora-de-fatos';
    anotar('numero', m.trecho, motivo);
  }
  for (const p of palavrasComArroba(texto)) {
    conferidos += 1;
    if (!lastro.texto.includes(p.toLowerCase())) anotar('arroba', p, motivoDoTexto(p.toLowerCase(), lastro));
  }
  for (const href of enderecos) {
    let u;
    try {
      u = new URL(href);
    } catch {
      anotar('endereco', href, 'endereco-invalido');
      continue;
    }
    conferidos += 1;
    let alvo = u.pathname;
    try {
      alvo = decodeURIComponent(alvo);
    } catch {}
    if (u.protocol === 'tel:') {
      const d = soDigitos(alvo);
      if (d.length < 3 || !telefoneTemLastro(d, lastro)) {
        const doExemplo = d.length >= 3 && lastro.doExemplo && telefoneTemLastro(d, { numeros: lastro.doExemplo });
        anotar('telefone', href, doExemplo ? 'fonte-de-exemplo' : 'fora-de-fatos');
      }
    } else if (u.protocol === 'mailto:') {
      const email = alvo.trim().toLowerCase();
      if (!email || !lastro.texto.includes(email)) anotar('email', href, email ? motivoDoTexto(email, lastro) : 'fora-de-fatos');
    }
  }
  return { faltam, conferidos };
}

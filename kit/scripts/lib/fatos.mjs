// Fato com fonte, sem expressão regular: varredura caractere a caractere do texto das telas.
// O que se procura são os pedaços que ninguém erra de boa-fé: sequência com 3 ou mais dígitos
// (número, telefone, CEP, preço, ano), palavra com @ (e-mail, perfil) e os endereços tel: e
// mailto: dos links. Cada um precisa estar na tabela de fatos do brief.md, numa linha com fonte.
// Portado do Site Estúdio (kit/scripts/lib/fatos.mjs); lá a tabela mora em fatos.md.

// Fonte dos fatos do molde (negócio fictício). Linha com esta fonte conta como sem fonte e vira
// RED fonte-de-exemplo. O brief.md do molde usa exatamente este texto (um teste confere).
export const FONTE_DE_EXEMPLO = 'Exemplo fictício do View Estúdio';
export const ehFonteDeExemplo = (fonte) => String(fonte || '').toLowerCase().includes(FONTE_DE_EXEMPLO.toLowerCase());

const SEPARADORES = '.,-/()  ';
const ehDigito = (ch) => ch >= '0' && ch <= '9';
const ehEspaco = (ch) => ch === ' ' || ch === '\n' || ch === '\t' || ch === '\r' || ch === ' ';
const PONTUACAO_DE_BORDA = '.,;:!?()[]{}"\'«»“”‘’<>';

export function soDigitos(texto) {
  let s = '';
  for (const ch of String(texto)) if (ehDigito(ch)) s += ch;
  return s;
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

// Sequências numéricas com 3+ dígitos. Separadores aceitos entre dígitos: . , - / ( ) e espaço.
// Uma vírgula seguida de espaço encerra a sequência (é lista, não número).
export function sequenciasNumericas(texto) {
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
    const digitos = soDigitos(trecho);
    if (digitos.length >= 3) achados.push({ trecho, digitos });
    i = Math.max(ultimo + 1, i + 1);
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

// Lê o brief.md: tabelas Markdown com colunas "Fato" e "Fonte". Linha sem fonte não vale, e a fonte
// do exemplo do molde não é fonte.
export function lerTabelaDeFatos(markdown) {
  const linhas = [];
  let colFato = -1;
  let colFonte = -1;
  for (const bruta of String(markdown || '').split('\n')) {
    const linha = bruta.trim();
    if (!linha.startsWith('|')) {
      colFato = -1;
      colFonte = -1;
      continue;
    }
    let celulas = linha.split('|').map((c) => c.trim());
    if (celulas[0] === '') celulas = celulas.slice(1);
    if (celulas.length && celulas[celulas.length - 1] === '') celulas = celulas.slice(0, -1);
    const baixo = celulas.map((c) => c.toLowerCase());
    if (baixo.includes('fato') && baixo.includes('fonte')) {
      colFato = baixo.indexOf('fato');
      colFonte = baixo.indexOf('fonte');
      continue;
    }
    if (celulas.every((c) => c.length > 0 && [...c].every((ch) => ch === '-' || ch === ':' || ch === ' '))) continue;
    if (colFato < 0) continue;
    const fato = celulas[colFato] || '';
    const fonte = celulas[colFonte] || '';
    if (!fato) continue;
    const exemplo = ehFonteDeExemplo(fonte);
    linhas.push({ fato, fonte, comFonte: fonte.length > 0 && !exemplo, exemplo });
  }
  return linhas;
}

// Todos os números que uma linha sustenta: combinações de corridas CONTÍGUAS dentro dela.
// "(11) 0000-0000" sustenta 110000, 00000000, 1100000000… e nada que atravesse para outra linha.
export function numerosDaLinha(texto, dentro = new Set()) {
  const cs = corridas(texto);
  for (let i = 0; i < cs.length; i += 1) {
    let junto = '';
    for (let j = i; j < cs.length; j += 1) {
      junto += cs[j];
      if (junto.length >= 3) dentro.add(junto);
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
  for (const l of linhas) {
    if (l.comFonte) {
      numerosDaLinha(l.fato, numeros);
      textos.push(l.fato.toLowerCase());
    } else if (l.exemplo) {
      numerosDaLinha(l.fato, doExemplo);
      textosDoExemplo.push(l.fato.toLowerCase());
    } else {
      numerosDaLinha(l.fato, semFonte);
    }
  }
  return { numeros, semFonte, doExemplo, texto: textos.join('\n'), textoDoExemplo: textosDoExemplo.join('\n') };
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
    const d = soDigitos(p);
    if (d.length < 3) continue;
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

// Cada fato lido vira um registro { fato, fonte, data }: o que é, de onde veio (com o endereço) e
// quando foi lido. No View, os fatos moram num lugar só: a tabela de fatos do brief.md. Os registros
// entram ali, numa parte própria e marcada, logo abaixo da tabela que a pessoa e o assistente
// escrevem, dentro da seção "Fatos e números". A próxima leitura troca essa parte inteira; o resto
// do brief fica como está. O "fatos" lê as duas tabelas (lib/fatos.mjs lê toda tabela Fato | Fonte).
// Portado do Site Estúdio (lib/registros.mjs, que escreve em fatos.md), sem o Instagram.

export const MARCA_INICIO = '<!-- estudio:lido:inicio -->';
export const MARCA_FIM = '<!-- estudio:lido:fim -->';
export const TITULO_DOS_FATOS = '## Fatos e números (com fonte)';
const TETO_DA_CELULA = 400;

// Texto que cabe numa célula de tabela: sem barra vertical (ela separa as colunas) e sem quebra.
export function celula(texto, teto = TETO_DA_CELULA) {
  let t = '';
  for (const ch of String(texto || '')) {
    if (ch === '|') t += '/';
    else if (ch === '\n' || ch === '\r' || ch === '\t') t += ' ';
    else t += ch;
  }
  t = t.split(' ').filter(Boolean).join(' ');
  // Corta por caractere inteiro (Array.from), nunca no meio de um emoji.
  const letras = Array.from(t);
  return letras.length > teto ? `${letras.slice(0, teto - 1).join('')}…` : t;
}

const registro = (fato, fonte, data) => ({ fato: celula(fato), fonte: celula(fonte), data });

// O texto das avaliações NÃO vira fato: pode citar o nome de um funcionário ou de outro cliente.
// Ele fica só em coleta/google/lugar.json; a nota e a quantidade de avaliações continuam como fato.
export function registrosDoGoogle({ lugar }, data) {
  const fonte = `Perfil do Google, ${lugar.fonte}`;
  const lista = [];
  if (lugar.nome) lista.push(registro(`Nome no Google: ${lugar.nome}`, fonte, data));
  if (lugar.endereco) lista.push(registro(`Endereço: ${lugar.endereco}`, fonte, data));
  if (lugar.telefone) lista.push(registro(`Telefone: ${lugar.telefone}`, fonte, data));
  if (lugar.site) lista.push(registro(`Site: ${lugar.site}`, fonte, data));
  for (const h of lugar.horario) lista.push(registro(`Horário de ${h.dia}: ${h.horas}`, fonte, data));
  if (lugar.nota) lista.push(registro(`Nota no Google: ${lugar.nota}${lugar.total ? ` (${lugar.total} avaliações)` : ''}`, fonte, data));
  return lista;
}

export function registrosDoSite({ contatos, declarados }, data) {
  return [
    ...contatos.map((c) => registro(`${c.tipo} no site atual: ${c.valor}`, `Site atual, ${c.fonte}`, data)),
    ...declarados.map((f) => registro(`${f.tipo} declarado pelo site atual: ${f.valor}`, `Site atual (dados da página), ${f.fonte}`, data)),
  ];
}

// Sem repetição: o mesmo fato da mesma fonte entra uma vez.
export function semRepetir(registros) {
  const vistos = new Set();
  return registros.filter((r) => {
    const chave = `${r.fato}|${r.fonte}`;
    if (vistos.has(chave)) return false;
    vistos.add(chave);
    return true;
  });
}

export function secaoLida(registros, data) {
  const linhas = [
    MARCA_INICIO,
    `### Lido pelo estúdio em ${data}`,
    '',
    '> O estúdio leu estas linhas nas páginas públicas do negócio. Confira com a pessoa antes de pôr na apresentação.',
    '> A próxima leitura troca esta parte inteira; fato que você corrigir, copie para a tabela de cima.',
    '',
    '| Fato | Fonte | Data |',
    '|---|---|---|',
    ...registros.map((r) => `| ${r.fato} | ${r.fonte} | ${r.data} |`),
    MARCA_FIM,
  ];
  return linhas.join('\n');
}

const ehTituloDosFatos = (linha) => linha.startsWith('## ') && linha.toLowerCase().includes('fatos');
const vezes = (texto, trecho) => texto.split(trecho).length - 1;

// As marcas da parte lida estão inteiras? Nenhuma marca, ou um início e um fim, nessa ordem.
// Marca sem par, repetida ou fora de ordem: trocar a parte apagaria texto que a pessoa escreveu.
export function marcasInteiras(markdown) {
  const texto = String(markdown || '');
  const ini = vezes(texto, MARCA_INICIO);
  const fim = vezes(texto, MARCA_FIM);
  if (ini === 0 && fim === 0) return true;
  return ini === 1 && fim === 1 && texto.indexOf(MARCA_INICIO) < texto.indexOf(MARCA_FIM);
}

// O texto em linhas, cada uma com o próprio fim ('\r\n', '\n' ou '' na última).
function emLinhas(texto) {
  const linhas = [];
  let ini = 0;
  for (;;) {
    const i = texto.indexOf('\n', ini);
    if (i === -1) {
      linhas.push({ texto: texto.slice(ini), fim: '' });
      return linhas;
    }
    const crlf = i > ini && texto[i - 1] === '\r';
    linhas.push({ texto: texto.slice(ini, crlf ? i - 1 : i), fim: crlf ? '\r\n' : '\n' });
    ini = i + 1;
  }
}

// O fim de linha que o arquivo mais usa: é o das linhas novas.
function fimMaisUsado(linhas) {
  const crlf = linhas.filter((l) => l.fim === '\r\n').length;
  const lf = linhas.filter((l) => l.fim === '\n').length;
  return crlf > lf ? '\r\n' : '\n';
}

// Junta as linhas: cada linha que já existia mantém o fim dela; linha nova (fim null) e a que era a
// última e deixou de ser ganham o fim mais usado do arquivo.
function juntarLinhas(linhas, novo) {
  return linhas
    .map((l, i) => {
      const ultima = i === linhas.length - 1;
      const fim = ultima ? (l.fim ?? '') : l.fim || novo;
      return `${l.texto}${fim}`;
    })
    .join('');
}

const VAZIA = Object.freeze({ texto: '', fim: null });
const ehVazia = (l) => !l.texto.trim();

function semVaziasNoFim(linhas, minimo = 0) {
  let n = linhas.length;
  while (n > minimo && ehVazia(linhas[n - 1])) n -= 1;
  return linhas.slice(0, n);
}

// Põe a parte lida no brief: no lugar da que já existe; senão, no fim da seção "Fatos e números"
// (antes do próximo título "## "); sem essa seção, numa seção nova no fim do brief. Cada linha que
// já existia mantém o próprio fim de linha (CRLF no Windows, LF, ou os dois misturados); as novas
// usam o que o arquivo mais usa. Devolve null, sem mexer em nada, se as marcas estão quebradas
// (marcasInteiras).
export function juntarNoBrief(markdown, secao) {
  const original = String(markdown || '');
  if (!marcasInteiras(original)) return null;
  const linhas = emLinhas(original);
  const novas = emLinhas(String(secao).split('\r\n').join('\n')).map((l) => ({ texto: l.texto, fim: null }));
  return juntarLinhas(colocarSecao(linhas, novas), fimMaisUsado(linhas));
}

function colocarSecao(linhas, novas) {
  const iIni = linhas.findIndex((l) => l.texto.includes(MARCA_INICIO));
  if (iIni !== -1) {
    const iFim = linhas.findIndex((l, i) => i >= iIni && l.texto.includes(MARCA_FIM));
    const primeira = linhas[iIni].texto;
    const ultima = linhas[iFim];
    const antes = primeira.slice(0, primeira.indexOf(MARCA_INICIO));
    const depois = ultima.texto.slice(ultima.texto.indexOf(MARCA_FIM) + MARCA_FIM.length);
    const meio = novas.map((l, i) => ({
      texto: `${i === 0 ? antes : ''}${l.texto}${i === novas.length - 1 ? depois : ''}`,
      fim: i === novas.length - 1 ? ultima.fim : null,
    }));
    return [...linhas.slice(0, iIni), ...meio, ...linhas.slice(iFim + 1)];
  }
  const k = linhas.findIndex((l) => ehTituloDosFatos(l.texto));
  const fimDoArquivo = { texto: '', fim: '' };
  if (k === -1) {
    const base = semVaziasNoFim(linhas);
    return [...base, ...(base.length ? [VAZIA] : []), { texto: TITULO_DOS_FATOS, fim: null }, VAZIA, ...novas, fimDoArquivo];
  }
  let proximo = linhas.findIndex((l, i) => i > k && l.texto.startsWith('## '));
  if (proximo === -1) proximo = linhas.length;
  const antes = semVaziasNoFim(linhas.slice(0, proximo), k + 1);
  const depois = linhas.slice(proximo);
  return [...antes, VAZIA, ...novas, ...(depois.length ? [VAZIA, ...depois] : [fimDoArquivo])];
}

// O texto de cada página do site atual, com o endereço e a data, para o assistente ler.
export function textoDoSite(paginas, data) {
  const partes = [`# Site atual, lido em ${data}`, ''];
  for (const p of paginas) partes.push(`## ${p.titulo || p.url}`, '', `Fonte: ${p.url}`, '', p.texto.trim(), '');
  return `${partes.join('\n')}\n`;
}

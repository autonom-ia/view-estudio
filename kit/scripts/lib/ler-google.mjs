// Perfil do Google (o painel do lugar no Google Maps), sem login: nome, endereço, telefone, site,
// horário de cada dia, nota e as avaliações SEM o nome de quem escreveu (o nome nunca é lido).
// O horário sai do painel do lugar, nunca de trecho de resultado de busca. Lido pelo DOM, com
// seletores de atributo e métodos de texto; sem expressão regular.
// Portado do Site Estúdio (lib/ler-google.mjs).

export const BASE_GOOGLE = 'https://www.google.com';
const PRAZO_DA_PAGINA_MS = 20000;
const PRAZO_DAS_AVALIACOES_MS = 10000;
// O Maps mostra o painel antes de trocar o endereço da busca pelo do lugar: espera a troca.
const PRAZO_DO_ENDERECO_MS = 8000;
const DIAS = Object.freeze([
  'segunda', 'terça', 'terca', 'quarta', 'quinta', 'sexta', 'sábado', 'sabado', 'domingo',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]);

export const ehDiaDaSemana = (texto) => {
  const t = String(texto || '').trim().toLowerCase();
  return DIAS.some((d) => t.startsWith(d));
};

// Texto ou endereço do Google viram o endereço da busca (ou do lugar, se já for um endereço).
export function enderecoDaBusca(entrada, base = BASE_GOOGLE) {
  const t = String(entrada || '').trim();
  if (t.startsWith('http://') || t.startsWith('https://')) return t;
  return `${base}/maps/search/${encodeURIComponent(t)}?hl=pt-BR`;
}

// Endereço do lugar sem os parâmetros de sessão: é a fonte que vai para a tabela de fatos do brief.md.
export function fonteDoLugar(url) {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.href;
  } catch {
    return String(url || '');
  }
}

// Roda na página: em que pé está a busca.
function estadoDaBusca() {
  if (location.hostname.startsWith('consent.') || location.pathname.startsWith('/sorry')) return 'bloqueado';
  if (document.querySelector('[data-item-id="address"], [data-item-id^="phone:tel:"], a[data-item-id="authority"]')) return 'lugar';
  if (document.querySelector('a[href*="/maps/place/"]')) return 'lista';
  return '';
}

function enderecoDoLugar() {
  return location.pathname.includes('/maps/place/') ? location.href : '';
}

function resultadosNaPagina() {
  return [...document.querySelectorAll('a[href*="/maps/place/"]')].map((a) => ({
    nome: a.getAttribute('aria-label') || a.innerText.trim(),
    href: a.href,
  }));
}

// Roda na página do lugar. Nunca lê o nome de quem avaliou.
function lerLugarNaPagina() {
  const um = (seletor) => document.querySelector(seletor);
  const rotulo = (el) => (el ? el.getAttribute('aria-label') || el.innerText || '' : '');
  const linhas = [];
  for (const tr of document.querySelectorAll('table tr')) {
    const celulas = [...tr.querySelectorAll('td, th')].map((td) => td.innerText.trim());
    if (celulas.length >= 2) linhas.push(celulas);
  }
  const rotulos = [...document.querySelectorAll('[aria-label]')]
    .map((el) => el.getAttribute('aria-label'))
    .filter((t) => t.includes(', ') && t.length < 200);
  const tel = um('[data-item-id^="phone:tel:"]');
  return {
    url: location.href,
    nome: um('div[role="main"][aria-label]')?.getAttribute('aria-label') || um('h1')?.innerText || '',
    endereco: rotulo(um('[data-item-id="address"]')),
    telefone: rotulo(tel),
    telefoneId: tel ? tel.getAttribute('data-item-id') : '',
    site: um('a[data-item-id="authority"]')?.href || '',
    linhas,
    rotulos,
    nota: um('div.F7nice')?.innerText || '',
  };
}

function abrirAvaliacoes() {
  const aba = [...document.querySelectorAll('button[role="tab"]')].find((b) => {
    const t = `${b.getAttribute('aria-label') || ''} ${b.innerText}`.toLowerCase();
    return t.includes('avalia') || t.includes('review');
  });
  if (!aba) return false;
  aba.click();
  return true;
}

// Estrelas, texto e quando. O nome de quem escreveu fica de fora de propósito.
function lerAvaliacoesNaPagina(maximo) {
  for (const b of document.querySelectorAll('button.w8nwRe')) b.click();
  const vistas = new Set();
  const lista = [];
  for (const d of document.querySelectorAll('div[data-review-id]')) {
    const id = d.getAttribute('data-review-id');
    if (vistas.has(id)) continue;
    const estrelas = d.querySelector('span[role="img"][aria-label]')?.getAttribute('aria-label') || '';
    const texto = (d.querySelector('.wiI7pd')?.innerText || '').trim();
    if (!estrelas && !texto) continue;
    vistas.add(id);
    lista.push({ estrelas, texto, quando: (d.querySelector('.rsqaWe')?.innerText || '').trim() });
    if (lista.length >= maximo) break;
  }
  return lista.length ? lista : null;
}

// "Endereço: Rua X, 10 " → "Rua X, 10".
export function depoisDosDoisPontos(texto) {
  const t = String(texto || '').trim();
  const i = t.indexOf(': ');
  return (i === -1 ? t : t.slice(i + 2)).trim();
}

const linhasDoTexto = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean);

// Horário por dia: da tabela do painel; sem tabela, dos rótulos "terça-feira, 10:00 a 20:00, ...".
export function horarioDoLugar({ linhas = [], rotulos = [] }) {
  const dias = new Map();
  for (const [dia, horas] of linhas) {
    if (ehDiaDaSemana(dia) && !dias.has(dia.toLowerCase())) dias.set(dia.toLowerCase(), { dia, horas: linhasDoTexto(horas).join(', ') });
  }
  if (dias.size) return [...dias.values()];
  for (const r of rotulos) {
    const partes = r.split(', ').map((p) => p.trim());
    if (!ehDiaDaSemana(partes[0]) || partes.length < 2) continue;
    const ultimo = partes[partes.length - 1].toLowerCase();
    const horas = (ultimo.startsWith('copiar') || ultimo.startsWith('copy') ? partes.slice(1, -1) : partes.slice(1)).join(', ');
    if (horas && !dias.has(partes[0].toLowerCase())) dias.set(partes[0].toLowerCase(), { dia: partes[0], horas });
  }
  return [...dias.values()];
}

// "4,7\n(112.695)" → { nota: "4,7", total: "112.695" }.
export function notaDoLugar(texto) {
  const [nota = '', total = ''] = linhasDoTexto(texto);
  let t = total;
  while (t.startsWith('(')) t = t.slice(1);
  while (t.endsWith(')')) t = t.slice(0, -1);
  return { nota, total: t };
}

export function dadosDoLugar(lido) {
  const telefone = depoisDosDoisPontos(lido.telefone) || String(lido.telefoneId || '').split('phone:tel:').join('');
  return {
    nome: String(lido.nome || '').trim(),
    endereco: depoisDosDoisPontos(lido.endereco),
    telefone,
    site: lido.site || '',
    horario: horarioDoLugar(lido),
    ...notaDoLugar(lido.nota),
    fonte: fonteDoLugar(lido.url),
  };
}

// "5 estrelas" → "5".
export const estrelasDe = (texto) => String(texto || '').trim().split(' ')[0];

// Busca pelo nome (ou abre o endereço dado) e lê o lugar. Na lista de resultados, fica com o
// primeiro e devolve os outros nomes para o assistente confirmar com a pessoa.
export async function lerGoogle(leitor, entrada, { base = BASE_GOOGLE, maximoAvaliacoes = 10 } = {}) {
  const busca = enderecoDaBusca(entrada, base);
  await leitor.ir(busca);
  let estado = await leitor.esperarAte(estadoDaBusca, PRAZO_DA_PAGINA_MS);
  let alternativas = [];
  if (estado === 'lista') {
    const lista = await leitor.avaliar(resultadosNaPagina);
    alternativas = lista.slice(1, 5).map((r) => r.nome).filter(Boolean);
    await leitor.ir(lista[0].href);
    estado = await leitor.esperarAte(estadoDaBusca, PRAZO_DA_PAGINA_MS);
  }
  if (estado !== 'lugar') return { achou: false, motivo: estado === 'bloqueado' ? 'bloqueado' : 'nao-achou', busca };
  await leitor.esperarAte(enderecoDoLugar, PRAZO_DO_ENDERECO_MS);
  const lugar = dadosDoLugar(await leitor.avaliar(lerLugarNaPagina));
  let avaliacoes = [];
  if (await leitor.avaliar(abrirAvaliacoes)) {
    avaliacoes = (await leitor.esperarAte(lerAvaliacoesNaPagina, PRAZO_DAS_AVALIACOES_MS, maximoAvaliacoes)) || [];
  }
  return {
    achou: true,
    busca,
    lugar,
    alternativas,
    avaliacoes: avaliacoes.map((a) => ({ estrelas: estrelasDe(a.estrelas), texto: a.texto, quando: a.quando })),
  };
}

// O "antes e depois" de uma apresentação, tela por tela e clique por clique. Cada deck (o guardado
// pelo "antes" e o de agora) é fotografado no navegador sem janela em cada beat assentado, como o
// "prints" faz. Uma tela entra na comparação quando algum clique dela mudou: a foto (lida em tamanho
// reduzido, com tolerância só para a diferença mínima de desenho que não é mudança), o estilo de
// cada elemento visível (cor, fundo, letra, borda, sombra), o texto da tela ou a fala do roteiro.
// Tela nova e tela que saiu também entram. Vídeo e movimento não entram: a foto é de cada clique
// parado, e a página diz isso. A página mostra só essas telas, lado a lado,
// com as mudanças numeradas no alto e, em cada tela, o número das mudanças que passaram por ela.
// Portado do Site Estúdio (lib/comparacao.mjs), que compara páginas inteiras em iframes; aqui são
// fotos assentadas, porque a tela de apresentação anda por cliques, não por rolagem.
import { abrirSessao, telasDoIndex, LARGURA, ALTURA } from './sessao.mjs';
import { ESPERAR_PRONTA, ASSENTAR, TEXTO_PARA_FATOS } from './pagina.mjs';
import { decodePng } from './png.mjs';
import { numeroDoNome } from './apresentacao.mjs';
import { escaparHtml } from './teleprompter.mjs';
import { progresso } from './executar.mjs';

// Foto para mostrar (metade da tela, JPEG) e foto para comparar (um quarto, PNG sem perda).
export const ESCALA_DA_FOTO = 0.5;
export const QUALIDADE_DA_FOTO = 80;
export const ESCALA_DA_CONFERENCIA = 0.25;
// Um ponto mudou quando algum canal de cor mudou mais que isto (0 a 255); a tela mudou quando mais
// que esta fração dos pontos mudou. Troca de cor de verdade passa disso (âmbar #FFA000 para #FF8C00
// muda 20; creme #F6F4EF para #F4F1E8 muda 7), e uma palavra trocada passa da fração. O que fica
// abaixo é a diferença mínima de desenho: 1 ou 2 no canal, ou um punhado de pontos soltos.
// Troca de cor num detalhe pequeno demais para a foto reduzida é pega pelo estilo (ESTILO_VISIVEL).
export const DIFERENCA_DO_PONTO = 2;
export const FRACAO_MUDADA = 0.0003;

// O estilo que se vê, elemento por elemento, no clique assentado: [tag e propriedades], na ordem do
// documento. Endereço de imagem perde a origem (o antes e o depois são servidos em portas
// diferentes). Animação sem fim (CSS ou GSAP) entra: o ASSENTAR leva todas ao instante zero, então
// o mesmo elemento dá o mesmo estilo nos dois lados. Escondido fica de fora.
const PROPRIEDADES_DE_ESTILO = Object.freeze([
  'color', 'background-color', 'background-image', 'border-top-color', 'border-right-color', 'border-bottom-color',
  'border-left-color', 'border-top-width', 'border-radius', 'outline-color', 'box-shadow', 'text-shadow',
  'text-decoration-color', 'font-family', 'font-size', 'font-weight', 'font-style', 'letter-spacing', 'line-height',
  'text-transform', 'fill', 'stroke',
]);
export const ESTILO_VISIVEL = `(() => {
  const raiz = document.querySelector('.palco-tela') || document.body;
  const props = ${JSON.stringify(PROPRIEDADES_DE_ESTILO)};
  const origem = location.origin;
  const semOrigem = (v) => String(v).split(origem).join('');
  const visivel = (el) => {
    try { if (el.checkVisibility) return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch (e) {}
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0;
  };
  const linhas = [];
  for (const el of [raiz, ...raiz.querySelectorAll('*')]) {
    if (el.closest('script, style, template, noscript, [data-controle]')) continue;
    if (!visivel(el)) continue;
    const cs = getComputedStyle(el);
    const src = el.getAttribute('src');
    linhas.push(el.tagName + ' ' + props.map((p) => semOrigem(cs.getPropertyValue(p))).join(' | ') + (src ? ' ' + src : ''));
  }
  return linhas;
})()`;

async function foto(tab, escala, formato) {
  const r = await tab.send('Page.captureScreenshot', {
    format: formato,
    ...(formato === 'jpeg' ? { quality: QUALIDADE_DA_FOTO } : {}),
    fromSurface: true,
    clip: { x: 0, y: 0, width: LARGURA, height: ALTURA, scale: escala },
  });
  return Buffer.from(r.data, 'base64');
}

// Fotografa um deck: [{ arquivo, numero, titulo, beats: [{ jpeg, png, texto }] }], na ordem do index.
export async function fotografarDeck(deck, rotulo) {
  const telas = [];
  const sessao = await abrirSessao(deck);
  try {
    for (const t of (await telasDoIndex(sessao)).filter((x) => x.rel)) {
      progresso(`Fotografando ${t.arquivo} (${rotulo})...`);
      await sessao.ir(t.url);
      const pronta = await sessao.tab.evaluate(ESPERAR_PRONTA);
      const ultimo = pronta.contrato ? pronta.last : 0;
      const titulo = await sessao.tab.evaluate('document.title');
      const beats = [];
      for (let b = 0; b <= ultimo; b += 1) {
        await sessao.tab.evaluate(ASSENTAR(b));
        const lido = await sessao.tab.evaluate(TEXTO_PARA_FATOS);
        const estilo = await sessao.tab.evaluate(ESTILO_VISIVEL);
        beats.push({
          jpeg: await foto(sessao.tab, ESCALA_DA_FOTO, 'jpeg'),
          png: await foto(sessao.tab, ESCALA_DA_CONFERENCIA, 'png'),
          texto: lido.texto,
          estilo: Array.isArray(estilo) ? estilo : [],
        });
      }
      telas.push({ arquivo: t.arquivo, numero: numeroDoNome(t.arquivo), titulo: String(titulo || ''), beats });
    }
  } finally {
    await sessao.fechar();
  }
  return telas;
}

// Fração dos pontos que mudaram entre duas fotos decodificadas do mesmo tamanho.
export function fracaoDiferente(a, b) {
  if (a.w !== b.w || a.h !== b.h) return 1;
  let mudados = 0;
  const total = a.w * a.h;
  for (let i = 0; i < total; i += 1) {
    const k = i * 4;
    const d = Math.max(Math.abs(a.px[k] - b.px[k]), Math.abs(a.px[k + 1] - b.px[k + 1]), Math.abs(a.px[k + 2] - b.px[k + 2]));
    if (d > DIFERENCA_DO_PONTO) mudados += 1;
  }
  return mudados / total;
}

// Duas fotos PNG (do mesmo tamanho) mostram coisas diferentes?
export function fotosDiferentes(pngA, pngB) {
  if (pngA.equals(pngB)) return false;
  return fracaoDiferente(decodePng(pngA), decodePng(pngB)) > FRACAO_MUDADA;
}

const juntar = (t) => String(t || '').split('\n').map((l) => l.trim()).filter(Boolean).join(' ');
const estiloDe = (beat) => (Array.isArray(beat.estilo) ? beat.estilo.join('\n') : '');

function beatMudou(a, b) {
  if (!a || !b) return true;
  if (juntar(a.texto) !== juntar(b.texto)) return true;
  if (estiloDe(a) !== estiloDe(b)) return true;
  return fotosDiferentes(a.png, b.png);
}

const falasDe = (roteiro, numero) => {
  const t = roteiro.telas.find((x) => x.tela === numero);
  return t ? t.beats.map((b) => b.fala) : [];
};

// Junta antes e depois pelo nome do arquivo da tela. Devolve só as telas com algo mudado:
// [{ arquivo, numero, titulo, situacao: 'mudou'|'nova'|'saiu', cliques: [{ beat, antes, depois, falaAntes, falaDepois, mudou }] }].
export function telasMudadas(antes, depois, roteiroAntes, roteiroDepois) {
  const saida = [];
  const doAntes = new Map(antes.map((t) => [t.arquivo, t]));
  const vistos = new Set();
  const montar = (a, d) => {
    const base = d || a;
    const falasA = a ? falasDe(roteiroAntes, a.numero) : [];
    const falasD = d ? falasDe(roteiroDepois, d.numero) : [];
    const total = Math.max(a ? a.beats.length : 0, d ? d.beats.length : 0);
    const cliques = [];
    for (let k = 0; k < total; k += 1) {
      const ba = a ? a.beats[k] : undefined;
      const bd = d ? d.beats[k] : undefined;
      const falaAntes = falasA[k] || '';
      const falaDepois = falasD[k] || '';
      cliques.push({ beat: k, antes: ba, depois: bd, falaAntes, falaDepois, mudou: beatMudou(ba, bd) || falaAntes !== falaDepois });
    }
    if (a && d && !cliques.some((c) => c.mudou)) return;
    saida.push({ arquivo: base.arquivo, numero: base.numero, titulo: base.titulo, situacao: !a ? 'nova' : !d ? 'saiu' : 'mudou', cliques });
  };
  for (const d of depois) {
    vistos.add(d.arquivo);
    montar(doAntes.get(d.arquivo), d);
  }
  for (const a of antes) if (!vistos.has(a.arquivo)) montar(a, undefined);
  return saida;
}

// Nome do arquivo de foto de um lado, tela e clique: antes-s02-numero-b1.jpg.
export function nomeDaFoto(lado, arquivo, beat) {
  const base = arquivo.toLowerCase().endsWith('.html') ? arquivo.slice(0, -5) : arquivo;
  return `${lado}-${base}-b${beat}.jpg`;
}

// Número das mudanças que dizem ter passado por esta tela (pelo número ou pelo nome do arquivo).
function marcasDaTela(tela, mudancas) {
  const marcas = [];
  mudancas.forEach((m, k) => {
    if (m.telas.some((t) => (Number.isInteger(t) ? t === tela.numero : t === tela.arquivo))) marcas.push(k + 1);
  });
  return marcas;
}

const ESTILO = `
:root{--fundo:#f6f4ef;--tinta:#1d1b22;--apoio:#5b5866;--linha:#d9d5cc;--realce:#b8691c;color-scheme:light dark}
@media (prefers-color-scheme:dark){:root{--fundo:#141318;--tinta:#f1eee8;--apoio:#aaa6b4;--linha:#34313c;--realce:#ffb86e}}
*{box-sizing:border-box}
body{margin:0;background:var(--fundo);color:var(--tinta);font:17px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:32px 40px 8px}
.rotulo{display:block;font-size:13px;letter-spacing:.16em;text-transform:uppercase;color:var(--apoio)}
h1{margin:6px 0 0;font-size:30px;line-height:1.2;font-weight:650}
.mudancas{list-style:none;margin:0;padding:18px 40px 26px;display:flex;flex-wrap:wrap;gap:28px;counter-reset:m;border-bottom:1px solid var(--linha)}
.mudancas li{counter-increment:m;display:flex;gap:12px;max-width:460px;color:var(--apoio)}
.mudancas li::before,.marca{content:counter(m);flex:none;width:28px;height:28px;border-radius:50%;background:var(--realce);color:#1a1206;
  font-weight:700;font-size:14px;display:inline-flex;align-items:center;justify-content:center}
.mudancas strong{display:block;color:var(--tinta);font-weight:620}
.tela{padding:34px 40px 10px;border-bottom:1px solid var(--linha)}
.tela h2{margin:0 0 4px;font-size:24px;font-weight:650;display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.tela .situacao{font-size:15px;font-weight:500;color:var(--realce)}
.marcas{display:inline-flex;gap:6px}
.clique{margin:22px 0 8px}
.clique h3{margin:0 0 10px;font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:var(--apoio);font-weight:600}
.lados{display:grid;grid-template-columns:1fr 1fr;gap:24px}
.nota{margin:0;padding:14px 40px;color:var(--apoio);font-size:15px;border-bottom:1px solid var(--linha)}
figure{margin:0}
figure img{display:block;width:100%;height:auto;aspect-ratio:16/9;border-radius:6px;outline:1px solid var(--linha)}
figcaption{margin-top:8px;font-size:14px;letter-spacing:.12em;text-transform:uppercase;color:var(--apoio)}
.depois figcaption{color:var(--realce)}
.vazio{aspect-ratio:16/9;display:flex;align-items:center;justify-content:center;color:var(--apoio);border-radius:6px;outline:1px dashed var(--linha)}
.fala{margin:10px 0 0;color:var(--apoio);font-size:16px}
.fala b{color:var(--tinta);font-weight:600}
.igual{color:var(--apoio);font-size:15px}
@media (max-width:820px){header,.mudancas,.nota,.tela{padding-left:16px;padding-right:16px}.lados{grid-template-columns:1fr}}
`;

function lado(classe, rotulo, arquivoDaFoto, alt) {
  if (!arquivoDaFoto) return `<figure class="${classe}"><div class="vazio">Este clique não existia</div><figcaption>${rotulo}</figcaption></figure>`;
  return `<figure class="${classe}"><img src="fotos/${escaparHtml(encodeURIComponent(arquivoDaFoto))}" alt="${escaparHtml(alt)}" loading="lazy"><figcaption>${rotulo}</figcaption></figure>`;
}

function falas(c) {
  if (c.falaAntes === c.falaDepois) return '';
  const parte = (rotulo, t) => (t ? `<b>${rotulo}:</b> “${escaparHtml(t)}”` : `<b>${rotulo}:</b> sem fala`);
  return `<p class="fala">${parte('Fala antes', c.falaAntes)}<br>${parte('Fala depois', c.falaDepois)}</p>`;
}

// A comparação é de cada clique parado: o que só se vê andando fica de fora, e a página diz.
export const NOTA_SEM_MOVIMENTO = 'Cada foto é a tela parada, depois do clique. Movimento, pulso, vídeo e animação desenhada à mão não entram nesta comparação: para ver, abra a apresentação.';

const SITUACAO = { nova: 'tela nova', saiu: 'tela que saiu', mudou: '' };

function blocoDaTela(t, mudancas) {
  const marcas = marcasDaTela(t, mudancas);
  const titulo = `Tela ${t.numero === null ? '' : t.numero}${t.titulo ? ` · ${escaparHtml(t.titulo)}` : ''}`;
  const cabeca = `<h2>${titulo}${SITUACAO[t.situacao] ? ` <span class="situacao">${SITUACAO[t.situacao]}</span>` : ''}${
    marcas.length ? ` <span class="marcas" aria-label="mudanças ${marcas.join(', ')}">${marcas.map((n) => `<span class="marca">${n}</span>`).join('')}</span>` : ''}</h2>`;
  const total = t.cliques.length;
  const cliques = t.cliques
    .map((c) => {
      const rotulo = `Clique ${c.beat + 1} de ${total}`;
      if (!c.mudou) return `<section class="clique"><h3>${rotulo}</h3><p class="igual">Igual ao de antes.</p></section>`;
      const fA = c.antes ? nomeDaFoto('antes', t.arquivo, c.beat) : null;
      const fD = c.depois ? nomeDaFoto('depois', t.arquivo, c.beat) : null;
      return `<section class="clique"><h3>${rotulo}</h3><div class="lados">${lado('antes', 'Antes', fA, `${titulo}, ${rotulo}, antes`)}${lado('depois', 'Depois', fD, `${titulo}, ${rotulo}, depois`)}</div>${falas(c)}</section>`;
    })
    .join('\n');
  return `<article class="tela" id="${escaparHtml(t.arquivo)}">${cabeca}${cliques}</article>`;
}

export function paginaDeComparacao({ pedido, mudancas, telas }) {
  const titulo = pedido ? `Você pediu: ${escaparHtml(pedido)}` : 'O que mudou';
  const itens = mudancas.map((m) => `<li><span><strong>${escaparHtml(m.titulo)}</strong>${m.porque ? escaparHtml(m.porque) : ''}</span></li>`).join('\n');
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Antes e depois</title>
<style>${ESTILO}</style>
</head>
<body>
<header><span class="rotulo">Antes e depois</span><h1>${titulo}</h1></header>
<ol class="mudancas" aria-label="O que mudou">
${itens}
</ol>
<p class="nota">${NOTA_SEM_MOVIMENTO}</p>
<main>
${telas.map((t) => blocoDaTela(t, mudancas)).join('\n')}
</main>
</body>
</html>
`;
}

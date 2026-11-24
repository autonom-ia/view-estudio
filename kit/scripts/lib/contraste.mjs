// Contraste do texto contra o fundo de verdade da tela, lido na foto. Uma tela de apresentação quase
// sempre tem degradê, luz, foto ou vídeo atrás do texto: somar camadas de cor (como o Site Estúdio
// faz) deixaria quase tudo "sem medir". Então o checar tira uma foto da tela com o texto invisível
// (a sombra do texto fica: ela faz parte do fundo que dá leitura) e compara a cor do texto com cada
// ponto da foto atrás dele. Fórmula da WCAG 2 (luminância relativa). Sem regex, sem dependência.

// Mínimos da WCAG 2 (AA): 4,5:1; texto grande (24 px, ou 18,66 px em negrito) 3:1. O tamanho é o da
// tela de 1920 px, a mesma régua do "texto pequeno" do checar.
export const MINIMO_NORMAL = 4.5;
export const MINIMO_GRANDE = 3;
export const GRANDE_PX = 24;
export const GRANDE_NEGRITO_PX = 18.66;
export const NEGRITO = 700;

// Fração mais fraca do fundo que pode ficar abaixo do mínimo: com 0,1, 90% dos pontos atrás do
// texto precisam passar. Um pedaço de céu claro atrás de metade da frase reprova; um brilho de
// poucos pontos, não.
export const PERCENTIL = 0.1;

// Teto de pontos lidos por texto (a foto é lida em grade quando o texto é grande).
export const AMOSTRAS_MAXIMAS = 4000;

export function luz({ r, g, b }) {
  const canal = (v) => {
    const x = v / 255;
    return x <= 0.04045 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

export function razao(a, b) {
  const la = luz(a);
  const lb = luz(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function misturar(cima, baixo, alfa) {
  return {
    r: cima.r * alfa + baixo.r * (1 - alfa),
    g: cima.g * alfa + baixo.g * (1 - alfa),
    b: cima.b * alfa + baixo.b * (1 - alfa),
  };
}

export function hex(c) {
  return `#${[c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
}

export function minimoPara(px, peso) {
  const grande = px >= GRANDE_PX || (px >= GRANDE_NEGRITO_PX && peso >= NEGRITO);
  return grande ? MINIMO_GRANDE : MINIMO_NORMAL;
}

// Pontos da foto dentro das caixas do texto (coordenadas da tela; a foto pode ser menor: "escala").
function pontos(img, caixas, escala) {
  const lista = [];
  let area = 0;
  for (const q of caixas) area += Math.max(0, q.w * escala) * Math.max(0, q.h * escala);
  const passo = Math.max(1, Math.ceil(Math.sqrt(area / AMOSTRAS_MAXIMAS)));
  for (const q of caixas) {
    const x0 = Math.max(0, Math.floor(q.x * escala));
    const y0 = Math.max(0, Math.floor(q.y * escala));
    const x1 = Math.min(img.w, Math.ceil((q.x + q.w) * escala));
    const y1 = Math.min(img.h, Math.ceil((q.y + q.h) * escala));
    for (let y = y0; y < y1; y += passo) {
      for (let x = x0; x < x1; x += passo) {
        const i = (y * img.w + x) * 4;
        lista.push({ r: img.px[i], g: img.px[i + 1], b: img.px[i + 2] });
      }
    }
  }
  return lista;
}

// Mede um texto: { cor: {r,g,b,a}, op, caixas: [{x,y,w,h}], px, peso }. Devolve null quando não há
// ponto da foto atrás dele; senão { razao, minimo, fundo, texto } com a razão do PERCENTIL mais fraco.
export function medirNaFoto(img, item, escala) {
  const fundo = pontos(img, item.caixas, escala);
  if (!fundo.length) return null;
  const alfa = Math.max(0, Math.min(1, (item.cor.a === undefined ? 1 : item.cor.a) * (item.op === undefined ? 1 : item.op)));
  const medidas = fundo.map((p) => {
    const texto = misturar(item.cor, p, alfa);
    return { razao: razao(texto, p), fundo: p, texto };
  });
  medidas.sort((a, b) => a.razao - b.razao);
  const fraca = medidas[Math.min(medidas.length - 1, Math.floor(medidas.length * PERCENTIL))];
  return { razao: fraca.razao, minimo: minimoPara(item.px, item.peso), fundo: hex(fraca.fundo), texto: hex(fraca.texto), pontos: medidas.length };
}

// Achado para o checar: RED abaixo do mínimo; WARN "contraste-justo" no texto grande que passa no
// mínimo de 3:1 mas fica abaixo de 4,5:1 (projetor e sala clara apagam a diferença).
export function anotarContraste(item, m, red, warn) {
  if (!m) return;
  const valor = (Math.floor(m.razao * 100) / 100).toFixed(2);
  const detalhe = `${valor}:1 (precisa ${m.minimo}:1) ${m.texto} sobre ${m.fundo}, ${Math.round(item.px)} px: ${item.nome}`;
  if (m.razao + 0.005 < m.minimo) red.push({ tipo: 'contraste', detalhe });
  else if (m.minimo === MINIMO_GRANDE && m.razao + 0.005 < MINIMO_NORMAL) warn.push({ tipo: 'contraste-justo', detalhe });
}

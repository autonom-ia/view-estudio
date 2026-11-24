// Scripts que rodam DENTRO da página no Chrome (via Runtime.evaluate). Leitura pelo DOM, sem regex.

// Lista as telas do index (rodar com os scripts da página desligados: o palco não monta).
export const TELAS_DO_INDEX = `[...document.querySelectorAll('section')].map((s, k) => {
  const f = s.querySelector('iframe');
  const src = (f && (f.getAttribute('data-src') || f.getAttribute('src'))) || s.getAttribute('data-src');
  return { id: s.id || ('tela-' + (k + 1)), url: src ? new URL(src, location.href).href : null,
    transicao: s.getAttribute('data-transicao') || '' };
})`;

// Espera a tela ficar pronta: load, fontes e imagens (com teto).
export const ESPERAR_PRONTA = `(async () => {
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  if (document.readyState !== 'complete') {
    await Promise.race([new Promise((r) => addEventListener('load', r, { once: true })), dormir(8000)]);
  }
  try { await Promise.race([document.fonts.ready, dormir(5000)]); } catch (e) {}
  for (const img of document.images) {
    if (!img.complete) await Promise.race([new Promise((r) => { img.onload = r; img.onerror = r; }), dormir(5000)]);
  }
  // vídeos: espera os metadados (duração) para o assentar da tela poder escolher o quadro
  for (const v of document.querySelectorAll('video')) {
    if (v.readyState < 1 && (v.getAttribute('src') || v.querySelector('source[src]'))) {
      await Promise.race([new Promise((r) => { v.addEventListener('loadedmetadata', r, { once: true }); v.addEventListener('error', r, { once: true }); }), dormir(5000)]);
    }
  }
  await dormir(120);
  const s = window.__slide;
  const st = s && typeof s.state === 'function' ? s.state() : null;
  return { contrato: !!s, last: st && Number.isInteger(st.last) ? st.last : 0, reduzido: !!(st && st.reduzido) };
})()`;

// Põe a tela parada no beat n ('fim' = último). Sem __slide.assentar, avança e completa as animações.
export const ASSENTAR = (n) => `(async () => {
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const s = window.__slide;
  const st = s && typeof s.state === 'function' ? s.state() : null;
  const last = st && Number.isInteger(st.last) ? st.last : 0;
  const alvo = ${JSON.stringify(n)} === 'fim' ? last : Math.min(${Number.isInteger(n) ? n : 0}, last);
  if (s && typeof s.assentar === 'function') s.assentar(alvo);
  else if (s && typeof s.advance === 'function') {
    const atual = st && Number.isInteger(st.beat) ? st.beat : 0;
    for (let k = atual; k < alvo; k += 1) s.advance();
  }
  try {
    if (window.gsap) for (const t of window.gsap.globalTimeline.getChildren(true, true, true)) {
      try { if (t.repeat && t.repeat() === -1) t.pause(); else t.progress(1); } catch (e) {}
    }
  } catch (e) {}
  // vídeo: pausa e espera o quadro escolhido pelo assentar ser desenhado
  for (const v of document.querySelectorAll('video')) {
    try { v.pause(); } catch (e) {}
    if (v.seeking) await Promise.race([new Promise((r) => v.addEventListener('seeked', r, { once: true })), dormir(5000)]);
    if (v.readyState < 2 && v.readyState > 0) await Promise.race([new Promise((r) => v.addEventListener('loadeddata', r, { once: true })), dormir(3000)]);
  }
  for (const el of document.querySelectorAll('[data-controle], .dica')) el.style.visibility = 'hidden';
  // transição e animação de CSS (uma cor que muda no clique, por exemplo) terminam agora: sem isso a
  // foto e as medidas pegam o meio do caminho. A infinita (um pulso) só para onde está.
  try {
    for (const a of document.getAnimations()) {
      try {
        const vezes = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming().iterations : 1;
        if (vezes === Infinity) a.pause(); else a.finish();
      } catch (e) {}
    }
  } catch (e) {}
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  await dormir(60);
  await new Promise((r) => requestAnimationFrame(r));
  return { beat: alvo, last };
})()`;

// Conferência estrutural pelo DOM: <select>, endereços externos, referências locais,
// fontes com erro e fontes usadas que não foram declaradas.
export const ESTATICO = `(async () => {
  const SISTEMA = new Set(['arial','helvetica','helvetica neue','georgia','times','times new roman','courier',
    'courier new','verdana','tahoma','trebuchet ms','impact','segoe ui','roboto','system-ui','ui-sans-serif',
    'ui-serif','ui-monospace','ui-rounded','sans-serif','serif','monospace','cursive','fantasy','-apple-system',
    'blinkmacsystemfont','inherit','initial','unset','menlo','monaco','consolas','sf mono','sfmono-regular',
    'apple color emoji','segoe ui emoji','noto color emoji','emoji','math']);
  const origem = location.origin;
  const externos = [];
  const locais = new Set();
  const anotar = (bruto, onde) => {
    if (!bruto) return;
    const v = bruto.trim();
    if (!v || v.startsWith('#') || v.startsWith('data:') || v.startsWith('blob:') || v.startsWith('javascript:')
      || v.startsWith('mailto:') || v.startsWith('tel:') || v.startsWith('about:')) return;
    let u;
    try { u = new URL(v, location.href); } catch (e) { return; }
    if (u.origin !== origem) { if (onde !== 'a') externos.push({ onde, url: u.href }); return; }
    locais.add(u.origin + u.pathname);
  };
  const ATRIBUTOS = [['script', 'src'], ['link', 'href'], ['img', 'src'], ['video', 'src'], ['video', 'poster'],
    ['audio', 'src'], ['source', 'src'], ['iframe', 'src'], ['iframe', 'data-src'], ['track', 'src'],
    ['image', 'href'], ['use', 'href'], ['object', 'data'], ['embed', 'src'], ['a', 'href']];
  for (const [tag, attr] of ATRIBUTOS) {
    for (const el of document.querySelectorAll(tag)) anotar(el.getAttribute(attr), tag);
  }
  for (const img of document.querySelectorAll('img[srcset], source[srcset]')) {
    for (const parte of img.getAttribute('srcset').split(',')) anotar(parte.trim().split(' ')[0], 'srcset');
  }
  // folhas de estilo: url() de @font-face e de fundos chegam pela rede (o comando confere lá)
  const quebrados = [];
  await Promise.all([...locais].map(async (url) => {
    try {
      const r = await fetch(url, { method: 'HEAD', cache: 'no-store' });
      if (!r.ok) quebrados.push({ url: url.slice(origem.length), status: r.status });
    } catch (e) { quebrados.push({ url: url.slice(origem.length), status: 0 }); }
  }));
  const faces = new Set();
  const fontesComErro = [];
  for (const f of document.fonts) {
    let fam = f.family.trim();
    if ((fam.startsWith('"') && fam.endsWith('"')) || (fam.startsWith("'") && fam.endsWith("'"))) fam = fam.slice(1, -1);
    faces.add(fam.toLowerCase());
    if (f.status === 'error') fontesComErro.push(fam);
  }
  const fantasmas = new Set();
  for (const el of document.body.querySelectorAll('*')) {
    let temTexto = false;
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim()) { temTexto = true; break; }
    if (!temTexto) continue;
    const lista = getComputedStyle(el).fontFamily.split(',');
    let primeira = (lista[0] || '').trim();
    if ((primeira.startsWith('"') && primeira.endsWith('"')) || (primeira.startsWith("'") && primeira.endsWith("'"))) primeira = primeira.slice(1, -1);
    const chave = primeira.toLowerCase();
    if (chave && !faces.has(chave) && !SISTEMA.has(chave)) fantasmas.add(primeira);
  }
  return {
    selects: document.querySelectorAll('select').length,
    externos,
    quebrados,
    fontesComErro: [...new Set(fontesComErro)],
    fantasmas: [...fantasmas],
  };
})()`;

// Medidas do quadro assentado: colisão de texto, texto pequeno, texto fora da tela,
// título colado no próximo elemento e texto vazando de um recorte. Devolve também, em "contraste",
// os textos que o checar mede contra a foto da tela (lib/contraste.mjs): cor, opacidade, caixas
// das linhas, tamanho e peso. Fica fora da medida de contraste: texto decorativo
// (aria-hidden="true", como uma marca d'água) e texto recuado de propósito (data-recua já
// alcançado neste beat: foi medido nos beats em que estava em foco).
export const MEDIR = (limites, beat = 0) => `(() => {
  const L = ${JSON.stringify(limites)};
  const BEAT = ${Number.isInteger(beat) ? beat : 0};
  const palco = document.querySelector('.palco-tela') || document.body;
  const pr = palco.getBoundingClientRect();
  const escala = pr.width > 0 ? pr.width / 1920 : 1;
  const juntar = (t) => { let s = ''; let espaco = false; for (const ch of t) { const b = ch === ' ' || ch === '\\n' || ch === '\\t' || ch === '\\r' || ch === '\\u00a0'; if (b) { espaco = true; } else { if (espaco && s) s += ' '; espaco = false; s += ch; } } return s; };
  const visivel = (el) => {
    try { if (el.checkVisibility) return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch (e) {}
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.05;
  };
  const opacidade = (el) => { let o = 1; let n = el; while (n && n !== document.body) { o *= parseFloat(getComputedStyle(n).opacity); n = n.parentElement; } return o; };
  const nomeDe = (it) => {
    const el = it.el; const id = el.id ? '#' + el.id : '';
    const cls = el.classList && el.classList[0] ? '.' + el.classList[0] : '';
    return el.tagName.toLowerCase() + id + cls + ' "' + it.texto.slice(0, 32) + '"';
  };
  const itens = [];
  for (const el of palco.querySelectorAll('*')) {
    const tag = el.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'defs' || tag === 'title') continue;
    if (el.closest('[data-controle]')) continue;
    let proprio = '';
    for (const n of el.childNodes) if (n.nodeType === 3) proprio += n.textContent;
    proprio = juntar(proprio);
    if (proprio.length < 1) continue;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) continue;
    itens.push({ el, r, cs, texto: proprio, vis: visivel(el), op: opacidade(el) });
  }
  const red = [];
  const warn = [];
  // texto pequeno: menor que L.texto_minimo px na tela de 1920
  for (const it of itens) {
    if (!it.vis || it.op < 0.05) continue;
    const px = parseFloat(it.cs.fontSize) * escala;
    if (px + 0.01 < L.texto_minimo) red.push({ tipo: 'texto-pequeno', detalhe: Math.round(px * 10) / 10 + ' px: ' + nomeDe(it) });
  }
  // texto fora da tela
  for (const it of itens) {
    if (!it.vis || it.op < 0.05) continue;
    const fora = Math.max(pr.left - it.r.left, it.r.right - pr.right, pr.top - it.r.top, it.r.bottom - pr.bottom);
    if (fora > L.vazamento) red.push({ tipo: 'fora-da-tela', detalhe: Math.round(fora) + ' px: ' + nomeDe(it) });
  }
  // camada opaca entre dois textos = sobreposição de propósito
  const opaca = (el) => {
    const cs = getComputedStyle(el);
    const cor = cs.backgroundColor || '';
    const ini = cor.indexOf('(');
    const fim = cor.lastIndexOf(')');
    if (cor.startsWith('rgb') && ini !== -1 && fim > ini) {
      const partes = cor.slice(ini + 1, fim).split(',');
      const alfa = partes[3] === undefined ? 1 : parseFloat(partes[3]);
      if (alfa >= 0.9) return true;
    }
    return !!(cs.backgroundImage && cs.backgroundImage !== 'none');
  };
  const coberto = (a, b, x0, y0, x1, y1) => {
    for (const fx of [0.25, 0.5, 0.75]) for (const fy of [0.25, 0.5, 0.75]) {
      const x = x0 + (x1 - x0) * fx; const y = y0 + (y1 - y0) * fy;
      let pilha; try { pilha = document.elementsFromPoint(x, y); } catch (e) { continue; }
      const idx = (it) => pilha.findIndex((e) => e === it.el || it.el.contains(e));
      const ia = idx(a); const ib = idx(b);
      if (ia < 0 || ib < 0) continue;
      let tampa = false;
      for (let k = 0; k < Math.max(ia, ib); k += 1) {
        const e = pilha[k];
        if (e === a.el || e === b.el || a.el.contains(e) || b.el.contains(e)) continue;
        if (opaca(e)) { tampa = true; break; }
      }
      if (!tampa) return false;
    }
    return true;
  };
  for (let i = 0; i < itens.length; i += 1) for (let j = i + 1; j < itens.length; j += 1) {
    const a = itens[i]; const b = itens[j];
    if (!a.vis || !b.vis || a.op < 0.55 || b.op < 0.55) continue;
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    const ix = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
    const iy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
    if (ix <= L.sobreposicao || iy <= L.sobreposicao) continue;
    if (a.texto === b.texto) continue;
    if (a.el.parentElement === b.el.parentElement && a.cs.display.includes('inline') && b.cs.display.includes('inline')) continue;
    const x0 = Math.max(a.r.left, b.r.left); const y0 = Math.max(a.r.top, b.r.top);
    if (coberto(a, b, x0, y0, x0 + ix, y0 + iy)) continue;
    red.push({ tipo: 'colisao', detalhe: Math.round(ix) + 'x' + Math.round(iy) + ' px: ' + nomeDe(a) + ' × ' + nomeDe(b) });
  }
  // título colado no próximo texto (aviso)
  for (const t of itens) {
    if (!t.vis || !['h1', 'h2'].includes(t.el.tagName.toLowerCase())) continue;
    let melhor = null;
    for (const o of itens) {
      if (o === t || !o.vis || t.el.contains(o.el) || o.el.contains(t.el)) continue;
      const ix = Math.min(t.r.right, o.r.right) - Math.max(t.r.left, o.r.left);
      if (ix < 20) continue;
      const gap = o.r.top - t.r.bottom;
      if (gap < 0) continue;
      if (!melhor || gap < melhor.gap) melhor = { gap, o };
    }
    if (melhor && melhor.gap < L.respiro_titulo) warn.push({ tipo: 'titulo-colado', detalhe: Math.round(melhor.gap) + ' px: ' + nomeDe(t) + ' → ' + nomeDe(melhor.o) });
  }
  // texto vazando de um pai que recorta (overflow hidden/clip)
  for (const it of itens) {
    if (!it.vis) continue;
    let anc = it.el.parentElement;
    while (anc && anc !== palco && anc !== document.body) {
      const cs = getComputedStyle(anc);
      const recorta = ['hidden', 'clip'].includes(cs.overflowX) || ['hidden', 'clip'].includes(cs.overflowY);
      if (recorta) {
        const ar = anc.getBoundingClientRect();
        const vaza = Math.max(ar.left - it.r.left, it.r.right - ar.right, ar.top - it.r.top, it.r.bottom - ar.bottom);
        if (ar.width > 10 && ar.height > 10 && vaza > L.vazamento) { warn.push({ tipo: 'texto-cortado', detalhe: Math.round(vaza) + ' px: ' + nomeDe(it) }); break; }
      }
      anc = anc.parentElement;
    }
  }
  // contraste: o que vai para a foto. A cor do texto passa por um canvas (oklch, color-mix…).
  const tinta = document.createElement('canvas');
  tinta.width = 1;
  tinta.height = 1;
  const ctx = tinta.getContext('2d', { willReadFrequently: true });
  const cor = (c) => {
    const s = String(c || '').trim();
    if (!s || s === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = 'rgba(0,0,0,0)';
    ctx.fillStyle = s;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    if (d[3] === 0) return { r: 0, g: 0, b: 0, a: 0 };
    return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
  };
  const recuado = (el) => {
    for (let e = el; e && e !== document.body; e = e.parentElement) {
      const v = e.getAttribute('data-recua');
      if (v !== null && v.trim() !== '' && Number(v) <= BEAT) return true;
    }
    return false;
  };
  const temFundo = (e) => {
    const cs = getComputedStyle(e);
    if (cor(cs.backgroundColor).a > 0.05) return true;
    if (cs.backgroundImage && cs.backgroundImage !== 'none') return true;
    return ['IMG', 'VIDEO', 'CANVAS', 'PICTURE', 'IFRAME', 'svg', 'OBJECT', 'EMBED'].includes(e.tagName);
  };
  const contraste = [];
  let decorativos = 0;
  let recuados = 0;
  for (const it of itens) {
    if (!it.vis || it.op < 0.05) continue;
    if (it.el.closest('[aria-hidden="true"]')) { decorativos += 1; continue; }
    if (recuado(it.el)) { recuados += 1; continue; }
    // texto de SVG é pintado pelo fill, não pelo color
    const ehSvg = typeof SVGElement !== 'undefined' && it.el instanceof SVGElement;
    const tinta = ehSvg ? it.cs.fill : (it.cs.webkitTextFillColor || it.cs.color);
    if (ehSvg && String(tinta).startsWith('url')) {
      warn.push({ tipo: 'contraste-nao-medido', detalhe: 'texto de SVG pintado com degradê ou padrão: ' + nomeDe(it) });
      continue;
    }
    const preenchimento = cor(tinta === 'none' ? 'transparent' : tinta);
    if (preenchimento.a < 0.05) {
      warn.push({ tipo: 'contraste-nao-medido', detalhe: 'texto pintado com o fundo (transparente): ' + nomeDe(it) });
      continue;
    }
    const caixas = [];
    for (const n of it.el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const rg = document.createRange();
      rg.selectNodeContents(n);
      for (const q of rg.getClientRects()) {
        const x0 = Math.max(q.left, pr.left); const y0 = Math.max(q.top, pr.top);
        const x1 = Math.min(q.right, pr.right); const y1 = Math.min(q.bottom, pr.bottom);
        if (x1 - x0 > 1 && y1 - y0 > 1) caixas.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
      }
    }
    if (!caixas.length) {
      // texto que o navegador não mede pela linha (alguns SVG): usa a caixa do elemento
      const x0 = Math.max(it.r.left, pr.left); const y0 = Math.max(it.r.top, pr.top);
      const x1 = Math.min(it.r.right, pr.right); const y1 = Math.min(it.r.bottom, pr.bottom);
      if (x1 - x0 > 1 && y1 - y0 > 1) caixas.push({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
    }
    if (!caixas.length) continue;
    const q = caixas[0];
    let pilha = [];
    try { pilha = document.elementsFromPoint(q.x + q.w / 2, q.y + q.h / 2); } catch (e) {}
    const k = pilha.findIndex((e) => e === it.el || it.el.contains(e));
    let tampado = k < 0;
    for (let j = 0; !tampado && j < k; j += 1) if (temFundo(pilha[j])) tampado = true;
    if (tampado) {
      warn.push({ tipo: 'contraste-nao-medido', detalhe: 'outro elemento por cima do texto: ' + nomeDe(it) });
      continue;
    }
    contraste.push({
      nome: nomeDe(it),
      cor: preenchimento,
      op: it.op,
      caixas,
      px: parseFloat(it.cs.fontSize) * escala,
      peso: parseInt(it.cs.fontWeight, 10) || 400,
    });
  }
  // o que fica fora da medida de propósito é dito, com o motivo e quantos (só texto visível conta)
  if (decorativos || recuados) {
    const partes = [];
    if (decorativos) partes.push(decorativos + (decorativos === 1 ? ' texto decorativo (aria-hidden)' : ' textos decorativos (aria-hidden)'));
    if (recuados) partes.push(recuados + (recuados === 1 ? ' texto recuado de propósito (data-recua)' : ' textos recuados de propósito (data-recua)'));
    warn.push({ tipo: 'contraste-fora-da-medida', detalhe: partes.join(' e ') + ' fora da medida de contraste' });
  }
  const teto = L.contraste_maximo || 60;
  if (contraste.length > teto) {
    warn.unshift({ tipo: 'contraste-nao-medido', detalhe: contraste.length + ' textos neste clique; só os ' + teto + ' primeiros foram medidos (' + (contraste.length - teto) + ' sem medir)' });
  }
  return { red: red.slice(0, L.maximo), warn: warn.slice(0, L.maximo), medidos: itens.length, contraste: contraste.slice(0, teto) };
})()`;

// Esconde a letra de todo texto da tela (a sombra fica: ela é parte do fundo que dá leitura) para a
// foto do fundo. Sem transição, para a cor não voltar aos poucos quando o estilo sai.
export const ESCONDER_TEXTO = `(async () => {
  let s = document.getElementById('__estudio_sem_texto');
  if (!s) { s = document.createElement('style'); s.id = '__estudio_sem_texto'; (document.head || document.documentElement).appendChild(s); }
  s.textContent = '*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;'
    + '-webkit-text-stroke-color:transparent!important;text-decoration-color:transparent!important;'
    + 'caret-color:transparent!important;transition:none!important}'
    + 'text,tspan,textPath{fill:transparent!important;stroke:transparent!important}';
  void document.documentElement.offsetWidth;
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return true;
})()`;

// Devolve a letra sem disparar transição de cor: primeiro tira as cores mantendo "sem transição",
// força o cálculo do estilo e só então remove o estilo.
export const MOSTRAR_TEXTO = `(async () => {
  const s = document.getElementById('__estudio_sem_texto');
  if (s) {
    s.textContent = '*,*::before,*::after{transition:none!important}';
    void document.documentElement.offsetWidth;
    s.remove();
    void document.documentElement.offsetWidth;
  }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return true;
})()`;

// O texto que a plateia lê numa tela assentada, para a conferência de fatos: só os nós de texto
// visíveis (checkVisibility com opacidade e visibilidade: texto com opacity 0 não conta, o innerText
// contaria), o que o CSS escreve com content: nos elementos visíveis e os endereços tel: e mailto:
// dos links. Texto de blocos diferentes vai em linhas diferentes (como o innerText faz). A dica de
// teclado ([data-controle]) fica de fora.
export const TEXTO_PARA_FATOS = `(() => {
  const raiz = document.querySelector('.palco-tela') || document.body;
  const visivel = (el) => {
    try { if (el.checkVisibility) return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); } catch (e) {}
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0;
  };
  const blocoDe = (el) => {
    let e = el;
    while (e && e !== raiz && getComputedStyle(e).display.startsWith('inline')) e = e.parentElement;
    return e;
  };
  const pedacos = [];
  let bloco = null;
  let linha = '';
  const andar = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = andar.nextNode(); n; n = andar.nextNode()) {
    const el = n.parentElement;
    if (!el || el.closest('script, style, template, noscript, [data-controle]')) continue;
    // espaço entre palavras (inclusive entre os spans de data-entra="palavras") separa números
    if (!n.textContent.trim()) { if (linha) linha += ' '; continue; }
    if (!visivel(el)) continue;
    const b = blocoDe(el);
    if (b !== bloco && linha) { pedacos.push(linha); linha = ''; }
    bloco = b;
    linha += n.textContent;
  }
  if (linha) pedacos.push(linha);
  for (const el of raiz.querySelectorAll('*')) {
    if (el.closest('[data-controle]') || !visivel(el)) continue;
    for (const pseudo of ['::before', '::after']) {
      const c = getComputedStyle(el, pseudo).content;
      if (c && c !== 'none' && c !== 'normal' && c.length > 2 && c.startsWith('"')) pedacos.push(c.slice(1, -1));
    }
  }
  const enderecos = [];
  for (const a of raiz.querySelectorAll('a[href]')) {
    const h = (a.getAttribute('href') || '').trim();
    const baixo = h.toLowerCase();
    if (baixo.startsWith('tel:') || baixo.startsWith('mailto:')) enderecos.push(h);
  }
  return { texto: pedacos.join('\\n'), enderecos };
})()`;

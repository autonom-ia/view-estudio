/* palco.js — troca de tela do deck do View Estúdio. Versão 2.
   Fica em deck/assets/vendor/palco/palco.js. O index só lista as telas; o palco faz o resto.

   MANIFESTO (no index):
     <section class="slide" id="t04" data-transicao="match produto 800">
       <iframe data-src="slides/s04-produto.html"></iframe></section>
   A transição pertence à tela que ENTRA. Sem data-transicao = dissolve (padrão).
   Corte seco é escolha declarada: data-transicao="corte".

   TIPOS
     corte                         troca no mesmo quadro (só depois que a tela nova pintou)
     dissolve [ms]                 a nova surge por cima da antiga
     empurra <direção> [ms]        esquerda|direita|cima|baixo: a nova empurra a antiga
     match <nome> [ms]             o elemento [data-match=nome] voa da posição antiga para a nova
     continua                      o <video data-continua> da nova segue do tempo do vídeo da antiga
   Voltando (←): match/continua viram dissolve curto; empurra inverte o sentido.

   CONTRATO DA TELA (window.__slide, montado por cena.js)
     advance() · back() · state() → {beat, last} · entra(ctx) · sai() · pronto (Promise)
     saida({ms, manter}) → Promise   antes de dissolve/match, a tela que sai recolhe o texto
     cena() → {src, t, filtro}       fundo que continua de uma tela para a outra (opcional)
     assentar(n)                     põe a tela no beat n, parada (prints, pdf, checar)

   TECLAS: ←/→ trocam de tela · ↓/espaço/PageDown avançam o beat · ↑/PageUp voltam.
   TELEPROMPTER: o palco reemite {pageno, beat} da tela visível em BroadcastChannel('estudio-roteiro').

   INVARIANTES
     1. nunca mostra camada que não pintou (load + fontes + tela pronta + 2 quadros);
     2. quem sai pausa mídia e timelines; nada toca em tela oculta;
     3. no máximo 2 iframes carregados;
     4. a próxima tela é pré-carregada (a tela espera parada até entra()). */
(() => {
  'use strict';
  const VERSAO = 2;
  const PADRAO = 'dissolve';
  const DUR = { corte: 0, dissolve: 500, empurra: 650, match: 750, continua: 0 };
  const DIRECAO = { esquerda: ['100%', '0%'], direita: ['-100%', '0%'], cima: ['0%', '100%'], baixo: ['0%', '-100%'] };
  const OPOSTA = { esquerda: 'direita', direita: 'esquerda', cima: 'baixo', baixo: 'cima' };
  const EASE = 'cubic-bezier(.65,0,.35,1)';
  const EASE_MATCH = 'cubic-bezier(.7,0,.2,1)';
  const FRACAO_FADE_MATCH = 0.35;      // no match, a camada nova aparece rápido; o elemento voa o tempo todo
  const VOLTA_MS = 300;
  const TETO_FONTES_MS = 1500;
  const TETO_PRONTO_MS = 2500;
  const TETO_SEEK_MS = 900;
  const TETO_LOAD_MS = 8000;           // servidor que pendura a conexão não pode congelar o deck
  const TETO_HEAD_MS = 2000;
  const ANTECIPA_CONTINUA_S = 0.35;    // a nova busca um ponto à frente e espera a antiga alcançar
  const SAIDA_MS = 200;                // a tela que sai recolhe o texto antes de a cena dissolver
  const TETO_SAIDA_MS = 450;

  // ---------- leitura da transição (estrutural, sem interpretar linguagem) ----------
  function lerTransicao(texto) {
    const partes = String(texto || '').replaceAll('\t', ' ').split(' ').filter(Boolean);
    const tipo = partes.length && Object.prototype.hasOwnProperty.call(DUR, partes[0]) ? partes[0] : PADRAO;
    const numero = partes.slice(1).find(p => String(Number(p)) === p && Number(p) >= 0);
    const arg = partes.slice(1).find(p => p !== numero) || null;
    return { tipo, dur: numero != null ? Number(numero) : DUR[tipo], arg };
  }
  function transicaoDaTroca(n, dir) {
    const t = lerTransicao(telas[dir > 0 ? n : atual].transicao);
    if (reduz) return { tipo: 'corte', dur: 0, arg: null };
    if (dir > 0) return t;
    if (t.tipo === 'match' || t.tipo === 'continua') return { tipo: 'dissolve', dur: VOLTA_MS, arg: null };
    if (t.tipo === 'empurra') return { ...t, arg: OPOSTA[t.arg] || 'direita' };
    return t;
  }

  // ---------- montagem ----------
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const stage = document.getElementById('stage') || document.querySelector('.deck-stage');
  const secoes = [...stage.querySelectorAll(':scope > section')];
  const telas = secoes.map(s => {
    const f = s.querySelector('iframe');
    return { id: s.id, src: (f && f.dataset.src) || s.dataset.src || '', transicao: s.dataset.transicao || '' };
  });
  const css = document.createElement('style');
  css.textContent = `#${stage.id || 'stage'} > section{display:none!important}
.palco-camada{position:absolute;left:0;top:0;width:1920px;height:1080px;border:0;display:block;
  opacity:0;pointer-events:none;z-index:0;background:transparent}
.palco-camada.frente{opacity:1;pointer-events:auto;z-index:2}`;
  document.head.appendChild(css);
  const camadas = [0, 1].map(k => {
    const f = document.createElement('iframe');
    f.className = 'palco-camada';
    f.setAttribute('allow', 'autoplay; fullscreen');
    f.setAttribute('title', 'tela do deck');
    f.dataset.camada = String(k);
    stage.appendChild(f);
    return f;
  });

  let atual = -1;
  let frente = camadas[0];
  let tras = camadas[1];
  let preCarga = null;                 // { idx, promessa }
  let ocupado = false;
  let emCurso = -1;                    // tela para onde a transição atual está indo
  let pendente = null;                 // { n, dir } — tecla apertada durante a transição
  const antigo = new Set();            // telas cujo slide não tem __slide.entra
  const ultimoRs = new Map();          // camada -> último {pageno, beat} que ela mandou

  // ---------- utilitários ----------
  const TETO_TROCA_FOLGA_MS = 1500;
  const teto = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);
  const quadros = (w, n = 2) => new Promise(r => {
    const passo = k => (k ? w.requestAnimationFrame(() => passo(k - 1)) : r());
    passo(n);
  });
  const slideDe = f => { try { return f.contentWindow.__slide || null; } catch (e) { return null; } };
  const docDe = f => { try { return f.contentDocument; } catch (e) { return null; } };
  const ehV2 = f => { const s = slideDe(f); return !!(s && typeof s.entra === 'function'); };

  function esperaLoad(f) {
    return new Promise(r => f.addEventListener('load', r, { once: true }));
  }
  // cada carga leva uma senha; se outra carga começar na mesma camada, a antiga não grava nada
  const senhas = new Map();
  async function carregar(f, idx) {
    const senha = (senhas.get(f) || 0) + 1;
    senhas.set(f, senha);
    const valida = () => senhas.get(f) === senha;
    // tela que não existe (404, inclusive página de erro em HTML): palco vazio, sem quebrar
    const existe = await teto(fetch(telas[idx].src, { method: 'HEAD' }).then(r => r.status !== 404 && r.status !== 410).catch(() => true), TETO_HEAD_MS);
    if (!valida()) return false;
    const carregou = esperaLoad(f);
    f.src = existe === false ? 'about:blank' : telas[idx].src;
    await teto(carregou, TETO_LOAD_MS);
    if (!valida()) return false;
    let w = f.contentWindow;
    let d = docDe(f);
    // resposta que não é HTML (ex.: página de erro de um servidor quando o HEAD não foi conclusivo)
    if (d && d.contentType && d.contentType !== 'text/html' && w.location.href !== 'about:blank') {
      const vazio = esperaLoad(f);
      f.src = 'about:blank';
      await teto(vazio, TETO_LOAD_MS);
      if (!valida()) return false;
      w = f.contentWindow; d = docDe(f);
    }
    try { if (d && d.fonts) await teto(d.fonts.ready, TETO_FONTES_MS); } catch (e) {}
    const s = slideDe(f);
    try { if (s && s.pronto) await teto(s.pronto, TETO_PRONTO_MS); } catch (e) {}
    try { await teto(quadros(w), 200); } catch (e) {}
    if (!valida()) return false;
    f.dataset.idx = String(idx);
    if (!ehV2(f)) antigo.add(idx);
    return true;
  }
  function descarregar(f) {
    senhas.set(f, (senhas.get(f) || 0) + 1);
    ultimoRs.delete(f);
    delete f.dataset.idx;
    f.src = 'about:blank';
  }
  function pausar(f) {
    const s = slideDe(f);
    try { if (s && typeof s.sai === 'function') s.sai(); } catch (e) {}
    const d = docDe(f);
    if (d) d.querySelectorAll('video,audio').forEach(m => { try { m.pause(); } catch (e) {} });
    try { const w = f.contentWindow; if (w.gsap) w.gsap.globalTimeline.pause(); } catch (e) {}
  }

  // ---------- continuidade ----------
  async function recolherTexto(f, tr) {
    if (tr.tipo !== 'dissolve' && tr.tipo !== 'match') return;
    const s = slideDe(f);
    if (!s || typeof s.saida !== 'function') return;
    try { await teto(Promise.resolve(s.saida({ ms: SAIDA_MS, manter: tr.tipo === 'match' ? tr.arg : null })), TETO_SAIDA_MS); } catch (e) {}
  }
  function cenaDe(f) {
    const s = slideDe(f);
    try { return s && typeof s.cena === 'function' ? (s.cena() || null) : null; } catch (e) { return null; }
  }
  function voarMatch(nome, dur) {
    const dOut = docDe(frente), dIn = docDe(tras);
    if (!dOut || !dIn || !nome) return null;
    const sel = `[data-match="${CSS.escape(nome)}"]`;
    const elOut = dOut.querySelector(sel), elIn = dIn.querySelector(sel);
    if (!elOut || !elIn) return null;
    const r0 = elOut.getBoundingClientRect();
    // translate/scale individuais compõem com o transform do GSAP sem brigar
    const s = elIn.style, r1 = elIn.getBoundingClientRect();
    s.scale = '2'; const r2 = elIn.getBoundingClientRect(); s.scale = '';
    s.translate = '100px 100px'; const r3 = elIn.getBoundingClientRect(); s.translate = '';
    const kx = (r3.left - r1.left) / 100 || 1, ky = (r3.top - r1.top) / 100 || 1;
    const ox = 2 * r1.left - r2.left, oy = 2 * r1.top - r2.top;
    const sx = r0.width / (r1.width || 1), sy = r0.height / (r1.height || 1);
    const tx = (r0.left - ox - sx * (r1.left - ox)) / kx;
    const ty = (r0.top - oy - sy * (r1.top - oy)) / ky;
    const voo = elIn.animate(
      [{ translate: `${tx}px ${ty}px`, scale: `${sx} ${sy}` }, { translate: '0px 0px', scale: '1 1' }],
      { duration: dur, easing: EASE_MATCH });
    // sem cópia fantasma: a origem some quando a camada nova já cobriu (os dois ainda coincidem)
    setTimeout(() => { elOut.style.visibility = 'hidden'; }, dur * FRACAO_FADE_MATCH);
    return voo.finished.catch(() => {});
  }

  async function sincronizarContinua() {
    const dOut = docDe(frente), dIn = docDe(tras);
    const vOut = dOut && dOut.querySelector('video');
    const vIn = dIn && dIn.querySelector('video[data-continua]');
    if (!vOut || !vIn) return null;
    const alvo = Math.min(vOut.currentTime + ANTECIPA_CONTINUA_S, (vIn.duration || Infinity) - 0.05);
    vIn.pause();
    vIn.currentTime = alvo;
    await teto(new Promise(r => vIn.addEventListener('seeked', r, { once: true })), TETO_SEEK_MS);
    if (vIn.requestVideoFrameCallback) await teto(new Promise(r => vIn.requestVideoFrameCallback(r)), 300);
    // a antiga continua tocando até alcançar o ponto em que a nova está parada
    if (!vOut.paused) {
      await teto(new Promise(r => {
        const ver = () => (vOut.currentTime >= alvo || vOut.paused ? r() : requestAnimationFrame(ver));
        ver();
      }), (ANTECIPA_CONTINUA_S * 1000) + 400);
    }
    return { alvo, vIn };
  }

  // ---------- revelação ----------
  async function revelar(entra, sai, tr) {
    const anims = [];
    const opt = { duration: tr.dur, easing: EASE, fill: 'both' };
    entra.style.zIndex = '3';
    if (tr.tipo === 'dissolve') {
      anims.push(entra.animate([{ opacity: 0 }, { opacity: 1 }], opt).finished);
    } else if (tr.tipo === 'match') {
      anims.push(entra.animate([{ opacity: 0 }, { opacity: 1 }],
        { ...opt, duration: tr.dur * FRACAO_FADE_MATCH }).finished);
    } else if (tr.tipo === 'empurra') {
      const [x, y] = DIRECAO[tr.arg] || DIRECAO.esquerda;
      const inv = v => (v === '0%' ? '0%' : (v.startsWith('-') ? v.slice(1) : '-' + v));
      entra.style.opacity = '1';
      anims.push(entra.animate([{ transform: `translate(${x},${y})` }, { transform: 'translate(0,0)' }], opt).finished);
      anims.push(sai.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${inv(x)},${inv(y)})` }], opt).finished);
    }
    entra.classList.add('frente');
    entra.style.opacity = '';
    await Promise.all(anims.map(p => p.catch(() => {})));
    entra.getAnimations().forEach(a => a.cancel());
    sai.getAnimations().forEach(a => a.cancel());
    sai.classList.remove('frente');
    entra.style.zIndex = '';
  }

  // ---------- navegação ----------
  async function ir(n, dir) {
    if (!Number.isInteger(n) || n < 0 || n >= telas.length || n === atual) return;
    ocupado = true;
    emCurso = n;
    // durante a transição, tecla e clique não vão para a tela que sai
    try { if (document.activeElement && document.activeElement.blur) document.activeElement.blur(); window.focus(); } catch (e) {}
    try {
      const tr = atual < 0 ? { tipo: 'corte', dur: 0, arg: null } : transicaoDaTroca(n, dir);
      if (preCarga && preCarga.idx === n) await preCarga.promessa;
      preCarga = null;
      if (tras.dataset.idx !== String(n) || antigo.has(n)) await carregar(tras, n);

      const cont = atual >= 0 && tr.tipo === 'continua' ? await sincronizarContinua() : null;
      const cena = atual >= 0 ? cenaDe(frente) : null;
      // a tela nova começa a entrada ainda escondida, enquanto a antiga recolhe o texto:
      // quando o dissolve abre, o título já está a caminho (sem quadro vazio entre as duas)
      const v2 = ehV2(tras);
      if (v2) {
        slideDe(tras).entra({ transicao: tr.tipo, de: atual, videoT: cont ? cont.alvo : null, cena,
          assentado: tr.tipo === 'match' || tr.tipo === 'continua' });
      }
      if (atual >= 0) await recolherTexto(frente, tr);
      if (atual >= 0) pausar(frente);
      if (cont) cont.vIn.play().catch(() => {});
      // slide antigo ainda está animando a própria entrada: medir o destino agora daria voo errado
      const voo = atual >= 0 && tr.tipo === 'match' && v2 ? voarMatch(tr.arg, tr.dur) : null;
      // teto: animação que nunca liquida não pode deixar o palco ocupado para sempre
      await teto(Promise.all([revelar(tras, frente, tr), voo]), (tr.dur || 0) + TETO_TROCA_FOLGA_MS);

      [frente, tras] = [tras, frente];
      atual = n;
      anunciar();
      try { frente.focus(); } catch (e) {}
      descarregar(tras);
    } catch (e) {
      console.error('palco: falha na troca de tela', e);
      // a tela que ficou já recolheu o texto e pausou: recarrega e assenta para não ficar muda
      try { if (atual >= 0) { await carregar(frente, atual); if (ehV2(frente)) slideDe(frente).entra({ transicao: 'corte', de: atual, assentado: true }); } } catch (e2) {}
    } finally {
      ocupado = false;
    }
    if (pendente) {
      const p = pendente; pendente = null;
      if (p.n !== atual) { ir(p.n, p.dir); return; }
    }
    preCarregar(atual + 1);
  }
  function preCarregar(idx) {
    if (idx >= telas.length || antigo.has(idx)) return;
    const f = tras;
    preCarga = { idx, promessa: carregar(f, idx)
      .then(ok => { if (ok && antigo.has(idx) && f !== frente) descarregar(f); })
      .catch(e => console.error('palco: falha na pré-carga', e)) };
  }
  function navegar(delta) {
    const base = pendente ? pendente.n : (ocupado ? emCurso : atual);
    const n = Math.max(0, Math.min(telas.length - 1, base + delta));
    if (n === base) return;
    if (ocupado) { pendente = { n, dir: Math.sign(delta) }; return; }
    ir(n, Math.sign(delta));
  }

  // ---------- chrome: contador, barra, botões, teclas, relay do teleprompter ----------
  const rsBC = ('BroadcastChannel' in window) ? new BroadcastChannel('estudio-roteiro') : null;
  let rsLast = null;
  function rsEmit(st) {
    if (!rsBC || !st || typeof st.pageno !== 'number') return;
    rsLast = st;
    try { rsBC.postMessage({ pageno: st.pageno, beat: st.beat || 0 }); } catch (e) {}
  }
  if (rsBC) rsBC.onmessage = ev => { if (ev.data && ev.data.hello && rsLast) rsEmit(rsLast); };

  function anunciar() {
    const c = document.getElementById('counter');
    if (c) c.textContent = String(atual + 1).padStart(2, '0') + ' / ' + String(telas.length).padStart(2, '0');
    const p = document.getElementById('progress');
    if (p) p.style.width = ((atual + 1) / telas.length * 100) + '%';
    if (ultimoRs.has(frente)) rsEmit(ultimoRs.get(frente));
  }
  function delegar(fn, plano) {
    const s = slideDe(frente);
    try {
      const f = (s && s[fn]) || frente.contentWindow[fn];
      if (typeof f === 'function') { f(); return; }
    } catch (e) {}
    plano();
  }
  addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') { e.preventDefault(); navegar(1); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); navegar(-1); }
    else if ([' ', 'ArrowDown', 'PageDown'].includes(e.key)) { e.preventDefault(); if (!ocupado) delegar('advance', () => navegar(1)); }
    else if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); if (!ocupado) delegar('back', () => navegar(-1)); }
  });
  addEventListener('message', e => {
    const d = e.data;
    const camada = camadas.find(f => f.contentWindow === e.source);
    if (!d || !camada) return;
    if (d.rsBeat && typeof d.rsBeat.pageno === 'number') {
      const st = { pageno: d.rsBeat.pageno, beat: d.rsBeat.beat || 0 };
      ultimoRs.set(camada, st);
      if (camada === frente && !ocupado) rsEmit(st);
      return;
    }
    if (camada !== frente || ocupado) return;     // só a tela visível e assentada navega
    if (d.deckNav === 'next') navegar(1);
    else if (d.deckNav === 'prev') navegar(-1);
  });
  const nx = document.getElementById('next'), pv = document.getElementById('prev');
  if (nx) nx.onclick = () => navegar(1);
  if (pv) pv.onclick = () => navegar(-1);

  function fit() {
    const s = Math.min(innerWidth / 1920, innerHeight / 1080);
    stage.style.transform = `translate(${(innerWidth - 1920 * s) / 2}px,${(innerHeight - 1080 * s) / 2}px) scale(${s})`;
  }
  addEventListener('resize', fit);
  fit();

  window.__palco = {
    versao: VERSAO,
    total: telas.length,
    atual: () => atual,
    ocupado: () => ocupado,
    frente: () => frente,
    camadas: () => camadas.slice(),
    ir: n => navegar(n - (pendente ? pendente.n : (ocupado ? emCurso : atual))),
    proximo: () => navegar(1),
    anterior: () => navegar(-1),
    lerTransicao,
  };
  if (telas.length) ir(0, 1);
})();

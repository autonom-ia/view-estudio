/* cena.js — motor de beats de uma tela do View Estúdio. Versão 1.
   Fica em deck/assets/vendor/palco/cena.js. Cada tela carrega o GSAP e depois este arquivo,
   no fim do <body>.

   COMO A TELA DECLARA OS BEATS (sem escrever JavaScript):
     data-beat="N"        o elemento entra no beat N (0 = abre com a tela)
     data-entra="tipo"    sobe (padrão) · surge · desliza · cresce · revela · risca · palavras · conta
     data-atraso="s"      atraso dentro do beat, em segundos (sem isso, entra em cascata na ordem do HTML)
     data-dur="s"         duração da entrada
     data-recua="N"       no beat N o elemento recua (fica esmaecido) para dar foco ao que entra
     data-sai="N"         no beat N o elemento sai de cena
     conta: data-valor="1250" data-casas="0" data-antes="R$ " data-depois="%"
   Elemento sem data-beat fica sempre na tela (fundo, luz, foto).

   GANCHOS OPCIONAIS (movimento autoral, por tela), declarados ANTES deste script:
     window.CENA = {
       beats: { 2: (tl, gsap) => { tl.to('#foto', { scale: 1.08, duration: 2 }, 0); } },
       assentar: (n, gsap) => { gsap.set('#foto', { scale: n >= 2 ? 1.08 : 1 }); },
       ultimo: 3,   // força o número do último beat
     };
   Todo gancho de beat precisa do assentar correspondente: prints, pdf e checar põem a tela
   em cada beat sem animar.

   CONTRATO (window.__slide): advance · back · state() → {beat, last} · assentar(n) ·
   entra(ctx) · sai() · saida({ms, manter}) · pronto. Dentro do palco a tela espera entra().
   Teclas: ↓/espaço/Enter/PageDown avançam · ↑/PageUp voltam · ←/→ trocam de tela no palco.
   Movimento reduzido: a sequência da fala continua (cada beat entra por corte seco, sem animação)
   e o teleprompter acompanha. Sem GSAP: a tela mostra o estado final parado e as teclas trocam de tela. */
(() => {
  'use strict';
  const LARGURA = 1920;
  const ALTURA = 1080;
  const CASCATA_S = 0.12;
  const RECUO = 0.28;
  const ENTRADAS = {
    sobe: { de: { autoAlpha: 0, y: 48 }, para: { autoAlpha: 1, y: 0 }, dur: 0.8, ease: 'power3.out' },
    surge: { de: { autoAlpha: 0 }, para: { autoAlpha: 1 }, dur: 0.7, ease: 'power1.out' },
    desliza: { de: { autoAlpha: 0, x: -72 }, para: { autoAlpha: 1, x: 0 }, dur: 0.8, ease: 'power3.out' },
    cresce: { de: { autoAlpha: 0, scale: 0.92 }, para: { autoAlpha: 1, scale: 1 }, dur: 0.9, ease: 'power3.out' },
    revela: { de: { autoAlpha: 1, clipPath: 'inset(0% 100% 0% 0%)' }, para: { autoAlpha: 1, clipPath: 'inset(0% 0% 0% 0%)' }, dur: 1.0, ease: 'power3.inOut' },
    risca: { de: { autoAlpha: 1, scaleX: 0, transformOrigin: '0% 50%' }, para: { autoAlpha: 1, scaleX: 1 }, dur: 0.9, ease: 'power3.inOut' },
  };

  const html = document.documentElement;
  try { if (window.top !== window.self) html.classList.add('no-deck'); } catch (e) { html.classList.add('no-deck'); }
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const g = window.gsap;
  const temGsap = typeof g !== 'undefined';
  const animado = temGsap && !reduz;
  const config = window.CENA || {};

  // ---------- palco 1920x1080 que escala para a janela ----------
  const tela = document.querySelector('.palco-tela');
  function fit() {
    if (!tela) return;
    const s = Math.min(innerWidth / LARGURA, innerHeight / ALTURA);
    tela.style.transform = `translate(${(innerWidth - LARGURA * s) / 2}px,${(innerHeight - ALTURA * s) / 2}px) scale(${s})`;
  }
  addEventListener('resize', fit);
  fit();

  // ---------- leitura dos beats ----------
  const inteiro = (v, padrao) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : padrao;
  };
  const numero = (v, padrao) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : padrao;
  };
  const itens = [...document.querySelectorAll('[data-beat]')].map((el) => ({
    el,
    beat: inteiro(el.dataset.beat, 0),
    tipo: el.dataset.entra || 'sobe',
    atraso: el.dataset.atraso,
    dur: el.dataset.dur,
    recua: el.dataset.recua === undefined ? null : inteiro(el.dataset.recua, null),
    sai: el.dataset.sai === undefined ? null : inteiro(el.dataset.sai, null),
  }));
  const ultimoDeclarado = itens.reduce((m, it) => Math.max(m, it.beat, it.recua || 0, it.sai || 0), 0);
  const LAST = Number.isInteger(config.ultimo) ? config.ultimo : ultimoDeclarado;

  // palavras: cada palavra vira um <span> para entrar em cascata (só nós de texto; o resto fica)
  function quebrarPalavras(el) {
    const andar = (no) => {
      for (const filho of [...no.childNodes]) {
        if (filho.nodeType === 3) {
          const partes = filho.textContent.split(' ');
          const frag = document.createDocumentFragment();
          partes.forEach((p, k) => {
            if (p) {
              const s = document.createElement('span');
              s.className = 'palavra';
              s.style.display = 'inline-block';
              s.textContent = p;
              frag.appendChild(s);
            }
            if (k < partes.length - 1) frag.appendChild(document.createTextNode(' '));
          });
          no.replaceChild(frag, filho);
        } else if (filho.nodeType === 1) andar(filho);
      }
    };
    andar(el);
    return [...el.querySelectorAll('.palavra')];
  }
  for (const it of itens) if (it.tipo === 'palavras') it.palavras = quebrarPalavras(it.el);

  // conta: número que sobe até data-valor, escrito no formato do Brasil
  function textoDaConta(el, v) {
    const casas = inteiro(el.dataset.casas, 0);
    const corpo = v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
    return (el.dataset.antes || '') + corpo + (el.dataset.depois || '');
  }
  const valorFinal = (el) => numero(el.dataset.valor, 0);

  // ---------- estado por beat ----------
  function estadoEm(it, n) {
    if (it.sai !== null && n >= it.sai) return 'saiu';
    if (n < it.beat) return 'antes';
    if (it.recua !== null && n >= it.recua) return 'recuado';
    return 'visivel';
  }
  function pousar(it, estado) {
    const e = ENTRADAS[it.tipo] || ENTRADAS.sobe;
    if (it.tipo === 'palavras') {
      g.set(it.el, { autoAlpha: estado === 'saiu' ? 0 : estado === 'recuado' ? RECUO : 1 });
      g.set(it.palavras, estado === 'antes' ? { autoAlpha: 0, y: 28 } : { autoAlpha: 1, y: 0 });
      return;
    }
    if (it.tipo === 'conta') {
      it.el.textContent = textoDaConta(it.el, estado === 'antes' ? 0 : valorFinal(it.el));
      g.set(it.el, estado === 'antes' ? { autoAlpha: 0, y: 24 } : { autoAlpha: estado === 'saiu' ? 0 : estado === 'recuado' ? RECUO : 1, y: 0 });
      return;
    }
    if (estado === 'antes') g.set(it.el, e.de);
    else g.set(it.el, { ...e.para, autoAlpha: estado === 'saiu' ? 0 : estado === 'recuado' ? RECUO : 1 });
  }

  let beat = 0;
  let ativa = null;
  function assentar(n) {
    const alvo = Math.max(-1, Math.min(LAST, Number.isInteger(n) ? n : LAST));
    if (ativa) { ativa.kill(); ativa = null; }
    if (temGsap) {
      for (const it of itens) pousar(it, estadoEm(it, alvo));
      if (typeof config.assentar === 'function') { try { config.assentar(alvo, g); } catch (e) { console.error(e); } }
    }
    if (alvo >= 0) beat = alvo;
    return alvo;
  }

  function animar(n) {
    if (ativa) ativa.progress(1);
    const tl = g.timeline();
    ativa = tl;
    let ordem = 0;
    for (const it of itens) {
      const e = ENTRADAS[it.tipo] || ENTRADAS.sobe;
      const dur = numero(it.dur, e.dur || 0.8);
      if (it.beat === n) {
        const pos = it.atraso !== undefined ? numero(it.atraso, 0) : ordem * CASCATA_S;
        ordem += 1;
        if (it.tipo === 'palavras') {
          tl.set(it.el, { autoAlpha: 1 }, pos);
          tl.to(it.palavras, { autoAlpha: 1, y: 0, duration: dur, ease: 'power3.out', stagger: 0.045 }, pos);
        } else if (it.tipo === 'conta') {
          const contador = { v: 0 };
          tl.to(it.el, { autoAlpha: 1, y: 0, duration: 0.5, ease: 'power2.out' }, pos);
          tl.to(contador, { v: valorFinal(it.el), duration: numero(it.dur, 1.6), ease: 'power2.out',
            onUpdate: () => { it.el.textContent = textoDaConta(it.el, contador.v); } }, pos);
        } else {
          tl.to(it.el, { ...e.para, duration: dur, ease: e.ease }, pos);
        }
      }
      if (it.recua === n) tl.to(it.el, { autoAlpha: RECUO, duration: 0.5, ease: 'power1.out' }, 0);
      if (it.sai === n) tl.to(it.el, { autoAlpha: 0, duration: 0.4, ease: 'power1.in' }, 0);
    }
    const gancho = config.beats && config.beats[n];
    if (typeof gancho === 'function') { try { gancho(tl, g); } catch (e) { console.error(e); } }
  }

  // ---------- teleprompter: número da tela = 1º número do nome do arquivo ----------
  function numeroDoArquivo() {
    const nome = (location.pathname.split('/').pop() || '');
    let digitos = '';
    for (const ch of nome) {
      if (ch >= '0' && ch <= '9') digitos += ch;
      else if (digitos) break;
    }
    return digitos ? Number(digitos) : null;
  }
  const PAGENO = numeroDoArquivo();
  const canal = ('BroadcastChannel' in window) ? new BroadcastChannel('estudio-roteiro') : null;
  function avisarBeat() {
    if (PAGENO === null) return;
    try {
      if (parent !== window) parent.postMessage({ rsBeat: { pageno: PAGENO, beat } }, '*');
      else if (canal) canal.postMessage({ pageno: PAGENO, beat });
    } catch (e) {}
  }
  if (canal && parent === window) canal.onmessage = (ev) => { if (ev.data && ev.data.hello) avisarBeat(); };

  // ---------- navegação ----------
  function pedirAoPalco(dir) { try { if (parent !== window) parent.postMessage({ deckNav: dir }, '*'); } catch (e) {} }
  // beat seguinte: animado, ou por corte seco quando o movimento é reduzido
  function mostrarBeat(n) {
    if (animado) { beat = n; animar(n); } else assentar(n);
  }
  function advance() {
    if (!temGsap) { pedirAoPalco('next'); return; }
    if (beat < LAST) { mostrarBeat(beat + 1); avisarBeat(); } else pedirAoPalco('next');
  }
  function back() {
    if (!temGsap) { pedirAoPalco('prev'); return; }
    if (beat > 0) { assentar(beat - 1); avisarBeat(); } else pedirAoPalco('prev');
  }
  addEventListener('keydown', (e) => {
    if ([' ', 'ArrowDown', 'PageDown', 'Enter'].includes(e.key)) { e.preventDefault(); advance(); return; }
    if (['ArrowUp', 'PageUp'].includes(e.key)) { e.preventDefault(); back(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); pedirAoPalco('next'); return; }
    if (e.key === 'ArrowLeft') { e.preventDefault(); pedirAoPalco('prev'); }
  });
  addEventListener('click', (e) => {
    const alvo = e.target;
    if (alvo && alvo.closest && alvo.closest('a, button, [data-controle], video[controls]')) return;
    advance();
  });

  // ---------- mídia ----------
  const noPalco = (() => { try { return parent !== window && !!parent.__palco && parent.__palco.versao >= 2; } catch (e) { return false; } })();
  const videos = [...document.querySelectorAll('video')];
  videos.forEach((v) => { if (v.autoplay) { v.dataset.play = ''; v.autoplay = false; if (noPalco) v.pause(); } });
  const tocar = () => videos.forEach((v) => { if (v.hasAttribute('data-play')) v.play().catch(() => {}); });
  const pronto = Promise.all(videos.map((v) => (v.readyState >= 2 ? 0 : new Promise((r) => {
    v.addEventListener('loadeddata', r, { once: true });
    v.addEventListener('error', r, { once: true });
  }))));

  function entra(ctx) {
    const c = ctx || {};
    beat = 0;
    if (temGsap) {
      assentar(-1);
      if (c.assentado || !animado) assentar(0); else animar(0);
    }
    tocar();
    avisarBeat();
  }
  function sai() {
    if (ativa) ativa.pause();
    videos.forEach((v) => v.pause());
  }
  function saida(opcoes) {
    const o = opcoes || {};
    if (!temGsap) return Promise.resolve();
    const alvos = itens.map((it) => it.el).filter((el) => !(o.manter && el.dataset.match === o.manter));
    return new Promise((r) => g.to(alvos, { autoAlpha: 0, duration: (o.ms || 200) / 1000, ease: 'power1.in', onComplete: r }));
  }

  // sem GSAP: estado final, parado. Com GSAP (animado ou não), a tela começa antes do beat 0.
  if (!temGsap) {
    for (const it of itens) {
      const est = estadoEm(it, LAST);
      it.el.style.visibility = est === 'saiu' ? 'hidden' : 'visible';
      it.el.style.opacity = est === 'recuado' ? String(RECUO) : est === 'saiu' ? '0' : '1';
      if (it.tipo === 'conta') it.el.textContent = textoDaConta(it.el, valorFinal(it.el));
    }
    document.querySelectorAll('.dica').forEach((el) => { el.style.opacity = '0'; });
  } else {
    assentar(-1);
  }

  window.__slide = {
    advance,
    back,
    assentar: (n) => (temGsap ? assentar(n) : LAST),
    state: () => ({ beat, last: LAST, reduzido: !animado }),
    entra: temGsap ? entra : () => { tocar(); avisarBeat(); },
    sai,
    saida,
    pronto,
  };

  // fora do palco (tela aberta sozinha): abre o beat 0 e avisa o teleprompter
  if (!noPalco) {
    if (animado) animar(0);
    else if (temGsap) assentar(0);
    tocar();
    avisarBeat();
    setTimeout(avisarBeat, 300);
  }
})();

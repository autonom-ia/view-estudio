// Gera <nome>.pdf: uma página 16:9 por tela, cada tela no estado final (último beat assentado).
// O Chrome imprime o próprio deck; não há renderizador paralelo. Tela que não abre reprova.
import fs from 'node:fs';
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao } from '../lib/apresentacao.mjs';
import { abrirSessao, telasDoIndex, LARGURA, ALTURA } from '../lib/sessao.mjs';
import { lerStream, esperar } from '../lib/cdp.mjs';
import { progresso } from '../lib/executar.mjs';
import { reprovado } from '../lib/saida.mjs';
import { escaparHtml } from '../lib/teleprompter.mjs';

const PAGINA_VIRTUAL = '/__estudio-pdf.html';
const TETO_TELA_MS = 20000;
// 1920x1080 px = 1440x810 pt na MediaBox de cada página.
export const MEDIABOX_16_9 = '/MediaBox [0 0 1440 810]';

export function contarPaginas(pdf) {
  const s = pdf.toString('latin1');
  return s.split('/Type /Page').length - 1 - (s.split('/Type /Pages').length - 1);
}
export function contarPaginas16por9(pdf) {
  return pdf.toString('latin1').split(MEDIABOX_16_9).length - 1;
}

function paginaDeImpressao(telas) {
  const paginas = telas.map((t) => `<div class="pg"><iframe src="${escaparHtml(t.url)}"></iframe></div>`).join('\n');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>pdf</title><style>
@page{size:${LARGURA}px ${ALTURA}px;margin:0}
html,body{margin:0;padding:0;background:#fff}
.pg{width:${LARGURA}px;height:${ALTURA}px;overflow:hidden;break-after:page}
.pg:last-child{break-after:auto}
iframe{width:${LARGURA}px;height:${ALTURA}px;border:0;display:block}
</style></head><body>
${paginas}
</body></html>`;
}

// Assenta a tela k (iframe k) no último beat e confere imagens e vídeos.
const ASSENTAR_TELA = (k) => `(async () => {
  const f = document.querySelectorAll('iframe')[${k}];
  const evento = (alvo, ok, erro) => new Promise((res) => {
    alvo.addEventListener(ok, () => res(true), { once: true });
    if (erro) alvo.addEventListener(erro, () => res(false), { once: true });
  });
  async function assentar() {
    if (!f.contentDocument || f.contentDocument.readyState !== 'complete') await evento(f, 'load');
    const doc = f.contentDocument;
    if (!doc || doc.contentType !== 'text/html') return 'não abriu como HTML (arquivo ausente ou caminho errado)';
    if (!doc.body || doc.body.innerHTML.trim() === '') return 'documento vazio';
    await doc.fonts.ready;
    const s = f.contentWindow.__slide;
    if (s && typeof s.assentar === 'function') s.assentar(s.state().last);
    else if (s && typeof s.state === 'function' && typeof s.advance === 'function') {
      const st = s.state();
      for (let n = st.beat || 0; n < (st.last || 0); n += 1) s.advance();
    }
    try { const g = f.contentWindow.gsap; if (g) for (const t of g.globalTimeline.getChildren(true, true, true)) { if (t.repeat && t.repeat() === -1) t.pause(); else t.progress(1); } } catch (e) {}
    for (const el of doc.querySelectorAll('[data-controle], .dica')) el.style.visibility = 'hidden';
    for (const img of doc.images) {
      if (!img.getAttribute('src') && !img.getAttribute('srcset')) continue;
      if (!img.complete) await evento(img, 'load', 'error');
      if (img.naturalWidth === 0) return 'imagem não carregou: ' + (img.getAttribute('src') || '(sem src)');
    }
    for (const v of doc.querySelectorAll('video')) {
      v.pause();
      if (v.poster) continue;
      if (!v.getAttribute('src') && !v.querySelector('source[src]')) continue;
      if (v.readyState < 1) { v.preload = 'auto'; const ok = evento(v, 'loadedmetadata', 'error'); v.load(); if (!(await ok)) return 'vídeo não carregou: ' + (v.getAttribute('src') || v.currentSrc); }
      if (!Number.isFinite(v.duration) || v.duration <= 0) continue;
      const fim = Math.max(0, v.duration - 0.05);
      if (Math.abs(v.currentTime - fim) > 0.01) { const vai = evento(v, 'seeked', 'error'); v.currentTime = fim; await vai; }
    }
    return null;
  }
  let t;
  const teto = new Promise((res) => { t = setTimeout(() => res('não ficou pronta em ${TETO_TELA_MS} ms'), ${TETO_TELA_MS}); });
  const motivo = await Promise.race([assentar(), teto]);
  clearTimeout(t);
  return motivo;
})()`;

export default async function pdf(args) {
  const nome = nomeDaApresentacao(args);
  const c = abrirApresentacao(nome);
  const virtuais = {};
  const sessao = await abrirSessao(c.deck, { virtuais });
  let paginas = 0;
  let bytes = 0;
  const erros = [];
  let total = 0;
  try {
    const secoes = await telasDoIndex(sessao);
    total = secoes.length;
    const telas = secoes.filter((t) => t.rel);
    for (const t of secoes) if (!t.rel) erros.push({ tela: t.id, motivo: 'section sem data-src dentro do deck' });
    if (!telas.length) reprovado('DECK_SEM_TELAS', {});
    virtuais[PAGINA_VIRTUAL] = paginaDeImpressao(telas);
    progresso(`Montando o PDF de ${telas.length} telas...`);
    await sessao.ir(sessao.origem + PAGINA_VIRTUAL);
    for (let k = 0; k < telas.length; k += 1) {
      const motivo = await sessao.tab.evaluate(ASSENTAR_TELA(k), TETO_TELA_MS + 5000);
      if (motivo) erros.push({ tela: telas[k].arquivo, motivo });
    }
    await esperar(500);
    if (!erros.length) {
      const r = await sessao.tab.send(
        'Page.printToPDF',
        { printBackground: true, preferCSSPageSize: true, transferMode: 'ReturnAsStream', marginTop: 0, marginBottom: 0, marginLeft: 0, marginRight: 0 },
        120000,
      );
      const arquivo = await lerStream(sessao.tab, r.stream);
      paginas = contarPaginas(arquivo);
      const em16por9 = contarPaginas16por9(arquivo);
      if (paginas !== total) erros.push({ tela: 'pdf', motivo: `${paginas} páginas para ${total} telas` });
      else if (em16por9 !== paginas) erros.push({ tela: 'pdf', motivo: `${paginas - em16por9} página(s) fora de 16:9` });
      else {
        fs.writeFileSync(c.pdf, arquivo);
        bytes = arquivo.length;
      }
    }
  } finally {
    await sessao.fechar();
  }
  if (erros.length) reprovado('PDF_REPROVADO', { erros });
  return {
    ok: true,
    codigo: 'PDF_PRONTO',
    arquivos: { pdf: c.rel(`${nome}.pdf`) },
    dados: { paginas, telas: total, megabytes: Math.round((bytes / 1048576) * 10) / 10 },
  };
}

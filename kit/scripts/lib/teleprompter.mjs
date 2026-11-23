// Monta o teleprompter: um HTML só, com o roteiro embutido, que acompanha o deck sozinho.
// O deck emite {pageno, beat} em BroadcastChannel('estudio-roteiro'); o teleprompter ouve.
// Abrir os dois pelo mesmo endereço (./estudio abrir <nome>): o canal só liga páginas da mesma origem.

export const CANAL = 'estudio-roteiro';

export function escaparHtml(t) {
  return String(t).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

// JSON seguro dentro de <script>: "<", ">", U+2028 e U+2029 viram \uXXXX.
export function jsonParaScript(valor) {
  let saida = '';
  for (const ch of JSON.stringify(valor)) {
    if (ch === '<' || ch === '>' || ch === ' ' || ch === ' ') saida += `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`;
    else saida += ch;
  }
  return saida;
}

export function montarTeleprompter(telas, titulo) {
  const dados = jsonParaScript(telas.map((t) => ({ tela: t.tela, titulo: t.titulo, beats: t.beats })));
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaparHtml(titulo)} · teleprompter</title>
<style>
:root{--fundo:#0E0D12;--texto:#F4F1EA;--apoio:#A39FB0;--destaque:#FFC27A;--linha:#2A2833}
*{margin:0;padding:0;box-sizing:border-box}
html,body{height:100%}
body{background:var(--fundo);color:var(--texto);font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  display:flex;flex-direction:column;overflow:hidden;-webkit-font-smoothing:antialiased}
header{display:flex;align-items:baseline;gap:18px;padding:16px 32px;border-bottom:1px solid var(--linha);font-size:20px;color:var(--apoio)}
header .tela{color:var(--destaque);font-weight:700;font-variant-numeric:tabular-nums}
header .seguir{margin-left:auto;font-size:16px;background:none;border:1px solid var(--linha);color:var(--apoio);
  border-radius:6px;padding:8px 14px;min-height:44px;cursor:pointer}
header .seguir[aria-pressed="true"]{border-color:var(--destaque);color:var(--destaque)}
header .seguir:focus-visible{outline:2px solid var(--destaque);outline-offset:2px}
main{flex:1;display:flex;flex-direction:column;justify-content:center;gap:28px;padding:32px 8vw;overflow-y:auto}
#rotulo{font-size:22px;color:var(--apoio)}
#fala{font-size:44px;line-height:1.45;font-weight:500;max-width:30em}
#fala .inicio{color:var(--destaque);font-weight:700}
#nota{display:none;max-width:40em;font-size:26px;line-height:1.45;color:var(--apoio);padding-left:20px;border-left:4px solid var(--destaque)}
footer{padding:14px 32px 20px;border-top:1px solid var(--linha);font-size:20px;color:var(--apoio);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
footer b{font-weight:600;color:var(--texto)}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
</style>
</head>
<body>
<header>
  <span class="tela" id="tTela"></span><span id="tTitulo"></span><span id="tBeat"></span>
  <button class="seguir" id="seguir" type="button" aria-pressed="true">Seguir o deck</button>
</header>
<main aria-live="polite">
  <div id="rotulo"></div>
  <div id="fala"></div>
  <div id="nota"></div>
</main>
<footer id="proximo"></footer>
<script>
const TELAS = ${dados};
const LISTA = [];
const INDICE = {};
for (const t of TELAS) t.beats.forEach((b, k) => {
  INDICE[t.tela + ':' + k] = LISTA.length;
  LISTA.push({ tela: t.tela, titulo: t.titulo, beat: k, total: t.beats.length, rotulo: b.rotulo, fala: b.fala, nota: b.nota });
});
let atual = 0;
let seguir = true;
const doisDigitos = (n) => String(n).padStart(2, '0');
function primeiraFrase(t) {
  for (let k = 0; k < t.length; k += 1) if (t[k] === '.' || t[k] === '!' || t[k] === '?') return t.slice(0, k + 1);
  return t;
}
function desenhar() {
  const b = LISTA[atual];
  if (!b) return;
  document.getElementById('tTela').textContent = 'Tela ' + doisDigitos(b.tela);
  document.getElementById('tTitulo').textContent = b.titulo;
  document.getElementById('tBeat').textContent = 'beat ' + (b.beat + 1) + ' de ' + b.total;
  document.getElementById('rotulo').textContent = b.rotulo;
  const fala = document.getElementById('fala');
  const inicio = primeiraFrase(b.fala);
  fala.textContent = '';
  const s = document.createElement('span');
  s.className = 'inicio';
  s.textContent = inicio;
  fala.appendChild(s);
  fala.appendChild(document.createTextNode(b.fala.slice(inicio.length)));
  const nota = document.getElementById('nota');
  nota.style.display = b.nota ? 'block' : 'none';
  nota.textContent = b.nota || '';
  const p = LISTA[atual + 1];
  const rodape = document.getElementById('proximo');
  rodape.textContent = '';
  if (p) {
    const k = document.createElement('b');
    k.textContent = 'Depois: ';
    rodape.appendChild(k);
    rodape.appendChild(document.createTextNode('tela ' + doisDigitos(p.tela) + ', ' + (p.rotulo || 'beat ' + (p.beat + 1)) + '. ' + primeiraFrase(p.fala)));
  } else rodape.textContent = 'Fim do roteiro.';
  const botao = document.getElementById('seguir');
  botao.setAttribute('aria-pressed', String(seguir));
  botao.textContent = seguir ? 'Seguindo o deck' : 'Seguir o deck';
}
function ir(i) { if (i >= 0 && i < LISTA.length) { atual = i; desenhar(); } }
function mover(d) { seguir = false; ir(atual + d); }
addEventListener('keydown', (e) => {
  if ([' ', 'ArrowDown', 'ArrowRight', 'PageDown', 'Enter'].includes(e.key)) { e.preventDefault(); mover(1); }
  else if (['ArrowUp', 'ArrowLeft', 'PageUp'].includes(e.key)) { e.preventDefault(); mover(-1); }
  else if (e.key === 's' || e.key === 'S') { seguir = true; desenhar(); }
});
document.getElementById('seguir').addEventListener('click', () => { seguir = !seguir; desenhar(); });
if ('BroadcastChannel' in window) {
  const canal = new BroadcastChannel('${CANAL}');
  canal.onmessage = (ev) => {
    const d = ev.data || {};
    if (d.hello || !seguir) return;
    const i = INDICE[d.pageno + ':' + d.beat];
    if (i !== undefined) ir(i);
  };
  try { canal.postMessage({ hello: true }); } catch (e) {}
}
desenhar();
window.__teleprompter = { atual: () => atual, lista: LISTA, ir, seguir: (v) => { seguir = v; desenhar(); } };
</script>
</body>
</html>
`;
}

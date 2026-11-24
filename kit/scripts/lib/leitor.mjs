// Leitor de páginas da internet: o mesmo navegador sem janela do estúdio, numa aba de computador,
// em português, sem o "Headless" na identificação (alguns sites mostram página vazia para ele).
// Só lê: nada é enviado, publicado nem preenchido. Sem senha, sem login e sem cookie do Chrome da
// pessoa (perfil temporário, apagado ao fechar).
// Portado do Site Estúdio (lib/leitor.mjs), sem a parte do Instagram (login e escuta da rede).
import { launch, openTab, navegar, esperar } from './cdp.mjs';

const LARGURA = 1280;
const ALTURA = 900;
const IDIOMA = 'pt-BR,pt;q=0.9,en;q=0.5';
const PAUSA_DA_ESPERA_MS = 300;
const TETO_DE_AVALIAR_MS = 60000;

// Uma função e os argumentos dela viram uma expressão para rodar na página.
export function chamada(fn, ...args) {
  return `(${fn.toString()})(${args.map((a) => JSON.stringify(a === undefined ? null : a)).join(', ')})`;
}

// deps: as peças de verdade; os testes podem trocar.
const PECAS = Object.freeze({ launch, openTab });

export async function abrirLeitor(deps = PECAS) {
  const nav = await deps.launch({ largura: LARGURA, altura: ALTURA });
  let tab = null;
  try {
    tab = await deps.openTab(nav.porta);
    await tab.send('Page.enable');
    await tab.send('Runtime.enable');
    await tab.send('Network.enable');
    const agente = String(await tab.evaluate('navigator.userAgent', 5000)).split('Headless').join('');
    await tab.send('Network.setUserAgentOverride', { userAgent: agente, acceptLanguage: IDIOMA });
    await tab.send('Emulation.setDeviceMetricsOverride', { width: LARGURA, height: ALTURA, deviceScaleFactor: 1, mobile: false });
  } catch (e) {
    try {
      tab?.close();
    } catch {}
    nav.close();
    throw e;
  }
  const avaliar = (fn, ...args) => tab.evaluate(chamada(fn, ...args), TETO_DE_AVALIAR_MS);
  return {
    ir: (url) => navegar(tab, url),
    avaliar,
    endereco: () => tab.evaluate('location.href', 5000),
    // Repete a função na página até ela devolver algo verdadeiro ou o prazo acabar.
    esperarAte: async (fn, prazoMs, ...args) => {
      const fim = Date.now() + prazoMs;
      let ultimo = null;
      while (Date.now() < fim) {
        try {
          ultimo = await avaliar(fn, ...args);
          if (ultimo) return ultimo;
        } catch {
          /* a página ainda está trocando */
        }
        await esperar(PAUSA_DA_ESPERA_MS);
      }
      return ultimo;
    },
    fechar: () => {
      try {
        tab.close();
      } catch {}
      try {
        nav.close();
      } catch {}
    },
  };
}

// Percorre um valor de JSON (objetos e listas) e devolve todo objeto que a função aceita.
export function acharObjetos(valor, aceita, limite = 500) {
  const achados = [];
  const pilha = [valor];
  const vistos = new Set();
  while (pilha.length && achados.length < limite) {
    const v = pilha.pop();
    if (!v || typeof v !== 'object' || vistos.has(v)) continue;
    vistos.add(v);
    if (!Array.isArray(v) && aceita(v)) achados.push(v);
    const filhos = Array.isArray(v) ? v : Object.values(v);
    for (let i = filhos.length - 1; i >= 0; i -= 1) pilha.push(filhos[i]);
  }
  return achados;
}

// JSON.parse que não derruba a leitura: texto quebrado vira null.
export function jsonOuNada(texto) {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

// Data do dia, AAAA-MM-DD, no fuso do computador.
export function hoje(agora = new Date()) {
  const dois = (n) => String(n).padStart(2, '0');
  return `${agora.getFullYear()}-${dois(agora.getMonth() + 1)}-${dois(agora.getDate())}`;
}

// Endereço sem âncora, para comparar e não visitar a mesma página duas vezes.
export function semAncora(url) {
  try {
    const u = new URL(url);
    u.hash = '';
    return u.href;
  } catch {
    return '';
  }
}

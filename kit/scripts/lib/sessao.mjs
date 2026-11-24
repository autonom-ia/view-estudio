// Sessão de navegador para um deck: servidor local na pasta deck/ + Chrome sem janela + uma aba.
// Registra o que a rede pediu (para achar endereço externo e arquivo que não carregou).
import path from 'node:path';
import { launch, openTab, navegar, esperar } from './cdp.mjs';
import { servir } from './servidor.mjs';
import { TELAS_DO_INDEX } from './pagina.mjs';
import { falha } from './saida.mjs';

export const LARGURA = 1920;
export const ALTURA = 1080;

const PECAS = Object.freeze({ servir, launch, openTab });

// O Chrome pede /favicon.ico sozinho quando a página não declara ícone, e nem sempre a tempo de
// a rede registrar. A apresentação não pede esse arquivo, então a falta dele não é arquivo
// quebrado: contar daria vermelho num computador e verde no outro. Ícone declarado com outro
// nome (<link rel="icon" href="assets/...">) continua conferido.
const PEDIDO_DO_NAVEGADOR = '/favicon.ico';

// Separa o que a página pediu para fora da origem local e o que não carregou.
export function separarPedidos(pedidos, origem) {
  const externos = [];
  const quebrados = [];
  for (const p of pedidos) {
    const u = p.url;
    if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:') || u.startsWith('chrome')) continue;
    if (!u.startsWith(`${origem}/`)) {
      externos.push(u);
      continue;
    }
    const rel = u.slice(origem.length);
    if (rel === PEDIDO_DO_NAVEGADOR) continue;
    if (p.falhou || (p.status !== null && p.status >= 400)) {
      quebrados.push({ url: rel, status: p.status || 0, erro: p.falhou || '' });
    }
  }
  return { externos: [...new Set(externos)], quebrados };
}

// "pecas" existe para os testes trocarem o servidor e o navegador por versões de mentira.
export async function abrirSessao(raizServida, { largura = LARGURA, altura = ALTURA, virtuais = {} } = {}, pecas = PECAS) {
  const srv = await pecas.servir(raizServida, { virtuais });
  let nav = null;
  let tab = null;
  try {
    nav = await pecas.launch({ largura, altura });
    tab = await pecas.openTab(nav.porta);
    await tab.send('Page.enable');
    await tab.send('Network.enable');
    await tab.send('Network.setCacheDisabled', { cacheDisabled: true });
    await tab.send('Emulation.setDeviceMetricsOverride', { width: largura, height: altura, deviceScaleFactor: 1, mobile: false });
    // Medidas e fotos iguais em qualquer máquina: o "reduzir movimento" do sistema (Windows com
    // animações desligadas, Mac com acessibilidade) não muda o que o checar e o prints veem.
    await tab.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  } catch (e) {
    // nada fica para trás: aba, navegador e servidor fecham antes do erro subir
    try {
      if (tab) tab.close();
    } catch {}
    try {
      if (nav) nav.close();
    } catch {}
    await srv.fechar();
    throw e;
  }

  // rede: cada pedido e o resultado dele
  let pedidos = new Map();
  tab.on((m) => {
    if (m.method === 'Network.requestWillBeSent') {
      pedidos.set(m.params.requestId, { url: m.params.request.url, status: null, falhou: null });
    } else if (m.method === 'Network.responseReceived') {
      const p = pedidos.get(m.params.requestId);
      if (p) p.status = m.params.response.status;
    } else if (m.method === 'Network.loadingFailed') {
      const p = pedidos.get(m.params.requestId);
      if (p && !m.params.canceled) p.falhou = m.params.errorText || 'falhou';
    }
  });

  const sessao = {
    srv,
    tab,
    portaDevtools: nav.porta,
    origem: srv.origem,
    virtuais,
    url: (rel) => `${srv.origem}/${rel.split(path.sep).join('/')}`,
    zerarRede: () => {
      pedidos = new Map();
    },
    // pedidos para fora da origem local e pedidos que falharam
    rede: () => separarPedidos(pedidos.values(), srv.origem),
    ir: async (url) => {
      await navegar(tab, url);
    },
    fechar: async () => {
      try {
        tab.close();
      } catch {}
      try {
        nav.close();
      } catch {}
      await srv.fechar();
    },
  };
  return sessao;
}

// Lê as telas do index com os scripts desligados (o palco não monta). Devolve [{id, url, rel, arquivo}].
export async function telasDoIndex(sessao, relIndex = 'index.html') {
  await sessao.tab.send('Emulation.setScriptExecutionDisabled', { value: true });
  try {
    await sessao.ir(sessao.url(relIndex));
    await esperar(50);
    const telas = await sessao.tab.evaluate(TELAS_DO_INDEX);
    return telas.map((t) => {
      if (!t.url) return { ...t, rel: null, arquivo: null };
      const u = new URL(t.url);
      const rel = u.origin === sessao.origem ? decodeURIComponent(u.pathname.slice(1)) : null;
      return { ...t, rel, arquivo: rel ? rel.split('/').pop() : null };
    });
  } finally {
    await sessao.tab.send('Emulation.setScriptExecutionDisabled', { value: false });
  }
}

export function exigirTelas(telas) {
  if (!telas.length) falha('DECK_SEM_TELAS', {});
  return telas;
}

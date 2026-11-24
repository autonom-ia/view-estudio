// O site atual inteiro: visita as páginas do mesmo endereço (até um teto), guarda o texto de cada
// uma, os links de contato, as fotos e os dados que o próprio site declara em JSON-LD (endereço,
// telefone, horário). Lido pelo DOM do navegador e por JSON.parse; sem expressão regular.
// Portado do Site Estúdio (lib/ler-site.mjs).
import path from 'node:path';
import { acharObjetos, jsonOuNada, semAncora } from './leitor.mjs';
import { baixar } from './baixar.mjs';

const TETO_DE_PAGINAS = 30;
const TETO_DE_FOTOS = 30;
const LARGURA_MINIMA_DA_FOTO = 600;
const NAO_E_PAGINA = Object.freeze([
  '.pdf', '.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg', '.avif', '.zip', '.mp4', '.mp3', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
]);

const semWww = (host) => (host.startsWith('www.') ? host.slice(4) : host);

// Endereço que não é o site do próprio negócio: rede social, conversa, link curto, página de links,
// loja de pedidos e menu de terceiros. Ler um desses anotaria o contato de outro como fato.
const NAO_E_SITE = Object.freeze([
  'instagram.com', 'facebook.com', 'fb.com', 'fb.me', 'm.me', 'wa.me', 'wa.link', 'whatsapp.com', 'tiktok.com', 'youtube.com', 'youtu.be',
  'x.com', 'twitter.com', 'threads.net', 'linkedin.com', 'pinterest.com', 'kwai.com', 'google.com', 'goo.gl', 'g.co', 'g.page',
  'bit.ly', 'tinyurl.com', 't.co', 'cutt.ly', 'is.gd', 'ow.ly', 'rebrand.ly', 's.id', 'encurtador.com.br',
  'linktr.ee', 'linkme.bio', 'beacons.ai', 'lnk.bio', 'taplink.cc', 'taplink.at', 'campsite.bio', 'bio.link', 'linkin.bio', 'solo.to', 'linkbio.co', 'hoo.be', 'msha.ke',
  'ifood.com.br', 'rappi.com.br', 'aiqfome.com', 'ubereats.com', '99app.com', 'goomer.app', 'anota.ai', 'cardapioweb.com', 'menudino.com', 'deliverydireto.com.br',
]);

export function ehSiteDoNegocio(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    return !NAO_E_SITE.some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

// A primeira página abriu no mesmo endereço pedido (com ou sem www, http ou https) e ele é do negócio?
// Redirecionamento para outro endereço para a leitura: quem confirma o novo endereço é a pessoa.
export function abriuNoMesmoSite(pedido, final) {
  if (!ehSiteDoNegocio(final)) return false;
  try {
    return semWww(new URL(pedido).hostname) === semWww(new URL(final).hostname);
  } catch {
    return false;
  }
}

// Roda na página: rola até o fim (fotos que só carregam ao aparecer) e volta ao topo.
async function rolarAteOFim() {
  for (let i = 0; i < 8; i += 1) {
    window.scrollBy(0, window.innerHeight);
    await new Promise((r) => setTimeout(r, 150));
  }
  window.scrollTo(0, 0);
  return true;
}

function lerPaginaDoSite() {
  const meta = (n) => document.querySelector(`meta[name="${n}"]`)?.getAttribute('content') || '';
  return {
    url: location.href,
    titulo: document.title,
    descricao: meta('description'),
    titulos: [...document.querySelectorAll('h1, h2, h3')].map((h) => h.innerText.trim()).filter(Boolean).slice(0, 60),
    texto: (document.body ? document.body.innerText : '').slice(0, 40000),
    links: [...document.querySelectorAll('a[href]')].map((a) => a.href),
    imagens: [...document.querySelectorAll('img')]
      .map((img) => ({ src: img.currentSrc || img.src, largura: img.naturalWidth, altura: img.naturalHeight, alt: img.alt || '' }))
      .filter((i) => i.src && !i.src.startsWith('data:')),
    jsonld: [...document.querySelectorAll('script[type="application/ld+json"]')].map((s) => s.textContent || ''),
  };
}

// Links que levam a outra página do mesmo site (sem arquivo, sem âncora, sem contato).
export function linksDoMesmoSite(links, origem) {
  let base;
  try {
    base = new URL(origem);
  } catch {
    return [];
  }
  const saida = new Set();
  for (const href of links) {
    let u;
    try {
      u = new URL(href);
    } catch {
      continue;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') continue;
    if (semWww(u.hostname) !== semWww(base.hostname) || u.port !== base.port) continue;
    const baixo = u.pathname.toLowerCase();
    if (NAO_E_PAGINA.some((fim) => baixo.endsWith(fim))) continue;
    u.hostname = base.hostname; // com e sem www é a mesma página: visita uma vez só
    saida.add(semAncora(u.href));
  }
  return [...saida];
}

// WhatsApp, telefone e e-mail dos links da página.
export function contatosDosLinks(links) {
  const contatos = [];
  for (const href of links) {
    let u;
    try {
      u = new URL(href);
    } catch {
      continue;
    }
    if (u.protocol === 'tel:') contatos.push({ tipo: 'Telefone', valor: decodeURIComponent(u.pathname).trim() });
    else if (u.protocol === 'mailto:') contatos.push({ tipo: 'E-mail', valor: decodeURIComponent(u.pathname).trim() });
    else if (u.hostname === 'wa.me') contatos.push({ tipo: 'WhatsApp', valor: u.pathname.split('/').filter(Boolean)[0] || '' });
    else if (u.hostname === 'api.whatsapp.com' || u.hostname === 'web.whatsapp.com') contatos.push({ tipo: 'WhatsApp', valor: u.searchParams.get('phone') || '' });
  }
  const vistos = new Set();
  return contatos.filter((c) => c.valor && !vistos.has(`${c.tipo}|${c.valor}`) && vistos.add(`${c.tipo}|${c.valor}`));
}

const ultimoPedaco = (t) => String(t).split('/').filter(Boolean).pop() || '';

function enderecoPostal(a) {
  if (typeof a === 'string') return a.trim();
  if (!a || typeof a !== 'object') return '';
  return [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean).join(', ');
}

// O que o site declara de si em JSON-LD (schema.org): telefone, e-mail, endereço e horário.
export function fatosDoJsonLd(textos) {
  const fatos = [];
  for (const texto of textos) {
    const achados = acharObjetos(jsonOuNada(texto), (o) => ['telephone', 'email', 'address', 'openingHours', 'openingHoursSpecification'].some((k) => k in o), 10);
    for (const o of achados) {
      if (typeof o.telephone === 'string') fatos.push({ tipo: 'Telefone', valor: o.telephone.trim() });
      if (typeof o.email === 'string') fatos.push({ tipo: 'E-mail', valor: o.email.trim() });
      const endereco = enderecoPostal(o.address);
      if (endereco) fatos.push({ tipo: 'Endereço', valor: endereco });
      const horas = Array.isArray(o.openingHours) ? o.openingHours : o.openingHours ? [o.openingHours] : [];
      for (const h of horas) fatos.push({ tipo: 'Horário', valor: String(h).trim() });
      const especs = Array.isArray(o.openingHoursSpecification) ? o.openingHoursSpecification : o.openingHoursSpecification ? [o.openingHoursSpecification] : [];
      for (const e of especs) {
        const dias = (Array.isArray(e.dayOfWeek) ? e.dayOfWeek : [e.dayOfWeek]).filter(Boolean).map(ultimoPedaco).join(', ');
        if (dias && e.opens) fatos.push({ tipo: 'Horário', valor: `${dias}: ${e.opens} a ${e.closes || ''}`.trim() });
      }
    }
  }
  return fatos;
}

// Visita o site a partir do endereço dado. Devolve { inicio, paginas, contatos, declarados, fotos }, ou
// { desvio } (sem ler nada) quando a primeira página abre em outro endereço ou fora do site do negócio.
export async function lerSite(leitor, endereco, { maximo = TETO_DE_PAGINAS, pasta, aoAvancar = () => {} } = {}) {
  const fila0 = semAncora(new URL(endereco).href);
  const fila = [fila0];
  const vistas = new Set(fila);
  const paginas = [];
  let origem = fila[0];
  while (fila.length && paginas.length < maximo) {
    const url = fila.shift();
    aoAvancar(`Lendo a página ${paginas.length + 1} do site atual...`);
    try {
      await leitor.ir(url);
      await leitor.avaliar(rolarAteOFim);
      const lida = await leitor.avaliar(lerPaginaDoSite);
      if (!paginas.length && !abriuNoMesmoSite(fila0, lida.url)) return { inicio: fila0, desvio: lida.url };
      if (!paginas.length) origem = lida.url;
      paginas.push(lida);
      for (const l of linksDoMesmoSite(lida.links, origem)) {
        if (!vistas.has(l)) {
          vistas.add(l);
          fila.push(l);
        }
      }
    } catch {
      /* página que não abriu fica de fora; as outras seguem */
    }
  }
  if (!paginas.length) throw new Error('nenhuma página do site abriu');
  const contatos = paginas.flatMap((p) => contatosDosLinks(p.links).map((c) => ({ ...c, fonte: p.url })));
  const declarados = paginas.flatMap((p) => fatosDoJsonLd(p.jsonld).map((f) => ({ ...f, fonte: p.url })));
  const fotos = pasta ? await baixarFotos(paginas, path.join(pasta, 'fotos')) : [];
  return { inicio: origem, paginas, contatos, declarados, fotos };
}

async function baixarFotos(paginas, pasta) {
  const vistas = new Set();
  const fotos = [];
  for (const p of paginas) {
    for (const img of p.imagens) {
      if (fotos.length >= TETO_DE_FOTOS || vistas.has(img.src) || img.largura < LARGURA_MINIMA_DA_FOTO) continue;
      vistas.add(img.src);
      const nome = ultimoPedaco(new URL(img.src).pathname).toLowerCase();
      const ext = ['.png', '.webp', '.avif', '.gif'].find((e) => nome.endsWith(e)) || '.jpg';
      const arquivo = path.join(pasta, `foto-${String(fotos.length + 1).padStart(2, '0')}${ext}`);
      try {
        const r = await baixar(img.src, arquivo);
        fotos.push({ arquivo, origem: img.src, pagina: p.url, alt: img.alt, largura: r.largura, altura: r.altura });
      } catch {
        /* foto que não baixou fica só na lista da página */
      }
    }
  }
  return fotos;
}

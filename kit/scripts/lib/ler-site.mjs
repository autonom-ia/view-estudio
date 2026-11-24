// O site atual inteiro: visita as páginas do mesmo endereço (até um teto), guarda o texto de cada
// uma, os links de contato, as fotos e os dados que o próprio site declara em JSON-LD (endereço,
// telefone, horário). Lido pelo DOM do navegador e por JSON.parse; sem expressão regular.
// Contato e dado declarado que podem ser de outro (rodapé "site feito por", JSON-LD de outra
// empresa) não viram fato: voltam em "duvidosos", para a pessoa confirmar.
// Portado do Site Estúdio (lib/ler-site.mjs).
import path from 'node:path';
import { jsonOuNada, semAncora, antesDoPrazo, TempoEsgotado } from './leitor.mjs';
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
    rodape: [...document.querySelectorAll('footer a[href], [role="contentinfo"] a[href]')].map((a) => a.href),
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

// WhatsApp, telefone ou e-mail de um link; null se o link não é de contato.
function contatoDoLink(href) {
  let u;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  let c = null;
  try {
    if (u.protocol === 'tel:') c = { tipo: 'Telefone', valor: decodeURIComponent(u.pathname).trim() };
    else if (u.protocol === 'mailto:') c = { tipo: 'E-mail', valor: decodeURIComponent(u.pathname).trim() };
    else if (u.hostname === 'wa.me') c = { tipo: 'WhatsApp', valor: u.pathname.split('/').filter(Boolean)[0] || '' };
    else if (u.hostname === 'api.whatsapp.com' || u.hostname === 'web.whatsapp.com') c = { tipo: 'WhatsApp', valor: u.searchParams.get('phone') || '' };
  } catch {
    return null; // %XX quebrado no link
  }
  return c && c.valor ? c : null;
}

// WhatsApp, telefone e e-mail dos links da página, sem repetir.
export function contatosDosLinks(links) {
  const vistos = new Set();
  return links.map(contatoDoLink).filter((c) => c && !vistos.has(`${c.tipo}|${c.valor}`) && vistos.add(`${c.tipo}|${c.valor}`));
}

const ultimoPedaco = (t) => String(t).split('/').filter(Boolean).pop() || '';

function enderecoPostal(a) {
  if (typeof a === 'string') return a.trim();
  if (!a || typeof a !== 'object') return '';
  return [a.streetAddress, a.addressLocality, a.addressRegion, a.postalCode].filter(Boolean).join(', ');
}

// Tipos do schema.org que são o próprio negócio: Organization, LocalBusiness e os subtipos deles.
const TIPOS_DE_NEGOCIO = new Set([
  'Organization', 'LocalBusiness', 'Corporation', 'OnlineBusiness', 'OnlineStore', 'NGO', 'Cooperative', 'EducationalOrganization', 'School',
  'CollegeOrUniversity', 'Preschool', 'MedicalOrganization', 'MedicalBusiness', 'MedicalClinic', 'Hospital', 'Pharmacy', 'Physician', 'Dentist',
  'VeterinaryCare', 'DiagnosticLab', 'Optician', 'Physiotherapy', 'SportsOrganization', 'SportsTeam', 'PerformingGroup', 'MusicGroup',
  'NewsMediaOrganization', 'AnimalShelter', 'ChildCare', 'DryCleaningOrLaundry', 'EmploymentAgency', 'EntertainmentBusiness', 'ArtGallery',
  'MovieTheater', 'NightClub', 'AmusementPark', 'FinancialService', 'AccountingService', 'BankOrCreditUnion', 'InsuranceAgency',
  'FoodEstablishment', 'Bakery', 'BarOrPub', 'Brewery', 'CafeOrCoffeeShop', 'Distillery', 'FastFoodRestaurant', 'IceCreamShop', 'Restaurant',
  'Winery', 'HealthAndBeautyBusiness', 'BeautySalon', 'DaySpa', 'HairSalon', 'HealthClub', 'NailSalon', 'TattooParlor',
  'HomeAndConstructionBusiness', 'Electrician', 'GeneralContractor', 'HVACBusiness', 'HousePainter', 'Locksmith', 'MovingCompany', 'Plumber',
  'RoofingContractor', 'InternetCafe', 'LegalService', 'Attorney', 'Notary', 'LodgingBusiness', 'BedAndBreakfast', 'Campground', 'Hostel',
  'Hotel', 'Motel', 'Resort', 'VacationRental', 'ProfessionalService', 'RealEstateAgent', 'RecyclingCenter', 'SelfStorage', 'ShoppingCenter',
  'SportsActivityLocation', 'ExerciseGym', 'SportsClub', 'Store', 'TravelAgency', 'AutomotiveBusiness', 'AutoRepair', 'AutoDealer', 'GasStation',
]);
// Tipo próprio ou de outra versão do schema.org (BicycleStore, PetShop...): vale pelo fim do nome.
const FINS_DE_NEGOCIO = Object.freeze(['Store', 'Shop', 'Business', 'Organization', 'Restaurant', 'Agency', 'Salon', 'Clinic', 'Service']);

export function ehTipoDeNegocio(tipo) {
  const t = ultimoPedaco(String(tipo || '')).split(':').pop();
  return TIPOS_DE_NEGOCIO.has(t) || FINS_DE_NEGOCIO.some((fim) => t.endsWith(fim) && t !== fim);
}

// Nome para comparar: minúsculo, sem acento, só letra e número, um espaço entre palavras.
export function nomeComparavel(texto) {
  let t = '';
  for (const ch of String(texto || '').normalize('NFD').toLowerCase()) {
    const c = ch.codePointAt(0);
    if (c >= 0x300 && c <= 0x36f) continue;
    t += (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') ? ch : ' ';
  }
  return t.split(' ').filter(Boolean).join(' ');
}

const LETRAS_MINIMAS_DO_NOME = 3;
// O nome declarado está DENTRO da referência, por palavra inteira ("Casa Exemplo" em "Casa Exemplo
// Bicicletas"). Nunca o contrário: "Casa Agência Digital" contém "Casa" e é de outro.
const nomeDentro = (nome, referencia) => nome.length >= LETRAS_MINIMAS_DO_NOME && ` ${referencia} `.includes(` ${nome} `);

// O dado em JSON-LD é do próprio negócio? Tipo de negócio, e o endereço (url ou @id) é do site
// ou o nome bate com o do negócio (título da página inicial, nome no Google, nome dado).
// ref: { host, nomes }.
export function ehDoNegocio(o, ref) {
  const tipos = (Array.isArray(o['@type']) ? o['@type'] : [o['@type']]).filter((t) => typeof t === 'string');
  if (!tipos.some(ehTipoDeNegocio)) return false;
  for (const chave of ['url', '@id']) {
    let u;
    try {
      u = new URL(String(o[chave]));
    } catch {
      continue;
    }
    if (u.protocol === 'http:' || u.protocol === 'https:') return semWww(u.hostname) === semWww(ref.host);
  }
  const nome = nomeComparavel(o.name);
  const colar = (t) => t.split(' ').join('');
  const hostColado = semWww(ref.host).split('.')[0].split('-').join('');
  const doNome = ref.nomes.map(nomeComparavel).some((n) => nomeDentro(nome, n) || nomeDentro(colar(nome), colar(n)));
  return doNome || (colar(nome).length >= LETRAS_MINIMAS_DO_NOME && hostColado === colar(nome));
}

const CHAVES_DE_CONTATO = Object.freeze(['telephone', 'email', 'address', 'openingHours', 'openingHoursSpecification', 'contactPoint']);
const TETO_DE_ENTIDADES = 30;
const comoLista = (v) => (Array.isArray(v) ? v : v ? [v] : []);

// Cada objeto do JSON-LD que traz contato, sem descer dentro dele (endereço e contactPoint são dele).
export function entidadesComContato(valor) {
  const achadas = [];
  const pilha = [valor];
  const vistos = new Set();
  while (pilha.length && achadas.length < TETO_DE_ENTIDADES) {
    const v = pilha.pop();
    if (!v || typeof v !== 'object' || vistos.has(v)) continue;
    vistos.add(v);
    if (!Array.isArray(v) && CHAVES_DE_CONTATO.some((k) => k in v)) {
      achadas.push(v);
      continue;
    }
    const filhos = Array.isArray(v) ? v : Object.values(v);
    for (let i = filhos.length - 1; i >= 0; i -= 1) pilha.push(filhos[i]);
  }
  return achadas;
}

function fatosDaEntidade(o) {
  const fatos = [];
  for (const ponto of [o, ...comoLista(o.contactPoint)]) {
    if (!ponto || typeof ponto !== 'object') continue;
    if (typeof ponto.telephone === 'string' && ponto.telephone.trim()) fatos.push({ tipo: 'Telefone', valor: ponto.telephone.trim() });
    if (typeof ponto.email === 'string' && ponto.email.trim()) fatos.push({ tipo: 'E-mail', valor: ponto.email.trim() });
  }
  const endereco = enderecoPostal(o.address);
  if (endereco) fatos.push({ tipo: 'Endereço', valor: endereco });
  for (const h of comoLista(o.openingHours)) fatos.push({ tipo: 'Horário', valor: String(h).trim() });
  for (const e of comoLista(o.openingHoursSpecification)) {
    if (!e || typeof e !== 'object') continue;
    const dias = comoLista(e.dayOfWeek).map(ultimoPedaco).join(', ');
    if (dias && e.opens) fatos.push({ tipo: 'Horário', valor: `${dias}: ${e.opens} a ${e.closes || ''}`.trim() });
  }
  return fatos;
}

// O que o site declara de si em JSON-LD (schema.org): telefone, e-mail, endereço e horário.
// { fatos } são do próprio negócio (ehDoNegocio); { outros } trazem de quem parecem ser.
export function fatosDoJsonLd(textos, ref) {
  const fatos = [];
  const outros = [];
  for (const texto of textos) {
    for (const o of entidadesComContato(jsonOuNada(texto))) {
      const lista = fatosDaEntidade(o);
      if (ehDoNegocio(o, ref)) fatos.push(...lista);
      else outros.push(...lista.map((f) => ({ ...f, de: typeof o.name === 'string' ? o.name : String(o['@type'] || '') })));
    }
  }
  return { fatos, outros };
}

const soDigitos = (t) => Array.from(String(t)).filter((ch) => ch >= '0' && ch <= '9').join('');
const DIGITOS_MINIMOS_DO_TELEFONE = 8;

// Mesmo contato? E-mail igual sem diferença de maiúscula; telefone e WhatsApp pelos números
// (com ou sem o código do país e da cidade na frente).
export function mesmoContato(a, b) {
  const email = (c) => c.tipo === 'E-mail';
  if (email(a) || email(b)) return email(a) && email(b) && a.valor.trim().toLowerCase() === b.valor.trim().toLowerCase();
  const x = soDigitos(a.valor);
  const y = soDigitos(b.valor);
  if (Math.min(x.length, y.length) < DIGITOS_MINIMOS_DO_TELEFONE) return x === y && x.length > 0;
  return x.endsWith(y) || y.endsWith(x);
}

const vezesNosLinks = (links, c) => links.map(contatoDoLink).filter((x) => x && mesmoContato(x, c)).length;
const ehContato = (f) => f.tipo === 'Telefone' || f.tipo === 'E-mail' || f.tipo === 'WhatsApp';

// Contato que pode ser de quem fez o site ("site feito por", com o WhatsApp da agência):
// - com 2 páginas ou mais, o que aparece em TODAS as páginas lidas (rodapé, cabeçalho);
// - com 1 página só (não dá para comparar), o que aparece SÓ no rodapé dela.
// Só com referência própria do negócio (telefone do perfil do Google ou contato do JSON-LD dele) um
// contato desses que DIFERE da referência vai para "duvidosos" (fora dos fatos). Sem referência,
// não há com o que comparar: o contato fica como fato e entra em "aConferir" (aviso leve).
export function separarContatos(paginas, principais) {
  const referencia = principais.filter(ehContato);
  const porPagina = paginas.map((p) => contatosDosLinks(p.links));
  const emTodas = (c) => porPagina.every((lista) => lista.some((x) => mesmoContato(x, c)));
  const soNoRodape = (c, p) => vezesNosLinks(p.links, c) <= vezesNosLinks(p.rodape || [], c);
  const repetido = (c, p) => (paginas.length >= 2 ? emTodas(c) : soNoRodape(c, p));
  const motivo = paginas.length >= 2 ? 'em-todas-as-paginas' : 'so-no-rodape';
  const contatos = [];
  const duvidosos = [];
  const aConferir = [];
  const anotar = (lista, c, p) => {
    if (!lista.some((d) => mesmoContato(d, c))) lista.push({ ...c, fonte: p.url, motivo });
  };
  paginas.forEach((p, i) => {
    for (const c of porPagina[i]) {
      const suspeito = repetido(c, p) && !referencia.some((x) => mesmoContato(x, c));
      if (suspeito && referencia.length) {
        anotar(duvidosos, c, p);
        continue;
      }
      contatos.push({ ...c, fonte: p.url });
      if (suspeito) anotar(aConferir, c, p);
    }
  });
  return { contatos, duvidosos, aConferir };
}

// Roda a leitura de uma página: abre, rola e lê.
async function lerUmaPagina(leitor, url) {
  await leitor.ir(url);
  await leitor.avaliar(rolarAteOFim);
  return leitor.avaliar(lerPaginaDoSite);
}

const SEM_PRAZO = Number.POSITIVE_INFINITY;

// Visita o site a partir do endereço dado. Devolve { inicio, paginas, contatos, declarados,
// duvidosos, aConferir, foraDoSite, fotos, esgotou }, ou { desvio } (sem ler nada) quando a primeira página
// abre em outro endereço ou fora do site do negócio. Página seguinte que abre fora do site fica de
// fora (foraDoSite). prazo: hora (Date.now) em que a leitura para e devolve o que já leu.
// referencia: { nomes, telefones } do negócio, para separar o contato dele do contato de outro.
// permitirEnderecoLocal: só os testes (que servem páginas em 127.0.0.1) ligam.
export async function lerSite(leitor, endereco, opcoes = {}) {
  const { maximo = TETO_DE_PAGINAS, pasta, aoAvancar = () => {}, prazo = SEM_PRAZO, referencia = {}, permitirEnderecoLocal = false, baixarFoto = baixar } = opcoes;
  const fila0 = semAncora(new URL(endereco).href);
  const fila = [fila0];
  const vistas = new Set(fila);
  const paginas = [];
  const foraDoSite = [];
  let origem = fila[0];
  let esgotou = false;
  while (fila.length && paginas.length < maximo) {
    if (Date.now() >= prazo) {
      esgotou = true;
      break;
    }
    const url = fila.shift();
    aoAvancar(`Lendo a página ${paginas.length + 1} do site atual...`);
    let lida;
    try {
      lida = await antesDoPrazo(lerUmaPagina(leitor, url), prazo);
    } catch (e) {
      if (e instanceof TempoEsgotado) {
        esgotou = true;
        break;
      }
      continue; // página que não abriu fica de fora; as outras seguem
    }
    if (!paginas.length && !abriuNoMesmoSite(fila0, lida.url)) return { inicio: fila0, desvio: lida.url };
    if (paginas.length && !abriuNoMesmoSite(origem, lida.url)) {
      foraDoSite.push({ pedida: url, abriu: lida.url });
      continue;
    }
    if (!paginas.length) origem = lida.url;
    paginas.push(lida);
    for (const l of linksDoMesmoSite(lida.links, origem)) {
      if (!vistas.has(l)) {
        vistas.add(l);
        fila.push(l);
      }
    }
  }
  if (!paginas.length && !esgotou) throw new Error('nenhuma página do site abriu');
  if (!paginas.length) return { inicio: origem, paginas, contatos: [], declarados: [], duvidosos: [], aConferir: [], foraDoSite, fotos: [], esgotou };
  const ref = { host: paginas.length ? new URL(origem).hostname : '', nomes: [...(referencia.nomes || []), paginas[0]?.titulo || ''].filter(Boolean) };
  const doJsonLd = paginas.map((p) => ({ p, ...fatosDoJsonLd(p.jsonld, ref) }));
  const declarados = doJsonLd.flatMap(({ p, fatos }) => fatos.map((f) => ({ ...f, fonte: p.url })));
  const principais = [...declarados, ...(referencia.telefones || []).map((t) => ({ tipo: 'Telefone', valor: t }))];
  const separados = separarContatos(paginas, principais);
  const outrosDoJsonLd = doJsonLd.flatMap(({ p, outros }) => outros.map((f) => ({ ...f, fonte: p.url, motivo: 'dados-de-outro' })));
  const fotos = pasta && !esgotou ? await baixarFotos(paginas, path.join(pasta, 'fotos'), { prazo, permitirEnderecoLocal, baixarFoto }) : { lista: [], esgotou: false };
  return {
    inicio: origem,
    paginas,
    contatos: separados.contatos,
    declarados,
    duvidosos: [...separados.duvidosos, ...outrosDoJsonLd],
    aConferir: separados.aConferir,
    foraDoSite,
    fotos: fotos.lista,
    esgotou: esgotou || fotos.esgotou,
  };
}

const TETO_DA_FOTO_MS = 30000;

// baixarFoto: o baixar de verdade; os testes trocam por um lento. Cada foto respeita o prazo.
async function baixarFotos(paginas, pasta, { prazo, permitirEnderecoLocal, baixarFoto }) {
  const vistas = new Set();
  const lista = [];
  for (const p of paginas) {
    for (const img of p.imagens) {
      if (lista.length >= TETO_DE_FOTOS || vistas.has(img.src) || img.largura < LARGURA_MINIMA_DA_FOTO) continue;
      const resta = prazo - Date.now();
      if (resta <= 0) return { lista, esgotou: true };
      vistas.add(img.src);
      let nome;
      try {
        nome = ultimoPedaco(new URL(img.src).pathname).toLowerCase();
      } catch {
        continue;
      }
      const ext = ['.png', '.webp', '.avif', '.gif'].find((e) => nome.endsWith(e)) || '.jpg';
      const arquivo = path.join(pasta, `foto-${String(lista.length + 1).padStart(2, '0')}${ext}`);
      try {
        const r = await antesDoPrazo(baixarFoto(img.src, arquivo, { tetoMs: Math.min(TETO_DA_FOTO_MS, resta), prazo, permitirEnderecoLocal }), prazo);
        lista.push({ arquivo, origem: img.src, pagina: p.url, alt: img.alt, largura: r.largura, altura: r.altura });
      } catch (e) {
        if (e instanceof TempoEsgotado) return { lista, esgotou: true };
        /* foto que não baixou (ou de endereço interno) fica só na lista da página */
      }
    }
  }
  return { lista, esgotou: false };
}

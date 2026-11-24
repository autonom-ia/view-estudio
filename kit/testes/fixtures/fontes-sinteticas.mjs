// Páginas públicas SINTÉTICAS para testar a leitura sem internet: o perfil do Google (lista com dois
// resultados, painel do lugar, avaliações com nome de autor que NÃO pode ser lido) e um site de duas
// páginas com JSON-LD e, nas duas, o rodapé da agência que fez o site (contato e JSON-LD de
// TERCEIRO, que não podem virar fato). Negócio, nomes, endereço e telefone são inventados.
// Portado do Site Estúdio (kit/testes/fixtures/fontes-sinteticas.mjs), sem o Instagram.
import http from 'node:http';
import zlib from 'node:zlib';

export const NEGOCIO = 'Casa Exemplo';
export const AUTORES = Object.freeze(['Pessoa Inventada Um', 'Pessoa Inventada Dois']);
// O rodapé "site feito por" em toda página: WhatsApp da agência e o JSON-LD dela.
export const AGENCIA = Object.freeze({ nome: 'Agência Inventada', whatsapp: '5599999990000', telefone: '(99) 9999-0000' });
const MAIS_TEXTO = ' e o atendimento foi ótimo.';

const pagina = (cabeca, corpo) => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">${cabeca}</head><body>${corpo}</body></html>`;

// CRC-32 do PNG (polinômio 0xEDB88320), sem tabela pronta.
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

// PNG de verdade (o navegador desenha e mede), cinza, largura x altura.
function png(largura, altura) {
  const pedaco = (tipo, dados) => {
    const t = Buffer.from(tipo, 'ascii');
    const tam = Buffer.alloc(4);
    tam.writeUInt32BE(dados.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
    return Buffer.concat([tam, t, dados, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largura, 0);
  ihdr.writeUInt32BE(altura, 4);
  ihdr.set([8, 0, 0, 0, 0], 8);
  const linhas = Buffer.alloc((largura + 1) * altura, 128);
  for (let y = 0; y < altura; y += 1) linhas[y * (largura + 1)] = 0;
  const assinatura = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([assinatura, pedaco('IHDR', ihdr), pedaco('IDAT', zlib.deflateSync(linhas)), pedaco('IEND', Buffer.alloc(0))]);
}

function listaDoGoogle() {
  const a = (slug, nome) => `<a href="/maps/place/${slug}/data=1" aria-label="${nome}">${nome}</a>`;
  return pagina('<title>Google Maps</title>', `${a('Casa+Exemplo', NEGOCIO)}${a('Casa+Exemplo+Filial', `${NEGOCIO} Filial`)}<div>Trecho de busca: aberto 24 horas</div>`);
}

function lugarDoGoogle(origem) {
  const dia = (d, h) => `<tr><td>${d}</td><td>${h}</td></tr>`;
  const avaliacao = (id, autor, estrelas, texto, quando) =>
    `<div data-review-id="${id}"><div data-review-id="${id}"><div class="d4r55">${autor}</div><span role="img" aria-label="${estrelas} estrelas"></span><span class="rsqaWe">${quando}</span><span class="wiI7pd">${texto}</span><button class="w8nwRe" onclick="const t = this.previousElementSibling; t.textContent = t.textContent.endsWith('${MAIS_TEXTO}') ? t.textContent.slice(0, -${MAIS_TEXTO.length}) : t.textContent + '${MAIS_TEXTO}'">Mais</button></div></div>`;
  const avaliacoes = `<div id="avaliacoes" hidden>${avaliacao('r1', AUTORES[0], 5, 'Revisão rápida perfeito', 'há 2 semanas')}${avaliacao('r2', AUTORES[1], 4, 'Entrega no horário', 'há 1 mês')}</div>`;
  const aba = '<button role="tab" aria-label="Avaliações de Casa Exemplo" onclick="document.getElementById(\'avaliacoes\').hidden = false">Avaliações</button>';
  const corpo = `<div role="main" aria-label="${NEGOCIO}"><h1>${NEGOCIO}</h1>
    <button data-item-id="address" aria-label="Endereço: Rua Inventada, 100 - Bairro Exemplo, Cidade Exemplo - UF ">x</button>
    <button data-item-id="phone:tel:00000001234" aria-label="Telefone: (00) 0000-1234 ">x</button>
    <a data-item-id="authority" href="${origem}/site/">site</a>
    <table>${dia('segunda-feira', 'Fechado')}${dia('terça-feira', '<div>07:00–12:00</div><div>14:00–19:00</div>')}${dia('quarta-feira', '07:00–19:00')}${dia('sábado', '08:00–13:00')}</table>
    <div class="F7nice"><span>4,8</span><br><span>(37)</span></div>${aba}${avaliacoes}</div>`;
  return pagina('<title>Casa Exemplo - Google Maps</title>', corpo);
}

function rodapeDaAgencia() {
  return `<footer>Site feito por ${AGENCIA.nome} · <a href="https://wa.me/${AGENCIA.whatsapp}">fale com a agência</a></footer>`;
}

function site(rel, origem) {
  const ldAgencia = { '@context': 'https://schema.org', '@type': 'Organization', name: AGENCIA.nome, telephone: AGENCIA.telefone };
  const ld = { '@context': 'https://schema.org', '@type': 'BicycleStore', name: NEGOCIO, telephone: '(00) 0000-1234', address: { '@type': 'PostalAddress', streetAddress: 'Rua Inventada, 100', addressLocality: 'Cidade Exemplo' }, openingHoursSpecification: [{ dayOfWeek: ['https://schema.org/Wednesday'], opens: '07:00', closes: '19:00' }] };
  if (rel === '/site/contato/') return pagina('<title>Contato</title>', `<h1>Contato</h1><p>Fale com a gente.</p><a href="mailto:ola@casa.example">ola@casa.example</a><a href="/site/">início</a>${rodapeDaAgencia()}`);
  return pagina(
    `<title>Casa Exemplo</title><meta name="description" content="Bicicletas"><script type="application/ld+json">${JSON.stringify(ld)}</script><script type="application/ld+json">${JSON.stringify(ldAgencia)}</script>`,
    `<h1>Bicicletas da casa</h1><img src="${origem}/img/site-foto.png" alt="vitrine" width="320"><img src="${origem}/img/pequena.png" alt="ícone" width="40"><a href="/site/contato/">Contato</a><a href="/site/tabela-de-precos.pdf">Tabela de preços</a><a href="https://example.com/fora">fora</a><a href="tel:+5500000001234">Ligue</a><a href="#topo">topo</a>${rodapeDaAgencia()}`,
  );
}

function responder(req, origem) {
  const rel = decodeURIComponent(new URL(req.url, origem).pathname);
  if (rel.startsWith('/maps/search/')) return { tipo: 'text/html', corpo: listaDoGoogle() };
  if (rel === '/maps/place/Casa+Exemplo/data=1') return { tipo: 'text/html', corpo: lugarDoGoogle(origem) };
  if (rel === '/site/' || rel === '/site/contato/') return { tipo: 'text/html', corpo: site(rel, origem) };
  if (rel === '/img/site-foto.png') return { tipo: 'image/png', corpo: png(700, 4) };
  if (rel === '/img/pequena.png') return { tipo: 'image/png', corpo: png(40, 4) };
  return null;
}

// Sobe o servidor numa porta livre. pedidos: tudo o que foi pedido (para conferir o que não foi).
export function servirFontes() {
  const pedidos = [];
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const origem = `http://${req.headers.host}`;
      pedidos.push(req.url);
      const r = responder(req, origem);
      if (!r) return res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404');
      return res.writeHead(200, { 'Content-Type': `${r.tipo}${r.tipo.startsWith('text') ? '; charset=utf-8' : ''}` }).end(r.corpo);
    });
    srv.listen(0, '127.0.0.1', () => {
      const origem = `http://127.0.0.1:${srv.address().port}`;
      resolve({ origem, pedidos, fechar: () => new Promise((r) => srv.close(() => r())) });
    });
  });
}

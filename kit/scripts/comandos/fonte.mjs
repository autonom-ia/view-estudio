// "./estudio fonte <Família> [--pesos 400..800] [--italico] [--larguras] [--alfabetos latin]
//  [--apresentacao <nome>]": baixa uma letra livre do catálogo do Google Fonts já leve (.woff2, só o
// alfabeto pedido; latin cobre o português) para minha-marca/fontes/ (ou para a marca de uma
// apresentação, deck/assets/marca/fontes/), com a licença guardada com o nome da família
// (OFL-<Família>.txt). Devolve em dados.css as linhas @font-face para o topo de tokens.css (o
// tokens.css mora ao lado de fontes/ nos dois lugares). Tudo ou nada: se algo falha, nada é escrito.
// Portado do Site Estúdio (kit/scripts/comandos/fonte.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { pastaMarca, relativoARaiz, ehPasta, nomeValido } from '../lib/caminhos.mjs';
import { caminhosDe } from '../lib/apresentacao.mjs';
import { falha } from '../lib/saida.mjs';
import { conferirLetras } from '../lib/letras.mjs';
import {
  RAW, CSS2, LICENCAS, AGENTE_MODERNO, familiaValida, slugDaFamilia, nomeProprio, lerMetadados, lerPesos,
  pedidoDoCss2, blocosDoCss, enderecoPermitido, arquivoDoBloco, arquivoDaLicenca, cssDasFontes,
} from '../lib/fontes-google.mjs';

const PRAZO_MS = 30000;
const MAXIMO = Object.freeze({ texto: 512 * 1024, fonte: 3 * 1024 * 1024 });

// Um pedido à internet, só aos hosts do catálogo. 404 vira null quando "talvez" é true.
async function pegar(buscar, url, { binario = false, talvez = false } = {}) {
  if (!enderecoPermitido(url)) falha('FONTE_DOWNLOAD_FALHOU', { endereco: url, detalhe: 'endereço fora do catálogo de fontes' });
  let resposta;
  try {
    resposta = await buscar(url, { headers: { 'user-agent': AGENTE_MODERNO }, redirect: 'error', signal: AbortSignal.timeout(PRAZO_MS) });
  } catch (e) {
    falha('FONTE_DOWNLOAD_FALHOU', { endereco: url, detalhe: String((e && e.message) || e) });
  }
  if (talvez && resposta.status === 404) return null;
  if (!resposta.ok) falha('FONTE_DOWNLOAD_FALHOU', { endereco: url, detalhe: `HTTP ${resposta.status}` });
  const dados = Buffer.from(await resposta.arrayBuffer());
  if (dados.length > (binario ? MAXIMO.fonte : MAXIMO.texto)) falha('FONTE_DOWNLOAD_FALHOU', { endereco: url, detalhe: 'arquivo grande demais' });
  return binario ? dados : dados.toString('utf8');
}

async function acharNoCatalogo(buscar, slug) {
  for (const l of LICENCAS) {
    const texto = await pegar(buscar, `${RAW}/${l.pasta}/${slug}/METADATA.pb`, { talvez: true });
    if (texto !== null) return { meta: lerMetadados(texto), licenca: l };
  }
  return null;
}

// O trabalho todo, com a rede entregue por quem chama (os testes passam um fetch de mentira).
export async function baixarFonte({ familia, pesos = null, italico = false, larguras = false, alfabetos = ['latin'], pasta, buscar = fetch }) {
  const slug = slugDaFamilia(familia);
  const achado = await acharNoCatalogo(buscar, slug);
  if (!achado || !achado.meta.nome) falha('FONTE_NAO_ACHADA', { familia });
  const { meta, licenca } = achado;
  const textoDaLicenca = await pegar(buscar, `${RAW}/${licenca.pasta}/${slug}/${licenca.arquivo}`, { talvez: true });
  if (!textoDaLicenca || !textoDaLicenca.trim()) falha('FONTE_SEM_LICENCA', { familia: meta.nome });
  const pedido = pedidoDoCss2(meta, { pesos, italico, larguras });
  if (!pedido) falha('FONTE_NAO_ACHADA', { familia: meta.nome, pesos: pesos ? `${pesos.min}..${pesos.max}` : '' });
  const blocos = blocosDoCss(await pegar(buscar, `${CSS2}?${pedido}`)).filter((b) => alfabetos.includes(b.alfabeto));
  if (!blocos.length || blocos.some((b) => b.formato !== 'woff2')) falha('FONTE_NAO_ACHADA', { familia: meta.nome, alfabetos: alfabetos.join(',') });
  const proprio = nomeProprio(meta.nome);
  const itens = [];
  for (const bloco of blocos) {
    const arquivo = arquivoDoBloco(proprio, bloco);
    // dois @font-face no mesmo arquivo: um apagaria o outro. Melhor parar do que entregar meia letra.
    if (itens.some((i) => i.arquivo === arquivo)) falha('FONTE_NAO_ACHADA', { familia: meta.nome, detalhe: `dois estilos no mesmo arquivo ${arquivo}` });
    itens.push({ arquivo, bloco, dados: await pegar(buscar, bloco.url, { binario: true }) });
  }
  // só agora escreve: com tudo baixado, nada fica pela metade
  fs.mkdirSync(pasta, { recursive: true });
  for (const i of itens) fs.writeFileSync(path.join(pasta, i.arquivo), i.dados);
  const nomeDaLicenca = arquivoDaLicenca(proprio, licenca.pasta);
  fs.writeFileSync(path.join(pasta, nomeDaLicenca), textoDaLicenca);
  const bytes = itens.reduce((s, i) => s + i.dados.length, 0);
  return {
    familia: meta.nome,
    licenca: nomeDaLicenca,
    arquivos: itens.map((i) => i.arquivo),
    kb: Math.round(bytes / 102.4) / 10,
    css: cssDasFontes(meta.nome, itens),
  };
}

function destino(opcoes) {
  if (opcoes.apresentacao === undefined) return path.join(pastaMarca(), 'fontes');
  if (opcoes.apresentacao === true) falha('ARGUMENTO_FALTANDO', { argumento: '--apresentacao <nome>' });
  const nome = String(opcoes.apresentacao);
  if (!nomeValido(nome)) falha('ARGUMENTO_INVALIDO', { argumento: '--apresentacao', valor: nome });
  const c = caminhosDe(nome);
  if (!ehPasta(c.deck)) falha('APRESENTACAO_NAO_ACHADA', { nome, pasta: relativoARaiz(c.pasta) });
  return path.join(c.assets, 'marca', 'fontes');
}

export default async function fonte({ posicionais, opcoes }) {
  const familia = posicionais.join(' ').trim() || (typeof opcoes.familia === 'string' ? opcoes.familia.trim() : '');
  if (!familia) falha('ARGUMENTO_FALTANDO', { argumento: '<família>' });
  if (!familiaValida(familia)) falha('ARGUMENTO_INVALIDO', { argumento: '<família>', valor: familia });
  const pesos = lerPesos(opcoes.pesos);
  if (opcoes.pesos !== undefined && !pesos) falha('ARGUMENTO_INVALIDO', { argumento: '--pesos', valor: String(opcoes.pesos) });
  const alfabetos = typeof opcoes.alfabetos === 'string' ? opcoes.alfabetos.split(',').map((a) => a.trim()).filter(Boolean) : ['latin'];
  const pasta = destino(opcoes);
  const r = await baixarFonte({ familia, pesos, italico: opcoes.italico === true, larguras: opcoes.larguras === true, alfabetos, pasta });
  const total = conferirLetras(pasta);
  return {
    ok: true,
    codigo: 'FONTE_BAIXADA',
    arquivos: { pasta: relativoARaiz(pasta), licenca: relativoARaiz(path.join(pasta, r.licenca)) },
    dados: { familia: r.familia, licenca: r.licenca, arquivos: r.arquivos, kb: r.kb, css: r.css, letras_kb_na_pasta: total.kb, sem_licenca: total.semLicenca },
  };
}

// Põe a apresentação no ar em <nome>.sites.autonomia.site, só com a confirmação da pessoa e só para
// quem tem acesso liberado em sites.autonomia.site (o mesmo painel e a mesma conta dos sites).
//   ./estudio publicar <nome>                 confere, monta o pacote (lib/pacote.mjs), envia em partes e
//                                              espera o endereço responder com cadeado (PUBLICADO ou
//                                              PUBLICADO_CERTIFICADO_PENDENTE).
//   ./estudio publicar <nome> --no-ar <outro> publica com outro nome de endereço (o do painel é de outra
//                                              pessoa, ou o da apresentação não serve). Fica anotado em
//                                              no-ar.json e vale para as próximas vezes.
//   ./estudio publicar <nome> --por-cima      publica num endereço que já tem outra coisa da pessoa no
//                                              ar (um site, outra apresentação), só com o sim dela.
//   ./estudio publicar <nome> --voltar [n]    põe no ar a versão n (sem n: a anterior).
//   ./estudio publicar --sair                 esquece a chave e o pedido de acesso deste computador.
// Vermelho não vai para o ar: sem o "checar", o "fatos" e o "acessibilidade" aprovados para a
// apresentação como ela está agora (lib/conferencias.mjs), reprova com PUBLICAR_CONFERIR_ANTES antes de
// falar com o serviço. Também reprova antes de enviar o que o painel recusaria de qualquer jeito: arquivo
// de tipo que ele não aceita e pacote acima do teto.
// Nada some por engano: o painel aceita uma versão nova em qualquer endereço da pessoa, então, se o
// endereço já tem coisa dela no ar e esta apresentação nunca foi publicada nele (no-ar.json), reprova
// com PUBLICAR_ENDERECO_JA_EM_USO até ela dizer --por-cima ou escolher --no-ar. O endereço é anotado
// em no-ar.json antes do envio: se o processo cair no meio, a próxima vez já sabe que é desta
// apresentação. Recusa do painel antes de publicar desfaz a anotação.
// Login, chave recusada, --voltar e --sair seguem o Site Estúdio, do qual este comando foi portado.
import fs from 'node:fs';
import path from 'node:path';
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao } from '../lib/apresentacao.mjs';
import { nomeValido, sugerirNome } from '../lib/caminhos.mjs';
import { montarPacote } from '../lib/pacote.mjs';
import { conferenciasQueFaltam } from '../lib/conferencias.mjs';
import { escreverJson } from '../lib/json.mjs';
import { aviso, falha, reprovado, KitErro } from '../lib/saida.mjs';
import { configuracao } from '../lib/publicar-servico.mjs';
import { entrar } from '../lib/publicar-login.mjs';
import { enviarPacote, voltarVersao, esperarSiteNoAr, enderecoNaConta } from '../lib/publicar-envio.mjs';
import { apagar, arquivoChave, esquecerTudo, lerChave } from '../lib/publicar-guarda.mjs';

// Teto do painel (SITES_LIMITE_MB): vale para o pacote enviado e para o conteúdo aberto.
export const TETO_MB = 200;
const MB = 1024 * 1024;
// Tipos de arquivo que o painel aceita (framework/sites/painel/publicacao/pacote-regras.mjs).
export const TIPOS_ACEITOS = Object.freeze([
  'html', 'htm', 'css', 'js', 'mjs', 'json', 'txt', 'xml', 'csv', 'svg',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico',
  'woff', 'woff2', 'ttf', 'otf',
  'mp4', 'webm', 'mp3', 'ogg', 'wav',
  'pdf', 'webmanifest', 'map',
]);

export const tipoAceito = (rel) => {
  const baixo = rel.split('/').pop().toLowerCase();
  return TIPOS_ACEITOS.some((ext) => baixo.endsWith(`.${ext}`));
};

const arquivoNoAr = (c) => path.join(c.pasta, 'no-ar.json');

function lerNoAr(c) {
  try {
    const v = JSON.parse(fs.readFileSync(arquivoNoAr(c), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

// Nome do endereço: --no-ar, senão o já anotado em no-ar.json, senão o da apresentação.
function nomeNoAr(c, opcoes) {
  const pedido = opcoes['no-ar'];
  if (pedido !== undefined) {
    if (pedido === true) falha('ARGUMENTO_FALTANDO', { argumento: '--no-ar <nome>' });
    if (!nomeValido(pedido)) falha('NOME_INVALIDO', { valor: pedido, sugestao: sugerirNome(pedido) });
    return pedido;
  }
  const anotado = lerNoAr(c).nome;
  return typeof anotado === 'string' && nomeValido(anotado) ? anotado : c.nome;
}

// "--voltar 3", "--voltar" sozinho, e "--voltar minha-aula" (o nome logo depois da opção).
function lerVoltar({ posicionais, opcoes }) {
  const valor = opcoes.voltar;
  if (valor === undefined) return { voltar: false, args: { posicionais, opcoes } };
  if (valor === true) return { voltar: true, versao: undefined, args: { posicionais, opcoes } };
  const n = Number(valor);
  if (Number.isInteger(n) && n > 0 && String(n) === valor) return { voltar: true, versao: n, args: { posicionais, opcoes } };
  if (!posicionais.length) return { voltar: true, versao: undefined, args: { posicionais: [valor], opcoes } };
  return falha('ARGUMENTO_INVALIDO', { argumento: '--voltar', valor });
}

// Roda "fazer" com a chave guardada; sem chave, ou com a chave recusada, passa pelo login.
async function comAcesso(cfg, fazer) {
  const guardada = lerChave(cfg.base);
  let recusada = false;
  if (guardada) {
    try {
      return await fazer(guardada);
    } catch (erro) {
      if (!(erro instanceof KitErro) || erro.codigo !== 'PUBLICAR_CHAVE_RECUSADA') throw erro;
      apagar(arquivoChave());
      recusada = true;
    }
  }
  const e = await entrar(cfg);
  if (e.resultado) return recusada ? { ...e.resultado, dados: { ...e.resultado.dados, chave_recusada: true } } : e.resultado;
  if (e.esperou) return { ok: true, codigo: 'PUBLICAR_ACESSO_LIBERADO', dados: {} };
  return fazer(e.chave);
}

// O que o painel recusaria de qualquer jeito: melhor dizer antes de mandar duzentos megas.
export function conferirParaOPainel(pacote) {
  const recusados = pacote.nomes.filter((rel) => !tipoAceito(rel));
  if (recusados.length) reprovado('PUBLICAR_TIPO_NAO_ACEITO', { arquivos: recusados.map((r) => `deck/${r}`) });
  const maior = Math.max(pacote.zip.length, pacote.conteudoBytes);
  if (maior > TETO_MB * MB) reprovado('PUBLICAR_SITE_GRANDE_DEMAIS', { mb: Math.ceil(maior / MB), mb_max: TETO_MB });
}

// Erros depois dos quais a apresentação pode já estar no ar: a anotação do endereço fica.
const TALVEZ_NO_AR = Object.freeze(['PUBLICAR_CONCLUSAO_INCERTA', 'PUBLICAR_NO_AR_AJUSTANDO', 'PUBLICAR_ENVIO_EM_ANDAMENTO']);

function anotarNoAr(c, dados) {
  if (dados === null) fs.rmSync(arquivoNoAr(c), { force: true });
  else escreverJson(arquivoNoAr(c), dados);
}

// Envia com o endereço anotado antes; desfaz a anotação se o painel recusou antes de publicar.
async function enviarAnotando(cfg, chave, c, noAr, pacote) {
  const antes = fs.existsSync(arquivoNoAr(c)) ? lerNoAr(c) : null;
  anotarNoAr(c, { ...(antes && antes.nome === noAr ? antes : {}), nome: noAr, em: new Date().toISOString() });
  try {
    return await enviarPacote(cfg, chave, noAr, pacote);
  } catch (erro) {
    if (!(erro instanceof KitErro) || !TALVEZ_NO_AR.includes(erro.codigo)) anotarNoAr(c, antes);
    throw erro;
  }
}

// O endereço tem outra coisa da pessoa no ar (e esta apresentação nunca foi publicada nele)? Vale
// para publicar e para --voltar: voltar versão ali mexeria no site ou na outra apresentação dela.
async function conferirDono(cfg, chave, c, noAr, porCima) {
  if (porCima || lerNoAr(c).nome === noAr) return;
  if (await enderecoNaConta(cfg, chave, noAr)) reprovado('PUBLICAR_ENDERECO_JA_EM_USO', { nome: noAr });
}

async function publicarApresentacao(cfg, c, noAr, porCima) {
  const faltam = conferenciasQueFaltam(c);
  if (faltam.length) reprovado('PUBLICAR_CONFERIR_ANTES', { nome: c.nome, faltam });
  const pacote = montarPacote(c.deck);
  conferirParaOPainel(pacote);
  const avisos = pacote.naoCitados.length ? [aviso('ARQUIVO_NAO_USADO', { arquivos: pacote.naoCitados.map((r) => `deck/${r}`) })] : [];
  return comAcesso(cfg, async (chave) => {
    await conferirDono(cfg, chave, c, noAr, porCima);
    const r = await enviarAnotando(cfg, chave, c, noAr, pacote);
    anotarNoAr(c, { nome: r.slug, endereco: r.endereco, versao: r.versao, em: new Date().toISOString() });
    const estaNoAr = await esperarSiteNoAr(cfg, r.endereco);
    const resultado = {
      ok: true,
      avisos,
      arquivos: { no_ar: c.rel('no-ar.json') },
      dados: {
        versao: r.versao,
        nome: r.slug,
        arquivos: pacote.arquivos,
        telas: pacote.telas,
        videos: pacote.videos,
        fora_do_pacote: pacote.foraDoPacote.map((rel) => `deck/${rel}`),
        tamanho_kb: Math.round(pacote.zip.length / 102.4) / 10,
      },
    };
    if (estaNoAr) return { ...resultado, codigo: 'PUBLICADO', dados: { ...resultado.dados, endereco: r.endereco } };
    return { ...resultado, codigo: 'PUBLICADO_CERTIFICADO_PENDENTE', dados: { ...resultado.dados, endereco: r.endereco } };
  });
}

export default async function publicar(args) {
  const cfg = { ...configuracao(), inicio: Date.now() };
  if (args.opcoes.sair !== undefined) {
    const tinha = esquecerTudo();
    return { ok: true, codigo: 'PUBLICAR_SAIU', dados: { tinha_acesso: tinha.chave, tinha_pedido: tinha.pedido, revogar_em: `${cfg.base}/conta` } };
  }
  const v = lerVoltar(args);
  const c = abrirApresentacao(nomeDaApresentacao(v.args));
  const noAr = nomeNoAr(c, args.opcoes);
  const porCima = args.opcoes['por-cima'] === true;
  if (!v.voltar) return publicarApresentacao(cfg, c, noAr, porCima);
  return comAcesso(cfg, async (chave) => {
    await conferirDono(cfg, chave, c, noAr, porCima);
    const r = await voltarVersao(cfg, chave, noAr, v.versao);
    return { ok: true, codigo: 'PUBLICAR_VERSAO_VOLTOU', dados: { nome: noAr, versao: r.versao } };
  });
}

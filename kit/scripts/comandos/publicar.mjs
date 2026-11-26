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
// falar com o serviço. Também reprova antes de enviar o que o painel recusaria de qualquer jeito
// (lib/regras-do-painel.mjs: tipo, nome, repetidos, quantidade, index, teto).
// Nada some por engano (lib/publicar-dono.mjs): o painel aceita uma versão nova em qualquer endereço
// da pessoa, então publicar e --voltar só seguem se o que está no ar foi esta pasta que pôs (registro
// em .ferramentas/publicar/donos.json, pelo caminho da pasta e pelo endereço). Senão reprovam com
// PUBLICAR_ENDERECO_JA_EM_USO ou PUBLICAR_PASTA_MUDOU até ela dizer --por-cima ou escolher --no-ar.
// O envio é registrado como "pendente" antes de mandar, com as versões que o endereço já tinha e o
// tamanho do pacote: se o processo cair no meio, a próxima vez sabe que a única versão nova que
// apareceu ali, com o tamanho do pacote deste envio, é desta pasta (de outro tamanho, ou duas ou mais
// novas: alguém mais publicou, e a conferência reprova). Recusa do painel antes de abrir o envio desfaz
// o registro (depois de aberto, o concluir pode ter publicado mesmo com erro, e o pendente fica);
// --voltar registra a versão que ficou no ar. no-ar.json, na pasta da apresentação, guarda o nome que
// esta pasta usa no endereço e o link (lembrete, não prova: vai junto numa cópia da pasta).
// Login, chave recusada, --voltar e --sair seguem o Site Estúdio, do qual este comando foi portado.
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao } from '../lib/apresentacao.mjs';
import { FERR, nomeValido, sugerirNome } from '../lib/caminhos.mjs';
import { montarPacote } from '../lib/pacote.mjs';
import { conferenciasQueFaltam } from '../lib/conferencias.mjs';
import { aviso, falha, reprovado, KitErro } from '../lib/saida.mjs';
import { configuracao } from '../lib/publicar-servico.mjs';
import { entrar } from '../lib/publicar-login.mjs';
import { enviarPacote, voltarVersao, esperarSiteNoAr } from '../lib/publicar-envio.mjs';
import { conferirDono, lerDono, anotarDono, lerNoAr, anotarNoAr, lembreteAtual } from '../lib/publicar-dono.mjs';
import { conferirParaOPainel } from '../lib/regras-do-painel.mjs';
import { apagar, arquivoChave, esquecerTudo, lerChave } from '../lib/publicar-guarda.mjs';

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

// Erros depois dos quais a apresentação pode já estar no ar: a anotação do endereço fica.
const TALVEZ_NO_AR = Object.freeze(['PUBLICAR_CONCLUSAO_INCERTA', 'PUBLICAR_NO_AR_AJUSTANDO', 'PUBLICAR_ENVIO_EM_ANDAMENTO']);

// O pedido de voltar ficou sem a resposta do painel: queda de conexão, proxy que respondeu no lugar dele
// (5xx sem código do painel) ou volta feita com o passo final falho. O painel pode ter voltado.
const voltaTalvezFeita = (erro) => !(erro instanceof KitErro)
  || erro.codigo === 'PUBLICAR_SEM_CONEXAO'
  || TALVEZ_NO_AR.includes(erro.codigo)
  || (Number.isInteger(erro.dados?.status) && erro.dados.status >= 500 && !erro.dados.codigo_do_servico);

// Envia com o endereço registrado antes ("pendente"); desfaz o registro e o lembrete só se o painel
// recusou antes de abrir o envio. Depois de aberto, o concluir pode ter publicado mesmo com erro (resposta
// estranha, código fora da lista): o pendente fica, e é inofensivo se nada entrou no ar (sem versão
// nova, a conferência compara com a versão que a pasta tinha).
async function enviarRegistrando(cfg, chave, c, noAr, pacote, situacao) {
  const lembrete = lembreteAtual(c);
  const registro = lerDono(c, noAr);
  anotarNoAr(c, { ...(lembrete && lembrete.nome === noAr ? lembrete : {}), nome: noAr, em: new Date().toISOString() });
  anotarDono(c, noAr, { ...(registro || {}), pendente: true, versoes_antes: situacao.versoes, envio_bytes: pacote.zip.length });
  let aberto = false;
  try {
    return await enviarPacote(cfg, chave, noAr, pacote, FERR, { aoAbrir: () => { aberto = true; } });
  } catch (erro) {
    const talvezNoAr = aberto || (erro instanceof KitErro && TALVEZ_NO_AR.includes(erro.codigo));
    if (!talvezNoAr) {
      anotarNoAr(c, lembrete);
      anotarDono(c, noAr, registro);
    }
    throw erro;
  }
}

async function publicarApresentacao(cfg, c, noAr, porCima) {
  const faltam = conferenciasQueFaltam(c);
  if (faltam.length) reprovado('PUBLICAR_CONFERIR_ANTES', { nome: c.nome, faltam });
  const pacote = montarPacote(c.deck);
  conferirParaOPainel(pacote);
  const avisos = pacote.naoCitados.length ? [aviso('ARQUIVO_NAO_USADO', { arquivos: pacote.naoCitados.map((r) => `deck/${r}`) })] : [];
  return comAcesso(cfg, async (chave) => {
    const situacao = await conferirDono(cfg, chave, c, noAr, porCima);
    const r = await enviarRegistrando(cfg, chave, c, noAr, pacote, situacao);
    // O registro fica pelo nome que esta pasta usa (noAr), o mesmo que a conferência procura.
    anotarDono(c, noAr, { versao: r.versao });
    // nome: o que esta pasta usa (noAr), o mesmo do registro; o endereço é o que o painel devolveu
    anotarNoAr(c, { nome: noAr, endereco: r.endereco, versao: r.versao, em: new Date().toISOString() });
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
    const situacao = await conferirDono(cfg, chave, c, noAr, porCima);
    // Registrado antes de pedir: se a resposta se perder (o painel pode ter voltado), a próxima
    // conferência aceita a versão pedida (lib/publicar-dono.mjs, voltouParaOPedido). Só quando a pasta
    // já tem registro: sem ele, um pedido sozinho bloquearia a migração pelo no-ar.json. Se o painel
    // respondeu recusando, o registro volta ao que era.
    const registro = lerDono(c, noAr);
    if (registro) {
      const volta = { de: situacao.versao, para: Number.isInteger(v.versao) ? v.versao : null, versoes: situacao.versoes };
      anotarDono(c, noAr, { ...registro, voltar: volta });
    }
    let r;
    try {
      r = await voltarVersao(cfg, chave, noAr, v.versao);
    } catch (erro) {
      if (registro && !voltaTalvezFeita(erro)) anotarDono(c, noAr, registro);
      throw erro;
    }
    anotarDono(c, noAr, { versao: r.versao });
    const lembrete = lerNoAr(c);
    anotarNoAr(c, { ...(lembrete.nome === noAr ? lembrete : {}), nome: noAr, versao: r.versao, em: new Date().toISOString() });
    return { ok: true, codigo: 'PUBLICAR_VERSAO_VOLTOU', dados: { nome: noAr, versao: r.versao } };
  });
}

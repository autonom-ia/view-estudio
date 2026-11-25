// Envio do pacote ao serviço, em partes, e a espera do site responder com cadeado.
// 0. GET  /api/estudio/sites → versão do site no ar agora (base para conferir depois).
// 1. POST /api/estudio/sites/<nome>/envios {bytes, sha256, arquivos} → {envio_id, parte_max, partes}
// 2. PUT  /api/estudio/envios/<id>/partes/<n> (bytes crus + X-Parte-Sha256). Falha de rede ou parte
//    que chegou corrompida: manda a mesma parte de novo, até 3 vezes (reenviar é inofensivo).
// 3. POST /api/estudio/envios/<id>/concluir → {slug, versao, endereco}. Sem resposta (queda de rede,
//    prazo, proxy devolvendo 5xx sem corpo do serviço), o serviço pode ter publicado mesmo assim: confere
//    na lista de sites se apareceu versão nova. Não apareceu no prazo: guarda a versão de antes em
//    .ferramentas/publicar/conferir-<nome>.json e devolve PUBLICAR_CONCLUSAO_INCERTA. A próxima
//    publicação do site confere primeiro e, se a versão nova já está no ar, não manda de novo.
// 4. GET  <endereco> com verificação normal do cadeado (TLS), até o prazo que sobra.
// Portado do Site Estúdio (lib/publicar-envio.mjs). No serviço, uma apresentação é um "site" com
// o mesmo endereço <nome>.sites.autonomia.site; por isso as rotas falam em sites.
import crypto from 'node:crypto';
import { KitErro } from './saida.mjs';
import { FERR } from './caminhos.mjs';
import {
  chamar, esperar, exigir, enderecoSeguro, erroDoServico, ErroDeRede, semConexao, prazoDaEspera, TEMPO_DE_CONCLUIR_MS,
} from './publicar-servico.mjs';
import { apagar, arquivoConferir, gravarConferir, lerConferir } from './publicar-guarda.mjs';

export const REENVIOS_POR_PARTE = 3;
const TEMPO_DA_CONSULTA_DO_SITE_MS = 15000;
const MINIMO_DA_CONSULTA_MS = 2000;

const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

async function semFalhaDeRede(fazer) {
  try {
    return await fazer();
  } catch (erro) {
    if (erro instanceof ErroDeRede) throw semConexao(erro);
    throw erro;
  }
}

// O site <nome> na lista da pessoa: { versao, endereco } (versao null se não existe ou está fora do ar).
// Falha de rede sobe como ErroDeRede: quem chama decide.
async function lerSite(cfg, chave, nome) {
  const c = exigir(await chamar(cfg, 'GET', '/api/estudio/sites', { chave }), 200);
  if (!Array.isArray(c.sites)) throw new KitErro('PUBLICAR_RESPOSTA_ESTRANHA', { etapa: 'listar sites' });
  const site = c.sites.find((s) => s && s.slug === nome);
  // O endereço vai para a frase que o assistente repete à pessoa: só https (ou o local de teste).
  const endereco = site ? enderecoSeguro(site.endereco, cfg) : null;
  if (!site || !Number.isInteger(site.versao) || !endereco) return { versao: null, endereco: '', bytes: null };
  // Tamanho do pacote da versão no ar, quando a lista diz (o painel guarda o tamanho de cada envio).
  const daVersao = Array.isArray(site.versoes) ? site.versoes.find((v) => v && v.versao === site.versao) : null;
  const bytes = daVersao && Number.isInteger(daVersao.bytes) ? daVersao.bytes : null;
  return { versao: site.versao, endereco, bytes };
}

// A versão nova no ar pode ser deste pacote? Se a lista diz o tamanho e ele é outro, não é.
const podeSerDeste = (site, bytes) => site.bytes === null || site.bytes === bytes;

// O endereço <nome> na lista da pessoa: { teveVersao, versao }. teveVersao é false quando o endereço
// não existe ou só ficou reservado por um envio que não chegou a publicar (nenhuma versão guardada);
// versao é a que está no ar agora (null se fora do ar).
export async function situacaoDoEndereco(cfg, chave, nome) {
  const c = exigir(await semFalhaDeRede(() => chamar(cfg, 'GET', '/api/estudio/sites', { chave })), 200);
  if (!Array.isArray(c.sites)) throw new KitErro('PUBLICAR_RESPOSTA_ESTRANHA', { etapa: 'listar sites' });
  const site = c.sites.find((s) => s && s.slug === nome);
  if (!site) return { teveVersao: false, versao: null, versoes: [], tamanhos: {} };
  const versao = Number.isInteger(site.versao) ? site.versao : null;
  const lista = Array.isArray(site.versoes) ? site.versoes.filter((v) => v && Number.isInteger(v.versao)) : [];
  // tamanhos: os bytes do pacote de cada versão, quando o painel sabe (null quando não).
  const tamanhos = Object.fromEntries(lista.map((v) => [v.versao, Number.isInteger(v.bytes) ? v.bytes : null]));
  return { teveVersao: versao !== null || lista.length > 0, versao, versoes: lista.map((v) => v.versao), tamanhos };
}

const versaoNova = (site, antes) => site.versao !== null && site.versao !== antes;

function conferirAbertura(corpo, bytes) {
  const { envio_id: id, parte_max: max, partes } = corpo;
  const valido = typeof id === 'string' && id !== '' && Number.isInteger(max) && max > 0 &&
    Number.isInteger(partes) && partes === Math.max(1, Math.ceil(bytes / max));
  if (!valido) throw new KitErro('PUBLICAR_RESPOSTA_ESTRANHA', { etapa: 'abrir envio' });
  return { id, max, partes };
}

// Manda uma parte. Reenvia em falha de rede, em erro do servidor (5xx), em parte corrompida e em parte
// ainda chegando por um pedido anterior (PARTE_EM_ANDAMENTO).
async function mandarParte(cfg, chave, envio, n, pedaco) {
  const caminho = `/api/estudio/envios/${encodeURIComponent(envio.id)}/partes/${n}`;
  const cabecalhos = { 'x-parte-sha256': sha256(pedaco) };
  let ultimo = null;
  for (let tentativa = 0; tentativa <= REENVIOS_POR_PARTE; tentativa += 1) {
    if (tentativa > 0) await esperar(Math.min(cfg.tempos.intervaloMs, 2000));
    let r;
    try {
      r = await chamar(cfg, 'PUT', caminho, { chave, bytes: pedaco, cabecalhos });
    } catch (erro) {
      if (!(erro instanceof ErroDeRede)) throw erro;
      ultimo = semConexao(erro);
      continue;
    }
    const corrompida = r.status === 400 && r.corpo && r.corpo.codigo === 'PARTE_CORROMPIDA';
    // A mesma parte ainda chegando por um pedido anterior (o que caiu pela rede): espera e manda de novo.
    const emAndamento = r.status === 409 && r.corpo && r.corpo.codigo === 'PARTE_EM_ANDAMENTO';
    if (r.status >= 500 || corrompida || emAndamento) {
      ultimo = erroDoServico(r);
      continue;
    }
    return exigir(r, 200);
  }
  throw ultimo;
}

// Corpo do concluir, ou null quando a resposta se perdeu e o serviço pode ter publicado.
async function concluir(cfg, chave, envio) {
  let r;
  try {
    r = await chamar(cfg, 'POST', `/api/estudio/envios/${encodeURIComponent(envio.id)}/concluir`, { chave, json: {}, tempoMs: TEMPO_DE_CONCLUIR_MS });
  } catch (erro) {
    if (erro instanceof ErroDeRede) return null;
    throw erro;
  }
  const doServico = r.corpo && typeof r.corpo.codigo === 'string';
  if (r.status >= 500 && !doServico) return null;
  return exigir(r, 200);
}

// Depois de um concluir sem resposta: guarda a versão de antes (qualquer erro daqui em diante deixa a
// conferência para a próxima chamada) e procura a versão nova na lista até o prazo que sobra.
async function confirmarOuGuardar(cfg, chave, nome, versaoAntes, pacote, ferr) {
  gravarConferir(cfg.base, nome, versaoAntes, pacote.impressao, ferr);
  const limite = Date.now() + prazoDaEspera(cfg);
  for (;;) {
    try {
      const site = await lerSite(cfg, chave, nome);
      if (versaoNova(site, versaoAntes) && podeSerDeste(site, pacote.zip.length)) {
        apagar(arquivoConferir(nome, ferr));
        return { slug: nome, versao: site.versao, endereco: site.endereco };
      }
    } catch (erro) {
      if (!(erro instanceof ErroDeRede)) throw erro;
    }
    if (Date.now() + cfg.tempos.intervaloMs > limite) throw new KitErro('PUBLICAR_CONCLUSAO_INCERTA', { nome });
    await esperar(cfg.tempos.intervaloMs);
  }
}

// Publica o pacote montado (lib/pacote.mjs). Devolve { slug, versao, endereco, partes }. aoAbrir é
// chamado quando o painel aceita abrir o envio: daí em diante a apresentação pode chegar ao ar mesmo
// com erro (o concluir publica e a resposta vem estranha, por exemplo).
export async function enviarPacote(cfg, chave, nome, pacote, ferr = FERR, { aoAbrir } = {}) {
  const antes = await semFalhaDeRede(() => lerSite(cfg, chave, nome));
  // Só pula o envio se a versão nova que apareceu é deste mesmo conteúdo (pacote.impressao: nomes e
  // bytes, sem as datas que mudam o zip): a apresentação pode ter mudado entre o envio sem resposta e
  // agora, e aí o que está no ar não é o que a pessoa quer publicar.
  const pendente = lerConferir(cfg.base, nome, ferr);
  if (pendente) {
    apagar(arquivoConferir(nome, ferr));
    const mesmoPacote = pendente.impressao === pacote.impressao;
    if (mesmoPacote && versaoNova(antes, pendente.versao_antes) && podeSerDeste(antes, pacote.zip.length)) return { slug: nome, versao: antes.versao, endereco: antes.endereco, partes: 0 };
  }
  const bytes = pacote.zip.length;
  const aberto = await semFalhaDeRede(() =>
    chamar(cfg, 'POST', `/api/estudio/sites/${encodeURIComponent(nome)}/envios`, {
      chave,
      json: { bytes, sha256: pacote.sha256, arquivos: pacote.arquivos },
    }));
  const envio = conferirAbertura(exigir(aberto, 201, 200), bytes);
  if (aoAbrir) aoAbrir();
  for (let n = 0; n < envio.partes; n += 1) {
    await mandarParte(cfg, chave, envio, n, pacote.zip.subarray(n * envio.max, Math.min(bytes, (n + 1) * envio.max)));
  }
  const c = await concluir(cfg, chave, envio);
  if (!c) return { ...(await confirmarOuGuardar(cfg, chave, nome, antes.versao, pacote, ferr)), partes: envio.partes };
  const endereco = enderecoSeguro(c.endereco, cfg);
  if (!Number.isInteger(c.versao) || !endereco) throw new KitErro('PUBLICAR_RESPOSTA_ESTRANHA', { etapa: 'concluir' });
  return { slug: typeof c.slug === 'string' ? c.slug : nome, versao: c.versao, endereco, partes: envio.partes };
}

// Volta o site para uma versão guardada (sem versão: a anterior). Devolve { versao }.
export async function voltarVersao(cfg, chave, nome, versao) {
  const json = versao === undefined ? {} : { versao };
  const r = await semFalhaDeRede(() => chamar(cfg, 'POST', `/api/estudio/sites/${encodeURIComponent(nome)}/voltar`, { chave, json }));
  const c = exigir(r, 200);
  if (!Number.isInteger(c.versao)) throw new KitErro('PUBLICAR_RESPOSTA_ESTRANHA', { etapa: 'voltar' });
  return { versao: c.versao };
}

// O site responde no endereço, com o cadeado conferido? Tenta até o prazo que sobra (ao menos uma vez).
export async function esperarSiteNoAr(cfg, endereco) {
  const alvo = enderecoSeguro(endereco, cfg);
  if (!alvo) return false;
  const limite = Date.now() + prazoDaEspera(cfg);
  for (;;) {
    const tempo = Math.max(MINIMO_DA_CONSULTA_MS, Math.min(TEMPO_DA_CONSULTA_DO_SITE_MS, limite - Date.now()));
    try {
      const r = await fetch(alvo, { redirect: 'follow', signal: AbortSignal.timeout(tempo) });
      await r.arrayBuffer();
      if (r.ok) return true;
    } catch {
      // Cadeado ainda não emitido ou rota ainda não criada: espera e tenta de novo.
    }
    if (Date.now() + cfg.tempos.intervaloMs > limite) return false;
    await esperar(cfg.tempos.intervaloMs);
  }
}

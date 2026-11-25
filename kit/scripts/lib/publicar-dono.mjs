// Quem é o dono do que está no ar num endereço, do ponto de vista deste computador.
// O painel aceita uma versão nova em qualquer endereço da pessoa: sem esta conferência, publicar uma
// apresentação com o nome de um site dela, ou uma cópia da mesma apresentação, tiraria o outro do ar.
//
// Duas anotações, com papéis diferentes:
// - apresentacoes/<nome>/no-ar.json: o nome do endereço e o link, para a pessoa e para a próxima vez
//   (vale como lembrete, não como prova: ele vai junto quando a pasta é copiada);
// - .ferramentas/publicar/donos.json: a prova. Indexada pelo caminho real da pasta da apresentação e
//   pelo endereço, guarda a versão que esta pasta pôs no ar (ou "pendente", com envio em curso, as
//   versões que o endereço já tinha quando o envio começou e o tamanho do pacote). Fica
//   fora das pastas da pessoa e a atualização do estúdio não mexe nela (atualizacao.mjs preserva
//   .ferramentas/); desinstalar apaga, e aí a primeira publicação pede --por-cima uma vez.
//
// conferirDono reprova (saída 2) quando o endereço já teve versão e:
// - esta pasta tem registro, mas a versão no ar é outra (publicaram por outro computador ou por uma
//   cópia): PUBLICAR_ENDERECO_JA_EM_USO;
// - esta pasta não tem registro e outra pasta tem (a apresentação foi copiada ou movida):
//   PUBLICAR_PASTA_MUDOU, dizendo se a pasta anterior ainda existe;
// - ninguém tem registro e o no-ar.json não bate com o que está no ar: PUBLICAR_ENDERECO_JA_EM_USO.
// Migração de quem publicou antes deste registro: sem nenhum registro do endereço neste computador, o
// no-ar.json que bate com a versão no ar vale uma vez e vira registro.
// --por-cima pula a conferência. Endereço só reservado (nenhuma versão guardada) não conta.
import fs from 'node:fs';
import path from 'node:path';
import { FERR, relativoARaiz } from './caminhos.mjs';
import { escreverJson } from './json.mjs';
import { reprovado } from './saida.mjs';
import { gravarPrivado, lerPrivado, pastaPublicar } from './publicar-guarda.mjs';
import { situacaoDoEndereco } from './publicar-envio.mjs';

const arquivoDonos = (ferr = FERR) => path.join(pastaPublicar(ferr), 'donos.json');
export const arquivoNoAr = (c) => path.join(c.pasta, 'no-ar.json');

// Caminho real (sem link e sem "..") da pasta da apresentação: a mesma pasta dá sempre a mesma chave.
// O .native devolve a caixa que está no disco (no Windows, "Apresentacoes" e "apresentacoes" são a
// mesma pasta).
const chaveDaPasta = (c) => {
  try {
    return fs.realpathSync.native(c.pasta);
  } catch {
    return path.resolve(c.pasta);
  }
};

export function lerNoAr(c) {
  try {
    const v = JSON.parse(fs.readFileSync(arquivoNoAr(c), 'utf8'));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

// Grava o lembrete; null apaga (volta a como estava quando não existia).
export function anotarNoAr(c, dados) {
  if (dados === null) fs.rmSync(arquivoNoAr(c), { force: true });
  else escreverJson(arquivoNoAr(c), dados);
}

// O lembrete como está agora, para desfazer depois: null quando ainda não existe.
export const lembreteAtual = (c) => (fs.existsSync(arquivoNoAr(c)) ? lerNoAr(c) : null);

const lerDonos = (ferr) => lerPrivado(arquivoDonos(ferr)) || {};

// O registro desta pasta para este endereço ({ versao, pendente, em }), ou null.
export function lerDono(c, endereco, ferr = FERR) {
  const daPasta = lerDonos(ferr)[chaveDaPasta(c)];
  const r = daPasta && typeof daPasta === 'object' ? daPasta[endereco] : null;
  return r && typeof r === 'object' ? r : null;
}

// Grava (ou apaga, com null) o registro desta pasta para este endereço.
export function anotarDono(c, endereco, registro, ferr = FERR) {
  const donos = lerDonos(ferr);
  const pasta = chaveDaPasta(c);
  const daPasta = { ...(donos[pasta] && typeof donos[pasta] === 'object' ? donos[pasta] : {}) };
  if (registro === null) delete daPasta[endereco];
  else daPasta[endereco] = { ...registro, em: new Date().toISOString() };
  const novo = { ...donos };
  if (Object.keys(daPasta).length) novo[pasta] = daPasta;
  else delete novo[pasta];
  gravarPrivado(arquivoDonos(ferr), novo);
}

// O que está no ar é o que esta pasta pôs? Com envio pendente (o processo pode ter caído no meio),
// vale a versão que ela tinha ou a ÚNICA versão nova desde que o envio começou, se tiver o tamanho do
// pacote deste envio (envio_bytes): uma versão nova de outro tamanho é de outro lugar, e duas ou mais
// novas querem dizer que alguém mais publicou ali. Sem a lista de antes do envio, só vale a versão
// que ela tinha.
function bate(registro, situacao) {
  if (situacao.versao === null) return true;
  const antes = registro.pendente === true && Array.isArray(registro.versoes_antes) ? registro.versoes_antes : null;
  if (!antes) return registro.versao === situacao.versao;
  const novas = situacao.versoes.filter((v) => !antes.includes(v));
  if (!novas.length) return registro.versao === situacao.versao;
  if (novas.length !== 1 || novas[0] !== situacao.versao) return false;
  const tamanho = situacao.tamanhos[situacao.versao];
  return Number.isInteger(registro.envio_bytes) && tamanho === registro.envio_bytes;
}

// Outras pastas deste computador com registro para este endereço, primeiro a que pôs no ar o que está
// lá agora (é dela que esta é cópia, ou de onde esta foi movida).
function outrasPastas(c, endereco, situacao, ferr) {
  const minha = chaveDaPasta(c);
  const outras = Object.entries(lerDonos(ferr))
    .filter(([pasta, daPasta]) => pasta !== minha && daPasta && typeof daPasta === 'object' && daPasta[endereco]);
  const primeiro = (par) => (bate(par[1][endereco], situacao) ? 0 : 1);
  return [...outras].sort((a, b) => primeiro(a) - primeiro(b)).map(([pasta]) => pasta);
}

// Devolve a situação do endereço ({ teveVersao, versao, versoes, tamanhos }), que o envio guarda no
// registro pendente. --por-cima pula a conferência, mas a situação é lida do mesmo jeito.
export async function conferirDono(cfg, chave, c, endereco, porCima, ferr = FERR) {
  const situacao = await situacaoDoEndereco(cfg, chave, endereco);
  if (porCima || !situacao.teveVersao) return situacao;
  const dono = lerDono(c, endereco, ferr);
  const emUso = (versaoDesta) => reprovado('PUBLICAR_ENDERECO_JA_EM_USO', { nome: endereco, versao_no_ar: situacao.versao, versao_desta: versaoDesta });
  if (dono) {
    if (bate(dono, situacao)) return situacao;
    emUso(Number.isInteger(dono.versao) ? dono.versao : null);
  }
  const outras = outrasPastas(c, endereco, situacao, ferr);
  if (outras.length) {
    reprovado('PUBLICAR_PASTA_MUDOU', {
      nome: endereco,
      lugar: relativoARaiz(c.pasta),
      lugar_anterior: relativoARaiz(outras[0]),
      anterior_existe: fs.existsSync(outras[0]),
    });
  }
  const anotado = lerNoAr(c);
  if (anotado.nome === endereco && bate(anotado, situacao)) {
    anotarDono(c, endereco, { versao: Number.isInteger(anotado.versao) ? anotado.versao : situacao.versao, migrado: true }, ferr);
    return situacao;
  }
  emUso(null);
}

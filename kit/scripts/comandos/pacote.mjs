// Empacota a apresentação pronta (deck/) num .zip para hospedar onde a pessoa quiser (Netlify,
// Cloudflare Pages, GitHub Pages ou qualquer servidor de arquivos), sem o estúdio entrar na conta de
// ninguém. A montagem (recusas, o que fica fora, arquivos não citados) mora em lib/pacote.mjs; aqui só
// se grava o zip e o SHA-256 e se descreve o resultado.
// O zip fica em apresentacoes/<nome>/<nome>-apresentacao.zip, com o SHA-256 ao lado.
// Como o "publicar", só empacota com o "checar", o "fatos" e o "acessibilidade" aprovados para a
// apresentação como ela está agora (PUBLICAR_CONFERIR_ANTES): o zip existe para ir para a internet.
// Portado do Site Estúdio (comando "pacote").
import path from 'node:path';
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao } from '../lib/apresentacao.mjs';
import { montarPacote } from '../lib/pacote.mjs';
import { conferenciasQueFaltam } from '../lib/conferencias.mjs';
import { escreverTexto } from '../lib/json.mjs';
import { aviso, reprovado } from '../lib/saida.mjs';

export default async function pacote(args) {
  const c = abrirApresentacao(nomeDaApresentacao(args));
  const faltam = conferenciasQueFaltam(c);
  if (faltam.length) reprovado('PUBLICAR_CONFERIR_ANTES', { nome: c.nome, faltam });
  const p = montarPacote(c.deck);
  const zip = path.join(c.pasta, `${c.nome}-apresentacao.zip`);
  escreverTexto(zip, p.zip);
  escreverTexto(`${zip}.sha256`, `${p.sha256}  ${path.basename(zip)}\n`);
  const avisos = p.naoCitados.length ? [aviso('ARQUIVO_NAO_USADO', { arquivos: p.naoCitados.map((r) => `deck/${r}`) })] : [];
  return {
    ok: true,
    codigo: 'PACOTE_PRONTO',
    avisos,
    arquivos: { zip: c.rel(path.basename(zip)), sha256: c.rel(`${path.basename(zip)}.sha256`) },
    dados: {
      arquivos: p.arquivos,
      telas: p.telas,
      videos: p.videos,
      fora_do_pacote: p.foraDoPacote.map((r) => `deck/${r}`),
      tamanho_kb: Math.round(p.zip.length / 102.4) / 10,
      conteudo_kb: Math.round(p.conteudoBytes / 102.4) / 10,
    },
  };
}

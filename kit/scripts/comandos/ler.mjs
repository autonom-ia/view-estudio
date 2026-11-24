// ./estudio ler <nome> --negocio "Nome do negócio, cidade" [--google <endereço>] [--site <endereço>]
// Para apresentação sobre um negócio (pitch, proposta comercial, institucional): lê sozinho as
// páginas públicas dele, sem entrar em conta nenhuma: o perfil do Google (endereço, telefone,
// horário, nota e avaliações sem o nome de quem escreveu) e o site atual inteiro (achado pelo Google
// se não vier --site). Salva tudo em apresentacoes/<nome>/coleta/ e põe cada fato, com a fonte e a
// data, na parte "Lido pelo estúdio" da tabela de fatos do brief.md (o texto das avaliações fica só
// em coleta/, nunca na tabela). Ler é permitido; nada é
// publicado nem enviado. O Instagram não é lido (fica para depois).
// Portado do Site Estúdio (comando "ler").
import path from 'node:path';
import { nomeDaApresentacao } from '../lib/args.mjs';
import { caminhosDe } from '../lib/apresentacao.mjs';
import { ehPasta, relativoARaiz } from '../lib/caminhos.mjs';
import { abrirLeitor } from '../lib/leitor.mjs';
import { lerFontes } from '../lib/ler.mjs';
import { falha } from '../lib/saida.mjs';
import { progresso } from '../lib/executar.mjs';

// Opção dada sem valor (ou só com espaço) é erro, nunca fonte pulada em silêncio.
function texto(opcoes, nome) {
  const v = opcoes[nome];
  if (v === undefined) return '';
  const limpo = typeof v === 'string' ? v.trim() : '';
  if (!limpo) falha('ARGUMENTO_INVALIDO', { argumento: `--${nome}`, valor: String(v) });
  return limpo;
}

export default async function ler(args) {
  const nome = nomeDaApresentacao(args);
  const c = caminhosDe(nome);
  if (!ehPasta(c.pasta)) falha('APRESENTACAO_NAO_ACHADA', { nome, pasta: relativoARaiz(c.pasta) });
  const o = args.opcoes;
  const pedido = { negocio: texto(o, 'negocio'), google: texto(o, 'google'), site: texto(o, 'site') };
  if (!pedido.negocio && !pedido.google && !pedido.site) falha('LER_SEM_ENDERECO', { opcoes: ['--negocio', '--google', '--site'] });
  progresso('Lendo as páginas públicas do negócio (sem entrar em conta nenhuma)...');
  let leitor = null;
  let r;
  try {
    leitor = await abrirLeitor();
    r = await lerFontes(pedido, { pasta: path.join(c.pasta, 'coleta'), brief: c.brief, leitor, aoAvancar: progresso });
  } finally {
    leitor?.fechar();
  }
  const leu = Boolean(r.dados.google || r.dados.site);
  if (!leu) return { ok: false, codigo: 'LER_NADA', avisos: r.avisos, dados: r.dados, sair: 1 };
  return {
    ok: true,
    codigo: r.avisos.length ? 'LER_COM_AVISOS' : 'LER_OK',
    avisos: r.avisos,
    arquivos: { coleta: c.rel('coleta'), brief: c.rel('brief.md') },
    dados: r.dados,
  };
}

// Prepara a rodada N de revisão: escreve revisao/contexto-rN.md com a régua das notas
// (kit/regua-revisao.md) e o que as rodadas anteriores aceitaram e recusaram (rodada-K.json).
// Cada revisor lê esse arquivo antes de avaliar: o que já foi decidido não volta a cada rodada.
// Devolve também a trajetória das notas (média, se passou, alertas) e as duas metas medidas em
// separado: passar em até 2 rodadas; estabilidade de até 0,3 por lente numa reavaliação do mesmo estado.
import fs from 'node:fs';
import path from 'node:path';
import { nomeDaApresentacao, inteiro } from '../lib/args.mjs';
import { abrirApresentacao } from '../lib/apresentacao.mjs';
import { KIT, relativoARaiz } from '../lib/caminhos.mjs';
import { lerTexto, escreverTexto } from '../lib/json.mjs';
import { aviso, falha } from '../lib/saida.mjs';
import { lerRodadas, trajetoria, montarContexto, proximaRodada, META } from '../lib/rodadas.mjs';

export const ARQUIVO_REGUA = path.join(KIT, 'regua-revisao.md');

export default async function revisao(args) {
  const nome = nomeDaApresentacao(args);
  const c = abrirApresentacao(nome);
  const rodada = inteiro(args.opcoes, 'rodada', proximaRodada(c.revisao), 1, 99);
  if (!fs.existsSync(ARQUIVO_REGUA)) falha('ARQUIVO_NAO_ACHADO', { arquivo: relativoARaiz(ARQUIVO_REGUA) });
  const { rodadas, ilegiveis } = lerRodadas(c.revisao, rodada);
  const contexto = path.join(c.revisao, `contexto-r${rodada}.md`);
  escreverTexto(contexto, montarContexto(rodada, lerTexto(ARQUIVO_REGUA), rodadas));
  const avisos = ilegiveis.map((i) => aviso('RODADA_ILEGIVEL', { arquivo: relativoARaiz(i.arquivo), erro: i.erro }));
  return {
    ok: true,
    codigo: 'REVISAO_PRONTA',
    avisos,
    arquivos: { contexto: relativoARaiz(contexto), regua: relativoARaiz(ARQUIVO_REGUA) },
    dados: { rodada, rodadas_anteriores: rodadas.map((r) => r.rodada), meta: META, ...trajetoria(rodadas) },
  };
}

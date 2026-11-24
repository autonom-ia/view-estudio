// Mostra a versão do estúdio e das peças fixas. Sem o arquivo VERSAO, avisa VERSAO_NAO_ACHADA
// e o resumo diz isso, em vez de uma frase com o número faltando.
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from '../lib/caminhos.mjs';
import { VERSAO_HYPERFRAMES } from '../lib/hyperframes.mjs';
import { lerVersao } from '../lib/atualizacao.mjs';
import { aviso, textoDoCodigo } from '../lib/saida.mjs';

export function resultadoDaVersao(v, pacote = {}) {
  const avisos = v ? [] : [aviso('VERSAO_NAO_ACHADA')];
  return {
    ok: true,
    codigo: 'VERSAO',
    ...(v ? {} : { resumo: textoDoCodigo('VERSAO_NAO_ACHADA') }),
    avisos,
    dados: { versao: v, pacote: pacote.version || null, hyperframes: VERSAO_HYPERFRAMES, node: process.versions.node, plataforma: `${process.platform}-${process.arch}` },
  };
}

export default async function versao() {
  let pacote = {};
  try {
    pacote = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
  } catch {}
  return resultadoDaVersao(lerVersao(RAIZ), pacote);
}

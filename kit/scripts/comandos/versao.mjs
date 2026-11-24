// Mostra a versão do estúdio e das peças fixas.
import fs from 'node:fs';
import path from 'node:path';
import { RAIZ } from '../lib/caminhos.mjs';
import { VERSAO_HYPERFRAMES } from '../lib/hyperframes.mjs';
import { lerVersao } from '../lib/atualizacao.mjs';

export default async function versao() {
  let pacote = {};
  try {
    pacote = JSON.parse(fs.readFileSync(path.join(RAIZ, 'package.json'), 'utf8'));
  } catch {}
  const v = lerVersao(RAIZ);
  return {
    ok: true,
    codigo: 'VERSAO',
    dados: { versao: v, pacote: pacote.version || null, hyperframes: VERSAO_HYPERFRAMES, node: process.versions.node, plataforma: `${process.platform}-${process.arch}` },
  };
}

#!/usr/bin/env node
// Despachante do View Estúdio: "./estudio <comando> [argumentos]".
// Cada comando mora em comandos/<nome>.mjs e devolve { ok, codigo, resumo, arquivos, avisos, dados, sair? }.
// A última linha impressa no stdout é sempre o JSON do contrato (lib/saida.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { imprimirResultado, resultadoDeErro, textoDoCodigo } from './lib/saida.mjs';
import { lerArgs } from './lib/args.mjs';

const PASTA_COMANDOS = path.join(path.dirname(fileURLToPath(import.meta.url)), 'comandos');
const NODE_MINIMO = 22;

export function comandosDisponiveis() {
  return fs
    .readdirSync(PASTA_COMANDOS)
    .filter((n) => n.endsWith('.mjs'))
    .map((n) => n.slice(0, -4))
    .sort();
}

async function principal() {
  const [comando, ...resto] = process.argv.slice(2);
  const maior = Number(process.versions.node.split('.')[0]);
  if (maior < NODE_MINIMO) {
    imprimirResultado(comando || '', { ok: false, codigo: 'NODE_ANTIGO', dados: { tem: process.versions.node, precisa: `${NODE_MINIMO}+` } });
    process.exitCode = 1;
    return;
  }
  const disponiveis = comandosDisponiveis();
  if (!comando || !disponiveis.includes(comando)) {
    imprimirResultado(comando || '', {
      ok: false,
      codigo: 'COMANDO_DESCONHECIDO',
      resumo: textoDoCodigo('COMANDO_DESCONHECIDO'),
      dados: { comando: comando || '', disponiveis },
    });
    process.exitCode = 1;
    return;
  }
  try {
    const modulo = await import(pathToFileURL(path.join(PASTA_COMANDOS, `${comando}.mjs`)).href);
    const resultado = await modulo.default(lerArgs(resto));
    imprimirResultado(comando, resultado);
    process.exitCode = resultado.sair !== undefined ? resultado.sair : resultado.ok ? 0 : 1;
  } catch (erro) {
    const r = resultadoDeErro(erro);
    imprimirResultado(comando, r);
    process.exitCode = r.sair;
  }
}

principal();

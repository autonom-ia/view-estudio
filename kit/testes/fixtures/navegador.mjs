// Opções dos testes que precisam de navegador. Sem Chrome, Edge ou Chromium na máquina, eles são
// pulados, e o "ℹ skipped" do npm test conta quantos. No CI, a variável
// ESTUDIO_TESTES_EXIGEM_NAVEGADOR=1 (.github/workflows/testes.yml) faz o contrário: sem navegador,
// o teste roda e FALHA, em vez de passar em silêncio como pulado. A pessoa nunca liga essa variável:
// ela só muda o resultado dos testes, não o estúdio.
import { acharNavegador } from '../../scripts/lib/chrome.mjs';

export const EXIGE_NAVEGADOR = process.env.ESTUDIO_TESTES_EXIGEM_NAVEGADOR === '1';
export const TEM_NAVEGADOR = Boolean(acharNavegador());
export const MOTIVO_DO_PULO = 'sem Chrome, Edge ou Chromium nesta máquina';

// { skip, timeout } para o node:test. Pula só sem navegador e fora do CI.
export function opcoesDoNavegador(timeout, { tem = TEM_NAVEGADOR, exige = EXIGE_NAVEGADOR } = {}) {
  return { skip: tem || exige ? false : MOTIVO_DO_PULO, timeout };
}

// Para o começo de um teste que exige navegador: sem ele, falha dizendo por quê.
export function exigirNavegador(tem = TEM_NAVEGADOR) {
  if (!tem) throw new Error(`${MOTIVO_DO_PULO}, e o CI exige (ESTUDIO_TESTES_EXIGEM_NAVEGADOR=1)`);
}

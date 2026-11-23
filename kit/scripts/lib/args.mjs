// Leitura dos argumentos: posicionais e "--nome valor" (ou "--chave" sozinho = true).
import { falha } from './saida.mjs';
import { nomeValido, sugerirNome } from './caminhos.mjs';

// Opções que nunca levam valor: não engolem o argumento seguinte, em qualquer ordem.
export const OPCOES_SEM_VALOR = Object.freeze(['sem-navegador', 'criar', 'conferir', 'rapido', 'pasta']);

export function lerArgs(lista) {
  const posicionais = [];
  const opcoes = {};
  for (let i = 0; i < lista.length; i += 1) {
    const a = lista[i];
    if (a.startsWith('--') && a.length > 2) {
      const igual = a.indexOf('=');
      if (igual > 2) {
        opcoes[a.slice(2, igual)] = a.slice(igual + 1);
        continue;
      }
      const nome = a.slice(2);
      const prox = lista[i + 1];
      if (OPCOES_SEM_VALOR.includes(nome)) opcoes[nome] = true;
      else if (prox === undefined || (prox.startsWith('--') && prox.length > 2)) opcoes[nome] = true;
      else {
        opcoes[nome] = prox;
        i += 1;
      }
    } else {
      posicionais.push(a);
    }
  }
  return { posicionais, opcoes };
}

export function inteiro(opcoes, nome, padrao, min = 0, max = 100000) {
  if (opcoes[nome] === undefined) return padrao;
  const v = Number(opcoes[nome]);
  if (!Number.isInteger(v) || v < min || v > max) falha('ARGUMENTO_INVALIDO', { argumento: `--${nome}`, valor: String(opcoes[nome]) });
  return v;
}

// Nome da apresentação: 1º posicional ou --nome. Inválido vira erro com sugestão.
export function nomeDaApresentacao({ posicionais, opcoes }) {
  const nome = posicionais[0] || (typeof opcoes.nome === 'string' ? opcoes.nome : '');
  if (!nome) falha('ARGUMENTO_FALTANDO', { argumento: '<nome>' });
  if (!nomeValido(nome)) falha('NOME_INVALIDO', { valor: nome, sugestao: sugerirNome(nome) });
  return nome;
}

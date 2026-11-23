// Gera deck/teleprompter.html a partir de roteiro/SNN.json. Abra junto com o deck pelo "abrir":
// o teleprompter segue a tela e o beat sozinho.
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao, lerRoteiro } from '../lib/apresentacao.mjs';
import { montarTeleprompter } from '../lib/teleprompter.mjs';
import { escreverTexto } from '../lib/json.mjs';
import { reprovado } from '../lib/saida.mjs';

export default async function teleprompter(args) {
  const nome = nomeDaApresentacao(args);
  const c = abrirApresentacao(nome);
  const { telas, problemas } = lerRoteiro(c.roteiro);
  if (problemas.length) reprovado('ROTEIRO_INVALIDO', { problemas });
  if (!telas.length) reprovado('ROTEIRO_VAZIO', { pasta: c.rel('roteiro') });
  const titulo = typeof args.opcoes.titulo === 'string' ? args.opcoes.titulo : nome;
  escreverTexto(c.teleprompter, montarTeleprompter(telas, titulo));
  const beats = telas.reduce((s, t) => s + t.beats.length, 0);
  return {
    ok: true,
    codigo: 'TELEPROMPTER_PRONTO',
    arquivos: { teleprompter: c.rel('deck', 'teleprompter.html') },
    dados: { telas: telas.length, beats },
  };
}

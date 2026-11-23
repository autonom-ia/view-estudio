// Gera CLAUDE.md (de AGENTS.md) e .agents/skills/ (de .claude/skills/).
// --conferir: só confere e reprova (saída 2) se alguma cópia estiver diferente da fonte.
import { RAIZ } from '../lib/caminhos.mjs';
import { conferirEspelhos, gerarEspelhos } from '../lib/espelho.mjs';
import { reprovado } from '../lib/saida.mjs';

export default async function espelhar({ opcoes }) {
  const raiz = typeof process.env.ESTUDIO_RAIZ_ESPELHO === 'string' && process.env.ESTUDIO_RAIZ_ESPELHO ? process.env.ESTUDIO_RAIZ_ESPELHO : RAIZ;
  if (opcoes.conferir === true) {
    const r = conferirEspelhos(raiz);
    if (!r.ok) reprovado('ESPELHO_DIFERENTE', { diferencas: r.diferencas });
    return { ok: true, codigo: 'ESPELHO_OK', dados: { skills: r.skills } };
  }
  const feito = gerarEspelhos(raiz);
  const r = conferirEspelhos(raiz);
  if (!r.ok) reprovado('ESPELHO_DIFERENTE', { diferencas: r.diferencas });
  return { ok: true, codigo: 'ESPELHO_GERADO', dados: { ...feito, skills: r.skills } };
}

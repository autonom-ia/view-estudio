// Atualiza o estúdio para a versão nova, só se a VERSAO subiu. Preserva minha-marca/, apresentacoes/,
// referencias/, .ferramentas/, as permissões locais e as skills próprias em .claude/ e .agents/. --de <zip|endereço> usa outra origem
// (zip local exige o .sha256 ao lado; endereço só do repositório oficial).
import { RAIZ, FERR, relativoARaiz } from '../lib/caminhos.mjs';
import { atualizarEstudio, enderecoConfigurado } from '../lib/atualizacao.mjs';
import { aviso } from '../lib/saida.mjs';
import { progresso } from '../lib/executar.mjs';

export default async function atualizar({ opcoes }) {
  const origem = typeof opcoes.de === 'string' ? opcoes.de : enderecoConfigurado(RAIZ);
  progresso('Procurando a versão nova do estúdio. O seu trabalho e a sua marca ficam como estão.');
  const r = await atualizarEstudio({ raiz: RAIZ, ferr: FERR, origem });
  if (!r.atualizou) return { ok: true, codigo: 'JA_ATUALIZADO', dados: { de: r.de, para: r.para } };
  const avisos = r.dependencias ? [aviso('DEPENDENCIAS_MUDARAM', { quais: r.mudaram })] : [];
  return {
    ok: true,
    codigo: 'ESTUDIO_ATUALIZADO',
    avisos,
    dados: {
      de: r.de,
      para: r.para,
      copia_anterior: relativoARaiz(r.copia),
      dependencias_mudaram: r.dependencias,
      o_que_mudou: r.mudaram,
      guardados_na_copia: r.sumidos,
      skills_mantidas: r.recolocadas,
    },
  };
}

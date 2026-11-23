// Cena em vídeo: renderiza apresentacoes/<nome>/cenas/<composicao>/ com o HyperFrames (versão fixa)
// e grava deck/assets/<composicao>.mp4 (o vídeo anterior só é trocado depois de um render bom). --criar copia o molde da composição (não renderiza).
// --qualidade draft|standard|high (padrão standard).
import fs from 'node:fs';
import path from 'node:path';
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao } from '../lib/apresentacao.mjs';
import { KIT, nomeValido, sugerirNome, copiarPasta, existe, relativoARaiz } from '../lib/caminhos.mjs';
import { hyperframes, comoChamar, VERSAO_HYPERFRAMES, renderizarSemPerderOAnterior } from '../lib/hyperframes.mjs';
import { falha } from '../lib/saida.mjs';
import { progresso, ultimasLinhas } from '../lib/executar.mjs';

const QUALIDADES = ['draft', 'standard', 'high'];

export default async function cena(args) {
  const nome = nomeDaApresentacao(args);
  const c = abrirApresentacao(nome);
  const comp = args.posicionais[1] || (typeof args.opcoes.composicao === 'string' ? args.opcoes.composicao : '');
  if (!comp) falha('ARGUMENTO_FALTANDO', { argumento: '<composicao>' });
  if (!nomeValido(comp)) falha('NOME_INVALIDO', { valor: comp, sugestao: sugerirNome(comp) });
  const pasta = path.join(c.cenas, comp);

  if (args.opcoes.criar === true) {
    if (existe(pasta)) falha('CENA_JA_EXISTE', { pasta: relativoARaiz(pasta) });
    copiarPasta(path.join(KIT, 'molde-cena'), pasta);
    fs.copyFileSync(path.join(c.assets, 'vendor', 'gsap', 'gsap.min.js'), path.join(pasta, 'gsap.min.js'));
    if (existe(path.join(c.assets, 'marca'))) copiarPasta(path.join(c.assets, 'marca'), path.join(pasta, 'marca'));
    return { ok: true, codigo: 'CENA_CRIADA', arquivos: { composicao: relativoARaiz(path.join(pasta, 'index.html')) }, dados: { composicao: comp } };
  }

  if (!existe(path.join(pasta, 'index.html'))) falha('CENA_NAO_ACHADA', { pasta: relativoARaiz(pasta) });
  const qualidade = typeof args.opcoes.qualidade === 'string' ? args.opcoes.qualidade : 'standard';
  if (!QUALIDADES.includes(qualidade)) falha('ARGUMENTO_INVALIDO', { argumento: '--qualidade', valor: qualidade, opcoes: QUALIDADES });
  const chamada = comoChamar();
  if (!chamada) falha('HYPERFRAMES_FALTANDO', { versao: VERSAO_HYPERFRAMES });

  const saida = path.join(c.assets, `${comp}.mp4`);
  fs.mkdirSync(c.assets, { recursive: true });
  progresso(`Renderizando a cena ${comp} (HyperFrames ${VERSAO_HYPERFRAMES}, ${chamada.origem})...`);
  const r = await renderizarSemPerderOAnterior(saida, (temporario) =>
    hyperframes(['render', pasta, '--output', temporario, '--quality', qualidade, '--fps', '30', '--format', 'mp4', '--quiet'], { cwd: pasta }));
  if (!r.ok) {
    falha('RENDER_FALHOU', { detalhe: ultimasLinhas(`${r.saida || ''}\n${r.erro || ''}`, 12), video_anterior_mantido: fs.existsSync(saida) });
  }
  return {
    ok: true,
    codigo: 'CENA_PRONTA',
    arquivos: { video: relativoARaiz(saida) },
    dados: { composicao: comp, versao: VERSAO_HYPERFRAMES, origem: chamada.origem, megabytes: Math.round((fs.statSync(saida).size / 1048576) * 10) / 10 },
  };
}

// Mostra o antes e o depois lado a lado, só nas telas que mudaram, clique por clique, com as
// mudanças numeradas e o porquê de cada uma. Uso: ./estudio comparar <nome> [--sem-navegador].
// Precisa do "antes" rodado antes da mudança e de revisao/antes-depois/mudancas.json com
// {"pedido": "...", "mudancas": [{"titulo", "porque", "telas": [2]}]}.
// Reprova (saída 2) com menos de 2 mudanças ou com a apresentação igual à de antes; avisa com mais
// de 3. Recusa (ANTES_VIDEO_MUDOU) se um vídeo guardado no antes foi gravado por cima.
// A página é servida neste computador como o "abrir" serve o deck (mesmo servidor, outra pasta).
// Portado do Site Estúdio (comando "comparar").
import fs from 'node:fs';
import path from 'node:path';
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao, lerRoteiro } from '../lib/apresentacao.mjs';
import { FERR } from '../lib/caminhos.mjs';
import { lerJson, escreverTexto } from '../lib/json.mjs';
import { falha, reprovado, aviso } from '../lib/saida.mjs';
import { abrir as abrirNoSistema } from '../lib/abrir.mjs';
import { subirServidor } from './abrir.mjs';
import { fotografarDeck, telasMudadas, nomeDaFoto, paginaDeComparacao } from '../lib/comparacao.mjs';
import {
  caminhosDoAntesDepois,
  lerMudancas,
  igualAoAntes,
  pesadosAlterados,
  temAntes,
  MINIMO_DE_MUDANCAS,
  MAXIMO_DE_MUDANCAS,
} from '../lib/antes-depois.mjs';

// Grava as fotos dos cliques que mudaram, com o nome que a página usa.
function gravarFotos(pasta, telas) {
  fs.rmSync(pasta, { recursive: true, force: true });
  fs.mkdirSync(pasta, { recursive: true });
  for (const t of telas) {
    for (const c of t.cliques) {
      if (!c.mudou) continue;
      if (c.antes) fs.writeFileSync(path.join(pasta, nomeDaFoto('antes', t.arquivo, c.beat)), c.antes.jpeg);
      if (c.depois) fs.writeFileSync(path.join(pasta, nomeDaFoto('depois', t.arquivo, c.beat)), c.depois.jpeg);
    }
  }
}

export default async function comparar(args) {
  const nome = nomeDaApresentacao(args);
  const c = abrirApresentacao(nome);
  const ad = caminhosDoAntesDepois(c);
  const estado = lerJson(ad.estado, { aberto: false });
  if (!temAntes(ad)) {
    if (estado.aberto === false && typeof estado.escolha === 'string') reprovado('ANTES_JA_RESOLVIDO', { nome, escolha: estado.escolha });
    falha('ANTES_NAO_GUARDADO', { nome });
  }
  const { pedido, mudancas, ignoradas } = lerMudancas(lerJson(ad.mudancas, {}));
  if (mudancas.length < MINIMO_DE_MUDANCAS) {
    reprovado('POUCAS_MUDANCAS', { tem: mudancas.length, precisa: MINIMO_DE_MUDANCAS, arquivo: c.rel('revisao', 'antes-depois', 'mudancas.json') });
  }
  const manifesto = lerJson(ad.manifesto, { itens: [], pesados: [] });
  const alterados = pesadosAlterados(ad.antes, manifesto);
  if (alterados.length) falha('ANTES_VIDEO_MUDOU', { nome, arquivos: alterados });
  if (igualAoAntes(c.pasta, ad.antes, manifesto)) reprovado('NADA_MUDOU', { nome });

  const antes = await fotografarDeck(path.join(ad.antes, 'deck'), 'antes');
  const depois = await fotografarDeck(c.deck, 'depois');
  const telas = telasMudadas(antes, depois, lerRoteiro(path.join(ad.antes, 'roteiro')), lerRoteiro(c.roteiro));
  if (!telas.length) reprovado('NADA_MUDOU', { nome });

  const avisos = [];
  if (mudancas.length > MAXIMO_DE_MUDANCAS) avisos.push(aviso('MUDANCAS_DEMAIS', { tem: mudancas.length, maximo: MAXIMO_DE_MUDANCAS }));
  if (ignoradas) avisos.push(aviso('MUDANCA_SEM_TITULO', { ignoradas }));

  gravarFotos(ad.fotos, telas);
  escreverTexto(ad.pagina, paginaDeComparacao({ pedido, mudancas, telas }));
  const pastaEstado = path.join(FERR, 'servidores');
  fs.mkdirSync(pastaEstado, { recursive: true });
  const porta = await subirServidor(ad.pasta, path.join(pastaEstado, `comparar-${nome}.json`));
  const endereco = `http://127.0.0.1:${porta}/index.html`;
  if (args.opcoes['sem-navegador'] !== true) abrirNoSistema(endereco);
  return {
    ok: true,
    codigo: 'COMPARACAO_PRONTA',
    avisos,
    arquivos: { pagina: c.rel('revisao', 'antes-depois', 'index.html') },
    dados: {
      endereco,
      porta,
      pedido,
      mudancas: mudancas.map((m) => m.titulo),
      telas: telas.map((t) => ({ tela: t.numero, arquivo: t.arquivo, situacao: t.situacao, cliques_mudados: t.cliques.filter((k) => k.mudou).map((k) => k.beat) })),
    },
  };
}

// Cria apresentacoes/<nome>/ a partir de kit/molde/, com a marca de minha-marca/ (ou a de exemplo).
// Da marca vai só o que a tela usa (tokens.css, logo, fontes e licenças); marca.md e o resto ficam.
import fs from 'node:fs';
import path from 'node:path';
import { KIT, pastaApresentacoes, pastaMarca, copiarPasta, existe, relativoARaiz } from '../lib/caminhos.mjs';
import { nomeDaApresentacao } from '../lib/args.mjs';
import { caminhosDe } from '../lib/apresentacao.mjs';
import { falha, aviso } from '../lib/saida.mjs';
import { escaparHtml } from '../lib/teleprompter.mjs';
import { lerTexto, escreverTexto } from '../lib/json.mjs';
import { copiarMarca } from '../lib/marca.mjs';

export default async function nova(args) {
  const nome = nomeDaApresentacao(args);
  const titulo = typeof args.opcoes.titulo === 'string' && args.opcoes.titulo.trim() ? args.opcoes.titulo.trim() : nome;
  fs.mkdirSync(pastaApresentacoes(), { recursive: true });
  const c = caminhosDe(nome);
  if (existe(c.pasta)) falha('APRESENTACAO_JA_EXISTE', { nome, pasta: relativoARaiz(c.pasta) });

  copiarPasta(path.join(KIT, 'molde'), c.pasta);

  const avisos = [];
  const marcaUsuario = pastaMarca();
  const temMarca = existe(path.join(marcaUsuario, 'tokens.css'));
  const origemMarca = temMarca ? marcaUsuario : path.join(KIT, 'marca-exemplo');
  const marca = copiarMarca(origemMarca, path.join(c.assets, 'marca'));
  if (!temMarca) avisos.push(aviso('MARCA_DE_EXEMPLO', { pasta: relativoARaiz(marcaUsuario) }));

  // Reposição por função: o título vem da pessoa, e numa string de reposição "$&", "$'", "$`" e "$1"
  // seriam lidos como comandos do replace, não como texto.
  const tituloHtml = escaparHtml(titulo);
  escreverTexto(c.index, lerTexto(c.index).replaceAll('{{TITULO}}', () => tituloHtml));

  return {
    ok: true,
    codigo: 'APRESENTACAO_CRIADA',
    avisos,
    arquivos: { pasta: c.rel(), brief: c.rel('brief.md'), index: c.rel('deck', 'index.html'), roteiro: c.rel('roteiro') },
    dados: {
      nome,
      titulo,
      marca: temMarca ? 'minha-marca' : 'exemplo',
      marca_copiada: marca.copiados,
      marca_fora_do_deck: marca.deixados,
      telas_do_molde: 3,
    },
  };
}

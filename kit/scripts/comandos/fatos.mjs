// Fato com fonte: todo número de 3+ dígitos, palavra com @ e endereço tel:/mailto: que a plateia vê
// em alguma tela, em algum clique, ou ouve no roteiro, precisa estar na tabela de fatos do brief.md,
// numa linha com a fonte preenchida. O brief.md já é o lugar dos fatos no View (AGENTS.md, "Fato com
// fonte"): não existe um segundo arquivo. Portado do Site Estúdio (comando "fatos"), onde a tabela
// mora em fatos.md.
// Telas: lidas pelo DOM do Chrome em cada beat assentado (o que entra no clique 2 e sai no 4 só
// aparece no meio), juntando innerText, o content: do CSS e o href dos links. Sem regex.
// Roteiro: a "fala" de cada beat (é dita à plateia). A "nota" é só para quem apresenta e fica fora.
// RED (saída 2): achado sem fonte. RED fonte-de-exemplo: linha do brief.md que ainda tem a fonte do
// molde (negócio fictício). Data, nome próprio e citação ficam com o revisor de fatos (skill revisar).
// O texto dentro do vídeo de uma cena é imagem: quem confere é o revisor de fatos.
import fs from 'node:fs';
import path from 'node:path';
import { nomeDaApresentacao } from '../lib/args.mjs';
import { abrirApresentacao, lerRoteiro } from '../lib/apresentacao.mjs';
import { abrirSessao, telasDoIndex } from '../lib/sessao.mjs';
import { ESPERAR_PRONTA, ASSENTAR, TEXTO_PARA_FATOS } from '../lib/pagina.mjs';
import { lerTabelaDeFatos, montarLastro, conferirTexto } from '../lib/fatos.mjs';
import { lerTexto } from '../lib/json.mjs';
import { progresso } from '../lib/executar.mjs';

// O texto de uma tela em todos os beats, junto (cada beat acrescenta o que estava visível nele).
async function textoDaTela(sessao, url) {
  await sessao.ir(url);
  const pronta = await sessao.tab.evaluate(ESPERAR_PRONTA);
  const ultimo = pronta.contrato ? pronta.last : 0;
  const textos = [];
  const enderecos = new Set();
  for (let n = 0; n <= ultimo; n += 1) {
    await sessao.tab.evaluate(ASSENTAR(n));
    const lido = await sessao.tab.evaluate(TEXTO_PARA_FATOS);
    textos.push(lido.texto);
    for (const e of lido.enderecos) enderecos.add(e);
  }
  return { texto: textos.join('\n'), enderecos: [...enderecos], beats: ultimo + 1 };
}

function lerTabela(c) {
  if (!fs.existsSync(c.brief)) return { temTabela: false, linhas: [] };
  const linhas = lerTabelaDeFatos(lerTexto(c.brief));
  // a tabela vazia do molde ("|  |  |  |") não tem linha: conta como sem tabela preenchida
  return { temTabela: linhas.length > 0, linhas };
}

export default async function fatos(args) {
  const nome = nomeDaApresentacao(args);
  const c = abrirApresentacao(nome);
  const { temTabela, linhas } = lerTabela(c);
  const lastro = montarLastro(linhas);
  const vermelhos = [];
  for (const l of linhas) {
    if (l.exemplo) vermelhos.push({ tela: 'brief.md', tipo: 'fonte-de-exemplo', trecho: l.fato, motivo: 'fonte-de-exemplo' });
  }
  let conferidos = 0;
  const telasLidas = [];
  const sessao = await abrirSessao(c.deck);
  try {
    const telas = (await telasDoIndex(sessao)).filter((t) => t.rel && fs.existsSync(path.join(c.deck, ...t.rel.split('/'))));
    for (const t of telas) {
      progresso(`Conferindo os fatos de ${t.arquivo}...`);
      const lido = await textoDaTela(sessao, t.url);
      const r = conferirTexto(lido, lastro);
      conferidos += r.conferidos;
      for (const f of r.faltam) vermelhos.push({ tela: t.arquivo, ...f });
      telasLidas.push({ tela: t.arquivo, beats: lido.beats });
    }
  } finally {
    await sessao.fechar();
  }

  const roteiro = lerRoteiro(c.roteiro);
  for (const t of roteiro.telas) {
    t.beats.forEach((b, k) => {
      const r = conferirTexto({ texto: b.fala }, lastro);
      conferidos += r.conferidos;
      for (const f of r.faltam) vermelhos.push({ tela: `roteiro/${t.arquivo}`, beat: k, ...f });
    });
  }

  const aprovado = vermelhos.length === 0;
  const avisos = [];
  if (!temTabela) avisos.push({ codigo: 'FATOS_SEM_TABELA', dados: { arquivo: c.rel('brief.md') } });
  return {
    ok: aprovado,
    codigo: aprovado ? 'FATOS_OK' : 'FATOS_SEM_FONTE',
    sair: aprovado ? 0 : 2,
    avisos,
    arquivos: { brief: c.rel('brief.md') },
    dados: {
      conferidos,
      telas: telasLidas.length,
      beats: telasLidas.reduce((s, t) => s + t.beats, 0),
      falas: roteiro.telas.reduce((s, t) => s + t.beats.length, 0),
      linhas_com_fonte: linhas.filter((l) => l.comFonte).length,
      linhas_sem_fonte: linhas.filter((l) => !l.comFonte && !l.exemplo).length,
      linhas_do_exemplo: linhas.filter((l) => l.exemplo).length,
      red: vermelhos.length,
      vermelhos,
    },
  };
}

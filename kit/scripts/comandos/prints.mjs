// Fotografa cada tela em cada beat, já assentado (sem animação no meio), em prints/<tela>-b<N>.jpg.
// Avisa quando um quadro sai quase todo de uma cor só (tela lisa: algo não carregou).
import fs from 'node:fs';
import path from 'node:path';
import { nomeDaApresentacao, inteiro } from '../lib/args.mjs';
import { abrirApresentacao } from '../lib/apresentacao.mjs';
import { abrirSessao, telasDoIndex, LARGURA, ALTURA } from '../lib/sessao.mjs';
import { ESPERAR_PRONTA, ASSENTAR } from '../lib/pagina.mjs';
import { decodePng, frameStats } from '../lib/png.mjs';
import { progresso } from '../lib/executar.mjs';
import { falha, aviso } from '../lib/saida.mjs';
import { relativoARaiz } from '../lib/caminhos.mjs';

const LIMITE_TELA_LISA = 0.985;
const ESCALA_AMOSTRA = 0.125;

async function fotografar(tab, qualidade) {
  const r = await tab.send('Page.captureScreenshot', { format: 'jpeg', quality: qualidade, fromSurface: true });
  return Buffer.from(r.data, 'base64');
}

async function telaLisa(tab) {
  const r = await tab.send('Page.captureScreenshot', {
    format: 'png',
    fromSurface: true,
    clip: { x: 0, y: 0, width: LARGURA, height: ALTURA, scale: ESCALA_AMOSTRA },
  });
  return frameStats(decodePng(Buffer.from(r.data, 'base64')));
}

export default async function prints(args) {
  const nome = nomeDaApresentacao(args);
  const qualidade = inteiro(args.opcoes, 'qualidade', 86, 40, 100);
  const c = abrirApresentacao(nome);
  fs.mkdirSync(c.prints, { recursive: true });
  for (const n of fs.readdirSync(c.prints)) if (n.toLowerCase().endsWith('.jpg')) fs.rmSync(path.join(c.prints, n));

  const fotos = [];
  const avisos = [];
  const sessao = await abrirSessao(c.deck);
  try {
    const telas = (await telasDoIndex(sessao)).filter((t) => t.rel);
    if (!telas.length) falha('DECK_SEM_TELAS', {});
    for (const t of telas) {
      const base = t.arquivo.toLowerCase().endsWith('.html') ? t.arquivo.slice(0, -5) : t.arquivo;
      progresso(`Fotografando ${t.arquivo}...`);
      await sessao.ir(t.url);
      const pronta = await sessao.tab.evaluate(ESPERAR_PRONTA);
      const ultimo = pronta.contrato ? pronta.last : 0;
      for (let b = 0; b <= ultimo; b += 1) {
        await sessao.tab.evaluate(ASSENTAR(b));
        const arquivo = path.join(c.prints, `${base}-b${b}.jpg`);
        fs.writeFileSync(arquivo, await fotografar(sessao.tab, qualidade));
        const stats = await telaLisa(sessao.tab);
        if (stats.uniforme >= LIMITE_TELA_LISA) avisos.push(aviso('TELA_LISA', { arquivo: relativoARaiz(arquivo), cor: stats.dom }));
        fotos.push({ tela: t.arquivo, beat: b, arquivo: relativoARaiz(arquivo) });
      }
    }
  } finally {
    await sessao.fechar();
  }
  return {
    ok: true,
    codigo: 'PRINTS_PRONTOS',
    avisos,
    arquivos: { pasta: c.rel('prints') },
    dados: { total: fotos.length, fotos, tamanho: `${LARGURA}x${ALTURA}` },
  };
}

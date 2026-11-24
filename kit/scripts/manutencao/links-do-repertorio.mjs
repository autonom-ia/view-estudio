#!/usr/bin/env node
// Conferência de rede do repertório, para quem mantém o estúdio (não faz parte do npm test, porque
// depende da internet): "node kit/scripts/manutencao/links-do-repertorio.mjs".
// Abre o link de cada ficha e lista os que não respondem normalmente, separando o site que recusa
// leitor automático (bloqueio ou tela de verificação: o site está no ar) do site fora do ar.
// Sai com 1 só quando algum link está fora do ar.
// Portado do Site Estúdio (kit/scripts/manutencao/links-do-repertorio.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PASTA = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'repertorio');
const PRAZO_MS = 15000;
const AO_MESMO_TEMPO = 8;
// 202 com tela de verificação, 401/403 de bloqueio, 405 de método recusado, 429 de excesso.
const RECUSA_LEITOR = [202, 401, 403, 405, 429];
const FORA_DO_AR = [404, 410];
// Erros de rede que dizem que o endereço não existe mais (domínio sem dono ou recusado).
const ERROS_FORA_DO_AR = ['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'CERT_HAS_EXPIRED'];

export function classificar({ status, erro }) {
  if (erro) return ERROS_FORA_DO_AR.includes(erro) ? 'fora-do-ar' : 'sem-resposta';
  if (RECUSA_LEITOR.includes(status)) return 'recusa-leitor';
  if (FORA_DO_AR.includes(status)) return 'fora-do-ar';
  if (status >= 200 && status < 400) return 'no-ar';
  return 'erro-do-site';
}

export function linksDoRepertorio(pasta = PASTA) {
  return fs.readdirSync(pasta).filter((n) => n.endsWith('.json')).sort().flatMap((n) => {
    const dados = JSON.parse(fs.readFileSync(path.join(pasta, n), 'utf8'));
    return dados.fichas.map((f) => ({ acao: dados.acao, id: f.id, link: f.link }));
  });
}

async function conferir({ link }) {
  try {
    const r = await fetch(link, { redirect: 'follow', signal: AbortSignal.timeout(PRAZO_MS), headers: { accept: 'text/html' } });
    await r.body?.cancel();
    return { status: r.status };
  } catch (e) {
    return { erro: e.cause?.code || e.name || 'erro' };
  }
}

async function principal() {
  const links = linksDoRepertorio();
  const resultados = [];
  for (let i = 0; i < links.length; i += AO_MESMO_TEMPO) {
    const lote = links.slice(i, i + AO_MESMO_TEMPO);
    const respostas = await Promise.all(lote.map(conferir));
    lote.forEach((l, j) => resultados.push({ ...l, ...respostas[j], situacao: classificar(respostas[j]) }));
  }
  const fora = resultados.filter((r) => r.situacao !== 'no-ar');
  for (const r of fora) console.log(`${r.situacao}\t${r.status || r.erro}\t${r.acao}/${r.id}\t${r.link}`);
  console.log(`${resultados.length - fora.length} de ${resultados.length} no ar e legíveis por leitor automático.`);
  process.exitCode = fora.some((r) => r.situacao === 'fora-do-ar') ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) principal();

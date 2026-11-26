// Uma apresentação: apresentacoes/<nome>/ com brief.md, roteiro/, deck/, prints/ e <nome>.pdf.
import fs from 'node:fs';
import path from 'node:path';
import { pastaApresentacoes, relativoARaiz, ehPasta } from './caminhos.mjs';
import { avisarNaSaida, falha } from './saida.mjs';
import { caminhosDoAntesDepois, recuperarComparacao, recuperarSobras } from './antes-depois.mjs';
import { lerTexto } from './json.mjs';

export function caminhosDe(nome, base = pastaApresentacoes()) {
  const pasta = path.join(base, nome);
  return {
    nome,
    pasta,
    brief: path.join(pasta, 'brief.md'),
    roteiro: path.join(pasta, 'roteiro'),
    deck: path.join(pasta, 'deck'),
    index: path.join(pasta, 'deck', 'index.html'),
    slides: path.join(pasta, 'deck', 'slides'),
    assets: path.join(pasta, 'deck', 'assets'),
    cenas: path.join(pasta, 'cenas'),
    prints: path.join(pasta, 'prints'),
    revisao: path.join(pasta, 'revisao'),
    pdf: path.join(pasta, `${nome}.pdf`),
    teleprompter: path.join(pasta, 'deck', 'teleprompter.html'),
    rel: (...partes) => relativoARaiz(path.join(pasta, ...partes)),
  };
}

// Abre uma apresentação existente com deck/index.html. Antes, põe de volta no lugar o que uma troca
// do "escolher" ou do "antes" parada no meio deixou fora (lib/antes-depois.mjs, recuperarSobras e
// recuperarComparacao), com um aviso.
export function abrirApresentacao(nome) {
  const c = caminhosDe(nome);
  if (!ehPasta(c.pasta)) falha('APRESENTACAO_NAO_ACHADA', { nome, pasta: relativoARaiz(c.pasta) });
  const comparacao = recuperarComparacao(caminhosDoAntesDepois(c)) ? ['revisao/antes-depois'] : [];
  const voltaram = [...recuperarSobras(c.pasta), ...comparacao];
  if (voltaram.length) avisarNaSaida('APRESENTACAO_POSTA_DE_VOLTA', { nome, itens: voltaram });
  if (!fs.existsSync(c.index)) falha('DECK_SEM_INDEX', { arquivo: c.rel('deck', 'index.html') });
  return c;
}

// 1º número do nome do arquivo: s01-capa.html → 1; S12.json → 12. Sem número → null.
export function numeroDoNome(nome) {
  let digitos = '';
  for (const ch of String(nome)) {
    if (ch >= '0' && ch <= '9') digitos += ch;
    else if (digitos) break;
  }
  return digitos ? Number(digitos) : null;
}

// Arquivo de roteiro: S + dígitos + .json (S01.json, s7.json).
export function ehArquivoDeRoteiro(nome) {
  if (nome.length < 7) return false;
  const primeira = nome[0];
  if (primeira !== 'S' && primeira !== 's') return false;
  if (!nome.toLowerCase().endsWith('.json')) return false;
  const meio = nome.slice(1, -5);
  if (!meio) return false;
  for (const ch of meio) if (ch < '0' || ch > '9') return false;
  return true;
}

// Lê roteiro/SNN.json. Devolve { telas, problemas }. Cada tela: {tela, titulo, beats:[{rotulo, fala, nota}]}.
export function lerRoteiro(pasta) {
  const problemas = [];
  const telas = [];
  if (!ehPasta(pasta)) return { telas, problemas: [{ arquivo: 'roteiro/', problema: 'pasta ausente' }] };
  const nomes = fs.readdirSync(pasta).filter(ehArquivoDeRoteiro).sort();
  for (const nome of nomes) {
    let doc;
    try {
      doc = JSON.parse(lerTexto(path.join(pasta, nome)));
    } catch (e) {
      problemas.push({ arquivo: nome, problema: `JSON inválido: ${e.message}` });
      continue;
    }
    const tela = Number.isInteger(doc.tela) ? doc.tela : numeroDoNome(nome);
    if (!Number.isInteger(tela)) {
      problemas.push({ arquivo: nome, problema: 'sem número de tela' });
      continue;
    }
    if (!Array.isArray(doc.beats) || doc.beats.length === 0) {
      problemas.push({ arquivo: nome, problema: 'sem beats' });
      continue;
    }
    const beats = [];
    doc.beats.forEach((b, k) => {
      if (!b || typeof b.fala !== 'string' || !b.fala.trim()) problemas.push({ arquivo: nome, problema: `beat ${k} sem fala` });
      beats.push({
        rotulo: String((b && b.rotulo) || ''),
        fala: String((b && b.fala) || ''),
        nota: b && b.nota != null ? String(b.nota) : '',
      });
    });
    telas.push({ tela, titulo: String(doc.titulo || ''), beats, arquivo: nome });
  }
  telas.sort((a, b) => a.tela - b.tela);
  for (let k = 1; k < telas.length; k += 1) {
    if (telas[k].tela === telas[k - 1].tela) problemas.push({ arquivo: telas[k].arquivo, problema: `tela ${telas[k].tela} repetida` });
  }
  return { telas, problemas };
}

// Conferência das letras de uma apresentação (ou de uma marca): cada família com a licença dela, com
// o nome dela (OFL-<Família>.txt), e o peso total. Portado do Site Estúdio (kit/scripts/lib/letras.mjs).
// Lição do piloto de lá: duas licenças "OFL.txt" na mesma pasta se sobrescrevem, e fonte em .ttf sem
// recorte pesa à toa.
import fs from 'node:fs';
import path from 'node:path';
import { listarArquivos } from './caminhos.mjs';
import { EXTENSOES_DE_FONTE, ehLicencaDeFonte } from './marca.mjs';

// Acima disso há letra sobrando (alfabeto inteiro, .ttf, pesos que a tela não usa): recorte com
// "./estudio fonte" (só o alfabeto latino). No Site o teto é 100 KB porque a página abre no celular
// pela rede; a apresentação abre no computador, então o teto aqui é o de duas famílias variáveis
// recortadas (cerca de 150 KB) com folga. Só avisa: não reprova.
export const LIMITE_LETRAS_KB = 300;

const ehLetraOuNumero = (ch) => (ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9');
const chave = (texto) => [...String(texto).toLowerCase()].filter(ehLetraOuNumero).join('');

export const ehArquivoDeLetra = (nome) => EXTENSOES_DE_FONTE.some((ext) => nome.toLowerCase().endsWith(ext));

// "BigShouldersDisplay-latin.woff2" → "bigshouldersdisplay"; "Figtree.ttf" → "figtree";
// "Inter[opsz,wght].ttf" (nome do repositório oficial) → "inter". A família vai até o primeiro
// hífen, colchete ou ponto.
export function familiaDoArquivo(nome) {
  let fim = nome.length;
  for (const marca of ['-', '[', '.']) {
    const k = nome.indexOf(marca);
    if (k > 0 && k < fim) fim = k;
  }
  return chave(nome.slice(0, fim));
}

// "OFL-BigShouldersDisplay.txt" → "bigshouldersdisplay"; "OFL.txt" → "" (licença sem nome próprio).
export function familiaDaLicenca(nome) {
  const semTxt = nome.toLowerCase().endsWith('.txt') ? nome.slice(0, -4) : nome;
  const hifen = semTxt.indexOf('-');
  return hifen === -1 ? '' : chave(semTxt.slice(hifen + 1));
}

// Família e licença por igualdade exata: OFL-RobotoMono.txt não cobre Roboto, nem OFL-Inter.txt
// cobre InterTight (prefixo deixava uma família passar com a licença de outra).
const casa = (familia, licenca) => Boolean(licenca) && familia === licenca;

// Lê todas as letras dentro de "raiz" (recursivo). Licença vale para as letras da mesma pasta.
// Licença sem nome próprio (OFL.txt) só vale quando a pasta tem uma família só.
export function conferirLetras(raiz) {
  const porPasta = new Map();
  for (const rel of listarArquivos(raiz)) {
    const partes = rel.split('/');
    const nome = partes[partes.length - 1];
    const pasta = partes.slice(0, -1).join('/');
    if (!porPasta.has(pasta)) porPasta.set(pasta, { fontes: [], licencas: [] });
    if (ehArquivoDeLetra(nome)) porPasta.get(pasta).fontes.push(rel);
    else if (ehLicencaDeFonte(nome)) porPasta.get(pasta).licencas.push(familiaDaLicenca(nome));
  }
  const fontes = [];
  const semLicenca = [];
  for (const [pasta, { fontes: lista, licencas }] of porPasta) {
    if (!lista.length) continue;
    const familias = new Set(lista.map((rel) => familiaDoArquivo(rel.split('/').pop())));
    const generica = licencas.includes('') && familias.size === 1;
    for (const familia of familias) {
      if (generica || licencas.some((l) => casa(familia, l))) continue;
      semLicenca.push({ pasta: pasta || '.', familia, arquivos: lista.filter((rel) => familiaDoArquivo(rel.split('/').pop()) === familia) });
    }
    for (const rel of lista) {
      const bytes = fs.statSync(path.join(raiz, ...rel.split('/'))).size;
      fontes.push({ rel, bytes, leve: rel.toLowerCase().endsWith('.woff2') });
    }
  }
  const bytes = fontes.reduce((s, f) => s + f.bytes, 0);
  return { fontes, bytes, kb: Math.round(bytes / 102.4) / 10, semLicenca, pesadas: fontes.filter((f) => !f.leve).map((f) => f.rel) };
}

// Para o checar: RED fonte-sem-licenca; WARN fonte-pesada (.ttf/.otf/.woff, ou soma acima do limite).
// "raiz" é a pasta deck/ da apresentação.
export function anotarLetras(raiz, red, warn) {
  const r = conferirLetras(raiz);
  for (const s of r.semLicenca) {
    red.push({ tela: 'letras', tipo: 'fonte-sem-licenca', detalhe: `deck/${s.pasta}: ${s.arquivos.join(', ')} sem a licença com o nome da família (ex.: OFL-<Família>.txt)` });
  }
  for (const rel of r.pesadas) warn.push({ tela: 'letras', tipo: 'fonte-pesada', detalhe: `deck/${rel} não é .woff2 (recorte e alivie com ./estudio fonte)` });
  if (r.kb > LIMITE_LETRAS_KB) warn.push({ tela: 'letras', tipo: 'fonte-pesada', detalhe: `as letras somam ${r.kb} KB (acima de ${LIMITE_LETRAS_KB} KB tem letra sobrando)` });
  return r;
}

// A marca que vai para dentro de uma apresentação: só o que a tela usa. tokens.css, as fontes (com
// a licença de cada uma) e o logo. O resto de minha-marca/ (marca.md com tom e notas internas,
// arquivos-fonte do logo, rascunhos) fica fora do deck, porque o deck é o que se entrega e se mostra.
// Portado do Site Estúdio (kit/scripts/lib/marca.mjs), mesma regra.
import fs from 'node:fs';
import path from 'node:path';

export const ARQUIVOS_DA_MARCA = Object.freeze(['tokens.css']);
export const EXTENSOES_DE_LOGO = Object.freeze(['.svg', '.png', '.webp', '.jpg', '.jpeg', '.avif']);
export const EXTENSOES_DE_FONTE = Object.freeze(['.woff2', '.woff', '.ttf', '.otf']);

// Licença de fonte: OFL-Fraunces.txt, OFL.txt, LICENSE.txt, LICENCA.txt.
export function ehLicencaDeFonte(nome) {
  const baixo = nome.toLowerCase();
  if (!baixo.endsWith('.txt')) return false;
  return baixo.startsWith('ofl') || baixo.startsWith('licen');
}

export function ehArquivoDeFonte(nome) {
  const baixo = nome.toLowerCase();
  return EXTENSOES_DE_FONTE.some((ext) => baixo.endsWith(ext)) || ehLicencaDeFonte(nome);
}

// logo.svg, logo.png, Logo.webp…: "logo" + uma extensão de imagem.
export function ehLogo(nome) {
  const ext = path.extname(nome).toLowerCase();
  return path.basename(nome, path.extname(nome)).toLowerCase() === 'logo' && EXTENSOES_DE_LOGO.includes(ext);
}

const ehArquivoComum = (c) => {
  const info = fs.lstatSync(c);
  return info.isFile() && !info.isSymbolicLink();
};

// Copia a marca de origem para destino (deck/assets/marca/). Devolve o que copiou e o que deixou fora.
// Link simbólico nunca é seguido: fica de fora.
export function copiarMarca(origem, destino) {
  const copiados = [];
  const deixados = [];
  fs.mkdirSync(destino, { recursive: true });
  for (const nome of fs.readdirSync(origem).sort()) {
    if (nome === '.DS_Store' || nome === 'Thumbs.db') continue;
    const de = path.join(origem, nome);
    const info = fs.lstatSync(de);
    if (info.isDirectory()) {
      if (nome !== 'fontes') {
        deixados.push(`${nome}/`);
        continue;
      }
      for (const fonte of fs.readdirSync(de).sort()) {
        if (fonte === '.DS_Store' || fonte === 'Thumbs.db') continue;
        const arq = path.join(de, fonte);
        if (ehArquivoComum(arq) && ehArquivoDeFonte(fonte)) {
          fs.mkdirSync(path.join(destino, 'fontes'), { recursive: true });
          fs.copyFileSync(arq, path.join(destino, 'fontes', fonte));
          copiados.push(`fontes/${fonte}`);
        } else deixados.push(`fontes/${fonte}`);
      }
      continue;
    }
    if (info.isFile() && (ARQUIVOS_DA_MARCA.includes(nome) || ehLogo(nome))) {
      fs.copyFileSync(de, path.join(destino, nome));
      copiados.push(nome);
    } else deixados.push(nome);
  }
  return { copiados, deixados };
}

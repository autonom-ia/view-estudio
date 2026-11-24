// Baixa uma foto pública para a pasta de coleta e lê a largura e a altura dela pelo cabeçalho do
// arquivo (JPEG, PNG ou WebP), sem programa de imagem.
import fs from 'node:fs';
import path from 'node:path';

const TETO_BYTES = 20 * 1024 * 1024;
const TETO_MS = 30000;
const AGENTE = 'Mozilla/5.0 (View Estudio)';

export async function baixar(url, destino, { tetoMs = TETO_MS } = {}) {
  const r = await fetch(url, { headers: { 'User-Agent': AGENTE }, signal: AbortSignal.timeout(tetoMs) });
  if (!r.ok) throw new Error(`a foto não veio (${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (buf.length > TETO_BYTES) throw new Error('a foto é grande demais');
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  fs.writeFileSync(destino, buf);
  return { bytes: buf.length, ...dimensoes(buf) };
}

// { largura, altura } de JPEG, PNG ou WebP; { largura: 0, altura: 0 } se não reconhecer.
export function dimensoes(buf) {
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50) return { largura: buf.readUInt32BE(16), altura: buf.readUInt32BE(20) };
  if (buf.length > 30 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return dimensoesWebp(buf);
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) return dimensoesJpeg(buf);
  return { largura: 0, altura: 0 };
}

const MARCAS_SOF = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

function dimensoesJpeg(buf) {
  let p = 2;
  while (p + 9 < buf.length) {
    if (buf[p] !== 0xff) return { largura: 0, altura: 0 };
    const marca = buf[p + 1];
    const tamanho = buf.readUInt16BE(p + 2);
    if (MARCAS_SOF.has(marca)) return { altura: buf.readUInt16BE(p + 5), largura: buf.readUInt16BE(p + 7) };
    p += 2 + tamanho;
  }
  return { largura: 0, altura: 0 };
}

function dimensoesWebp(buf) {
  const tipo = buf.toString('ascii', 12, 16);
  if (tipo === 'VP8X') return { largura: 1 + buf.readUIntLE(24, 3), altura: 1 + buf.readUIntLE(27, 3) };
  if (tipo === 'VP8 ') return { largura: buf.readUInt16LE(26) & 0x3fff, altura: buf.readUInt16LE(28) & 0x3fff };
  if (tipo === 'VP8L') {
    const b = buf.readUInt32LE(21);
    return { largura: (b & 0x3fff) + 1, altura: ((b >> 14) & 0x3fff) + 1 };
  }
  return { largura: 0, altura: 0 };
}

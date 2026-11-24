// Baixa uma foto pública para a pasta de coleta e lê a largura e a altura dela pelo cabeçalho do
// arquivo (JPEG, PNG ou WebP), sem programa de imagem. Só http e https; nunca endereço interno do
// computador ou da rede de casa (127.x, 10.x, 172.16 a 31.x, 192.168.x, ::1, localhost), nem por
// redirecionamento nem pelo nome. Lê aos pedaços e para ao passar do teto de tamanho.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import dns from 'node:dns/promises';

const TETO_BYTES = 20 * 1024 * 1024;
const TETO_MS = 30000;
const MAXIMO_DE_REDIRECIONAMENTOS = 5;
const AGENTE = 'Mozilla/5.0 (View Estudio)';

function ipv4Interno(ip) {
  const [a, b] = ip.split('.').map(Number);
  return a === 127 || a === 10 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

// "::ffff:7f00:1" (como o URL escreve ::ffff:127.0.0.1) → "127.0.0.1".
function ipv4DoMapeado(resto) {
  if (net.isIPv4(resto)) return resto;
  const grupos = resto.split(':');
  if (grupos.length !== 2) return '';
  const [alto, baixo] = grupos.map((g) => Number.parseInt(g, 16));
  if (!Number.isInteger(alto) || !Number.isInteger(baixo)) return '';
  return [alto >> 8, alto & 0xff, baixo >> 8, baixo & 0xff].join('.');
}

// Endereço do próprio computador ou da rede interna? host como vem em URL.hostname.
export function ehEnderecoInterno(host) {
  let h = String(host || '').toLowerCase();
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1);
  if (h.endsWith('.')) h = h.slice(0, -1);
  if (h === 'localhost' || h.endsWith('.localhost')) return true;
  if (net.isIPv4(h)) return ipv4Interno(h);
  if (!net.isIPv6(h)) return false;
  if (h === '::1' || h === '::') return true;
  if (h.startsWith('::ffff:')) {
    const ip = ipv4DoMapeado(h.slice('::ffff:'.length));
    return !ip || ipv4Interno(ip);
  }
  return h.startsWith('fc') || h.startsWith('fd') || ['fe8', 'fe9', 'fea', 'feb'].some((ini) => h.startsWith(ini));
}

async function conferirEndereco(url, permitirEnderecoLocal) {
  const u = new URL(url);
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('a foto não está num endereço da internet (http ou https)');
  if (permitirEnderecoLocal) return;
  if (ehEnderecoInterno(u.hostname)) throw new Error('a foto aponta para um endereço interno e não foi baixada');
  if (net.isIP(u.hostname)) return;
  const enderecos = await dns.lookup(u.hostname, { all: true });
  if (enderecos.some((e) => ehEnderecoInterno(e.address))) throw new Error('a foto aponta para um endereço interno e não foi baixada');
}

async function lerComTeto(corpo, tetoBytes) {
  if (!corpo) return Buffer.alloc(0);
  const leitor = corpo.getReader();
  const partes = [];
  let total = 0;
  for (;;) {
    const { done, value } = await leitor.read();
    if (done) break;
    total += value.length;
    if (total > tetoBytes) {
      await leitor.cancel().catch(() => {});
      throw new Error('a foto é grande demais');
    }
    partes.push(value);
  }
  return Buffer.concat(partes);
}

// opcoes: tetoMs, tetoBytes e permitirEnderecoLocal (só os testes, que servem fotos em 127.0.0.1).
export async function baixar(url, destino, { tetoMs = TETO_MS, tetoBytes = TETO_BYTES, permitirEnderecoLocal = false } = {}) {
  const sinal = AbortSignal.timeout(tetoMs);
  let atual = url;
  for (let i = 0; i <= MAXIMO_DE_REDIRECIONAMENTOS; i += 1) {
    await conferirEndereco(atual, permitirEnderecoLocal);
    const r = await fetch(atual, { headers: { 'User-Agent': AGENTE }, redirect: 'manual', signal: sinal });
    const destinoDoDesvio = r.headers.get('location');
    if (r.status >= 300 && r.status < 400 && destinoDoDesvio) {
      await r.body?.cancel().catch(() => {});
      atual = new URL(destinoDoDesvio, atual).href;
      continue;
    }
    if (!r.ok) {
      await r.body?.cancel().catch(() => {});
      throw new Error(`a foto não veio (${r.status})`);
    }
    if (Number(r.headers.get('content-length')) > tetoBytes) {
      await r.body?.cancel().catch(() => {});
      throw new Error('a foto é grande demais');
    }
    const buf = await lerComTeto(r.body, tetoBytes);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, buf);
    return { bytes: buf.length, ...dimensoes(buf) };
  }
  throw new Error('a foto passou por redirecionamentos demais');
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

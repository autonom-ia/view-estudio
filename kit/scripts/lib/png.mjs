// Decodificador PNG mínimo (8 bit, RGB/RGBA, não entrelaçado) e medidas de um quadro.
// Usado pelo "prints" para avisar de tela lisa (quadro quase todo de uma cor só).
import { inflateSync } from 'node:zlib';

export function decodePng(buf) {
  let p = 8;
  let w;
  let h;
  let ct;
  let bd;
  const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const data = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bd = data[8];
      ct = data[9];
    } else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  if (bd !== 8 || (ct !== 2 && ct !== 6)) throw new Error(`png não suportado (cor ${ct}, ${bd} bits)`);
  const bpp = ct === 6 ? 4 : 3;
  const stride = w * bpp;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride);
  for (let y = 0; y < h; y += 1) {
    const f = raw[y * (stride + 1)];
    const line = Buffer.from(raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= bpp ? line[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c;
        const pa = Math.abs(pp - a);
        const pb = Math.abs(pp - b);
        const pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      line[x] = v & 255;
    }
    for (let x = 0; x < w; x += 1) {
      const s = x * bpp;
      const d = (y * w + x) * 4;
      out[d] = line[s];
      out[d + 1] = line[s + 1];
      out[d + 2] = line[s + 2];
      out[d + 3] = bpp === 4 ? line[s + 3] : 255;
    }
    prev = line;
  }
  return { w, h, px: out };
}

// Cor dominante (quantizada) e fração dos pixels próximos dela (0..1).
export function frameStats({ w, h, px }) {
  const hist = new Map();
  for (let i = 0; i < w * h; i += 1) {
    const k = ((px[i * 4] >> 3) << 10) | ((px[i * 4 + 1] >> 3) << 5) | (px[i * 4 + 2] >> 3);
    hist.set(k, (hist.get(k) || 0) + 1);
  }
  let best = 0;
  let bk = 0;
  for (const [k, n] of hist) {
    if (n > best) {
      best = n;
      bk = k;
    }
  }
  const dom = [((bk >> 10) & 31) * 8 + 4, ((bk >> 5) & 31) * 8 + 4, (bk & 31) * 8 + 4];
  let near = 0;
  for (let i = 0; i < w * h; i += 1) {
    const d = Math.abs(px[i * 4] - dom[0]) + Math.abs(px[i * 4 + 1] - dom[1]) + Math.abs(px[i * 4 + 2] - dom[2]);
    if (d < 24) near += 1;
  }
  const hex = dom.map((v) => Math.min(255, v).toString(16).padStart(2, '0')).join('');
  return { dom: `#${hex}`, uniforme: near / (w * h) };
}

// Escreve um arquivo .zip em JavaScript puro (zlib do Node), sem programa externo.
// Cada entrada: { nome: 'pasta/arquivo.ext', dados: Buffer, data: Date, guardar?: true }. Nomes em UTF-8.
// Portado do Site Estúdio (lib/zip.mjs), com { guardar: true } para vídeo e áudio: já vêm
// comprimidos, e comprimir de novo só gasta tempo.
import zlib from 'node:zlib';

const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) c = TABELA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dataDos(d) {
  const ano = Math.max(1980, d.getFullYear());
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  const dia = ((ano - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  return { hora, dia };
}

export function montarZip(entradas) {
  const partes = [];
  const central = [];
  let posicao = 0;
  for (const e of entradas) {
    const nome = Buffer.from(e.nome, 'utf8');
    const dados = Buffer.isBuffer(e.dados) ? e.dados : Buffer.from(e.dados);
    const comprimido = e.guardar ? null : zlib.deflateRawSync(dados, { level: 9 });
    const guardar = !comprimido || comprimido.length >= dados.length;
    const corpo = guardar ? dados : comprimido;
    const metodo = guardar ? 0 : 8;
    const crc = crc32(dados);
    const { hora, dia } = dataDos(e.data || new Date());
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(hora, 10);
    local.writeUInt16LE(dia, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(corpo.length, 18);
    local.writeUInt32LE(dados.length, 22);
    local.writeUInt16LE(nome.length, 26);
    local.writeUInt16LE(0, 28);
    partes.push(local, nome, corpo);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(metodo, 10);
    cd.writeUInt16LE(hora, 12);
    cd.writeUInt16LE(dia, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(corpo.length, 20);
    cd.writeUInt32LE(dados.length, 24);
    cd.writeUInt16LE(nome.length, 28);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(posicao, 42);
    central.push(cd, nome);
    posicao += local.length + nome.length + corpo.length;
  }
  const tamanhoCentral = central.reduce((s, b) => s + b.length, 0);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0);
  fim.writeUInt16LE(entradas.length, 8);
  fim.writeUInt16LE(entradas.length, 10);
  fim.writeUInt32LE(tamanhoCentral, 12);
  fim.writeUInt32LE(posicao, 16);
  return Buffer.concat([...partes, ...central, fim]);
}

// Lê o índice de um zip (para conferir o que foi escrito). Devolve [{ nome, tamanho, dados, metodo }]
// (metodo 0 = guardado como está, 8 = comprimido).
export function lerZip(buf) {
  let fim = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      fim = i;
      break;
    }
  }
  if (fim < 0) throw new Error('zip sem diretório central');
  const total = buf.readUInt16LE(fim + 10);
  let p = buf.readUInt32LE(fim + 16);
  const lista = [];
  for (let k = 0; k < total; k += 1) {
    const metodo = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const comprimido = buf.readUInt32LE(p + 20);
    const tamanho = buf.readUInt32LE(p + 24);
    const n = buf.readUInt16LE(p + 28);
    const extra = buf.readUInt16LE(p + 30);
    const coment = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const nome = buf.toString('utf8', p + 46, p + 46 + n);
    const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const corpo = buf.subarray(inicio, inicio + comprimido);
    const dados = metodo === 8 ? zlib.inflateRawSync(corpo) : Buffer.from(corpo);
    lista.push({ nome, tamanho, dados, metodo, crcOk: crc32(dados) === crc });
    p += 46 + n + extra + coment;
  }
  return lista;
}

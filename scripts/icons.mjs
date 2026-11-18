// Rysuje ikonę (niebieski kafelek, siatka tabeli, jasno wyróżniona środkowa kolumna) i koduje ją jako PNG.
import zlib from 'node:zlib';

const BLUE = [37, 99, 235];
const WHITE = [255, 255, 255];
const PALE = [147, 197, 253];
const YELLOW = [250, 204, 21];

// Kolor w punkcie (współrzędne 0..1) albo null dla przezroczystości.
function shade(x, y) {
  const r = 0.2;
  const cx = Math.min(Math.max(x, r), 1 - r);
  const cy = Math.min(Math.max(y, r), 1 - r);
  if (Math.hypot(x - cx, y - cy) > r) return null;

  // Ramka zaznaczenia wokół środkowej kolumny.
  const s = 0.05;
  const fx0 = 0.37, fx1 = 0.63, fy0 = 0.14, fy1 = 0.86;
  const onFrame =
    x > fx0 - s && x < fx1 + s && y > fy0 - s && y < fy1 + s &&
    !(x > fx0 && x < fx1 && y > fy0 && y < fy1);
  if (onFrame) return YELLOW;

  // Siatka 3x4 komórek.
  const gx0 = 0.16, gx1 = 0.84, gy0 = 0.22, gy1 = 0.78;
  if (x > gx0 && x < gx1 && y > gy0 && y < gy1) {
    const col = Math.floor(((x - gx0) / (gx1 - gx0)) * 3);
    const row = Math.floor(((y - gy0) / (gy1 - gy0)) * 4);
    const lx = ((x - gx0) / (gx1 - gx0)) * 3 - col;
    const ly = ((y - gy0) / (gy1 - gy0)) * 4 - row;
    if (lx > 0.12 && lx < 0.88 && ly > 0.18 && ly < 0.82) return col === 1 ? WHITE : PALE;
  }
  return BLUE;
}

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

export function makeIcon(size) {
  const ss = 4;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = shade((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          if (c) {
            r += c[0];
            g += c[1];
            b += c[2];
            a++;
          }
        }
      }
      const o = y * (size * 4 + 1) + 1 + x * 4;
      if (a) {
        raw[o] = r / a;
        raw[o + 1] = g / a;
        raw[o + 2] = b / a;
      }
      raw[o + 3] = Math.round((a / (ss * ss)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

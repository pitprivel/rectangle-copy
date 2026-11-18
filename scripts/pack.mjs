// Pakuje dodatek do ZIP:
//   bez flag:  dist/       -> release/rectangle-copy-<wersja>.zip        (do „Załaduj rozpakowane”, z INSTALL.txt)
//   --store:   dist-store/ -> release/rectangle-copy-<wersja>-store.zip  (do wgrania w Chrome Web Store)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const store = process.argv.includes('--store');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(root, store ? 'dist-store' : 'dist');
const { version } = JSON.parse(fs.readFileSync(path.join(dist, 'manifest.json'), 'utf8'));
const folder = `rectangle-copy-${version}`;
const out = path.join(root, 'release', store ? `${folder}-store.zip` : `${folder}.zip`);

const INSTALL = `Rectangle Copy ${version}
========================

EN - Installing without the Chrome Web Store
1. Unzip to a permanent folder, e.g. C:\\Programs\\${folder}
   (the browser loads the extension from there - do not delete or move it).
2. Open brave://extensions (or chrome://extensions, edge://extensions).
3. Turn on "Developer mode" (top right).
4. Click "Load unpacked" and choose the folder that contains manifest.json.
Usage: hold Alt and drag with the mouse - the rectangle is copied to the clipboard.
Esc cancels. Settings: click the extension icon in the toolbar.

PL - Instalacja bez Chrome Web Store
1. Rozpakuj do stałego folderu, np. C:\\Programy\\${folder}
   (przeglądarka wczytuje dodatek z tego folderu - nie usuwaj go i nie przenoś).
2. Otwórz brave://extensions (albo chrome://extensions, edge://extensions).
3. Włącz "Tryb dewelopera" (prawy górny róg).
4. Kliknij "Załaduj rozpakowane" i wskaż folder, w którym leży manifest.json.
Użycie: przytrzymaj Alt i przeciągnij myszą - prostokąt trafia do schowka.
Esc anuluje. Ustawienia: ikona dodatku na pasku narzędzi.

https://github.com/pitprivel/rectangle-copy
`;

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function dosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1),
    date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

const entries = fs
  .readdirSync(dist, { recursive: true })
  .map((f) => f.replaceAll('\\', '/'))
  .filter((f) => fs.statSync(path.join(dist, f)).isFile())
  .sort()
  .map((f) => ({ name: f, data: fs.readFileSync(path.join(dist, f)) }));
// Sklep chce manifest.json w korzeniu ZIP-a i nic ponad pliki dodatku.
if (!store) entries.push({ name: 'INSTALL.txt', data: Buffer.from(INSTALL.replace(/\n/g, '\r\n'), 'utf8') });

const { time, date } = dosTime(new Date());
const locals = [];
const centrals = [];
let offset = 0;
for (const { name, data } of entries) {
  const nameBuf = Buffer.from(name, 'utf8');
  const comp = zlib.deflateRawSync(data, { level: 9 });
  const crc = crc32(data);
  const flags = 0x0800; // nazwy w UTF-8

  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(20, 4);
  local.writeUInt16LE(flags, 6);
  local.writeUInt16LE(8, 8);
  local.writeUInt16LE(time, 10);
  local.writeUInt16LE(date, 12);
  local.writeUInt32LE(crc, 14);
  local.writeUInt32LE(comp.length, 18);
  local.writeUInt32LE(data.length, 22);
  local.writeUInt16LE(nameBuf.length, 26);
  locals.push(local, nameBuf, comp);

  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(20, 4);
  central.writeUInt16LE(20, 6);
  central.writeUInt16LE(flags, 8);
  central.writeUInt16LE(8, 10);
  central.writeUInt16LE(time, 12);
  central.writeUInt16LE(date, 14);
  central.writeUInt32LE(crc, 16);
  central.writeUInt32LE(comp.length, 20);
  central.writeUInt32LE(data.length, 24);
  central.writeUInt16LE(nameBuf.length, 28);
  central.writeUInt32LE(offset, 42);
  centrals.push(central, nameBuf);

  offset += 30 + nameBuf.length + comp.length;
}

const centralBuf = Buffer.concat(centrals);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50, 0);
end.writeUInt16LE(entries.length, 8);
end.writeUInt16LE(entries.length, 10);
end.writeUInt32LE(centralBuf.length, 12);
end.writeUInt32LE(offset, 16);

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, Buffer.concat([...locals, centralBuf, end]));
console.log(`Spakowano ${entries.length} plików: ${path.relative(root, out)} (${(fs.statSync(out).size / 1e3).toFixed(0)} KB)`);

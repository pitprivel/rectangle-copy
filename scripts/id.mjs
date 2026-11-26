// Pokazuje ID dodatku wynikające z pola "key" w src/manifest.json.
// Klucz to klucz publiczny z Chrome Web Store (Pakiet → Wyświetl klucz publiczny), więc wersja
// ładowana z folderu ma to samo ID co sklepowa. Nie generujemy już własnego klucza.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const STORE_ID = 'ehfclhgpdpfjhkapbmpgnommgecdpnei';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { key } = JSON.parse(fs.readFileSync(path.join(root, 'src', 'manifest.json'), 'utf8'));
const id = [...crypto.createHash('sha256').update(Buffer.from(key, 'base64')).digest('hex').slice(0, 32)]
  .map((h) => String.fromCharCode(97 + parseInt(h, 16)))
  .join('');

console.log(`ID z manifestu: ${id}`);
if (id !== STORE_ID) {
  console.error(`To NIE jest ID ze sklepu (${STORE_ID}) – sprawdź pole "key" w src/manifest.json.`);
  process.exit(1);
}
console.log('Zgodne z Chrome Web Store.');

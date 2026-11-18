// Jednorazowo: generuje klucz dodatku (keys/extension.pem) i wpisuje klucz publiczny do src/manifest.json.
// Dzięki temu ID dodatku jest takie samo na każdym komputerze (ustawienia synchronizują się przez Brave Sync).
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pemFile = path.join(root, 'keys', 'extension.pem');
const manifestFile = path.join(root, 'src', 'manifest.json');

let privateKey;
if (fs.existsSync(pemFile)) {
  privateKey = crypto.createPrivateKey(fs.readFileSync(pemFile));
} else {
  ({ privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }));
  fs.mkdirSync(path.dirname(pemFile), { recursive: true });
  fs.writeFileSync(pemFile, privateKey.export({ type: 'pkcs8', format: 'pem' }));
}
const der = crypto.createPublicKey(privateKey).export({ type: 'spki', format: 'der' });
const key = der.toString('base64');
const id = [...crypto.createHash('sha256').update(der).digest('hex').slice(0, 32)]
  .map((h) => String.fromCharCode(97 + parseInt(h, 16)))
  .join('');

const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
const { manifest_version, name, version, description, ...rest } = manifest;
const out = { manifest_version, name, version, description, key, ...rest };
fs.writeFileSync(manifestFile, JSON.stringify(out, null, 2) + '\n');
console.log(`ID dodatku: ${id}`);

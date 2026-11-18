// Buduje rozszerzenie:
//   dist/        – do instalacji „Załaduj rozpakowane” (z kluczem: stałe ID na każdym komputerze),
//   dist-store/  – --store: do Chrome Web Store (bez pola "key", którego sklep nie przyjmuje),
//   dist-test/   – --test: dodatek zapisuje skopiowany tekst i komunikat w atrybutach <html>,
//                  żeby test e2e mógł je odczytać.
import { build } from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeIcon } from './icons.mjs';
import { toChromeMessages } from './locales.mjs';

const test = process.argv.includes('--test');
const store = process.argv.includes('--store');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'src');
const dist = path.join(root, test ? 'dist-test' : store ? 'dist-store' : 'dist');

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(dist, { recursive: true });

await build({
  entryPoints: {
    content: path.join(src, 'content.js'),
    background: path.join(src, 'background.js'),
    'popup/popup': path.join(src, 'popup/popup.js'),
    'welcome/welcome': path.join(src, 'welcome/welcome.js'),
  },
  outdir: dist,
  bundle: true,
  format: 'iife',
  platform: 'browser',
  target: 'chrome110',
  define: { __TEST__: String(test) },
  legalComments: 'none',
  logLevel: 'warning',
});

for (const f of ['popup/popup.html', 'popup/popup.css', 'welcome/welcome.html', 'welcome/welcome.css']) {
  fs.mkdirSync(path.dirname(path.join(dist, f)), { recursive: true });
  fs.copyFileSync(path.join(src, f), path.join(dist, f));
}

const manifest = JSON.parse(fs.readFileSync(path.join(src, 'manifest.json'), 'utf8'));
if (store) delete manifest.key;
fs.writeFileSync(path.join(dist, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

// Tłumaczenia: src/locales/<lang>.json (płaskie, podstawienia {1} {2}) -> _locales/<lang>/messages.json.
for (const file of fs.readdirSync(path.join(src, 'locales'))) {
  const lang = path.basename(file, '.json');
  const flat = JSON.parse(fs.readFileSync(path.join(src, 'locales', file), 'utf8'));
  fs.mkdirSync(path.join(dist, '_locales', lang), { recursive: true });
  fs.writeFileSync(path.join(dist, '_locales', lang, 'messages.json'), JSON.stringify(toChromeMessages(flat), null, 1));
}

fs.mkdirSync(path.join(dist, 'icons'), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  fs.writeFileSync(path.join(dist, 'icons', `icon${size}.png`), makeIcon(size));
}

const total = fs
  .readdirSync(dist, { recursive: true })
  .map((f) => path.join(dist, f))
  .filter((f) => fs.statSync(f).isFile())
  .reduce((s, f) => s + fs.statSync(f).size, 0);
console.log(`Zbudowano ${path.basename(dist)}/ (${(total / 1e3).toFixed(0)} KB)`);

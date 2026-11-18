// Blokuje wydanie, dopóki zostały znaczniki do uzupełnienia (np. adres kontaktowy)
// albo wersja w manifeście nie zgadza się z package.json / tagiem Git.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MARKERS = ['KONTAKT@DO_UZUPELNIENIA'];
const SKIP = new Set(['node_modules', '.git', 'dist', 'dist-test', 'dist-store', 'release', 'keys', 'scripts']);
const problems = [];

function walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(md|html|json|js|mjs|txt|yml)$/.test(e.name)) {
      const text = fs.readFileSync(p, 'utf8');
      for (const m of MARKERS) if (text.includes(m)) problems.push(`${path.relative(root, p)}: znacznik ${m}`);
    }
  }
}
walk(root);

const manifest = JSON.parse(fs.readFileSync(path.join(root, 'src/manifest.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (manifest.version !== pkg.version) problems.push(`wersja: manifest ${manifest.version} ≠ package.json ${pkg.version}`);
const tag = process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : null;
if (tag && tag !== `v${manifest.version}`) problems.push(`wersja: tag ${tag} ≠ v${manifest.version}`);
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8');
if (!changelog.includes(`## [${manifest.version}]`)) problems.push(`CHANGELOG.md: brak sekcji [${manifest.version}]`);

if (problems.length) {
  console.error('Wydanie zablokowane:\n  ' + problems.join('\n  '));
  process.exit(1);
}
console.log(`Gotowe do wydania: ${manifest.version}`);

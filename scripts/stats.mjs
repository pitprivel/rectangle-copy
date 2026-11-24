// Statystyki z GitHuba: pobrania paczek z wydań (od początku) i ruch w repo (ostatnie 14 dni).
// Wymaga zalogowanego GitHub CLI (gh). Ruch w repo widzi tylko właściciel.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const REPO = 'pitprivel/rectangle-copy';
const WIN_GH = 'C:\\Program Files\\GitHub CLI\\gh.exe';
const gh = process.platform === 'win32' && fs.existsSync(WIN_GH) ? WIN_GH : 'gh';

const api = (path) => JSON.parse(execFileSync(gh, ['api', path], { encoding: 'utf8' }));

const releases = api(`repos/${REPO}/releases`);
console.log('Pobrania paczek z wydań (od początku):');
let total = 0;
for (const r of releases) {
  for (const a of r.assets) {
    total += a.download_count;
    console.log(`  ${r.tag_name.padEnd(8)} ${a.name.padEnd(34)} ${String(a.download_count).padStart(6)}`);
  }
}
console.log(`  ${'razem'.padEnd(43)} ${String(total).padStart(6)}`);

try {
  const views = api(`repos/${REPO}/traffic/views`);
  const clones = api(`repos/${REPO}/traffic/clones`);
  console.log('\nRuch w repo (ostatnie 14 dni):');
  console.log(`  wyświetlenia: ${views.count} (unikalni: ${views.uniques})`);
  console.log(`  klonowania:   ${clones.count} (unikalni: ${clones.uniques}) – głównie automaty i boty`);
} catch {
  console.log('\n(Ruch w repo jest dostępny tylko dla właściciela repozytorium.)');
}

// Animacja do postów (Reddit, Wykop, HN…), nagrana prawdziwym dodatkiem (dist-test) w Brave:
//   store/out/demo-<lang>.gif  i  store/out/demo-<lang>.mp4
// Kursor najeżdża na tabelę, wciśnięty Alt, przeciągnięcie po kolumnie cen, puszczenie → komunikat i wklejony tekst.
// Użycie: node scripts/demo-gif.mjs [en pl …]   (domyślnie en i pl). Wymaga ffmpeg w PATH.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ext = path.join(root, 'dist-test');
const out = path.join(root, 'store', 'out');
const browserPath = process.env.BROWSER || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';
const langs = process.argv.slice(2).length ? process.argv.slice(2) : ['en', 'pl'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

execFileSync(process.execPath, [path.join(root, 'scripts/build.mjs'), '--test'], { stdio: 'inherit' });

const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png' };
const server = http
  .createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://example.com:${server.address().port}`;

for (const lang of langs) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rect-copy-gif-'));
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), 'rect-copy-frames-'));
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    userDataDir: profile,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--lang=${lang}`,
      '--host-resolver-rules=MAP example.com 127.0.0.1',
      '--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable,HttpsFirstModeV2ForEngagedSites',
      '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb',
    ],
    env: { ...process.env, LANGUAGE: lang },
  });
  try {
    await sleep(800);
    for (const p of await browser.pages()) if (p.url().includes('welcome')) await p.close();
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await page.goto(`${base}/store/templates/scene.html?lang=${lang}&shot=1`);
    await page.evaluate(() => window.sceneReady);
    await page.evaluate(() => document.fonts.ready);
    // Plakietka z wciśniętym klawiszem (w nagraniu nie widać klawiatury).
    await page.evaluate(() => {
      const k = document.createElement('div');
      k.id = 'altkey';
      k.textContent = 'Alt';
      Object.assign(k.style, {
        position: 'fixed', left: '64px', bottom: '48px', padding: '10px 22px', font: '600 28px system-ui, sans-serif',
        color: '#0f172a', background: '#fff', border: '2px solid #cbd5e1', borderBottomWidth: '5px', borderRadius: '10px',
        boxShadow: '0 4px 14px rgba(15,23,42,.15)', opacity: '0', transition: 'none', zIndex: 2147483646,
      });
      document.body.append(k);
    });
    await sleep(300);

    const list = []; // [plik, czas w sekundach]
    let n = 0;
    const frame = async (dur) => {
      const f = path.join(frames, `f${String(n++).padStart(3, '0')}.png`);
      await page.screenshot({ path: f });
      list.push([f, dur]);
    };
    const cursor = (x, y) => page.evaluate((x, y) => window.showCursor(x, y), x, y);
    const altKey = (on) => page.evaluate((on) => {
      const k = document.getElementById('altkey');
      k.style.opacity = on ? '1' : '0';
      k.style.background = on ? '#fef3c7' : '#fff';
      k.style.borderColor = on ? '#f59e0b' : '#cbd5e1';
    }, on);
    const cell = (r, c) => page.$eval(`#t tbody tr:nth-child(${r}) td:nth-child(${c})`, (el) => {
      const b = el.getBoundingClientRect();
      return { x: b.left, y: b.top, r: b.right, b: b.bottom };
    });

    const a = await cell(1, 4);
    const z = await cell(6, 4);
    const sx = a.x + 8, sy = a.y + 4, ex = z.r - 10, ey = z.b - 6;

    // 1. Spokojny start, kursor z boku.
    let cx = 900, cy = 560;
    await cursor(cx, cy);
    await frame(2.0);
    // 2. Kursor jedzie do pierwszej ceny.
    for (let i = 1; i <= 16; i++) {
      const t = i / 16, e = 1 - (1 - t) ** 3;
      const x = cx + (sx - cx) * e, y = cy + (sy - cy) * e;
      await page.mouse.move(x, y);
      await cursor(x, y);
      await frame(0.07);
    }
    await frame(0.6);
    // 3. Alt w dół.
    await page.keyboard.down('Alt');
    await altKey(true);
    await frame(1.3);
    // 4. Przeciąganie po kolumnie.
    await page.mouse.down();
    const steps = 32;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps, e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const x = sx + (ex - sx) * e, y = sy + (ey - sy) * e;
      await page.mouse.move(x, y);
      await cursor(x, y);
      await sleep(16);
      await frame(0.09);
    }
    await frame(1.6);
    // 5. Puszczenie: komunikat i wklejony tekst.
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await altKey(false);
    await sleep(60);
    await frame(0.8);
    await page.evaluate(() => window.setShot(2));
    await sleep(250);
    await frame(2.8); // ffmpeg (concat) pokazuje ostatnią klatkę dwa razy dłużej → ok. 5,5 s

    const copied = await page.evaluate(() => document.documentElement.dataset.rectSelectCopied);
    if (!copied || copied.split('\n').length !== 6) throw new Error(`${lang}: skopiowano „${copied}”`);

    // ffmpeg: lista klatek z czasami → GIF (paleta) i MP4.
    const txt = path.join(frames, 'list.txt');
    const q = (f) => `file '${f.replace(/\\/g, '/')}'`;
    fs.writeFileSync(txt, list.map(([f, d]) => `${q(f)}\nduration ${d}`).join('\n') + `\n${q(list.at(-1)[0])}\n`);
    const gif = path.join(out, `demo-${lang}.gif`), mp4 = path.join(out, `demo-${lang}.mp4`);
    fs.mkdirSync(out, { recursive: true });
    const ff = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', txt, ...args]);
    ff(['-vf', 'fps=25,scale=800:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle', '-loop', '0', gif]);
    ff(['-vf', 'fps=30,scale=1280:-2', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', mp4]);
    const kb = (f) => Math.round(fs.statSync(f).size / 1024);
    console.log(`  ${lang}: ${path.relative(root, gif)} (${kb(gif)} KB), ${path.relative(root, mp4)} (${kb(mp4)} KB)`);
  } finally {
    await browser.close();
    fs.rmSync(profile, { recursive: true, force: true });
    fs.rmSync(frames, { recursive: true, force: true });
  }
}
server.close();

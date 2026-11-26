// Grafiki do Chrome Web Store, robione prawdziwym dodatkiem (dist-test) w Brave, osobno dla każdego języka:
//   store/out/<lang>/1-table.jpg … 4-settings.jpg  – zrzuty 1280×800 (JPEG, bez kanału alfa – wymóg sklepu)
//   store/out/<lang>/promo-440x280.jpg             – mały baner promocyjny
//   store/out/icon-128.png                         – ikona sklepu (grafika 96 px + 16 px przezroczystego marginesu)
// Dodatkowo docs/screenshot-1.jpg i -2.jpg (EN) do README i strony projektu.
// Użycie: npm run store:assets  [-- pl de]  (bez argumentów – wszystkie języki)
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
const EXT_ID = 'ehfclhgpdpfjhkapbmpgnommgecdpnei';
const ALL = ['en', 'pl', 'de', 'fr', 'it', 'es', 'uk'];
const langs = process.argv.slice(2).filter((a) => ALL.includes(a));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

execFileSync(process.execPath, [path.join(root, 'scripts/build.mjs'), '--test'], { stdio: 'inherit' });

// Teksty do wklejenia w sklepie: nazwa i krótki opis (z src/locales) + pełny opis (ze store/listing).
for (const lang of ALL) {
  const loc = JSON.parse(fs.readFileSync(path.join(root, 'src/locales', `${lang}.json`), 'utf8'));
  const L = JSON.parse(fs.readFileSync(path.join(root, 'store/listing', `${lang}.json`), 'utf8'));
  fs.mkdirSync(path.join(out, lang), { recursive: true });
  fs.writeFileSync(path.join(out, lang, 'description.txt'), L.description + '\n');
  fs.writeFileSync(
    path.join(out, lang, 'name-and-summary.txt'),
    `Nazwa (z manifestu, ustawia się sama):\n${loc.extName}\n\nKrótki opis (z manifestu, ustawia się sam, ${loc.extDescription.length}/132 znaków):\n${loc.extDescription}\n`,
  );
}

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
const port = server.address().port;
// Strona sceny pod adresem example.com (mapowanym na localhost) – tak też podpisze się okienko dodatku.
const base = `http://example.com:${port}`;

async function launch(lang) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rect-copy-store-'));
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless: true,
    userDataDir: profile,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--lang=${lang}`,
      `--host-resolver-rules=MAP example.com 127.0.0.1`,
      '--disable-features=HttpsUpgrades,HttpsFirstBalancedModeAutoEnable,HttpsFirstModeV2ForEngagedSites',
      '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', '--force-color-profile=srgb',
      ...(process.env.CI && process.platform === 'linux' ? ['--no-sandbox'] : []),
    ],
    env: { ...process.env, LANGUAGE: lang },
  });
  await sleep(800); // strona powitalna otwiera się po instalacji – zamykamy ją
  for (const p of await browser.pages()) if (p.url().includes('welcome')) await p.close();
  return {
    browser,
    close: async () => {
      await browser.close();
      fs.rmSync(profile, { recursive: true, force: true });
    },
  };
}

async function scene(browser, lang, shot, extra = '') {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
  await page.goto(`${base}/store/templates/scene.html?lang=${lang}&shot=${shot}${extra}`);
  await page.evaluate(() => window.sceneReady);
  await page.evaluate(() => document.fonts.ready);
  await sleep(200);
  return page;
}

const box = (page, sel) =>
  page.$eval(sel, (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height };
  });

const jpg = (page, file) => page.screenshot({ path: file, type: 'jpeg', quality: 92 });

fs.mkdirSync(out, { recursive: true });
for (const lang of langs.length ? langs : ALL) {
  const dir = path.join(out, lang);
  fs.mkdirSync(dir, { recursive: true });
  const { browser, close } = await launch(lang);
  try {
    // 1 + 2: kolumna ceny w trakcie przeciągania i po puszczeniu (komunikat + wklejony tekst).
    const page = await scene(browser, lang, 1);
    const a = await box(page, '#t tbody tr:nth-child(1) td:nth-child(4)');
    const z = await box(page, '#t tbody tr:nth-child(6) td:nth-child(4)');
    await page.keyboard.down('Alt');
    await page.mouse.move(a.x + 8, a.y + 4);
    await page.mouse.down();
    await page.mouse.move(z.r - 10, z.b - 6, { steps: 15 });
    await page.evaluate((x, y) => window.showCursor(x, y), z.r - 10, z.b - 6);
    await sleep(150);
    await jpg(page, path.join(dir, '1-table.jpg'));
    await page.mouse.up();
    await page.keyboard.up('Alt');
    await page.evaluate(() => {
      window.setShot(2);
      document.getElementById('cursor').style.display = 'none';
    });
    await sleep(350);
    await jpg(page, path.join(dir, '2-copied.jpg'));
    const copied = await page.evaluate(() => document.documentElement.dataset.rectSelectCopied);
    if (!copied || copied.split('\n').length !== 6) throw new Error(`${lang}: skopiowano „${copied}”`);

    // 3: zaznaczanie blokowe w kodzie (w trakcie przeciągania).
    const p3 = await scene(browser, lang, 3);
    const code = await box(page === p3 ? page : p3, '#code');
    const charW = await p3.evaluate(() => {
      const r = document.createRange();
      const t = document.getElementById('code').firstChild;
      r.setStart(t, 0);
      r.setEnd(t, 8);
      return r.getBoundingClientRect().width / 8;
    });
    const lineH = code.h / 7;
    await p3.bringToFront();
    await p3.keyboard.down('Alt');
    await p3.mouse.move(code.x + 18 + charW * 4 - 2, code.y + 16 + lineH * 1 + 3);
    await p3.mouse.down();
    const ex = code.x + 18 + charW * 39, ey = code.y + 16 + lineH * 4 + lineH - 4;
    await p3.mouse.move(ex, ey, { steps: 15 });
    await p3.evaluate((x, y) => window.showCursor(x, y), ex, ey);
    await sleep(150);
    await jpg(p3, path.join(dir, '3-text.jpg'));
    await p3.keyboard.press('Escape');
    await p3.mouse.up();
    await p3.keyboard.up('Alt');

    // 4: okienko pod ikoną dodatku dla karty example.com, powiększone na scenie.
    const p4 = await scene(browser, lang, 4);
    await p4.bringToFront();
    const pop = await browser.newPage();
    await pop.goto(`chrome-extension://${EXT_ID}/popup/popup.html`);
    await p4.bringToFront();
    const tabId = await pop.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
    await pop.setViewport({ width: 360, height: 600, deviceScaleFactor: 2 });
    await pop.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: 'light' }]);
    await pop.goto(`chrome-extension://${EXT_ID}/popup/popup.html?testTab=${tabId}`);
    await pop.bringToFront();
    await pop.waitForFunction(() => !document.getElementById('site').hidden, { polling: 100, timeout: 5000 });
    const label = await pop.$eval('#siteLabel', (l) => l.textContent);
    if (!label.includes('example.com')) throw new Error(`${lang}: okienko pokazuje „${label}”`);
    const popPng = path.join(dir, '_popup.png');
    const body = await pop.$('body');
    await body.screenshot({ path: popPng });
    await pop.close();
    await p4.bringToFront();
    await p4.evaluate((src) => new Promise((ok) => {
      const img = document.getElementById('popupImg');
      img.onload = ok;
      img.src = src;
    }), `/store/out/${lang}/_popup.png`);
    await sleep(100);
    await jpg(p4, path.join(dir, '4-settings.jpg'));
    fs.rmSync(popPng);

    // Baner 440×280.
    const promo = await browser.newPage();
    await promo.setViewport({ width: 440, height: 280, deviceScaleFactor: 1 });
    await promo.goto(`${base}/store/templates/promo.html?lang=${lang}`);
    await promo.evaluate(() => window.sceneReady);
    await sleep(100);
    await jpg(promo, path.join(dir, 'promo-440x280.jpg'));

    if (lang === 'en') {
      fs.copyFileSync(path.join(dir, '1-table.jpg'), path.join(root, 'docs', 'screenshot-1.jpg'));
      fs.copyFileSync(path.join(dir, '2-copied.jpg'), path.join(root, 'docs', 'screenshot-2.jpg'));

      // Ikona sklepu: 96 px grafiki na przezroczystym polu 128 px.
      const icon = await browser.newPage();
      await icon.setViewport({ width: 128, height: 128, deviceScaleFactor: 1 });
      await icon.goto(`${base}/store/templates/scene.html?lang=en`);
      await icon.evaluate(() => {
        document.head.innerHTML = '<style>html,body{margin:0;width:128px;height:128px;background:transparent!important;overflow:hidden}</style>';
        document.body.innerHTML = '<img src="/dist-test/icons/icon128.png" style="width:96px;height:96px;margin:16px;display:block">';
        return document.images[0].decode();
      });
      await icon.screenshot({ path: path.join(out, 'icon-128.png'), omitBackground: true });
    }
    console.log(`  ${lang}: gotowe`);
  } finally {
    await close();
  }
}
server.close();
console.log(`Grafiki w ${path.relative(root, out)}`);

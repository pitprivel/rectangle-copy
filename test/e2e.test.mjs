// Test w prawdziwej przeglądarce: Brave (albo BROWSER=ścieżka) z załadowanym dist-test/,
// przeciąganie myszą z Alt na test/harness.html i na stronie powitalnej, sprawdzenie
// skopiowanego tekstu, komunikatów (PL i UK) i wyłączania na stronie.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ext = path.join(root, 'dist-test');
const browserPath = process.env.BROWSER || 'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe';
const headless = !process.env.HEADFUL;
const EXT_ID = 'fikgakmekkffphhlgmicclllblekeeoh'; // stałe ID z klucza w manifeście
const WELCOME = `chrome-extension://${EXT_ID}/welcome/welcome.html`;

const server = http
  .createServer((req, res) => {
    const file = path.join(root, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end();
    res.writeHead(200, { 'Content-Type': file.endsWith('.html') ? 'text/html; charset=utf-8' : 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  })
  .listen(0);
await new Promise((r) => server.once('listening', r));
const url = `http://localhost:${server.address().port}/test/harness.html`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
async function check(name, fn) {
  try {
    await fn();
    console.log(`  ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`  FAIL ${name}\n       ${String(e.message).replace(/\n/g, '\n       ')}`);
  }
}

async function launch(lang) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'rect-copy-'));
  const browser = await puppeteer.launch({
    executablePath: browserPath,
    headless,
    userDataDir: profile,
    ignoreDefaultArgs: ['--disable-extensions'],
    args: [
      `--disable-extensions-except=${ext}`, `--load-extension=${ext}`, `--lang=${lang}`,
      '--no-first-run', '--no-default-browser-check', '--window-size=1200,900',
      // Runnery GitHub Actions (Ubuntu) nie pozwalają na piaskownicę Chrome.
      ...(process.env.CI && process.platform === 'linux' ? ['--no-sandbox'] : []),
    ],
    defaultViewport: { width: 1100, height: 800 },
    env: { ...process.env, LANGUAGE: lang },
  });
  const close = async () => {
    await browser.close();
    fs.rmSync(profile, { recursive: true, force: true });
  };
  return { browser, close };
}

// Pomocnicze funkcje dla jednej karty.
function helpers(page) {
  const rect = (sel) =>
    page.evaluate((s) => {
      const el = document.querySelector(s);
      let r = el.getBoundingClientRect();
      if (r.top < 0 || r.bottom > innerHeight) {
        el.scrollIntoView({ block: 'center' });
        r = el.getBoundingClientRect();
      }
      return { x: r.left, y: r.top, w: r.width, h: r.height, r: r.right, b: r.bottom, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    }, sel);

  async function drag(x0, y0, x1, y1, { mod = 'Alt', hold = 0, beforeUp } = {}) {
    await page.evaluate(() => {
      delete document.documentElement.dataset.rectSelectCopied;
      delete document.documentElement.dataset.rectSelectToast;
    });
    if (mod) await page.keyboard.down(mod);
    await page.mouse.move(x0, y0);
    await page.mouse.down();
    await page.mouse.move(x1, y1, { steps: 12 });
    if (hold) await sleep(hold);
    if (beforeUp) await beforeUp();
    await page.mouse.up();
    if (mod) await page.keyboard.up(mod);
    await sleep(50);
    return page.evaluate(() => document.documentElement.dataset.rectSelectCopied ?? null);
  }
  const lastToast = () => page.evaluate(() => document.documentElement.dataset.rectSelectToast ?? null);
  return { rect, drag, lastToast };
}

async function setSettings(browser, patch) {
  const p = await browser.newPage();
  await p.goto(`chrome-extension://${EXT_ID}/popup/popup.html`);
  await p.evaluate((x) => chrome.storage.sync.set(x), patch);
  await p.close();
  await sleep(100);
}

async function waitForWelcome(browser) {
  for (let i = 0; i < 40; i++) {
    const page = (await browser.pages()).find((p) => p.url() === WELCOME);
    if (page) return page;
    await sleep(100);
  }
  return null;
}

// ---------------------------------------------------------------- po polsku
{
  const { browser, close } = await launch('pl');
  try {
    await check('po instalacji otwiera się strona powitalna (po polsku)', async () => {
      const w = await waitForWelcome(browser);
      assert.ok(w, 'brak karty powitalnej');
      await w.waitForFunction(() => document.querySelector('h1').textContent.includes('zainstalowany'));
      assert.equal(await w.$eval('#step1 kbd', (k) => k.textContent), 'Alt');
    });

    await check('na stronie powitalnej da się skopiować kolumnę „Cena”', async () => {
      const w = await waitForWelcome(browser);
      await w.bringToFront();
      const { rect, drag, lastToast } = helpers(w);
      const a = await rect('#demo tbody tr:nth-child(1) td:nth-child(3)');
      const z = await rect('#demo tbody tr:nth-child(4) td:nth-child(3)');
      const text = await drag(a.cx, a.cy, z.cx, z.cy);
      // Pionowo w dół, bez ruchu w bok. Intl wstawia twardą spację przed „zł”; w schowku ląduje zwykła.
      assert.equal(text, '5,49 zł\n3,20 zł\n8,99 zł\n12,30 zł');
      assert.equal(await lastToast(), 'Skopiowano: 1 kolumna × 4 wiersze');
      await w.close();
    });

    const page = await browser.newPage();
    await page.goto(url);
    await sleep(300);
    const { rect, drag, lastToast } = helpers(page);

    await check('kolumna „Ilość” (z komórką scaloną, bez ukrytego wiersza)', async () => {
      const a = await rect('#t1 tbody tr:nth-child(1) td:nth-child(2)');
      const z = await rect('#t1 tbody tr:nth-child(6) td:nth-child(2)');
      assert.equal(await drag(a.cx - 5, a.cy, z.cx + 5, z.cy), '2\n1\nRabat łączny\n3\n1');
      assert.equal(await lastToast(), 'Skopiowano: 1 kolumna × 5 wierszy');
    });

    await check('kolumna „Cena” z nagłówkiem (rowspan)', async () => {
      const a = await rect('#t1 thead th:nth-child(3)');
      const last = await rect('#t1 tbody tr:nth-child(6)');
      assert.equal(await drag(a.cx, a.cy, a.cx + 10, last.cy), 'Cena\n5,49 zł\n\n-1,00 zł\n8,99 zł\n12,30 zł');
    });

    await check('dwie kolumny, tabulator; <br> w komórce = spacja', async () => {
      const a = await rect('#t1 tbody tr:nth-child(4) td:nth-child(1)');
      const z = await rect('#t1 tbody tr:nth-child(6) td:nth-child(2)');
      assert.equal(await drag(a.cx, a.cy, z.cx, z.cy), 'Masło\t3\nSer gouda\t1');
      assert.equal(await lastToast(), 'Skopiowano: 2 kolumny × 2 wiersze');
    });

    await check('kod w <pre>: wcięcia i pusta linia', async () => {
      const p = await rect('#code');
      const expected = fs.readFileSync(path.join(root, 'test/harness.html'), 'utf8').match(/<pre id="code">([\s\S]*?)<\/pre>/)[1];
      assert.equal(await drag(p.x + 3, p.y + 3, p.r - 3, p.b - 3), expected);
      assert.equal(await lastToast(), 'Skopiowano: 7 linii');
    });

    await check('środkowa kolumna z div-ów', async () => {
      const c = await rect('#cols div:nth-child(2)');
      assert.equal(await drag(c.x - 8, c.y - 4, c.r + 8, c.b + 4), 'Środkowa kolumna\nz dwiema liniami');
    });

    await check('przeciąganie zaczęte na linku nie otwiera linku', async () => {
      const l = await rect('#cols a');
      const c = await rect('#cols div:nth-child(1)');
      assert.equal(await drag(l.x + 1, l.b - 3, c.r + 5, c.y - 3), 'Pierwsza kolumna\ndruga linia\nlink w tekście');
      assert.notEqual(await page.evaluate(() => location.hash), '#link');
    });

    await check('bez Alt – zwykłe zaznaczanie, nic nie kopiuje', async () => {
      const c = await rect('#cols div:nth-child(2)');
      assert.equal(await drag(c.x, c.y + 3, c.r, c.b - 3, { mod: null }), null);
    });

    await check('Alt + kliknięcie bez ruchu – nic nie kopiuje', async () => {
      const c = await rect('#cols div:nth-child(3)');
      assert.equal(await drag(c.cx, c.cy, c.cx + 1, c.cy), null);
    });

    await check('Esc anuluje', async () => {
      const c = await rect('#cols div:nth-child(2)');
      assert.equal(await drag(c.x - 5, c.y - 5, c.r + 5, c.b + 5, { beforeUp: () => page.keyboard.press('Escape') }), null);
    });

    await check('autoprzewijanie kontenera z tabelą', async () => {
      const a = await rect('#t2 tr:nth-child(1) td:nth-child(2)');
      const s = await rect('#scroller');
      const text = await drag(a.cx, a.cy, a.cx + 5, s.b - 5, { hold: 1500 });
      const lines = text.split('\n');
      assert.ok(lines.length > 20, `za mało wierszy po przewinięciu: ${lines.length}`);
      lines.forEach((l, i) => assert.equal(l, `Kod-${String(i + 1).padStart(3, '0')}`));
      await page.evaluate(() => (document.querySelector('#scroller').scrollTop = 0));
    });

    await check('tekst naprawdę jest w schowku', async () => {
      await browser.defaultBrowserContext().overridePermissions(new URL(url).origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
      const c = await rect('#cols div:nth-child(3)');
      await drag(c.x - 5, c.y - 5, c.r + 5, c.b + 5);
      await page.bringToFront();
      assert.equal(await page.evaluate(() => navigator.clipboard.readText()), 'Trzecia kolumna');
    });

    await check('ustawienie „spacje” (kliknięte w okienku dodatku) wyrównuje kolumny', async () => {
      const opt = await browser.newPage();
      await opt.goto(`chrome-extension://${EXT_ID}/popup/popup.html`);
      assert.equal(await opt.$eval('legend', (l) => l.textContent), 'Klawisz przy przeciąganiu myszą');
      await opt.click('input[name="separator"][value="spaces"]');
      await sleep(200);
      await opt.close();
      await page.bringToFront();
      const a = await rect('#t1 tbody tr:nth-child(1) td:nth-child(1)');
      const c3 = await rect('#t1 tbody tr:nth-child(1) td:nth-child(3)');
      const r2 = await rect('#t1 tbody tr:nth-child(2)');
      assert.equal(await drag(a.cx, a.cy, c3.cx, r2.cy), 'Chleb żytni  2  5,49 zł\nMleko        1');
    });

    await check('wyłączone na tej stronie – nic nie kopiuje; po włączeniu znów działa', async () => {
      const c = await rect('#cols div:nth-child(2)');
      await setSettings(browser, { disabledSites: ['localhost'] });
      await page.bringToFront();
      assert.equal(await drag(c.x - 5, c.y - 5, c.r + 5, c.b + 5), null);
      await setSettings(browser, { disabledSites: [] });
      await page.bringToFront();
      assert.equal(await drag(c.x - 5, c.y - 5, c.r + 5, c.b + 5), 'Środkowa kolumna\nz dwiema liniami');
    });

    await check('okienko pod ikoną: „Aktywne na localhost” wyłącza i włącza dodatek na tej stronie', async () => {
      const c = await rect('#cols div:nth-child(2)');
      const pop = await browser.newPage();
      await pop.goto(`chrome-extension://${EXT_ID}/popup/popup.html`);
      await page.bringToFront();
      const tabId = await pop.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
      await pop.goto(`chrome-extension://${EXT_ID}/popup/popup.html?testTab=${tabId}`);
      await pop.bringToFront(); // klikanie działa tylko w karcie na wierzchu
      await pop.waitForFunction(() => !document.getElementById('site').hidden, { polling: 100, timeout: 5000 });
      assert.equal(await pop.$eval('#siteLabel', (l) => l.textContent), 'Aktywne na localhost');
      assert.equal(await pop.$eval('#siteOn', (i) => i.checked), true);
      await pop.click('#siteOn');
      await sleep(200);
      await page.bringToFront();
      assert.equal(await drag(c.x - 5, c.y - 5, c.r + 5, c.b + 5), null);
      await pop.bringToFront();
      await pop.reload();
      await pop.waitForFunction(() => !document.getElementById('site').hidden, { polling: 100, timeout: 5000 });
      assert.equal(await pop.$eval('#siteOn', (i) => i.checked), false, 'stan nie zapamiętany');
      await pop.click('#siteOn');
      await sleep(200);
      await pop.close();
      await page.bringToFront();
      assert.equal(await drag(c.x - 5, c.y - 5, c.r + 5, c.b + 5), 'Środkowa kolumna\nz dwiema liniami');
    });

    await check('okienko na stronie bez dodatku: sam komunikat, bez pustego przełącznika', async () => {
      const other = await browser.newPage();
      await other.goto(`chrome-extension://${EXT_ID}/welcome/welcome.html`);
      const pop = await browser.newPage();
      await pop.goto(`chrome-extension://${EXT_ID}/popup/popup.html`);
      await other.bringToFront();
      const tabId = await pop.evaluate(async () => (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0].id);
      await pop.goto(`chrome-extension://${EXT_ID}/popup/popup.html?testTab=${tabId}`);
      await pop.bringToFront();
      await pop.waitForFunction(() => !document.getElementById('site').hidden, { polling: 100, timeout: 5000 });
      const state = await pop.evaluate(() => ({
        toggleVisible: !!document.getElementById('siteOn').closest('label').offsetParent,
        msg: document.getElementById('siteUnsupported').offsetParent ? document.getElementById('siteUnsupported').textContent : null,
      }));
      assert.deepEqual(state, { toggleVisible: false, msg: 'Niedostępne na tej stronie' });
      await pop.close();
      await other.close();
      await page.bringToFront();
    });

    await check('wyłączone globalnie – nic nie kopiuje', async () => {
      const c = await rect('#cols div:nth-child(2)');
      await setSettings(browser, { enabled: false });
      await page.bringToFront();
      assert.equal(await drag(c.x - 5, c.y - 5, c.r + 5, c.b + 5), null);
      await setSettings(browser, { enabled: true });
    });
  } finally {
    await close();
  }
}

// ---------------------------------------------------------------- po ukraińsku
{
  const { browser, close } = await launch('uk');
  try {
    await check('UK: strona powitalna i komunikat z odmianą liczebników', async () => {
      const w = await waitForWelcome(browser);
      assert.ok(w, 'brak karty powitalnej');
      await w.bringToFront();
      assert.equal(await w.$eval('h1', (h) => h.textContent), 'Rectangle Copy встановлено');
      const { rect, drag, lastToast } = helpers(w);
      const a = await rect('#demo tbody tr:nth-child(1) td:nth-child(1)');
      const z = await rect('#demo tbody tr:nth-child(4) td:nth-child(2)');
      const text = await drag(a.cx, a.cy, z.cx, z.cy);
      assert.equal(text.split('\n')[0], 'Житній хліб\t2');
      assert.equal(await lastToast(), 'Скопійовано: 2 стовпці × 4 рядки');
    });
  } finally {
    await close();
  }
}

server.close();
if (failed) {
  console.log(`E2E: ${failed} niepowodzeń`);
  process.exit(1);
}
console.log('E2E: OK');

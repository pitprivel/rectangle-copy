// Zaznaczanie prostokątem: Alt + przeciągnięcie rysuje prostokąt, po puszczeniu myszy
// zawartość trafia do schowka. W tabeli bierze całe komórki, poza tabelą – znaki w prostokącie.
import { DEFAULTS, loadSettings, onSettingsChanged, modifierMatches, siteKey, isSiteDisabled } from './lib/settings.js';
import { t, plural } from './lib/i18n.js';
import { buildGrid, pickBlock, blockRows, cleanCellText, formatRows } from './lib/table.js';
import { inside, charsToText } from './lib/text.js';

/* global __TEST__ */
const DRAG_THRESHOLD = 4; // px – mniejszy ruch to zwykłe kliknięcie
const EDGE = 40; // px od krawędzi, przy których zaczyna się autoprzewijanie
const MAX_BOXES = 3000;
const SKIP_TAGS = new Set(['script', 'style', 'noscript', 'template', 'textarea', 'select', 'option', 'rect-select-overlay']);

let settings = { ...DEFAULTS };
let session = null;
let suppressClickUntil = 0;
let suppressAltUntil = 0;
// Strona nadrzędna (w ramkach liczy się adres karty, nie ramki).
const SITE = siteKey(location.ancestorOrigins?.length ? location.ancestorOrigins[location.ancestorOrigins.length - 1] : location.href);

if (!globalThis.__rectSelectLoaded) {
  globalThis.__rectSelectLoaded = true;
  loadSettings().then((s) => (settings = s));
  onSettingsChanged((s) => (settings = s));
  window.addEventListener('mousedown', onMouseDown, true);
  window.addEventListener('mousemove', onMouseMove, true);
  window.addEventListener('mouseup', onMouseUp, true);
  window.addEventListener('click', onClick, true);
  window.addEventListener('dragstart', (e) => session && e.preventDefault(), true);
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);
  window.addEventListener('blur', () => cancel());
  // Okienko pod ikoną pyta, na jakiej stronie jest karta (bez uprawnienia do adresów kart).
  if (window === window.top) {
    try {
      chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
        if (msg?.type === 'rect-copy:site') reply({ site: SITE });
      });
    } catch {
      /* strona rozszerzenia bez runtime.onMessage */
    }
  }
}

// ---------- współrzędne ----------
// Wszystko liczymy we "współrzędnych dokumentu": pozycja w oknie + przewinięcie okna i
// przewijanych przodków elementu, od którego zaczęto. Dzięki temu prostokąt "przykleja się"
// do treści przy autoprzewijaniu.

function scrollChain(el) {
  const out = [];
  const se = document.scrollingElement;
  for (let e = el; e && e !== document.documentElement; e = e.parentElement || e.getRootNode()?.host || null) {
    if (e !== se) out.push(e);
  }
  return out;
}

function scrollOffset(chain) {
  let x = window.scrollX, y = window.scrollY;
  for (const el of chain) {
    x += el.scrollLeft;
    y += el.scrollTop;
  }
  return { x, y };
}

const toDoc = (r, off) => ({ x: r.left + off.x, y: r.top + off.y, w: r.width, h: r.height });

function selection(s) {
  const off = scrollOffset(s.chain);
  const ax = s.start.x + s.startOff.x, ay = s.start.y + s.startOff.y;
  const bx = s.cur.x + off.x, by = s.cur.y + off.y;
  // Co najmniej 1 px w każdą stronę: przeciągnięcie idealnie pionowo w dół kolumny też ją wybiera.
  const w = Math.max(1, Math.abs(bx - ax)), h = Math.max(1, Math.abs(by - ay));
  return { sel: { x: Math.min(ax, bx) - (w - Math.abs(bx - ax)) / 2, y: Math.min(ay, by) - (h - Math.abs(by - ay)) / 2, w, h }, off };
}

// ---------- zdarzenia ----------

function onMouseDown(e) {
  if (!settings.enabled || isSiteDisabled(settings, SITE) || e.button !== 0 || session || !modifierMatches(e, settings.modifier)) return;
  const target = e.composedPath()[0];
  const el = target?.nodeType === 1 ? target : target?.parentElement;
  if (!el || el === host) return;
  // W polach tekstowych zostawiamy domyślne zachowanie przeglądarki.
  if (el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return;
  e.preventDefault();
  e.stopPropagation();
  const chain = scrollChain(el);
  session = {
    el,
    chain,
    start: { x: e.clientX, y: e.clientY },
    cur: { x: e.clientX, y: e.clientY },
    startOff: scrollOffset(chain),
    active: false,
    raf: 0,
    result: null,
  };
}

function onMouseMove(e) {
  if (!session) return;
  if (!(e.buttons & 1)) return finish();
  session.cur = { x: e.clientX, y: e.clientY };
  e.preventDefault();
  if (session.active) e.stopPropagation();
  else if (Math.hypot(e.clientX - session.start.x, e.clientY - session.start.y) >= DRAG_THRESHOLD) activate();
}

function onMouseUp(e) {
  if (!session) return;
  if (e.button !== 0) return;
  if (session.active) {
    e.preventDefault();
    e.stopPropagation();
  }
  session.cur = { x: e.clientX, y: e.clientY };
  finish();
}

function onClick(e) {
  if (performance.now() < suppressClickUntil) {
    suppressClickUntil = 0;
    e.preventDefault();
    e.stopPropagation();
  }
}

function onKeyDown(e) {
  if (e.key === 'Escape' && session) {
    e.preventDefault();
    e.stopPropagation();
    cancel();
  }
}

// Puszczenie Alt po przeciągnięciu nie powinno aktywować menu przeglądarki.
function onKeyUp(e) {
  if (e.key === 'Alt' && (session?.active || performance.now() < suppressAltUntil)) {
    e.preventDefault();
    e.stopPropagation();
  }
}

// ---------- przebieg zaznaczania ----------

function activate() {
  const s = session;
  s.active = true;
  ensureOverlay();
  host.style.pointerEvents = 'auto';
  const table = s.el.closest('table');
  if (table && table.rows.length) prepareTable(s, table);
  else prepareText(s);
  const loop = () => {
    if (session !== s) return;
    autoscroll(s);
    update(s);
    s.raf = requestAnimationFrame(loop);
  };
  loop();
}

function prepareTable(s, table) {
  const off = scrollOffset(s.chain);
  const rows = Array.from(table.rows, (tr) => Array.from(tr.cells, (td) => ({ el: td, colSpan: td.colSpan, rowSpan: td.rowSpan })));
  const g = buildGrid(rows);
  for (const cell of g.cells) cell.box = toDoc(cell.el.getBoundingClientRect(), off);
  s.mode = 'table';
  s.grid = g;
  s.rowBoxes = Array.from(table.rows, (tr) => toDoc(tr.getBoundingClientRect(), off));
}

function prepareText(s) {
  const off = scrollOffset(s.chain);
  const range = document.createRange();
  const nodes = [];
  const root = document.body || document.documentElement;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (!/\S/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
      const p = n.parentElement;
      return p && !SKIP_TAGS.has(p.localName) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  for (let n; (n = walker.nextNode()); ) {
    range.selectNodeContents(n);
    const r = range.getBoundingClientRect();
    if (r.width || r.height) nodes.push({ node: n, box: toDoc(r, off), chars: null });
  }
  s.mode = 'text';
  s.nodes = nodes;
}

const intersects = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function nodeChars(entry, off) {
  const n = entry.node;
  const p = n.parentElement;
  if (p?.checkVisibility && !p.checkVisibility({ visibilityProperty: true, opacityProperty: true })) return [];
  const s = n.nodeValue;
  const range = document.createRange();
  const out = [];
  for (let i = 0; i < s.length; ) {
    const len = s.codePointAt(i) > 0xffff ? 2 : 1;
    const ch = s.slice(i, i + len);
    if (/\S/.test(ch)) {
      range.setStart(n, i);
      range.setEnd(n, i + len);
      const r = range.getClientRects()[0];
      if (r && r.width > 0 && r.height > 0) out.push({ ch, ...toDoc(r, off) });
    }
    i += len;
  }
  return out;
}

function update(s) {
  const { sel, off } = selection(s);
  let boxes = [];
  if (s.mode === 'table') {
    const block = pickBlock(s.grid, sel, s.rowBoxes);
    s.result = block;
    if (block) boxes = [...blockRows(s.grid, block).ids].map((id) => s.grid.cells[id].box);
  } else {
    const chars = [];
    for (const entry of s.nodes) {
      if (!intersects(entry.box, sel)) continue;
      entry.chars ??= nodeChars(entry, off);
      for (const c of entry.chars) if (inside(c, sel)) chars.push(c);
    }
    s.result = charsToText(chars);
    boxes = s.result.lines.map((l) => ({ x: l.x0, y: l.y0, w: l.x1 - l.x0, h: l.y1 - l.y0 }));
  }
  draw(sel, boxes, off);
}

function resultText(s) {
  if (s.mode === 'table') {
    const block = s.result;
    if (!block) return { text: '', info: '' };
    for (let r = block.r0; r <= block.r1; r++) {
      for (let c = block.c0; c <= block.c1; c++) {
        const cell = s.grid.cells[s.grid.grid[r][c]];
        if (cell && cell.text === undefined) cell.text = cleanCellText(cell.el.innerText);
      }
    }
    const { rows } = blockRows(s.grid, block);
    const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    return {
      text: formatRows(rows, settings.separator),
      info: t('infoTable', plural('cols', cols), plural('rows', rows.length)),
    };
  }
  const n = s.result?.lines.length || 0;
  return { text: s.result?.text || '', info: plural('lines', n) };
}

function finish() {
  const s = session;
  if (!s) return;
  session = null;
  cancelAnimationFrame(s.raf);
  if (!s.active) return;
  update(s);
  suppressClickUntil = performance.now() + 500;
  suppressAltUntil = performance.now() + 2000;
  host.style.pointerEvents = 'none';
  const { text, info } = resultText(s);
  if (!text.trim()) {
    toast(t('toastNothing'), s.cur);
    clearDrawing(0);
    return;
  }
  const ok = copyText(text);
  if (__TEST__) document.documentElement.dataset.rectSelectCopied = text;
  toast(ok ? t('toastCopied', info) : t('toastFailed'), s.cur);
  clearDrawing(250);
}

function cancel() {
  const s = session;
  if (!s) return;
  session = null;
  cancelAnimationFrame(s.raf);
  if (s.active) {
    host.style.pointerEvents = 'none';
    suppressAltUntil = performance.now() + 2000;
    clearDrawing(0);
  }
}

// ---------- autoprzewijanie ----------

function speed(d) {
  return Math.min(40, Math.max(2, (EDGE - d) / 2));
}

function scrollable(el, axis) {
  const st = getComputedStyle(el);
  const ov = axis === 'y' ? st.overflowY : st.overflowX;
  if (!/(auto|scroll|overlay)/.test(ov)) return false;
  return axis === 'y' ? el.scrollHeight > el.clientHeight : el.scrollWidth > el.clientWidth;
}

function autoscroll(s) {
  const { x, y } = s.cur;
  let doneX = false, doneY = false;
  for (const el of s.chain) {
    if (doneX && doneY) break;
    const r = el.getBoundingClientRect();
    if (!doneY && scrollable(el, 'y')) {
      if (y < r.top + EDGE && el.scrollTop > 0) { el.scrollTop -= speed(y - r.top); doneY = true; }
      else if (y > r.bottom - EDGE && el.scrollTop + el.clientHeight < el.scrollHeight) { el.scrollTop += speed(r.bottom - y); doneY = true; }
    }
    if (!doneX && scrollable(el, 'x')) {
      if (x < r.left + EDGE && el.scrollLeft > 0) { el.scrollLeft -= speed(x - r.left); doneX = true; }
      else if (x > r.right - EDGE && el.scrollLeft + el.clientWidth < el.scrollWidth) { el.scrollLeft += speed(r.right - x); doneX = true; }
    }
  }
  let dx = 0, dy = 0;
  if (!doneY) {
    if (y < EDGE) dy = -speed(y);
    else if (y > innerHeight - EDGE) dy = speed(innerHeight - y);
  }
  if (!doneX) {
    if (x < EDGE) dx = -speed(x);
    else if (x > innerWidth - EDGE) dx = speed(innerWidth - x);
  }
  if (dx || dy) window.scrollBy(dx, dy);
}

// ---------- nakładka (Shadow DOM, nie zmienia strony) ----------

let host = null, rectEl, boxLayer, toastEl, toastTimer, clearTimer;
const pool = [];

function ensureOverlay() {
  clearTimeout(clearTimer);
  if (host?.isConnected) {
    boxLayer.style.opacity = '1';
    return;
  }
  host = document.createElement('rect-select-overlay');
  host.style.cssText = 'all: initial; position: fixed; inset: 0; z-index: 2147483647; pointer-events: none; display: block; cursor: crosshair;';
  const root = host.attachShadow({ mode: 'closed' });
  root.innerHTML = `<style>
    :host { all: initial; }
    .rect { position: fixed; display: none; border: 1px dashed #2563eb; background: rgba(37, 99, 235, 0.06); box-sizing: border-box; }
    .boxes { position: fixed; inset: 0; transition: opacity 0.25s; }
    .boxes div { position: fixed; background: rgba(37, 99, 235, 0.22); border-radius: 2px; }
    .toast { position: fixed; display: none; padding: 6px 10px; border-radius: 6px; background: rgba(17, 24, 39, 0.92); color: #fff;
      font: 13px/1.3 system-ui, "Segoe UI", sans-serif; white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,.25); transition: opacity 0.3s; }
  </style><div class="boxes"></div><div class="rect"></div><div class="toast"></div>`;
  rectEl = root.querySelector('.rect');
  boxLayer = root.querySelector('.boxes');
  toastEl = root.querySelector('.toast');
  document.documentElement.appendChild(host);
}

function draw(sel, boxes, off) {
  Object.assign(rectEl.style, {
    display: 'block',
    left: `${sel.x - off.x}px`,
    top: `${sel.y - off.y}px`,
    width: `${sel.w}px`,
    height: `${sel.h}px`,
  });
  const n = Math.min(boxes.length, MAX_BOXES);
  while (pool.length < n) pool.push(boxLayer.appendChild(document.createElement('div')));
  for (let i = 0; i < pool.length; i++) {
    const d = pool[i];
    if (i >= n) {
      d.style.display = 'none';
      continue;
    }
    const b = boxes[i];
    d.style.cssText = `display:block;left:${b.x - off.x}px;top:${b.y - off.y}px;width:${b.w}px;height:${b.h}px`;
  }
}

function clearDrawing(delay) {
  rectEl.style.display = 'none';
  boxLayer.style.opacity = '0';
  clearTimer = setTimeout(() => {
    for (const d of pool) d.style.display = 'none';
    boxLayer.style.opacity = '1';
  }, delay + 50);
}

function toast(msg, at) {
  if (__TEST__) document.documentElement.dataset.rectSelectToast = msg;
  if (!settings.toast || !msg) return;
  ensureOverlay();
  toastEl.textContent = msg;
  Object.assign(toastEl.style, { display: 'block', opacity: '1', left: '0px', top: '0px' });
  const w = toastEl.offsetWidth, h = toastEl.offsetHeight;
  toastEl.style.left = `${Math.max(8, Math.min(at.x + 14, innerWidth - w - 8))}px`;
  toastEl.style.top = `${Math.max(8, Math.min(at.y + 18, innerHeight - h - 8))}px`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.style.opacity = '0';
    toastTimer = setTimeout(() => (toastEl.style.display = 'none'), 300);
  }, 1600);
}

// ---------- schowek ----------
// execCommand('copy') działa synchronicznie w obsłudze mouseup (także na stronach http);
// navigator.clipboard jako zapas.
function copyText(text) {
  let ok = false;
  const onCopy = (e) => {
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
    e.stopImmediatePropagation();
    ok = true;
  };
  window.addEventListener('copy', onCopy, true);
  try {
    document.execCommand('copy');
  } catch {
    /* ignoruj */
  }
  window.removeEventListener('copy', onCopy, true);
  if (!ok && navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).catch(() => {});
    ok = true;
  }
  return ok;
}

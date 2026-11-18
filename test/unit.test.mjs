// Testy logiki bez przeglądarki: siatka tabeli, wybór bloku, formatowanie, składanie tekstu.
import assert from 'node:assert/strict';
import { buildGrid, pickBlock, blockRows, formatRows, cleanCellText } from '../src/lib/table.js';
import { charsToText } from '../src/lib/text.js';
import fs from 'node:fs';
import { modifierMatches, siteKey, isSiteDisabled, DEFAULTS } from '../src/lib/settings.js';
import { pluralMsg } from '../src/lib/i18n.js';
import { toChromeMessages, makeGetMessage } from '../scripts/locales.mjs';

// Tabela 3 kolumny x 4 wiersze, komórki 100x20, wiersz 2 ma colspan=2 na początku,
// komórka (0,2) ma rowspan=2.
const W = 100, H = 20;
const spec = [
  [{ t: 'A1' }, { t: 'B1' }, { t: 'C1', rowSpan: 2 }],
  [{ t: 'A2' }, { t: 'B2' }],
  [{ t: 'AB3', colSpan: 2 }, { t: 'C3' }],
  [{ t: 'A4' }, { t: 'B4' }, { t: 'C4' }],
];
const g = buildGrid(spec.map((row) => row.map((c) => ({ colSpan: c.colSpan, rowSpan: c.rowSpan, text: c.t }))));
for (const cell of g.cells) cell.box = { x: cell.c * W, y: cell.r * H, w: cell.cs * W, h: cell.rs * H };
const rowBoxes = spec.map((_, r) => ({ x: 0, y: r * H, w: 3 * W, h: H }));

assert.equal(g.cols, 3);
assert.equal(g.rows, 4);
assert.equal(g.cells[g.grid[1][2]].text, 'C1'); // rowspan przykrywa (1,2)
assert.equal(g.cells[g.grid[2][1]].text, 'AB3'); // colspan przykrywa (2,1)

const take = (sel, sep) => {
  const b = pickBlock(g, sel, rowBoxes);
  return b ? formatRows(blockRows(g, b).rows, sep) : null;
};

// Jedna kolumna B (środek) przez całą wysokość: AB3 zaczyna się w kolumnie A, ale w bloku B ląduje w B.
assert.equal(take({ x: 120, y: 5, w: 40, h: 70 }), 'B1\nB2\nAB3\nB4');
// Kolumna C: C1 ze scalenia tylko raz, potem pusty wiersz.
assert.equal(take({ x: 230, y: 2, w: 20, h: 75 }), 'C1\n\nC3\nC4');
// Dwie kolumny A-B, wiersze 1-2.
assert.equal(take({ x: 50, y: 5, w: 100, h: 20 }), 'A1\tB1\nA2\tB2');
// Wyrównanie spacjami.
assert.equal(take({ x: 50, y: 5, w: 220, h: 70 }, 'spaces'),
  'A1   B1  C1\nA2   B2\nAB3      C3\nA4   B4  C4');
// Zaznaczenie poza tabelą.
assert.equal(take({ x: 400, y: 0, w: 50, h: 50 }), null);
// Samo dotknięcie krawędzi komórki nie wybiera sąsiedniej kolumny.
assert.equal(take({ x: 100, y: 5, w: 99, h: 10 }), 'B1');

// Ukryty wiersz (zerowa wysokość) jest pomijany.
const g2 = buildGrid([[{ text: 'x' }], [{ text: 'ukryty' }], [{ text: 'y' }]]);
g2.cells[0].box = { x: 0, y: 0, w: 50, h: 20 };
g2.cells[1].box = { x: 0, y: 20, w: 50, h: 0 };
g2.cells[2].box = { x: 0, y: 20, w: 50, h: 20 };
const b2 = pickBlock(g2, { x: 10, y: 5, w: 10, h: 30 }, [{ y: 0, h: 20 }, { y: 20, h: 0 }, { y: 20, h: 20 }]);
assert.equal(formatRows(blockRows(g2, b2).rows), 'x\ny');

assert.equal(cleanCellText('  12,50\n zł\t '), '12,50 zł');

// ---------- tekst ----------
// Proporcjonalna czcionka: słowa jako znaki o różnej szerokości.
function word(str, x, y, widths = [7, 5, 9, 6]) {
  const out = [];
  let cx = x;
  [...str].forEach((ch, i) => {
    const w = widths[i % widths.length];
    out.push({ ch, x: cx, y, w, h: 16 });
    cx += w;
  });
  return { chars: out, end: cx };
}
const a = word('Ala', 0, 0);
const b = word('kota', a.end + 4, 0);
const c = word('Druga', 0, 20);
assert.equal(charsToText([...b.chars, ...c.chars, ...a.chars]).text, 'Ala kota\nDruga');

// Czcionka o stałej szerokości (8 px): wcięcia i kilka spacji zachowane, pusta linia też.
const mono = (str, col, row) => [...str].flatMap((ch, i) => (ch === ' ' ? [] : [{ ch, x: (col + i) * 8, y: row * 18, w: 8, h: 16 }]));
const code = [...mono('if (x) {', 0, 0), ...mono('a  = 1;', 4, 1), ...mono('}', 2, 2), ...mono('end', 0, 4)];
assert.equal(charsToText(code).text, 'if (x) {\n    a  = 1;\n  }\n\nend');

assert.equal(charsToText([]).text, '');

// ---------- ustawienia ----------
const ev = (altKey, ctrlKey, shiftKey) => ({ altKey, ctrlKey, shiftKey, metaKey: false });
assert.ok(modifierMatches(ev(true, false, false), 'alt'));
assert.ok(!modifierMatches(ev(true, true, false), 'alt')); // AltGr to nie Alt
assert.ok(modifierMatches(ev(true, true, false), 'ctrl+alt'));
assert.ok(modifierMatches(ev(true, false, true), 'alt+shift'));

assert.equal(siteKey('https://www.example.com/a?b'), 'example.com');
assert.equal(siteKey('http://localhost:8080/'), 'localhost');
assert.equal(siteKey('file:///C:/x.html'), 'file://');
assert.equal(siteKey('brave://extensions'), null);
assert.equal(siteKey('nie adres'), null);
assert.ok(isSiteDisabled({ ...DEFAULTS, disabledSites: ['example.com'] }, 'example.com'));
assert.ok(!isSiteDisabled({ ...DEFAULTS, disabledSites: ['example.com'] }, null));

// ---------- tłumaczenia ----------
const LANGS = ['pl', 'en', 'de', 'fr', 'it', 'uk', 'es'];
const dir = new URL('../src/locales/', import.meta.url);
assert.deepEqual(fs.readdirSync(dir).map((f) => f.replace('.json', '')).sort(), [...LANGS].sort());
const locales = Object.fromEntries(LANGS.map((l) => [l, JSON.parse(fs.readFileSync(new URL(l + '.json', dir), 'utf8'))]));
const isPlural = (k) => /_(zero|one|two|few|many|other)$/.test(k);
const baseKeys = (o) => Object.keys(o).filter((k) => !isPlural(k)).sort();
const pluralBases = ['cols', 'rows', 'lines'];
const placeholdersOf = (str) => (str.match(/\{\d\}/g) || []).sort().join();

for (const lang of LANGS) {
  const m = locales[lang];
  // Te same klucze co po angielsku, bez pustych tekstów, te same podstawienia {1} {2}.
  assert.deepEqual(baseKeys(m), baseKeys(locales.en), `${lang}: inne klucze niż en`);
  for (const k of baseKeys(m)) {
    assert.ok(m[k].trim(), `${lang}.${k} pusty`);
    assert.equal(placeholdersOf(m[k]), placeholdersOf(locales.en[k]), `${lang}.${k}: inne podstawienia`);
  }
  // Każda kategoria liczby mnogiej wymagana przez język (CLDR w Node/Chromium) ma tekst.
  const cats = new Intl.PluralRules(lang).resolvedOptions().pluralCategories;
  for (const b of pluralBases) for (const c of cats) assert.ok(m[`${b}_${c}`], `${lang}: brak ${b}_${c}`);
  // Limity Chrome Web Store / manifestu.
  assert.ok(m.extName.length <= 75, `${lang}: nazwa > 75 znaków`);
  assert.ok(m.extDescription.length <= 132, `${lang}: opis ${m.extDescription.length} > 132 znaków`);
}

// Konwersja do messages.json i podstawienia jak w chrome.i18n.
const msg = (lang) => makeGetMessage(toChromeMessages(locales[lang]));
const P = (lang, base, n) => pluralMsg((k, sub) => msg(lang)(k, [sub]), lang, base, n);
assert.equal(msg('pl')('toastCopied', ['3 wiersze']), 'Skopiowano: 3 wiersze');
assert.equal(msg('en')('infoTable', ['1 column', '5 rows']), '1 column × 5 rows');
assert.equal(P('pl', 'rows', 1), '1 wiersz');
assert.equal(P('pl', 'rows', 3), '3 wiersze');
assert.equal(P('pl', 'rows', 12), '12 wierszy');
assert.equal(P('pl', 'cols', 22), '22 kolumny');
assert.equal(P('pl', 'lines', 25), '25 linii');
assert.equal(P('uk', 'rows', 1), '1 рядок');
assert.equal(P('uk', 'rows', 4), '4 рядки');
assert.equal(P('uk', 'rows', 11), '11 рядків');
assert.equal(P('uk', 'cols', 21), '21 стовпець');
assert.equal(P('de', 'cols', 1), '1 Spalte');
assert.equal(P('de', 'cols', 2), '2 Spalten');
assert.equal(P('fr', 'rows', 0), '0 ligne');
assert.equal(P('fr', 'rows', 2), '2 lignes');
assert.equal(P('es', 'lines', 1), '1 línea');
assert.equal(P('it', 'rows', 7), '7 righe');

console.log('Testy jednostkowe: OK');

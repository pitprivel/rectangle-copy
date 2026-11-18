// Logika tabel niezależna od DOM: siatka z colspan/rowspan, wybór bloku, formatowanie.

// rows: Array<Array<{ colSpan, rowSpan, ...dowolne }>> (kolejność jak table.rows / row.cells).
// Zwraca { cells, grid, rows, cols }; grid[r][c] = indeks komórki w cells (undefined = dziura).
export function buildGrid(rows) {
  const n = rows.length;
  const cells = [];
  const grid = Array.from({ length: n }, () => []);
  for (let r = 0; r < n; r++) {
    let c = 0;
    for (const cell of rows[r]) {
      while (grid[r][c] !== undefined) c++;
      const cs = Math.min(Math.max(1, cell.colSpan || 1), 1000);
      // rowspan="0" w HTML = do końca tabeli.
      const rs = cell.rowSpan === 0 ? n - r : Math.min(Math.max(1, cell.rowSpan || 1), n - r);
      const id = cells.length;
      cells.push({ ...cell, r, c, rs, cs });
      for (let dr = 0; dr < rs; dr++) for (let dc = 0; dc < cs; dc++) grid[r + dr][c + dc] = id;
      c += cs;
    }
  }
  const cols = grid.reduce((m, g) => Math.max(m, g.length), 0);
  return { cells, grid, rows: n, cols };
}

const overlap = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);

// Prostokąt komórki "trafiony", jeśli zaznaczenie wchodzi w niego (z marginesem 1 px, żeby
// samo dotknięcie krawędzi nie liczyło się).
export function hits(box, sel) {
  return (
    box.w > 0 && box.h > 0 &&
    overlap(box.x + 1, box.x + box.w - 1, sel.x, sel.x + sel.w) > 0 &&
    overlap(box.y + 1, box.y + box.h - 1, sel.y, sel.y + sel.h) > 0
  );
}

// Pasy wierszy i kolumn (współrzędne x/y) do rozstrzygania, które pozycje siatki objęło zaznaczenie.
// rowBoxes[r] = prostokąt wiersza; kolumny liczone z komórek bez colspan.
export function bands(g, rowBoxes) {
  const colBand = Array.from({ length: g.cols }, () => null);
  for (const cell of g.cells) {
    if (cell.cs !== 1 || !cell.box || cell.box.w <= 0) continue;
    const b = colBand[cell.c];
    const x0 = cell.box.x, x1 = cell.box.x + cell.box.w;
    colBand[cell.c] = b ? [Math.min(b[0], x0), Math.max(b[1], x1)] : [x0, x1];
  }
  // Kolumna złożona wyłącznie z komórek scalonych: dzielimy szerokość komórki równo.
  for (const cell of g.cells) {
    if (cell.cs === 1 || !cell.box || cell.box.w <= 0) continue;
    const part = cell.box.w / cell.cs;
    for (let k = 0; k < cell.cs; k++) {
      if (!colBand[cell.c + k]) colBand[cell.c + k] = [cell.box.x + k * part, cell.box.x + (k + 1) * part];
    }
  }
  const rowBand = rowBoxes.map((b) => (b && b.h > 0 ? [b.y, b.y + b.h] : null));
  return { rowBand, colBand };
}

// Blok siatki objęty zaznaczeniem: { r0, r1, c0, c1, hit:Set<id> } albo null.
export function pickBlock(g, sel, rowBoxes) {
  const { rowBand, colBand } = bands(g, rowBoxes);
  const inRow = (r) => rowBand[r] && overlap(rowBand[r][0] + 1, rowBand[r][1] - 1, sel.y, sel.y + sel.h) > 0;
  const inCol = (c) => colBand[c] && overlap(colBand[c][0] + 1, colBand[c][1] - 1, sel.x, sel.x + sel.w) > 0;
  let r0 = Infinity, r1 = -1, c0 = Infinity, c1 = -1;
  const hit = new Set();
  g.cells.forEach((cell, id) => {
    if (!cell.box || !hits(cell.box, sel)) return;
    hit.add(id);
    for (let r = cell.r; r < cell.r + cell.rs; r++) if (inRow(r)) { r0 = Math.min(r0, r); r1 = Math.max(r1, r); }
    for (let c = cell.c; c < cell.c + cell.cs; c++) if (inCol(c)) { c0 = Math.min(c0, c); c1 = Math.max(c1, c); }
  });
  if (r1 < 0 || c1 < 0) return null;
  return { r0, r1, c0, c1, hit, rowBand, colBand };
}

// Wiersze tekstu dla bloku. Tekst scalonej komórki trafia do jej pierwszej pozycji w bloku.
// Ukryte wiersze/kolumny (zerowy rozmiar) są pomijane.
export function blockRows(g, block) {
  const out = [];
  const ids = new Set();
  for (let r = block.r0; r <= block.r1; r++) {
    if (!block.rowBand[r]) continue;
    const row = [];
    for (let c = block.c0; c <= block.c1; c++) {
      if (!block.colBand[c]) continue;
      const id = g.grid[r][c];
      if (id === undefined) { row.push(''); continue; }
      const cell = g.cells[id];
      const first = r === Math.max(cell.r, block.r0) && c === Math.max(cell.c, block.c0);
      row.push(first ? cell.text ?? '' : '');
      ids.add(id);
    }
    out.push(row);
  }
  return { rows: out, ids };
}

export function cleanCellText(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

// Długość widoczna w notatniku (znaki szerokie CJK/emoji liczone podwójnie – w przybliżeniu).
function visualLength(s) {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x300 && cp <= 0x36f) continue; // znaki łączone
    n += (cp >= 0x1100 && (cp <= 0x115f || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) ||
      (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x20000 && cp <= 0x3fffd))) ? 2 : 1;
  }
  return n;
}

// separator: 'tab' – kolumny rozdzielone tabulatorem; 'spaces' – wyrównane spacjami (czytelne w notatniku).
export function formatRows(rows, separator = 'tab') {
  if (separator === 'spaces') {
    const widths = [];
    for (const row of rows) row.forEach((v, i) => (widths[i] = Math.max(widths[i] || 0, visualLength(v))));
    return rows
      .map((row) => row.map((v, i) => (i === row.length - 1 ? v : v + ' '.repeat(widths[i] - visualLength(v) + 2))).join('').trimEnd())
      .join('\n');
  }
  return rows.map((row) => row.join('\t').replace(/\t+$/, '')).join('\n');
}

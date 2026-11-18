// Składanie tekstu z pojedynczych znaków (z ich prostokątami na ekranie) – tryb zwykłego tekstu.
// chars: [{ ch, x, y, w, h }] – znaki bez białych spacji; odstępy odtwarzamy z geometrii.

const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((p, q) => p - q);
  return s[s.length >> 1];
};

// Znak należy do zaznaczenia, gdy jego środek leży w prostokącie.
export function inside(c, sel) {
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  return cx >= sel.x && cx <= sel.x + sel.w && cy >= sel.y && cy <= sel.y + sel.h;
}

// Grupuje znaki w linie (po pionowym środku), sortuje w linii po x.
export function groupLines(chars) {
  const sorted = [...chars].sort((a, b) => a.y + a.h / 2 - (b.y + b.h / 2) || a.x - b.x);
  const lines = [];
  for (const c of sorted) {
    const cy = c.y + c.h / 2;
    const line = lines[lines.length - 1];
    if (line && Math.abs(cy - line.cy) <= Math.min(line.h, c.h) * 0.5) {
      line.chars.push(c);
      line.cy = (line.cy * (line.chars.length - 1) + cy) / line.chars.length;
      line.h = Math.max(line.h, c.h);
    } else {
      lines.push({ chars: [c], cy, h: c.h });
    }
  }
  for (const l of lines) {
    l.chars.sort((a, b) => a.x - b.x);
    const ws = l.chars.map((c) => c.w);
    // Czcionka o stałej szerokości: wszystkie znaki tej samej szerokości (z tolerancją subpikseli).
    l.mono = l.chars.length >= 2 && Math.max(...ws) - Math.min(...ws) <= 0.6;
    l.charW = median(ws);
    l.x0 = l.chars[0].x;
    l.x1 = Math.max(...l.chars.map((c) => c.x + c.w));
    l.y0 = Math.min(...l.chars.map((c) => c.y));
    l.y1 = Math.max(...l.chars.map((c) => c.y + c.h));
  }
  return lines;
}

// Tekst jednej linii: odstęp między znakami większy niż ~1/5 wysokości = spacja.
// W czcionce o stałej szerokości liczba spacji odpowiada szerokości odstępu (zachowuje wcięcia i kolumny).
function lineText(l) {
  let s = '';
  let prevRight = null;
  for (const c of l.chars) {
    if (prevRight !== null) {
      const gap = c.x - prevRight;
      if (l.mono && l.charW > 0) {
        const n = Math.round(gap / l.charW);
        if (n > 0) s += ' '.repeat(Math.min(n, 200));
      } else if (gap > l.h * 0.2) {
        s += ' ';
      }
    }
    s += c.ch;
    prevRight = Math.max(prevRight ?? -Infinity, c.x + c.w);
  }
  return s;
}

// Zwraca { text, lines } – lines z prostokątami do podświetlenia.
export function charsToText(chars) {
  const lines = groupLines(chars);
  if (!lines.length) return { text: '', lines };

  // Linia z jednym znakiem (np. "}") nie pokaże sama, czy czcionka jest stała – przyjmujemy to,
  // jeśli znak ma szerokość jak w pozostałych liniach o stałej szerokości.
  const monoW = median(lines.filter((l) => l.mono).map((l) => l.charW));
  if (monoW > 0) {
    for (const l of lines) {
      if (!l.mono && l.chars.length === 1 && Math.abs(l.charW - monoW) <= 0.6) l.mono = true;
    }
  }

  // Wcięcie linii o stałej szerokości względem najbardziej wysuniętej w lewo takiej linii.
  const monoLines = lines.filter((l) => l.mono);
  const monoLeft = monoLines.length ? Math.min(...monoLines.map((l) => l.x0)) : 0;

  // Pusta linia, gdy odstęp pionowy wyraźnie większy niż typowy krok między liniami.
  const steps = [];
  for (let i = 1; i < lines.length; i++) steps.push(lines[i].cy - lines[i - 1].cy);
  const step = median(steps);

  const out = [];
  lines.forEach((l, i) => {
    if (i > 0 && step > 0 && lines[i].cy - lines[i - 1].cy > step * 1.7) out.push('');
    const indent = l.mono && l.charW > 0 ? Math.max(0, Math.round((l.x0 - monoLeft) / l.charW)) : 0;
    out.push(' '.repeat(Math.min(indent, 200)) + lineText(l));
  });
  return { text: out.join('\n'), lines };
}

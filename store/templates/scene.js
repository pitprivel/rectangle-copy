// Scena do zrzutów ekranu sklepu: ?lang=pl&shot=1..4[&img=ścieżka zrzutu okienka]
const q = new URLSearchParams(location.search);
const lang = q.get('lang') || 'en';

window.sceneReady = fetch(`../listing/${lang}.json`)
  .then((r) => r.json())
  .then((L) => {
    document.documentElement.lang = lang;
    const fmt = new Intl.NumberFormat(lang, { style: 'currency', currency: L.currency });
    document.getElementById('tableTitle').textContent = L.tableTitle;
    document.getElementById('textTitle').textContent = L.textTitle;
    document.getElementById('pastedTitle').textContent = L.pasted;
    const head = document.querySelector('#t thead tr');
    L.head.forEach((h, i) => head.insertAdjacentHTML('beforeend', `<th class="${i >= 2 ? 'num' : ''}">${h}</th>`));
    const body = document.querySelector('#t tbody');
    const qty = [2, 1, 3, 1, 2, 1];
    L.items.forEach((name, i) => {
      const tr = document.createElement('tr');
      for (const [v, num] of [[name], [`PRD-${1001 + i}`], [String(qty[i]), true], [fmt.format(L.prices[i]), true]]) {
        const td = document.createElement('td');
        td.textContent = v;
        if (num) td.className = 'num';
        tr.appendChild(td);
      }
      body.appendChild(tr);
    });

    window.setShot = (n) => {
      const [cap, sub] = L.captions[n - 1];
      document.getElementById('cap').textContent = cap;
      document.getElementById('sub').textContent = sub;
      document.getElementById('stage-table').hidden = !(n === 1 || n === 2);
      document.getElementById('stage-text').hidden = n !== 3;
      document.getElementById('stage-popup').hidden = n !== 4;
    };
    // Kursor nie trafia na zrzuty ekranu – dorysowujemy go (ostrze w punkcie x, y).
    window.showCursor = (x, y) => Object.assign(document.getElementById('cursor').style, { display: 'block', left: `${x - 3}px`, top: `${y - 3}px` });
    window.setShot(Number(q.get('shot')) || 1);
    if (q.get('img')) document.getElementById('popupImg').src = q.get('img');

    // Wersja testowa dodatku zapisuje skopiowany tekst w <html data-rect-select-copied>.
    new MutationObserver(() => {
      const text = document.documentElement.dataset.rectSelectCopied;
      if (text == null) return;
      document.getElementById('pasted').textContent = text;
      document.getElementById('paste').classList.remove('hidden');
    }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-rect-select-copied'] });
  });

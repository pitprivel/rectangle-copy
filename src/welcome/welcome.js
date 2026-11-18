// Strona powitalna: tłumaczenia, klawisz z ustawień, ceny w walucie języka.
import { loadSettings, onSettingsChanged } from '../lib/settings.js';
import { t, applyI18n, uiLang, modifierLabel, pasteShortcut, COFFEE_URL } from '../lib/i18n.js';

applyI18n();
document.title = t('extName') || document.title;
document.getElementById('coffee').href = COFFEE_URL;

const lang = uiLang();
const base = lang.split('-')[0];
const currency = { pl: 'PLN', uk: 'UAH', en: 'USD' }[base] || 'EUR';
const prices = { PLN: [5.49, 3.2, 8.99, 12.3], UAH: [42, 38, 95, 120], USD: [3.49, 1.99, 4.29, 5.49], EUR: [2.49, 1.19, 2.79, 3.99] }[currency];
const fmt = new Intl.NumberFormat(lang, { style: 'currency', currency });
document.querySelectorAll('#demo td.price').forEach((td, i) => (td.textContent = fmt.format(prices[i])));

// Tekst kroku z klawiszem w <kbd>: wstawiamy znacznik i dzielimy po nim
// (chrome.i18n wycina znaki sterujące, więc znacznik jest zwykłym tekstem).
function stepWithKey(el, key, label) {
  const MARK = '@@KEY@@';
  const [before, after = ''] = t(key, MARK).split(MARK);
  el.replaceChildren(before, Object.assign(document.createElement('kbd'), { textContent: label }), after);
}

document.getElementById('paste').placeholder = t('pasteHere', pasteShortcut());

function render(s) {
  stepWithKey(document.getElementById('step1'), 'step1', modifierLabel(s.modifier));
  stepWithKey(document.getElementById('step3'), 'step3', pasteShortcut());
  document.getElementById('animKey').textContent = modifierLabel(s.modifier);
}
loadSettings().then(render);
onSettingsChanged(render);

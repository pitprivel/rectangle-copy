// Tłumaczenia: chrome.i18n (pliki _locales budowane z src/locales/*.json) + odmiana liczebników
// przez Intl.PluralRules (chrome.i18n nie zna liczby mnogiej).

export const COFFEE_URL = 'https://buycoffee.to/puzzelki-po-godzinach';

export function t(key, ...subs) {
  try {
    return chrome.i18n.getMessage(key, subs.map(String)) || '';
  } catch {
    return ''; // kontekst dodatku unieważniony (np. po przeładowaniu dodatku)
  }
}

export function uiLang() {
  try {
    return (chrome.i18n.getMessage('@@ui_locale') || 'en').replace('_', '-');
  } catch {
    return 'en';
  }
}

// get(key, sub) – funkcja tłumacząca; klucze w postaci `${base}_${kategoria}` (one/few/many/other).
export function pluralMsg(get, lang, base, n) {
  let cat = 'other';
  try {
    cat = new Intl.PluralRules(lang).select(n);
  } catch {
    /* nieznany język */
  }
  const num = n.toLocaleString(lang);
  return get(`${base}_${cat}`, num) || get(`${base}_other`, num);
}

export const plural = (base, n) => pluralMsg(t, uiLang(), base, n);

export const isMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform || navigator.userAgent || '');

export function keyName(k) {
  if (isMac) return { ctrl: '⌃ Control', alt: '⌥ Option', shift: '⇧ Shift' }[k];
  return t({ ctrl: 'keyCtrl', alt: 'keyAlt', shift: 'keyShift' }[k]) || k;
}

// 'ctrl+alt' -> 'Strg + Alt' (po niemiecku), '⌃ Control + ⌥ Option' na Macu.
export function modifierLabel(mod) {
  return mod.split('+').map(keyName).join(' + ');
}

export const pasteShortcut = () => (isMac ? '⌘ V' : `${keyName('ctrl')} + V`);

// Elementy z data-i18n="klucz" dostają przetłumaczony tekst; data-i18n-args="a|b" – podstawienia.
export function applyI18n(root = document) {
  for (const el of root.querySelectorAll('[data-i18n]')) {
    const args = el.dataset.i18nArgs ? el.dataset.i18nArgs.split('|') : [];
    const msg = t(el.dataset.i18n, ...args);
    if (msg) el.textContent = msg;
  }
  if (root === document) document.documentElement.lang = uiLang();
}

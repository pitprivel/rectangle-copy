// Ustawienia w chrome.storage.sync (synchronizowane przez Brave/Chrome Sync).
export const DEFAULTS = {
  enabled: true,
  modifier: 'alt', // 'alt' | 'alt+shift' | 'ctrl+alt'
  separator: 'tab', // 'tab' | 'spaces'
  toast: true,
  disabledSites: [], // klucze z siteKey()
};

export async function loadSettings() {
  try {
    return { ...DEFAULTS, ...(await chrome.storage.sync.get(DEFAULTS)) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(patch) {
  return chrome.storage.sync.set(patch);
}

export function onSettingsChanged(cb) {
  try {
    chrome.storage.onChanged.addListener((_changes, area) => {
      if (area === 'sync') loadSettings().then(cb);
    });
  } catch {
    /* kontekst dodatku unieważniony (np. po przeładowaniu) */
  }
}

// Czy zdarzenie myszy ma dokładnie wymagane modyfikatory.
export function modifierMatches(e, modifier) {
  const want = {
    alt: [true, false, false],
    'alt+shift': [true, false, true],
    'ctrl+alt': [true, true, false],
  }[modifier] || [true, false, false];
  return e.altKey === want[0] && e.ctrlKey === want[1] && e.shiftKey === want[2] && !e.metaKey;
}

// Klucz strony do listy wyłączonych: nazwa hosta (bez "www."), "file://" dla plików lokalnych,
// null dla stron, na których dodatek i tak nie działa.
export function siteKey(url) {
  try {
    const u = new URL(url);
    if (u.protocol === 'file:') return 'file://';
    if (u.protocol === 'http:' || u.protocol === 'https:') return u.hostname.replace(/^www\./, '');
  } catch {
    /* zły adres */
  }
  return null;
}

export function isSiteDisabled(settings, key) {
  return !!key && settings.disabledSites.includes(key);
}

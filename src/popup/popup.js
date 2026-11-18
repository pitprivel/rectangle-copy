// Okienko pod ikoną dodatku (i ta sama strona jako opcje w brave://extensions).
import { loadSettings, saveSettings, siteKey } from '../lib/settings.js';
import { t, applyI18n, modifierLabel, COFFEE_URL } from '../lib/i18n.js';

/* global __TEST__ */
applyI18n();
for (const el of document.querySelectorAll('[data-mod]')) el.textContent = modifierLabel(el.dataset.mod);
document.getElementById('coffee').href = COFFEE_URL;
document.getElementById('howTo').addEventListener('click', (e) => {
  e.preventDefault();
  chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
  window.close();
});

const $ = (id) => document.getElementById(id);

// Czy to okienko pod ikoną (a nie strona opcji w brave://extensions)?
function isPopup() {
  if (__TEST__ && new URLSearchParams(location.search).has('testTab')) return true;
  try {
    return chrome.extension.getViews({ type: 'popup' }).includes(window);
  } catch {
    return false;
  }
}

async function activeTab() {
  if (__TEST__) {
    const id = Number(new URLSearchParams(location.search).get('testTab'));
    if (id) return chrome.tabs.get(id);
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

// Strona karty: pytamy skrypt dodatku w tej karcie. Brak odpowiedzi = strona przeglądarki
// albo karta otwarta przed instalacją/odświeżeniem dodatku.
async function tabSite() {
  try {
    const tab = await activeTab();
    if (!tab?.id) return { state: 'none' };
    if (tab.url && !siteKey(tab.url)) return { state: 'unsupported' };
    const res = await chrome.tabs.sendMessage(tab.id, { type: 'rect-copy:site' }, { frameId: 0 });
    return res?.site ? { state: 'ok', site: res.site } : { state: 'unsupported' };
  } catch {
    return { state: 'reload' };
  }
}

Promise.all([loadSettings(), isPopup() ? tabSite() : Promise.resolve(null)]).then(([s, site]) => {
  document.body.classList.toggle('embedded', !site);
  $('enabled').checked = s.enabled;
  $('toast').checked = s.toast;
  for (const name of ['modifier', 'separator']) {
    for (const r of document.querySelectorAll(`input[name="${name}"]`)) {
      r.checked = r.value === s[name];
      r.addEventListener('change', () => r.checked && saveSettings({ [name]: r.value }));
    }
  }

  if (site) {
    $('site').hidden = false;
    if (site.state === 'ok') {
      $('siteLabel').textContent = t('siteOn', site.site);
      $('siteOn').checked = !s.disabledSites.includes(site.site);
      $('siteOn').addEventListener('change', async () => {
        const { disabledSites } = await loadSettings();
        const list = disabledSites.filter((k) => k !== site.site);
        if (!$('siteOn').checked) list.push(site.site);
        saveSettings({ disabledSites: list });
      });
    } else {
      $('siteOn').closest('label').hidden = true;
      $('siteUnsupported').hidden = false;
      $('siteUnsupported').textContent = t(site.state === 'reload' ? 'siteReload' : 'siteUnsupported');
    }
  }

  const refresh = () => $('site').classList.toggle('disabled', !$('enabled').checked);
  refresh();
  $('enabled').addEventListener('change', () => {
    saveSettings({ enabled: $('enabled').checked });
    refresh();
  });
  $('toast').addEventListener('change', () => saveSettings({ toast: $('toast').checked }));
});

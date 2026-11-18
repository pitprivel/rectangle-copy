// Po pierwszej instalacji otwiera stronę powitalną z instrukcją (raz; nie przy aktualizacjach).
chrome.runtime.onInstalled.addListener(({ reason }) => {
  if (reason === chrome.runtime.OnInstalledReason.INSTALL) {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
  }
});

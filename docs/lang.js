// Bez kotwicy w adresie przewija do sekcji w języku przeglądarki (jeśli jest).
(function () {
  if (location.hash) return;
  var langs = navigator.languages || [navigator.language || 'en'];
  for (var i = 0; i < langs.length; i++) {
    var el = document.getElementById(String(langs[i]).slice(0, 2).toLowerCase());
    if (el && el.tagName === 'SECTION') {
      if (el.id !== 'en') el.scrollIntoView();
      return;
    }
  }
})();

// Płaskie tłumaczenia { klucz: "tekst z {1}" } -> format chrome.i18n (messages.json z placeholders).
export function toChromeMessages(flat) {
  const out = {};
  for (const [key, text] of Object.entries(flat)) {
    const placeholders = {};
    const message = text
      .replace(/\$/g, '$$$$') // dosłowny "$" w chrome.i18n zapisuje się jako "$$"
      .replace(/\{(\d)\}/g, (_, n) => {
        placeholders[`p${n}`] = { content: `$${n}` };
        return `$P${n}$`;
      });
    out[key] = Object.keys(placeholders).length ? { message, placeholders } : { message };
  }
  return out;
}

// Odwzorowanie chrome.i18n.getMessage dla testów w Node.
export function makeGetMessage(messages) {
  return (key, subs = []) => {
    const m = messages[key];
    if (!m) return '';
    const list = Array.isArray(subs) ? subs : [subs];
    return m.message
      .replace(/\$(\w+)\$/g, (_, name) => {
        const ph = m.placeholders?.[name.toLowerCase()];
        return ph ? ph.content.replace(/\$(\d)/g, (_, i) => list[i - 1] ?? '') : '';
      })
      .replace(/\$\$/g, '$');
  };
}

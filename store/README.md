# Chrome Web Store – co wkleić w które pole

Materiały generuje `npm run store:assets` (Brave z prawdziwym dodatkiem, osobno dla każdego języka) do `store/out/`:

```
store/out/icon-128.png                ikona sklepu (96 px grafiki + 16 px marginesu)
store/out/<język>/1-table.jpg         zrzuty 1280×800
store/out/<język>/2-copied.jpg
store/out/<język>/3-text.jpg
store/out/<język>/4-settings.jpg
store/out/<język>/promo-440x280.jpg   mały baner promocyjny
store/out/<język>/description.txt     pełny opis do wklejenia
store/out/<język>/name-and-summary.txt  nazwa i krótki opis (tylko do wglądu – biorą się z manifestu)
```

Języki: `en` (domyślny), `pl`, `de`, `fr`, `it`, `es`, `uk`. Teksty źródłowe: `store/listing/<język>.json`.

Paczka: `npm run pack:store` → `release/rectangle-copy-<wersja>-store.zip` (bez pola `key`).

---

## 0. Konto (jednorazowo)

1. https://chrome.google.com/webstore/devconsole – zaloguj się kontem Google, zapłać jednorazową opłatę rejestracyjną.
2. **Account → Contact email:** `rectanglecopy@gmail.com` (zweryfikuj kliknięciem w link z maila).
3. **Account → Trader status:** *Non-trader* (osoba prywatna, bez działalności).
4. Publisher name: `pitprivel`.

## 1. Nowy element

**Items → New item** → wgraj `release/rectangle-copy-1.0.0-store.zip`.
Nazwa i krótki opis w każdym języku pobiorą się same z `_locales` w paczce.

## 2. Zakładka „Store listing”

Na górze jest wybór języka – **dla każdego z 7 języków** wypełnij:

| Pole | Co wpisać |
|---|---|
| Description | zawartość `store/out/<język>/description.txt` |
| Screenshots | `1-table.jpg`, `2-copied.jpg`, `3-text.jpg`, `4-settings.jpg` z `store/out/<język>/` (w tej kolejności) |
| Small promo tile (440×280) | `store/out/<język>/promo-440x280.jpg` |

Pola wspólne (wystarczy raz):

| Pole | Wartość |
|---|---|
| Category | **Productivity → Tools** (Narzędzia) |
| Language | English (domyślny); pozostałe dodasz przyciskiem języka |
| Store icon | `store/out/icon-128.png` |
| Marquee promo tile | puste (opcjonalne) |
| Official URL | puste (wymaga zweryfikowanej domeny) |
| Homepage URL | `https://github.com/pitprivel/rectangle-copy` |
| Support URL | `https://github.com/pitprivel/rectangle-copy/issues` |
| Mature content | No |

## 3. Zakładka „Privacy”

Formularz jest po angielsku – wklej dokładnie te teksty.

**Single purpose description**
> Rectangle Copy lets the user select a rectangular area of a web page by holding a key and dragging the mouse, and copies the text inside it (for example a single table column) to the clipboard as plain text.

**Permission justification – activeTab**
> When the user opens the toolbar popup, the extension asks the content script in the current tab for the site name, so the user can turn the extension off on that site. No page content is read through this permission.

**Permission justification – clipboardWrite**
> The core feature: after the user finishes dragging, the selected text is written to the clipboard. The extension never reads the clipboard.

**Permission justification – storage**
> Stores the user’s settings: the key used for dragging, the column separator, whether to show the “Copied” message and the list of sites where the user turned the extension off.

**Permission justification – Host permission (content script on all sites)**
> The user can select and copy a rectangle on any web page, so the content script must run on all sites. It only reacts when the user holds the chosen key and drags with the mouse; page text inside the rectangle is processed locally and is never sent anywhere.

**Are you using remote code?**
> No, I am not using Remote code.

**Data usage** – nie zaznaczaj żadnej kategorii danych (dodatek nic nie zbiera), a potem zaznacz wszystkie trzy oświadczenia:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item’s single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**
> https://pitprivel.github.io/rectangle-copy/privacy.html

## 4. Zakładka „Distribution”

| Pole | Wartość |
|---|---|
| Payments | Free of charge |
| Visibility | Public |
| Regions | All regions |

## 5. Wysłanie

**Submit for review.** Weryfikacja trwa zwykle od kilku dni do 2–3 tygodni; dostęp do wszystkich stron oznacza dokładniejszą kontrolę. Wynik przyjdzie mailem na adres konta.

Po zatwierdzeniu: **Package → View public key** – skopiuj klucz i wpisz go w `src/manifest.json` w polu `"key"` (zamiast obecnego), żeby lokalna wersja miała to samo ID co sklepowa.

## Kolejne wersje

1. Podbij wersję w `src/manifest.json` i `package.json`, dopisz sekcję w `CHANGELOG.md`.
2. `npm test`, `npm run store:assets` (jeśli zmienił się wygląd), `npm run pack:store`.
3. `git tag vX.Y.Z && git push --tags` – GitHub zbuduje wydanie z ZIP-ami.
4. W sklepie: **Package → Upload new package** → wgraj nowy `-store.zip` → Submit for review.

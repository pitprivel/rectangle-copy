# Changelog

All notable changes to Rectangle Copy are documented here.
The project follows [Semantic Versioning](https://semver.org/): **patch** (1.0.x) for bug fixes,
**minor** (1.x.0) for new features and languages, **major** (x.0.0) for changes in how the extension works.

## [1.0.0] – 2026-11-18

First public release.

### Added
- Hold **Alt** and drag to draw a rectangle; on release its contents are copied to the clipboard as plain text.
- **Tables:** whole cells are copied (e.g. a single column), with `colspan`/`rowspan` support; hidden rows are skipped.
- **Other content:** characters inside the rectangle are copied line by line; indentation is kept in monospaced text (code).
- Live highlight of what will be copied, auto-scroll at window and container edges, **Esc** to cancel.
- Settings: key (Alt / Alt + Shift / Ctrl + Alt), column separator (tabs or aligned spaces), “Copied” message.
- Turn the extension off on a particular site from the toolbar popup.
- Welcome page with a short guide and a table to try it on.
- Languages: English, Polish, German, French, Italian, Spanish, Ukrainian.

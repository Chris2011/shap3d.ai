# Languages and translations

The interface speaks **English** (the source language, always there), **German**, **French**, **Spanish** and **Arabic** (right to left); more languages can be added without touching the code. The 🌐 button next to the light/dark switch (with the current language code) picks the language, as do _Language: …_ in **Menu › View** and the command palette. The choice is kept in the browser; on the very first start the browser language is used if there is a language pack for it, otherwise English. Everything switches live, without reloading.

![The translation editor: areas with the app's icons, English and German side by side, progress per language](../screenshots/translations.png)

**Translation editor** (🌐 › _Übersetzungen bearbeiten…_, or _Übersetzungen…_ in the palette) – all texts grouped by area with the app's icons (tools, main menu, every panel, dialogs, status bar, script editor, …; every plugin is an area of its own), English (the source), German and the target language side by side, search over texts and keys, a _missing only_ filter, a progress bar per language and a warning when a translation lacks a `{placeholder}`.

- **Live preview** – while the editor is open the app shows the target language; every keystroke is visible right away. Missing texts fall back to English.
- **Where is this text?** – the 👁 button outlines every element that currently shows the text.
- **New language…** creates an empty language (code, name, writing direction ltr/rtl); **Import…** loads a language file, **Export** saves the target language as JSON, **Template** downloads `template.json`. Languages and changes made in the editor are kept in the browser.

**Numbers and units follow the language** – the decimal separator (`2.5 m` in English and Arabic, `2,5 m` in German, French and Spanish), the unit symbols (Arabic `مم`, `سم`, `م`, `كم`), thousands separators in counts and the plural forms (Arabic has six). The _Measurements_ box accepts every form: `2.5m`, `2,5 m`, Arabic-Indic digits `٢٫٥م` and the Arabic separators `٫` and `؛`. Arabic keeps Western digits on screen, as is usual in technical software.

**Right to left** – with Arabic the whole interface runs right to left (menus, panels, dialogs, text). The 3D view, the tool bar and the panel rail keep their places; code, keyboard keys and the _Measurements_ box stay left to right.

The languages, the language switch and the editor are the built-in plugin **Sprachen** – switched off, the app is English and the language switch disappears.

## Multilingual: language files for developers

Every visible text is a message key (`t('tools.select')`). English is the source and the fallback: [`src/i18n/en.json`](../../src/i18n/en.json) for the app, [`src/i18n/boot.en.json`](../../src/i18n/boot.en.json) for the loading screen, and `i18n/en.json` in each built-in plugin. The small core in [`src/i18n/index.ts`](../../src/i18n/index.ts) only registers texts and languages and translates (`t`, fallback current language → English → key); every other language comes from a plugin – German, French, Spanish and Arabic from **Sprachen** ([`languages/de.json`](../../src/plugins/builtin/i18n/languages/de.json), `fr.json`, `es.json`, `ar.json`), each plugin's own texts from the plugin itself (`i18n/<code>.json` next to its `index.ts`).

**Numbers and units** – `formatNumber(value, options)` formats with `Intl.NumberFormat` for the language, `formatDecimal(value, digits)` writes lengths and angles with the language's decimal separator (no grouping, so they can be typed back), `unitSymbol('mm' | 'cm' | 'm' | 'km')` returns the symbol from the message `units.symbols.*`, and `normalizeNumberInput(text)` turns input back into Western digits, `.` and Latin unit symbols before parsing. `src/core/units.ts` uses all of them – a new language only needs its `units.symbols` texts. Arabic uses the locale `ar-u-nu-latn` (Arabic text, Western digits).

**A language file** – the format of `de.json`, of _Export_ / _Import_ in the translation editor and of the template:

```json
{
  "code": "fr",
  "name": "Français",
  "dir": "ltr",
  "messages": {
    "tools": { "select": "Sélectionner", "line": "Ligne" },
    "editor": { "faces": "{count} face | {count} faces" }
  }
}
```

| Field      | Meaning                                                                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `code`     | BCP 47 language code: `de`, `fr`, `es`, `pt-BR` … (`en` is the source and cannot be imported)                                              |
| `name`     | the language's name in itself – shown in the language menu                                                                                 |
| `dir`      | writing direction, `ltr` (default) or `rtl`                                                                                                |
| `messages` | the texts, nested by area (`{ "tools": { "select": … } }`) or flat (`{ "tools.select": … }`). Missing or empty texts fall back to English. |

Placeholders like `{count}`, `{name}` or `{error}` must stay unchanged (the editor warns when they differ). Texts with `|` choose the form by `{count}` using the language's plural rules: two forms are `one | other`, three `zero | one | other`, six `zero | one | two | few | many | other` (Arabic). A form may leave out `{count}` (`"one file | {count} files"`). A few texts contain `<b>` or `<kbd>` – keep the tags. In right-to-left languages, put a right-to-left mark (U+200F) between Latin text and a closing bracket so the bracket stays in place (`"(Ctrl+S\u200F)"`).

**Starting a new language** – [`src/plugins/builtin/i18n/languages/template.json`](../../src/plugins/builtin/i18n/languages/template.json) has every key of the core and of the languages plugin itself with an empty text and the English text as a hint right below (`"select": ""`, `"select#en": "Select"`). No other plugin is in it – built-in, installed or third-party: the core knows no plugins, every plugin brings its own language files (`i18n/en.json` as source) and they are merged at runtime. Fill in `code`, `name` and the texts and load the file with _Import…_ in the translation editor; the hint lines are ignored. The editor's **Template** button downloads the same keys. To ship a language with the app, put the file next to `de.json`, add it to `BUILTIN_LANGUAGES` in `src/plugins/builtin/i18n/store.ts`, and add the plugin texts as `i18n/<code>.json` to each built-in plugin's `messages`.

**Checking** – `node scripts/i18n.mjs` (no dependencies) lists missing, unused and mismatched keys per language and German text that is still hard-coded in `.vue`/`.ts` files – for the app and the built-in plugins. Plugin packages check themselves with `npm run i18n` in their folder (`node ../../scripts/i18n.mjs check --package .`: their own `src/i18n/<code>.json` and `src/`; keys of the app count as known); `node scripts/i18n.mjs template` rewrites `template.json` after texts were added. Not translated on purpose: the `s3d` script API (names, signatures, examples, default names of what scripts build), material names in models and the saved file format.

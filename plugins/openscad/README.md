<img src="docs/openscad-logo.png" alt="OpenSCAD logo" width="96" align="right">

# OpenSCAD plugin for Shap3D.ai

Brings the **official OpenSCAD** (as WebAssembly, npm package [`openscad-wasm`](https://www.npmjs.com/package/openscad-wasm)) into Shap3D.ai – no OpenSCAD installation and no server, everything runs locally in the browser.

The plugin is a package of its own with its own `package.json` and is **not** part of the app: OpenSCAD is GPL-licensed, Shap3D.ai is Apache-2.0. The app only contains the general plugin system; OpenSCAD only reaches the browser when this package is installed.

![OpenSCAD code in the Shap3D.ai script editor](docs/openscad.png)

## Features

- **Open .scad files** – *File › Import…* or drag & drop. The result is a group with real, editable faces.
- **OpenSCAD in the script editor** – language “OpenSCAD” in the language selector, with examples (*Load example… › OpenSCAD*) and help (*API info*). `echo()`, warnings and errors appear in the console. Code completion suggests modules, functions, keywords and `$fn`/`$fa`/`$fs`.
- **`s3d.scad(code, { at, name })` in JavaScript scripts** – OpenSCAD code in the middle of an s3d script:
  ```js
  const plate = s3d.scad('difference() { cube([80, 50, 6]); translate([40, 25, -1]) cylinder(h = 8, r = 10); }');
  plate.move([0, 0, 0.75]);
  ```
- **Colours become materials** – `color("red")` becomes the material “OpenSCAD red”, `color([0, 0.5, 1, 0.4])` becomes “OpenSCAD #007fff 40 %” (with transparency). Parts without `color()` get no material. Works with the Manifold geometry kernel (default); CGAL delivers no colours.
- **Export as OpenSCAD** – *File › Export › OpenSCAD (.scad)* writes the model as `polyhedron()`.
- **Open as code ▸ OpenSCAD** – right-clicking an object writes it as OpenSCAD code into the script editor: one `polyhedron()` per material with `color()`, groups as `union()`. In the script editor *Convert to…* turns OpenSCAD code into JavaScript, JSON or OBJ (and back) without changing the model. OpenSCAD only works with closed solids: single faces and edges are left out.
- **“OpenSCAD” panel** (menu *Plugins*) – unit (default: millimetres, as usual in OpenSCAD; also cm or m), geometry kernel (Manifold or CGAL) and the file library.
- **Languages** – everything around the code (panel, commands, examples, help, completion, messages, generated comments) is translated: English, German, French, Spanish and Arabic. The plugin follows the app's language live.

## File library: include, use, import() and fonts

In the “OpenSCAD” panel under **Files** you can add single files or whole folders. They are kept in the browser (IndexedDB) and are placed in the library folder on every OpenSCAD run – just like OpenSCAD's own library folder:

- **`include` and `use`** find everything in the library. Add a library such as BOSL2 as a folder, then `include <BOSL2/std.scad>` works.
- **`import()`** and **`surface()`** read STL, OFF, 3MF, SVG, DXF and PNG files from the library, e.g. `import("parts/holder.stl")`.
- **Fonts for `text()`**: **Liberation Sans** (OpenSCAD's default font), **Liberation Serif** and **Liberation Mono** ship with the plugin, each regular, bold, italic and bold italic – so `text("Hello")` works right away, also e.g. `text("Hello", font = "Liberation Serif:style=Bold")`. Your own `.ttf` or `.otf` files come in through the library (or simply drag them into the window), then `text("Hello", font = "Name of the font")`.
- **.scad files in the library** can be opened directly (*Open*) or loaded into the script editor (*Editor*). Relative paths then start at the file's folder.

## Any number of `s3d.scad()` calls

An OpenSCAD instance can only compute once, and `s3d.scad()` needs one right away. So before every script run the plugin counts the `s3d.scad()` calls in the code and prepares that many instances. When the calls sit in a loop, the number is only known after the first run: a one-time message says that more instances are being prepared, and from the next run on there are enough (up to 24 calls per run; the learned number is kept).

## Changes

What changed in which version: [CHANGELOG.md](CHANGELOG.md).

## Building and installing

```bash
cd plugins/openscad
npm ci
npm run build
```

`npm run build` is a plain `vite build` (library mode, [`vite.config.ts`](vite.config.ts)); Vite and TypeScript come from the repository root, so run `npm ci` there as well. `npm run typecheck` checks the TypeScript against the app's plugin types. `npm run lint` and `npm run format` (with `lint:fix` and `format:check`) lint and format `src/`; the pre-commit hook runs them on staged files of this package.

Then in Shap3D.ai: *Plugins › Load plugin folder…* and pick the folder `plugins/openscad/dist`. The plugin including OpenSCAD and the fonts (about 16 MB) is kept in the browser (IndexedDB) and loaded on every start.

## Structure

```
plugins/openscad/
  package.json      a package of its own – depends on openscad-wasm and @typopro/dtp-liberation (fonts)
  vite.config.ts    builds dist/: plugin.js from src/, plus openscad.js, the fonts, README and package.json
  src/
    index.ts        the plugin (id, name, messages, activate)
    engine.ts       OpenSCAD instances, the file library and compile()
    scripting.ts    script editor language, code completion and s3d.scad()
    files.ts        .scad/.ttf import, .scad export, "Open as code ▸ OpenSCAD"
    panel.ts        the "OpenSCAD" panel and the command
    examples.ts, completions.ts, off.ts, fonts.ts, settings.ts
    i18n.ts         t() and number formatting through the app's i18n
    i18n/*.json     the texts: en (source), de, fr, es, ar
  dist/             the installable plugin folder (not checked in)
```

**Texts** are message keys (`openscad.*`); `src/i18n/en.json` is the source, the other files are translations in the same format as the app's language files. The plugin hands them to the app as `messages` – nothing is stored in the app itself. `npm run i18n` checks them (missing, unused and mismatched keys, hard-coded German text in `src/`). OpenSCAD code (examples, signatures, generated `polyhedron()`), material names and OpenSCAD's own console output stay as they are.

## License

Because of the bundled OpenSCAD this plugin package is licensed under **GPL-2.0-or-later**; the bundled Liberation fonts are under the SIL Open Font License 1.1. See [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

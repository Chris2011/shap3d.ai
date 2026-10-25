# Changelog – OpenSCAD plugin

## [Unreleased]

Nothing yet.

## [1.4.1] – 2026-10-23 · Shap3D.ai 0.8.0

### Changed

- Linting and formatting belong to the package: `npm run lint`, `lint:fix`, `format` and `format:check` in `plugins/openscad`, and a `lint-staged` configuration of its own for the pre-commit hook. The app's scripts no longer cover this package.
- The texts are checked from the package as well (`npm run i18n`), and `npm run screenshots` (Windows) or `npm run screenshots:sh` (Linux, macOS) renders `docs/openscad.png` (the demo model is `docs/demo.scad`) – the app's scripts and demo scenes know no plugin packages.
- `dist/package.json` lists the package's files (`files`), so the package can also be installed without the folder dialog.

## [1.4.0] – 2026-10-20 · Shap3D.ai 0.6.0

### Added

- Everything around the code – panel, commands, examples, help, completion, messages and generated comments – in English, German, French, Spanish and Arabic; the plugin follows the app's language live.

### Changed

- Rewritten in TypeScript and split into modules (engine, files, fonts, panel, scripting, completions …); built with a plain `vite build` in library mode, `npm run typecheck` checks against the app's plugin types.

## [1.3.0] – 2026-10-20 · Shap3D.ai 0.6.0

### Added

- Code completion for OpenSCAD in the script editor: modules, functions, keywords and `$fn`/`$fa`/`$fs`.

## [1.2.0] – 2026-10-19 · Shap3D.ai 0.5.0

### Added

- *Open as code ▸ OpenSCAD*: an object becomes OpenSCAD code (one `polyhedron()` per material with `color()`, groups as `union()`), and *Convert to…* turns OpenSCAD code into JavaScript, JSON or OBJ and back.

## [1.1.0] – 2026-10-19 · Shap3D.ai 0.5.0

First version in this repository:

- The official OpenSCAD as WebAssembly – no installation, no server.
- Open `.scad` files; `color()` becomes materials (with transparency).
- OpenSCAD as a language in the script editor, with examples and help, and `s3d.scad(code)` inside JavaScript scripts.
- Export of the model as OpenSCAD `polyhedron()`.
- The *OpenSCAD* panel: unit, geometry kernel (Manifold or CGAL) and a file library in the browser for `include`, `use`, `import()` and fonts; Liberation Sans, Serif and Mono ship with the plugin.

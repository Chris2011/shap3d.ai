# Third-party software in this plugin package

## OpenSCAD (WebAssembly build)

- Package: `openscad-wasm` (npm), file `openscad.js` (contains the compiled WebAssembly module)
- Project: OpenSCAD – The Programmers Solid 3D CAD Modeller, https://openscad.org
- Source code: https://github.com/openscad/openscad (OpenSCAD), https://www.npmjs.com/package/openscad-wasm (WebAssembly port)
- License: GNU General Public License, version 2 or later (GPL-2.0). The full license text is available at https://www.gnu.org/licenses/old-licenses/gpl-2.0.html and in the OpenSCAD source repository.

## Liberation fonts (default fonts for text())

- Package: `@typopro/dtp-liberation` 3.7.5 (npm), files `fonts/TypoPRO-Liberation*.ttf` – Liberation Sans, Serif and Mono (Regular, Bold, Italic, Bold Italic), unmodified
- Fonts: Liberation 2 – Digitized data copyright (c) 2010 Google Corporation; Copyright (c) 2012 Red Hat, Inc. Packaged by the TypoPRO project (Ralf S. Engelschall), https://github.com/rse/typopro-dtp
- License: SIL Open Font License, Version 1.1 – https://openfontlicense.org (the copyright notice and the license reference are also embedded in every font file)

The fonts are used as they are. Shap3D.ai maps the font names "Liberation Sans/Serif/Mono" to them in the Fontconfig configuration of the plugin; the font files themselves are not renamed or changed.

OpenSCAD itself bundles further libraries (e.g. CGAL, Manifold, Boost, Eigen) under their own licenses; see the OpenSCAD source repository for details.

Because this package distributes OpenSCAD, the package as a whole is distributed under GPL-2.0-or-later. The Shap3D.ai application is a separate program (Apache-2.0) and does not contain OpenSCAD; it only loads plugins the user installs.

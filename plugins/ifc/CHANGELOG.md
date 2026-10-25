# Changelog – IFC (BIM) plugin

## [Unreleased]

Nothing yet.

## [1.0.0] – 2026-10-25 · Shap3D.ai 0.9.0

### Added

- A plugin package of its own (`plugins/ifc`, built with `vite build`, installed via _Plugins › Load plugin folder…_). web-ifc ships in the package (`web-ifc-api.js`, `web-ifc.wasm`) and is loaded on the first import – it is not part of the app. Linting, formatting and type checks run from the package (`npm run lint`, `format`, `typecheck`), with its own `lint-staged` configuration; `npm run i18n` checks the texts. `dist/package.json` lists the package's files.
- Import of `.ifc` files (IFC 2x3, IFC 4, IFC 4.3) with [web-ifc](https://github.com/ThatOpen/engine_web-ifc) as WebAssembly – in the browser, the desktop app and a static deployment, without a converter.
- The spatial structure (project › site › building › storey) and aggregated elements become nested groups; every element is its own group, tagged with its IFC class. Spaces, spatial zones and openings start hidden.
- IFC class, GlobalId, predefined type, object type, description, material name, property sets and quantities are kept on the group (saved with the model). Lengths, areas and volumes are converted from the file's units to metres.
- Materials named after the IFC material, one per colour.
- Export of the whole model as IFC4 (_Export › IFC4_): spatial structure from classified groups (or a default site/building/storey), elements in their IFC class (unknown classes as `IfcBuildingElementProxy`), triangulated geometry with surface styles, `IfcMaterial`, property sets, quantities and tags as presentation layers. GlobalIds of imported elements are written back.
- The _IFC properties_ panel (right-click › _IFC properties…_): shows the IFC data of the selected group, sets or removes its class (the class becomes its tag) and edits predefined type, object type and material.
- Texts in English, German, French, Spanish and Arabic.

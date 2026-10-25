# IFC (BIM) plugin for Shap3D.ai

Opens **IFC** files – the open BIM format of Revit, ArchiCAD, Allplan, Vectorworks, SketchUp and others – and exports the model as **IFC4**. Files are read with [web-ifc](https://github.com/ThatOpen/engine_web-ifc) (That Open Company) as WebAssembly. No server or converter is needed, everything runs locally in the browser or the desktop app.

The plugin is a package of its own with its own `package.json` and is **not** part of the app: web-ifc (about 7.5 MB with the WebAssembly) only reaches the browser when this package is installed, and it is only loaded the first time an IFC file is imported.

## Features

- **Open .ifc files** – _File › Import…_ or drag & drop: IFC 2x3, IFC 4 and IFC 4.3.
  - The spatial structure (project › site › building › storey) and aggregated elements (a roof made of slabs) become nested groups. Every element is a group with its origin at the bottom centre of its geometry.
  - **IFC classes become tags**, as in SketchUp (`IfcWall`, `IfcSlab` …). Spaces, spatial zones and openings start hidden because they are volumes that hide the building.
  - **Kept on the group:** IFC class, GlobalId, predefined type, object type, description, material name, property sets and quantities. Lengths, areas and volumes are converted from the file's units (millimetres, feet …) to metres. The data are saved with the model and stay there while the plugin is off.
  - One material per colour, named after the IFC material.
- **Export as IFC4** – _File › Export › IFC4_:
  - The spatial structure comes from groups classified as site, building, storey or space; anything outside it goes into a default site › building › storey.
  - Classified groups become their IFC class (classes the export cannot write become an `IfcBuildingElementProxy` with the class as object type). Unclassified groups become proxies, and unclassified groups inside an element become part of its geometry.
  - Geometry is written as triangulated face sets in metres, with a surface style per material, `IfcMaterial`, property sets, quantities and tags as presentation layers.
  - GlobalIds of imported elements are written back, so a round trip keeps their identity.
- **“IFC properties” panel** – right-click a group › _IFC properties…_ (or _Plugins › IFC properties…_). It shows the IFC data of the selected group or component, sets or removes its class (the class also becomes its tag) and edits predefined type, object type and material. Property sets and quantities are shown read-only.
- **Languages** – English, German, French, Spanish and Arabic; the plugin follows the app's language live.

## Limits

- Geometry is triangles: no parametric walls or extrusions, and openings are already cut into the walls.
- Type objects (`IfcWallType` …) and their property sets are not read. Identical geometry (`IfcMappedItem`) becomes separate groups instead of one component with copies.
- No georeferencing (`IfcMapConversion`). The model is placed on the ground at the origin like every import.
- Imports are capped at 200,000 triangles like every other format.
- Copies of a component share their IFC data; the export gives each copy its own GlobalId.

What changed in which version: [CHANGELOG.md](CHANGELOG.md).

## Building and installing

```bash
cd plugins/ifc
npm ci
npm run build
```

`npm run build` is a plain `vite build` (library mode, [`vite.config.ts`](vite.config.ts)); Vite and TypeScript come from the repository root, so run `npm ci` there as well. `npm run typecheck` checks the TypeScript against the app's plugin types. `npm run lint` and `npm run format` (with `lint:fix` and `format:check`) lint and format `src/`; the pre-commit hook runs them on staged files of this package. `npm run i18n` checks the texts in `src/i18n/`.

Then in Shap3D.ai: _Plugins › Load plugin folder…_ and pick the folder `plugins/ifc/dist`. The plugin including web-ifc is kept in the browser (IndexedDB) and loaded on every start.

## Structure

```
plugins/ifc/
  package.json      a package of its own – depends on web-ifc
  vite.config.ts    builds dist/: plugin.js from src/, plus web-ifc-api.js, web-ifc.wasm, README and package.json
  src/
    index.ts        the plugin (id, name, messages, activate)
    runtime.ts      what comes from the app: three.js, t() and number formatting
    importIfc.ts    reads .ifc with web-ifc and builds the nested groups
    exportIfc.ts    writes IFC4 (STEP) by hand – no WebAssembly needed
    ifcData.ts      the IFC data kept on a group, class tags, GlobalIds
    ifcClasses.ts   the IFC4 element classes the export can write
    panel.ts        the "IFC properties" panel
    i18n/*.json     the texts: en (source), de, fr, es, ar
  dist/             the installable plugin folder (not checked in)
```

The plugin only uses the plugin API: it imports nothing from the app at run time, only its types. three.js and Vue come from the context.

## License

The plugin's own code is licensed under **Apache-2.0** like the app. The bundled web-ifc is licensed under the **Mozilla Public License 2.0** and is shipped unmodified – see [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

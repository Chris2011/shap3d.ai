# Plugin packages

These stand-alone packages live in [`plugins/`](../../plugins). Each is built in its own folder and installed with _Plugins › Load plugin folder…_ – how packages work in general is described under [Writing plugins](plugins.md#plugin-packages).

## The OpenSCAD plugin

<img src="../../plugins/openscad/docs/openscad-logo.png" alt="OpenSCAD logo" width="96" align="right">

The example package in [`plugins/openscad/`](../../plugins/openscad) runs the official [OpenSCAD](https://openscad.org) as WebAssembly: it opens `.scad` files (with `color()` turned into materials), adds _OpenSCAD_ as a language to the script editor (with examples), keeps a file library in the browser so `include`, `use`, `import()` and `text()` fonts work, provides `s3d.scad(code)` for JavaScript scripts, exports the model as an OpenSCAD `polyhedron()` and registers _OpenSCAD_ as a code format (_Open as code ▸ OpenSCAD_, _Convert to…_). It is written in TypeScript, split into modules, built with a plain `vite build` (library mode) and brings its texts in five languages as `messages` – a good template for plugin packages of your own. Because OpenSCAD is GPL-licensed, it is a package of its own (GPL-2.0-or-later) and never bundled with the app:

```bash
cd plugins/openscad
npm ci
npm run build
```

Then _Plugins › Load plugin folder…_ and pick `plugins/openscad/dist`. Details in [its README](../../plugins/openscad/README.md).

![OpenSCAD code in the script editor – the OpenSCAD logo modelled with difference() and hull(), colours turned into materials](../../plugins/openscad/docs/openscad.png)

With the plugin switched on, _OpenSCAD_ also shows up when you right-click an object and choose _Als Code öffnen ▸_ – next to the built-in formats JavaScript, JSON and OBJ:

![Right-click › Als Code öffnen ▸ JavaScript (s3d), JSON, OBJ-Mesh and OpenSCAD](../screenshots/convert.png)

## The IFC plugin

The package in [`plugins/ifc/`](../../plugins/ifc) opens **IFC** files (BIM: Revit, ArchiCAD, Allplan, SketchUp …) and exports the model as **IFC4**. It reads them with [web-ifc](https://github.com/ThatOpen/engine_web-ifc) as WebAssembly – no server or converter, so it also works in the desktop app and a static deployment. web-ifc (MPL-2.0, about 7.5 MB) ships in the package, not in the app, and is only loaded on the first IFC import.

```bash
cd plugins/ifc
npm ci
npm run build
```

Then _Plugins › Load plugin folder…_ and pick `plugins/ifc/dist`.

- **Import** of IFC 2x3, IFC 4 and IFC 4.3: project › site › building › storey and aggregated elements become nested groups, each IFC class becomes a tag (spaces, zones and openings start hidden), and the IFC class, GlobalId, attributes, property sets and quantities (in metres) are kept on the group.
- **Export as IFC4** (_Export › IFC4_): spatial structure from classified groups (or a default storey), elements in their IFC class, triangulated geometry with materials and colours, property sets and quantities; GlobalIds of imported elements are written back.
- **IFC properties** panel (right-click › _IFC properties…_): shows the IFC data of a group and sets its class.
- **Limits:** triangles only (no parametric walls), no type objects, no georeferencing, 200,000 triangles per import.

Details in [its README](../../plugins/ifc/README.md).

## The LayOut plugin

The package in [`plugins/layout/`](../../plugins/layout) adds sheets for plans **next to the 3D model** – a workspace _Sheets_ that the switch _Model | Sheets_ in the top bar opens. It needs no dependencies of its own and is built like the others:

```bash
cd plugins/layout
npm run build
```

Then _Plugins › Load plugin folder…_ and pick `plugins/layout/dist`.

![LayOut: a sheet with a perspective, two elevations and a top view at 1:100, title block in the bottom right](../../plugins/layout/docs/layout.png)

- **Sheets** in A4 to A1, Letter and Tabloid with frame and title block.
- **Viewports** show scenes of the model **live** – change the model and the sheet follows – at a drawing scale (1:1 … 1:1000) and as hybrid, raster or vector drawing. _From scenes_ puts up to four scenes on a new sheet with fitting scales.
- **The tools of a layout program**: text, labels, dimensions and angle dimensions (on a scaled viewport they measure the model), lines, freehand, arcs, pies, rectangles (rounded, lozenge, bulged), circles, ellipses, polygons, images, offset, fillet, chamfer, trim, extend, split, join, groups, style transfer – with line styles, fills and patterns.
- **Floor plan symbols** in real size – doors, windows, stairs, furniture, kitchen and bath, people, trees, cars – that take the scale of the viewport they are dropped on.
- **Sections per viewport** with filled cut surfaces, own face style and tags per viewport, titles with the live scale, layers, sheet templates and a document setup (grid, snapping, dimension units).
- **Presentation** of the sheets full screen, **SVG export** of a sheet and **printing** all sheets in their paper sizes (to PDF through the print dialog). The sheets are saved in the `.shap3d.json`.

![LayOut: a floor plan at 1:50 with door, window and furniture symbols, dimensions, room names and labels](../../plugins/layout/docs/layout-plan.png)

It builds on three parts of the plugin API made for it: workspaces, views rendered on demand (image and vector lines) and data on the model. Its `.vue` components use the app's Vue – see [its README](../../plugins/layout/README.md).

## The room planner plugin

The package in [`plugins/roomplanner/`](../../plugins/roomplanner) furnishes a room like a furniture store's planner – a panel _Room planner_ and a tool in the 3D view. No dependencies of its own; built like the others:

```bash
cd plugins/roomplanner
npm run build
```

Then _Plugins › Load plugin folder…_ and pick `plugins/roomplanner/dist`.

![Room planner: a furnished living room with kitchen run, dining table, sofa corner and shelves; the panel with room figures, catalog and shopping list](../../plugins/roomplanner/docs/roomplanner.png)

- **Rooms** side by side – rectangles, L-shapes or free floor plans with **slanted and round walls** – with doors and windows, **sloped ceilings** (shed, gable, hip roof) with **roof windows** and **maisonettes** (an upper floor with a square or round stairwell); floor and living area, perimeter, wall area and volume; the walls between the camera and the room open up (doll's house view).
- **Catalog** of parametric furniture with thumbnails: living room, bedroom, a modular **wardrobe system** (sections, heights, depths, hinged or sliding doors, interior), **kitchen** (a whole kitchen run, base, wall and tall cabinets, island), dining, office, shelves (bookcase, cube shelf …), bathroom, kids, **stairs** (straight, quarter-turn, spiral – floor to floor) and extras.
- **Placing and moving with snapping**: back to the nearest wall and flush against it, sides snapping to walls and neighbours, R turns by 90°, collisions shown in red.
- **Measures** on the floor: room size, openings and the distances of a piece to walls and neighbours.
- A **shopping list** with CSV, and the script functions `s3d.room(…)` and `s3d.furniture(…)` for rooms from code.

![Room planner: an L-shaped maisonette with a sloped ceiling upstairs and a spiral stair through the stairwell](../../plugins/roomplanner/docs/roomplanner-maisonette.png)

![Room planner: a living room with a slanted and a round wall next to an attic room under a gable roof](../../plugins/roomplanner/docs/roomplanner-house.png)

The pieces are ordinary components of the model, built with the script API (`s3d.box`, `s3d.cylinder` …) – the app's own tools work on them too. Details in [its README](../../plugins/roomplanner/README.md).

## The shader materials plugin

The package in [`plugins/shaders/`](../../plugins/shaders) draws materials with GLSL shaders instead of pictures – wood, marble, granite, terrazzo, rust and patina, brick walls, checker and exposed concrete. No dependencies of its own; built like the others:

```bash
cd plugins/shaders
npm run build
```

Then _Plugins › Load plugin folder…_ and pick `plugins/shaders/dist`.

![Shader materials: a table in oak, marble blocks, a terrazzo floor, a clinker wall, rusty steel and exposed concrete; the panel with the ready-made materials](../../plugins/shaders/docs/shaders.png)

- The patterns are **solid** – computed from the point in the object's own coordinates – so they run round every edge without seams and move with the object.
- The shaders appear with the textures in the **Materials panel** (_Texture › Shaders (plugins)_); their parameters (colours, ring count, vein sharpness, brick size …) are sliders and colour pickers there.
- A panel with **ready-made materials** (oak, walnut, Carrara, Nero Marquina, terrazzo, rusty steel, copper patina, clinker, exposed concrete …), and `s3d.shaderMaterial('oak')` or `s3d.material(name, colour, { shader: 'shaders.wood', params })` in scripts.

It uses `context.materials.registerShader` – the way to add shaders of your own is in [its README](../../plugins/shaders/README.md). Without the plugin, materials with a shader show their colour; export formats keep the colour too.

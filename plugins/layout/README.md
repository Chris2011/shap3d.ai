# LayOut plugin for Shap3D.ai

Sheets for plans **next to the 3D model**: a workspace _Sheets_ (switch _Model | Sheets_ in the top bar) with pages in paper sizes, viewports that show scenes of the model at a drawing scale, the 2D tools of a layout program, a library of floor plan symbols, dimensions, labels and a title block – presented full screen, exported as SVG or printed to PDF.

![LayOut: a sheet with a perspective, two elevations and a top view at 1:100, title block in the bottom right](docs/layout.png)

![LayOut: a floor plan at 1:50 with door, window and furniture symbols, dimensions, room names and labels, a perspective next to it](docs/layout-plan.png)

The plugin is a package of its own with its own `package.json` and is **not** part of the app. It only uses the plugin API – including the parts the app offers for it: workspaces (`context.workspaces`), views rendered on demand as images and as vector lines (`context.render`) and data on the model (`context.data.getModel/setModel`).

## Features

- **Sheets** in A4, A3, A2, A1, Letter and Tabloid, landscape or portrait, with frame and title block (project = model name, sheet, scales, date, page). _+ Sheet_, duplicate, delete; the list on the left.
- **Viewports** show a scene of the model – **live**: change the model or the scene and the sheet follows, no "update reference". Or the view as it was placed (_Use current 3D view_).
  - **Scale** 1:1 … 1:1000 – the view becomes a parallel projection whose size on paper matches the scale. _Fit_ keeps the scene's own projection and fits it into the frame.
  - **Rendering**: _Hybrid_ (image without edges, edges and silhouettes as vector lines on top – sharp in print), _Raster_ (the image with its own edges) or _Vector_ (lines only, hidden lines removed).
  - **Section** per viewport: _As in the model_, _No section_ or one of the model's section planes – each viewport cuts on its own, a plan next to an elevation without a cut. _Fill cut surfaces_ fills what the plane cuts (colour and pattern, outlined) – the poché of a plan.
  - **Display** per viewport: its own face style and its own tag visibility instead of the scene's.
  - **Title** under the frame with the live scale (_Grundriss 1:50_ – it follows when the scale changes).
  - **Preserve scale on resize** (on by default): off, resizing keeps the part of the model and changes the scale. The frame has handles on every side and corner.
  - A double-click – or _Open in model_ in the right-click menu – opens the viewport's view in the model; the right-click menu also changes scene and scale.
- **From scenes**: a new sheet with up to four scenes as viewports in a grid; parallel scenes get the smallest standard scale at which the model fits.
- **Tools** – variants of one kind share a button with a menu (▾):
  - _Select_, _Erase_, _Style_ (pick up the style of an element, click others to give it to them)
  - _Viewport_, _Image_ (PNG, JPEG, SVG, WebP – embedded in the model file)
  - _Text_ (multi-line, size, bold), _Label_ (leader line with text)
  - _Dimension_ – on a viewport with a scale it measures the model (in the model's units), elsewhere the paper in mm – and _Angle_ (vertex, then one point on each leg)
  - _Line_, _Freehand_
  - _Arc_ (centre, start, end – it runs the way the pointer went), _2-point arc_ (start, end, bulge), _Pie_
  - _Rectangle_, _Rounded_, _Lozenge_, _Bulged_; _Circle_, _Ellipse_, _Polygon_ (number of sides in the toolbar)
  - _Offset_ (a copy at a distance on the side of the click), _Fillet_ and _Chamfer_ (two lines meet in a round or cut corner), _Trim_ (up to the next crossing lines), _Extend_ (to the next line), _Split_ (lines, paths, rectangles)
  - Shift keeps lines and dimensions horizontal or vertical; positions snap to 0.5 mm.
- **Floor plan symbols**: a library on the left with doors (80, 90, 100, double, sliding), windows, stairs, sofa, armchair, tables, desk, beds, wardrobe, kitchen unit, fridge, toilet, washbasin, shower, bathtub, person, tree and car – drawn in real size. Dropped on a viewport they take its scale (otherwise 1:50); R rotates by 90°, M mirrors.
- **Style**: line colour, width and style (solid, dashed, dotted, dash-dot), fill colour and patterns (hatch, cross hatch, dots, brick, concrete, insulation).
- **Editing**: Shift-click and a frame select several; move, resize at the handles, arrows nudge (Shift: 10 mm). _Group_ / _Ungroup_ (Ctrl+G / Ctrl+Shift+G), _Join_ lines into one path, _Explode_ shapes into lines, _To front_ / _To back_, _Locked_, copy, cut, paste, duplicate (Ctrl+C / X / V / D), Ctrl+A. Delete removes, Esc back to _Select_. Every change is one undo step of the app (Ctrl+Z / Ctrl+Y).
- **Pages**: previous / next sheet (Page Up / Page Down), drag a sheet in the list to reorder, _Present_ shows the sheets full screen (arrows, a click or Space go on, Esc ends).
- **Layers** for all sheets: the active layer gets new elements; hide, lock, rename (double-click), reorder, delete. Hidden layers are neither shown nor printed, locked ones cannot be picked; _Layer_ in the properties moves the selection.
- **Templates**: _Save as template_ keeps a sheet with everything on it (frame, legend, empty viewports) in the browser – for every model. _▾_ next to _+ Sheet_ creates a sheet from a template and marks one as the default for _+ Sheet_.
- **Document setup** (properties of the sheet): grid with spacing, snap to grid, units and precision of dimensions on scaled viewports (as the model, mm, cm, m, in, ft).
- **Navigation**: the mouse wheel zooms around the pointer, the middle mouse button pans; − / % / + in the toolbar.
- **Right-click** on an element: scene and scale of a viewport, open in model, to front / to back, duplicate, lock, remove.
- **Output**: _SVG_ saves the current sheet, _Print / PDF_ prints all sheets in their paper sizes – the print dialog saves them as PDF.
- **Saved with the model**: the sheets live in the `.shap3d.json` (`pluginData.layout`) – one file for model and plans. They stay there while the plugin is off.
- **Languages**: English, German, French, Spanish and Arabic; the plugin follows the app's language live.

## Limits

- Section fills are computed from closed solids: walls made of faces that do not close (single faces) get the cut line, not a fill.
- No scrapbooks of your own yet – the symbol library is built in; the 3-point arc is missing. No shared layers (a layer whose content is on every sheet) – templates and the title block cover most of it.
- The plugin changes nothing in the app: sections per viewport switch the model's section planes for one render and put them back right after.
- No snapping to model geometry inside a viewport yet: dimensions go from point to point on the paper.
- Viewports render in the browser: very large models make the sheet slower (each viewport is cached until the model changes).

What changed in which version: [CHANGELOG.md](CHANGELOG.md).

## Building and installing

```bash
cd plugins/layout
npm run build
```

`npm run build` is a plain `vite build` (library mode, [`vite.config.ts`](vite.config.ts)); Vite, the Vue compiler and TypeScript come from the repository root, so run `npm ci` there first. The package has no dependencies of its own. `npm run typecheck` checks the TypeScript against the app's plugin types, `npm run lint` and `npm run format` lint and format `src/`, `npm run i18n` checks the texts.

Then in Shap3D.ai: _Plugins › Load plugin folder…_ and pick the folder `plugins/layout/dist`.

**Vue in a plugin package**: the components are normal `.vue` files. The build routes every `import … from 'vue'` to the app's Vue (`context.vue`) – a plugin must not bring its own Vue, because the app's reactive state only tracks with the app's Vue. CSS comes as a `<style>` element while the plugin is on (`src/styles.ts`), using the app's colour tokens, so dark mode follows by itself.

**Screenshots**: `npm run screenshots` (Windows) or `npm run screenshots:sh` (Linux, macOS) renders `docs/layout.png` from the demo model `docs/demo.js` and `docs/layout-plan.png` from the floor plan `docs/demo-plan.js` with the dev server running.

## Structure

```
plugins/layout/
  package.json            a package of its own – no dependencies
  vite.config.ts          builds dist/: plugin.js from src/ (Vue routed to the app's Vue), README and package.json
  src/
    index.ts              the plugin (workspace, commands, icon)
    S3dLayoutWorkspace.vue  the workspace: sheets, tools, paper, keys, presentation
    S3dLayoutInspector.vue  the properties of the selection and of the sheet
    S3dLayoutLibrary.vue    the floor plan symbols
    S3dLayoutLayers.vue     the layers
    document.ts           sheets and elements, paper sizes, saving on the model
    edit.ts               changes to elements as undo steps (group, join, arrange …)
    elements.ts           moving, bounds, handles and copies of each kind of element
    geometry.ts           offset, fillet, chamfer, trim, extend, split, join, arcs
    symbols.ts            the symbol library in real size
    section.ts            section plane per viewport, the fill of the cut surfaces
    templates.ts          sheet templates (kept in the browser)
    render.ts             a sheet as SVG (editor, SVG export and printing share it), styles and patterns, viewport cache
    actions.ts            sheets from scenes, fitting scale, SVG export, printing
    styles.ts             the workspace's CSS
    runtime.ts            what comes from the app: Vue, three.js, t()
    i18n/*.json           the texts: en (source), de, fr, es, ar
  docs/                   screenshots and their demo models
  dist/                   the installable plugin folder (not checked in)
```

## License

Apache-2.0, like the app.

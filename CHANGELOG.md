# Changelog

All notable changes to Shap3D.ai are listed here – newest first.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/). Until 1.0 every minor version may bring larger changes.

Versions before 0.7.0 were not tagged at the time; they are reconstructed from the Git history and grouped by development phase.

The built-in plugins and the plugin packages ([OpenSCAD](plugins/openscad), [IFC](plugins/ifc), [LayOut](plugins/layout), [Room planner](plugins/roomplanner), [Shader materials](plugins/shaders)) have their own version numbers. A plugin's version only goes up when the plugin itself changes – new features (including whole new languages) raise the minor version, fixes and translations of a few new texts the patch version. The new version is given in brackets at the entry, e.g. _(AI assistant 1.2.0)_; every plugin has its own changelog with the details (linked in the table below).

| Version                     | Date       | In one sentence                                                                          |
| --------------------------- | ---------- | ---------------------------------------------------------------------------------------- |
| [0.10.0](#0100--2026-11-01) | 2026-11-01 | A bigger plugin API – workspaces, modes, lights, display, data – and scripts in a worker |
| [0.9.0](#090--2026-10-25)   | 2026-10-25 | Scene tabs, outliner by tags, guide points – and IFC as a plugin package                 |
| [0.8.0](#080--2026-10-22)   | 2026-10-22 | Native desktop app with Tauri – executable and installers                                |
| [0.7.0](#070--2026-10-22)   | 2026-10-22 | Remote control: REST API, Swagger UI and MCP server, plus Docker                         |
| [0.6.0](#060--2026-10-20)   | 2026-10-20 | Code completion and five languages                                                       |
| [0.5.0](#050--2026-10-19)   | 2026-10-19 | Plugin system – terrain, imports, AI and 3D text become plugins                          |
| [0.4.0](#040--2026-10-18)   | 2026-10-18 | Welcome tour, command palette, rulers, Tailwind and VueUse                               |
| [0.3.0](#030--2026-10-16)   | 2026-10-16 | First version in this repository                                                         |

Plugin versions per app version (**bold** = new version, plain = unchanged, – = not there yet):

| Plugin                                                                 | 0.5.0     | 0.6.0     | 0.7.0     | 0.8.0     | 0.9.0     | 0.10.0    |
| ---------------------------------------------------------------------- | --------- | --------- | --------- | --------- | --------- | --------- |
| [AI assistant](src/plugins/builtin/ai/CHANGELOG.md) (`ai`)             | **1.0.0** | **1.1.0** | **1.2.0** |
| [Terrain](src/plugins/builtin/terrain/CHANGELOG.md) (`terrain`)        | **1.0.0** | **1.1.0** |
| [Import formats](src/plugins/builtin/imports/CHANGELOG.md) (`imports`) | **1.0.0** | **1.1.0** |
| [3D text](src/plugins/builtin/text3d/CHANGELOG.md) (`text3d`)          | **1.0.0** | **1.1.0** |
| [Languages](src/plugins/builtin/i18n/CHANGELOG.md) (`i18n`)            | –         | **1.0.0** | **1.0.1** | **1.0.2** | 1.0.2     | **1.0.3** |
| [Remote API](src/plugins/builtin/remote/CHANGELOG.md) (`remote`)       | –         | –         | **1.0.0** |
| [OpenSCAD](plugins/openscad/CHANGELOG.md) (package)                    | **1.2.0** | **1.4.0** | **1.4.1** |
| [IFC](plugins/ifc/CHANGELOG.md) (package)                              | –         | –         | –         | –         | **1.0.0** | 1.0.0     |

## [Unreleased]

### Added

- **Text with a live value**: text placed on an edge or a face starts with `<>` – it shows the length or area and follows the model, also when a group above it is scaled. Saved with the model; if the edge or face is gone, the last value stays.
- **Autosave can be switched off**: _File › Autosave_ (on by default, remembered in the browser). Off, the saved copy is deleted and nothing comes back after a reload.
- **Import**: a textured material in a glTF, FBX or other file now takes the mean colour of its picture instead of a neutral grey. The picture itself is not imported.
- **Plugin API**: `files.importFile(file, onCreated?)` opens a file from a plugin like _Import…_; `onCreated` runs inside the undo step with the new group. _(Model marketplace 1.0.0: search public 3D sources and load models)_
- **Plugin API**: `panels.register({ inMaterials: true })` opens a plugin's panel from a button in the Materials panel instead of a tile. _(Remote API 1.0.1: no tile)_
- **Search in the plugin manager**: a field filters installed plugins, the catalog and the examples by name, description, author and id.
- **Several models in tabs**: _File › New tab_ opens another model next to the one shown, each with its own undo steps and view. Tabs show once there is more than one; closing one with unsaved changes asks first. Autosave only covers the tab shown.
- **Snap points**: the _Snap point_ tool sets points on a group or component. Move docks to them, from one snap point to another; they show while moving. Copies of a component share them.
- **Attributes**: Entity Info keeps your own names and values on a group or component (a part number, a price), saved with the model.
- **Physically based materials**: roughness and metal for a material, with pictures for normal, roughness, metal and ambient occlusion, laid out like its texture (Materials panel, in the _textured_ style). glTF export takes the values, not the pictures.
- **Environments**: an HDR or EXR picture (up to 32 MB) as light, reflections and sky, with its brightness, saved with the model (Styles panel).
- **Section cuts are filled**: closed things cut by a section plane show a surface instead of a hole; can be switched off in the Styles panel. Open surfaces can give wrong fills; views rendered for plugins are not filled.
- **The place of the sun**: latitude and north direction in the Shadows panel, saved with the model.
- **Materials as a cube**: the swatches in the Materials panel can be shown flat or as a small cube.
- **Plugin API**: `render.pass(draw)` draws over each frame of the 3D view; exporters can ask first (`options`: choices and checkboxes, handed to `export`). _(Import formats 1.2.0: USDZ export, view as SVG)_

### Fixed

- **Curves look and act as one surface**: faces joined by soft edges up to 30° are shaded smoothly instead of as flat strips (cylinders, spheres, gear flanks, imports), and a click or the paint bucket takes the whole surface. The shape stays the same; exports are unchanged.
- **Hidden soft edges could be clicked**: selecting and erasing took edges that are not drawn. They now only react while hidden geometry is shown.
- **Stray lines on flat faces of meshes**: merging coplanar triangles left inner edges without a face behind, drawn as loose lines (a fan of them on OpenSCAD gears, also in imports). Merging now removes them, so such a mesh counts as a solid again.
- **Flat sides of meshes are one face**: a ring (a gear's side with its bore) stayed a C-shaped face plus a loose wedge, which could not be selected or painted with it. Meshes are now merged as a whole, also faster, and a ring becomes one face with a hole.
- **Round outlines of small parts lost points**: the check for straight lines used a fixed limit, so corners of parts under a few centimetres counted as straight. It is now relative to their size.
- **Patterns on small parts**: shader and texture materials showed only their colour on small objects, because their pattern is made for about a metre. Without a size of their own they now fit the object in the view. glTF export still bakes the usual size.
- **The sun was on the wrong side of the sky**: at noon in the north, in the morning in the west. It now rises in the east (red axis) and stands in the south at noon north of the equator, so shadows and the light on faces change in existing models.

### Security

- **The dev server's endpoints** (remote API, MCP, AI proxy, converter) check the Host header against DNS rebinding, accept connections from elsewhere only with the token `S3D_REMOTE_TOKEN` (before, `vite --host` opened them to the network, and any page on another port of this computer got past the origin check) and refuse batches of over 64 messages. _(Remote API 1.0.1)_
- **`export_model` could write anywhere**: text of the caller's choosing into any file of the computer. It now writes only below `exports/` (or `S3D_EXPORT_DIR`), with the format's file ending, and not through links.
- **Texts from language files** no longer run as markup in the welcome tour, the AI wizard and the terrain panel: only simple emphasis stays. _(AI assistant, Terrain)_
- **Scripts** run in a worker without network, storage or `navigator`. Only scripts that call a plugin's `s3d` function go to the main thread – before, any unknown name in a script sent it there, with access to everything.
- **Links in plugin catalogs** must be web addresses (`javascript:` ran in the app when clicked). The plugin portal too.
- **Generated code**: a line break in a name can no longer add lines to the code of _Open as code_.
- **Images in model files** must be stored in the file; an address elsewhere is not loaded.
- **The built app has a Content Security Policy** without inline scripts, also the desktop app (which had none) and the Docker image, which sends further security headers. The dev container drops its capabilities.
- **The screenshot mode of the dev server** only runs files below `/plugins/` – a link to it could run any script from anywhere.
- **Blender** converts `.blend` files with `--disable-autoexec`, two conversions at a time.
- New: [SECURITY.md](SECURITY.md) – what can be attacked, what counts as code, how to report a problem.

### Added

- **Procedures – modelling you can change later**: _Union_, _Subtract_, _Intersect_ and _Outer shell_, _Follow me_ and the new tool _Copy along_ make a procedural group that keeps what it was made from. Entity Info shows its settings – the operation, the number of copies or their spacing, turning along the path – and the result follows at once. Opening the group (double-click, or _Edit inputs_) shows its inputs instead of its result, to be edited with any tool; the result is built again in the same undo step. A procedure can be used as an input of another one. _Explode to inputs_ gives the inputs back as ordinary groups, _Explode_ keeps the result. If a build fails, the last result stays and Entity Info says why. Saved with the model.
- **Copy along**: select groups or components and click a path – a line of edges or a group of edges. Type the number of copies (`7x`) or a spacing afterwards.
- **Moving from an outline edge**: with _Move_, a group or component can be picked up at its outline as the camera sees it (orange, _On outline_) – also round things, whose outline is no real edge. While it moves it is see-through, so what lies behind it can be seen and snapped to; afterwards it looks as before.
- **Leaning against a face when rotating**: while _Rotate_ picks the angle over a face, the angle snaps where the start point's circle meets that face – a red cross and _From radius on face_ show it. So a ladder rotated about its foot leans exactly against the wall.
- **Rectangles along any edge**: a rectangle started on an edge follows that edge instead of the model axes (drawn in magenta); while drawing, the down arrow aligns it with the edge touched last, pressed again it goes back to the axes. Started on an edge or corner of a sloping face, it now lies in that face instead of on the ground.
- **Rounding corners with the 2-point arc**: start the arc on an edge – on the neighbouring edge the point as far from the corner snaps (_Same distance from the corner_), then the bulge snaps where the arc touches both edges (cyan, _Round corner_) and the corner piece is cut off. Double-click another corner to round it the same way; double-click an arc between two straight edges to get its corner back (the edges become whole again, the face keeps its material). Corners whose edges bound other faces too (e.g. on a box) keep their piece.
- **Snapping on/off**: <kbd>F3</kbd>, the magnet in the status bar or _Edit › Snapping_ switch it (remembered in the browser). Off, lines, rectangles, circles, arcs, moving and the other tools take the point under the cursor on the face, plane or ground – no snapping to points, edges, guides and axes, to 15° steps when rotating, to round scale factors, squares or half circles. Arrow-key and Shift locks still work.
- **Moving with the arrow keys**: with something selected (Select, or Move before the start point), the arrow keys move it one step of the ground grid as it shows there – left/right and up/down along the red or green axis that runs most that way on screen, <kbd>Shift</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> along the blue axis, <kbd>Alt</kbd> a tenth of the step. Each press is one undo step.
- **Rotation grips on the box of groups and components**: with _Move_, a selected (or hovered) group or component shows its bounding box in its own axes with red crosses on the faces that face you – click or drag one to rotate the object about that face's axis through its centre; letting go (or a second click, or a typed angle) ends it and _Move_ is back. Corners and edge midpoints of the box are start points for moving. With _Rotate_ the protractor snaps to the crosses: it lies on that face, centred on it.
- **Ambient occlusion** as a style setting: _Styles › Ambient occlusion_ darkens inner corners and the ground where objects stand on it – with distance, intensity and colour, saved in the model's style (and in scenes). It works in the viewport, in scene thumbnails, in exports and in views rendered for plugins (`context.render.image`, e.g. the animation plugin's films). Glass does not cast it; style presets leave it as it is. Own shaders in the core (no new library).

### Changed

- **No stray lines on imported meshes**: flat areas of OpenSCAD results, imported files and solid tool results no longer show leftover lines where faces in one plane could not be merged.
- **Undo takes far less memory**: undo steps are kept as text, groups that did not change share it, and the oldest steps go when the history passes 256 MB. Autosave no longer writes out a model again and again that does not fit into the browser's storage.
- **Importing and changing big meshes no longer stops the app**: the faces of imported files (STL, OBJ, glTF, Collada, FBX …) and _More polygons_ and _Fewer polygons_ in the Mesh panel run in a worker. Reading a file stays on the main thread.
- **Drawing takes less memory and time**: copies of a component with the same look share geometry and materials, instead of each having its own, and so do the front and back of faces (positions and normals). A copy that looks different for a while (`display.look`) gets its own colours only then.
- **Picking on big models is fast**: points and edges are only looked at in groups near the cursor, and their records are made when needed – not for the whole model with every change. Big meshes are picked through a tree.
- **Images no material uses any more** leave memory and the graphics card.
- **Plugin API**: `meshes.prepare(mesh, options)` and `meshes.prepareAll(list)` make the faces of big meshes in a worker, the result goes into `meshes.add` or `meshes.build`. A script extension can throw an error with `retryAfter: promise`: the script is undone without a message and runs again when the promise is done.
- **Mode switch centred**: the switch _Model | …_ (plugin modes and workspaces such as physics or layout) sits on its own at the top centre, apart from the bar with the model name, undo and redo; the active mode is filled in blue.
- **Solid tools keep their inputs**: _Union_, _Subtract_, _Intersect_ and _Outer shell_ now make a procedure instead of replacing the solids for good; it takes the target's place, name, tag and data. Several solids work at once: _Subtract_ takes all the others from the one selected last. _Trim_ and _Split_ still replace the solids, but their pieces keep the same details.
- **Solid tools keep the structure**: _Subtract_, _Intersect_, _Trim_ and _Split_ cut each group inside a solid on its own, so a wall made of parts stays made of parts, with their names, tags, materials and data; a component the tool does not reach stays that component. A group made only of solids now counts as a solid. _Union_ and _Outer shell_ melt the parts into one, as they must. Tags on single faces are not kept. _Follow me_ makes a procedure from a loose path and a profile on its own; on edges of a solid (rounding a box) it works on the geometry as before.
- **Undo and redo end a running action first**: in the middle of an action they cancel it (with a message, the status line follows) and leave the history as it is; the next press goes on as usual. This also works with an empty history – the buttons are enabled then and say _Cancel the current action_ – and for placing a component, erasing, the lasso and dragging a selection box.

- **Plainer words for beginners**: the status line, messages and Entity Info say things in everyday words ("keep to a direction" instead of inference, "closed body" with what makes one, "Made from" and "Take apart into its parts" for procedures). A message that a solid tool cannot be used now says why. The German texts address people the same way everywhere.
- The status line and the measurements box at the bottom are hidden while a workspace of a plugin is open: they belong to the 3D tools.

- **Opening files says what to do**: an unknown type, a SketchUp or Blender file without the converter and a damaged file each say so in a sentence and what to do instead, without internal error texts or commands for developers in the first place.
- **Script errors are short**: the mistake and its line instead of the app's stack, and a mistyped command names the one probably meant (`s3d.bx does not exist. Did you mean s3d.box?`).
- Greyed-out buttons in Tags and Soften say why, and the Tags panel says what tags are for.

### Fixed

- A new model starts with its name in the chosen language instead of English.
- Undo labels of the polygon tools and the error message of a failed step followed no language.
- Tool buttons have names for screen readers.
- <kbd>Ctrl</kbd>+<kbd>Z</kbd> and other shortcuts with <kbd>Ctrl</kbd> no longer switch what <kbd>Ctrl</kbd> alone switches in a tool: _Move_ stayed on copying after <kbd>Ctrl</kbd>+<kbd>Z</kbd>, and _Tape measure_ and _Push/Pull_ changed their mode.
- <kbd>Ctrl</kbd>+<kbd>Y</kbd> in the middle of a move no longer redoes a step under the running action.
- _Trim_ and _Split_ with more than two solids selected no longer delete the others: they use the first two and leave the rest alone.
- Pressing <kbd>Ctrl</kbd> twice during a move no longer crashes the tool: the selection comes back when copying is switched off again.

## [0.10.0] – 2026-11-01

### Added

- **Asynchronous script builds**: JavaScript scripts (`s3d.…`, from the script editor, the AI assistant or the remote API) run in a Web Worker. The finished model arrives as one undo step and the status bar shows _"Script is building the model …"_ while it builds – the browser stays responsive even with scripts of thousands of faces, where it froze before. Scripts that need a plugin's `s3d.` extension (e.g. `s3d.text3d`), that build inside an open group, or that have no worker (old webview, CSP) run as before on the main thread. The script editor shows the build indicator too and keeps its Run button disabled until the build is in.
- **Workspaces for plugins**: a plugin can add a workspace next to the 3D model (`context.workspaces`). The top bar then shows a switch _Model | …_; the active workspace fills the window below the top bar.
- **Views rendered on demand** for plugins (`context.render`): a camera, style, hidden tags, size and an optional drawing scale give an image or vector lines with hidden lines removed – without changing the viewport.
- **Plugin data on the model** (`context.data.getModel` / `setModel`), saved in the `.shap3d.json` – next to the data on groups and components.
- **Plugin data on instances**: `context.data.get/set` also take a single instance (e.g. the properties of one game object); the data is saved and copied with the instance.
- **Data change events** for plugins (`context.events.onDataChange`): a change of plugin data is announced at the end of the undo step it was made in, still inside it – what a listener changes is undone with it.
- **Data formats** (`context.data.formats.register`, `data.read`, `data.write`): a plugin describes data under a key with a version and a check, so other plugins read and write it without that plugin running. The terrain plugin declares its height grid as `terrain.grid`.
- **Plugin bundles**: a folder whose `package.json` lists packages in `shap3d.bundle` installs them together – each stays on its own (switched off, removed, updated separately), and a newer installed version is kept.
- **Modes for plugins** (`context.modes`): next to the workspaces in the top bar, a mode keeps the 3D view but shows only its own tools in the toolbar and its own panels on the right.
- `context.commands.run` runs the app's own commands too (e.g. `export-glb`) when the plugin has none of that name.
- `context.panels.close()` closes the open panel (with an id only that one).
- **Plugins from a zip or a URL**: _Plugins › Load plugin zip…_ installs the zip of a plugin release, _From URL…_ a plugin folder on a web server (or a zip) – and a plugin installed from a folder URL offers _Update to …_ when a newer version is there. A package's `shap3d.minAppVersion` names the oldest app it runs on.
- **Discover plugins** (_Plugins › Discover_): the plugins of the plugin catalog – this repository's and the community's – install with one click, show _Installed_ or _Update to …_; catalogs of your own can be added. A plugin from outside the repository asks first. `?install=<url>` in the app's address (what the plugin portal's buttons open) installs a plugin after asking.
- **Plugin portal**: a page on the project's GitHub Pages with the catalog, searchable, official and community plugins apart, each with a picture (or its initials), _Install_ and a page of its own with its README; community plugins are listed through `plugins/community.json`, checked by the CI.
- **Plugin releases on their own**: a workflow releases each plugin in `plugins/` as `<id>-v<version>` with its built zip once its changelog section is dated, and can put the newest of each on GitHub Pages with an index – a plugin without a release as a preview built from `main`.
- **Plugin examples in the script editor** (`context.script.addExample`): a plugin's demos are listed under its name; the example list shows only the examples of the chosen language (the app's, a plugin language's own, the plugins', the user's scripts).
- **Panels that belong to a mode** (`panels.register({ inMode: true })`): their tiles show only in a mode that lists them – no tile, palette entry or command outside it, and leaving the mode closes them.
- **Lights and atmosphere for plugins** (`context.lighting`): point lights and spots, fog, how much daylight is left and a background – while a plugin sets any, faces are drawn lit so the lights fall on them; they belong to the view, not to the model. With `shadow: true` a light casts shadows (the first four in the view), also when the model's sun shadows are off.
- **Moving instances in the view** for plugins (`context.display.place(instance, matrix | null)`): an instance is drawn at another place without changing the model or the undo history – e.g. enemies walking in a test run; `null` puts it back.
- **Looks in the view** for plugins: `context.display.look(instance, { color, opacity, hidden } | null)` shows an instance with everything in it in another colour, see-through or hidden, `context.display.material(name, { color, opacity } | null)` a material – without changing the model, put onto the built meshes so nothing is built again (a material's opacity builds the view once). `context.lighting.sun({ hour, month, daylight } | null)` moves the sun and dims it for the view (a sunset) without a new build.
- **The end of every undo step** for plugins (`context.events.onUndoStep`): called after a command, a script or a tool's move, still inside the step – what the listener changes (e.g. keys that follow what a tool did) is undone with it.
- Screenshot scenes: `&command=<id>` runs commands after the scene.
- **Shader materials** for plugins (`context.materials.registerShader`): a plugin brings a surface function in GLSL with parameters; a material that uses it is drawn with it in the 3D view, with and without shadows, in scene previews and in rendered views. In the Materials panel the shaders are listed with the textures and their parameters become sliders and colour pickers, the swatches show the pattern. Without the plugin the material shows its colour again – the shader and its parameters stay in the model. Scripts: `s3d.material(name, colour, { shader, params })`.
- **Own image textures**: _Own image…_ in the texture list of the Materials panel loads a picture (PNG, JPEG, WebP, GIF, BMP) into the material. It is saved in the model (larger than 2048 px it is scaled down first) and drawn as it is, not tinted. Width and height (the height follows the picture's proportions), offset along and across the face and rotation can be set – offset and rotation work for the built-in textures too.
- **Textures in glTF/GLB exports**: own images and the built-in textures are exported with texture coordinates instead of only the colour. Shader materials are **baked** into a picture: every face gets its own patch, drawn from its real position – so the pattern runs on around corners like in the 3D view.

### Fixed

- Instances inside an instance shown elsewhere (`display.place`) are drawn where their parent is shown, with their own place added – before, the innermost place won and its parents' places were left out. The selection outline, the hover box and the dashed box of the open group follow places shown; snapping to their corners and edges, picking and drawing inside an open group work where they are shown; hidden groups can no longer be picked.
- Smeared rulers, labels and measures at the right and bottom of the 3D view when the page is zoomed out (a pixel ratio below 1): the overlay is now cleared completely before every frame.
- The tiles on the right no longer run off low screens: they scroll between the top bar and the status bar and get a little smaller on low windows.
- _Update_ in the plugin manager only shows for a plugin from a folder when the folder holds a new build (or can't be read without asking) – and it goes away after the update. The folders are checked again when the window gets the focus back, e.g. after `npm run build`.
- A new build of an installed plugin package replaces it even when its version stays the same: loading the folder (or zip) again compares the code and files, not only the version, and says _updated_ – or _up to date_ when nothing changed. `?package=<folder>` in the screenshot mode always installs the current `dist` instead of keeping an installed copy.

_(Languages 1.0.3; LayOut package 1.0.0 – sheets for plans with 2D tools and floor plan symbols, built on these; Room planner package 1.0.0 – furnish a room with snapping, measures and a shopping list; Shader materials package 1.0.0 – wood, marble, granite, terrazzo, rust, brick, checker and concrete as shaders, built on these)_

## [0.9.0] – 2026-10-25

### Added

- **Guide points with the tape measure**: Ctrl now cycles _measure only › guide lines › guide point_. In guide point mode only a point is set at the end of the measurement, and a double-click places a single guide point right where you click, in every mode. A click on an edge without moving away no longer leaves a guide line on top of the edge.
- **Scene tabs** above the viewport: a click jumps to the scene, hovering shows a preview of it, **+** adds a scene from the current view. Scenes now keep a small preview image. _View › Scene tabs_ (or the command palette) hides them for the model.
- **Outliner sorted by tags**: _Hierarchy | Tags_ at the top of the outliner. By tags, every group and component (at any depth) is listed under its tag – in the order of the Tags panel, untagged ones last, each tag can be collapsed. The choice is kept in the browser.
- **Tags to scenes**: _To scenes…_ in the Tags panel writes the highlighted tag's current visibility into the scenes you tick, as one undo step.
- **Purge reminder**: _File › Remind to purge unused when saving_ – when it is on, saving asks whether unused groups and components should be purged first. Off by default, kept in the browser.

### Fixed

- Renaming or deleting a tag also updates the scenes – they kept hiding the tag under its old name.

_(Languages 1.0.2)_

## [0.8.0] – 2026-10-22

### Added

- **Native desktop app** with [Tauri 2](https://tauri.app): Shap3D.ai in its own window, as a stand-alone executable and with installers – MSI and NSIS setup on Windows, `.dmg` on macOS, `.deb`, `.rpm` and AppImage on Linux (`npm run desktop:dev`, `npm run desktop:build`). It uses the system's web view, so the Windows setup is only about 3 MB.
- App icons for all desktop platforms, generated from the favicon; dropping files on the window imports them as before.

### Changed

- The app version lives in one place only, `package.json` – the executable and the installers take it from there.
- The dev server keeps its port (5173) and ignores the Rust side in `src-tauri/`.

### Known limitations

- The remote API (REST, Swagger UI, MCP), the AI proxy and the converters for `.blend` and `.skp` files need the dev server and are not part of the desktop build yet. A local AI server has to allow the app's origin (`http://tauri.localhost` on Windows, `tauri://localhost` on macOS and Linux).

## [0.7.0] – 2026-10-22

### Added

- **Remote API** (built-in plugin _Remote-API_, dev server only) _(Remote API 1.0.0)_ – other programs and AI agents can control the editor that is open in the browser:
  - **REST API** under `/api` for the most common actions: scene and objects, creating solids (box, cylinder, sphere, cone, pyramid, prism, tube, torus, wedge, dome), moving/rotating/scaling, materials, running `s3d` scripts, undo/redo, camera and standard views, menu commands, export (GLB, glTF, OBJ, STL, JSON) and screenshots.
  - **OpenAPI 3.1** definition at `/api/openapi.json` and **Swagger UI** at `/api/docs` to read and try every endpoint.
  - **MCP server** at `/mcp` (Streamable HTTP) with 21 tools – e.g. for Claude Code via the project's `.mcp.json` – and a stdio bridge for clients without HTTP.
  - **Remote-API panel**: connection status (which tab receives the requests, _Use this tab_), an activity log of every REST and MCP call, links to the documentation and the MCP set-up to copy.
- **Docker**: `docker compose up --build` runs the app with the remote API; a second target serves the production build with nginx.
- **Ground grid**: the axes in the grid and the labels along the axes and grid can be switched on and off (panel _Display_, menu _View_, command palette) – translated in all languages _(Languages 1.0.1)_.
- **Camera**: animated change between standard views; the camera menu marks the active view separately from the projection.
- **AI assistant** _(1.2.0)_: a window with the running model downloads, the model's thought process (folded), a warning when an answer was cut off at the token limit, a hint when a web filter (e.g. Sophos) holds back Ollama's progress, explanations of GGUF and mixture-of-experts models, and models that are no language model are marked as _not for Ollama_.

### Changed

- The README recommends `npm ci` instead of `npm install` – it installs exactly the versions in `package-lock.json`.
- Built-in plugins have their own version numbers instead of a fixed `1.0.0`, reconstructed from the history (see the table above); the MCP server reports the version of the Remote API plugin.

### Fixed

- Several layout details in the AI assistant (chat, setup wizard, model search) _(AI assistant 1.2.0)_ and in the ground grid.

### Security

- The remote API only accepts requests from this computer: programs without a browser origin and pages on `localhost`; cross-site requests from other websites are refused.
- The Docker setup publishes the port on `127.0.0.1` only.

## [0.6.0] – 2026-10-20

### Added

- **Code completion** in the script editor for the `s3d` API, option names and values; plugins can add completions for their own languages and values – the 3D-text plugin completes its font names _(3D text 1.1.0)_.
- **Languages** (new built-in plugin) _(Languages 1.0.0)_: English is the default, with German, French, Spanish and Arabic (right-to-left) – a language switch in the top bar, a translation editor with search, progress and live preview, language files to import and export, and a template for new languages. Plugins bring their own texts; the AI assistant, terrain, import formats and 3D text are translated into all five languages _(AI assistant, Terrain, Import formats 1.1.0)_.
- `scripts/i18n.mjs` to check translations, find hard-coded text and write the template.
- Linting and formatting with **oxlint** and **oxfmt**.
- OpenSCAD plugin: code completion for OpenSCAD _(OpenSCAD 1.3.0)_.

### Changed

- Reactive state uses `shallowRef` where deep reactivity is not needed (faster with large models).
- OpenSCAD plugin rewritten in TypeScript, split into modules and built with Vite in library mode, with texts in five languages _(OpenSCAD 1.4.0)_.

## [0.5.0] – 2026-10-19

### Added

- **Plugin system**: plugins add commands, tools, panels, icons, script functions (`s3d.<name>()`), script languages, importers and exporters, overlays, context-menu entries and top-bar buttons; they keep settings and files in the browser and data on groups. Plugin packages are loaded from a folder and can be updated in place. Three example plugins: cursor coordinates, grid generator and parts list.
- **OpenSCAD plugin package** – runs the official OpenSCAD as WebAssembly: opens `.scad` files, adds OpenSCAD to the script editor and provides `s3d.scad()` _(OpenSCAD 1.1.0)_.
- **Open as code**: any object can be opened as code (JavaScript, JSON, OpenSCAD …) and converted between the formats _(OpenSCAD 1.2.0)_.
- **3D text** (built-in plugin) _(3D text 1.0.0)_: letters and numbers in 15 fonts or your own TTF/OTF/WOFF files, flat or upright, filled, extruded or as an outline, and `s3d.text3d()`.
- **Infinite ground grid** that gets finer while zooming in (mm · cm · m).

### Changed

- Terrain editor, import formats (FBX, Collada, KMZ, 3DS, PLY, 3MF, AMF, VRML, USD/USDZ, Blender) and the AI assistant became built-in plugins that can be switched off _(Terrain, Import formats, AI assistant 1.0.0)_.

### Fixed

- Push/pull in edge cases and snapping (locking) to edges and axes.

## [0.4.0] – 2026-10-18

### Added

- **Welcome tour** on the first start.
- A help page instead of the loading screen when the browser has WebGL turned off.
- **Reference persons** show their height, and **rulers** with tick marks run along the axes.
- **Command palette** to find and run every command.

### Changed

- Styling moved to **Tailwind CSS** (with design tokens for light and dark mode); sizes in `rem` instead of `px`.
- The splash screen is a Vue component and the editor loads as its own bundle behind it.
- Shared logic uses **VueUse** composables; every component carries the `S3d` prefix.
- Code clean-up: readable names and function expressions throughout.

### Fixed

- Missing Tailwind classes after the switch.

## [0.3.0] – 2026-10-16

First version in this repository:

- **Direct modeling** with push/pull: lines, rectangles, circles, arcs, push/pull, move, rotate, scale, offset, follow me, groups and components, tags, guides, dimensions, section planes and solid tools.
- **Local AI copilot** with Ollama or LM Studio: code models write `s3d` scripts, mesh models (LLaMA-Mesh) return geometry; fast mode, setup wizard, Hugging Face model search and a searchable chat history.
- **Script editor** with the `s3d` API (44 commands with reference and examples), 52 ready-made materials and 12 procedural textures.
- **Terrain editor**, **polygon inspector** (exact resolution, more or fewer polygons), **dark mode** and **night scene**.
- Import of SKP, OBJ, STL and glTF/GLB files; export as GLB, glTF, STL, OBJ, PNG and the native `.shap3d.json`.

[Unreleased]: https://github.com/Chris2011/shap3d.ai/compare/v0.10.0...HEAD
[0.10.0]: https://github.com/Chris2011/shap3d.ai/compare/v0.9.0...v0.10.0
[0.9.0]: https://github.com/Chris2011/shap3d.ai/compare/53dc278...v0.9.0
[0.8.0]: https://github.com/Chris2011/shap3d.ai/compare/15aab26...53dc278
[0.7.0]: https://github.com/Chris2011/shap3d.ai/compare/753a191...15aab26
[0.6.0]: https://github.com/Chris2011/shap3d.ai/compare/8f34310...753a191
[0.5.0]: https://github.com/Chris2011/shap3d.ai/compare/27cb174...8f34310
[0.4.0]: https://github.com/Chris2011/shap3d.ai/compare/699e0ce...27cb174
[0.3.0]: https://github.com/Chris2011/shap3d.ai/commit/699e0ce

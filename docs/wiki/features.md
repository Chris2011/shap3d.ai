# Features

## Highlights

- **Push/pull modeling in the browser** – or as a [native desktop app](getting-started.md#desktop-app-tauri) for Windows, macOS and Linux with its own window and installer. A real boundary-representation kernel with faces, edges, groups and components, inference snapping and solid tools.
- **AI that runs on your machine** – talk to Ollama, LM Studio or LiteLLM. The assistant writes modeling scripts, or a mesh model such as LLaMA-Mesh generates geometry directly. No cloud, no API keys.
- **Scriptable** – a small JavaScript API (`s3d.box(…)`, `s3d.terrain(…)`, …) with 44 documented commands, 52 ready-made materials and a searchable in-app reference.
- **Terrain sculpting** – raise, lower, smooth and flatten landscapes with a brush. Grass, earth, rock and snow are painted automatically.
- **Polygon inspector** – see every vertex and triangle, change the segment count of round shapes, subdivide or simplify any mesh.
- **Command palette like in VS Code or IntelliJ** – <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>, <kbd>F1</kbd> or <kbd>Shift</kbd> twice finds every tool, command, panel, switch, material, scene and object in one fuzzy search.
- **Measuring aids** – rulers on the axes that switch from metres to centimetres to millimetres as you zoom in, an infinite ground grid whose spacing follows the zoom, and reference people that show their height.
- **Plugin system** – extend the app with plain JavaScript modules or whole plugin packages: commands, tools, panels, script commands and languages, file importers and exporters, overlay drawings. Three examples are included, plus an **OpenSCAD plugin** that runs the real OpenSCAD in the browser.
- **Welcome tour** – six short animated steps on the first start, available again any time from the menu.
- **Dark mode with a real night scene**, a split button for every combination, and the interface in English, German, French, Spanish or Arabic.

## Direct modeling

The toolset follows the familiar push/pull workflow: draw a shape, pull it into 3D, refine it.

| Area         | What you get                                                                                                                                                                                                                                                                                                                                                                                |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Drawing      | Line, freehand, rectangle, rotated rectangle, circle, polygon, three arc tools, pie, 3D text in 16 fonts (plus your own)                                                                                                                                                                                                                                                                    |
| Modifying    | Push/pull, offset, move/copy, rotate, scale, follow me, flip, eraser, paint bucket                                                                                                                                                                                                                                                                                                          |
| Precision    | Inference engine (endpoints, midpoints, edges, faces, axis and parallel locks), measurement box for typed values, tape measure, protractor, dimensions, guides                                                                                                                                                                                                                              |
| Structure    | Groups, reusable components with live instances, tags, outliner, entity info                                                                                                                                                                                                                                                                                                                |
| Solids       | Union, subtract, intersect, outer shell, trim and split (CSG via `three-bvh-csg`)                                                                                                                                                                                                                                                                                                           |
| Presentation | Styles (shaded, textured, monochrome, hidden line, wireframe, X-ray), section planes, scenes, sun shadows, reference people with a height dimension, zoom-dependent rulers on the axes                                                                                                                                                                                                      |
| Files        | Native `.shap3d.json` files, import from SketchUp, Blender, 3ds Max and more – **SKP, BLEND, FBX, 3DS, DAE, KMZ, OBJ, STL, glTF/GLB, PLY, 3MF, AMF, VRML, USD/USDZ** – with materials, groups and unit detection (menu or drag & drop), export to GLB, glTF, STL, OBJ and PNG, autosave in the browser; IFC import and IFC4 export with the [IFC plugin](plugin-packages.md#the-ifc-plugin) |

The AI assistant, the script editor, languages and file import have pages of their own: [Local AI copilot](ai.md), [Scripting](scripting.md), [Languages and translations](languages.md) and [Importing](import.md).

## Terrain editor

![Terrain editor](../screenshots/terrain.png)

Turn a rectangle into a landscape, or start a new terrain from scratch, then sculpt it directly in the 3D view.

- Brushes for **raise, lower, smooth, flatten and roughen**. Hold the mouse to keep working, <kbd>Shift</kbd> inverts, <kbd>[</kbd> <kbd>]</kbd> resize the brush.
- **Automatic surfaces**: grass on flat ground, earth on slopes and in hollows, rock on peaks and cliffs, optional snow. Every layer can use any material.
- Quick hills/mountains, an **earth base** with side walls, and an optional **water level**.
- When you apply, the terrain becomes a normal group. It stays editable later because the height grid is saved with the model.
- The terrain editor is a [built-in plugin](plugins.md#built-in-plugins) – it can be switched off in the plugin manager.

## Polygon inspector

![Polygon inspector](../screenshots/mesh.png)

- Show **vertices, face triangulation and softened edges** for every object, with live counts for the selection or the whole model.
- **Exact resolution** for round shapes: rebuild a cylinder, sphere, cone, torus, tube or dome with more or fewer segments, including circles you have drawn before pushing them up.
- **More polygons** for any object (keep the shape, or round it with Loop subdivision) and **fewer polygons** via edge-collapse simplification.

## Command palette

![Command palette](../screenshots/palette.png)

Press <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>, <kbd>F1</kbd>, <kbd>Ctrl</kbd>+<kbd>K</kbd> or <kbd>Shift</kbd> twice (as in IntelliJ) to reach everything in the app from the keyboard.

- **One search for everything**: tools, menu commands, panels, display switches, AI settings, components and reference people, materials (in the model and the whole library), scenes, tags and the objects in your model.
- **Fuzzy matching** with highlighted letters, word starts and German as well as English search words ("dark" finds _Dunkles Design_).
- **Switches show their state**. <kbd>Enter</kbd> runs an entry and closes the palette, <kbd>Shift</kbd>+<kbd>Enter</kbd> runs or toggles it and keeps the palette open.
- **Prefixes** narrow the search: `>` commands, `@` objects in the model (select and zoom to them), `#` materials (pick one and start painting). Recently used entries come first.

## Measuring: rulers on the axes and people with their height

![Rulers on the axes and the height of a reference person](../screenshots/measure.png)

- **Rulers on the axes**: tick marks along the red, green and blue axes. Zoomed out you see whole metres; the closer you get, the finer the scale becomes – 10 cm, centimetres and finally millimetres, with labels wherever there is room.
- **Height of reference people**: every person shows a dimension line with its height, in metres, or in centimetres and millimetres when you are close.
- **Ground grid**: an infinite grid on the XY plane, like in Blender or KiCad. It reaches to the horizon and fades out there, and its spacing follows the zoom – millimetres, centimetres, decimetres, metres, 10 m and beyond, with stronger major lines every tenth line (1/16″, inches and feet for imperial models). The lines through the origin are tinted red and green, the lines along the X and Y axes are labelled when the rulers are off, and a small legend in the lower left shows the current spacing. Faces on the ground always stay in front of it, and geometry always wins: ruler ticks, grid labels and height dimensions behind a model stay hidden.
- All three can be switched on and off in **Anzeige** (Display), in **Menu › Ansicht** or in the command palette.

## Welcome tour

![Welcome tour](../screenshots/tour.png)

On the very first start a short tour with small animations explains the essentials: drawing and push/pull, navigating, the AI assistant, terrain, scripts and import, and the light/dark look. It can be closed at any step – including the first – with _Überspringen_, ✕ or <kbd>Esc</kbd>, and opened again any time via **Menu › Einführung** or the command palette.

## Dark mode and night scene

The sun/moon split button switches dark mode on and off. Its menu lets you set the interface (light, dark, follow the system) and the 3D scene (day, night, same as the interface) separately. You can have dark menus with a bright model, or turn the whole viewport into a night scene with a night sky, moonlight and light edges.

## Keyboard shortcuts

| Keys                                                                                                               | Action                                                 |
| ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd>, <kbd>F1</kbd>, <kbd>Ctrl</kbd>+<kbd>K</kbd>, <kbd>Shift</kbd> twice | Command palette                                        |
| <kbd>Space</kbd> <kbd>L</kbd> <kbd>R</kbd> <kbd>C</kbd> <kbd>A</kbd>                                               | Select, line, rectangle, circle, arc                   |
| <kbd>P</kbd> <kbd>F</kbd> <kbd>M</kbd> <kbd>Q</kbd> <kbd>S</kbd>                                                   | Push/pull, offset, move, rotate, scale                 |
| <kbd>E</kbd> <kbd>B</kbd> <kbd>T</kbd> <kbd>G</kbd>                                                                | Eraser, paint bucket, tape measure, make component     |
| Middle mouse button, <kbd>Shift</kbd> + middle mouse button, wheel                                                 | Orbit, pan, zoom                                       |
| <kbd>Shift</kbd>+<kbd>Z</kbd>, <kbd>Alt</kbd>+<kbd>K</kbd>, <kbd>K</kbd>                                           | Zoom extents, X-ray, back edges                        |
| <kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd>, <kbd>Ctrl</kbd>+<kbd>S</kbd>                          | Undo / redo, save                                      |
| Type a number and <kbd>Enter</kbd>                                                                                 | Exact length, distance or angle while a tool is active |

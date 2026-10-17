<p align="center">
  <img src="docs/logo.svg" alt="Shap3D.ai" width="560">
</p>

<p align="center">
  <b>Easy 3D modeling in the browser – with a local AI copilot.</b><br>
  Sketch, push/pull, script and sculpt terrain – everything runs on your own machine.
</p>

<p align="center">
  pronounced <b>“shaped AI”</b> &nbsp;/ʃeɪpt eɪ aɪ/</sub>
</p>

<p align="center">
  <img alt="Vue 3" src="https://img.shields.io/badge/Vue-3.5-42b883">
  <img alt="three.js" src="https://img.shields.io/badge/three.js-r186-black">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178c6">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646cff">
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-38bdf8">
  <img alt="Local AI" src="https://img.shields.io/badge/AI-100%25%20local-5fd4e6">
  <a href="LICENSE"><img alt="License: Apache 2.0" src="https://img.shields.io/badge/License-Apache%202.0-blue"></a>
</p>

![Shap3D.ai – house on a sculpted terrain](docs/screenshots/hero.png)

> **Inspired by SketchUp – not affiliated with it.** Shap3D.ai is an independent project written from scratch.
> Its push/pull workflow and the look of its interface are inspired by SketchUp, but it contains no SketchUp code
> or assets. See [Legal notice](#legal-notice).

---

## Contents

- [Contents](#contents)
- [Highlights](#highlights)
- [Features](#features)
  - [Direct modeling](#direct-modeling)
  - [Local AI copilot](#local-ai-copilot)
  - [Script editor and the `s3d` API](#script-editor-and-the-s3d-api)
  - [Terrain editor](#terrain-editor)
  - [Polygon inspector](#polygon-inspector)
  - [Dark mode and night scene](#dark-mode-and-night-scene)
- [Getting started](#getting-started)
- [Importing from SketchUp, Blender, 3ds Max and others](#importing-from-sketchup-blender-3ds-max-and-others)
- [Connecting a local AI model](#connecting-a-local-ai-model)
- [Scripting example](#scripting-example)
- [Project structure](#project-structure)
- [Regenerating the screenshots](#regenerating-the-screenshots)
- [Credits](#credits)
- [Legal notice](#legal-notice)
- [License](#license)

## Highlights

- **Push/pull modeling in the browser** – a real boundary-representation kernel with faces, edges, groups and components, inference snapping and solid tools.
- **AI that runs on your machine** – talk to Ollama, LM Studio or LiteLLM. The assistant writes modeling scripts, or a mesh model such as LLaMA-Mesh generates geometry directly. No cloud, no API keys.
- **Scriptable** – a small JavaScript API (`s3d.box(…)`, `s3d.terrain(…)`, …) with 44 documented commands, 52 ready-made materials and a searchable in-app reference.
- **Terrain sculpting** – raise, lower, smooth and flatten landscapes with a brush. Grass, earth, rock and snow are painted automatically.
- **Polygon inspector** – see every vertex and triangle, change the segment count of round shapes, subdivide or simplify any mesh.
- **Dark mode with a real night scene**, a split button for every combination, and a German user interface.

## Features

### Direct modeling

The toolset follows the familiar push/pull workflow: draw a shape, pull it into 3D, refine it.

| Area | What you get |
| --- | --- |
| Drawing | Line, freehand, rectangle, rotated rectangle, circle, polygon, three arc tools, pie, 3D text |
| Modifying | Push/pull, offset, move/copy, rotate, scale, follow me, flip, eraser, paint bucket |
| Precision | Inference engine (endpoints, midpoints, edges, faces, axis and parallel locks), measurement box for typed values, tape measure, protractor, dimensions, guides |
| Structure | Groups, reusable components with live instances, tags, outliner, entity info |
| Solids | Union, subtract, intersect, outer shell, trim and split (CSG via `three-bvh-csg`) |
| Presentation | Styles (shaded, textured, monochrome, hidden line, wireframe, X-ray), section planes, scenes, sun shadows, reference people |
| Files | Native `.shap3d.json` files, import from SketchUp, Blender, 3ds Max and more – **SKP, BLEND, FBX, 3DS, DAE, KMZ, OBJ, STL, glTF/GLB, PLY, 3MF, AMF, VRML, USD/USDZ** – with materials, groups and unit detection (menu or drag & drop), export to GLB, glTF, STL, OBJ and PNG, autosave in the browser |

### Local AI copilot

![AI assistant and night scene](docs/screenshots/night.png)

Describe what you want ("a small house with a gable roof, windows and a wooden door") and the assistant builds it in your model as one undoable step.

- **Code models** (Qwen2.5-Coder, Qwen3, Llama 3.1 …) write `s3d` scripts. The system prompt contains the full API reference, typical real-world dimensions and worked examples, and a failed script is sent back to the model automatically so it can fix itself.
- **Mesh models** (LLaMA-Mesh) return raw OBJ geometry, which is imported as a component.
- **Fast mode** uses a compact prompt and short answers for computers without a graphics card. qwen2.5-coder:3b answers in about 25 s on a laptop CPU.
- **Setup wizard and model search**: connect a local server, then browse Hugging Face for GGUF models with size and speed hints and download them through Ollama with live progress, speed and time remaining.
- **Searchable chat history** with timestamps, a live "thinking" timer, syntax-highlighted code with a copy button, and models are unloaded from memory when you switch.

### Script editor and the `s3d` API

![Script editor with the API reference](docs/screenshots/scripts.png)

Write JavaScript or declarative JSON and run it with <kbd>Ctrl</kbd>+<kbd>Enter</kbd>. Every run is a single undo step.

- **API info**: a searchable reference of all 44 commands with signatures, descriptions and runnable examples. Insert an example at the cursor, or try it right away next to your model.
- **Shapes**: box, cylinder, cone, pyramid, prism, sphere, dome, ellipsoid, tube, torus, wedge, stairs, terrain, 3D text and OBJ meshes, plus faces, push/pull, offset and follow me.
- **Materials**: 52 ready-made materials (woods, stone, metals, glass, nature, fabrics, colours) usable by name, e.g. `{ material: 'Glas' }`, and 12 procedural textures.
- **OBJ mode**: paste raw mesh output (e.g. from LLaMA-Mesh) and it is scaled, oriented and placed for you.

### Terrain editor

![Terrain editor](docs/screenshots/terrain.png)

Turn a rectangle into a landscape, or start a new terrain from scratch, then sculpt it directly in the 3D view.

- Brushes for **raise, lower, smooth, flatten and roughen**. Hold the mouse to keep working, <kbd>Shift</kbd> inverts, <kbd>[</kbd> <kbd>]</kbd> resize the brush.
- **Automatic surfaces**: grass on flat ground, earth on slopes and in hollows, rock on peaks and cliffs, optional snow. Every layer can use any material.
- Quick hills/mountains, an **earth base** with side walls, and an optional **water level**.
- When you apply, the terrain becomes a normal group. It stays editable later because the height grid is saved with the model.

### Polygon inspector

![Polygon inspector](docs/screenshots/mesh.png)

- Show **vertices, face triangulation and softened edges** for every object, with live counts for the selection or the whole model.
- **Exact resolution** for round shapes: rebuild a cylinder, sphere, cone, torus, tube or dome with more or fewer segments, including circles you have drawn before pushing them up.
- **More polygons** for any object (keep the shape, or round it with Loop subdivision) and **fewer polygons** via edge-collapse simplification.

### Dark mode and night scene

The sun/moon split button switches dark mode on and off. Its menu lets you set the interface (light, dark, follow the system) and the 3D scene (day, night, same as the interface) separately. You can have dark menus with a bright model, or turn the whole viewport into a night scene with a night sky, moonlight and light edges.

## Getting started

Requirements: **Node.js 20.19+ or 22.12+** and a current Chromium, Firefox or Safari.

```bash
npm install
npm run dev
```

Open <http://localhost:5173>. The interface is in German.

```bash
npm run build     # production build in dist/
npm run preview   # serve the build locally
```

## Importing from SketchUp, Blender, 3ds Max and others

Drag a file onto the window or use **Menu › Importieren**. Every import becomes one component (one undo step) that sits on the ground at the origin.

| Program / use | Formats | How it works |
| --- | --- | --- |
| **SketchUp** | `.skp` | Through the **official SketchUp SDK** library – no SketchUp installation needed (see [setup](#reading-skp-files)) |
| | `.dae`, `.kmz` | Directly in the browser – SketchUp: **File › Export › 3D Model › COLLADA** |
| **Blender** | `.blend` | **Directly in the browser – no Blender needed.** Built-in reader for Blender 2.79 to 5.x, including compressed files |
| | `.glb` / `.gltf`, `.fbx` | Directly in the browser – Blender: **File › Export** |
| **3ds Max**, Maya, Cinema 4D | `.fbx`, `.3ds`, `.obj` | Directly in the browser. 3ds Max's own `.max` format can only be read by 3ds Max itself – export to FBX there |
| 3D printing | `.stl`, `.3mf`, `.amf` | Directly in the browser (3MF/AMF in millimetres) |
| Scanners, AR, web | `.ply`, `.usdz` / `.usd`, `.wrl` / `.vrml` | Directly in the browser |

What the importer takes care of:

- **Units**: read from the file where it says (Collada `<unit>`, FBX `UnitScaleFactor`, 3MF/AMF millimetres). Otherwise anything bigger than 100 units is treated as centimetres (or millimetres beyond 10,000). The import message tells you which unit was used.
- **Orientation**: Y-up formats are turned to the app's Z-up world.
- **Structure and materials**: every named node becomes its own group, and material colours and transparency are kept. Faces exported twice (front and back, as SketchUp does) become one face with a back material.
- **Limits**: image textures are not imported yet (those materials keep a neutral tone), and imports are capped at 200,000 triangles.

### Blender files

`.blend` files are read by a built-in reader (`src/core/blend/`) that understands Blender's self-describing file format directly, so neither Blender nor a server is needed. It handles:

- **Versions:** Blender 2.79 to 5.x, including the new Blender 5 file header and the 5.0 attribute storage.
- **Compression:** files saved with zstd or gzip.
- **Content:** mesh objects with their transforms (including parents), and material colours and transparency.

Modifiers and geometry nodes are not evaluated – the stored base mesh is imported (apply modifiers in Blender if you need the final shape). Meshes linked from other `.blend` files are skipped with a note. It was tested against the official Blender test files of the Blender Asset Tracer project.

### Reading .skp files

`.skp` is a closed format, so it is read with Trimble's official **SketchUp SDK**. The SDK is just a library; SketchUp itself does not have to be installed. Because a browser cannot load native libraries, the dev/preview server includes a small local converter (`tools/convertBridge.ts` + `tools/skp/skp2glb.py`). It runs the SDK on your computer and hands glTF back to the app; nothing is uploaded anywhere.

1. Download the free SketchUp SDK for your system from [developer.sketchup.com](https://developer.sketchup.com). A Trimble ID and accepting Trimble's SDK terms are required.
2. Unpack it to `tools/sketchup-sdk/`, or point `SKETCHUP_SDK` at the folder. Python 3.8+ must be available as `python`, standard library only.
3. Restart `npm run dev` and drop a `.skp` file onto the window.

Groups, components, transforms and material colours are taken over; the SDK's mesh helper triangulates the faces. Without the SDK the app explains what is missing, and the DAE export always works as a fallback. In a purely static deployment (only `dist/` on a web server) the converter is not available. The SDK is licensed by Trimble and must not be committed to this repository (`tools/sketchup-sdk/` is git-ignored).

## Connecting a local AI model

The AI features are optional and never contact a cloud service. The easiest route is [Ollama](https://ollama.com):

```bash
ollama pull qwen2.5-coder:3b     # fast, works without a GPU
ollama pull qwen2.5-coder:7b     # better results
```

Then click the sparkle icon in the top bar and follow the setup wizard. LM Studio, LiteLLM and any OpenAI-compatible server work too. In development, a small Vite proxy takes care of CORS.

## Scripting example

```js
s3d.material('Holz', '#a0703c');
s3d.terrain([-10, -8, 0], 30, 24, { hills: 4, snow: 3.5, water: 0.2 });

const tree = s3d.component('Tree', () => {
  s3d.cylinder([0, 0, 0], 0.15, 2, { material: 'Rinde' });
  s3d.ellipsoid([0, 0, 2.8], 1.2, 1.2, 1.5, { material: 'Laub' });
});
for (let i = 0; i < 6; i++) tree.place([i * 3, -6, 0]);

s3d.group('Bench', () => {
  s3d.box([0, 0, 0.42], 1.6, 0.4, 0.05, { material: 'Holz' });
  for (const x of [0.1, 1.45]) s3d.box([x, 0.05, 0], 0.05, 0.3, 0.42, { material: 'Stahl' });
});
s3d.zoomExtents();
```

Older scripts written with `su.` or `fw.` keep working – both are aliases of `s3d`.

## Project structure

```
src/
  core/        geometry kernel (entities, faces, push/pull, CSG), terrain, materials, mesh operations
  engine/      editor state, undo, three.js viewer, camera, inference, commands
  tools/       interactive tools (draw, modify, select, construct, terrain)
  scripting/   s3d API, API catalog, examples, OBJ import, resolution changes
  ai/          providers, prompts, agent, chat history, Hugging Face search
  terrain/     live terrain sculpting session
  components/  Vue UI – toolbars, panels, dialogs, AI chat, terrain window
docs/          logo and README screenshots
scripts/       screenshot automation
```

## Regenerating the screenshots

The images in `docs/screenshots` are rendered from demo scenes (`src/devShots.ts`) with headless Chrome:

```bash
npm run dev
powershell -File scripts/screenshots.ps1
```

## Credits

- [fzstd](https://github.com/101arrowz/fzstd) (MIT) – zstd decompression for compressed Blender files
- [three.js](https://threejs.org) (MIT), [three-bvh-csg](https://github.com/gkjohnson/three-bvh-csg) and [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) (MIT), [Vue](https://vuejs.org) (MIT), [Vite](https://vitejs.dev) (MIT), [Tailwind CSS](https://tailwindcss.com) (MIT)
- Reference people built from the [Humaaans](https://www.humaaans.com) illustrations by Pablo Stanley (CC0) – see `src/assets/people/LICENSE.md`
- Helvetiker and Optimer typefaces from the three.js examples, © MAGENTA Ltd. – see `src/assets/fonts/LICENSE`
- AI models are **not** bundled. Models you download (e.g. Qwen, Llama, LLaMA-Mesh) come with their own licenses.

## Legal notice

Shap3D.ai is an independent, non-commercial hobby project. It was built from scratch as a learning exercise and is **inspired by the modeling workflow of SketchUp**.

- It is **not affiliated with, endorsed by, sponsored by or otherwise connected to Trimble Inc.** or SketchUp.
- "SketchUp" and "Trimble" are trademarks of Trimble Inc. and are used here only to describe the source of inspiration.
- The project contains **no SketchUp source code, binaries, icons, assets or documentation**. All code, icons, cursors and graphics were created for this project or come from the open-source sources listed under [Credits](#credits).
- It does **not** reverse-engineer any proprietary file format. `.skp` files are opened only through **Trimble's official SketchUp SDK**, which every user downloads themselves under Trimble's terms; it is not bundled with this project. `.blend` files are opened by the user's own Blender installation. All other formats are open and documented.
- Similarities in the general user interface (tool names, push/pull, panel layout) reflect common 3D-modeling conventions and the author's inspiration, not copied material.

If you are a rights holder and see a problem, please open an issue and it will be addressed promptly.

## License

Shap3D.ai is licensed under the **Apache License 2.0** – see [LICENSE](LICENSE) and [NOTICE](NOTICE).

Bundled third-party assets keep their own licenses (fonts: MgOpen license, reference people: CC0), as listed in [NOTICE](NOTICE) and under [Credits](#credits).

# Changelog

All notable changes to Shap3D.ai are listed here – newest first.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/). Until 1.0 every minor version may bring larger changes.

Versions before 0.7.0 were not tagged at the time; they are reconstructed from the Git history and grouped by development phase.

The built-in plugins and the plugin packages ([OpenSCAD](plugins/openscad), [IFC](plugins/ifc), [LayOut](plugins/layout), [Room planner](plugins/roomplanner), [Shader materials](plugins/shaders)) have their own version numbers. A plugin's version only goes up when the plugin itself changes – new features (including whole new languages) raise the minor version, fixes and translations of a few new texts the patch version. The new version is given in brackets at the entry, e.g. _(AI assistant 1.2.0)_; every plugin has its own changelog with the details (linked in the table below).

| Version                   | Date       | In one sentence                                                          |
| ------------------------- | ---------- | ------------------------------------------------------------------------ |
| [0.9.0](#090--2026-10-25) | 2026-10-25 | Scene tabs, outliner by tags, guide points – and IFC as a plugin package |
| [0.8.0](#080--2026-10-22) | 2026-10-22 | Native desktop app with Tauri – executable and installers                |
| [0.7.0](#070--2026-10-22) | 2026-10-22 | Remote control: REST API, Swagger UI and MCP server, plus Docker         |
| [0.6.0](#060--2026-10-20) | 2026-10-20 | Code completion and five languages                                       |
| [0.5.0](#050--2026-10-19) | 2026-10-19 | Plugin system – terrain, imports, AI and 3D text become plugins          |
| [0.4.0](#040--2026-10-18) | 2026-10-18 | Welcome tour, command palette, rulers, Tailwind and VueUse               |
| [0.3.0](#030--2026-10-16) | 2026-10-16 | First version in this repository                                         |

Plugin versions per app version (**bold** = new version, plain = unchanged, – = not there yet):

| Plugin                                                                 | 0.5.0     | 0.6.0     | 0.7.0     | 0.8.0     | 0.9.0     |
| ---------------------------------------------------------------------- | --------- | --------- | --------- | --------- | --------- |
| [AI assistant](src/plugins/builtin/ai/CHANGELOG.md) (`ai`)             | **1.0.0** | **1.1.0** | **1.2.0** |
| [Terrain](src/plugins/builtin/terrain/CHANGELOG.md) (`terrain`)        | **1.0.0** | **1.1.0** |
| [Import formats](src/plugins/builtin/imports/CHANGELOG.md) (`imports`) | **1.0.0** | **1.1.0** |
| [3D text](src/plugins/builtin/text3d/CHANGELOG.md) (`text3d`)          | **1.0.0** | **1.1.0** |
| [Languages](src/plugins/builtin/i18n/CHANGELOG.md) (`i18n`)            | –         | **1.0.0** | **1.0.1** | **1.0.2** |
| [Remote API](src/plugins/builtin/remote/CHANGELOG.md) (`remote`)       | –         | –         | **1.0.0** |
| [OpenSCAD](plugins/openscad/CHANGELOG.md) (package)                    | **1.2.0** | **1.4.0** | **1.4.1** |
| [IFC](plugins/ifc/CHANGELOG.md) (package)                              | –         | –         | –         | –         | **1.0.0** |

## [Unreleased]

### Added

- **Workspaces for plugins**: a plugin can add a workspace next to the 3D model (`context.workspaces`). The top bar then shows a switch _Model | …_; the active workspace fills the window below the top bar.
- **Views rendered on demand** for plugins (`context.render`): a camera, style, hidden tags, size and an optional drawing scale give an image or vector lines with hidden lines removed – without changing the viewport.
- **Plugin data on the model** (`context.data.getModel` / `setModel`), saved in the `.shap3d.json` – next to the data on groups and components.
- **Plugin data on instances**: `context.data.get/set` also take a single instance (e.g. the properties of one game object); the data is saved and copied with the instance.
- **Data change events** for plugins (`context.events.onDataChange`): a change of plugin data is announced at the end of the undo step it was made in, still inside it – what a listener changes is undone with it.
- **Data formats** (`context.data.formats.register`, `data.read`, `data.write`): a plugin describes data under a key with a version and a check, so other plugins read and write it without that plugin running. The terrain plugin declares its height grid as `terrain.grid`.
- **Plugin bundles**: a folder whose `package.json` lists packages in `shap3d.bundle` installs them together – each stays on its own (switched off, removed, updated separately), and a newer installed version is kept.
- **Modes for plugins** (`context.modes`): next to the workspaces in the top bar, a mode keeps the 3D view but shows only its own tools in the toolbar and its own panels on the right.
- Screenshot scenes: `&command=<id>` runs commands after the scene.
- **Shader materials** for plugins (`context.materials.registerShader`): a plugin brings a surface function in GLSL with parameters; a material that uses it is drawn with it in the 3D view, with and without shadows, in scene previews and in rendered views. In the Materials panel the shaders are listed with the textures and their parameters become sliders and colour pickers, the swatches show the pattern. Without the plugin the material shows its colour again – the shader and its parameters stay in the model. Scripts: `s3d.material(name, colour, { shader, params })`.
- **Own image textures**: _Own image…_ in the texture list of the Materials panel loads a picture (PNG, JPEG, WebP, GIF, BMP) into the material. It is saved in the model (larger than 2048 px it is scaled down first) and drawn as it is, not tinted. Width and height (the height follows the picture's proportions), offset along and across the face and rotation can be set – offset and rotation work for the built-in textures too.
- **Textures in glTF/GLB exports**: own images and the built-in textures are exported with texture coordinates instead of only the colour. Shader materials are **baked** into a picture: every face gets its own patch, drawn from its real position – so the pattern runs on around corners like in the 3D view.

### Fixed

- Smeared rulers, labels and measures at the right and bottom of the 3D view when the page is zoomed out (a pixel ratio below 1): the overlay is now cleared completely before every frame.
- The tiles on the right no longer run off low screens: they scroll between the top bar and the status bar and get a little smaller on low windows.
- _Update_ in the plugin manager only shows for a plugin from a folder when the folder holds a new build (or can't be read without asking) – and it goes away after the update. The folders are checked again when the window gets the focus back, e.g. after `npm run build`.

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

[Unreleased]: https://github.com/Chris2011/shap3d.ai/compare/53dc278...HEAD
[0.9.0]: https://github.com/Chris2011/shap3d.ai/compare/53dc278...HEAD
[0.8.0]: https://github.com/Chris2011/shap3d.ai/compare/15aab26...53dc278
[0.7.0]: https://github.com/Chris2011/shap3d.ai/compare/753a191...15aab26
[0.6.0]: https://github.com/Chris2011/shap3d.ai/compare/8f34310...753a191
[0.5.0]: https://github.com/Chris2011/shap3d.ai/compare/27cb174...8f34310
[0.4.0]: https://github.com/Chris2011/shap3d.ai/compare/699e0ce...27cb174
[0.3.0]: https://github.com/Chris2011/shap3d.ai/commit/699e0ce

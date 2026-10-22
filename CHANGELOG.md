# Changelog

All notable changes to Shap3D.ai are listed here – newest first.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses [Semantic Versioning](https://semver.org/). Until 1.0 every minor version may bring larger changes.

Versions before 0.7.0 were not tagged at the time; they are reconstructed from the Git history and grouped by development phase.

The built-in plugins and the [OpenSCAD plugin package](plugins/openscad) have their own version numbers. A plugin's version only goes up when the plugin itself changes – new features (including whole new languages) raise the minor version, fixes and translations of a few new texts the patch version. The new version is given in brackets at the entry, e.g. *(AI assistant 1.2.0)*; every plugin has its own changelog with the details (linked in the table below).

| Version | Date | In one sentence |
| --- | --- | --- |
| [0.8.0](#080--2026-10-22) | 2026-10-22 | Native desktop app with Tauri – executable and installers |
| [0.7.0](#070--2026-10-22) | 2026-10-22 | Remote control: REST API, Swagger UI and MCP server, plus Docker |
| [0.6.0](#060--2026-10-20) | 2026-10-20 | Code completion and five languages |
| [0.5.0](#050--2026-10-19) | 2026-10-19 | Plugin system – terrain, imports, AI and 3D text become plugins |
| [0.4.0](#040--2026-10-18) | 2026-10-18 | Welcome tour, command palette, rulers, Tailwind and VueUse |
| [0.3.0](#030--2026-10-16) | 2026-10-16 | First version in this repository |

Plugin versions per app version (**bold** = new version, plain = unchanged, – = not there yet):

| Plugin | 0.5.0 | 0.6.0 | 0.7.0 | 0.8.0 |
| --- | --- | --- | --- | --- |
| [AI assistant](src/plugins/builtin/ai/CHANGELOG.md) (`ai`) | **1.0.0** | **1.1.0** | **1.2.0** |
| [Terrain](src/plugins/builtin/terrain/CHANGELOG.md) (`terrain`) | **1.0.0** | **1.1.0** |
| [Import formats](src/plugins/builtin/imports/CHANGELOG.md) (`imports`) | **1.0.0** | **1.1.0** |
| [3D text](src/plugins/builtin/text3d/CHANGELOG.md) (`text3d`) | **1.0.0** | **1.1.0** |
| [Languages](src/plugins/builtin/i18n/CHANGELOG.md) (`i18n`) | – | **1.0.0** | **1.0.1** |
| [Remote API](src/plugins/builtin/remote/CHANGELOG.md) (`remote`) | – | – | **1.0.0** |
| [OpenSCAD](plugins/openscad/CHANGELOG.md) (package) | **1.2.0** | **1.4.0** |

## [Unreleased]

Nothing yet.

## [0.8.0] – 2026-10-22

### Added

- **Native desktop app** with [Tauri 2](https://tauri.app): Shap3D.ai in its own window, as a stand-alone executable and with installers – MSI and NSIS setup on Windows, `.dmg` on macOS, `.deb`, `.rpm` and AppImage on Linux (`npm run desktop:dev`, `npm run desktop:build`). It uses the system's web view, so the Windows setup is only about 3 MB.
- App icons for all desktop platforms, generated from the favicon; dropping files on the window imports them as before.

### Changed

- The app version lives in one place only, `package.json` – the executable and the installers take it from there.
- The dev server keeps its port (5173) and ignores the Rust side in `src-tauri/`.

### Known limitations

- The remote API (REST, Swagger UI, MCP), the AI proxy and the Blender/SketchUp converters need the dev server and are not part of the desktop build yet. A local AI server has to allow the app's origin (`http://tauri.localhost` on Windows, `tauri://localhost` on macOS and Linux).

## [0.7.0] – 2026-10-22

### Added

- **Remote API** (built-in plugin *Remote-API*, dev server only) *(Remote API 1.0.0)* – other programs and AI agents can control the editor that is open in the browser:
  - **REST API** under `/api` for the most common actions: scene and objects, creating solids (box, cylinder, sphere, cone, pyramid, prism, tube, torus, wedge, dome), moving/rotating/scaling, materials, running `s3d` scripts, undo/redo, camera and standard views, menu commands, export (GLB, glTF, OBJ, STL, JSON) and screenshots.
  - **OpenAPI 3.1** definition at `/api/openapi.json` and **Swagger UI** at `/api/docs` to read and try every endpoint.
  - **MCP server** at `/mcp` (Streamable HTTP) with 21 tools – e.g. for Claude Code via the project's `.mcp.json` – and a stdio bridge for clients without HTTP.
  - **Remote-API panel**: connection status (which tab receives the requests, *Use this tab*), an activity log of every REST and MCP call, links to the documentation and the MCP set-up to copy.
- **Docker**: `docker compose up --build` runs the app with the remote API; a second target serves the production build with nginx.
- **Ground grid**: the axes in the grid and the labels along the axes and grid can be switched on and off (panel *Display*, menu *View*, command palette) – translated in all languages *(Languages 1.0.1)*.
- **Camera**: animated change between standard views; the camera menu marks the active view separately from the projection.
- **AI assistant** *(1.2.0)*: a window with the running model downloads, the model's thought process (folded), a warning when an answer was cut off at the token limit, a hint when a web filter (e.g. Sophos) holds back Ollama's progress, explanations of GGUF and mixture-of-experts models, and models that are no language model are marked as *not for Ollama*.

### Changed

- The README recommends `npm ci` instead of `npm install` – it installs exactly the versions in `package-lock.json`.
- Built-in plugins have their own version numbers instead of a fixed `1.0.0`, reconstructed from the history (see the table above); the MCP server reports the version of the Remote API plugin.

### Fixed

- Several layout details in the AI assistant (chat, setup wizard, model search) *(AI assistant 1.2.0)* and in the ground grid.

### Security

- The remote API only accepts requests from this computer: programs without a browser origin and pages on `localhost`; cross-site requests from other websites are refused.
- The Docker setup publishes the port on `127.0.0.1` only.

## [0.6.0] – 2026-10-20

### Added

- **Code completion** in the script editor for the `s3d` API, option names and values; plugins can add completions for their own languages and values – the 3D-text plugin completes its font names *(3D text 1.1.0)*.
- **Languages** (new built-in plugin) *(Languages 1.0.0)*: English is the default, with German, French, Spanish and Arabic (right-to-left) – a language switch in the top bar, a translation editor with search, progress and live preview, language files to import and export, and a template for new languages. Plugins bring their own texts; the AI assistant, terrain, import formats and 3D text are translated into all five languages *(AI assistant, Terrain, Import formats 1.1.0)*.
- `scripts/i18n.mjs` to check translations, find hard-coded text and write the template.
- Linting and formatting with **oxlint** and **oxfmt**.
- OpenSCAD plugin: code completion for OpenSCAD *(OpenSCAD 1.3.0)*.

### Changed

- Reactive state uses `shallowRef` where deep reactivity is not needed (faster with large models).
- OpenSCAD plugin rewritten in TypeScript, split into modules and built with Vite in library mode, with texts in five languages *(OpenSCAD 1.4.0)*.

## [0.5.0] – 2026-10-19

### Added

- **Plugin system**: plugins add commands, tools, panels, icons, script functions (`s3d.<name>()`), script languages, importers and exporters, overlays, context-menu entries and top-bar buttons; they keep settings and files in the browser and data on groups. Plugin packages are loaded from a folder and can be updated in place. Three example plugins: cursor coordinates, grid generator and parts list.
- **OpenSCAD plugin package** – runs the official OpenSCAD as WebAssembly: opens `.scad` files, adds OpenSCAD to the script editor and provides `s3d.scad()` *(OpenSCAD 1.1.0)*.
- **Open as code**: any object can be opened as code (JavaScript, JSON, OpenSCAD …) and converted between the formats *(OpenSCAD 1.2.0)*.
- **3D text** (built-in plugin) *(3D text 1.0.0)*: letters and numbers in 15 fonts or your own TTF/OTF/WOFF files, flat or upright, filled, extruded or as an outline, and `s3d.text3d()`.
- **Infinite ground grid** that gets finer while zooming in (mm · cm · m).

### Changed

- Terrain editor, import formats (FBX, Collada, KMZ, 3DS, PLY, 3MF, AMF, VRML, USD/USDZ, Blender) and the AI assistant became built-in plugins that can be switched off *(Terrain, Import formats, AI assistant 1.0.0)*.

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

- **Direct modeling** like SketchUp: lines, rectangles, circles, arcs, push/pull, move, rotate, scale, offset, follow me, groups and components, tags, guides, dimensions, section planes and solid tools.
- **Local AI copilot** with Ollama or LM Studio: code models write `s3d` scripts, mesh models (LLaMA-Mesh) return geometry; fast mode, setup wizard, Hugging Face model search and a searchable chat history.
- **Script editor** with the `s3d` API (44 commands with reference and examples), 52 ready-made materials and 12 procedural textures.
- **Terrain editor**, **polygon inspector** (exact resolution, more or fewer polygons), **dark mode** and **night scene**.
- Import of SketchUp, OBJ, STL and glTF/GLB files; export as GLB, glTF, STL, OBJ, PNG and the native `.shap3d.json`.

[Unreleased]: https://github.com/Chris2011/shap3d.ai/compare/15aab26...HEAD
[0.8.0]: https://github.com/Chris2011/shap3d.ai/compare/15aab26...HEAD
[0.7.0]: https://github.com/Chris2011/shap3d.ai/compare/753a191...15aab26
[0.6.0]: https://github.com/Chris2011/shap3d.ai/compare/8f34310...753a191
[0.5.0]: https://github.com/Chris2011/shap3d.ai/compare/27cb174...8f34310
[0.4.0]: https://github.com/Chris2011/shap3d.ai/compare/699e0ce...27cb174
[0.3.0]: https://github.com/Chris2011/shap3d.ai/commit/699e0ce

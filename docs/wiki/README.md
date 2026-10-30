# Shap3D.ai wiki

Everything about Shap3D.ai in detail – the [README](../../README.md) only has the short version.

## Using the app

- [Getting started](getting-started.md) – requirements, `npm ci` / `npm run dev`, Docker and the desktop app (Tauri)
- [Features](features.md) – highlights, direct modeling, terrain editor, polygon inspector, command palette, measuring aids, welcome tour, dark mode, keyboard shortcuts
- [Local AI copilot](ai.md) – code and mesh models, fast mode, model search, connecting Ollama, LM Studio or LiteLLM
- [Scripting](scripting.md) – the script editor, code completion, the `s3d` API and an example script
- [Importing from SketchUp, Blender, 3ds Max and others](import.md) – formats, units, the Blender reader and `.skp` files through the SketchUp SDK
- [Languages and translations](languages.md) – language switch, translation editor, right to left, and the language files for developers

## Extending and controlling the app

- [Remote control: REST API, Swagger UI and MCP](remote-api.md) – control the open editor from other programs and AI agents
- [Writing plugins](plugins.md) – plugin modules, the `context` API, texts and languages in plugins, built-in plugins, plugin packages
- [Plugin packages](plugin-packages.md) – the packages in this repository:
  - OpenSCAD – [overview](plugin-packages.md#the-openscad-plugin) · [README](../../plugins/openscad/README.md)
  - IFC – [overview](plugin-packages.md#the-ifc-plugin) · [README](../../plugins/ifc/README.md)
  - LayOut – [overview](plugin-packages.md#the-layout-plugin) · [README](../../plugins/layout/README.md)
  - Room planner – [overview](plugin-packages.md#the-room-planner-plugin) · [README](../../plugins/roomplanner/README.md)
  - Shader materials – [overview](plugin-packages.md#the-shader-materials-plugin) · [README](../../plugins/shaders/README.md)
  - Noise – [overview](plugin-packages.md#the-noise-plugin) · [README](../../plugins/noise/README.md)
  - Level editor – [overview](plugin-packages.md#the-level-editor-plugin) · [README](../../plugins/level/README.md)

## Working on the project

- [Contributing](../../CONTRIBUTING.md) – where a change belongs, code style, texts and languages, versions and changelogs, checks before a pull request
- [Development](development.md) – linting and formatting, the pre-commit hook, releases, project structure, regenerating the screenshots
- [Credits and legal notice](credits-and-legal.md)
- [CHANGELOG](../../CHANGELOG.md)

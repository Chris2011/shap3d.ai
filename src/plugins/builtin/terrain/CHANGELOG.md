# Changelog – Terrain

## [Unreleased]

### Added

- The height grid is a data format of the app (`terrain.grid`, version 1): other plugins read and write it through the plugin API, and hear when a terrain was sculpted.

## [1.1.0] – 2026-10-20 · Shap3D.ai 0.6.0

### Added

- All texts in English, German, French, Spanish and Arabic.

## [1.0.0] – 2026-10-19 · Shap3D.ai 0.5.0

### Added

- The terrain editor moved from the core into a built-in plugin: the terrain tool with its floating window, the context-menu entries _Edit terrain_ and _Terrain from face_, the command and `s3d.terrain()`.
- Terrains in a model stay intact while the plugin is off; they can be sculpted again once it is on.

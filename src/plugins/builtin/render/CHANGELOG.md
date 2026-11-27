# Changelog – Render preview

## [Unreleased]

Nothing yet.

## [1.0.0] – 2026-11-27 · Shap3D.ai 0.12.0

### Added

- **Render preview** (_View › Render preview_, also in the command palette): the current view path traced in a floating window – real light from the model's environment picture (or a sky from the style's colours) and the sun, soft shadows, reflections, the materials' colours, pictures, roughness and metalness. It gets sharper pass by pass and stops after 400 passes. _New picture_ renders the view as it is now, _Save PNG_ keeps the picture.
- Built on [three-gpu-pathtracer](https://github.com/gkjohnson/three-gpu-pathtracer) 0.0.27 (MIT), loaded only when the plugin starts. The first picture of a session waits while the renderer prepares its shader (with Direct3D under Windows up to a minute) – the window says so; after that it stays ready until the plugin stops. About 400 passes take some 20 seconds for a small model.
- All texts in English, German, French, Spanish and Arabic.

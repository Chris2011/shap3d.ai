# Changelog – Shader materials plugin

## [1.0.0] – 2026-10-27 · Shap3D.ai (unreleased)

### Added

- A plugin package of its own (`plugins/shaders`, built with `vite build`, installed via _Plugins › Load plugin folder…_), with its own lint, format, type and text checks.
- Eight surface shaders, solid in the object's own coordinates (no seams at edges): wood, marble, granite, terrazzo, rust and patina, brick wall, checker and exposed concrete – each with its parameters as sliders and colour pickers in the Materials panel.
- A panel with thirteen ready-made materials and pictures (oak, walnut, pine, Carrara marble, Nero Marquina, granite grey, terrazzo, rusty steel, copper patina, clinker, sandstone blocks, checker, exposed concrete); a click picks one for the paint bucket.
- glTF/GLB export: the app bakes the shader materials into pictures, so the patterns come along (OBJ and STL keep the colour).
- Script function `s3d.shaderMaterial(preset)`; the shaders also work with `s3d.material(…, { shader, params })`.
- Texts in English, German, French, Spanish and Arabic.

# Changelog – Noise plugin

## [1.0.0] – 2026-10-27 · Shap3D.ai (unreleased)

### Added

- A plugin package of its own (`plugins/noise`, built with `vite build`, installed via _Plugins › Load plugin folder…_), with its own lint, format, type and text checks.
- Seeded simplex noise in 2D and 3D with fBm, ridged multifractal and billow, domain warping and terraces.
- Noise terrains with a live preview: size, detail, seed, scale, height, octaves, persistence, lacunarity, valleys ↔ peaks, warp, island falloff, terraces, water and snow; five presets (hills, mountains, island, canyon, dunes). They keep their settings (select one to change it in place) and their height grid in the built-in terrain plugin's format, so the Terrain tool sculpts them further.
- Scattering conifers, broadleaf trees, bushes, rocks or the model's own components on a terrain by a noise mask – spacing, density, clumping, slope and height limits, random size and turn.
- Scattering along selected edges (a path – beside it on alternating sides and facing along it, e.g. an avenue) and on selected faces (optionally standing along the face normal), besides terrains.
- Stones from cellular (Voronoi) noise: flagstones, cobbles, slabs and dry walls as real stones with joints, chamfered tops, varied heights and shades and optional mortar – on selected faces (floors and walls) or an area; presets and a tab of their own.
- Deforming groups: refined without cracks, twisted, tapered and bent along their height and roughened by 3D noise (moved along the normals); terrains get the noise on their height grid.
- Two material shaders: _Noise_ (two colours mixed by fractal noise) and _Cells_ (a Voronoi pattern with joints and a shade per cell).
- Script functions `s3d.noise`, `s3d.fbm`, `s3d.cellNoise`, `s3d.noiseTerrain`, `s3d.scatter`, `s3d.paving` and `s3d.noiseDeform`, an example for the script editor, commands per tab and context menu entries.
- Four screenshots with their demo scripts (`npm run screenshots`).
- Texts in English, German, French, Spanish and Arabic.

# Shader materials for Shap3D.ai

Materials drawn by shaders instead of pictures: wood, marble, granite, terrazzo, rust and patina, brick walls, checker and exposed concrete. The patterns are **solid** – computed from the point in the object's own coordinates – so they run round every edge without seams, never repeat visibly and move with the object.

![Shader materials: a table in oak, a marble block, terrazzo floor, a clinker wall, rusty steel and exposed concrete; the panel with the ready-made materials](docs/shaders.png)

The plugin is a package of its own with its own `package.json` and is **not** part of the app. It only uses the plugin API (`context.materials.registerShader`, a panel, a command and a script function).

## Features

- **Eight shaders**, each with its own parameters:
  - _Wood_ – ring colour, rings, distortion, grain, grain direction (X, Y or Z of the object)
  - _Marble_ – vein colour, veins, sharpness, turbulence
  - _Granite_ – dark and light grains, grain size, amount
  - _Terrazzo_ – three chip colours, density, chips per tile
  - _Rust & patina_ – rust colour, amount, scale (green rust colour = copper patina)
  - _Brick wall_ – mortar colour, brick length and height, joint, variation; the bricks lie on the plane each face is closest to, so walls get courses and floors get paving
  - _Checker_ – second colour, squares per tile
  - _Exposed concrete_ – stains, pores, formwork joints with tie holes (panels 2.5 × 1.25 m)
- In the **Materials panel** the shaders are listed with the textures (_Texture › Shaders (plugins)_). Choosing one shows its parameters as sliders and colour pickers; _Size_ is the tile size in metres, the material colour is the base colour.
- A panel **Shader materials** with ready-made materials and pictures: oak, walnut, pine, Carrara marble, Nero Marquina, granite grey, terrazzo, rusty steel, copper patina, clinker, sandstone blocks, checker, exposed concrete. A click adds the material to the model and picks it for the paint bucket.
- **Scripts**: `s3d.shaderMaterial('oak')` adds a ready-made material and returns its name; every shader also works with the app's own `s3d.material(name, colour, { shader: 'shaders.wood', params: { rings: 20 }, size: 0.5 })`.
- Texts in English, German, French, Spanish and Arabic.

## Good to know

- The shaders are drawn in the 3D view, in scene previews and in views for LayOut.
- **Export**: glTF and GLB know no shaders, so the app bakes each shader material into a picture (up to 2048 px, every face with its own patch, the pattern exactly as in the 3D view). OBJ and STL carry no pictures – there the material keeps its colour.
- **Without the plugin** a material with a shader shows its colour. The shader and its parameters stay in the model and come back when the plugin is on again.
- The pattern belongs to the object (its group or component), not to the world: copies of a component look the same, moving or rotating an object takes the pattern along.

## Writing your own shader

A plugin registers a shader with `context.materials.registerShader({ id, label, glsl, params, size })`. `glsl` defines

```glsl
vec3 s3dSurface(vec3 p, vec3 n, vec3 base)
```

- `p` – the point in the object's own coordinates, divided by the material's size (1 = one tile),
- `n` – the face normal in the same coordinates,
- `base` – the material colour; it returns the colour of the point. Colours are linear.

Every parameter `{ name, label, type: 'number' | 'color', default, min, max, step }` is a uniform `u_<name>` (`float`, or `vec3` for colours). Light, shadows, clipping and the colour space stay with the app. The shaders of this package are in [`src/library.ts`](src/library.ts) – value noise, fractal noise and a cell pattern to start from.

## Building and installing

```bash
cd plugins/shaders
npm run build
```

Then in Shap3D.ai _Plugins › Load plugin folder…_ and pick `plugins/shaders/dist`.

Checks: `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run i18n`. Screenshot: `npm run screenshots` (Windows) or `npm run screenshots:sh` (Linux/macOS), with the app's dev server running.

# Procgen – procedural generation for Shap3D.ai plugins

The generators behind the [noise plugin](../../plugins/noise/README.md), as a library that plugins bundle at build time: seeded noise, noise terrains and erosion, rivers and roads, cities (also on a terrain), villages, trees, stones and facades.

It is **not a plugin** and nothing loads it at runtime. A plugin imports it and Vite bundles it into the plugin's `plugin.js` – so plugins share the code without depending on each other. Why it is cut this way: [the level editor's architecture](../../docs/level-editor-architektur.md).

## Rules

- **Pure functions.** Options, a seed and data (a height grid, an outline) go in; data or meshes (`PluginMesh`, `TriangleMesh`) come out. No editor, no plugin context, no Vue – only types from the app's `src/plugins/types.ts`.
- **Deterministic.** The same seed and options give the same result, bit for bit. Saved recipes rely on it.
- **No texts.** Errors on purpose are a `ProcgenError` with a `code` and `params`; the plugin turns them into a message in the user's language (the noise plugin uses `noise.<code>`). Material names come in as parameters, except the terrain plugin's and the trees' own material names, which are model content.
- **Inputs stay as they are.** A function never changes the grid or options it gets – it returns new ones (a grid may be a terrain's stored data).

## Modules

| Module                  | What it does                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `noise.ts`              | Seeded random numbers, simplex noise 2D/3D, fBm, ridged, billow, domain warp, terraces, height fields, cellular (Voronoi) noise                     |
| `terrain.ts`            | Height grids in the format of the built-in terrain plugin (`pluginData.terrain`): sampling, surfaces, the mesh with walls and water                 |
| `erosion.ts`            | Hydraulic (raindrops) and thermal erosion on a height grid                                                                                          |
| `routes.ts`             | Route search over a grid, rivers (a bed that only falls, a water ribbon) and roads (cut and fill, bridges, markings), courses that others keep free |
| `junctions.ts`          | Where a new road meets the roads built before: ends cut along their edges, crossings split, going on from a road's end, rounded corners             |
| `city.ts`               | A city plan: streets, blocks, plots, buildings from a density map, pitched roofs, perimeter blocks, parks, trees, markings                          |
| `cityground.ts`         | A city on a terrain: eased slopes, block terraces, retaining walls, the street surface                                                              |
| `village.ts`            | Village sites, streets along the contour, houses beside them, the network of roads between them                                                     |
| `facade.ts`             | Windows, balconies, shutters and shops on a wall                                                                                                    |
| `tree.ts`               | Grown trees: oak, birch, pine, palm                                                                                                                 |
| `paving.ts`             | Stones from Voronoi cells, cut to an outline                                                                                                        |
| `mesh.ts`, `builder.ts` | Triangle meshes (refine, displace, bend, icospheres, cones); boxes, prisms, pitched roofs and faces in a plane                                      |
| `errors.ts`             | `ProcgenError`                                                                                                                                      |

Everything is exported from `src/index.ts`.

## Using it in a plugin

The plugin points the name `@shap3d/procgen` at `src/index.ts` – in its `vite.config.ts` (for the build) and its `tsconfig.json` (for the types):

```ts
// vite.config.ts
resolve: { alias: { '@shap3d/procgen': fileURLToPath(new URL('../../packages/procgen/src/index.ts', import.meta.url)) } },
```

```json
// tsconfig.json – compilerOptions
"paths": { "@shap3d/procgen": ["../../packages/procgen/src/index.ts"] }
```

```ts
import { makeGrid, normaliseSettings, riverOn } from '@shap3d/procgen';
```

## Tests and checks

```bash
cd packages/procgen
npm install
npm test
```

`npm install` brings [Vitest](https://vitest.dev/) – the only dependency, for the tests; TypeScript, oxlint and oxfmt come from the repository root (`npm ci` there first). `npm test` runs the tests in `test/` (determinism, a river bed only falls, routes reach their goal, roads end at the edge of the road they run into, buildings and houses keep apart, the terrain under a city lies below its surfaces …), `npm run typecheck`, `npm run lint` and `npm run format` check `src/` and `test/`.

## License

Apache-2.0, like the app.

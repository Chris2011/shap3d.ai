// Demo for the noise screenshot (npm run screenshots): an island from fractal noise with water and snow, woods and
// rocks scattered by a noise mask, a box roughened into a boulder – built with the plugin's script functions.
s3d.clear();
s3d.editor.model.name = 'Noise';
const island = s3d.noiseTerrain({
  width: 80,
  depth: 64,
  detail: 96,
  height: 10,
  scale: 28,
  octaves: 6,
  mode: 'fbm',
  exponent: 1.5,
  warp: 0.35,
  falloff: 0.9,
  water: 1.3,
  snow: 7.8,
  seed: 12,
});
s3d.scatter({ on: island, objects: ['conifer', 'tree'], spacing: 2.6, density: 0.8, clumping: 0.8, maxSlope: 30, maxHeight: 8, seed: 3 });
s3d.scatter({ on: island, objects: ['rock', 'bush'], spacing: 4, density: 0.35, clumping: 0.3, maxSlope: 45, seed: 8 });

// a box roughened into a boulder on the beach
const boulder = s3d.box([10, 4, 1], 3, 2.2, 1.8);
s3d.noiseDeform({ target: boulder, amount: 0.35, scale: 1.2, detail: 0.25, seed: 4 });

// the panel shows the island's settings (selected) instead of a preview of a new terrain
s3d.editor.select([{ kind: 'instance', id: island.inst.id }]);

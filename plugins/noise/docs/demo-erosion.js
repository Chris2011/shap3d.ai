// Demo for the erosion screenshot (npm run screenshots): the same mountains twice – on the left as the noise made
// them, on the right eroded by raindrops (gullies on the slopes, sediment in the valleys), with pines on it.
s3d.clear();
s3d.editor.model.name = 'Erosion';
const settings = { width: 70, depth: 70, detail: 110, height: 16, scale: 38, octaves: 6, mode: 'fbm', exponent: 1.4, snow: 12.5, seed: 21 };
s3d.noiseTerrain({ ...settings, at: [0, 0, 0], name: 'Without erosion' });
const eroded = s3d.noiseTerrain({ ...settings, at: [76, 0, 0], erosion: 3, erosionStrength: 0.9, name: 'Eroded' });
s3d.scatter({ on: eroded, objects: ['pine'], spacing: 4.5, density: 0.35, clumping: 0.6, maxSlope: 30, maxHeight: 11, sizeMin: 0.5, sizeMax: 0.9, seed: 5 });
s3d.editor.select([{ kind: 'instance', id: eroded.inst.id }]);

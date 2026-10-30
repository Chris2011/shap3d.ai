// Demo for the villages screenshot (npm run screenshots): a valley with a river, villages on its gentle slopes
// (s3d.villages) connected by gravel roads that find the gentlest way, woods on the rest.
s3d.clear();
s3d.editor.model.name = 'Villages';
const land = s3d.noiseTerrain({ width: 300, depth: 220, detail: 120, height: 16, scale: 130, octaves: 4, persistence: 0.4, seed: 31, name: 'Valley' });
s3d.river({ target: land, width: 8, depth: 1.8, wiggle: 0.5, seed: 2 });
s3d.villages({ target: land, count: 5, houses: 16, roadWidth: 3.5, roads: 'gravel', seed: 4 });
s3d.scatter({ on: land, objects: ['conifer', 'tree'], spacing: 6, density: 0.5, clumping: 0.85, maxSlope: 30, seed: 3 });
s3d.editor.select([]);

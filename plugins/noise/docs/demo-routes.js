// Demo for the rivers and roads screenshot (npm run screenshots): a river dug through the valleys of a hilly
// terrain (s3d.river), a road that finds the gentlest way over the hills (s3d.road) and a gravel path, with woods.
s3d.clear();
s3d.editor.model.name = 'Rivers and roads';
const land = s3d.noiseTerrain({ width: 120, depth: 90, detail: 120, height: 10, scale: 70, octaves: 4, persistence: 0.45, seed: 12, name: 'Valley' });
s3d.river({ target: land, from: [0, 62, 0], to: [120, 28, 0], width: 7, depth: 1.8, wiggle: 0.6, seed: 3 });
s3d.road({ target: land, from: [8, 10, 0], to: [112, 82, 0], width: 6, maxGrade: 8 });
s3d.road({ target: land, from: [30, 84, 0], to: [75, 6, 0], surface: 'gravel', width: 2.2, maxGrade: 14 });
s3d.scatter({ on: land, objects: ['conifer', 'tree'], spacing: 4, density: 0.45, clumping: 0.8, maxSlope: 26, minHeight: 3, seed: 4 });
s3d.editor.select([]);

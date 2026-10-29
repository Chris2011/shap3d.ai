// Demo for the city on a terrain screenshot (npm run screenshots): a hilly noise terrain with a city built on it
// (s3d.city with `on`) – blocks become level terraces with retaining walls, the streets follow the ground.
s3d.clear();
s3d.editor.model.name = 'Hill town';
const land = s3d.noiseTerrain({ width: 220, depth: 170, detail: 120, height: 24, scale: 110, octaves: 4, persistence: 0.4, seed: 7, name: 'Hills' });
s3d.city({ on: land, width: 140, depth: 105, block: 34, street: 10, plot: 14, minFloors: 2, maxFloors: 9, centre: 0.6, courts: 0.4, parks: 0.1, flatten: 0.5, seed: 5 });
s3d.scatter({ on: land, objects: ['conifer', 'tree'], spacing: 5, density: 0.5, clumping: 0.7, maxSlope: 28, seed: 2 });
s3d.editor.select([]);

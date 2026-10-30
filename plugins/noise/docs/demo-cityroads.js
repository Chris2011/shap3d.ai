// Demo for roads meeting a city (npm run screenshots): a city on a gentle terrain, a road that goes on from the end of
// its street at the front edge, a road along the back and a short one linking the street's back end to it.
s3d.clear();
s3d.editor.model.name = 'Roads into town';
const land = s3d.noiseTerrain({ width: 160, depth: 120, detail: 100, height: 8, scale: 90, octaves: 3, seed: 4, name: 'Plain' });
s3d.city({ on: land, width: 70, depth: 50, block: 22, street: 8, minFloors: 2, maxFloors: 6, seed: 2 });
s3d.road({ target: land, from: [60, 4, 0], to: [80, 35, 0], width: 7 });
s3d.road({ target: land, from: [5, 95, 0], to: [155, 95, 0], width: 6 });
s3d.road({ target: land, from: [80, 85, 0], to: [80, 95, 0], width: 7 });
s3d.editor.select([]);

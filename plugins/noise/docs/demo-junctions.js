// Demo for the junctions screenshot (npm run screenshots): roads built one after the other meet the roads built
// before – a T-junction, a gravel path crossing the main road and a road going on from the main road's end.
s3d.clear();
s3d.editor.model.name = 'Junctions';
const land = s3d.noiseTerrain({ width: 100, depth: 80, detail: 100, height: 6, scale: 80, octaves: 3, seed: 5, name: 'Hills' });
s3d.road({
  target: land,
  along: [
    [5, 40, 0],
    [50, 44, 0],
    [82, 36, 0],
  ],
  width: 6,
});
s3d.road({
  target: land,
  along: [
    [30, 5, 0],
    [36, 20, 0],
    [40, 43, 0],
  ],
  width: 5,
});
s3d.road({
  target: land,
  along: [
    [70, 5, 0],
    [68, 40, 0],
    [72, 75, 0],
  ],
  width: 2.5,
  surface: 'gravel',
});
s3d.road({
  target: land,
  along: [
    [82.5, 36.5, 0],
    [92, 52, 0],
    [86, 75, 0],
  ],
  width: 6,
});
s3d.scatter({ on: land, objects: ['tree', 'bush'], spacing: 5, density: 0.35, clumping: 0.8, seed: 2 });
s3d.editor.select([]);

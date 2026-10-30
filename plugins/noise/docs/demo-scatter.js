// Demo for the scatter screenshot (npm run screenshots): an avenue of trees along a winding path (selected edges)
// and a meadow with bushes, trees and rocks gathered by the noise mask (a selected face).
s3d.clear();
s3d.editor.model.name = 'Scatter';
const select = (refs) => s3d.editor.select(refs);
const entities = () => s3d.editor.entities;

// the ground
s3d.material('Wiese', '#7fa65a');
s3d.rect([-4, -4, 0], 48, 32).reverse().material('Wiese');

// a meadow patch – scattered on as a face
const meadow = s3d.rect([24, 8, 0.01], 16, 16).material('Wiese').backMaterial('Wiese');
select([{ kind: 'face', id: meadow.id }]);
s3d.scatter({ objects: ['bush', 'tree', 'rock'], spacing: 1.6, density: 0.9, clumping: 0.85, clumpSize: 6, seed: 4 });

// a winding path – the avenue follows its edges, trees on both sides, facing along the way
const path = [];
for (let step = 0; step <= 12; step++) {
  const x = step * 3.2;
  path.push([x, 6 + Math.sin(step * 0.55) * 5, 0.02]);
}
const before = new Set(entities().edges.keys());
s3d.polyline(path);
const pathEdges = [...entities().edges.keys()].filter((id) => !before.has(id)).map((id) => ({ kind: 'edge', id }));
select(pathEdges);
s3d.scatter({ objects: ['conifer'], spacing: 2.4, density: 1, clumping: 0, offset: 2.2, alongPath: true, sizeMin: 0.9, sizeMax: 1.1, seed: 2 });

// the panel shows what Scatter works on: the path
select(pathEdges);

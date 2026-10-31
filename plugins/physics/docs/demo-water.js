// Demo for the water screenshot (npm run screenshots): a pool whose water carries bodies by their density – foam
// floats high, wood half under, a boat (one convex hull, so its inside counts) rides on it, steel sinks – and a
// current that drifts what floats.
s3d.clear();
s3d.editor.model.name = 'Water';
s3d.material('Water', '#4dabf7', 0.45);
s3d.material('Tiles', '#e9ecef');
s3d.material('Wood', '#c08a4a');
s3d.material('Foam', '#ffe066');
s3d.material('Steel', '#495057');
s3d.material('Boat', '#e03131');

// the pool: walls around a floor, static
const walls = [
  [-0.3, -0.3, 8.6, 0.3],
  [-0.3, 5, 8.6, 0.3],
  [-0.3, 0, 0.3, 5],
  [8, 0, 0.3, 5],
];
walls.forEach(([x, y, width, depth], index) => {
  const wall = s3d.box([x, y, 0], width, depth, 1.8, { name: `Pool wall ${index + 1}`, material: 'Tiles' });
  s3d.physicsBody(wall, { type: 'static' });
});
// the water: a region – its box is the water, its top the surface; a slow current along x
const water = s3d.box([0, 0, 0], 8, 5, 1.4, { name: 'Water', material: 'Water' });
s3d.physicsBody(water, { type: 'water', density: 1000, velocity: [0.3, 0, 0] });

// what is dropped in
const drop = (name, at, size, material, props) => {
  const body = s3d.box(at, size[0], size[1], size[2], { name, material });
  s3d.physicsBody(body, props);
  return body;
};
drop('Foam block', [1, 1, 2.2], [0.6, 0.6, 0.4], 'Foam', { material: 'foam' });
drop('Wooden crate', [2.4, 2.8, 2.6], [0.6, 0.6, 0.6], 'Wood', { material: 'wood', spin: [40, 0, 20] });
drop('Plank', [4, 0.8, 2.4], [1.6, 0.3, 0.12], 'Wood', { material: 'wood' });
drop('Steel cube', [6, 3.4, 2.4], [0.4, 0.4, 0.4], 'Steel', { material: 'steel' });

// the boat: a floor and four sides – shape 'hull' makes it one convex body, so the water it pushes away is its
// whole inside and it floats high
const boat = s3d.group('Boat', () => {
  s3d.box([0, 0, 0], 1.6, 0.8, 0.06, { group: false, material: 'Boat' });
  s3d.box([0, 0, 0], 1.6, 0.06, 0.4, { group: false, material: 'Boat' });
  s3d.box([0, 0.74, 0], 1.6, 0.06, 0.4, { group: false, material: 'Boat' });
  s3d.box([0, 0, 0], 0.06, 0.8, 0.4, { group: false, material: 'Boat' });
  s3d.box([1.54, 0, 0], 0.06, 0.8, 0.4, { group: false, material: 'Boat' });
});
boat.move([4.6, 2.6, 1.6]);
s3d.physicsBody(boat, { material: 'wood', shape: 'hull', mass: 60 });

s3d.camera([4, -8, 8], [4, 2.5, 0.5]);
s3d.physicsStart({ at: 3 });

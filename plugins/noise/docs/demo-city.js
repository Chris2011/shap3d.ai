// Demo for the city screenshot (npm run screenshots): streets, blocks and buildings whose heights follow a noise
// density map – towers in the centre, perimeter blocks round courtyards and houses with pitched roofs at the edges,
// parks, street trees and road markings – with the facade shader on every building (s3d.city).
s3d.clear();
s3d.editor.model.name = 'City';
s3d.city({
  width: 260,
  depth: 200,
  block: 42,
  street: 12,
  plot: 16,
  maxFloors: 22,
  minFloors: 2,
  centre: 0.75,
  courts: 0.6,
  parks: 0.12,
  seed: 9,
});
s3d.editor.select([]);

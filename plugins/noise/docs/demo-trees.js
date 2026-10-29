// Demo for the trees screenshot (npm run screenshots): oaks, birches, pines and palms grown from seeds (s3d.tree),
// two of each with other seeds and settings, on a meadow.
s3d.clear();
s3d.editor.model.name = 'Trees';
s3d.material('Wiese', '#7fa65a');
s3d.rect([-8, -10, 0], 84, 22).reverse().material('Wiese').backMaterial('Wiese');

const rows = [
  { species: 'oak', height: 10, gnarl: 0.6 },
  { species: 'birch', height: 12, gnarl: 0.4 },
  { species: 'pine', height: 14, gnarl: 0.3 },
  { species: 'palm', height: 9, gnarl: 0.6 },
];
let x = 0;
for (const settings of rows) {
  for (const seed of [3, 8]) {
    s3d.tree({ ...settings, at: [x, seed === 3 ? 0 : 3, 0], density: seed === 3 ? 0.5 : 0.8, seed, rotation: seed * 40 });
    x += 9;
  }
}
s3d.editor.select([]);

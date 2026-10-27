// Demo for the shader materials screenshot (npm run screenshots): a few blocks, walls and a table, each in a
// ready-made shader material – built with the plugin's script function s3d.shaderMaterial.
s3d.editor.model.name = 'Shader';
const material = (preset) => s3d.shaderMaterial(preset);

// floor and two walls
s3d.box([-1, -1, -0.1], 5, 4, 0.1, { material: material('terrazzo') });
s3d.box([-1, 3, 0], 5, 0.24, 2.4, { material: material('clinker') });
s3d.box([-1.24, -1, 0], 0.24, 4.24, 2.4, { material: material('exposedConcrete') });

// a table in oak with walnut legs
s3d.box([0.2, 0.6, 0.72], 1.8, 0.9, 0.04, { material: material('oak') });
for (const [x, y] of [
  [0.25, 0.65],
  [1.9, 0.65],
  [0.25, 1.4],
  [1.9, 1.4],
]) {
  s3d.box([x, y, 0], 0.05, 0.05, 0.72, { material: material('walnut') });
}

// blocks in stone and metal
s3d.box([2.6, 1.8, 0], 0.8, 0.8, 0.8, { material: material('carrara') });
s3d.box([2.6, 0.6, 0], 0.6, 0.6, 1.1, { material: material('nero') });
s3d.box([2.7, -0.6, 0], 0.7, 0.7, 0.5, { material: material('rustySteel') });
s3d.cylinder([1.2, -0.4, 0], 0.3, 0.9, { material: material('copperPatina') });
s3d.box([-0.6, -0.7, 0], 0.6, 0.6, 0.45, { material: material('granite') });

// Demo for the liquid screenshot (npm run screenshots): a dam break – a block of liquid at the end of a channel
// collapses, flows around a pillar and pushes light foam boxes along.
s3d.clear();
s3d.editor.model.name = 'Dam break';
s3d.material('Glass', '#dee2e6', 0.35);
s3d.material('Liquid', '#4dabf7', 0.5);
s3d.material('Pillar', '#868e96');
s3d.material('Foam', '#ffe066');

// the channel: two side walls and an end wall, see-through; the ground is its floor
const sides = [
  [-0.1, -0.1, 5.2, 0.1],
  [-0.1, 1.2, 5.2, 0.1],
  [-0.1, 0, 0.1, 1.2],
  [5, 0, 0.1, 1.2],
];
sides.forEach(([x, y, width, depth], index) => {
  const wall = s3d.box([x, y, 0], width, depth, 1.2, { name: `Channel wall ${index + 1}`, material: 'Glass' });
  s3d.physicsBody(wall, { type: 'static' });
});

// the liquid: a region filled with drops at the start
const liquid = s3d.box([0, 0, 0], 1.2, 1.2, 1, { name: 'Liquid', material: 'Liquid' });
s3d.physicsBody(liquid, { type: 'liquid', density: 1000, viscosity: 0.15 });

const pillar = s3d.cylinder([2.6, 0.6, 0], 0.18, 0.8, { name: 'Pillar', material: 'Pillar', segments: 20 });
s3d.physicsBody(pillar, { type: 'static' });
for (let index = 0; index < 3; index++) {
  const box = s3d.box([3.4 + index * 0.4, 0.2 + index * 0.3, 0], 0.25, 0.25, 0.25, { name: `Foam box ${index + 1}`, material: 'Foam' });
  s3d.physicsBody(box, { material: 'foam' });
}

s3d.camera([4.5, -4.2, 4.2], [2.4, 0.6, 0.2]);
s3d.physicsStart({ at: 1.2 });

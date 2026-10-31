// Demo for the playground screenshot (npm run screenshots): a ramp, a pyramid of wooden crates, rubber and steel
// balls dropping onto it, an ice block sliding down the ramp past a wooden one that sticks, a row of dominoes and a
// ball rolling into them, and a pendulum on a rope.
s3d.clear();
s3d.editor.model.name = 'Playground';
s3d.material('Wood', '#c08a4a');
s3d.material('Rubber', '#d6336c');
s3d.material('Steel', '#8d99a6');
s3d.material('Ice', '#99e9f2');
s3d.material('Concrete', '#ced4da');
s3d.material('Domino', '#343a40');

// the ramp: a slab tilted by 25° – static, it does not move
const ramp = s3d.box([-6, -1, 0], 5, 2, 0.2, { name: 'Ramp', material: 'Concrete' });
ramp.rotate(25, 'y', [-1, 0, 0]);
s3d.physicsBody(ramp, { type: 'static', material: 'wood' });
// on the ramp: ice slides, wood stays (the friction of two surfaces is their mean: wood on wood 0.5 > tan 25°)
const ice = s3d.box([-5.2, -0.8, 0.2], 0.5, 0.5, 0.35, { name: 'Ice block', material: 'Ice' });
ice.rotate(25, 'y', [-1, 0, 0]);
s3d.physicsBody(ice, { material: 'ice' });
const block = s3d.box([-5.2, 0.25, 0.2], 0.5, 0.5, 0.35, { name: 'Wooden block', material: 'Wood' });
block.rotate(25, 'y', [-1, 0, 0]);
s3d.physicsBody(block, { material: 'wood' });

// a pyramid of crates
for (let row = 0; row < 4; row++) {
  for (let index = 0; index < 4 - row; index++) {
    const crate = s3d.box([2 + index * 0.52 + row * 0.26, -0.25, row * 0.5], 0.5, 0.5, 0.5, {
      name: `Crate ${row + 1}-${index + 1}`,
      material: 'Wood',
    });
    s3d.physicsBody(crate, { material: 'wood' });
  }
}
// balls falling onto it: rubber bounces, steel does not
const rubber = s3d.sphere([2.9, 0, 5], 0.3, { name: 'Rubber ball', material: 'Rubber', segments: 16 });
s3d.physicsBody(rubber, { material: 'rubber', shape: 'sphere' });
const steel = s3d.sphere([3.6, 0.1, 6], 0.25, { name: 'Steel ball', material: 'Steel', segments: 16 });
s3d.physicsBody(steel, { material: 'steel', shape: 'sphere', velocity: [-0.5, 0, 0] });

// dominoes and a ball rolling into them
for (let index = 0; index < 10; index++) {
  const domino = s3d.box([index * 0.45, 2.8, 0], 0.08, 0.4, 0.8, { name: `Domino ${index + 1}`, material: 'Domino' });
  s3d.physicsBody(domino, { material: 'wood' });
}
const roller = s3d.sphere([-1.2, 3, 0.2], 0.2, { name: 'Roller', material: 'Steel', segments: 16 });
s3d.physicsBody(roller, { material: 'steel', shape: 'sphere', velocity: [3, 0, 0] });

// a pendulum: a ball on a rope from the top of a post, let go to the side
const post = s3d.box([5.4, -3.1, 0], 0.2, 0.2, 3.2, { name: 'Post', material: 'Concrete' });
s3d.physicsBody(post, { type: 'static' });
const bob = s3d.sphere([7.1, -3, 2.2], 0.25, { name: 'Pendulum', material: 'Steel', segments: 16 });
s3d.physicsBody(bob, { material: 'steel', shape: 'sphere' });
s3d.physicsJoint(bob, { kind: 'rope', to: 'world', at: [7.1, -3, 2.2], toAt: [5.5, -3, 3.1], length: 1.85 });

s3d.camera([2.5, -15, 8], [3.5, 0, 1]);
s3d.physicsStart({ at: 1.2 });

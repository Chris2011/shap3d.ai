// Demo for the ropes screenshot (npm run screenshots): a crane swinging a wrecking ball on a rope into a wall of
// bricks, a heavy box bouncing on a spring, a door swinging on a hinge and a cradle of five balls on ropes.
s3d.clear();
s3d.editor.model.name = 'Ropes and springs';
s3d.material('Crane yellow', '#fab005');
s3d.material('Brick', '#c0563b');
s3d.material('Steel', '#495057');
s3d.material('Door', '#8d6e63');

// the crane: a mast and a jib, static; the ball hangs from the tip of the jib and starts pulled back
const mast = s3d.box([-0.2, -0.2, 0], 0.4, 0.4, 7, { name: 'Mast', material: 'Crane yellow' });
s3d.physicsBody(mast, { type: 'static' });
const jib = s3d.box([-0.2, -0.15, 6.7], 4.6, 0.3, 0.3, { name: 'Jib', material: 'Crane yellow' });
s3d.physicsBody(jib, { type: 'static' });
const ball = s3d.sphere([0.9, 0, 2.43], 0.5, { name: 'Wrecking ball', material: 'Steel', segments: 20 });
s3d.physicsBody(ball, { material: 'steel', shape: 'sphere', mass: 2000 });
s3d.physicsJoint(ball, { kind: 'rope', to: 'world', at: [0.9, 0, 2.43], toAt: [4.2, 0, 6.7], length: 5.4 });

// the wall: bricks in a bond
for (let row = 0; row < 8; row++) {
  for (let index = 0; index < 6; index++) {
    const offset = row % 2 ? 0.25 : 0;
    const brick = s3d.box([6.4, -1.5 + index * 0.5 + offset, row * 0.25], 0.25, 0.48, 0.24, {
      name: `Brick ${row + 1}-${index + 1}`,
      material: 'Brick',
    });
    s3d.physicsBody(brick, { material: 'stone' });
  }
}

// a weight on a spring from the jib – it bounces up and down
const weight = s3d.box([1.3, -0.25, 3.6], 0.5, 0.5, 0.5, { name: 'Spring weight', material: 'Steel' });
s3d.physicsBody(weight, { material: 'steel', mass: 200 });
s3d.physicsJoint(weight, {
  kind: 'spring',
  to: 'world',
  at: [1.55, 0, 4.1],
  toAt: [1.55, 0, 6.7],
  length: 1.4,
  stiffness: 6000,
  damping: 40,
});

// a door on a hinge, pushed open
const door = s3d.box([-3, -3, 0.02], 1, 0.06, 2.1, { name: 'Door', material: 'Door' });
s3d.physicsBody(door, { material: 'wood', spin: [0, 0, 80] });
s3d.physicsJoint(door, { kind: 'hinge', to: 'world', at: [-3, -2.97, 1], axis: [0, 0, 1], min: -100, max: 100 });

// a cradle: five steel balls in a row on ropes, the first pulled out
const bar = s3d.box([-3.3, 2.95, 2.6], 1.8, 0.1, 0.1, { name: 'Cradle bar', material: 'Steel' });
s3d.physicsBody(bar, { type: 'off' });
for (let index = 0; index < 5; index++) {
  const x = -3 + index * 0.3;
  const at = index === 0 ? [x - 0.9, 3, 2.05] : [x, 3, 1.4];
  const cradle = s3d.sphere(at, 0.15, { name: `Cradle ${index + 1}`, material: 'Steel', segments: 16 });
  s3d.physicsBody(cradle, { material: 'custom', density: 7850, friction: 0, bounce: 0.95, shape: 'sphere' });
  s3d.physicsJoint(cradle, { kind: 'rope', to: 'world', at, toAt: [x, 3, 2.6], length: 1.2 });
}

s3d.camera([1, -18, 8], [2.5, 0, 2.5]);
s3d.physicsStart({ at: 2 });

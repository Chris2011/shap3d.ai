// Demo for the robot arm screenshot (npm run screenshots): an arm on a base – turntable, shoulder, elbow and wrist on
// hinges whose motors follow a program (seconds → degrees, repeated) – sweeping crates off a table.
s3d.clear();
s3d.editor.model.name = 'Robot arm';
s3d.material('Robot orange', '#f08c00');
s3d.material('Robot grey', '#495057');
s3d.material('Crate', '#c08a4a');
s3d.material('Table', '#adb5bd');

const base = s3d.cylinder([0, 0, 0], 0.4, 0.3, { name: 'Base', material: 'Robot grey', segments: 32 });
s3d.physicsBody(base, { type: 'static' });

const turntable = s3d.cylinder([0, 0, 0.3], 0.3, 0.2, { name: 'Turntable', material: 'Robot orange', segments: 32 });
s3d.physicsBody(turntable, { material: 'steel' });
s3d.physicsJoint(turntable, {
  kind: 'hinge',
  to: base,
  at: [0, 0, 0.3],
  axis: [0, 0, 1],
  program: [
    [0, 0],
    [2, 0],
    [4, -70],
    [6, -70],
    [8, 50],
    [10, 50],
    [12, 0],
  ],
});

const upper = s3d.box([-0.09, -0.09, 0.45], 0.18, 0.18, 1, { name: 'Upper arm', material: 'Robot orange' });
s3d.physicsBody(upper, { material: 'steel' });
s3d.physicsJoint(upper, {
  kind: 'hinge',
  to: turntable,
  at: [0, 0, 0.5],
  axis: [0, 1, 0],
  min: -100,
  max: 100,
  program: [
    [0, 0],
    [2, 35],
    [4, 35],
    [6, 55],
    [8, 55],
    [10, 20],
    [12, 0],
  ],
});

const fore = s3d.box([-0.07, -0.07, 1.4], 0.14, 0.14, 0.85, { name: 'Forearm', material: 'Robot grey' });
s3d.physicsBody(fore, { material: 'steel' });
s3d.physicsJoint(fore, {
  kind: 'hinge',
  to: upper,
  at: [0, 0, 1.45],
  axis: [0, 1, 0],
  min: -150,
  max: 150,
  program: [
    [0, 0],
    [2, 70],
    [4, 70],
    [6, 60],
    [8, 60],
    [10, 90],
    [12, 0],
  ],
});

const hand = s3d.box([-0.12, -0.12, 2.25], 0.24, 0.24, 0.12, { name: 'Hand', material: 'Robot orange' });
s3d.physicsBody(hand, { material: 'steel' });
s3d.physicsJoint(hand, {
  kind: 'hinge',
  to: fore,
  at: [0, 0, 2.25],
  axis: [0, 1, 0],
  program: [
    [0, 0],
    [2, 20],
    [6, -20],
    [10, 30],
    [12, 0],
  ],
});

// a table in front of the arm with crates on it
const table = s3d.box([1, -0.8, 0], 0.9, 1.6, 0.6, { name: 'Table', material: 'Table' });
s3d.physicsBody(table, { type: 'static' });
for (let index = 0; index < 4; index++) {
  const crate = s3d.box([1.25, -0.65 + index * 0.35, 0.6], 0.3, 0.3, 0.3, { name: `Crate ${index + 1}`, material: 'Crate' });
  s3d.physicsBody(crate, { material: 'wood' });
}

s3d.camera([5.1, -6.6, 3.9], [0.6, 0, 0.9]);
s3d.physicsStart({ at: 3.2 });

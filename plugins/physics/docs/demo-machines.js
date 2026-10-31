// Demo for the machines screenshot (npm run screenshots): moving (kinematic) bodies – a turntable carrying crates and
// a lift going up and down with a ball on it – a piston on a slider with a program pushing crates, a chain of links
// on ball joints swinging, and two boards held together by a fixed joint.
s3d.clear();
s3d.editor.model.name = 'Machines';
s3d.material('Machine', '#495057');
s3d.material('Moving', '#1c7ed6');
s3d.material('Piston', '#f08c00');
s3d.material('Crate', '#c08a4a');
s3d.material('Link', '#adb5bd');
s3d.material('Ball', '#d6336c');

// a turntable: kinematic, turning 60° a second – the crates on it ride along until they slide off
const turntable = s3d.cylinder([0, 0, 0], 1.3, 0.12, { name: 'Turntable', material: 'Moving', segments: 40 });
s3d.physicsBody(turntable, { type: 'kinematic', spin: [0, 0, 60], material: 'rubber' });
[
  [0.8, 0],
  [-0.4, 0.7],
  [-0.4, -0.7],
].forEach(([x, y], index) => {
  const crate = s3d.box([x - 0.15, y - 0.15, 0.12], 0.3, 0.3, 0.3, { name: `Rider ${index + 1}`, material: 'Crate' });
  s3d.physicsBody(crate, { material: 'wood' });
});

// a lift: kinematic, 0.8 m/s up for 2 s and down again (period 4 s), a ball on it
const lift = s3d.box([2.6, -0.6, 0], 1.2, 1.2, 0.1, { name: 'Lift', material: 'Moving' });
s3d.physicsBody(lift, { type: 'kinematic', velocity: [0, 0, 0.8], period: 4 });
const ball = s3d.sphere([3.2, 0, 0.35], 0.25, { name: 'Ball on the lift', material: 'Ball', segments: 16 });
s3d.physicsBody(ball, { material: 'rubber', shape: 'sphere' });

// a piston: a rod on a slider along x, driven by a program (seconds → metres from where it starts)
const housing = s3d.box([5, -0.3, 0], 0.8, 0.6, 0.6, { name: 'Housing', material: 'Machine' });
s3d.physicsBody(housing, { type: 'static' });
const rod = s3d.box([5.8, -0.2, 0.1], 0.6, 0.4, 0.4, { name: 'Piston', material: 'Piston' });
s3d.physicsBody(rod, { material: 'steel' });
s3d.physicsJoint(rod, {
  kind: 'slider',
  to: housing,
  at: [5.8, 0, 0.3],
  axis: [1, 0, 0],
  min: 0,
  max: 1.2,
  program: [
    [0, 0],
    [1, 0],
    [2, 1.2],
    [3, 0],
  ],
});
for (let index = 0; index < 4; index++) {
  const crate = s3d.box([6.6 + index * 0.32, -0.15, 0], 0.3, 0.3, 0.3, { name: `Pushed crate ${index + 1}`, material: 'Crate' });
  s3d.physicsBody(crate, { material: 'wood' });
}

// a chain: links on ball joints hanging from a beam, the last one swung out
const beam = s3d.box([7.9, -0.1, 3], 1.4, 0.2, 0.2, { name: 'Beam', material: 'Machine' });
s3d.physicsBody(beam, { type: 'static' });
let above = beam;
for (let index = 0; index < 6; index++) {
  const top = 3 - index * 0.4;
  const link = s3d.box([8.55, -0.05, top - 0.38], 0.1, 0.1, 0.36, { name: `Link ${index + 1}`, material: 'Link' });
  s3d.physicsBody(link, { material: 'steel', velocity: index === 5 ? [3, 2, 0] : undefined });
  s3d.physicsJoint(link, { kind: 'ball', to: above, at: [8.6, 0, top] });
  above = link;
}

// two boards held by a fixed joint: they fall and tumble as one
const board = s3d.box([2.5, 2.5, 2], 1.2, 0.3, 0.06, { name: 'Board', material: 'Crate' });
s3d.physicsBody(board, { material: 'wood', spin: [0, 40, 20] });
const upright = s3d.box([2.5, 2.5, 2.06], 0.06, 0.3, 0.6, { name: 'Upright', material: 'Crate' });
s3d.physicsBody(upright, { material: 'wood', spin: [0, 40, 20] });
s3d.physicsJoint(upright, { kind: 'fixed', to: board, at: [2.53, 2.65, 2.06] });

s3d.camera([5.5, -12.5, 7], [5.5, 0.5, 1.2]);
s3d.physicsStart({ at: 2.2 });

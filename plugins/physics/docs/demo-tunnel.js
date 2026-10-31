// Demo for the wind tunnel screenshot (npm run screenshots): wind at 6 m/s through a tunnel around a car, a round
// pillar and a wall with a gap – smoke lines show the flow, blue where it is slow, red where it is fast – and a
// beach ball the wind blows away.
s3d.clear();
s3d.editor.model.name = 'Wind tunnel';
s3d.material('Tunnel', '#d0bfff', 0.15);
s3d.material('Car', '#1c7ed6');
s3d.material('Glass', '#a5d8ff');
s3d.material('Concrete', '#adb5bd');
s3d.material('Beach ball', '#fa5252');

// the tunnel: a region – the air in its box, the wind coming in along x
const tunnel = s3d.box([-3, -2, 0], 12, 4, 2.6, { name: 'Wind tunnel', material: 'Tunnel' });
s3d.physicsBody(tunnel, { type: 'tunnel', velocity: [6, 0, 0], resolution: 48 });

// a car: a body with a sloped cabin – static in the wind
const car = s3d.group('Car', () => {
  s3d.box([0, -0.8, 0.15], 3.6, 1.6, 0.6, { group: false, material: 'Car' });
  s3d.polyhedron(
    [
      [0.8, -0.7, 0.75],
      [3, -0.7, 0.75],
      [2.4, -0.65, 1.3],
      [1.4, -0.65, 1.3],
      [0.8, 0.7, 0.75],
      [3, 0.7, 0.75],
      [2.4, 0.65, 1.3],
      [1.4, 0.65, 1.3],
    ],
    [
      [0, 1, 2, 3],
      [4, 7, 6, 5],
      [0, 3, 7, 4],
      [1, 5, 6, 2],
      [3, 2, 6, 7],
      [0, 4, 5, 1],
    ],
    { material: 'Glass' },
  );
});
s3d.physicsBody(car, { type: 'static' });

const pillar = s3d.cylinder([5.5, 0.9, 0], 0.35, 2.6, { name: 'Pillar', material: 'Concrete', segments: 24 });
s3d.physicsBody(pillar, { type: 'static' });
const wall = s3d.box([7, -2, 0], 0.3, 1.5, 1.8, { name: 'Wall', material: 'Concrete' });
s3d.physicsBody(wall, { type: 'static' });

// light enough to fly: a beach ball in the wind
const ball = s3d.sphere([4.2, -1.55, 0.3], 0.3, { name: 'Beach ball', material: 'Beach ball', segments: 16 });
s3d.physicsBody(ball, { material: 'custom', density: 15, friction: 0.5, bounce: 0.7, shape: 'sphere' });

s3d.camera([1.5, -13, 9], [3, 0, 0.8]);
s3d.physicsStart({ at: 1.5 });

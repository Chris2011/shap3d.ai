// Animation demo – a little film: a car drives along a winding road, a ball bounces, a windmill turns in the wind
// while its blades spin (a group inside a group), the sun goes down – and two cameras cut between a wide shot and
// one that follows the car. Run it, then press Play in the timeline (or look through the camera and render it).
s3d.clear();
s3d.animateClear();
s3d.animateScene({ fps: 24, start: 1, end: 144 });

s3d.material('Meadow', '#8bbf5a');
s3d.material('Asphalt', '#5f6368');
s3d.material('Car red', '#e03131');
s3d.material('Glass', '#a5d8ff');
s3d.material('Tyre', '#212529');
s3d.material('Ball', '#fab005');
s3d.material('Mill', '#f1e3c8');
s3d.material('Sail', '#ffffff');

s3d.box([-13, -9, -0.1], 26, 18, 0.1, { name: 'Ground', material: 'Meadow' });

// the road: a line the car follows (a group of edges only), with a strip of asphalt under it
const roadPoints = [];
for (let step = 0; step <= 48; step++) {
  const x = -10 + (20 * step) / 48;
  roadPoints.push([x, 3.2 * Math.sin(x / 3.2), 0.02]);
}
const road = s3d.group('Road line', () => s3d.polyline(roadPoints));
s3d.group('Road', () => {
  // one face: the left edge forward, the right edge back
  const left = [];
  const right = [];
  roadPoints.forEach(([x, y], index) => {
    const [nx, ny] = roadPoints[Math.min(index + 1, roadPoints.length - 1)];
    const [px, py] = roadPoints[Math.max(index - 1, 0)];
    const length = Math.hypot(nx - px, ny - py);
    const side = [(-(ny - py) / length) * 0.9, ((nx - px) / length) * 0.9];
    left.push([x + side[0], y + side[1], 0.01]);
    right.push([x - side[0], y - side[1], 0.01]);
  });
  s3d.face([...right, ...left.reverse()]).material('Asphalt');
});

// the car, built facing +x – the path turns its front along the road
const car = s3d.group('Car', () => {
  s3d.box([-0.9, -0.45, 0.2], 1.8, 0.9, 0.45, { name: 'Body', material: 'Car red' });
  s3d.box([-0.45, -0.4, 0.65], 0.9, 0.8, 0.35, { name: 'Cabin', material: 'Glass' });
  for (const [x, y] of [
    [-0.55, -0.45],
    [0.55, -0.45],
    [-0.55, 0.45],
    [0.55, 0.45],
  ]) {
    s3d.sphere([x, y, 0.2], 0.2, { name: 'Wheel', material: 'Tyre', segments: 12 });
  }
});
s3d.animatePath(car, road, { from: 1, to: 144, follow: true, axis: '+x', interp: 'ease-in-out' });

// a bouncing ball: slow at the top, fast at the ground, squashed a little when it lands – repeated
const ball = s3d.sphere([4, 4.5, 0.5], 0.5, { name: 'Ball', material: 'Ball', segments: 16 });
s3d.animateKeys(ball, 'z', [[1, 0.5, 'ease-out'], [12, 2.6, 'ease-in'], [24, 0.5, 'ease-out']], { cycle: true });
s3d.animateKeys(ball, 'sz', [[1, 0.8], [4, 1], [21, 1], [24, 0.8]], { cycle: true });

// the windmill turns slowly in the wind – its blades, a group inside it, spin with it
let blades;
const mill = s3d.group('Windmill', () => {
  s3d.cylinder([-5, 5, 0], 0.7, 4.2, { name: 'Tower', material: 'Mill', segments: 16 });
  blades = s3d.group('Blades', () => {
    s3d.box([-5.2, 4.1, 3.8], 0.4, 0.2, 0.4, { name: 'Hub', material: 'Tyre' });
    s3d.box([-5.12, 4.15, 4], 0.24, 0.05, 2.2, { name: 'Sail', material: 'Sail' });
    s3d.box([-5.12, 4.15, 1.8], 0.24, 0.05, 2.2, { name: 'Sail', material: 'Sail' });
    s3d.box([-5, 4.15, 3.88], 2.2, 0.05, 0.24, { name: 'Sail', material: 'Sail' });
    s3d.box([-7.2, 4.15, 3.88], 2.2, 0.05, 0.24, { name: 'Sail', material: 'Sail' });
  });
});
s3d.animate(blades, { frame: 1, pivot: [-5, 4.2, 4], rotate: [0, 0, 0] });
s3d.animateKeys(blades, 'ry', [[1, 0], [48, 360]], { interp: 'linear', cycle: true });
s3d.animate(mill, { frame: 1, pivot: [-5, 5, 0], rotate: [0, 0, -15], interp: 'ease-in-out' });
s3d.animate(mill, { frame: 72, rotate: [0, 0, 20], interp: 'ease-in-out' });
s3d.animate(mill, { frame: 144, rotate: [0, 0, -15] });

// the sun goes from late afternoon to evening
s3d.animateSun({ frame: 1, hour: 15, daylight: 1 });
s3d.animateSun({ frame: 144, hour: 19.2, daylight: 0.55 });

// two cameras: a wide one that drifts, and one that watches the car – the shots cut between them
s3d.animateCamera({ name: 'Wide', frame: 1, position: [-6, -19, 9], target: [0, 0, 0.5], lens: 32 });
s3d.animateCamera({ name: 'Wide', frame: 144, position: [6, -19, 8], target: [0, 0.5, 0.5], lens: 36 });
s3d.animateCamera({ name: 'Follow car', frame: 1, position: [2, -7, 2.2], lens: 45, lookAt: car });
s3d.animateCamera({ name: 'Follow car', frame: 144, position: [8, -5, 2.6] });
s3d.animateShot({ frame: 1, camera: 'Wide' });
s3d.animateShot({ frame: 56, camera: 'Follow car' });
s3d.animateShot({ frame: 112, camera: 'Wide' });

s3d.camera([-6, -19, 9], [0, 0, 0.5]);
s3d.animatePlay({ frame: 40 });

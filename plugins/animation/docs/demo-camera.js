// Animation demo – a camera flight: the camera flies along a curve around a house, always looking at it, and zooms
// in at the end (its lens goes from 24 to 50 mm). The sun sets, the lamp by the door goes on and the windows glow –
// a light and a material colour over time.
s3d.clear();
s3d.animateClear();
s3d.animateScene({ fps: 30, start: 1, end: 180 });

s3d.material('Lawn', '#74b816');
s3d.material('Wall', '#f8f0e3');
s3d.material('Roof', '#a83a2a');
s3d.material('Window', '#4dabf7');
s3d.material('Door', '#7a4b2a');

s3d.box([-12, -12, -0.1], 24, 24, 0.1, { name: 'Lawn', material: 'Lawn' });
const house = s3d.group('House', () => {
  s3d.box([-3, -2, 0], 6, 4, 2.6, { name: 'Walls', material: 'Wall' });
  s3d.group('Roof', () => {
    s3d.face([[-3.3, -2.3, 2.6], [3.3, -2.3, 2.6], [3.3, 0, 4], [-3.3, 0, 4]]).material('Roof');
    s3d.face([[3.3, 2.3, 2.6], [-3.3, 2.3, 2.6], [-3.3, 0, 4], [3.3, 0, 4]]).material('Roof');
    s3d.face([[-3.3, -2.3, 2.6], [-3.3, 0, 4], [-3.3, 2.3, 2.6]]).material('Wall');
    s3d.face([[3.3, 2.3, 2.6], [3.3, 0, 4], [3.3, -2.3, 2.6]]).material('Wall');
  });
  for (const x of [-2.2, 1.2]) {
    s3d.box([x, -2.05, 1], 1, 0.06, 0.9, { name: 'Window', material: 'Window' });
  }
  s3d.box([-0.45, -2.05, 0], 0.9, 0.06, 1.9, { name: 'Door', material: 'Door' });
});

// the flight path: an arc around the front of the house, coming down
const points = [];
for (let step = 0; step <= 36; step++) {
  const angle = (-160 + (140 * step) / 36) * (Math.PI / 180);
  points.push([Math.cos(angle) * 11, Math.sin(angle) * 11, 6 - (3.5 * step) / 36]);
}
const flight = s3d.group('Camera path', () => s3d.polyline(points));
s3d.animateCamera({ name: 'Flight', frame: 1, lens: 24, lookAt: house, path: flight });
s3d.animateCamera({ name: 'Flight', frame: 140, lens: 24 });
s3d.animateCamera({ name: 'Flight', frame: 180, lens: 50 });

s3d.animateSun({ frame: 1, hour: 17, daylight: 1 });
s3d.animateSun({ frame: 180, hour: 20.5, daylight: 0.3 });
s3d.animateLight({ name: 'Door lamp', kind: 'point', frame: 1, position: [0, -2.7, 2.2], intensity: 0, color: '#ffd8a8', range: 8 });
s3d.animateLight({ name: 'Door lamp', frame: 110, intensity: 0 });
s3d.animateLight({ name: 'Door lamp', frame: 120, intensity: 2.5 });
s3d.animateMaterial('Window', { frame: 1, color: '#4dabf7' });
s3d.animateMaterial('Window', { frame: 100, color: '#4dabf7' });
s3d.animateMaterial('Window', { frame: 130, color: '#ffd43b' });

s3d.camera([-10, -4, 6], [0, 0, 1.5]);
s3d.animatePlay({ frame: 150, lookThrough: true });

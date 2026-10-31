// Demo for the flight screenshot (npm run screenshots): with air drag and a light wind – a rocket on its thrust, a
// glider thrown with lift on its wing, a drone hovering on four rotors, a cannon ball on its curve and a sheet of
// foam drifting down in the wind.
s3d.clear();
s3d.editor.model.name = 'Flight';
s3d.material('Rocket', '#e8590c');
s3d.material('Wing', '#f8f9fa');
s3d.material('Drone', '#343a40');
s3d.material('Cannon ball', '#212529');
s3d.material('Foam', '#ffe066');
s3d.material('Pad', '#adb5bd');
s3d.physicsSettings({ air: true, wind: [1.5, 0, 0] });

// the rocket: 3 kg, 50 N of thrust along its own z – turned a little, so it flies a curve
const pad = s3d.box([-1, -1, 0], 2, 2, 0.1, { name: 'Launch pad', material: 'Pad' });
s3d.physicsBody(pad, { type: 'static' });
const rocket = s3d.cylinder([0, 0, 0.1], 0.12, 1.4, { name: 'Rocket', material: 'Rocket', segments: 16 });
rocket.rotate(12, 'y', [0, 0, 0.1]);
s3d.physicsBody(rocket, { material: 'plastic', mass: 3, shape: 'cylinder', thrust: [0, 0, 50] });

// the glider: a flat wing thrown at 9 m/s along x – lift upwards from its speed along its x
const glider = s3d.box([-9, 3, 2], 0.7, 2.2, 0.05, { name: 'Glider', material: 'Wing' });
s3d.physicsBody(glider, { material: 'foam', mass: 1.5, velocity: [9, 0, 1], lift: 0.15 });

// the drone: a little more thrust than its weight (2 kg · 9.81) – it climbs slowly
const drone = s3d.box([4, -3, 0], 0.6, 0.6, 0.15, { name: 'Drone', material: 'Drone' });
s3d.physicsBody(drone, { material: 'plastic', mass: 2, thrust: [0, 0, 20.2] });

// a cannon ball shot at 45°: air drag makes its curve steeper at the end
const ball = s3d.sphere([-8, -2, 0.3], 0.15, { name: 'Cannon ball', material: 'Cannon ball', segments: 16 });
s3d.physicsBody(ball, { material: 'steel', shape: 'sphere', velocity: [9, 0, 9] });

// a sheet of foam: so light for its size that the air carries it with the wind
const sheet = s3d.box([-3, -4, 6], 1, 1, 0.02, { name: 'Foam sheet', material: 'Foam' });
s3d.physicsBody(sheet, { material: 'foam', spin: [30, 10, 0] });

s3d.camera([-1, -30, 9], [0, 0, 4]);
s3d.physicsStart({ at: 1.6 });

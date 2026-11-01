// Animation demo – a robot arm: every part is a group inside the one it hangs on (shoulder › upper arm › forearm ›
// gripper), so turning one carries everything after it along – parents and children, like bones. Each joint turns
// about its own point (its pivot), the curves ease in and out, and the jaws close.
s3d.clear();
s3d.animateClear();
s3d.animateScene({ fps: 24, start: 1, end: 120 });

s3d.material('Floor', '#dee2e6');
s3d.material('Robot', '#f08c00');
s3d.material('Joint', '#343a40');

s3d.box([-4, -4, -0.1], 8, 8, 0.1, { name: 'Floor', material: 'Floor' });

let shoulder;
let upper;
let fore;
let jawLeft;
let jawRight;
s3d.group('Robot', () => {
  s3d.cylinder([0, 0, 0], 0.6, 0.3, { name: 'Base', material: 'Joint', segments: 24 });
  shoulder = s3d.group('Shoulder', () => {
    s3d.cylinder([0, 0, 0.3], 0.4, 0.5, { name: 'Turntable', material: 'Robot', segments: 24 });
    upper = s3d.group('Upper arm', () => {
      s3d.box([-0.15, -0.15, 0.7], 0.3, 0.3, 1.5, { name: 'Upper arm', material: 'Robot' });
      fore = s3d.group('Forearm', () => {
        s3d.box([-0.12, -0.12, 2.2], 0.24, 0.24, 1.2, { name: 'Forearm', material: 'Robot' });
        s3d.group('Gripper', () => {
          s3d.box([-0.2, -0.12, 3.4], 0.4, 0.24, 0.08, { name: 'Wrist', material: 'Joint' });
          jawLeft = s3d.box([-0.2, -0.04, 3.48], 0.06, 0.08, 0.3, { name: 'Jaw left', material: 'Joint' });
          jawRight = s3d.box([0.14, -0.04, 3.48], 0.06, 0.08, 0.3, { name: 'Jaw right', material: 'Joint' });
        });
      });
    });
  });
});

// each joint turns about its own point
s3d.animate(shoulder, { frame: 1, pivot: [0, 0, 0.3], rotate: [0, 0, 0] });
s3d.animate(upper, { frame: 1, pivot: [0, 0, 0.8], rotate: [0, 0, 0] });
s3d.animate(fore, { frame: 1, pivot: [0, 0, 2.2], rotate: [0, 0, 0] });

// turn, bend down, grip, lift, turn back – the children follow their parents
s3d.animateKeys(shoulder, 'rz', [[1, 0], [30, -40], [60, -40], [100, 70], [120, 70]], { interp: 'ease-in-out' });
s3d.animateKeys(upper, 'ry', [[1, 0], [20, 0], [45, 45], [70, 45], [95, 20], [120, 20]], { interp: 'ease-in-out' });
s3d.animateKeys(fore, 'ry', [[1, 0], [20, 0], [45, 70], [70, 70], [95, 35], [120, 35]], { interp: 'ease-in-out' });
s3d.animateKeys(jawLeft, 'x', [[1, -0.17], [50, -0.17], [62, -0.1]], { interp: 'ease-out' });
s3d.animateKeys(jawRight, 'x', [[1, 0.17], [50, 0.17], [62, 0.1]], { interp: 'ease-out' });

s3d.animateCamera({ name: 'Side', frame: 1, position: [4.5, -6, 3.4], target: [0.4, 0, 1.6], lens: 35 });
s3d.animateCamera({ name: 'Side', frame: 120, position: [5.5, -3.5, 4], target: [0.4, 0.2, 1.6], lens: 35 });

s3d.camera([4.5, -6, 3.4], [0.4, 0, 1.6]);
s3d.animatePlay({ frame: 50 });

// Animation demo – a jointed puppet: every limb is a group inside the one it hangs on and a bone with limits, so a knee
// only bends one way. Two stored poses, one mirroring the other, keyed in turn make it walk across the floor.
// Open the Animation panel (advanced view) and take the Pose tool: drag a bone, I keys it, Mirror swaps the sides.
s3d.clear();
s3d.animateClear();
s3d.animateScene({ fps: 24, start: 1, end: 96 });

s3d.material('Floor', '#dee2e6');
s3d.material('Wood', '#d9a066');
s3d.material('Joint', '#8d5a2b');

s3d.box([-2, -4, -0.1], 4, 8, 0.1, { name: 'Floor', material: 'Floor' });

const limb = (from, to, radius) => {
  s3d.cylinderBetween(from, to, radius, { material: 'Wood', segments: 12 });
  s3d.sphere(from, radius * 1.15, { material: 'Joint', segments: 12 });
};

// a leg and an arm for each side: x = 1 on the puppet's left (it looks along −y), x = −1 on its right
const groups = {};
const leg = (name, side) => {
  groups[`thigh.${name}`] = s3d.group(`thigh.${name}`, () => {
    limb([side * 0.1, 0, 0.9], [side * 0.1, 0, 0.5], 0.05);
    groups[`shin.${name}`] = s3d.group(`shin.${name}`, () => {
      limb([side * 0.1, 0, 0.5], [side * 0.1, 0, 0.08], 0.04);
      s3d.box([side * 0.1 - 0.05, -0.16, 0], 0.1, 0.24, 0.07, { name: `foot.${name}`, material: 'Joint' });
    });
  });
};
const arm = (name, side) => {
  groups[`upperarm.${name}`] = s3d.group(`upperarm.${name}`, () => {
    limb([side * 0.24, 0, 1.42], [side * 0.24, 0, 1.12], 0.035);
    groups[`forearm.${name}`] = s3d.group(`forearm.${name}`, () => {
      limb([side * 0.24, 0, 1.12], [side * 0.24, 0, 0.85], 0.03);
      s3d.sphere([side * 0.24, 0, 0.81], 0.045, { material: 'Joint', segments: 12 });
    });
  });
};

const puppet = s3d.group('Puppet', () => {
  s3d.sphere([0, 0, 0.92], 0.14, { name: 'Pelvis', material: 'Wood', segments: 16 });
  groups.spine = s3d.group('spine', () => {
    s3d.cylinderBetween([0, 0, 0.95], [0, 0, 1.42], 0.13, { endRadius: 0.17, material: 'Wood', segments: 16 });
    groups.head = s3d.group('head', () => {
      s3d.cylinderBetween([0, 0, 1.42], [0, 0, 1.5], 0.04, { material: 'Joint', segments: 12 });
      s3d.sphere([0, 0, 1.62], 0.13, { material: 'Wood', segments: 16 });
    });
    arm('L', 1);
    arm('R', -1);
  });
  leg('L', 1);
  leg('R', -1);
});

// the bones: joint, tip and how far each may turn from its rest
s3d.animateBone(puppet, { head: [0, 0, 0.92], tail: [0, 0, 1.1], name: 'hips' });
s3d.animateBone(groups.spine, { head: [0, 0, 0.95], tail: [0, 0, 1.42], limits: { rx: [-20, 60], ry: [-30, 30], rz: [-30, 30] } });
s3d.animateBone(groups.head, { head: [0, 0, 1.45], tail: [0, 0, 1.75], limits: { rx: [-40, 40], ry: [-30, 30], rz: [-70, 70] } });
for (const [name, side] of [['L', 1], ['R', -1]]) {
  const x = side * 0.1;
  const shoulder = side * 0.24;
  s3d.animateBone(groups[`thigh.${name}`], { head: [x, 0, 0.9], tail: [x, 0, 0.5], limits: { rx: [-100, 45], ry: [-30, 30], rz: [-30, 30] } });
  s3d.animateBone(groups[`shin.${name}`], { head: [x, 0, 0.5], tail: [x, 0, 0.08], limits: { rx: [0, 140], ry: [0, 0], rz: [0, 0] } });
  s3d.animateBone(groups[`upperarm.${name}`], { head: [shoulder, 0, 1.42], tail: [shoulder, 0, 1.12] });
  s3d.animateBone(groups[`forearm.${name}`], { head: [shoulder, 0, 1.12], tail: [shoulder, 0, 0.85], limits: { rx: [-145, 0], ry: [0, 0], rz: [0, 0] } });
}

// two steps: the front leg swings forward (a negative turn about x), the back knee bends, the arms swing against the legs
s3d.animatePose(puppet, 'Step left', {
  bones: {
    'thigh.L': [-28, 0, 0],
    'shin.L': [8, 0, 0],
    'thigh.R': [24, 0, 0],
    'shin.R': [35, 0, 0],
    'upperarm.L': [22, 0, 0],
    'forearm.L': [-15, 0, 0],
    'upperarm.R': [-26, 0, 0],
    'forearm.R': [-35, 0, 0],
    spine: [5, 0, 0],
  },
});
s3d.animatePose(puppet, 'Step right', {
  bones: {
    'thigh.R': [-28, 0, 0],
    'shin.R': [8, 0, 0],
    'thigh.L': [24, 0, 0],
    'shin.L': [35, 0, 0],
    'upperarm.R': [22, 0, 0],
    'forearm.R': [-15, 0, 0],
    'upperarm.L': [-26, 0, 0],
    'forearm.L': [-35, 0, 0],
    spine: [5, 0, 0],
  },
});

for (let frame = 1, step = 0; frame <= 97; frame += 16, step++) {
  s3d.animatePose(puppet, step % 2 ? 'Step right' : 'Step left', { frame, interp: 'ease-in-out' });
}

// along the floor, facing the way it goes
s3d.animateKeys(puppet, 'y', [[1, 3], [97, -3]], { interp: 'linear' });

s3d.camera([4.5, 1, 1.8], [0, 0, 0.9]);
s3d.animatePlay({ frame: 20 });

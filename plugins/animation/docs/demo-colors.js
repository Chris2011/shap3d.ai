// Animation demo – colours, fading and appearing: a row of blocks pops up one after another (visible, then scaled
// with an overshoot – the 'back' curve), changes colour in a wave and fades out again; a glass pane turns from
// clear to frosted. Every curve can be looked at and changed in the graph editor.
s3d.clear();
s3d.animateClear();
s3d.animateScene({ fps: 24, start: 1, end: 96 });

s3d.material('Stage', '#e9ecef');
s3d.material('Glass pane', '#a5d8ff');
s3d.box([-1, -2, -0.1], 12, 4, 0.1, { name: 'Stage', material: 'Stage' });

const colours = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa'];
colours.forEach((colour, index) => {
  const block = s3d.box([index * 1.8, -0.5, 0], 1, 1, 1, { name: `Block ${index + 1}` });
  const start = 2 + index * 6;
  s3d.animate(block, { frame: 1, visible: false });
  s3d.animate(block, { frame: start, visible: true, scale: 0.05, color: colour, interp: 'back' });
  s3d.animate(block, { frame: start + 10, scale: 1 });
  s3d.animate(block, { frame: 50 + index * 3, color: colour });
  s3d.animate(block, { frame: 62 + index * 3, color: colours[(index + 3) % colours.length] });
  s3d.animate(block, { frame: 78, opacity: 1 });
  s3d.animate(block, { frame: 92, opacity: 0.15 });
});

s3d.box([-0.5, 1.4, 0], 11, 0.05, 2.2, { name: 'Pane', material: 'Glass pane' });
s3d.animateMaterial('Glass pane', { frame: 1, opacity: 0.15 });
s3d.animateMaterial('Glass pane', { frame: 60, opacity: 0.85, interp: 'ease-in-out' });

s3d.camera([4.5, -10, 4.5], [4.5, 0, 0.6]);
s3d.animatePlay({ frame: 58 });

// Demo for the brick designer screenshot (npm run screenshots) – the same as the example "Brick house" in the script editor.
s3d.editor.model.name = 'Haus';
s3d.brick('baseplate-16x16', { at: [0, 0], color: 'green' });
s3d.brick('tile-2x4', { at: [-1, -6], color: 'tan' });
s3d.brick('tile-2x4', { at: [1, -6], color: 'tan' });

// four walls, six bricks high: front and back along x, the sides between them along y
s3d.brickWall({ from: [-6, -4], length: 12, rows: 6, color: 'white', openings: [{ part: 'door-4x1x6', at: 4, color: 'blue' }] });
s3d.brickWall({ from: [-6, 3], length: 12, rows: 6, color: 'white', openings: [{ part: 'window-2x1x2', at: 5, from: 2, color: 'lightBlue' }] });
for (const x of [-6, 5]) {
  s3d.brickWall({ from: [x, -3], length: 6, rows: 6, along: 'y', color: 'white', openings: [{ part: 'window-2x1x2', at: 2, from: 1, color: 'lightBlue' }] });
}

// the roof: three rows of slopes on each side, each resting on the one before
for (const [y, rotation] of [[-3, 0], [3, 180], [-2, 0], [2, 180], [-1, 0], [1, 180]]) {
  for (const x of [-4, 0, 4]) {
    s3d.brick('slope45-4x2', { at: [x, y], rotation, color: 'darkRed' });
  }
}

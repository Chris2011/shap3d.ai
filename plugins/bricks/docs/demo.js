// Demo for the brick designer screenshot (npm run screenshots): a small house on a baseplate, built with s3d.brick.
s3d.editor.model.name = 'Haus';
const lay = (part, x, y, color, rotation = 0) => s3d.brick(part, { at: [x, y], color, rotation });

lay('baseplate-16x16', 0, 0, 'green');

// a path to the door
lay('tile-2x4', -1, -6, 'tan');
lay('tile-2x4', 1, -6, 'tan');

// the walls, six bricks high: a door in front, a window on each side, joints that change from row to row
lay('door-4x1x6', 0, -3.5, 'blue');
for (const x of [-5.5, 5.5]) {
  lay('brick-1x6', x, 0, 'white');
  lay('window-2x1x2', x, 0, 'lightBlue', 90);
}
for (let row = 0; row < 6; row++) {
  for (const x of [-4, 4]) {
    lay('brick-1x4', x, -3.5, 'white', 90);
  }
  if (row % 2) {
    for (const x of [-3, 3]) {
      lay('brick-1x6', x, 3.5, 'white', 90);
    }
  } else {
    for (const x of [-4, 0, 4]) {
      lay('brick-1x4', x, 3.5, 'white', 90);
    }
  }
  for (const x of [-5.5, 5.5]) {
    if (row === 0) {
      continue;
    }
    if (row < 3) {
      for (const y of [-2, 2]) {
        lay('brick-1x2', x, y, 'white');
      }
    } else {
      lay('brick-1x6', x, 0, 'white');
    }
  }
}

// the roof: three rows of slopes on each side
for (const [y, rotation] of [
  [-3, 0],
  [3, 180],
  [-2, 0],
  [2, 180],
  [-1, 0],
  [1, 180],
]) {
  for (const x of [-4, 0, 4]) {
    lay('slope45-4x2', x, y, 'darkRed', rotation);
  }
}

// a tree
lay('roundBrick-1x1', -6.5, -6.5, 'brown');
lay('roundBrick-2x2', -7, -7, 'green');
lay('cone-1x1', -7.5, -7.5, 'lime');

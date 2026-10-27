// Demo for the maisonette screenshot (npm run screenshots): an L-shaped flat on two floors – a sloped ceiling
// upstairs, a spiral stair through a stairwell – built with s3d.room and s3d.furniture.
s3d.editor.model.name = 'Maisonette';
s3d.room({
  width: 7,
  depth: 5,
  height: 2.6,
  wall: 0.24,
  floor: 'floor',
  // the front right corner is cut out: an L
  notch: { corner: 'se', width: 2.2, depth: 1.8 },
  // upstairs the roof slopes down to a 1 m knee wall at the back
  slope: { side: 'north', knee: 1.0, depth: 2.4 },
  upper: { height: 2.5, slab: 0.25, stairwell: { x: 5.15, y: 3.15, w: 1.7, d: 1.7 } },
  // walls along the outline: 0 front, 1 and 2 the cut-out, 3 right, 4 back, 5 left
  openings: [
    { id: 'door', kind: 'door', wall: 0, offset: 0.6, width: 1.0, height: 2.1, sill: 0, level: 0 },
    { id: 'living', kind: 'window', wall: 0, offset: 2.4, width: 1.8, height: 1.4, sill: 0.8, level: 0 },
    { id: 'kitchen', kind: 'window', wall: 5, offset: 1.6, width: 1.2, height: 1.3, sill: 0.9, level: 0 },
    { id: 'east', kind: 'window', wall: 3, offset: 0.4, width: 1.2, height: 1.3, sill: 0.9, level: 0 },
    { id: 'bedroom', kind: 'window', wall: 0, offset: 2.2, width: 1.4, height: 1.3, sill: 0.9, level: 1 },
    { id: 'study', kind: 'window', wall: 3, offset: 0.3, width: 1.0, height: 1.2, sill: 0.9, level: 1 },
  ],
});

// lower floor: kitchen at the back, dining in the middle, sofa at the front window
s3d.furniture('kitchenRun', { params: { length: 3.6, wallCabinets: 'yes', finish: 'anthracite' }, at: [2.1, 4.69], rotation: 0 });
s3d.furniture('diningTable', { params: { width: 1.6, depth: 0.9, finish: 'oak' }, at: [2.4, 2.9] });
for (const x of [2.0, 2.8]) {
  s3d.furniture('chair', { params: { finish: 'black' }, at: [x, 2.25], rotation: 180 });
  s3d.furniture('chair', { params: { finish: 'black' }, at: [x, 3.55], rotation: 0 });
}
s3d.furniture('sofa', { params: { seats: 3, fabric: 'fabricGreen' }, at: [3.3, 0.46], rotation: 180 });
s3d.furniture('rug', { params: { width: 2.4, depth: 1.6 }, at: [3.3, 1.3] });
s3d.furniture('coffeeTable', { params: { width: 1.2, finish: 'walnut' }, at: [3.3, 1.45] });
s3d.furniture('plant', { params: { plantSize: 'large' }, at: [0.4, 0.45] });
s3d.furniture('stairSpiral', { params: { diameter: 1.6, turn: 'right', rise: 'auto', finish: 'oak' }, at: [6.0, 4.0] });

// upper floor: a bed under the slope, wardrobes at the front, a desk on the right, a railing at the stairwell
s3d.furniture('bed', { params: { width: 1.6, length: 2.0, finish: 'oak' }, at: [2.3, 3.96], rotation: 0, level: 1 });
for (const x of [1.15, 3.45]) s3d.furniture('nightstand', { params: { finish: 'white' }, at: [x, 4.81], rotation: 0, level: 1 });
s3d.furniture('wardrobe', { params: { sections: 2, sectionWidth: 1.0, height: 2.36, doors: 'sliding', finish: 'white' }, at: [1.0, 0.3], rotation: 180, level: 1 });
s3d.furniture('desk', { params: { width: 1.4, depth: 0.7, finish: 'oak' }, at: [6.65, 2.6], rotation: 270, level: 1 });
s3d.furniture('officeChair', { at: [6.0, 2.6], rotation: 90, level: 1 });
s3d.furniture('railing', { params: { length: 1.5, finish: 'metal' }, at: [5.95, 3.12], level: 1 });
s3d.furniture('railing', { params: { length: 1.5, finish: 'metal' }, at: [5.12, 3.95], rotation: 90, level: 1 });
s3d.furniture('rug', { params: { width: 2.0, depth: 1.6 }, at: [2.3, 2.3], level: 1 });

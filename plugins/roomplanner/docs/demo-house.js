// Demo for the screenshot of free floor plans (npm run screenshots): two rooms side by side with a door between
// them – a living room with a slanted wall and a round back wall, and an attic room under a gable roof with
// roof windows – built with s3d.room and s3d.furniture.
s3d.editor.model.name = 'Haus am See';

// the living room: a slanted corner on the front right, the back wall bows out in an arc
s3d.room({
  id: 'living',
  name: 'Wohnzimmer',
  height: 2.6,
  wall: 0.2,
  floor: 'floor',
  shape: 'polygon',
  points: [
    { x: 0, y: 0 },
    { x: 5, y: 0 },
    { x: 6, y: 1.2 },
    { x: 6, y: 4 },
    { x: 0, y: 4, bulge: 0 },
  ].map((point, i) => (i === 3 ? { ...point, bulge: 0.9 } : point)),
  // walls: 0 front, 1 slanted, 2 right, 3 back (round), 4 left
  openings: [
    { id: 'door', kind: 'door', wall: 0, offset: 0.6, width: 1.0, height: 2.1, sill: 0 },
    { id: 'passage', kind: 'door', wall: 2, offset: 1.2, width: 0.9, height: 2.1, sill: 0 },
    { id: 'west', kind: 'window', wall: 4, offset: 1.2, width: 1.4, height: 1.3, sill: 0.9 },
    { id: 'front', kind: 'window', wall: 0, offset: 2.6, width: 1.6, height: 1.4, sill: 0.8 },
  ],
});

// the attic room right next to it (walls back to back): a gable roof with a window in each slope
s3d.room({
  id: 'attic',
  name: 'Dachzimmer',
  at: [6.4, 0],
  width: 4.5,
  depth: 4,
  height: 2.8,
  wall: 0.2,
  floor: 'carpet',
  slopes: [
    { side: 'north', knee: 1.1, depth: 1.7 },
    { side: 'south', knee: 1.1, depth: 1.7 },
  ],
  roofWindows: [
    { id: 'north', x: 2.25, y: 3.2, w: 0.78, d: 0.98 },
    { id: 'south', x: 2.25, y: 0.8, w: 0.78, d: 0.98 },
  ],
  // walls: 0 front, 1 right (the gable), 2 back, 3 left – the door to the living room is in it
  openings: [
    { id: 'passage', kind: 'door', wall: 3, offset: 0.7, width: 0.9, height: 2.1, sill: 0 },
    { id: 'gable', kind: 'window', wall: 1, offset: 1.4, width: 1.2, height: 1.3, sill: 0.9 },
  ],
});

// living room: sofa at the round wall, a TV bench on the slanted wall, dining at the window
s3d.furniture('sofa', { params: { seats: 3, fabric: 'fabricBeige' }, at: [2.6, 4.2], rotation: 0 });
s3d.furniture('rug', { params: { width: 2.4, depth: 1.6 }, at: [2.6, 2.8] });
s3d.furniture('coffeeTable', { params: { width: 1.2, finish: 'oak' }, at: [2.6, 2.8] });
s3d.furniture('tvBench', { params: { width: 1.2, front: 'drawers', finish: 'white' }, at: [5.34, 0.73], rotation: 230.2 });
s3d.furniture('roundTable', { params: { diameter: 1.0, finish: 'white' }, at: [1.2, 1.2] });
for (const [x, y, rotation] of [[1.2, 0.55, 180], [1.2, 1.85, 0], [0.55, 1.2, 90]]) {
  s3d.furniture('chair', { params: { finish: 'oak' }, at: [x, y], rotation });
}
s3d.furniture('plant', { params: { plantSize: 'large' }, at: [0.4, 3.6] });
s3d.furniture('floorLamp', { at: [5.6, 3.6] });

// attic room: the bed against the gable, a desk under the front roof window, a wardrobe in the high middle
s3d.furniture('bed', { params: { width: 1.6, length: 2.0, finish: 'walnut' }, at: [9.87, 2.0], rotation: 270 });
s3d.furniture('nightstand', { params: { finish: 'walnut' }, at: [10.71, 0.82], rotation: 270 });
s3d.furniture('desk', { params: { width: 1.2, depth: 0.6, finish: 'white' }, at: [8.65, 0.6], rotation: 180 });
s3d.furniture('officeChair', { at: [8.65, 1.2], rotation: 0 });
s3d.furniture('openWardrobe', { params: { width: 1.2, finish: 'black' }, at: [8.0, 3.4], rotation: 0 });

// Demo for the room planner screenshot (npm run screenshots): a living room with kitchen, dining and sofa corner –
// built with the plugin's script functions s3d.room and s3d.furniture.
s3d.editor.model.name = 'Wohnküche';
s3d.room({
  width: 6,
  depth: 4.5,
  height: 2.5,
  wall: 0.2,
  floor: 'floor',
  openings: [
    { id: 'door', kind: 'door', wall: 'south', offset: 0.5, width: 0.9, height: 2.1, sill: 0 },
    { id: 'north', kind: 'window', wall: 'north', offset: 3.7, width: 1.6, height: 1.3, sill: 0.9 },
    { id: 'west', kind: 'window', wall: 'west', offset: 1.4, width: 1.2, height: 1.3, sill: 0.9 },
  ],
});

// kitchen along the back wall, dining in front of it
s3d.furniture('kitchenRun', { params: { length: 3.0, wallCabinets: 'yes', finish: 'white' }, at: [1.5, 4.19], rotation: 0 });
s3d.furniture('diningTable', { params: { width: 1.6, depth: 0.9, finish: 'oak' }, at: [1.6, 2.2] });
for (const x of [1.2, 2.0]) {
  s3d.furniture('chair', { params: { finish: 'oak' }, at: [x, 1.55], rotation: 180 });
  s3d.furniture('chair', { params: { finish: 'oak' }, at: [x, 2.85], rotation: 0 });
}
s3d.furniture('pendantLamp', { at: [1.6, 2.2] });

// sofa corner on the right
s3d.furniture('rug', { params: { width: 2.4, depth: 1.6 }, at: [4.55, 2.2], rotation: 90 });
s3d.furniture('sofa', { params: { seats: 3, fabric: 'fabricBlue' }, at: [5.54, 2.2], rotation: 270 });
s3d.furniture('coffeeTable', { params: { width: 1.2, finish: 'walnut' }, at: [4.5, 2.2], rotation: 90 });
s3d.furniture('armchair', { params: { fabric: 'fabricBeige' }, at: [4.3, 0.5], rotation: 180 });
s3d.furniture('floorLamp', { at: [5.7, 0.35] });
s3d.furniture('plant', { params: { plantSize: 'large' }, at: [5.65, 4.15] });
s3d.furniture('picture', { params: { format: 'landscape' }, at: [5.985, 2.2], rotation: 270 });

// storage along the left wall – the cube shelf under the window
s3d.furniture('cubeShelf', { params: { columns: 4, rows: 2, inserts: 'some', finish: 'white' }, at: [0.2, 2.0], rotation: 90 });
s3d.furniture('bookcase', { params: { width: 0.8, height: 2.02, finish: 'oak' }, at: [0.14, 3.3], rotation: 90 });

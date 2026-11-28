// Demo for the windows and doors screenshot (npm run screenshots): the walls of a small house as four groups, a glazed double
// front door, tilt-and-turn, fixed and sliding windows with glazing bars – all set with s3d.opening(), the holes cut through the walls.
s3d.clear();
s3d.editor.model.name = 'Haus';
s3d.material('Putz', '#ebe4d6');
const [length, depth, height, thickness] = [7, 5, 2.7, 0.3];
const wall = (at, x, y) => s3d.box(at, x, y, height).material('Putz');

const front = wall([0, 0, 0], length, thickness);
wall([0, depth - thickness, 0], length, thickness);
const left = wall([0, thickness, 0], thickness, depth - 2 * thickness);
wall([length - thickness, thickness, 0], thickness, depth - 2 * thickness);

// the front: a glazed double door, a tilt-and-turn window with a roller shutter and a fixed one; the side: a sliding window
s3d.opening(front, { at: [1.4, 0, 1], kind: 'door', width: 1.51, height: 2.135, sashes: 2, glazed: true });
s3d.opening(front, { at: [3.6, 0, 1.5], width: 1.26, height: 1.385, sill: 0.885, sashes: 2, barsAcross: 1, shutter: true, shutterDown: 0.25 });
s3d.opening(front, { at: [5.6, 0, 1.5], width: 1.01, height: 1.385, sill: 0.885, sashes: 1, barsAcross: 2, barsUpright: 1, operation: 'fixed' });
s3d.opening(left, { at: [0, 2.5, 1.5], width: 1.76, height: 1.385, sill: 0.885, sashes: 2, operation: 'sliding' });

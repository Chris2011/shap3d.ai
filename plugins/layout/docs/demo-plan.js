// Demo for the floor plan screenshot (npm run screenshots): the walls of a small house, a section plane at
// 1.20 m and a sheet with the plan at 1:50 (cut walls filled), door, window and furniture symbols, dimensions,
// room names, labels, a perspective and two layers.
s3d.editor.model.name = 'Ferienhaus';
s3d.material('Wand', '#e4e0d8');
s3d.material('Boden', '#d9cbb3');

// walls from x1 to x2 / y1 to y2 (metres) with openings [from, to] along the wall: windows keep a sill up to
// 0.9 m, doors and windows a lintel from 2.1 m
const wall = (x1, y1, x2, y2, windows = [], doors = []) => {
  const along = x2 - x1 > y2 - y1 ? 'x' : 'y';
  const [start, end] = along === 'x' ? [x1, x2] : [y1, y2];
  const piece = (a, b, from, to) =>
    along === 'x'
      ? s3d.box([a, y1, from], b - a, y2 - y1, to - from, { name: 'Wand', material: 'Wand' })
      : s3d.box([x1, a, from], x2 - x1, b - a, to - from, { name: 'Wand', material: 'Wand' });
  const openings = [...windows.map((range) => [...range, 0.9]), ...doors.map((range) => [...range, 0])].sort((p, q) => p[0] - q[0]);
  let at = start;
  for (const [a, b, sill] of openings) {
    piece(at, a, 0, 2.5);
    if (sill) piece(a, b, 0, sill);
    piece(a, b, 2.1, 2.5);
    at = b;
  }
  piece(at, end, 0, 2.5);
};
s3d.box([0, 0, -0.05], 10, 7.5, 0.05, { name: 'Bodenplatte', material: 'Boden' });
wall(0, 0, 10, 0.3, [[4.2, 5.4], [7.4, 8.6]], [[2, 3]]); // south: two windows and the entrance
wall(0, 7.2, 10, 7.5, [[1, 3], [7.4, 8.6]]); // north
wall(0, 0.3, 0.3, 7.2, [[3, 4.2]]); // west
wall(9.7, 0.3, 10, 7.2, [[4.8, 6]]); // east
wall(6, 0.3, 6.12, 7.2, [], [[1.2, 2], [4.2, 5.1]]); // between living and bath / bedroom
wall(6.12, 3.5, 9.7, 3.62); // between bath and bedroom

// the plan cut at 1.20 m, looking down – off in the model, the plan viewport switches it on for itself
s3d.editor.model.sections.push({
  id: 920001,
  point: new THREE.Vector3(0, 0, 1.2),
  normal: new THREE.Vector3(0, 0, -1),
  active: false,
  name: 'Grundriss 1,20 m',
});

const scene = (name, position, target, ortho) =>
  s3d.editor.model.scenes.push({ id: 910000 + s3d.editor.model.scenes.length, name, camera: { position, target, fov: 35, ortho } });
// north up: the camera looks down with "up" towards +y (a hair south of the target)
scene('Grundriss', [5, 3.7499, 30], [5, 3.75, 0], true);
scene('Perspektive', [-7, -9, 10], [5, 3.75, 0.5], false);
const [plan, perspective] = s3d.editor.model.scenes.slice(-2);

// the sheet: 1 m in the model is 20 mm on paper at 1:50; the plan viewport is centred on (5, 3.75)
let next = 0;
const id = () => `demo${next++}`;
const px = (x) => 50 + 20 * x;
const py = (y) => 197 - 20 * y;
const symbol = (name, x, y, rotation = 0) => ({ id: id(), type: 'symbol', symbol: name, x, y, scale: 50, rotation, mirror: false });
// views and symbols on the layer "Zeichnung", dimensions and texts on "Beschriftung"
const dimension = (x1, y1, x2, y2, offset = 8) => ({ id: id(), type: 'dimension', x1, y1, x2, y2, offset, layer: 'notes' });
const text = (x, y, value, size = 3.5, bold = false) => ({ id: id(), type: 'text', x, y, text: value, size, bold, layer: 'notes' });
const label = (x1, y1, x2, y2, value) => ({ id: id(), type: 'label', x1, y1, x2, y2, text: value, size: 3.2, layer: 'notes' });

const elements = [
  {
    id: id(),
    type: 'viewport',
    x: 25,
    y: 22,
    w: 250,
    h: 200,
    sceneId: plan.id,
    camera: plan.camera,
    scale: 50,
    render: 'hybrid',
    sectionId: 920001,
    sectionFill: { color: '#2b3038', pattern: 'solid' },
    caption: 'Grundriss Erdgeschoss',
    layer: 'plan',
  },
  {
    id: id(),
    type: 'viewport',
    x: 292,
    y: 128,
    w: 108,
    h: 72,
    sceneId: perspective.id,
    camera: perspective.camera,
    scale: null,
    render: 'hybrid',
    caption: 'Perspektive',
    layer: 'plan',
  },
  // doors and windows
  symbol('door100', px(2), py(0.3) - 20, 180),
  symbol('door80', px(6.12), py(2), -90),
  symbol('door90', px(6.12), py(5.1), -90),
  symbol('window', px(4.2), py(0.15) - 2.4),
  symbol('window', px(7.4), py(0.15) - 2.4),
  symbol('windowWide', px(1), py(7.35) - 2.4),
  symbol('window', px(7.4), py(7.35) - 2.4),
  symbol('window', px(0.15) - 12, py(3.6) - 2.4, 90),
  symbol('window', px(9.85) - 12, py(5.4) - 2.4, 90),
  // living, dining, kitchen
  symbol('sofa', px(0.7), py(7.1)),
  symbol('armchair', px(0.6), py(5.4), 90),
  symbol('diningTable', px(3.2), py(4.9)),
  symbol('kitchen', px(3.4), py(7.2)),
  // bedroom
  symbol('bedDouble', px(7), py(7.2)),
  symbol('wardrobe', px(7.4), py(4.22), 180),
  // bath
  symbol('bathtub', px(7.9), py(1.05), 180),
  symbol('wc', px(6.6), py(3.5)),
  symbol('washbasin', px(7.6), py(3.5)),
  symbol('shower', px(8.7), py(3.4)),
  // dimensions: overall above and left, the openings of the south wall below
  dimension(px(0), py(7.5), px(10), py(7.5), 8),
  dimension(px(0), py(0), px(0), py(7.5), 8),
  dimension(px(2), py(0), px(0), py(0), 8),
  dimension(px(3), py(0), px(2), py(0), 8),
  dimension(px(10), py(0), px(3), py(0), 8),
  // rooms
  text(px(1.2), py(2.6), 'Wohnen / Kochen\n39,3 m²', 3.5),
  text(190, 101, 'Schlafen\n12,8 m²', 3.2),
  text(196, 155, 'Bad\n11,5 m²', 3.2),
  // the right column: title, labels and the perspective
  text(292, 36, 'Grundriss Erdgeschoss', 6, true),
  text(292, 45, 'Ferienhaus · M 1:50', 3.5),
  label(px(4.6), py(6.95), 185, 28, 'Küchenzeile 2,40 m'),
  label(px(2.5), py(0.1), 125, 234, 'Eingang'),
  label(px(10), py(5.4), 300, 100, 'Fenster 1,20 m'),
];
const layers = [
  { id: 'plan', name: 'Zeichnung', visible: true, locked: false },
  { id: 'notes', name: 'Beschriftung', visible: true, locked: false },
];

const page = { id: 'demo-plan', name: 'Grundriss EG', size: 'A3', orientation: 'landscape', titleBlock: true, elements };
s3d.editor.model.pluginData = { ...s3d.editor.model.pluginData, layout: { version: 1, pages: [page], layers } };
s3d.editor.viewer.rig.applyState(perspective.camera, false);

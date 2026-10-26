// Demo model for the LayOut screenshot (npm run screenshots): a small house with four scenes –
// a perspective, two elevations and a top view in parallel projection.
s3d.editor.model.name = 'Gartenhaus';
s3d.material('Putz', '#efe9dc');
s3d.material('Dachziegel', '#9c3b2a');
s3d.material('Holz', '#8a5a33');
s3d.material('Glas', '#9fd3e6', 0.4);

const haus = s3d.group('Haus', () => {
  s3d.rect([0, 0, 0], 8, 6).pushpull(3);
});
haus.material('Putz');
const dach = s3d.group('Dach', () => {
  s3d.face([[-0.3, -0.4, 3], [-0.3, 6.4, 3], [-0.3, 3, 5.2]]).extrude(8.6, 'x');
});
dach.material('Dachziegel');
s3d.box([3.5, -0.05, 0], 1, 0.1, 2.1, { name: 'Tür', material: 'Holz' });
for (const x of [1, 5.8]) s3d.box([x, -0.05, 1], 1.2, 0.1, 1.2, { name: 'Fenster', material: 'Glas' });
for (const y of [1.2, 3.6]) s3d.box([8, y, 1], 0.1, 1.2, 1.2, { name: 'Fenster', material: 'Glas' });
s3d.cylinder([11, 1.5, 0], 0.15, 2.2, { material: 'Holz' });
s3d.sphere([11, 1.5, 2.9], 1);

// the scenes the sheet is made from (camera only – parallel projection for the drawings)
const scene = (name, position, target, ortho) =>
  s3d.editor.model.scenes.push({
    id: 900000 + s3d.editor.model.scenes.length,
    name,
    camera: { position, target, fov: 35, ortho },
  });
scene('Perspektive', [-8, -13, 7.5], [5, 3, 1.8], false);
scene('Ansicht Süd', [5.5, -40, 2.6], [5.5, 3, 2.6], true);
scene('Ansicht Ost', [48, 3, 2.6], [4, 3, 2.6], true);
scene('Draufsicht', [5.5, 2.9999, 40], [5.5, 3, 0], true);
s3d.zoomExtents();

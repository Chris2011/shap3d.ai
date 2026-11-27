// Demo for the woodshop screenshot (npm run screenshots): a small bookcase from 19 mm oak boards, each marked as a board
// with s3d.board(), the back panel in white. The panel shows the cut list; the left side is selected.
s3d.clear();
s3d.editor.model.name = 'Regal';
const t = 0.019;
const [width, depth, height] = [0.8, 0.3, 1.5];
const board = (name, at, w, d, h, options, material = 'Eiche hell') => {
  const group = s3d.box(at, w, d, h).material(material);
  group.inst.name = name;
  s3d.board(group, options);
  return group;
};

const left = board('Seite', [0, 0, 0], t, depth, height, { bandLong: 1 });
board('Seite', [width - t, 0, 0], t, depth, height, { bandLong: 1 });
board('Deckel', [t, 0, height - t], width - 2 * t, depth, t, { bandLong: 1 });
board('Boden', [t, 0, 0.06], width - 2 * t, depth, t, { bandLong: 1 });
for (const z of [0.5, 0.95]) {
  board('Fachboden', [t, 0.01, z], width - 2 * t - 0.002, depth - 0.02, t, { bandLong: 1 });
}
board('Sockel', [t, 0.02, 0], width - 2 * t, t, 0.06, {});
board('Rückwand', [0, depth, 0], width, 0.004, height, {}, 'Holz lackiert weiß');

s3d.editor.select([{ kind: 'instance', id: left.inst.id }]);

# Scripting

## Script editor and the `s3d` API

![Script editor with the API reference](../screenshots/scripts.png)

Write JavaScript or declarative JSON and run it with <kbd>Ctrl</kbd>+<kbd>Enter</kbd>. Every run is a single undo step.

- **Code completion**: suggestions as you type, like in VS Code – after `s3d.` all API calls (including those added by plugins), the methods of returned groups and faces (also through variables such as `const kiste = s3d.box(…); kiste.`), the option keys of a call inside `{ … }`, and values: all materials with a colour swatch (ready-made and those in the model), textures, fonts, axes, views and units like `'50cm'`. In JSON it suggests `"type"` values and the keys that fit the type; plugin languages such as OpenSCAD bring their own keywords. Opens after `.`, quotes, `{`, `,` and while typing, or with <kbd>Ctrl</kbd>+<kbd>Space</kbd>; arrows choose, <kbd>Enter</kbd>/<kbd>Tab</kbd> insert, <kbd>Esc</kbd> closes.
- **API info**: a searchable reference of all 44 commands with signatures, descriptions and runnable examples. Insert an example at the cursor, or try it right away next to your model.
- **Shapes**: box, cylinder, cone, pyramid, prism, sphere, dome, ellipsoid, tube, torus, wedge, stairs, terrain, 3D text and OBJ meshes, plus faces, push/pull, offset and follow me.
- **Materials**: 52 ready-made materials (woods, stone, metals, glass, nature, fabrics, colours) usable by name, e.g. `{ material: 'Glas' }`, and 12 procedural textures.
- **OBJ mode**: paste raw mesh output (e.g. from LLaMA-Mesh) and it is scaled, oriented and placed for you.
- **Objects as code**: right-click an object (or empty space for the whole model) › _Als Code öffnen ▸_ JavaScript, JSON, OBJ or – with the OpenSCAD plugin – OpenSCAD. The geometry is written exactly (`s3d.polyhedron(points, faces)` with holes, materials and nested groups). _Umwandeln in…_ in the script editor translates code between these formats without touching the model; _Umwandeln rückgängig_ brings the previous code back. OBJ keeps no materials or loose edges, OpenSCAD keeps no loose edges and no group structure, and only closed solids survive an OpenSCAD round trip.

## Scripting example

```js
s3d.material('Holz', '#a0703c');
s3d.terrain([-10, -8, 0], 30, 24, { hills: 4, snow: 3.5, water: 0.2 });

const tree = s3d.component('Tree', () => {
  s3d.cylinder([0, 0, 0], 0.15, 2, { material: 'Rinde' });
  s3d.ellipsoid([0, 0, 2.8], 1.2, 1.2, 1.5, { material: 'Laub' });
});
for (let i = 0; i < 6; i++) tree.place([i * 3, -6, 0]);

s3d.group('Bench', () => {
  s3d.box([0, 0, 0.42], 1.6, 0.4, 0.05, { material: 'Holz' });
  for (const x of [0.1, 1.45]) s3d.box([x, 0.05, 0], 0.05, 0.3, 0.42, { material: 'Stahl' });
});
s3d.zoomExtents();
```

Older scripts written with `su.` or `fw.` keep working – both are aliases of `s3d`.

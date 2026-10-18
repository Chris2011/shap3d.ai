// Shap3D.ai example plugin: parts list export and point-list import.
// Shows: a file exporter (Datei › Exportieren) and a file importer for new extensions.

/** @type {import('../types').S3dPlugin} */
export default {
  id: 'parts-list',
  name: 'Stückliste & Punktimport',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'Exportiert alle Gruppen/Komponenten als CSV-Stückliste und importiert Punktlisten (.xyz, .pts) als Hilfspunkte.',

  activate(context) {
    const { editor, THREE } = context;

    // ---------------------------------------------------------------- export: parts list
    const csvCell = value => (/[;"\n]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : String(value));
    const metres = value => value.toFixed(3).replace('.', ',');

    context.files.registerExporter({
      id: 'csv',
      label: 'Stückliste (CSV)',
      mimeType: 'text/csv;charset=utf-8',
      fileName: target => `${target.model.name || 'Modell'}-Stückliste.csv`,
      export: target => {
        // identical parts (same name, type and size) are counted in one row
        const rows = new Map();
        const walk = (entities, matrix) => {
          for (const instance of entities.instances.values()) {
            const world = matrix.clone().multiply(instance.matrix);
            const size = instance.definition.entities.bounds(new THREE.Box3(), world).getSize(new THREE.Vector3());
            const type = instance.definition.isComponent ? 'Komponente' : 'Gruppe';
            const key = [instance.definition.name, type, metres(size.x), metres(size.y), metres(size.z)].join('|');
            const row = rows.get(key) ?? { name: instance.definition.name, type, count: 0, size };
            row.count++;
            rows.set(key, row);
            walk(instance.definition.entities, world);
          }
        };
        walk(target.model.root, new THREE.Matrix4());
        if (!rows.size) throw new Error('Keine Gruppen oder Komponenten im Modell');
        const lines = [['Name', 'Typ', 'Anzahl', 'Breite (m)', 'Tiefe (m)', 'Höhe (m)']];
        for (const row of rows.values()) lines.push([row.name, row.type, row.count, metres(row.size.x), metres(row.size.y), metres(row.size.z)]);
        return '﻿' + lines.map(line => line.map(csvCell).join(';')).join('\r\n');
      },
    });

    // ---------------------------------------------------------------- import: point lists
    context.files.registerImporter({
      extensions: ['xyz', 'pts'],
      label: 'Punktliste',
      import: async file => {
        const points = (await file.text()).split(/\r?\n/)
          .map(line => line.trim().split(/[\s,;]+/).map(Number))
          .filter(values => values.length >= 3 && values.slice(0, 3).every(Number.isFinite))
          .map(([x, y, z]) => new THREE.Vector3(x, y, z));
        if (!points.length) throw new Error('Keine Punkte gefunden (erwartet: x y z pro Zeile)');
        editor.commit(`Punktliste „${file.name}“`, () => {
          for (const point of points) editor.model.guides.push({ id: context.newId(), kind: 'point', point });
        });
        editor.zoomExtents();
        context.ui.toast(`${points.length} Hilfspunkte importiert`);
      },
    });
  },
};

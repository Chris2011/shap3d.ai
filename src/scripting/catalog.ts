import { shallowReactive } from 'vue';
import { t, copyLocalized } from '../i18n';
/**
 * Reference of the `s3d` scripting API – one entry per call, with a runnable example.
 * Used by the API info in the script editor, the plain-text help and the AI system prompt,
 * so keep it in sync with src/scripting/api.ts.
 */
// i18n-ignore-next-line
export type ApiCategory =
  | 'Körper'
  | 'Flächen & Linien'
  | 'Flächen bearbeiten'
  | 'Gruppen & Komponenten'
  | 'Materialien'
  | 'Ansicht & Szene'
  | 'Hilfen'
  | 'Plugins';

export interface ApiEntry {
  id: string;
  category: ApiCategory;
  /** short name shown as title (message key or text) */
  title: string;
  signature: string;
  desc: string;
  /** runnable on its own in an empty model */
  example: string;
  /** what the call returns (shown as a hint) */
  returns?: string;
  /** `returns` untranslated (message key or plugin text) – for code completion */
  returnsKey?: string;
}

// i18n-ignore-next-line
const CATEGORY_KEYS: Record<ApiCategory, string> = {
  Körper: 'solids',
  'Flächen & Linien': 'facesLines',
  'Flächen bearbeiten': 'editFaces',
  'Gruppen & Komponenten': 'groups',
  Materialien: 'materials',
  'Ansicht & Szene': 'viewScene',
  Hilfen: 'helpers',
  Plugins: 'plugins',
};
/** shown name of a category (the category values stay as they are – plugins use them) */
export const categoryLabel = (category: ApiCategory) => t(`api.categories.${CATEGORY_KEYS[category]}`);

// i18n-ignore-next-line
export const API_CATEGORIES: ApiCategory[] = [
  'Körper',
  'Flächen & Linien',
  'Flächen bearbeiten',
  'Gruppen & Komponenten',
  'Materialien',
  'Ansicht & Szene',
  'Hilfen',
  'Plugins',
];

/** title, desc and returns are message keys (`api.<id>.title` …); API_CATALOG reads them in the current language */
// i18n-ignore-start – categories, signatures and examples belong to the s3d API
const ENTRIES: ApiEntry[] = [
  // ---------------------------------------------------------------- solids
  {
    id: 'box',
    category: 'Körper',
    title: 'api.box.title',
    signature: 's3d.box(ecke, breite, tiefe, höhe, { material, name })',
    returns: 'api.returns.gruppe',
    desc: 'api.box.desc',
    example: "s3d.box([0, 0, 0], 1, 0.6, 0.8, { material: 'Eiche hell' });",
  },
  {
    id: 'cylinder',
    category: 'Körper',
    title: 'api.cylinder.title',
    signature: 's3d.cylinder(mitteUnten, radius, höhe, { segments, material })',
    returns: 'api.returns.gruppe',
    desc: 'api.cylinder.desc',
    example: "s3d.cylinder([0, 0, 0], 0.3, 1.2, { material: 'Stahl' });",
  },
  {
    id: 'cylinderBetween',
    category: 'Körper',
    title: 'api.cylinderBetween.title',
    signature: 's3d.cylinderBetween(a, b, radius, { endRadius, segments, material })',
    returns: 'api.returns.gruppe',
    desc: 'api.cylinderBetween.desc',
    example: "s3d.cylinderBetween([0, 0, 0], [1, 0.5, 1.5], 0.05, { endRadius: 0.02, material: 'Holz' });",
  },
  {
    id: 'cone',
    category: 'Körper',
    title: 'api.cone.title',
    signature: 's3d.cone(mitteUnten, radius, höhe, { endRadius, segments, material })',
    returns: 'api.returns.gruppe',
    desc: 'api.cone.desc',
    example:
      "s3d.cone([0, 0, 0], 0.5, 1.2, { material: 'Rot' });\nsu.cone([1.5, 0, 0], 0.4, 0.5, { endRadius: 0.25, material: 'Kupfer' });",
  },
  {
    id: 'pyramid',
    category: 'Körper',
    title: 'api.pyramid.title',
    signature: 's3d.pyramid(mitteUnten, kante, höhe, { sides, material })',
    returns: 'api.returns.gruppe',
    desc: 'api.pyramid.desc',
    example: "s3d.pyramid([0, 0, 0], 1.5, 1, { material: 'Sand' });\nsu.pyramid([2, 0, 0], 1, 1.2, { sides: 6, material: 'Gold' });",
  },
  {
    id: 'prism',
    category: 'Körper',
    title: 'api.prism.title',
    signature: 's3d.prism(mitteUnten, radius, höhe, { sides, material })',
    returns: 'api.returns.gruppe',
    desc: 'api.prism.desc',
    example: "s3d.prism([0, 0, 0], 0.5, 1, { sides: 6, material: 'Glas' });",
  },
  {
    id: 'sphere',
    category: 'Körper',
    title: 'api.sphere.title',
    signature: 's3d.sphere(mitte, radius, { segments, material })',
    returns: 'api.returns.gruppe',
    desc: 'api.sphere.desc',
    example: "s3d.sphere([0, 0, 0.5], 0.5, { material: 'Blau' });",
  },
  {
    id: 'dome',
    category: 'Körper',
    title: 'api.dome.title',
    signature: 's3d.dome(mitteUnten, radius, { segments, material })',
    returns: 'api.returns.gruppe',
    desc: 'api.dome.desc',
    example: "s3d.dome([0, 0, 0], 1, { material: 'Marmor' });",
  },
  {
    id: 'ellipsoid',
    category: 'Körper',
    title: 'api.ellipsoid.title',
    signature: 's3d.ellipsoid(mitte, rx, ry, rz, { segments, material })',
    returns: 'api.returns.gruppe',
    desc: 'api.ellipsoid.desc',
    example: "s3d.ellipsoid([0, 0, 0.3], 0.6, 0.35, 0.3, { material: 'Stoff grau' });",
  },
  {
    id: 'tube',
    category: 'Körper',
    title: 'api.tube.title',
    signature: 's3d.tube(mitteUnten, rAußen, rInnen, höhe, { segments, material })',
    returns: 'api.returns.gruppe',
    desc: 'api.tube.desc',
    example: "s3d.tube([0, 0, 0], 0.5, 0.42, 0.8, { material: 'Edelstahl' });",
  },
  {
    id: 'torus',
    category: 'Körper',
    title: 'api.torus.title',
    signature: 's3d.torus(mitte, ringRadius, rohrRadius, { segments, sides, material })',
    returns: 'api.returns.gruppe',
    desc: 'api.torus.desc',
    example: "s3d.torus([0, 0, 0.2], 0.5, 0.18, { material: 'Gummi' });",
  },
  {
    id: 'wedge',
    category: 'Körper',
    title: 'api.wedge.title',
    signature: 's3d.wedge(ecke, breite, tiefe, höhe, { material })',
    returns: 'api.returns.gruppe',
    desc: 'api.wedge.desc',
    example: "s3d.wedge([0, 0, 0], 2, 1, 0.5, { material: 'Beton' });",
  },
  {
    id: 'stairs',
    category: 'Körper',
    title: 'api.stairs.title',
    signature: 's3d.stairs(ecke, { steps, rise, run, width, material })',
    returns: 'api.returns.gruppe',
    desc: 'api.stairs.desc',
    example: "s3d.stairs([0, 0, 0], { steps: 8, width: 1.2, material: 'Naturstein' });",
  },
  {
    id: 'mesh',
    category: 'Körper',
    title: 'api.mesh.title',
    signature: 's3d.mesh(objText, { at, size, yUp, smooth, material })',
    returns: 'api.returns.gruppe',
    desc: 'api.mesh.desc',
    example:
      "s3d.mesh('v 0 0 0\\nv 1 0 0\\nv 0 0 1\\nv 0 1 0\\nf 1 3 2\\nf 1 2 4\\nf 2 3 4\\nf 1 4 3', { size: 1, yUp: false, material: 'Orange' });",
  },

  // ---------------------------------------------------------------- faces & lines
  {
    id: 'rect',
    category: 'Flächen & Linien',
    title: 'api.rect.title',
    signature: "s3d.rect(ecke, breite, tiefe, ebene='xy')",
    returns: 'api.returns.flaeche',
    desc: 'api.rect.desc',
    example: 's3d.rect([0, 0, 0], 2, 1).pushpull(0.3);',
  },
  {
    id: 'circle',
    category: 'Flächen & Linien',
    title: 'api.circle.title',
    signature: 's3d.circle(mitte, radius, { segments, normal })',
    returns: 'api.returns.flaeche',
    desc: 'api.circle.desc',
    example: 's3d.circle([0, 0, 0], 0.5).pushpull(0.1);',
  },
  {
    id: 'polygon',
    category: 'Flächen & Linien',
    title: 'api.polygon.title',
    signature: 's3d.polygon(mitte, radius, seiten=6, normal)',
    returns: 'api.returns.flaeche',
    desc: 'api.polygon.desc',
    example: 's3d.polygon([0, 0, 0], 0.6, 8).pushpull(0.2);',
  },
  {
    id: 'face',
    category: 'Flächen & Linien',
    title: 'api.face.title',
    signature: 's3d.face([[x,y,z], …])',
    returns: 'api.returns.flaeche',
    desc: 'api.face.desc',
    example: 's3d.face([[0, 0, 0], [2, 0, 0], [2, 1, 0], [1, 1.6, 0], [0, 1, 0]]).pushpull(0.2);',
  },
  {
    id: 'polyhedron',
    category: 'Flächen & Linien',
    title: 'api.polyhedron.title',
    signature: 's3d.polyhedron(punkte, flächen, { material })',
    returns: 'api.returns.anzahlFlaechen',
    desc: 'api.polyhedron.desc',
    example:
      's3d.polyhedron([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0.5, 0.5, 0.8]], [[3, 2, 1, 0], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]]);',
  },
  {
    id: 'line',
    category: 'Flächen & Linien',
    title: 'api.line.title',
    signature: 's3d.line(a, b)   s3d.polyline(punkte, geschlossen)',
    desc: 'api.line.desc',
    example: 's3d.polyline([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], true);',
  },
  {
    id: 'arc',
    category: 'Flächen & Linien',
    title: 'api.arc.title',
    signature: 's3d.arc(mitte, radius, startGrad, endGrad, segments, normal)',
    returns: 'api.returns.punkte',
    desc: 'api.arc.desc',
    example: 's3d.arc([0, 0, 0], 1, 0, 180, 16);',
  },

  // ---------------------------------------------------------------- editing faces
  {
    id: 'pushpull',
    category: 'Flächen bearbeiten',
    title: 'api.pushpull.title',
    signature: 'fläche.pushpull(abstand)',
    returns: 'api.returns.deckflaeche',
    desc: 'api.pushpull.desc',
    example: 'const top = s3d.rect([0, 0, 0], 1, 1).pushpull(1);\ntop.pushpull(0.5);',
  },
  {
    id: 'extrude',
    category: 'Flächen bearbeiten',
    title: 'api.extrude.title',
    signature: 'fläche.extrude(abstand, richtung)',
    returns: 'api.returns.deckflaeche',
    desc: 'api.extrude.desc',
    example: "s3d.rect([0, 0, 0], 1, 1, 'xz').extrude(2, 'y');",
  },
  {
    id: 'offset',
    category: 'Flächen bearbeiten',
    title: 'api.offset.title',
    signature: 'fläche.offset(abstand)',
    desc: 'api.offset.desc',
    example: "const f = s3d.rect([0, 0, 0], 2, 1.5, 'xz');\nf.offset(0.15);",
  },
  {
    id: 'followMe',
    category: 'Flächen bearbeiten',
    title: 'api.followMe.title',
    signature: 'fläche.followMe(pfadPunkte, geschlossen)',
    desc: 'api.followMe.desc',
    example: "const pfad = [[0, 0, 0], [2, 0, 0], [2, 2, 0]];\nsu.circle([0, 0, 0], 0.1, { normal: 'x' }).followMe(pfad);",
  },
  {
    id: 'faceMaterial',
    category: 'Flächen bearbeiten',
    title: 'api.faceMaterial.title',
    signature: 'fläche.material(name)   fläche.backMaterial(name)   fläche.reverse()',
    desc: 'api.faceMaterial.desc',
    example: "s3d.rect([0, 0, 0], 1, 1).material('Gras');",
  },

  // ---------------------------------------------------------------- groups & components
  {
    id: 'group',
    category: 'Gruppen & Komponenten',
    title: 'api.group.title',
    signature: 's3d.group(name, () => { … })',
    returns: 'api.returns.gruppe',
    desc: 'api.group.desc',
    example:
      "const tisch = s3d.group('Tisch', () => {\n  s3d.box([0, 0, 0.72], 1.4, 0.8, 0.04, { material: 'Holz' });\n  for (const [x, y] of [[0.05, 0.05], [1.3, 0.05], [0.05, 0.7], [1.3, 0.7]]) s3d.box([x, y, 0], 0.05, 0.05, 0.72, { material: 'Holz' });\n});",
  },
  {
    id: 'component',
    category: 'Gruppen & Komponenten',
    title: 'api.component.title',
    signature: 's3d.component(name, () => { … }).place(ort, drehGrad, skalierung)',
    returns: 'api.returns.Place',
    desc: 'api.component.desc',
    example:
      "const pfosten = s3d.component('Pfosten', () => s3d.box([-0.05, -0.05, 0], 0.1, 0.1, 1, { material: 'Kiefer' }));\nfor (let i = 0; i < 6; i++) pfosten.place([i * 0.6, 0, 0]);",
  },
  {
    id: 'transform',
    category: 'Gruppen & Komponenten',
    title: 'api.transform.title',
    signature: 'g.move([dx,dy,dz])  g.moveTo([x,y,z])  g.rotate(grad, achse, zentrum)  g.scale(f)',
    desc: 'api.transform.desc',
    example: "s3d.box([0, 0, 0], 1, 0.2, 2, { material: 'Ziegel' }).rotate(30).move([0.5, 0, 0]);",
  },
  {
    id: 'copy',
    category: 'Gruppen & Komponenten',
    title: 'api.copy.title',
    signature: 'g.copy([dx,dy,dz])  g.material(name)  g.tag(name)  g.hide()  g.explode()',
    desc: 'api.copy.desc',
    example: "const s = s3d.sphere([0, 0, 0.3], 0.3, { material: 'Gelb' });\ns.copy([1, 0, 0]).material('Grün');",
  },

  // ---------------------------------------------------------------- materials
  {
    id: 'useMaterial',
    category: 'Materialien',
    title: 'api.useMaterial.title',
    signature: "{ material: 'Glas' }",
    desc: 'api.useMaterial.desc',
    example: "s3d.box([0, 0, 0], 1, 1, 1, { material: 'Glas' });\nsu.box([1.5, 0, 0], 1, 1, 1, { material: 'Nussbaum' });",
  },
  {
    id: 'material',
    category: 'Materialien',
    title: 'api.material.title',
    signature: "s3d.material(name, '#rrggbb', { opacity, texture, size })",
    desc: 'api.material.desc',
    example:
      "s3d.material('Mein Rot', '#c0392b', { texture: 'ziegel', size: 0.6 });\nsu.box([0, 0, 0], 2, 0.3, 1.2, { material: 'Mein Rot' });",
  },
  {
    id: 'materials',
    category: 'Materialien',
    title: 'api.materials.title',
    signature: 's3d.materials(kategorie?)   s3d.textures()',
    returns: 'api.returns.namen',
    desc: 'api.materials.desc',
    example: "s3d.log(s3d.materials('Metall'));\nsu.log(s3d.textures());",
  },

  // ---------------------------------------------------------------- view & scene
  {
    id: 'view',
    category: 'Ansicht & Szene',
    title: 'api.view.title',
    signature: "s3d.view('iso'|'top'|'front'|'back'|'left'|'right')   s3d.zoomExtents()",
    desc: 'api.view.desc',
    example: "s3d.box([0, 0, 0], 1, 1, 1);\nsu.view('top');\nsu.zoomExtents();",
  },
  {
    id: 'camera',
    category: 'Ansicht & Szene',
    title: 'api.camera.title',
    signature: 's3d.camera(position, ziel, fov?)',
    desc: 'api.camera.desc',
    example: 's3d.box([0, 0, 0], 1, 1, 1);\nsu.camera([4, -4, 3], [0.5, 0.5, 0.5]);',
  },
  {
    id: 'shadows',
    category: 'Ansicht & Szene',
    title: 'api.shadows.title',
    signature: 's3d.shadows(an, stunde)   s3d.style({ faceStyle, xray, edges })',
    desc: 'api.shadows.desc',
    example: 's3d.box([0, 0, 0], 1, 1, 2);\nsu.shadows(true, 15);',
  },
  {
    id: 'annot',
    category: 'Ansicht & Szene',
    title: 'api.annot.title',
    signature: 's3d.dimension(a, b, versatz)   s3d.label(punkt, text)   s3d.guide(punkt, richtung)',
    desc: 'api.annot.desc',
    example: "s3d.box([0, 0, 0], 2, 1, 1);\nsu.dimension([0, 0, 0], [2, 0, 0], [0, -0.4, 0]);\nsu.label([2, 1, 1], 'Kiste');",
  },
  {
    id: 'tag',
    category: 'Ansicht & Szene',
    title: 'api.tag.title',
    signature: 's3d.tag(name, sichtbar)   g.tag(name)',
    desc: 'api.tag.desc',
    example: "s3d.tag('Möbel', true);\nsu.box([0, 0, 0], 1, 1, 0.5).tag('Möbel');",
  },
  {
    id: 'clear',
    category: 'Ansicht & Szene',
    title: 'api.clear.title',
    signature: 's3d.clear()',
    desc: 'api.clear.desc',
    example: 's3d.clear();',
  },

  // ---------------------------------------------------------------- helpers
  {
    id: 'units',
    category: 'Hilfen',
    title: 'api.units.title',
    signature: "Zahlen = Meter   '50cm'  '1200mm'  s3d.centimeters(x)  s3d.millimeters(x)  s3d.degrees(grad)",
    desc: 'api.units.desc',
    example: "s3d.box([0, 0, 0], '80cm', '40cm', s3d.centimeters(120), { material: 'Weiß' });",
  },
  {
    id: 'points',
    category: 'Hilfen',
    title: 'api.points.title',
    signature: '[x, y, z]   X = rot, Y = grün, Z = blau (oben)',
    desc: 'api.points.desc',
    example: "s3d.sphere([1, 2, 0.2], 0.2, { material: 'Rot' });",
  },
  {
    id: 'random',
    category: 'Hilfen',
    title: 'api.random.title',
    signature: 's3d.random(min, max)   for (…) { … }   Math.sin / Math.cos',
    desc: 'api.random.desc',
    example:
      "for (let i = 0; i < 12; i++) {\n  const a = i / 12 * Math.PI * 2;\n  s3d.cylinder([Math.cos(a) * 3, Math.sin(a) * 3, 0], 0.2, s3d.random(1, 3), { material: 'Beton' });\n}",
  },
  {
    id: 'log',
    category: 'Hilfen',
    title: 'api.log.title',
    signature: 's3d.log(…)   console.log(…)   s3d.stats()',
    desc: 'api.log.desc',
    example: "s3d.box([0, 0, 0], 1, 1, 1);\nsu.log('Flächen:', s3d.stats().faces);",
  },
];
// i18n-ignore-end

/** reactive: plugins add their s3d extensions here (category "Plugins") */
export const API_CATALOG = shallowReactive<ApiEntry[]>(
  ENTRIES.map((entry) => copyLocalized(Object.assign(entry, { returnsKey: entry.returns }), entry, ['title', 'desc', 'returns'])),
);

/** Plain-text version (one line per call) – for the AI prompt and as fallback help. */
export const catalogText = (cats: ApiCategory[] = API_CATEGORIES): string => {
  return cats
    .filter((category) => API_CATALOG.some((entry) => entry.category === category))
    .map(
      (category) =>
        `## ${categoryLabel(category)}\n` +
        API_CATALOG.filter((entry) => entry.category === category)
          .map((entry) => `- ${entry.signature}${entry.returns ? ` → ${entry.returns}` : ''} – ${entry.desc}`)
          .join('\n'),
    )
    .join('\n\n');
};

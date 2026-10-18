/**
 * Reference of the `s3d` scripting API – one entry per call, with a runnable example.
 * Used by the API info in the script editor, the plain-text help and the AI system prompt,
 * so keep it in sync with src/scripting/api.ts.
 */
export type ApiCategory = 'Körper' | 'Flächen & Linien' | 'Flächen bearbeiten' | 'Gruppen & Komponenten' | 'Materialien' | 'Ansicht & Szene' | 'Hilfen';

export interface ApiEntry {
  id: string;
  category: ApiCategory;
  /** short German name shown as title */
  title: string;
  signature: string;
  desc: string;
  /** runnable on its own in an empty model */
  example: string;
  /** what the call returns (shown as a hint) */
  returns?: string;
}

export const API_CATEGORIES: ApiCategory[] = ['Körper', 'Flächen & Linien', 'Flächen bearbeiten', 'Gruppen & Komponenten', 'Materialien', 'Ansicht & Szene', 'Hilfen'];

export const API_CATALOG: ApiEntry[] = [
  // ---------------------------------------------------------------- solids
  { id: 'box', category: 'Körper', title: 'Quader', signature: "s3d.box(ecke, breite, tiefe, höhe, { material, name })", returns: 'Gruppe',
    desc: 'Quader ab der linken vorderen unteren Ecke. Breite = X, Tiefe = Y, Höhe = Z.',
    example: "s3d.box([0, 0, 0], 1, 0.6, 0.8, { material: 'Eiche hell' });" },
  { id: 'cylinder', category: 'Körper', title: 'Zylinder', signature: "s3d.cylinder(mitteUnten, radius, höhe, { segments, material })", returns: 'Gruppe',
    desc: 'Senkrechter Zylinder, der auf seinem Mittelpunkt steht. segments = Anzahl Seiten (Standard 24).',
    example: "s3d.cylinder([0, 0, 0], 0.3, 1.2, { material: 'Stahl' });" },
  { id: 'cylinderBetween', category: 'Körper', title: 'Stange von A nach B', signature: "s3d.cylinderBetween(a, b, radius, { endRadius, segments, material })", returns: 'Gruppe',
    desc: 'Zylinder oder Kegel zwischen zwei beliebigen Punkten – ideal für Beine, Äste, Rohre, Geländer. endRadius = Radius am Ende (0 = Spitze).',
    example: "s3d.cylinderBetween([0, 0, 0], [1, 0.5, 1.5], 0.05, { endRadius: 0.02, material: 'Holz' });" },
  { id: 'cone', category: 'Körper', title: 'Kegel', signature: "s3d.cone(mitteUnten, radius, höhe, { endRadius, segments, material })", returns: 'Gruppe',
    desc: 'Kegel mit Spitze oben. Mit endRadius > 0 ein Kegelstumpf (Lampenschirm, Eimer, Blumentopf).',
    example: "s3d.cone([0, 0, 0], 0.5, 1.2, { material: 'Rot' });\nsu.cone([1.5, 0, 0], 0.4, 0.5, { endRadius: 0.25, material: 'Kupfer' });" },
  { id: 'pyramid', category: 'Körper', title: 'Pyramide', signature: "s3d.pyramid(mitteUnten, kante, höhe, { sides, material })", returns: 'Gruppe',
    desc: 'Pyramide mit quadratischer (sides 4) oder n-eckiger Grundfläche. kante = Länge einer Grundkante.',
    example: "s3d.pyramid([0, 0, 0], 1.5, 1, { material: 'Sand' });\nsu.pyramid([2, 0, 0], 1, 1.2, { sides: 6, material: 'Gold' });" },
  { id: 'prism', category: 'Körper', title: 'Prisma', signature: "s3d.prism(mitteUnten, radius, höhe, { sides, material })", returns: 'Gruppe',
    desc: 'Senkrechtes Prisma mit regelmäßiger n-eckiger Grundfläche (Standard 6 = Sechseck).',
    example: "s3d.prism([0, 0, 0], 0.5, 1, { sides: 6, material: 'Glas' });" },
  { id: 'sphere', category: 'Körper', title: 'Kugel', signature: "s3d.sphere(mitte, radius, { segments, material })", returns: 'Gruppe',
    desc: 'Kugel um einen Mittelpunkt mit geglätteten Kanten.',
    example: "s3d.sphere([0, 0, 0.5], 0.5, { material: 'Blau' });" },
  { id: 'dome', category: 'Körper', title: 'Kuppel (Halbkugel)', signature: "s3d.dome(mitteUnten, radius, { segments, material })", returns: 'Gruppe',
    desc: 'Halbkugel mit flachem Boden – Kuppeln, Lampen, Iglus.',
    example: "s3d.dome([0, 0, 0], 1, { material: 'Marmor' });" },
  { id: 'ellipsoid', category: 'Körper', title: 'Ellipsoid', signature: "s3d.ellipsoid(mitte, rx, ry, rz, { segments, material })", returns: 'Gruppe',
    desc: 'Gestreckte Kugel mit drei Radien – Körper, Köpfe, Kissen, Blätter, Steine.',
    example: "s3d.ellipsoid([0, 0, 0.3], 0.6, 0.35, 0.3, { material: 'Stoff grau' });" },
  { id: 'tube', category: 'Körper', title: 'Rohr / Ring', signature: "s3d.tube(mitteUnten, rAußen, rInnen, höhe, { segments, material })", returns: 'Gruppe',
    desc: 'Hohlzylinder – Rohre, Becher, Ringe, Brunnen.',
    example: "s3d.tube([0, 0, 0], 0.5, 0.42, 0.8, { material: 'Edelstahl' });" },
  { id: 'torus', category: 'Körper', title: 'Torus (Donut)', signature: "s3d.torus(mitte, ringRadius, rohrRadius, { segments, sides, material })", returns: 'Gruppe',
    desc: 'Liegender Ring – Reifen, Rettungsring, Donut, Griff.',
    example: "s3d.torus([0, 0, 0.2], 0.5, 0.18, { material: 'Gummi' });" },
  { id: 'wedge', category: 'Körper', title: 'Keil / Rampe', signature: "s3d.wedge(ecke, breite, tiefe, höhe, { material })", returns: 'Gruppe',
    desc: 'Rampe, die entlang +X bis zur Höhe ansteigt – Rampen, Pultdächer, Keile.',
    example: "s3d.wedge([0, 0, 0], 2, 1, 0.5, { material: 'Beton' });" },
  { id: 'stairs', category: 'Körper', title: 'Treppe', signature: "s3d.stairs(ecke, { steps, rise, run, width, material })", returns: 'Gruppe',
    desc: 'Gerade Treppe entlang +X. Standard: 10 Stufen, 17,5 cm hoch, 28 cm tief, 1 m breit.',
    example: "s3d.stairs([0, 0, 0], { steps: 8, width: 1.2, material: 'Naturstein' });" },
  { id: 'terrain', category: 'Körper', title: 'Gelände (Landschaft)', signature: "s3d.terrain(ecke, breite, tiefe, { hills, scale, seed, rock, snow, water, skirt })", returns: 'Gruppe',
    desc: 'Landschaft mit Hügeln und Bergen. Gras auf Ebenen, Erde an Hängen, Fels oben, optional Schnee und Wasser. hills = Berghöhe (0 = flach). Danach mit dem Gelände-Werkzeug weiter formbar.',
    example: "s3d.terrain([0, 0, 0], 30, 20, { hills: 5, snow: 4.5, water: 0.4, seed: 3 });" },
  { id: 'text3d', category: 'Körper', title: '3D-Text', signature: "s3d.text3d(text, { at, size, depth, upright, font, material })", returns: 'Gruppe',
    desc: "Extrudierter Schriftzug. upright: true = stehend, false = liegend. font: 'helvetiker' | 'helvetiker_bold' | 'optimer'.",
    example: "s3d.text3d('Hallo', { at: [0, 0, 0], size: 0.5, depth: 0.1, material: 'Gold' });" },
  { id: 'mesh', category: 'Körper', title: 'Mesh aus OBJ-Text', signature: "s3d.mesh(objText, { at, size, yUp, smooth, material })", returns: 'Gruppe',
    desc: 'Dreiecksnetz aus „v x y z“- und „f a b c“-Zeilen (z. B. LLaMA-Mesh). size = größte Seite.',
    example: "s3d.mesh('v 0 0 0\\nv 1 0 0\\nv 0 0 1\\nv 0 1 0\\nf 1 3 2\\nf 1 2 4\\nf 2 3 4\\nf 1 4 3', { size: 1, yUp: false, material: 'Orange' });" },

  // ---------------------------------------------------------------- faces & lines
  { id: 'rect', category: 'Flächen & Linien', title: 'Rechteck', signature: "s3d.rect(ecke, breite, tiefe, ebene='xy')", returns: 'Fläche',
    desc: "Rechteckige Fläche. ebene 'xy' = liegend, 'xz' / 'yz' = stehend. Danach z. B. .pushpull(höhe).",
    example: "s3d.rect([0, 0, 0], 2, 1).pushpull(0.3);" },
  { id: 'circle', category: 'Flächen & Linien', title: 'Kreis', signature: "s3d.circle(mitte, radius, { segments, normal })", returns: 'Fläche',
    desc: "Kreisfläche. normal = Richtung, in die die Fläche zeigt ('z', 'x', 'y' oder Vektor).",
    example: "s3d.circle([0, 0, 0], 0.5).pushpull(0.1);" },
  { id: 'polygon', category: 'Flächen & Linien', title: 'Vieleck', signature: "s3d.polygon(mitte, radius, seiten=6, normal)", returns: 'Fläche',
    desc: 'Regelmäßiges Vieleck (Dreieck, Sechseck, Achteck …).',
    example: "s3d.polygon([0, 0, 0], 0.6, 8).pushpull(0.2);" },
  { id: 'face', category: 'Flächen & Linien', title: 'Fläche aus Punkten', signature: "s3d.face([[x,y,z], …])", returns: 'Fläche',
    desc: 'Beliebige ebene Fläche aus mindestens 3 Punkten, die in einer Ebene liegen.',
    example: "s3d.face([[0, 0, 0], [2, 0, 0], [2, 1, 0], [1, 1.6, 0], [0, 1, 0]]).pushpull(0.2);" },
  { id: 'line', category: 'Flächen & Linien', title: 'Linie / Linienzug', signature: "s3d.line(a, b)   s3d.polyline(punkte, geschlossen)",
    desc: 'Kanten ohne Dicke. Ein geschlossener, ebener Linienzug bildet automatisch eine Fläche.',
    example: "s3d.polyline([[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]], true);" },
  { id: 'arc', category: 'Flächen & Linien', title: 'Bogen', signature: "s3d.arc(mitte, radius, startGrad, endGrad, segments, normal)", returns: 'Punkte',
    desc: 'Kreisbogen als Kanten. Gibt die Punkte zurück – praktisch als Pfad für followMe.',
    example: "s3d.arc([0, 0, 0], 1, 0, 180, 16);" },

  // ---------------------------------------------------------------- editing faces
  { id: 'pushpull', category: 'Flächen bearbeiten', title: 'Drücken/Ziehen', signature: "fläche.pushpull(abstand)", returns: 'Deckfläche',
    desc: 'Zieht eine Fläche zu einem Körper. Bei liegenden Flächen ist ein positiver Wert immer nach oben.',
    example: "const top = s3d.rect([0, 0, 0], 1, 1).pushpull(1);\ntop.pushpull(0.5);" },
  { id: 'extrude', category: 'Flächen bearbeiten', title: 'Extrudieren', signature: "fläche.extrude(abstand, richtung)", returns: 'Deckfläche',
    desc: "Wie pushpull, aber in eine feste Richtung: 'x', 'y', 'z', '-x', '-y', '-z' oder Vektor.",
    example: "s3d.rect([0, 0, 0], 1, 1, 'xz').extrude(2, 'y');" },
  { id: 'offset', category: 'Flächen bearbeiten', title: 'Versatz', signature: "fläche.offset(abstand)",
    desc: 'Zeichnet eine innere Kontur in die Fläche – für Rahmen, Fenster, Ränder.',
    example: "const f = s3d.rect([0, 0, 0], 2, 1.5, 'xz');\nf.offset(0.15);" },
  { id: 'followMe', category: 'Flächen bearbeiten', title: 'Folge mir', signature: "fläche.followMe(pfadPunkte, geschlossen)",
    desc: 'Führt ein Profil entlang eines Pfades – Rohre, Gesimse, Rahmen, Drehkörper.',
    example: "const pfad = [[0, 0, 0], [2, 0, 0], [2, 2, 0]];\nsu.circle([0, 0, 0], 0.1, { normal: 'x' }).followMe(pfad);" },
  { id: 'faceMaterial', category: 'Flächen bearbeiten', title: 'Fläche färben', signature: "fläche.material(name)   fläche.backMaterial(name)   fläche.reverse()",
    desc: 'Material für Vorder- bzw. Rückseite einer einzelnen Fläche setzen; reverse() dreht die Fläche um.',
    example: "s3d.rect([0, 0, 0], 1, 1).material('Gras');" },

  // ---------------------------------------------------------------- groups & components
  { id: 'group', category: 'Gruppen & Komponenten', title: 'Gruppe', signature: "s3d.group(name, () => { … })", returns: 'Gruppe',
    desc: 'Alles, was im Callback entsteht, wird zu einer Gruppe zusammengefasst.',
    example: "const tisch = s3d.group('Tisch', () => {\n  s3d.box([0, 0, 0.72], 1.4, 0.8, 0.04, { material: 'Holz' });\n  for (const [x, y] of [[0.05, 0.05], [1.3, 0.05], [0.05, 0.7], [1.3, 0.7]]) s3d.box([x, y, 0], 0.05, 0.05, 0.72, { material: 'Holz' });\n});" },
  { id: 'component', category: 'Gruppen & Komponenten', title: 'Komponente', signature: "s3d.component(name, () => { … }).place(ort, drehGrad, skalierung)", returns: '{ place }',
    desc: 'Wiederverwendbare Definition – einmal bauen, beliebig oft platzieren. Änderungen wirken auf alle Kopien.',
    example: "const pfosten = s3d.component('Pfosten', () => s3d.box([-0.05, -0.05, 0], 0.1, 0.1, 1, { material: 'Kiefer' }));\nfor (let i = 0; i < 6; i++) pfosten.place([i * 0.6, 0, 0]);" },
  { id: 'transform', category: 'Gruppen & Komponenten', title: 'Verschieben, Drehen, Skalieren', signature: "g.move([dx,dy,dz])  g.moveTo([x,y,z])  g.rotate(grad, achse, zentrum)  g.scale(f)",
    desc: 'Alle Körper-Funktionen geben eine Gruppe zurück, die man so verändern kann (verkettbar).',
    example: "s3d.box([0, 0, 0], 1, 0.2, 2, { material: 'Ziegel' }).rotate(30).move([0.5, 0, 0]);" },
  { id: 'copy', category: 'Gruppen & Komponenten', title: 'Kopieren & Weiteres', signature: "g.copy([dx,dy,dz])  g.material(name)  g.tag(name)  g.hide()  g.explode()",
    desc: 'Kopie mit Versatz; Material für die ganze Gruppe; Tag zuweisen; ausblenden; in lose Geometrie auflösen.',
    example: "const s = s3d.sphere([0, 0, 0.3], 0.3, { material: 'Gelb' });\ns.copy([1, 0, 0]).material('Grün');" },

  // ---------------------------------------------------------------- materials
  { id: 'useMaterial', category: 'Materialien', title: 'Fertiges Material verwenden', signature: "{ material: 'Glas' }",
    desc: 'Alle Materialien aus der Liste unten funktionieren direkt über ihren Namen – ohne sie vorher anzulegen.',
    example: "s3d.box([0, 0, 0], 1, 1, 1, { material: 'Glas' });\nsu.box([1.5, 0, 0], 1, 1, 1, { material: 'Nussbaum' });" },
  { id: 'material', category: 'Materialien', title: 'Eigenes Material', signature: "s3d.material(name, '#rrggbb', { opacity, texture, size })",
    desc: 'Definiert ein Material oder ändert ein vorhandenes. texture = eine der Texturen unten, size = Kachelgröße in Metern.',
    example: "s3d.material('Mein Rot', '#c0392b', { texture: 'ziegel', size: 0.6 });\nsu.box([0, 0, 0], 2, 0.3, 1.2, { material: 'Mein Rot' });" },
  { id: 'materials', category: 'Materialien', title: 'Materialien auflisten', signature: "s3d.materials(kategorie?)   s3d.textures()", returns: 'Namen',
    desc: "Namen der fertigen Materialien (optional nur eine Kategorie, z. B. 'Metall') bzw. der Texturen.",
    example: "s3d.log(s3d.materials('Metall'));\nsu.log(s3d.textures());" },

  // ---------------------------------------------------------------- view & scene
  { id: 'view', category: 'Ansicht & Szene', title: 'Ansicht', signature: "s3d.view('iso'|'top'|'front'|'back'|'left'|'right')   s3d.zoomExtents()",
    desc: 'Standardansicht wählen und auf alles zoomen (wird nach dem Skript ausgeführt).',
    example: "s3d.box([0, 0, 0], 1, 1, 1);\nsu.view('top');\nsu.zoomExtents();" },
  { id: 'camera', category: 'Ansicht & Szene', title: 'Kamera', signature: "s3d.camera(position, ziel, fov?)",
    desc: 'Kamera an eine Position setzen und auf ein Ziel ausrichten.',
    example: "s3d.box([0, 0, 0], 1, 1, 1);\nsu.camera([4, -4, 3], [0.5, 0.5, 0.5]);" },
  { id: 'shadows', category: 'Ansicht & Szene', title: 'Schatten & Stil', signature: "s3d.shadows(an, stunde)   s3d.style({ faceStyle, xray, edges })",
    desc: "Schatten an/aus mit Uhrzeit; Darstellung ändern – faceStyle: 'textured' | 'shaded' | 'monochrome' | 'hiddenline' | 'wireframe', xray: true = Röntgen.",
    example: "s3d.box([0, 0, 0], 1, 1, 2);\nsu.shadows(true, 15);" },
  { id: 'annot', category: 'Ansicht & Szene', title: 'Bemaßung, Text, Hilfslinie', signature: "s3d.dimension(a, b, versatz)   s3d.label(punkt, text)   s3d.guide(punkt, richtung)",
    desc: 'Maßlinie zwischen zwei Punkten, Beschriftung mit Pfeil, Hilfslinie oder Hilfspunkt.',
    example: "s3d.box([0, 0, 0], 2, 1, 1);\nsu.dimension([0, 0, 0], [2, 0, 0], [0, -0.4, 0]);\nsu.label([2, 1, 1], 'Kiste');" },
  { id: 'tag', category: 'Ansicht & Szene', title: 'Tags', signature: "s3d.tag(name, sichtbar)   g.tag(name)",
    desc: 'Tag (Ebene) anlegen/ein- und ausblenden und Gruppen zuweisen.',
    example: "s3d.tag('Möbel', true);\nsu.box([0, 0, 0], 1, 1, 0.5).tag('Möbel');" },
  { id: 'clear', category: 'Ansicht & Szene', title: 'Alles löschen', signature: "s3d.clear()",
    desc: 'Leert das Modell (bzw. die aktuelle Gruppe). Wie alles im Skript per Strg+Z rückgängig zu machen.',
    example: "s3d.clear();" },

  // ---------------------------------------------------------------- helpers
  { id: 'units', category: 'Hilfen', title: 'Längen & Einheiten', signature: "Zahlen = Meter   '50cm'  '1200mm'  s3d.centimeters(x)  s3d.millimeters(x)  s3d.degrees(grad)",
    desc: 'Alle Zahlen sind Meter. Überall, wo eine Länge erwartet wird, gehen auch Strings mit Einheit.',
    example: "s3d.box([0, 0, 0], '80cm', '40cm', s3d.centimeters(120), { material: 'Weiß' });" },
  { id: 'points', category: 'Hilfen', title: 'Punkte & Achsen', signature: "[x, y, z]   X = rot, Y = grün, Z = blau (oben)",
    desc: 'Punkte sind Arrays. Der Boden liegt bei z = 0.',
    example: "s3d.sphere([1, 2, 0.2], 0.2, { material: 'Rot' });" },
  { id: 'random', category: 'Hilfen', title: 'Zufall & Schleifen', signature: "s3d.random(min, max)   for (…) { … }   Math.sin / Math.cos",
    desc: 'Normales JavaScript – Schleifen, Variablen und Mathe sind erlaubt.',
    example: "for (let i = 0; i < 12; i++) {\n  const a = i / 12 * Math.PI * 2;\n  s3d.cylinder([Math.cos(a) * 3, Math.sin(a) * 3, 0], 0.2, s3d.random(1, 3), { material: 'Beton' });\n}" },
  { id: 'log', category: 'Hilfen', title: 'Ausgabe', signature: "s3d.log(…)   console.log(…)   s3d.stats()",
    desc: 'Schreibt in die Konsole unter dem Editor. s3d.stats() liefert Anzahl Flächen/Kanten.',
    example: "s3d.box([0, 0, 0], 1, 1, 1);\nsu.log('Flächen:', s3d.stats().faces);" },
];

/** Plain-text version (one line per call) – for the AI prompt and as fallback help. */
export const catalogText = (cats: ApiCategory[] = API_CATEGORIES): string => {
  return cats.map(category => `## ${category}\n` + API_CATALOG.filter(entry => entry.category === category).map(entry => `- ${entry.signature}${entry.returns ? ` → ${entry.returns}` : ''} – ${entry.desc}`).join('\n')).join('\n\n');
};

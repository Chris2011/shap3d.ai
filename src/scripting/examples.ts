import { catalogText } from './catalog';
export interface ScriptExample { id: string; name: string; lang: 'js' | 'json' | 'obj'; description: string; code: string }

export const EXAMPLES: ScriptExample[] = [
  {
    id: 'house', name: 'Haus mit Satteldach', lang: 'js', description: 'Quader + Dachprisma, Tür und Fenster als Gruppen.',
    code: `// Einfaches Haus: 8 m × 6 m, 3 m Wandhöhe, Satteldach
s3d.material('Putz', '#efe9dc');
s3d.material('Dachziegel', '#9c3b2a');
s3d.material('Holz', '#8a5a33');
s3d.material('Glas', '#9fd3e6', 0.4);

const haus = s3d.group('Haus', () => {
  const boden = s3d.rect([0, 0, 0], 8, 6);     // Rechteck auf dem Boden
  boden.pushpull(3);                           // 3 m nach oben ziehen
});
haus.material('Putz');

// Dach: Giebeldreieck in der YZ-Ebene, dann 8 m entlang X extrudieren
const dach = s3d.group('Dach', () => {
  const giebel = s3d.face([[-0.3, -0.4, 3], [-0.3, 6.4, 3], [-0.3, 3, 5.2]]);
  giebel.extrude(8.6, 'x');
});
dach.material('Dachziegel');

// Tür und Fenster an der Vorderseite (y = 0)
s3d.box([3.5, -0.05, 0], 1, 0.1, 2.1, { name: 'Tür', material: 'Holz' });
for (const x of [1, 5.8]) s3d.box([x, -0.05, 1], 1.2, 0.1, 1.2, { name: 'Fenster', material: 'Glas' });

s3d.view('iso');
s3d.zoomExtents();
`,
  },
  {
    id: 'stairs', name: 'Treppe (Schleife)', lang: 'js', description: 'Stufen per for-Schleife, Maße als Variablen.',
    code: `// Gerade Treppe: Profil per Schleife berechnen, dann seitlich extrudieren
const stufen = 12;
const steigung = s3d.centimeters(17.5);   // Höhe je Stufe
const auftritt = s3d.centimeters(28);     // Tiefe je Stufe
const breite = 1.1;

s3d.material('Eiche', '#c19a6b');
s3d.group('Treppe', () => {
  // Treppenprofil in der YZ-Ebene (x = 0)
  const p = [[0, 0, 0]];
  for (let i = 0; i < stufen; i++) {
    p.push([0, i * auftritt, (i + 1) * steigung]);
    p.push([0, (i + 1) * auftritt, (i + 1) * steigung]);
  }
  p.push([0, stufen * auftritt, 0]);
  s3d.face(p).extrude(breite, 'x');
}).material('Eiche');

s3d.log('Gesamthöhe:', (stufen * steigung).toFixed(2), 'm,', 'Lauflänge:', (stufen * auftritt).toFixed(2), 'm');
s3d.zoomExtents();
`,
  },
  {
    id: 'spiral', name: 'Wendeltreppe (Drehen)', lang: 'js', description: 'Komponente einmal definieren, dann gedreht platzieren.',
    code: `// Wendeltreppe aus einer Stufen-Komponente
const n = 20, h = 0.18, winkel = 18;

const stufe = s3d.component('Stufe', () => {
  s3d.face([[0.15, -0.12, 0], [1.4, -0.3, 0], [1.4, 0.3, 0], [0.15, 0.12, 0]]).pushpull(0.05);
});
for (let i = 0; i < n; i++) stufe.place([0, 0, i * h], i * winkel);

// Mittelsäule
s3d.cylinder([0, 0, 0], 0.15, n * h + 0.9, { name: 'Säule', material: 'Metall' });
s3d.zoomExtents();
`,
  },
  {
    id: 'fence', name: 'Zaun (Komponenten-Reihe)', lang: 'js', description: 'Pfosten & Latten als Komponenten – Änderungen wirken auf alle Kopien.',
    code: `// Zaun: Pfosten-Komponente wird 10× platziert
s3d.material('Holz grau', '#9a8f7e');
const pfosten = s3d.component('Pfosten', () => {
  s3d.rect([-0.05, -0.05, 0], 0.1, 0.1).pushpull(1.2);
});
const latte = s3d.component('Latte', () => {
  s3d.rect([0, -0.01, 0], 2, 0.02, 'xz').extrude(0.1, 'z');
});
for (let i = 0; i <= 10; i++) pfosten.place([i * 2, 0, 0]).material('Holz grau');
for (let i = 0; i < 10; i++) for (const z of [0.3, 0.9]) latte.place([i * 2, 0.06, z]).material('Holz grau');
s3d.zoomExtents();
`,
  },
  {
    id: 'city', name: 'Zufällige Stadt', lang: 'js', description: 'Raster aus Hochhäusern mit zufälliger Höhe und Farbe.',
    code: `// 8 × 8 Blöcke mit zufälligen Hochhäusern
const farben = ['#d9d4c7', '#b8c4cc', '#c9b29b', '#9fb1a3', '#e0c9a6'];
farben.forEach((c, i) => s3d.material('Fassade ' + (i + 1), c));
for (let x = 0; x < 8; x++) {
  for (let y = 0; y < 8; y++) {
    const h = s3d.random(3, 30);
    const g = s3d.box([x * 12, y * 12, 0], s3d.random(6, 10), s3d.random(6, 10), h, { name: 'Haus ' + x + '-' + y });
    g.material('Fassade ' + (1 + Math.floor(s3d.random(0, 5))));
  }
}
s3d.shadows(true, 15);
s3d.view('iso');
s3d.zoomExtents();
`,
  },
  {
    id: 'lathe', name: 'Vase (Folge mir)', lang: 'js', description: 'Profil entlang eines Kreises drehen – wie „Folge mir“.',
    code: `// Vase: Profil in der XZ-Ebene wird entlang eines Kreises um die Z-Achse geführt
s3d.material('Keramik', '#4f86c6');
s3d.group('Vase', () => {
  const profil = s3d.face([
    [0.0, 0, 0], [0.30, 0, 0], [0.42, 0, 0.35], [0.30, 0, 0.75],
    [0.22, 0, 0.95], [0.28, 0, 1.10], [0.0, 0, 1.10],
  ]);
  // Pfad: Kreis (32 Segmente) um die Z-Achse, Start auf der X-Achse
  const n = 32, pfad = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2;
    pfad.push([Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0]);
  }
  profil.followMe(pfad, true);   // true = geschlossener Pfad
}).material('Keramik');
s3d.zoomExtents();
`,
  },
  {
    id: 'text', name: '3D-Text', lang: 'js', description: 'Extrudierter Schriftzug als Gruppe.',
    code: `s3d.material('Gold', '#d4a017');
s3d.text3d('Shap3D', { at: [0, 0, 0], size: 1, depth: 0.25, upright: true, material: 'Gold' });
s3d.text3d('Vue + three.js', { at: [0, -1.2, 0], size: 0.4, depth: 0.05, upright: false });
s3d.view('front');
s3d.zoomExtents();
`,
  },
  {
    id: 'table', name: 'Tisch mit 4 Stühlen', lang: 'js', description: 'Gruppen kopieren und drehen.',
    code: `s3d.material('Nussbaum', '#6b4226');
s3d.material('Stoff', '#3a6ea5');

const tisch = s3d.group('Tisch', () => {
  s3d.box([0, 0, 0.72], 1.6, 0.9, 0.04, { group: false });
  for (const [x, y] of [[0.05, 0.05], [1.5, 0.05], [0.05, 0.8], [1.5, 0.8]]) s3d.box([x, y, 0], 0.05, 0.05, 0.72, { group: false });
}).material('Nussbaum');

const stuhl = s3d.component('Stuhl', () => {
  s3d.box([0, 0, 0.45], 0.45, 0.45, 0.04, { group: false });
  for (const [x, y] of [[0, 0], [0.41, 0], [0, 0.41], [0.41, 0.41]]) s3d.box([x, y, 0], 0.04, 0.04, 0.45, { group: false });
  s3d.box([0, 0.41, 0.49], 0.45, 0.04, 0.45, { group: false });
});
stuhl.place([0.35, -0.5, 0]).material('Stoff');
stuhl.place([0.8, -0.5, 0]).material('Stoff');
stuhl.place([1.25, 1.4, 0], 180).material('Stoff');
stuhl.place([0.8, 1.4, 0], 180).material('Stoff');
s3d.zoomExtents();
`,
  },
  {
    id: 'json-scene', name: 'JSON: Einfache Szene', lang: 'json', description: 'Deklarativ: Objekte, Materialien, Gruppen.',
    code: `{
  "materials": { "Rasen": "#6aa84f", "Stein": "#9e9e9e", "Rot": "#d32f2f" },
  "objects": [
    { "type": "rect", "at": [-5, -5, 0], "size": [10, 10], "material": "Rasen" },
    { "type": "box", "name": "Sockel", "at": [-1, -1, 0], "size": [2, 2, 0.5], "material": "Stein" },
    { "type": "cylinder", "name": "Säule", "at": [0, 0, 0.5], "radius": 0.4, "height": 3, "material": "Stein" },
    { "type": "sphere", "name": "Kugel", "at": [0, 0, 4], "radius": 0.5, "material": "Rot" },
    { "type": "label", "at": [0, 0, 4.5], "text": "Denkmal" }
  ],
  "view": "iso"
}
`,
  },
  {
    id: 'json-shelf', name: 'JSON: Regal (Array)', lang: 'json', description: '„array“ wiederholt ein Objekt mit Versatz.',
    code: `{
  "materials": { "Birke": "#e3c89a" },
  "objects": [
    { "type": "box", "name": "Seite links",  "at": [0, 0, 0],    "size": [0.02, 0.35, 2], "material": "Birke" },
    { "type": "box", "name": "Seite rechts", "at": [0.98, 0, 0], "size": [0.02, 0.35, 2], "material": "Birke" },
    { "type": "array", "count": 6, "offset": [0, 0, 0.38],
      "object": { "type": "box", "name": "Boden", "at": [0.02, 0, 0.05], "size": [0.96, 0.35, 0.02], "material": "Birke" } },
    { "type": "dimension", "from": [0, 0, 0], "to": [1, 0, 0], "offset": [0, -0.4, 0] }
  ]
}
`,
  },
  {
    id: 'mesh-js', name: 'Mesh im Skript (s3d.mesh)', lang: 'js', description: 'OBJ-Text direkt im Skript einbetten, skalieren und mehrfach platzieren.',
    code: `// Eine Pyramide als OBJ-Text (Y-oben, so wie LLaMA-Mesh sie liefert)
const pyramid = \`
v 0 0 0
v 10 0 0
v 10 0 10
v 0 0 10
v 5 8 5
f 1 2 3 4
f 1 5 2
f 2 5 3
f 3 5 4
f 4 5 1
\`;
s3d.material('Sandstein', '#d9b26f');
for (let i = 0; i < 3; i++) {
  s3d.mesh(pyramid, { at: [i * 3, 0, 0], size: 1 + i, material: 'Sandstein', name: 'Pyramide ' + (i + 1) });
}
s3d.zoomExtents();`,
  },
  {
    id: 'obj-chair', name: 'OBJ: Stuhl (LLaMA-Mesh)', lang: 'obj', description: 'Rohe LLaMA-Mesh-Ausgabe – nur v/f-Zeilen. Größe und Achsen oben einstellen.',
    code: `# Stuhl – erzeugt von LLaMA-Mesh („a wooden chair“)
v 15 59 17
v 15 59 20
v 15 63 17
v 15 63 20
v 16 22 19
v 16 22 44
v 16 25 19
v 16 25 44
v 17 0 18
v 17 0 21
v 17 0 43
v 17 0 46
v 17 23 18
v 17 23 21
v 17 23 43
v 17 23 46
v 18 45 20
v 18 45 45
v 18 59 17
v 18 59 20
v 19 29 18
v 19 29 21
v 19 31 18
v 19 31 21
v 20 0 18
v 20 0 21
v 20 0 43
v 20 0 46
v 20 23 18
v 20 23 21
v 20 23 43
v 20 23 46
v 20 29 42
v 20 29 45
v 20 31 42
v 20 31 45
v 20 37 19
v 20 39 22
v 20 39 42
v 20 63 17
v 20 63 20
v 21 25 44
v 21 28 44
v 21 37 42
v 24 25 44
v 24 28 44
v 26 45 20
v 26 45 45
v 27 39 19
v 27 39 22
v 27 40 42
v 27 41 19
v 27 43 20
v 27 43 45
v 28 39 18
v 28 39 42
v 32 39 18
v 32 39 42
v 33 28 44
v 34 25 44
v 35 28 19
v 35 31 19
v 36 25 44
v 36 28 44
v 38 25 19
v 38 28 19
v 39 59 17
v 39 59 20
v 40 63 17
v 40 63 20
v 41 0 18
v 41 0 21
v 41 23 18
v 41 23 21
v 42 0 43
v 42 0 46
v 42 23 43
v 42 23 46
v 42 29 18
v 42 29 21
v 42 29 41
v 42 31 18
v 42 31 21
v 42 33 19
v 42 39 18
v 42 45 20
v 42 45 46
v 43 29 45
v 43 31 45
v 43 33 41
v 43 39 41
v 44 59 17
v 44 59 20
v 45 63 17
v 45 63 20
v 46 0 18
v 46 0 21
v 46 0 43
v 46 0 46
v 46 23 18
v 46 23 21
v 46 23 43
v 46 23 46
v 47 22 19
v 47 22 44
v 47 25 19
v 47 25 44
f 1 2 4
f 1 84 2
f 1 4 3
f 1 3 67
f 1 67 85
f 1 85 84
f 2 70 4
f 2 68 70
f 2 90 68
f 2 84 90
f 3 4 41
f 3 41 40
f 3 40 69
f 3 69 67
f 5 6 7
f 5 104 6
f 5 7 106
f 5 106 104
f 6 8 7
f 6 45 8
f 6 63 45
f 6 105 63
f 6 104 105
f 7 8 42
f 7 42 65
f 7 65 106
f 8 45 42
f 9 10 13
f 9 25 10
f 9 13 29
f 9 29 25
f 10 14 13
f 10 26 14
f 10 25 26
f 11 12 15
f 11 27 12
f 11 15 31
f 11 31 27
f 12 16 15
f 12 28 16
f 12 27 28
f 13 14 21
f 13 21 29
f 14 22 21
f 14 80 22
f 14 26 30
f 14 30 80
f 15 16 33
f 15 33 31
f 16 28 32
f 16 32 34
f 16 34 33
f 17 39 18
f 17 18 53
f 17 37 39
f 17 49 37
f 17 53 49
f 18 39 54
f 18 54 53
f 19 24 20
f 19 20 41
f 19 23 24
f 19 40 23
f 19 41 40
f 20 24 83
f 20 70 41
f 20 68 70
f 20 83 68
f 21 22 23
f 21 23 82
f 21 79 29
f 21 82 79
f 22 24 23
f 22 80 24
f 23 40 82
f 24 80 83
f 25 30 26
f 25 29 30
f 27 32 28
f 27 31 32
f 29 79 30
f 30 79 80
f 31 81 32
f 31 33 81
f 32 88 34
f 32 81 88
f 33 34 35
f 33 35 90
f 33 90 81
f 34 36 35
f 34 88 36
f 35 36 44
f 35 44 39
f 35 39 91
f 35 91 90
f 36 89 44
f 36 88 89
f 37 91 39
f 37 49 91
f 38 43 39
f 38 39 50
f 38 42 43
f 38 50 42
f 39 43 46
f 39 44 56
f 39 51 50
f 39 46 51
f 39 91 54
f 40 41 70
f 40 70 69
f 40 69 82
f 42 46 43
f 42 45 65
f 42 59 46
f 42 50 59
f 44 58 56
f 44 90 58
f 44 89 91
f 45 60 65
f 46 59 51
f 47 55 48
f 47 48 87
f 47 57 55
f 47 86 57
f 47 87 86
f 48 55 56
f 48 56 58
f 48 58 87
f 49 53 91
f 50 51 59
f 52 61 53
f 52 53 85
f 52 66 61
f 52 85 66
f 53 54 91
f 53 61 62
f 53 62 86
f 53 86 85
f 55 57 56
f 56 57 58
f 57 86 58
f 58 86 87
f 60 63 106
f 60 106 65
f 61 66 62
f 62 66 115
f 62 84 86
f 62 92 84
f 62 93 92
f 62 95 93
f 62 94 95
f 62 96 94
f 62 97 96
f 62 98 97
f 62 99 98
f 62 103 99
f 62 102 103
f 62 107 102
f 62 115 107
f 63 105 107
f 63 107 106
f 64 66 91
f 64 115 66
f 64 91 88
f 64 88 105
f 64 105 107
f 64 107 115
f 66 85 91
f 67 69 68
f 67 68 93
f 67 94 85
f 67 93 92
f 67 92 94
f 68 69 70
f 68 90 91
f 69 70 95
f 69 95 94
f 71 72 73
f 71 96 72
f 71 73 100
f 71 100 96
f 72 74 73
f 72 97 74
f 72 96 97
f 73 74 79
f 73 79 100
f 74 80 79
f 74 101 80
f 74 97 101
f 75 76 77
f 75 98 76
f 75 77 102
f 75 102 98
f 76 78 77
f 76 99 78
f 76 98 99
f 77 78 81
f 77 81 102
f 78 88 81
f 78 103 88
f 78 99 103
f 79 82 83
f 79 83 100
f 80 101 83
f 81 90 91
f 81 91 102
f 83 101 100
f 84 85 86
f 84 92 90
f 85 102 91
f 85 94 96
f 85 96 97
f 85 97 98
f 85 98 102
f 88 91 89
f 88 103 105
f 90 102 91
f 90 92 93
f 90 93 102
f 93 95 102
f 95 103 102
f 96 101 97
f 96 100 101
f 98 103 99
f 98 102 103
f 102 105 103
f 102 107 105
f 104 107 105
f 104 106 107`,
  },
];

/** Plain-text API overview – generated from the catalog (src/scripting/catalog.ts). */
export const API_HELP = catalogText();

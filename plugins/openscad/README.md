# OpenSCAD-Plugin für Shap3D.ai

Bringt das **offizielle OpenSCAD** (als WebAssembly, npm-Paket [`openscad-wasm`](https://www.npmjs.com/package/openscad-wasm)) in Shap3D.ai – ohne Installation von OpenSCAD und ohne Server, alles läuft lokal im Browser.

Das Plugin ist ein eigenes Paket mit eigener `package.json` und gehört **nicht** zur Anwendung: OpenSCAD steht unter der GPL, Shap3D.ai unter Apache-2.0. Die Anwendung enthält nur das allgemeine Plugin-System; OpenSCAD kommt erst durch die Installation dieses Pakets in den Browser.

## Funktionen

- **.scad-Dateien öffnen** – *Datei › Importieren…* oder per Drag & Drop. Das Ergebnis wird eine Gruppe mit echten, bearbeitbaren Flächen.
- **OpenSCAD im Skript-Editor** – Sprache „OpenSCAD“ in der Sprachauswahl, mit Beispielen (Beispiel laden… › OpenSCAD) und Hilfe (*API-Info*). `echo()`, Warnungen und Fehler erscheinen in der Konsole.
- **`s3d.scad(code, { at, name })` in JavaScript-Skripten** – OpenSCAD-Code mitten in einem s3d-Skript:
  ```js
  const platte = s3d.scad('difference() { cube([80, 50, 6]); translate([40, 25, -1]) cylinder(h = 8, r = 10); }');
  platte.move([0, 0, 0.75]);
  ```
- **Farben werden Materialien** – `color("red")` wird zum Material „OpenSCAD red“, `color([0, 0.5, 1, 0.4])` zu „OpenSCAD #007fff 40 %“ (mit Transparenz). Teile ohne `color()` bekommen kein Material. Funktioniert mit dem Geometrie-Kern Manifold (Standard); CGAL liefert keine Farben.
- **Export als OpenSCAD** – *Datei › Exportieren › OpenSCAD (.scad)* schreibt das Modell als `polyhedron()`.
- **Als Code öffnen ▸ OpenSCAD** – Rechtsklick auf ein Objekt schreibt es als OpenSCAD-Code in den Skript-Editor: ein `polyhedron()` je Material mit `color()`, Gruppen als `union()`. Im Skript-Editor wandelt *Umwandeln in…* OpenSCAD-Code in JavaScript, JSON oder OBJ um (und umgekehrt), ohne das Modell zu ändern. OpenSCAD rechnet nur mit geschlossenen Körpern: Einzelne Flächen und Kanten fallen dabei weg.
- **Panel „OpenSCAD“** (Menü *Plugins*) – Einheit (Standard: Millimeter, wie in OpenSCAD üblich; auch cm oder m), Geometrie-Kern (Manifold oder CGAL) und die Dateibibliothek.

## Dateibibliothek: include, use, import() und Schriften

Im Panel „OpenSCAD“ unter **Dateien** lassen sich einzelne Dateien oder ganze Ordner hinzufügen. Sie bleiben im Browser gespeichert (IndexedDB) und liegen bei jedem OpenSCAD-Lauf im Bibliotheksordner – genau wie OpenSCADs eigener Library-Ordner:

- **`include` und `use`** finden alles in der Bibliothek. Einen Bibliotheksordner wie BOSL2 einfach als Ordner hinzufügen, dann gilt `include <BOSL2/std.scad>`.
- **`import()`** und **`surface()`** lesen STL-, OFF-, 3MF-, SVG-, DXF- und PNG-Dateien aus der Bibliothek, z. B. `import("teile/halter.stl")`.
- **Schriften für `text()`**: Mitgeliefert sind **Liberation Sans** (OpenSCADs Standardschrift), **Liberation Serif** und **Liberation Mono**, jeweils normal, fett, kursiv und fett-kursiv – `text("Hallo")` funktioniert also sofort, z. B. auch `text("Hallo", font = "Liberation Serif:style=Bold")`. Eigene `.ttf`- oder `.otf`-Dateien kommen über die Bibliothek dazu (oder einfach ins Fenster ziehen), dann `text("Hallo", font = "Name der Schrift")`.
- **.scad-Dateien aus der Bibliothek** lassen sich direkt öffnen (*Öffnen*) oder in den Skript-Editor holen (*Editor*). Relative Pfade gelten dann ab dem Ordner der Datei.

## Beliebig viele `s3d.scad()`-Aufrufe

Eine OpenSCAD-Instanz kann nur einmal rechnen, und `s3d.scad()` braucht sie sofort. Darum zählt das Plugin vor jedem Skriptlauf die `s3d.scad()`-Aufrufe im Code und bereitet so viele Instanzen vor. Stehen die Aufrufe in einer Schleife, weiß es die Anzahl erst nach dem ersten Lauf: Dann erscheint einmalig die Meldung, dass weitere Instanzen vorbereitet werden, und ab dem nächsten Lauf reicht der Vorrat (bis zu 24 Aufrufe pro Lauf; die gelernte Anzahl bleibt gespeichert).

## Bauen und installieren

```bash
cd plugins/openscad
npm install
npm run build
```

Danach in Shap3D.ai: *Plugins › Plugin-Ordner laden…* und den Ordner `plugins/openscad/dist` wählen. Das Plugin samt OpenSCAD und Schriften (ca. 16 MB) wird im Browser gespeichert (IndexedDB) und bei jedem Start geladen.

## Aufbau

```
plugins/openscad/
  package.json   eigenes Paket – Abhängigkeiten openscad-wasm und @typopro/dtp-liberation (Schriften), "shap3d.main" nennt das Plugin-Modul
  src/plugin.js  das Plugin (export default { id, name, activate(context) })
  build.mjs      kopiert plugin.js, openscad.js, die Liberation-Schriften (fonts/) und eine package.json nach dist/
  dist/          installierbarer Plugin-Ordner (wird nicht eingecheckt)
```

## Lizenz

Dieses Plugin-Paket steht wegen des enthaltenen OpenSCAD unter **GPL-2.0-or-later**; die mitgelieferten Liberation-Schriften stehen unter der SIL Open Font License 1.1. Siehe [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

// OpenSCAD for Shap3D.ai – runs the official OpenSCAD (WebAssembly build "openscad-wasm") in the browser.
// - opens .scad files (Importieren… / drag & drop)
// - "OpenSCAD" as a language in the script editor
// - s3d.scad(code) inside JavaScript scripts
// - exports the model as an OpenSCAD polyhedron (.scad)
// - a file library in the browser for include/use/import() and fonts for text()
// The WebAssembly build is not part of this file: it ships next to it in the package (openscad.js).

const UNIT_SCALE = { mm: 0.001, cm: 0.01, m: 1 };
const UNIT_LABEL = { mm: 'Millimeter', cm: 'Zentimeter', m: 'Meter' };
/**
 * One OpenSCAD instance can only run once, and s3d.scad() needs one synchronously – so instances
 * are prepared ahead: at least POOL_MIN, more when a script needs more (learned per run, up to POOL_MAX).
 */
const POOL_MIN = 2;
const POOL_MAX = 24;
/** instances prepared when s3d.scad() sits in a loop (the count is only known after running) */
const LOOP_GUESS = 12;
/** for/while/forEach/map/times-style repetition in a script */
const LOOP = /\b(for|while)\s*\(|\.(forEach|map|flatMap|reduce)\s*\(|Array\.from\s*\(/;

/** an error for the script console – without the stack trace of the plugin code */
const scriptError = message => { const error = new Error(message); error.stack = message; return error; };
/** the file library is written here in every instance; it is also OpenSCAD's library path (OPENSCADPATH) */
const LIBRARY_DIR = '/library';
/** fonts for text(): the bundled Liberation fonts and the library's .ttf/.otf files */
const FONT_DIR = '/fonts';
/**
 * Fontconfig setup: the bundled TypoPRO build of the Liberation fonts is called "TypoPRO Liberation …";
 * OpenSCAD's default font and most scripts ask for "Liberation Sans" – aliases map the names.
 */
const FONTS_CONF = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${FONT_DIR}</dir>
  <cachedir>/tmp/fontconfig</cachedir>
${['Sans', 'Serif', 'Mono'].map(kind => `  <alias binding="same"><family>Liberation ${kind}</family><prefer><family>TypoPRO Liberation ${kind}</family></prefer></alias>`).join('\n')}
  <alias><family>sans-serif</family><prefer><family>TypoPRO Liberation Sans</family></prefer></alias>
  <alias><family>serif</family><prefer><family>TypoPRO Liberation Serif</family></prefer></alias>
  <alias><family>monospace</family><prefer><family>TypoPRO Liberation Mono</family></prefer></alias>
</fontconfig>
`;
const isFont = path => /\.(ttf|otf)$/i.test(path);
const isScad = path => /\.scad$/i.test(path);
/** s3d.scad( / su.scad( / fw.scad( in a script */
const SCAD_CALL = /\b(?:s3d|su|fw)\s*\.\s*scad\s*\(/g;

const EXAMPLES = [
  {
    id: 'difference',
    name: 'Würfel mit Kugel-Aussparung',
    description: 'difference() von Würfel und Kugel – der Klassiker.',
    code: `// Maße in Millimetern (Einstellung im Panel „OpenSCAD“)
difference() {
  cube(40, center = true);
  sphere(r = 26, $fn = 64);
}
translate([0, 0, 20]) cylinder(h = 30, r = 4, $fn = 32);
`,
  },
  {
    id: 'vase',
    name: 'Vase (rotate_extrude)',
    description: 'Ein Profil wird um die Z-Achse gedreht.',
    code: `$fn = 72;
wall = 2;
profile = [[0, 0], [30, 0], [36, 40], [24, 90], [28, 120], [26, 120], [22, 90], [34, 40], [28, 2], [0, 2]];

rotate_extrude() polygon(profile);
`,
  },
  {
    id: 'modules',
    name: 'Module, Schleifen & Parameter',
    description: 'Ein Regal aus einem eigenen Modul, mit for-Schleife.',
    code: `// Parameter
breite = 800; tiefe = 300; hoehe = 1200;
boeden = 5; staerke = 18;

module brett(l, t, s) cube([l, t, s]);

// Seitenwände
for (x = [0, breite - staerke]) translate([x, 0, 0]) cube([staerke, tiefe, hoehe]);
// Böden
for (i = [0 : boeden - 1])
  translate([staerke, 0, i * (hoehe - staerke) / (boeden - 1)])
    brett(breite - 2 * staerke, tiefe, staerke);
echo("Fachhöhe (mm):", (hoehe - staerke) / (boeden - 1) - staerke);
`,
  },
  {
    id: 'hull',
    name: 'hull() – abgerundete Platte',
    description: 'Die konvexe Hülle von vier Zylindern.',
    code: `$fn = 48;
r = 8;
hull() for (x = [0, 80], y = [0, 50]) translate([x, y, 0]) cylinder(h = 6, r = r);
`,
  },
];

const HELP = `OpenSCAD – das offizielle OpenSCAD läuft als WebAssembly direkt im Browser.
• Maße: OpenSCAD-Einheiten gelten als Millimeter (umstellbar im Panel „OpenSCAD“ auf cm oder m).
• Achsen wie in OpenSCAD: Z zeigt nach oben. Das Ergebnis wird eine Gruppe mit echten Flächen.
• Ausgaben von echo() und Warnungen erscheinen in der Konsole unten.
• color() wird zum Material (z. B. color("red") → „OpenSCAD red“, mit Transparenz) – nur mit dem Geometrie-Kern Manifold.

Dateibibliothek (Panel „OpenSCAD“ › Dateien):
• Dateien und ganze Ordner hinzufügen – sie bleiben im Browser gespeichert.
• include <…> und use <…> finden alles in der Bibliothek, z. B. include <BOSL2/std.scad>.
• import("teil.stl"), import("umriss.svg"), surface("hoehe.png") – Pfade relativ zur Bibliothek.
• text() hat eingebaute Schriften: Liberation Sans (Standard), Liberation Serif und Liberation Mono,
  je normal, fett und kursiv – z. B. text("Hallo", font = "Liberation Serif:style=Bold").
• Eigene Schriften (.ttf, .otf) in der Bibliothek kommen dazu: text("Hallo", font = "Name der Schrift").
  .ttf-/.otf-Dateien können auch einfach ins Fenster gezogen werden.

In JavaScript-Skripten:
  s3d.scad('cube([20, 20, 5]);', { at: [1, 0, 0], name: 'Platte' })
  → Gruppe, Einheit wie im Panel eingestellt. Beliebig viele Aufrufe: vor dem Lauf werden passend viele
    OpenSCAD-Instanzen vorbereitet (bei Schleifen lernt das Plugin die Anzahl beim ersten Lauf).

.scad-Dateien öffnen: Datei › Importieren…, per Drag & Drop oder aus der Dateibibliothek.
Exportieren: Datei › Exportieren › OpenSCAD (.scad) – das Modell als polyhedron().`;

/**
 * Parses OFF text (OpenSCAD's export) into vertices and faces. Line based, because OpenSCAD
 * appends a colour to every face ("3 0 7 23 249 215 44" = triangle 0-7-23 in RGB 249/215/44).
 */
const parseOff = text => {
  const rows = text.split('\n').map(line => line.replace(/#.*/, '').trim()).filter(Boolean).map(line => line.split(/\s+/));
  const header = rows.shift();
  if (!header || !/^C?OFF$/.test(header[0])) throw new Error('OpenSCAD hat keine OFF-Datei geliefert');
  const counts = header.length > 1 ? header.slice(1) : rows.shift(); // "OFF 8 6 0" or "OFF" + "8 6 0"
  const vertexCount = +counts[0], faceCount = +counts[1];
  const vertices = rows.slice(0, vertexCount).map(row => [+row[0], +row[1], +row[2]]);
  const faceRows = rows.slice(vertexCount, vertexCount + faceCount);
  const faces = faceRows.map(row => row.slice(1, 1 + +row[0]).map(Number));
  // colour after the indices: "r g b" or "r g b a", 0–255 (OpenSCAD writes it with the Manifold kernel only)
  const colors = faceRows.map(row => {
    const values = row.slice(1 + +row[0]).map(Number);
    return values.length >= 3 ? { red: values[0], green: values[1], blue: values[2], alpha: values[3] ?? 255 } : null;
  });
  return { vertices, faces, colors };
};

/** OpenSCAD's colour for parts without color() – they get no material. */
const DEFAULT_COLOR = '249,215,44';

/** CSS colour names by hex value, so color("red") becomes the material "OpenSCAD red" */
const COLOR_NAMES = new Map();

/**
 * Turns the face colours into material names and definitions. Parts without color() keep no
 * material (they follow the group's or the default material). Same colour = same material.
 */
const materialsFromColors = (colors, THREE) => {
  if (!COLOR_NAMES.size) for (const [name, hex] of Object.entries(THREE.Color.NAMES)) if (!COLOR_NAMES.has(hex)) COLOR_NAMES.set(hex, name);
  const materials = {};
  const faceMaterials = colors.map(color => {
    if (!color || `${color.red},${color.green},${color.blue}` === DEFAULT_COLOR) return null;
    const hexValue = (color.red << 16) | (color.green << 8) | color.blue;
    const hex = '#' + hexValue.toString(16).padStart(6, '0');
    const opacity = Math.round((color.alpha / 255) * 100) / 100;
    const name = `OpenSCAD ${COLOR_NAMES.get(hexValue) ?? hex}${opacity < 1 ? ` ${Math.round(opacity * 100)} %` : ''}`;
    materials[name] ??= { color: hex, opacity };
    return name;
  });
  return { faceMaterials, materials };
};

/** OpenSCAD's stderr → script console lines (statistics are left out). */
const consoleLines = lines => lines.flatMap(line => {
  const text = line.trim();
  if (/^ECHO:/.test(text)) return [{ kind: 'log', text: text.replace(/^ECHO:\s*/, '') }];
  if (/^(WARNING|DEPRECATED):/.test(text)) return [{ kind: 'warn', text }];
  if (/^(ERROR|TRACE):/.test(text) || /^Can't parse/.test(text)) return [{ kind: 'error', text }];
  return [];
});

/** @type {import('../../../src/plugins/types').S3dPlugin} */
export default {
  id: 'openscad',
  name: 'OpenSCAD',
  version: '1.2.0',
  author: 'Shap3D.ai (OpenSCAD: openscad.org)',
  description: 'Öffnet .scad-Dateien, bringt OpenSCAD als Sprache in den Skript-Editor, s3d.scad() für JavaScript, den Export als .scad und „Als Code öffnen ▸ OpenSCAD“ – mit dem echten OpenSCAD als WebAssembly.',

  activate(context) {
    const { editor } = context;
    const settings = context.storage.get('settings', { unit: 'mm', backend: 'manifold' });
    const scaleOf = () => UNIT_SCALE[settings.unit] ?? 0.001;

    // ---------------------------------------------------------------- file library (include/use/import, fonts)
    /** path → bytes, mirrored into every OpenSCAD instance */
    const library = new Map();
    let refreshPanel = () => {};
    const loadLibrary = async () => {
      library.clear();
      for (const { path } of await context.storage.files.list()) {
        const blob = await context.storage.files.get(path);
        if (blob) library.set(path, new Uint8Array(await blob.arrayBuffer()));
      }
      refreshPanel();
    };
    // read from IndexedDB right away – every instance waits for it, so none misses library files
    const libraryReady = loadLibrary().catch(error => console.error('OpenSCAD-Bibliothek:', error));
    /** fonts shipped in the plugin package (fonts/*.ttf): name → bytes */
    const bundledFonts = new Map();
    const fontsReady = Promise.all(context.assets.list().filter(path => /^fonts\/.+\.(ttf|otf)$/i.test(path)).map(async path => {
      bundledFonts.set(path.split('/').pop(), new Uint8Array(await context.assets.blob(path).arrayBuffer()));
    })).catch(error => console.error('OpenSCAD-Schriften:', error));

    // ---------------------------------------------------------------- OpenSCAD instances
    let modulePromise = null;
    const loadModule = () => (modulePromise ??= import(context.assets.url('openscad.js')));
    const status = { state: 'idle', error: '' }; // idle | loading | ready | failed
    const setStatus = (state, error = '') => { status.state = state; status.error = error; refreshPanel(); };

    /** mkdir -p inside the instance's file system */
    const makeDirectories = (FS, path) => {
      let current = '';
      for (const part of path.split('/').filter(Boolean)) { current += '/' + part; try { FS.mkdir(current); } catch { /* exists */ } }
    };
    const writeFile = (FS, path, data) => { makeDirectories(FS, path.slice(0, path.lastIndexOf('/'))); FS.writeFile(path, data); };

    const createInstance = async () => {
      await Promise.all([libraryReady, fontsReady]);
      const module = await loadModule();
      const log = [];
      const openscad = await module.createOpenSCAD({
        noInitialRun: true,
        print: line => log.push(line),
        printErr: line => log.push(line),
        preRun: [instanceModule => { instanceModule.ENV.OPENSCADPATH = LIBRARY_DIR; instanceModule.ENV.FONTCONFIG_FILE = `${FONT_DIR}/fonts.conf`; }],
      });
      const instance = openscad.getInstance();
      makeDirectories(instance.FS, LIBRARY_DIR); makeDirectories(instance.FS, FONT_DIR);
      instance.FS.writeFile(`${FONT_DIR}/fonts.conf`, FONTS_CONF);
      for (const [name, data] of bundledFonts) instance.FS.writeFile(`${FONT_DIR}/${name}`, data);
      for (const [path, data] of library) {
        writeFile(instance.FS, `${LIBRARY_DIR}/${path}`, data);
        if (isFont(path)) instance.FS.writeFile(`${FONT_DIR}/${path.split('/').pop()}`, data);
      }
      return { instance, log, generation };
    };

    // spare instances, prepared in the background; the target grows with what scripts need
    const spares = [];
    let generation = 0; // bumped when the library changes – older instances lack the new files
    let poolTarget = Math.min(POOL_MAX, Math.max(POOL_MIN, context.storage.get('poolTarget', POOL_MIN)));
    let warming = null;
    const warm = (target = poolTarget) => {
      if (spares.length >= target) return warming ?? Promise.resolve();
      if (warming) return warming.then(() => warm(target));
      if (status.state !== 'ready') setStatus('loading'); // refilling after a run keeps "ready"
      warming = (async () => {
        try {
          while (spares.length < target) { const ready = await createInstance(); if (ready.generation === generation) spares.push(ready); }
          setStatus('ready');
        } catch (error) { modulePromise = null; setStatus('failed', error?.message ?? String(error)); throw error; }
        finally { warming = null; }
      })();
      return warming;
    };
    const takeSpare = () => { const ready = spares.shift() ?? null; warm().catch(() => {}); return ready; };
    const instanceAsync = async () => takeSpare() ?? (await warm(), takeSpare()) ?? createInstance();

    const libraryChanged = () => {
      generation++; spares.length = 0; refreshPanel();
      if (status.state !== 'idle') warm().catch(() => {});
    };
    const addToLibrary = async files => {
      for (const file of files) {
        const path = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
        await context.storage.files.put(path, file);
        library.set(path, new Uint8Array(await file.arrayBuffer()));
      }
      libraryChanged();
    };
    const removeFromLibrary = async paths => {
      for (const path of paths) { await context.storage.files.remove(path); library.delete(path); }
      libraryChanged();
    };

    /** s3d.scad() calls since the last script started (to learn how many instances a script needs) */
    let callsThisRun = 0;
    context.script.beforeRun(async code => {
      callsThisRun = 0;
      const written = (code.match(SCAD_CALL) ?? []).length;
      if (!written) return;
      // calls in loops are only known after running: guess generously, the learned target covers the rest
      const target = Math.min(POOL_MAX, Math.max(written, poolTarget, LOOP.test(code) ? LOOP_GUESS : 0));
      await warm(target).catch(() => {});
    });

    /** Runs OpenSCAD once; returns the mesh and the console lines, throws with OpenSCAD's error message. */
    const compile = ({ instance, log }, code, fileName = '.eingabe.scad') => {
      // the input sits in the library folder, so include/use/import() find the library files next to it
      const inputPath = `${LIBRARY_DIR}/${fileName}`;
      writeFile(instance.FS, inputPath, code);
      let exitCode;
      try { exitCode = instance.callMain([inputPath, '-o', '/output.off', `--backend=${settings.backend}`]); }
      catch (error) { exitCode = -1; log.push(`ERROR: OpenSCAD ist abgebrochen (${error?.message ?? error})`); }
      let off = null;
      try { off = instance.FS.readFile('/output.off', { encoding: 'utf8' }); } catch { /* no output */ }
      const lines = consoleLines(log);
      if (exitCode !== 0 || !off) {
        const firstError = lines.find(line => line.kind === 'error')?.text
          ?? (log.some(line => /top level object is not a 3D/i.test(line)) ? 'Das oberste Objekt ist 2D – mit linear_extrude() oder rotate_extrude() in ein 3D-Objekt umwandeln.' : null)
          ?? (log.some(line => /top level object is empty/i.test(line)) ? 'Das Ergebnis ist leer – es wurde kein Objekt erzeugt.' : null)
          ?? `OpenSCAD hat kein 3D-Objekt erzeugt (Exit-Code ${exitCode})`;
        const error = scriptError(firstError); error.lines = lines; throw error;
      }
      const { vertices, faces, colors } = parseOff(off);
      const { faceMaterials, materials } = materialsFromColors(colors, context.THREE);
      const mesh = { vertices, faces, faceMaterials, materials };
      if (!mesh.faces.length) { const error = scriptError('Das Ergebnis ist leer – ist das oberste Objekt 2D? Dann linear_extrude() verwenden.'); error.lines = lines; throw error; }
      return { mesh, lines };
    };

    const addToModel = (mesh, name) => {
      context.meshes.add(mesh, { name, scale: scaleOf(), smooth: 25, materials: mesh.materials });
    };

    // load in the background shortly after start – the WebAssembly file is about 14 MB
    const preload = setTimeout(() => warm().catch(() => {}), 1500);
    context.onDispose(() => { clearTimeout(preload); spares.length = 0; });

    // ---------------------------------------------------------------- script editor language
    context.script.registerLanguage({
      id: 'openscad',
      label: 'OpenSCAD',
      highlight: 'js',
      help: HELP,
      examples: EXAMPLES,
      run: async code => {
        const startedAt = performance.now();
        try {
          const { mesh, lines } = compile(await instanceAsync(), code);
          addToModel(mesh, 'OpenSCAD');
          return { ok: true, logs: [...lines, { kind: 'result', text: `${mesh.faces.length} Facetten, Einheit ${UNIT_LABEL[settings.unit]}` }], durationMs: performance.now() - startedAt };
        } catch (error) {
          const message = error?.message ?? String(error);
          return { ok: false, logs: (error.lines ?? []).filter(line => line.text !== message), error: message, durationMs: performance.now() - startedAt };
        }
      },
    });

    // ---------------------------------------------------------------- s3d.scad() for JavaScript scripts
    context.script.extend('scad', (api, code, options = {}) => {
      callsThisRun++;
      const ready = takeSpare();
      if (!ready) {
        if (status.state === 'failed') throw scriptError(`OpenSCAD konnte nicht geladen werden: ${status.error}`);
        if (status.state !== 'ready') throw scriptError('OpenSCAD wird noch geladen – bitte gleich noch einmal ausführen.');
        // more calls than prepared: the script stopped at this call, so the real need is unknown – grow generously
        poolTarget = Math.min(POOL_MAX, Math.max(poolTarget * 2, callsThisRun * 3, LOOP_GUESS));
        context.storage.set('poolTarget', poolTarget);
        warm().catch(() => {});
        throw scriptError(callsThisRun > POOL_MAX
          ? `Mehr als ${POOL_MAX} s3d.scad()-Aufrufe in einem Lauf – bitte den OpenSCAD-Code in weniger Aufrufen zusammenfassen.`
          : `Dieses Skript braucht mehr OpenSCAD-Instanzen als vorbereitet waren – jetzt werden ${poolTarget} vorbereitet. Bitte gleich noch einmal ausführen.`);
      }
      let result;
      try { result = compile(ready, String(code)); }
      catch (error) { for (const line of error.lines ?? []) api.warn(line.text); throw error; }
      for (const line of result.lines) (line.kind === 'log' ? api.log : api.warn).call(api, line.text);
      // the script run is one undo step – materials created here are part of it
      for (const [name, material] of Object.entries(result.mesh.materials)) api.ensureMaterial(name, material.color, material.opacity);
      const group = api.group(options.name ?? 'OpenSCAD', inner => { context.meshes.build(inner.ents, result.mesh, { scale: scaleOf(), smooth: 25 }); });
      if (options.at) group.move(options.at);
      return group;
    }, {
      signature: "s3d.scad(openscadCode, { at, name })",
      description: 'Führt OpenSCAD-Code aus (echtes OpenSCAD) und setzt das Ergebnis als Gruppe ein. Einheit wie im Panel „OpenSCAD“ (Standard: mm).',
      example: "s3d.scad('difference() { cube(30, center = true); sphere(20, $fn = 48); }', { at: [0, 0, 0.015] });",
    });

    // ---------------------------------------------------------------- .scad files
    context.files.registerImporter({
      extensions: ['scad'],
      label: 'OpenSCAD',
      import: async file => {
        const { mesh, lines } = compile(await instanceAsync(), await file.text(), file.name);
        addToModel(mesh, file.name.replace(/\.scad$/i, ''));
        editor.zoomExtents();
        const warnings = lines.filter(line => line.kind !== 'log').length;
        context.ui.toast(`„${file.name}“ importiert – ${mesh.faces.length} Facetten${warnings ? `, ${warnings} Warnung(en)` : ''}`);
      },
    });

    context.files.registerImporter({
      extensions: ['ttf', 'otf'],
      label: 'Schrift für OpenSCAD',
      import: async file => {
        await addToLibrary([file]);
        context.ui.toast(`Schrift „${file.name}“ für OpenSCADs text() hinzugefügt`);
      },
    });

    /** opens a .scad file from the library as a model (relative include/use/import from its folder work) */
    const openFromLibrary = async path => {
      try {
        const code = new TextDecoder().decode(library.get(path));
        const { mesh, lines } = compile(await instanceAsync(), code, path);
        addToModel(mesh, path.split('/').pop().replace(/\.scad$/i, ''));
        editor.zoomExtents();
        const problems = lines.filter(line => line.kind !== 'log').length;
        context.ui.toast(`„${path}“ geöffnet – ${mesh.faces.length} Facetten${problems ? `, ${problems} Warnung(en)` : ''}`);
      } catch (error) { context.ui.toast(`„${path}“: ${error?.message ?? error}`); }
    };

    context.files.registerExporter({
      id: 'scad',
      label: 'OpenSCAD (.scad)',
      mimeType: 'text/plain;charset=utf-8',
      fileName: target => `${target.model.name || 'Modell'}.scad`,
      export: target => {
        const { THREE } = context;
        const scale = scaleOf();
        const points = []; const pointIndex = new Map(); const faces = [];
        const indexOf = point => {
          const coordinates = [point.x, point.y, point.z].map(value => +(value / scale).toFixed(4));
          const key = coordinates.join(',');
          if (!pointIndex.has(key)) { pointIndex.set(key, points.length); points.push(coordinates); }
          return pointIndex.get(key);
        };
        const walk = (entities, matrix) => {
          for (const face of entities.faces.values()) {
            if (face.hidden) continue;
            const ids = [...face.outer, ...face.holes.flat()];
            const triangles = entities.faceTriangles(face);
            for (let i = 0; i < triangles.length; i += 3) {
              const corners = [0, 1, 2].map(k => indexOf(entities.positionOf(ids[triangles[i + k]]).clone().applyMatrix4(matrix)));
              if (new Set(corners).size === 3) faces.push(corners.reverse()); // OpenSCAD wants clockwise seen from outside
            }
          }
          for (const instance of entities.instances.values()) if (!instance.hidden) walk(instance.definition.entities, matrix.clone().multiply(instance.matrix));
        };
        walk(target.model.root, new THREE.Matrix4());
        if (!faces.length) throw new Error('Das Modell hat keine Flächen');
        return `// ${target.model.name || 'Modell'} – exportiert aus Shap3D.ai, Einheit: ${UNIT_LABEL[settings.unit]}\n`
          + `polyhedron(\n  points = [\n    ${points.map(point => `[${point.join(', ')}]`).join(',\n    ')}\n  ],\n`
          + `  faces = [\n    ${faces.map(face => `[${face.join(', ')}]`).join(',\n    ')}\n  ]\n);\n`;
      },
    });

    // ---------------------------------------------------------------- "Als Code öffnen ▸ OpenSCAD" and "Umwandeln in…"
    /** '#d8b07a' + opacity → OpenSCAD's color([r, g, b, a]) */
    const scadColor = ({ color, opacity }) => {
      const hex = new context.THREE.Color(color).getHex(); // sRGB, as written in the material
      return `[${[hex >> 16, (hex >> 8) & 255, hex & 255].map(channel => +(channel / 255).toFixed(3)).join(', ')}${opacity < 1 ? `, ${opacity}` : ''}]`;
    };
    context.code.registerFormat({
      id: 'openscad',
      label: 'OpenSCAD',
      generate: scene => {
        const scale = scaleOf();
        const out = [`// Erzeugt mit Shap3D.ai aus ${scene.title} – Einheit: ${UNIT_LABEL[settings.unit]}, Z zeigt nach oben`];
        let skippedLines = 0;
        const write = (group, inherited, indent) => {
          // one polyhedron per material – OpenSCAD colours whole objects, not single faces
          const buckets = new Map();
          for (const face of group.faces) {
            const material = face.material ?? group.material ?? inherited;
            if (!buckets.has(material)) buckets.set(material, []);
            buckets.get(material).push(face);
          }
          for (const [material, faces] of buckets) {
            const points = []; const pointIndex = new Map();
            const indexOf = index => {
              if (!pointIndex.has(index)) { pointIndex.set(index, points.length); points.push(group.points[index].map(value => +(value / scale).toFixed(4))); }
              return pointIndex.get(index);
            };
            // OpenSCAD wants the corners clockwise seen from outside; faces with holes go in as triangles
            const polygons = faces.flatMap(face => (face.holes.length ? face.triangles : [face.outer]).map(polygon => polygon.map(indexOf).reverse()));
            const color = material && scene.materials[material] ? `color(${scadColor(scene.materials[material])}) ` : '';
            if (material) out.push(`${indent}// Material: ${material}`);
            out.push(`${indent}${color}polyhedron(`, `${indent}  points = [`);
            for (let i = 0; i < points.length; i += 4) out.push(`${indent}    ${points.slice(i, i + 4).map(point => `[${point.join(', ')}]`).join(', ')}${i + 4 < points.length ? ',' : ''}`);
            out.push(`${indent}  ],`, `${indent}  faces = [`);
            for (let i = 0; i < polygons.length; i += 6) out.push(`${indent}    ${polygons.slice(i, i + 6).map(polygon => `[${polygon.join(', ')}]`).join(', ')}${i + 6 < polygons.length ? ',' : ''}`);
            out.push(`${indent}  ]`, `${indent});`);
          }
          skippedLines += group.lines.length;
          for (const child of group.children) {
            out.push('', `${indent}// Gruppe „${child.name}“`, `${indent}union() {`);
            write(child, child.material ?? group.material ?? inherited, indent + '  ');
            out.push(`${indent}}`);
          }
        };
        write(scene.root, undefined, '');
        if (skippedLines) out.push('', `// ${skippedLines} ${skippedLines === 1 ? 'Kante' : 'Kanten'} ohne Fläche weggelassen – OpenSCAD kennt keine einzelnen Linien`);
        return out.join('\n') + '\n';
      },
      evaluate: async (code, sandbox) => {
        const { mesh } = compile(await instanceAsync(), code);
        for (const [name, material] of Object.entries(mesh.materials)) {
          if (!sandbox.model.materials.some(existing => existing.name === name)) sandbox.model.materials.push({ name, color: material.color, opacity: material.opacity ?? 1 });
        }
        context.meshes.build(sandbox.entities, mesh, { scale: scaleOf(), smooth: 25 });
      },
    });

    // ---------------------------------------------------------------- commands and panel
    context.icons.register('openscad', '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 3.5v17M5 8h14M5 16h14" fill="none" stroke="#e8a33d" stroke-width="1.6"/>');

    context.commands.register({
      id: 'editor',
      label: 'OpenSCAD-Code schreiben…',
      icon: 'openscad',
      keywords: 'openscad scad cad code skript',
      run: () => context.script.openInEditor('openscad', EXAMPLES[0].code),
    });

    context.panels.register({
      id: 'panel',
      label: 'OpenSCAD',
      icon: 'openscad',
      width: 320,
      mount(element) {
        const STATE_TEXT = { idle: 'nicht geladen', loading: 'wird geladen … (ca. 14 MB, einmalig)', ready: 'bereit', failed: 'Fehler beim Laden' };
        element.innerHTML = `
          <p style="margin:0 0 .5rem;font-size:.75rem;opacity:.8">Das offizielle OpenSCAD läuft als WebAssembly lokal im Browser – ohne Installation und ohne Server.</p>
          <p style="margin:.25rem 0;font-size:.8125rem">Status: <b data-status></b></p>
          <p data-error style="margin:.25rem 0;font-size:.75rem;color:var(--s3d-danger)"></p>
          <label style="display:flex;align-items:center;gap:.5rem;margin:.5rem 0">
            <span style="flex:1">OpenSCAD-Einheit</span>
            <select class="s3d-input" data-setting="unit" style="width:9rem">${Object.entries(UNIT_LABEL).map(([value, label]) => `<option value="${value}">${label}</option>`).join('')}</select>
          </label>
          <label style="display:flex;align-items:center;gap:.5rem;margin:.5rem 0">
            <span style="flex:1">Geometrie-Kern</span>
            <select class="s3d-input" data-setting="backend" style="width:9rem"><option value="manifold">Manifold (schnell)</option><option value="cgal">CGAL (klassisch)</option></select>
          </label>
          <p style="margin:0 0 .5rem;font-size:.6875rem;opacity:.75">Farben aus color() werden zu Materialien (z. B. „OpenSCAD red“) – das geht nur mit dem Manifold-Kern; CGAL liefert keine Farben.</p>
          <div style="display:flex;flex-wrap:wrap;gap:.375rem;margin:.75rem 0">
            <button class="s3d-btn small" data-action="load">Jetzt laden</button>
            <button class="s3d-btn small" data-action="editor">Im Skript-Editor öffnen</button>
          </div>
          <div class="s3d-caption" style="margin:1rem 0 .25rem">Dateien</div>
          <p style="margin:0 0 .5rem;font-size:.6875rem;opacity:.75">Für include, use, import() und Schriften für text(). Bleiben im Browser gespeichert. Pfade wie im Ordner, z. B. include &lt;BOSL2/std.scad&gt;.</p>
          <div style="display:flex;flex-wrap:wrap;gap:.375rem;margin:.25rem 0 .5rem">
            <button class="s3d-btn small" data-action="add-files">Dateien hinzufügen…</button>
            <button class="s3d-btn small" data-action="add-folder">Ordner hinzufügen…</button>
          </div>
          <input type="file" multiple data-input="files" style="display:none">
          <input type="file" multiple webkitdirectory data-input="folder" style="display:none">
          <div data-library style="font-size:.75rem"></div>
          <p style="margin:.75rem 0 0;font-size:.6875rem;opacity:.75">OpenSCAD ist freie Software unter der GPL (openscad.org, github.com/openscad/openscad). Die WebAssembly-Fassung stammt aus dem npm-Paket „openscad-wasm“ und liegt diesem Plugin-Paket bei; die Anwendung selbst enthält sie nicht.</p>`;
        for (const select of element.querySelectorAll('select')) {
          select.value = settings[select.dataset.setting];
          select.addEventListener('change', () => { settings[select.dataset.setting] = select.value; context.storage.set('settings', settings); });
        }
        element.querySelector('[data-action="load"]').addEventListener('click', () => warm().catch(() => {}));
        element.querySelector('[data-action="editor"]').addEventListener('click', () => context.script.openInEditor('openscad', EXAMPLES[0].code));
        const filesInput = element.querySelector('[data-input="files"]'), folderInput = element.querySelector('[data-input="folder"]');
        element.querySelector('[data-action="add-files"]').addEventListener('click', () => filesInput.click());
        element.querySelector('[data-action="add-folder"]').addEventListener('click', () => folderInput.click());
        for (const input of [filesInput, folderInput]) {
          input.addEventListener('change', async () => {
            const files = [...input.files].filter(file => !/(^|\/)(node_modules|\.git)\//.test(file.webkitRelativePath)); input.value = '';
            if (files.length) { await addToLibrary(files); context.ui.toast(`${files.length} ${files.length === 1 ? 'Datei' : 'Dateien'} zur OpenSCAD-Bibliothek hinzugefügt`); }
          });
        }
        const escapeHtml = value => value.replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);
        const kilobytes = bytes => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`);
        const libraryList = element.querySelector('[data-library]');
        libraryList.addEventListener('click', event => {
          const button = event.target.closest('button[data-path]'); if (!button) return;
          const path = button.dataset.path;
          if (button.dataset.do === 'open') openFromLibrary(path);
          else if (button.dataset.do === 'edit') context.script.openInEditor('openscad', new TextDecoder().decode(library.get(path)));
          else if (button.dataset.do === 'remove') removeFromLibrary([path]);
          else if (button.dataset.do === 'clear') context.ui.confirm('Alle Dateien aus der OpenSCAD-Bibliothek entfernen?').then(yes => yes && removeFromLibrary([...library.keys()]));
        });
        const renderLibrary = () => {
          const paths = [...library.keys()].sort();
          if (!paths.length) { libraryList.innerHTML = '<p style="opacity:.7;margin:.25rem 0">Noch keine Dateien.</p>'; return; }
          const total = paths.reduce((sum, path) => sum + library.get(path).length, 0);
          libraryList.innerHTML = paths.map(path => `
            <div style="display:flex;align-items:center;gap:.375rem;padding:.1875rem 0;border-bottom:1px solid var(--s3d-line)">
              <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${escapeHtml(path)}">${isFont(path) ? '🔤 ' : ''}${escapeHtml(path)}</span>
              <span style="opacity:.6">${kilobytes(library.get(path).length)}</span>
              ${isScad(path) ? `<button class="s3d-link" data-do="open" data-path="${escapeHtml(path)}">Öffnen</button><button class="s3d-link" data-do="edit" data-path="${escapeHtml(path)}">Editor</button>` : ''}
              <button class="s3d-link" data-do="remove" data-path="${escapeHtml(path)}" title="Entfernen">✕</button>
            </div>`).join('')
            + `<div style="display:flex;align-items:center;margin-top:.375rem"><span style="flex:1;opacity:.7">${paths.length} ${paths.length === 1 ? 'Datei' : 'Dateien'}, ${kilobytes(total)}</span><button class="s3d-link" data-do="clear" data-path="">Alle entfernen</button></div>`;
        };
        refreshPanel = () => {
          element.querySelector('[data-status]').textContent = STATE_TEXT[status.state];
          element.querySelector('[data-error]').textContent = status.error;
          element.querySelector('[data-action="load"]').disabled = status.state === 'loading' || status.state === 'ready';
          renderLibrary();
        };
        refreshPanel();
        return () => { refreshPanel = () => {}; };
      },
    });
  },
};

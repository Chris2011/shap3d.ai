/**
 * Dev-only demo scenes for the README screenshots: http://localhost:5173/?shot=hero
 * Loaded by main.ts only in the dev server when a "shot" parameter is present (see scripts/screenshots.ps1).
 *
 * The scenes know no plugin packages. `&package=<folder>` (repeatable or comma-separated) installs the built
 * package from plugins/<folder>/dist before any scene, and the scene `script` (`&language=<id>&file=<path>`)
 * runs a file in the script editor – that is how a package renders its own screenshots.
 */
import type { Editor } from './engine/editor';
import { runScript } from './scripting/api';
import { EXAMPLES } from './scripting/examples';
import { setTheme, setScene } from './theme';
import { openPanel } from './components/panelState';
import { meshView } from './engine/meshView';
import { aiConfig } from './plugins/builtin/ai/providers';
import { aiHistory } from './plugins/builtin/ai/history';
import { AI_PANEL } from './plugins/builtin/ai';
import { openTerrain, generate } from './plugins/builtin/terrain/session';
import { pluginsReady, plugins, installPluginPackage } from './plugins/registry';
import { useScripts } from './composables/useScripts';
import { prepareScript } from './scripting/languages';
import { textDialog } from './plugins/builtin/text3d/state';
import { Entities } from './core/model';
import { bakeTerrain, cellSize, heightAt, terrainOf } from './plugins/builtin/terrain/terrainData';
import { addScaleFigure } from './engine/defaults';
import { measureView } from './engine/measureView';
import { openPalette } from './components/paletteState';
import { openTour } from './components/tour';
import { editorState } from './plugins/builtin/i18n/state';

const wait = (delay: number) => new Promise((resolve) => setTimeout(resolve, delay));
const cam = (editor: Editor, pos: number[], target: number[], fov = 35) =>
  editor.viewer.rig.applyState({ position: pos, target, fov, ortho: false });
const run = (editor: Editor, code: string) => {
  const result = runScript(editor, code);
  if (!result.ok) {
    console.error('shot script failed', result.error);
  }
};
const empty = (editor: Editor) => {
  editor.newModel();
  for (const instance of [...editor.model.root.instances.values()]) {
    editor.model.root.instances.delete(instance.id);
  }
};

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') ?? 9);
const LANDSCAPE = `
s3d.terrain([-14, -10, -0.02], 34, 26, { hills: 5, scale: 15, seed: ${seed}, rock: 3.2, snow: 4.6, water: -0.2 });
${EXAMPLES.find((example) => example.id === 'house')!.code}
const tree = s3d.component('Baum', () => {
  s3d.cylinder([0, 0, 0], 0.18, 2.2, { material: 'Rinde', segments: 10 });
  s3d.ellipsoid([0, 0, 3.2], 1.4, 1.4, 1.8, { material: 'Laub' });
});
for (const [x, y, s] of [[-4, 7, 1], [-6, 3, 0.8], [11, 8, 1.2], [13, 2, 0.9], [-3, -6, 0.7]]) tree.place([x, y, 0], 0, s);
`;

/** Building plot under the house (like the "Ebnen" brush) and trees standing on the ground. */
const settleLandscape = (editor: Editor) => {
  const terrainInstance = [...editor.model.root.instances.values()].find((instance) => terrainOf(instance.definition));
  if (!terrainInstance) {
    return;
  }
  const terrain = terrainOf(terrainInstance.definition)!;
  const originX = terrainInstance.matrix.elements[12],
    originY = terrainInstance.matrix.elements[13],
    originZ = terrainInstance.matrix.elements[14];
  const { cx: cellX, cy: cellY } = cellSize(terrain);
  for (let j = 0; j <= terrain.rows; j++) {
    for (let i = 0; i <= terrain.columns; i++) {
      const x = originX + i * cellX,
        y = originY + j * cellY;
      const dist = Math.max(0, Math.max(-1.5 - x, x - 9.5, -1.5 - y, y - 7.5)); // outside the 11 × 9 m plot
      const weight = dist <= 0 ? 1 : Math.max(0, 1 - dist / 4);
      const k = j * (terrain.columns + 1) + i;
      terrain.heights[k] = terrain.heights[k] * (1 - weight) + -originZ * weight;
    }
  }
  terrainInstance.definition.entities = new Entities();
  bakeTerrain(terrainInstance.definition.entities, terrain, editor.model);
  for (const instance of editor.model.root.instances.values()) {
    if (instance.definition.name !== 'Baum') {
      continue;
    }
    const elements = instance.matrix.elements;
    elements[14] = originZ + heightAt(terrain, elements[12] - originX, elements[13] - originY) - 0.05;
  }
};

/** the plugin packages asked for with &package=… */
const requestedPackages = params
  .getAll('package')
  .flatMap((value) => value.split(','))
  .map((name) => name.trim())
  .filter(Boolean);

/**
 * Installs a built plugin package from plugins/<folder>/dist (run `npm run build` there first) – like
 * "Plugin-Ordner laden…", just without the folder dialog. The files come from the `files` list in its
 * dist/package.json; scripts are read with ?raw so Vite hands them over untouched.
 */
const installPackage = async (folder: string) => {
  const base = `/plugins/${folder}/dist/`;
  const response = await fetch(base + 'package.json');
  if (!response.ok) {
    throw new Error(`plugins/${folder}/dist fehlt – dort zuerst npm run build ausführen`);
  }
  const manifestText = await response.text();
  const manifest = JSON.parse(manifestText) as { files?: string[]; shap3d?: { id?: string } };
  if (plugins.some((entry) => entry.id === manifest.shap3d?.id && entry.active)) {
    return;
  }
  const asFile = (path: string, content: BlobPart) => {
    const entry = new File([content], path);
    Object.defineProperty(entry, 'webkitRelativePath', { value: `dist/${path}` });
    return entry;
  };
  const read = async (path: string): Promise<BlobPart> =>
    path.endsWith('.js')
      ? ((await import(/* @vite-ignore */ `${base}${path}?raw`)) as { default: string }).default
      : await (await fetch(base + path)).arrayBuffer();
  const files = await Promise.all(
    (manifest.files ?? []).filter((path) => path !== 'package.json').map(async (path) => asFile(path, await read(path))),
  );
  await installPluginPackage([asFile('package.json', manifestText), ...files]);
};

/** waits until `done()` is true (scripts of plugins may compute in the background), at most `limit` ms */
const until = async (done: () => boolean, limit = 60000) => {
  for (let waited = 0; !done() && waited < limit; waited += 250) {
    await wait(250);
  }
};
const button = (label: string) =>
  ([...document.querySelectorAll('button')] as HTMLElement[]).find((candidate) => candidate.textContent?.trim().endsWith(label));

const SCENES: Record<string, (editor: Editor) => Promise<void>> = {
  async hero(editor) {
    setTheme('light');
    setScene('day');
    editor.newModel();
    run(editor, LANDSCAPE);
    settleLandscape(editor);
    cam(editor, [-19, -23, 13], [3, 3, 1.2]);
  },
  async night(editor) {
    setTheme('dark');
    setScene('night');
    editor.newModel();
    run(editor, LANDSCAPE);
    settleLandscape(editor);
    aiConfig.provider = 'ollama';
    aiConfig.model = 'qwen2.5-coder:7b';
    aiConfig.configured = true;
    aiConfig.fast = false;
    const now = Date.now();
    aiHistory.sessions.unshift({
      id: 'demo',
      title: 'Gartenhaus',
      created: now - 60000,
      updated: now,
      model: aiConfig.model,
      turns: [
        { id: 1, role: 'user', text: 'Ein kleines Haus mit Satteldach, Fenstern und einer Holztür', createdAt: now - 52000 },
        {
          id: 2,
          role: 'assistant',
          text: 'Ich baue ein 8 × 6 m großes Haus mit Ziegeldach, zwei Fenstern und einer Holztür.',
          createdAt: now - 50000,
          endedAt: now - 21000,
          status: 'done',
          model: aiConfig.model,
          code: EXAMPLES.find((example) => example.id === 'house')!
            .code.split('\n')
            .slice(0, 14)
            .join('\n'),
          lang: 'js',
          result: '+40 Flächen in 12 ms',
          undoable: true,
        },
      ],
    } as any);
    aiHistory.currentId = 'demo';
    openPanel.value = AI_PANEL;
    cam(editor, [-17, -21, 11], [1, 2, 1.2]);
  },
  async scripts(editor) {
    setTheme('light');
    setScene('day');
    empty(editor);
    run(
      editor,
      `s3d.cone([0, 0, 0], 0.6, 1.4, { material: 'Rot' });
s3d.pyramid([2, 0, 0], 1.3, 1.2, { material: 'Sand' });
s3d.torus([4, 0, 0.25], 0.6, 0.22, { material: 'Gold' });
s3d.tube([6, 0, 0], 0.6, 0.48, 1, { material: 'Edelstahl' });
s3d.dome([8.2, 0, 0], 0.8, { material: 'Marmor' });
s3d.prism([0, 2.6, 0], 0.6, 1.2, { sides: 6, material: 'Glas' });
s3d.stairs([2, 2, 0], { steps: 6, width: 1.2, material: 'Eiche hell' });
s3d.wedge([5.4, 2.1, 0], 1.6, 1, 0.8, { material: 'Beton' });`,
    );
    // the editor starts empty without a draft – show the house example
    useScripts().open({ lang: 'js', code: EXAMPLES.find((example) => example.id === 'house')!.code });
    openPanel.value = 'scripts';
    await wait(600);
    ([...document.querySelectorAll('button')] as HTMLElement[]).find((element) => element.textContent?.trim() === 'API-Info')?.click();
    cam(editor, [-4, -9, 6], [4, 2, 0.6]);
  },
  async terrain(editor) {
    setTheme('light');
    setScene('day');
    empty(editor);
    run(editor, `s3d.rect([0, 0, 0], 24, 18);`);
    editor.select([{ kind: 'face', id: [...editor.model.root.faces.values()][0].id }]);
    openTerrain(editor);
    generate('mountains');
    cam(editor, [-10, -16, 15], [12, 9, 1]);
  },
  async mesh(editor) {
    setTheme('dark');
    setScene('night');
    empty(editor);
    run(
      editor,
      `s3d.cylinder([0, 0, 0], 0.6, 1.2, { segments: 16, material: 'Kupfer' });
s3d.sphere([2.2, 0, 0.7], 0.7, { segments: 14, material: 'Blau' });
s3d.box([3.8, -0.5, 0], 1, 1, 1, { material: 'Gelb' });
s3d.torus([6.3, 0, 0.3], 0.6, 0.25, { segments: 18, material: 'Gold' });`,
    );
    meshView.on = true;
    editor.select([{ kind: 'instance', id: [...editor.model.root.instances.values()][0].id }]);
    openPanel.value = 'mesh';
    cam(editor, [-1.5, -7, 4], [3.4, 0, 0.5]);
  },
  async palette(editor) {
    setTheme('dark');
    setScene('night');
    editor.newModel();
    run(editor, LANDSCAPE);
    settleLandscape(editor);
    cam(editor, [-19, -23, 13], [3, 3, 1.2]);
    openPalette('ansicht');
    await wait(300);
    const inp = document.querySelector<HTMLInputElement>('[role=dialog] input');
    inp?.setSelectionRange(inp.value.length, inp.value.length);
  },
  async measure(editor) {
    // origin close to the camera (cm labels on the axes), person and table further back (whole figure in view)
    setTheme('light');
    setScene('day');
    empty(editor);
    addScaleFigure(editor);
    const person = [...editor.model.root.instances.values()].find((instance) => instance.definition.faceMe);
    person?.matrix.setPosition(1.6, 2.6, 0);
    run(
      editor,
      `s3d.group('Tisch', () => {
  s3d.box([2.4, 2.2, 0.72], 1.2, 0.8, 0.04, { material: 'Eiche hell' });
  for (const [x, y] of [[2.45, 2.25], [3.5, 2.25], [2.45, 2.9], [3.5, 2.9]]) s3d.box([x, y, 0], 0.05, 0.05, 0.72, { material: 'Eiche hell' });
});`,
    );
    measureView.rulers = true;
    measureView.people = true;
    cam(editor, [0.1, -1.4, 0.95], [2.4, 2.6, 0.55], 52);
  },
  async script(editor) {
    // a file from a plugin package (or the app) in the script editor, run once: &language=<id>&file=<path>
    // (optional &camera=x,y,z&target=x,y,z, otherwise zoom extents)
    setTheme('light');
    setScene('day');
    empty(editor);
    const code = await (await fetch(params.get('file') ?? '')).text();
    useScripts().open({ lang: params.get('language') ?? 'js', code });
    openPanel.value = 'scripts';
    await wait(600);
    button('Ausführen')?.click();
    await until(() => editor.model.root.instances.size > 0);
    const [camera, target] = ['camera', 'target'].map((key) => params.get(key)?.split(',').map(Number));
    if (camera?.length === 3 && target?.length === 3) {
      cam(editor, camera, target);
    } else {
      editor.zoomExtents(false);
    }
  },
  async convert(editor) {
    // right-click › "Als Code öffnen ▸" – JavaScript, JSON, OBJ and the code formats of installed plugins
    setTheme('dark');
    setScene('night');
    empty(editor);
    run(editor, EXAMPLES.find((example) => example.id === 'house')!.code);
    cam(editor, [-13, -15, 8], [3, 3, 1.5]);
    editor.invalidate();
    await wait(400);
    // a real right-click on the house (the viewport selects what is under the cursor)
    const canvas = document.querySelector('canvas')!;
    const box = canvas.getBoundingClientRect();
    const point = { clientX: box.left + box.width * 0.42, clientY: box.top + box.height * 0.5 };
    const options = { ...point, button: 2, bubbles: true, pointerId: 1, pointerType: 'mouse' };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...options, buttons: 2 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0 }));
    await wait(300);
    const entry = ([...document.querySelectorAll('.s3d-menu-item')] as HTMLElement[]).find((item) =>
      item.textContent?.trim().startsWith('Als Code öffnen'),
    );
    entry?.dispatchEvent(new MouseEvent('mouseenter'));
  },
  async plugins(editor) {
    // the plugin manager: built-in plugins and the packages installed with &package=…
    setTheme('light');
    setScene('day');
    editor.newModel();
    run(editor, LANDSCAPE);
    settleLandscape(editor);
    cam(editor, [-19, -23, 13], [3, 3, 1.2]);
    openPanel.value = 'plugins';
  },
  async text3d(editor) {
    // the 3D-text plugin: letters in several free fonts, the dialog with its live preview
    setTheme('light');
    setScene('day');
    empty(editor);
    // stacked like a sign, so it fits next to the dialog
    const code = `s3d.text3d('Shap3D', { at: [0, 0, 3.3], size: 1.2, depth: 0.3, font: 'pacifico', material: 'Gold' });
s3d.text3d('BEBAS 2025', { at: [0, 0, 2.1], size: 0.9, depth: 0.25, font: 'bebas', material: 'Rot' });
s3d.text3d('Fredoka rund', { at: [0, 0, 1], size: 0.7, depth: 0.2, font: 'fredoka', material: 'Blau' });
s3d.text3d('Orbitron 3D', { at: [0, 0, 0], size: 0.6, depth: 0.15, font: 'orbitron', material: 'Edelstahl' });`;
    await prepareScript(code);
    run(editor, code);
    cam(editor, [0.9, -17, 5], [9.3, 0, 2], 38); // text on the left, the dialog in the middle
    editor.setTool('text3d.text');
    Object.assign(textDialog.form, { text: 'Hallo Welt!', font: 'lobster' });
    await until(
      () => !!document.querySelector('[role=dialog]') && !document.querySelector('[role=dialog]')?.textContent?.includes('wird geladen'),
      10000,
    );
    await document.fonts.ready;
  },
  async translations(editor) {
    // the languages plugin: translation editor with areas, English / German side by side and progress per language
    setTheme('light');
    setScene('day');
    editor.newModel();
    run(editor, LANDSCAPE);
    settleLandscape(editor);
    cam(editor, [-19, -23, 13], [3, 3, 1.2]);
    Object.assign(editorState, { target: 'de', area: 'menu', search: '', missingOnly: false, preview: false });
    openPanel.value = 'i18n.editor';
  },
  async tour(editor) {
    setTheme('light');
    setScene('day');
    editor.newModel();
    run(editor, LANDSCAPE);
    settleLandscape(editor);
    cam(editor, [-19, -23, 13], [3, 3, 1.2]);
    openTour(1);
    // headless Chrome does not advance CSS animations – freeze them at a moment where the box is pulled up
    await wait(300);
    for (const animation of document.getAnimations()) {
      animation.pause();
      animation.currentTime = 2250;
    }
  },
};

export const runShot = async (editor: Editor, name: string) => {
  const scene = SCENES[name];
  if (!scene) {
    console.error('unknown shot', name);
    return;
  }
  await pluginsReady; // scenes use plugin commands such as s3d.terrain()
  for (const folder of requestedPackages) {
    await installPackage(folder);
  }
  await until(
    () => requestedPackages.length === 0 || plugins.filter((entry) => !entry.builtin && entry.active).length >= requestedPackages.length,
    10000,
  );
  await scene(editor);
  editor.invalidate();
  await wait(800);
  document.body.dataset.shotReady = '1';
};

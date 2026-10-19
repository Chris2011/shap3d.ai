/**
 * Dev-only demo scenes for the README screenshots: http://localhost:5173/?shot=hero
 * Loaded by main.ts only in the dev server when a "shot" parameter is present (see scripts/screenshots.ps1).
 */
import type { Editor } from './engine/editor';
import { runScript } from './scripting/api';
import { EXAMPLES } from './scripting/examples';
import { setTheme, setScene } from './theme';
import { openPanel } from './components/panelState';
import { meshView } from './engine/meshView';
import { aiConfig } from './ai/providers';
import { aiHistory } from './ai/history';
import { openTerrain, generate } from './plugins/builtin/terrain/session';
import { pluginsReady } from './plugins/registry';
import { Entities } from './core/model';
import { bakeTerrain, cellSize, heightAt, terrainOf } from './plugins/builtin/terrain/terrainData';
import { addScaleFigure } from './engine/defaults';
import { measureView } from './engine/measureView';
import { openPalette } from './components/paletteState';
import { openTour } from './components/tour';

const wait = (delay: number) => new Promise(resolve => setTimeout(resolve, delay));
const cam = (editor: Editor, pos: number[], target: number[], fov = 35) => editor.viewer.rig.applyState({ position: pos, target, fov, ortho: false });
const run = (editor: Editor, code: string) => { const result = runScript(editor, code); if (!result.ok) console.error('shot script failed', result.error); };
const empty = (editor: Editor) => { editor.newModel(); for (const instance of [...editor.model.root.instances.values()]) editor.model.root.instances.delete(instance.id); };

const seed = Number(new URLSearchParams(location.search).get('seed') ?? 9);
const LANDSCAPE = `
s3d.terrain([-14, -10, -0.02], 34, 26, { hills: 5, scale: 15, seed: ${seed}, rock: 3.2, snow: 4.6, water: -0.2 });
${EXAMPLES.find(example => example.id === 'house')!.code}
const tree = s3d.component('Baum', () => {
  s3d.cylinder([0, 0, 0], 0.18, 2.2, { material: 'Rinde', segments: 10 });
  s3d.ellipsoid([0, 0, 3.2], 1.4, 1.4, 1.8, { material: 'Laub' });
});
for (const [x, y, s] of [[-4, 7, 1], [-6, 3, 0.8], [11, 8, 1.2], [13, 2, 0.9], [-3, -6, 0.7]]) tree.place([x, y, 0], 0, s);
`;

/** Building plot under the house (like the "Ebnen" brush) and trees standing on the ground. */
const settleLandscape = (editor: Editor) => {
  const terrainInstance = [...editor.model.root.instances.values()].find(instance => terrainOf(instance.definition)); if (!terrainInstance) return;
  const terrain = terrainOf(terrainInstance.definition)!; const originX = terrainInstance.matrix.elements[12], originY = terrainInstance.matrix.elements[13], originZ = terrainInstance.matrix.elements[14];
  const { cx: cellX, cy: cellY } = cellSize(terrain);
  for (let j = 0; j <= terrain.rows; j++) for (let i = 0; i <= terrain.columns; i++) {
    const x = originX + i * cellX, y = originY + j * cellY;
    const dist = Math.max(0, Math.max(-1.5 - x, x - 9.5, -1.5 - y, y - 7.5));   // outside the 11 × 9 m plot
    const weight = dist <= 0 ? 1 : Math.max(0, 1 - dist / 4);
    const k = j * (terrain.columns + 1) + i; terrain.heights[k] = terrain.heights[k] * (1 - weight) + (-originZ) * weight;
  }
  terrainInstance.definition.entities = new Entities(); bakeTerrain(terrainInstance.definition.entities, terrain, editor.model);
  for (const instance of editor.model.root.instances.values()) {
    if (instance.definition.name !== 'Baum') continue;
    const elements = instance.matrix.elements; elements[14] = originZ + heightAt(terrain, elements[12] - originX, elements[13] - originY) - 0.05;
  }
};

const SCENES: Record<string, (editor: Editor) => Promise<void>> = {
  async hero(editor) {
    setTheme('light'); setScene('day'); editor.newModel(); run(editor, LANDSCAPE); settleLandscape(editor);
    cam(editor, [-19, -23, 13], [3, 3, 1.2]);
  },
  async night(editor) {
    setTheme('dark'); setScene('night'); editor.newModel(); run(editor, LANDSCAPE); settleLandscape(editor);
    aiConfig.provider = 'ollama'; aiConfig.model = 'qwen2.5-coder:7b'; aiConfig.configured = true; aiConfig.fast = false;
    const now = Date.now();
    aiHistory.sessions.unshift({ id: 'demo', title: 'Gartenhaus', created: now - 60000, updated: now, model: aiConfig.model, turns: [
      { id: 1, role: 'user', text: 'Ein kleines Haus mit Satteldach, Fenstern und einer Holztür', createdAt: now - 52000 },
      { id: 2, role: 'assistant', text: 'Ich baue ein 8 × 6 m großes Haus mit Ziegeldach, zwei Fenstern und einer Holztür.', createdAt: now - 50000, endedAt: now - 21000, status: 'done', model: aiConfig.model,
        code: EXAMPLES.find(example => example.id === 'house')!.code.split('\n').slice(0, 14).join('\n'), lang: 'js', result: '+40 Flächen in 12 ms', undoable: true },
    ] } as any);
    aiHistory.currentId = 'demo';
    openPanel.value = 'ai';
    cam(editor, [-17, -21, 11], [1, 2, 1.2]);
  },
  async scripts(editor) {
    setTheme('light'); setScene('day'); empty(editor);
    run(editor, `s3d.cone([0, 0, 0], 0.6, 1.4, { material: 'Rot' });
s3d.pyramid([2, 0, 0], 1.3, 1.2, { material: 'Sand' });
s3d.torus([4, 0, 0.25], 0.6, 0.22, { material: 'Gold' });
s3d.tube([6, 0, 0], 0.6, 0.48, 1, { material: 'Edelstahl' });
s3d.dome([8.2, 0, 0], 0.8, { material: 'Marmor' });
s3d.prism([0, 2.6, 0], 0.6, 1.2, { sides: 6, material: 'Glas' });
s3d.stairs([2, 2, 0], { steps: 6, width: 1.2, material: 'Eiche hell' });
s3d.wedge([5.4, 2.1, 0], 1.6, 1, 0.8, { material: 'Beton' });`);
    openPanel.value = 'scripts';
    await wait(600);
    (([...document.querySelectorAll('button')] as HTMLElement[]).find(button => button.textContent?.trim() === 'API-Info'))?.click();
    cam(editor, [-4, -9, 6], [4, 2, 0.6]);
  },
  async terrain(editor) {
    setTheme('light'); setScene('day'); empty(editor);
    run(editor, `s3d.rect([0, 0, 0], 24, 18);`);
    editor.select([{ kind: 'face', id: [...editor.model.root.faces.values()][0].id }]);
    openTerrain(editor); generate('mountains');
    cam(editor, [-10, -16, 15], [12, 9, 1]);
  },
  async mesh(editor) {
    setTheme('dark'); setScene('night'); empty(editor);
    run(editor, `s3d.cylinder([0, 0, 0], 0.6, 1.2, { segments: 16, material: 'Kupfer' });
s3d.sphere([2.2, 0, 0.7], 0.7, { segments: 14, material: 'Blau' });
s3d.box([3.8, -0.5, 0], 1, 1, 1, { material: 'Gelb' });
s3d.torus([6.3, 0, 0.3], 0.6, 0.25, { segments: 18, material: 'Gold' });`);
    meshView.on = true;
    editor.select([{ kind: 'instance', id: [...editor.model.root.instances.values()][0].id }]);
    openPanel.value = 'mesh';
    cam(editor, [-1.5, -7, 4], [3.4, 0, 0.5]);
  },
  async palette(editor) {
    setTheme('dark'); setScene('night'); editor.newModel(); run(editor, LANDSCAPE); settleLandscape(editor);
    cam(editor, [-19, -23, 13], [3, 3, 1.2]);
    openPalette('ansicht');
    await wait(300);
    const inp = document.querySelector<HTMLInputElement>('[role=dialog] input'); inp?.setSelectionRange(inp.value.length, inp.value.length);
  },
  async measure(editor) {
    // origin close to the camera (cm labels on the axes), person and table further back (whole figure in view)
    setTheme('light'); setScene('day'); empty(editor);
    addScaleFigure(editor);
    const person = [...editor.model.root.instances.values()].find(instance => instance.definition.faceMe);
    person?.matrix.setPosition(1.6, 2.6, 0);
    run(editor, `s3d.group('Tisch', () => {
  s3d.box([2.4, 2.2, 0.72], 1.2, 0.8, 0.04, { material: 'Eiche hell' });
  for (const [x, y] of [[2.45, 2.25], [3.5, 2.25], [2.45, 2.9], [3.5, 2.9]]) s3d.box([x, y, 0], 0.05, 0.05, 0.72, { material: 'Eiche hell' });
});`);
    measureView.rulers = true; measureView.people = true;
    cam(editor, [0.1, -1.4, 0.95], [2.4, 2.6, 0.55], 52);
  },
  async tour(editor) {
    setTheme('light'); setScene('day'); editor.newModel(); run(editor, LANDSCAPE); settleLandscape(editor);
    cam(editor, [-19, -23, 13], [3, 3, 1.2]);
    openTour(1);
    // headless Chrome does not advance CSS animations – freeze them at a moment where the box is pulled up
    await wait(300);
    for (const animation of document.getAnimations()) { animation.pause(); animation.currentTime = 2250; }
  },
};

export const runShot = async (editor: Editor, name: string) => {
  const scene = SCENES[name]; if (!scene) { console.error('unknown shot', name); return; }
  await pluginsReady; // scenes use plugin commands such as s3d.terrain()
  await scene(editor);
  editor.invalidate();
  await wait(800);
  document.body.dataset.shotReady = '1';
};

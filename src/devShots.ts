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
import { openTerrain, generate } from './terrain/session';
import { Entities } from './core/model';
import { bakeTerrain, cellSize, heightAt } from './core/terrain';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));
const cam = (ed: Editor, pos: number[], target: number[], fov = 35) => ed.viewer.rig.applyState({ pos, target, fov, ortho: false });
const run = (ed: Editor, code: string) => { const r = runScript(ed, code); if (!r.ok) console.error('shot script failed', r.error); };
const empty = (ed: Editor) => { ed.newModel(); for (const i of [...ed.model.root.instances.values()]) ed.model.root.instances.delete(i.id); };

const seed = Number(new URLSearchParams(location.search).get('seed') ?? 9);
const LANDSCAPE = `
s3d.terrain([-14, -10, -0.02], 34, 26, { hills: 5, scale: 15, seed: ${seed}, rock: 3.2, snow: 4.6, water: -0.2 });
${EXAMPLES.find(e => e.id === 'house')!.code}
const tree = s3d.component('Baum', () => {
  s3d.cylinder([0, 0, 0], 0.18, 2.2, { material: 'Rinde', segments: 10 });
  s3d.ellipsoid([0, 0, 3.2], 1.4, 1.4, 1.8, { material: 'Laub' });
});
for (const [x, y, s] of [[-4, 7, 1], [-6, 3, 0.8], [11, 8, 1.2], [13, 2, 0.9], [-3, -6, 0.7]]) tree.place([x, y, 0], 0, s);
`;

/** Building plot under the house (like the "Ebnen" brush) and trees standing on the ground. */
function settleLandscape(ed: Editor) {
  const t = [...ed.model.root.instances.values()].find(i => i.def.terrain); if (!t?.def.terrain) return;
  const d = t.def.terrain; const ox = t.matrix.elements[12], oy = t.matrix.elements[13], oz = t.matrix.elements[14];
  const { cx, cy } = cellSize(d);
  for (let j = 0; j <= d.ny; j++) for (let i = 0; i <= d.nx; i++) {
    const x = ox + i * cx, y = oy + j * cy;
    const dist = Math.max(0, Math.max(-1.5 - x, x - 9.5, -1.5 - y, y - 7.5));   // outside the 11 × 9 m plot
    const w = dist <= 0 ? 1 : Math.max(0, 1 - dist / 4);
    const k = j * (d.nx + 1) + i; d.h[k] = d.h[k] * (1 - w) + (-oz) * w;
  }
  t.def.entities = new Entities(); bakeTerrain(t.def.entities, d, ed.model);
  for (const i of ed.model.root.instances.values()) {
    if (i.def.name !== 'Baum') continue;
    const e = i.matrix.elements; e[14] = oz + heightAt(d, e[12] - ox, e[13] - oy) - 0.05;
  }
}

const SCENES: Record<string, (ed: Editor) => Promise<void>> = {
  async hero(ed) {
    setTheme('light'); setScene('day'); ed.newModel(); run(ed, LANDSCAPE); settleLandscape(ed);
    cam(ed, [-19, -23, 13], [3, 3, 1.2]);
  },
  async night(ed) {
    setTheme('dark'); setScene('night'); ed.newModel(); run(ed, LANDSCAPE); settleLandscape(ed);
    aiConfig.provider = 'ollama'; aiConfig.model = 'qwen2.5-coder:7b'; aiConfig.configured = true; aiConfig.fast = false;
    const now = Date.now();
    aiHistory.sessions.unshift({ id: 'demo', title: 'Gartenhaus', created: now - 60000, updated: now, model: aiConfig.model, turns: [
      { id: 1, role: 'user', text: 'Ein kleines Haus mit Satteldach, Fenstern und einer Holztür', ts: now - 52000 },
      { id: 2, role: 'assistant', text: 'Ich baue ein 8 × 6 m großes Haus mit Ziegeldach, zwei Fenstern und einer Holztür.', ts: now - 50000, endTs: now - 21000, status: 'done', model: aiConfig.model,
        code: EXAMPLES.find(e => e.id === 'house')!.code.split('\n').slice(0, 14).join('\n'), lang: 'js', result: '+40 Flächen in 12 ms', undoable: true },
    ] } as any);
    aiHistory.currentId = 'demo';
    openPanel.value = 'ai';
    cam(ed, [-17, -21, 11], [1, 2, 1.2]);
  },
  async scripts(ed) {
    setTheme('light'); setScene('day'); empty(ed);
    run(ed, `s3d.cone([0, 0, 0], 0.6, 1.4, { material: 'Rot' });
s3d.pyramid([2, 0, 0], 1.3, 1.2, { material: 'Sand' });
s3d.torus([4, 0, 0.25], 0.6, 0.22, { material: 'Gold' });
s3d.tube([6, 0, 0], 0.6, 0.48, 1, { material: 'Edelstahl' });
s3d.dome([8.2, 0, 0], 0.8, { material: 'Marmor' });
s3d.prism([0, 2.6, 0], 0.6, 1.2, { sides: 6, material: 'Glas' });
s3d.stairs([2, 2, 0], { steps: 6, width: 1.2, material: 'Eiche hell' });
s3d.wedge([5.4, 2.1, 0], 1.6, 1, 0.8, { material: 'Beton' });`);
    openPanel.value = 'scripts';
    await wait(600);
    (([...document.querySelectorAll('.se .lnk')] as HTMLElement[]).find(b => b.textContent?.includes('API-Info')))?.click();
    cam(ed, [-4, -9, 6], [4, 2, 0.6]);
  },
  async terrain(ed) {
    setTheme('light'); setScene('day'); empty(ed);
    run(ed, `s3d.rect([0, 0, 0], 24, 18);`);
    ed.select([{ kind: 'face', id: [...ed.model.root.faces.values()][0].id }]);
    openTerrain(ed); generate('mountains');
    cam(ed, [-10, -16, 15], [12, 9, 1]);
  },
  async mesh(ed) {
    setTheme('dark'); setScene('night'); empty(ed);
    run(ed, `s3d.cylinder([0, 0, 0], 0.6, 1.2, { segments: 16, material: 'Kupfer' });
s3d.sphere([2.2, 0, 0.7], 0.7, { segments: 14, material: 'Blau' });
s3d.box([3.8, -0.5, 0], 1, 1, 1, { material: 'Gelb' });
s3d.torus([6.3, 0, 0.3], 0.6, 0.25, { segments: 18, material: 'Gold' });`);
    meshView.on = true;
    ed.select([{ kind: 'instance', id: [...ed.model.root.instances.values()][0].id }]);
    openPanel.value = 'mesh';
    cam(ed, [-1.5, -7, 4], [3.4, 0, 0.5]);
  },
};

export async function runShot(ed: Editor, name: string) {
  const s = SCENES[name]; if (!s) { console.error('unknown shot', name); return; }
  await s(ed);
  ed.invalidate();
  await wait(800);
  document.body.dataset.shotReady = '1';
}

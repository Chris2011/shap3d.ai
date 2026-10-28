// Noise for Shap3D.ai – seeded simplex noise (fBm, ridged, billow) for landscapes and more.
// - noise terrains: hills, mountains, islands, canyons and dunes with a live preview; they are height grids in the
//   built-in terrain plugin's format, so the Terrain tool keeps sculpting them
// - scattering trees, bushes, rocks or the model's own components by a noise mask (clumps, slopes, water)
// - roughening groups: faces refined and moved by 3D noise (terrains: their height grid)
// - a noise material shader, and s3d.noise / s3d.fbm / s3d.noiseTerrain / s3d.scatter / s3d.noiseDeform for scripts
import type { Editor } from '../../../src/engine/editor';
import type { S3dPlugin } from '../../../src/plugins/types';
import type { ScriptApi } from '../../../src/scripting/api';
import S3dNoisePanel from './S3dNoisePanel.vue';
import {
  noiseDeform,
  noiseTerrain,
  paving,
  scatter,
  type DeformCall,
  type NoiseTerrainData,
  type PavingCall,
  type ScatterCall,
  type TerrainCall,
} from './actions';
import { cellular, fractal, simplex, type FractalOptions } from './noise';
import { MESSAGES, useRuntime } from './runtime';
import { CELLS_SHADER, NOISE_SHADER } from './shader';
import { injectStyles } from './styles';
import { PANEL, openPanel } from './tabs';

const plugin: S3dPlugin = {
  id: 'noise',
  name: 'noise.plugin.name',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'noise.plugin.description',
  messages: MESSAGES,

  activate(context) {
    useRuntime(context);
    context.onDispose(injectStyles());
    context.materials.registerShader(NOISE_SHADER);
    context.materials.registerShader(CELLS_SHADER);

    context.icons.register(
      'noise',
      '<path d="M3 17c2.2-4.5 3.6-6 5-6s2 2.5 3.4 2.5S14 6 16 6s2.6 5 5 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 20.5h18" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/><circle cx="7" cy="5" r="1" fill="currentColor"/><circle cx="11" cy="3.5" r="0.8" fill="currentColor"/><circle cx="20" cy="4" r="0.9" fill="currentColor"/>',
    );
    context.panels.register({ id: PANEL, label: 'noise.panel.title', icon: 'noise', width: 340, component: S3dNoisePanel, tile: 'last' });
    context.commands.register({
      id: 'open',
      label: 'noise.commands.open',
      icon: 'noise',
      keywords:
        'noise perlin simplex fbm terrain landscape island mountains scatter trees rocks rauschen gelände landschaft insel berge bäume steine streuen', // i18n-ignore – search words
      run: () => openPanel('terrain'),
    });
    for (const tab of ['scatter', 'paving', 'deform'] as const) {
      context.commands.register({ id: tab, label: `noise.commands.${tab}`, icon: 'noise', run: () => openPanel(tab) });
    }

    const selectedInstance = (editor: Editor) => {
      const selection = editor.selected();
      return selection.length === 1 && selection[0].kind === 'instance' ? editor.entities.instances.get(selection[0].id) : undefined;
    };
    context.ui.addContextMenuEntry({
      label: 'noise.menu.edit',
      when: (editor) => {
        const instance = selectedInstance(editor);
        return !!instance && !!context.data.get<NoiseTerrainData>(instance.definition);
      },
      run: () => openPanel('terrain'),
    });
    context.ui.addContextMenuEntry({
      label: 'noise.menu.deform',
      when: (editor) => editor.selected().some((entityRef) => entityRef.kind === 'instance'),
      run: () => openPanel('deform'),
    });

    context.ui.addContextMenuEntry({
      label: 'noise.menu.paving',
      when: (editor) => editor.selected().some((entityRef) => entityRef.kind === 'face'),
      run: () => openPanel('paving'),
    });

    // ------------------------------------------------------------ script functions
    // i18n-ignore-next-line – API category ids
    const CATEGORIES = { helpers: 'Hilfen', solids: 'Körper', groups: 'Gruppen & Komponenten', editing: 'Flächen bearbeiten' } as const;
    context.script.extend(
      'noise',
      (_api: ScriptApi, x: number, y: number, z?: number, seed = 0) => {
        const noise = simplex(seed);
        return z == null ? noise.noise2(x, y) : noise.noise3(x, y, z);
      },
      {
        category: CATEGORIES.helpers,
        title: 'noise.script.noiseTitle',
        returns: 'api.returns.zahl',
        signature: 's3d.noise(x, y, z?, seed?)',
        description: 'noise.script.noiseDescription',
        example: 'for (let i = 0; i < 20; i++) {\n  s3d.box([i * 0.5, 0, 0], 0.4, 0.4, 1 + s3d.noise(i * 0.2, 0));\n}',
      },
    );
    context.script.extend(
      'fbm',
      (_api: ScriptApi, x: number, y: number, options: FractalOptions & { z?: number } = {}) => fractal(x, y, options.z, options),
      {
        category: CATEGORIES.helpers,
        title: 'noise.script.fbmTitle',
        returns: 'api.returns.zahl',
        signature: 's3d.fbm(x, y, { z, seed, octaves, persistence, lacunarity, mode })',
        description: 'noise.script.fbmDescription',
        example: "const value = s3d.fbm(3.2, 1.5, { octaves: 5, mode: 'ridged' });",
      },
    );
    context.script.extend('cellNoise', (_api: ScriptApi, x: number, y: number, seed = 0, jitter = 1) => cellular(x, y, seed, jitter), {
      category: CATEGORIES.helpers,
      title: 'noise.script.cellTitle',
      returns: 'noise.script.cellReturns',
      signature: 's3d.cellNoise(x, y, seed?, jitter?)',
      description: 'noise.script.cellDescription',
      example: 'const { f1, f2, id } = s3d.cellNoise(2.3, 4.1);',
    });
    context.script.extend('paving', (api: ScriptApi, call?: PavingCall) => paving(api, call), {
      category: CATEGORIES.solids,
      title: 'noise.script.pavingTitle',
      returns: 'api.returns.gruppe',
      signature:
        's3d.paving({ on, area, z, size, gap, jitter, stretch, thickness, variation, bevel, shades, color, material, joint, seed })',
      description: 'noise.script.pavingDescription',
      example: "s3d.paving({ area: [0, 0, 6, 4], size: 0.5, gap: 0.02, color: '#a39a8c', joint: true });",
    });
    context.script.extend('noiseTerrain', (api: ScriptApi, call?: TerrainCall) => noiseTerrain(api, call), {
      category: CATEGORIES.solids,
      title: 'noise.script.terrainTitle',
      returns: 'api.returns.gruppe',
      signature:
        's3d.noiseTerrain({ at, width, depth, detail, seed, scale, height, octaves, persistence, lacunarity, mode, warp, exponent, terraces, terraceSharpness, falloff, water, snow, rock, skirt, name })',
      description: 'noise.script.terrainDescription',
      example: "s3d.noiseTerrain({ width: 80, depth: 60, height: 14, mode: 'ridged', snow: 11, water: 1, seed: 4 });",
    });
    context.script.extend('scatter', (api: ScriptApi, call?: ScatterCall) => scatter(api, call), {
      category: CATEGORIES.groups,
      title: 'noise.script.scatterTitle',
      returns: 'api.returns.gruppe',
      signature:
        's3d.scatter({ on, area, objects, spacing, density, clumping, clumpSize, seed, maxSlope, minHeight, maxHeight, sizeMin, sizeMax, limit })',
      description: 'noise.script.scatterDescription',
      example:
        "const land = s3d.noiseTerrain({ width: 50, depth: 50 });\ns3d.scatter({ on: land, objects: ['conifer', 'rock'], spacing: 3 });",
    });
    context.script.extend('noiseDeform', (api: ScriptApi, call?: DeformCall) => noiseDeform(api, call), {
      category: CATEGORIES.editing,
      title: 'noise.script.deformTitle',
      returns: 'api.returns.zahl',
      signature: 's3d.noiseDeform({ target, amount, scale, detail, octaves, persistence, mode, seed })',
      description: 'noise.script.deformDescription',
      example: 'const stone = s3d.box([0, 0, 0], 2, 2, 1);\ns3d.noiseDeform({ target: stone, amount: 0.3, scale: 1 });',
    });
  },
};

export default plugin;

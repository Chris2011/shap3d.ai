// Noise for Shap3D.ai – seeded simplex noise (fBm, ridged, billow) for landscapes and more.
// - noise terrains: hills, mountains, islands, canyons and dunes with a live preview; they are height grids in the
//   built-in terrain plugin's format, so the Terrain tool keeps sculpting them
// - scattering trees, bushes, rocks or the model's own components by a noise mask (clumps, slopes, water)
// - villages on gentle slopes, connected by roads
// - rivers dug through the valleys and roads that find the gentlest way (cut, filled and bridged)
// - roughening groups: faces refined and moved by 3D noise (terrains: their height grid)
// - a noise material shader, and s3d.noise / s3d.fbm / s3d.noiseTerrain / s3d.scatter / s3d.noiseDeform for scripts
import type { Editor } from '../../../src/engine/editor';
import type { S3dPlugin } from '../../../src/plugins/types';
import type { ScriptApi } from '../../../src/scripting/api';
import S3dNoisePanel from './S3dNoisePanel.vue';
import {
  city,
  erodeTerrain,
  facade,
  noiseDeform,
  paving,
  river,
  road,
  scatter,
  tree,
  villages,
  type CityCall,
  type DeformCall,
  type ErodeCall,
  type FacadeCall,
  type NoiseTerrainData,
  type PavingCall,
  type RiverCall,
  type RoadCall,
  type ScatterCall,
  type Target,
  type TerrainCall,
  type TreeCall,
  type VillagesCall,
} from './actions';
import { TERRAIN_FORMAT, cellular, fractal, gridFrom, simplex, type FractalOptions } from '@shap3d/procgen';
import { ownGridWrite, readGrid, takeSculpting } from './recipes';
import { editTerrainStep, noiseTerrainWithRecipe, rebuildTerrain, terrainSteps, type EditStepCall } from './rebuild';
import { MESSAGES, t, useRuntime } from './runtime';
import { CELLS_SHADER, FACADE_SHADER, NOISE_SHADER } from './shader';
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
    // the terrain plugin's height grid – declared here too, so this plugin works without that one running
    context.data.formats.register({ ...TERRAIN_FORMAT, validate: (value) => !!gridFrom(value) });
    // sculpting a terrain with steps becomes a step of its own right away (in the same undo step as the sculpting)
    context.events.onDataChange(({ key, target }) => {
      if (key === TERRAIN_FORMAT.key && target && !('definition' in target) && !ownGridWrite(target)) {
        takeSculpting({ definition: target });
      }
    });
    context.onDispose(injectStyles());
    context.materials.registerShader(NOISE_SHADER);
    context.materials.registerShader(CELLS_SHADER);
    context.materials.registerShader(FACADE_SHADER);

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
    for (const tab of ['scatter', 'paving', 'city', 'deform'] as const) {
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
        return !!instance && !!context.data.get<NoiseTerrainData>(instance.definition)?.settings;
      },
      run: () => openPanel('terrain'),
    });
    context.ui.addContextMenuEntry({
      label: 'noise.menu.erode',
      when: (editor) => {
        const instance = selectedInstance(editor);
        return !!instance && !!readGrid(instance);
      },
      run: () => {
        const result = context.script.run('s3d.erode();');
        context.ui.toast(result.ok ? t('noise.erosion.done') : String(result.error ?? ''));
      },
    });
    context.ui.addContextMenuEntry({
      label: 'noise.menu.deform',
      when: (editor) => editor.selected().some((entityRef) => entityRef.kind === 'instance'),
      run: () => openPanel('deform'),
    });

    context.ui.addContextMenuEntry({
      label: 'noise.menu.facade',
      when: (editor) => editor.selected().some((entityRef) => entityRef.kind === 'face'),
      run: () => openPanel('city'),
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
    context.script.extend('facade', (api: ScriptApi, call?: FacadeCall) => facade(api, call), {
      category: CATEGORIES.solids,
      title: 'noise.script.facadeTitle',
      returns: 'api.returns.gruppe',
      signature:
        's3d.facade({ on, floorHeight, groundFloor, shops, windowWidth, windowHeight, spacing, sill, margin, balconies, shutters, lit, gaps, seed })',
      description: 'noise.script.facadeDescription',
      example: 'const house = s3d.box([0, 0, 0], 12, 9, 15);\ns3d.facade({ on: house, balconies: 0.4, seed: 3 });',
    });
    context.script.extend('city', (api: ScriptApi, call?: CityCall) => city(api, call), {
      category: CATEGORIES.solids,
      title: 'noise.script.cityTitle',
      returns: 'api.returns.gruppe',
      signature:
        's3d.city({ at, on, flatten, width, depth, block, street, plot, gap, minFloors, maxFloors, floorHeight, scale, centre, empty, sidewalk, roofs, pitchedFloors, courts, parks, treeSpacing, markings, ground, seed })',
      description: 'noise.script.cityDescription',
      example: 's3d.city({ width: 200, depth: 150, maxFloors: 25, seed: 4 });',
    });
    context.script.extend('tree', (api: ScriptApi, call?: TreeCall) => tree(api, call), {
      category: CATEGORIES.solids,
      title: 'noise.script.treeTitle',
      returns: 'api.returns.gruppe',
      signature: "s3d.tree({ at, species: 'oak' | 'birch' | 'pine' | 'palm', height, gnarl, density, rotation, seed })",
      description: 'noise.script.treeDescription',
      example: "for (let i = 0; i < 5; i++) {\n  s3d.tree({ at: [i * 8, 0, 0], species: 'oak', height: 8 + i, seed: i });\n}",
    });
    context.script.extend('river', (api: ScriptApi, call?: RiverCall) => river(api, call), {
      category: CATEGORIES.editing,
      title: 'noise.script.riverTitle',
      returns: 'api.returns.gruppe',
      signature: 's3d.river({ target, from, to, width, depth, wiggle, seed })',
      description: 'noise.script.riverDescription',
      example:
        'const land = s3d.noiseTerrain({ width: 100, depth: 70, height: 14, detail: 110 });\ns3d.river({ target: land, width: 6, depth: 1.5 });',
    });
    context.script.extend('road', (api: ScriptApi, call?: RoadCall) => road(api, call), {
      category: CATEGORIES.editing,
      title: 'noise.script.roadTitle',
      returns: 'api.returns.gruppe',
      signature: "s3d.road({ target, from, to, along, width, surface: 'asphalt' | 'gravel', maxGrade, markings, seed })",
      description: 'noise.script.roadDescription',
      example:
        'const land = s3d.noiseTerrain({ width: 100, depth: 70, height: 14, detail: 110 });\ns3d.road({ target: land, from: [5, 5, 0], to: [95, 65, 0], maxGrade: 8 });',
    });
    context.script.extend('villages', (api: ScriptApi, call?: VillagesCall) => villages(api, call), {
      category: CATEGORIES.groups,
      title: 'noise.script.villagesTitle',
      returns: 'api.returns.gruppe',
      signature: "s3d.villages({ target, count, houses, roadWidth, maxSlope, roads: 'gravel' | 'asphalt' | 'none', seed })",
      description: 'noise.script.villagesDescription',
      example:
        'const land = s3d.noiseTerrain({ width: 300, depth: 220, detail: 120, height: 20, scale: 90 });\ns3d.villages({ target: land, count: 5, houses: 16 });',
    });
    context.script.extend('rebuildTerrain', (api: ScriptApi, call?: { target?: Target }) => rebuildTerrain(api, call), {
      category: CATEGORIES.editing,
      title: 'noise.script.rebuildTitle',
      returns: 'api.returns.zahl',
      signature: 's3d.rebuildTerrain({ target })',
      description: 'noise.script.rebuildDescription',
      example:
        'const land = s3d.noiseTerrain({ width: 120, depth: 90, height: 10 });\ns3d.river({ target: land });\ns3d.rebuildTerrain({ target: land });',
    });
    context.script.extend('terrainSteps', (api: ScriptApi, call?: { target?: Target }) => terrainSteps(api, call), {
      category: CATEGORIES.editing,
      title: 'noise.script.stepsTitle',
      returns: 'noise.script.stepsReturns',
      signature: 's3d.terrainSteps({ target })',
      description: 'noise.script.stepsDescription',
      example: 's3d.terrainSteps().forEach((step) => s3d.print(step.index, step.kind, step.enabled));',
    });
    context.script.extend('editTerrainStep', (api: ScriptApi, call: EditStepCall) => editTerrainStep(api, call), {
      category: CATEGORIES.editing,
      title: 'noise.script.editStepTitle',
      returns: 'api.returns.zahl',
      signature: 's3d.editTerrainStep({ target, index, enabled, seed, remove })',
      description: 'noise.script.editStepDescription',
      example: 's3d.editTerrainStep({ index: 0, seed: 7 });',
    });
    context.script.extend('erode', (api: ScriptApi, call?: ErodeCall) => erodeTerrain(api, call), {
      category: CATEGORIES.editing,
      title: 'noise.script.erodeTitle',
      returns: 'api.returns.zahl',
      signature: 's3d.erode({ target, amount, strength, seed })',
      description: 'noise.script.erodeDescription',
      example:
        "const land = s3d.noiseTerrain({ width: 80, depth: 60, height: 14, mode: 'ridged' });\ns3d.erode({ target: land, amount: 2, strength: 0.6 });",
    });
    context.script.extend('noiseTerrain', (api: ScriptApi, call?: TerrainCall) => noiseTerrainWithRecipe(api, call), {
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

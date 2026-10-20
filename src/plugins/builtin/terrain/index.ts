import type { Editor } from '../../../engine/editor';
import type { Pt } from '../../../scripting/api';
import type { S3dPlugin } from '../../types';
import { TerrainTool } from './tool';
import S3dTerrainPanel from './S3dTerrainPanel.vue';
import german from './i18n/de.json';
import english from './i18n/en.json';
import spanish from './i18n/es.json';
import french from './i18n/fr.json';
import arabic from './i18n/ar.json';
import { TERRAIN_TOOL, session, discardTerrain } from './session';
import { newTerrain, generateHills, bakeTerrain, terrainOf, setTerrain, TERRAIN_PLUGIN } from './terrainData';

/** the selected group that is a terrain made by this plugin, if any */
const selectedTerrain = (editor: Editor) =>
  editor.selected().some((entityRef) => {
    if (entityRef.kind !== 'instance') {
      return false;
    }
    const instance = editor.entities.instances.get(entityRef.id);
    return !!instance && !!terrainOf(instance.definition);
  });

/**
 * Built-in plugin: the terrain sandbox – sculpt landscapes with a brush (raise, lower, smooth,
 * flatten, roughen), grass/earth/rock/snow painted by height and slope, water, and s3d.terrain().
 * Everything is registered through the plugin API; the height grid is kept on the group
 * (`pluginData.terrain`), so terrains stay in the model even while the plugin is switched off.
 */
const terrainPlugin: S3dPlugin = {
  id: TERRAIN_PLUGIN,
  name: 'terrain.plugin.name',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'terrain.plugin.description',
  messages: { de: german.messages, en: english.messages, fr: french.messages, es: spanish.messages, ar: arabic.messages },

  activate(context) {
    const start = (editor: Editor) => editor.setTool(TERRAIN_TOOL);

    context.tools.register({ id: 'sandbox', name: 'terrain.plugin.name', icon: 'terrain', create: (editor) => new TerrainTool(editor) });

    context.commands.register({
      id: 'open',
      label: 'terrain.plugin.command',
      group: 'edit',
      icon: 'terrain',
      keywords: 'gelände berge landschaft terrain sandkiste hügel sandbox mountains landscape hills', // i18n-ignore
      run: start,
    });

    // the floating sculpt window (shows itself while a session or the "new terrain" chooser is open)
    context.ui.addWindow(S3dTerrainPanel);

    context.ui.addContextMenuEntry({ label: 'terrain.plugin.editEntry', when: selectedTerrain, run: start });
    context.ui.addContextMenuEntry({
      label: 'terrain.plugin.fromFaceEntry',
      when: (editor) => {
        const selection = editor.selected();
        return !selectedTerrain(editor) && selection.length === 1 && selection[0].kind === 'face';
      },
      run: start,
    });

    context.script.extend(
      'terrain',
      (
        api,
        corner: Pt,
        width: number | string,
        depth: number | string,
        opts: {
          hills?: number | string;
          scale?: number | string;
          seed?: number;
          rock?: number | string;
          snow?: number | string;
          water?: number | string;
          skirt?: boolean;
          cell?: number | string;
          name?: string;
        } = {},
      ) => {
        const [x, y, z] = Array.isArray(corner) ? corner : [corner.x, corner.y, corner.z];
        const widthValue = api.length(width),
          depthValue = api.length(depth);
        const data = newTerrain(widthValue, depthValue, opts.cell != null ? api.length(opts.cell) : undefined);
        const hills = opts.hills != null ? api.length(opts.hills) : Math.max(widthValue, depthValue) * 0.1;
        if (hills > 0) {
          generateHills(data, { height: hills, scale: opts.scale != null ? api.length(opts.scale) : undefined, seed: opts.seed });
        }
        data.layers.rockHeight = opts.rock != null ? api.length(opts.rock) : Math.max(1, hills * 0.7);
        if (opts.snow != null) {
          data.layers.snowHeight = api.length(opts.snow);
        }
        if (opts.water != null) {
          data.water = api.length(opts.water);
        }
        if (opts.skirt === false) {
          data.skirt = false;
        }
        const group = api.group(
          opts.name ?? 'Gelände', // i18n-ignore – default name (s3d API)
          (inner) => {
            bakeTerrain(inner.ents, data, api.editor.model);
          },
        );
        setTerrain(group.inst.definition, data);
        return group.move([x, y, z]);
      },
      {
        category: 'Körper', // i18n-ignore – API category
        title: 'terrain.plugin.apiTitle',
        signature: 's3d.terrain(ecke, breite, tiefe, { hills, scale, seed, rock, snow, water, skirt })',
        returns: 'api.returns.gruppe',
        description: 'terrain.plugin.apiDescription',
        example: 's3d.terrain([0, 0, 0], 30, 20, { hills: 5, snow: 4.5, water: 0.4, seed: 3 });',
      },
    );

    // switching the plugin off in the middle of sculpting drops the unsaved session
    context.onDispose(() => {
      if (session()) {
        discardTerrain();
      }
    });
  },
};

export default terrainPlugin;

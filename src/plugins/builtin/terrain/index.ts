import type { Editor } from '../../../engine/editor';
import type { Pt } from '../../../scripting/api';
import type { S3dPlugin } from '../../types';
import { TerrainTool } from './tool';
import S3dTerrainPanel from './S3dTerrainPanel.vue';
import { TERRAIN_TOOL, session, discardTerrain } from './session';
import { newTerrain, generateHills, bakeTerrain, terrainOf, setTerrain, TERRAIN_PLUGIN } from './terrainData';

/** the selected group that is a terrain made by this plugin, if any */
const selectedTerrain = (editor: Editor) => editor.selected().some(entityRef => {
  if (entityRef.kind !== 'instance') return false;
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
  name: 'Gelände (Sandkiste)',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'Landschaften mit dem Pinsel formen – Anheben, Absenken, Glätten, Ebnen, Zerklüften; Gras, Erde, Fels und Schnee nach Höhe und Neigung, dazu Wasser. Bringt s3d.terrain() für Skripte mit.',

  activate(context) {
    const start = (editor: Editor) => editor.setTool(TERRAIN_TOOL);

    context.tools.register({ id: 'sandbox', name: 'Gelände (Sandkiste)', icon: 'terrain', create: editor => new TerrainTool(editor) });

    context.commands.register({
      id: 'open',
      label: 'Gelände (Sandkiste): Berge & Täler formen',
      group: 'Bearbeiten',
      icon: 'terrain',
      keywords: 'gelände berge landschaft terrain sandkiste hügel',
      run: start,
    });

    // the floating sculpt window (shows itself while a session or the "new terrain" chooser is open)
    context.ui.addWindow(S3dTerrainPanel);

    context.ui.addContextMenuEntry({ label: '⛰ Gelände bearbeiten', when: selectedTerrain, run: start });
    context.ui.addContextMenuEntry({
      label: '⛰ Gelände aus Fläche',
      when: editor => { const selection = editor.selected(); return !selectedTerrain(editor) && selection.length === 1 && selection[0].kind === 'face'; },
      run: start,
    });

    context.script.extend('terrain', (api, corner: Pt, width: number | string, depth: number | string,
      opts: { hills?: number | string; scale?: number | string; seed?: number; rock?: number | string; snow?: number | string; water?: number | string; skirt?: boolean; cell?: number | string; name?: string } = {}) => {
      const [x, y, z] = Array.isArray(corner) ? corner : [corner.x, corner.y, corner.z];
      const widthValue = api.length(width), depthValue = api.length(depth);
      const data = newTerrain(widthValue, depthValue, opts.cell != null ? api.length(opts.cell) : undefined);
      const hills = opts.hills != null ? api.length(opts.hills) : Math.max(widthValue, depthValue) * 0.1;
      if (hills > 0) generateHills(data, { height: hills, scale: opts.scale != null ? api.length(opts.scale) : undefined, seed: opts.seed });
      data.layers.rockHeight = opts.rock != null ? api.length(opts.rock) : Math.max(1, hills * 0.7);
      if (opts.snow != null) data.layers.snowHeight = api.length(opts.snow);
      if (opts.water != null) data.water = api.length(opts.water);
      if (opts.skirt === false) data.skirt = false;
      const group = api.group(opts.name ?? 'Gelände', inner => { bakeTerrain(inner.ents, data, api.editor.model); });
      setTerrain(group.inst.definition, data);
      return group.move([x, y, z]);
    }, {
      category: 'Körper',
      title: 'Gelände (Landschaft)',
      signature: 's3d.terrain(ecke, breite, tiefe, { hills, scale, seed, rock, snow, water, skirt })',
      returns: 'Gruppe',
      description: 'Landschaft mit Hügeln und Bergen. Gras auf Ebenen, Erde an Hängen, Fels oben, optional Schnee und Wasser. hills = Berghöhe (0 = flach). Danach mit dem Gelände-Werkzeug weiter formbar.',
      example: 's3d.terrain([0, 0, 0], 30, 20, { hills: 5, snow: 4.5, water: 0.4, seed: 3 });',
    });

    // switching the plugin off in the middle of sculpting drops the unsaved session
    context.onDispose(() => { if (session()) discardTerrain(); });
  },
};

export default terrainPlugin;

// Level editor for Shap3D.ai – game objects in the model, ready for a game engine.
// - level objects: spawn points, triggers (a volume), pickups and waypoints – components of the model, each placed
//   object with its own id and properties (plugin data on the instance), so the app's tools work on them
// - a place tool (the kind follows the pointer on the surface, R turns it) and a panel with the selected object's
//   properties and a list of all objects
// - a level mode: the 3D view with only the level tools and panels
// - export: the model as glTF and a level file (JSON) with ids, kinds, places and properties of the objects
// Scripts can do the same: s3d.levelObject(kind, { at, rotation, size, props }), s3d.levelObjects(), s3d.levelFile().
// No other plugin is needed – a terrain from the noise plugin is just geometry under the objects.
import type { S3dPlugin } from '../../../src/plugins/types';
import S3dBlockoutPanel from './S3dBlockoutPanel.vue';
import S3dLevelPanel from './S3dLevelPanel.vue';
import S3dPlayHud from './S3dPlayHud.vue';
import { createPlayTool, isPlaying, startIn, stopPlay } from './play';
import { refreshPreview, scriptAtmosphere } from './lights';
import { generateLevel, type GenerateCall } from './generate';
import { addBlock, editBlock, refreshBlockout } from './blockout';
import { createBlockTool } from './blocktool';
import { exportedLevelFile, levelFile, levelJson } from './exporter';
import { TEMPLATES } from './templates';
import { KINDS } from './kinds';
import { BLOCKOUT_PANEL, BLOCK_TOOL_ID, EXPORTER, MODE, PANEL, PLACE_TOOL_ID, PLAY_TOOL_ID } from './names';
import { LEVEL_FORMAT, levelObjects, placeObject, repairIds, selectedObjects, validLevelData, type PlaceCall } from './objects';
import { MESSAGES, t, useRuntime } from './runtime';
import { useLevelState } from './state';
import { injectStyles } from './styles';
import { drawLevel, drawNav } from './drawing';
import { buildNav, shownNav, toggleNav } from './nav';
import { createPlaceTool } from './tool';

const ICON =
  '<path d="M5 20V5.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M5.5 5h10l-2.5 3 2.5 3h-10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M12 20l3.5-6 3.5 6z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>';

/** the block tool: a floor plan of two rooms on a grid */
const BLOCK_ICON =
  '<path d="M4 4h16v16H4z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M12 4v6M12 14v6M4 12h5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><path d="M15 9h5M15 12h5M15 15h5" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" opacity=".6"/>';

/** the test run: a play triangle */
const PLAY_ICON = '<path d="M7 4.5v15l12-7.5z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>';

const plugin: S3dPlugin = {
  id: 'level',
  name: 'level.plugin.name',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'level.plugin.description',
  messages: MESSAGES,

  activate(context) {
    useRuntime(context);
    context.onDispose(injectStyles());
    context.icons.register('level', ICON);
    context.icons.register('level-block', BLOCK_ICON);
    context.icons.register('level-play', PLAY_ICON);

    // the format of level objects, so other plugins (an exporter, a checker) can read them without this one
    context.data.formats.register({ ...LEVEL_FORMAT, label: 'level.plugin.name', validate: validLevelData });

    context.panels.register({ id: PANEL, label: 'level.panel.title', icon: 'level', width: 320, component: S3dLevelPanel, tile: 'first' });
    context.tools.register({ id: 'place', name: 'level.tool.name', icon: 'level', key: 'J', create: (editor) => createPlaceTool(editor) });
    context.panels.register({
      id: BLOCKOUT_PANEL,
      label: 'level.blockout.title',
      icon: 'level-block',
      width: 320,
      component: S3dBlockoutPanel,
      tile: 'first',
    });
    context.tools.register({
      id: 'block',
      name: 'level.blockout.tool',
      icon: 'level-block',
      key: 'K',
      create: (editor) => createBlockTool(editor),
    });
    // the test run: a tool that runs the level while it is active, and its display
    context.tools.register({
      id: 'play',
      name: 'level.play.tool',
      icon: 'level-play',
      key: 'P',
      create: (editor) => createPlayTool(editor),
    });
    context.ui.addWindow(S3dPlayHud);
    context.onDispose(stopPlay);
    // light and atmosphere while editing (when the level wants them shown): again after every change of the model
    context.vue.watch(
      () => context.editor.ui.revision,
      () => {
        if (!isPlaying()) {
          refreshPreview();
        }
      },
    );
    refreshPreview();

    // the level mode: the 3D view with only what a level needs
    context.modes.register({
      id: MODE,
      label: 'level.mode',
      icon: 'level',
      tools: ['select', BLOCK_TOOL_ID, PLACE_TOOL_ID, PLAY_TOOL_ID, 'move', 'rotate', 'scale', 'eraser', 'orbit', 'pan', 'tape'],
      panels: [`level.${PANEL}`, `level.${BLOCKOUT_PANEL}`, 'entityinfo', 'outliner', 'tags', 'scenes'],
      enter: () => context.panels.open(PANEL),
      leave: () => {
        useLevelState().placing = null;
      },
    });

    // names, links and camera views while the level mode is on, the selected objects' always
    context.overlay.draw((overlay) => {
      // the test run shows the level as the player sees it
      if (isPlaying()) {
        return;
      }
      const nav = shownNav();
      if (nav) {
        drawNav(overlay, nav);
      }
      drawLevel(
        overlay,
        levelObjects(),
        context.modes.active() === `level.${MODE}`,
        new Set(selectedObjects().map((object) => object.instance)),
      );
    });

    context.script.extend('levelObject', (api, kind: string, call: PlaceCall = {}) => placeObject(api, kind, call), {
      category: 'Plugins',
      signature: 's3d.levelObject(kind, { at: [x, y, z], rotation, size: [w, d, h], props, actions, name })',
      description: 'level.script.object',
      example:
        "s3d.levelObject('trigger', { at: [4, 0, 0], actions: [{ do: 'open', target: 'door-1' }, { do: 'sound', value: 'creak' }] });",
    });
    context.script.extend('levelGenerate', (api, call: GenerateCall = {}) => generateLevel(api, call), {
      category: 'Plugins',
      signature: 's3d.levelGenerate({ seed, rooms, size, minRoom, maxRoom, corridor, height, ceiling, loops, objects })',
      description: 'level.script.generate',
      example: 's3d.levelGenerate({ seed: 4, rooms: 10, size: 50, ceiling: true });',
    });
    context.script.extend('levelAtmosphere', (_api, change: Record<string, unknown> = {}) => scriptAtmosphere(change), {
      category: 'Plugins',
      signature: 's3d.levelAtmosphere({ daylight, fog, fogColor, fogNear, fogFar, preview })',
      description: 'level.script.atmosphere',
      example: "s3d.levelAtmosphere({ daylight: 0.1, fog: true, fogColor: '#3a4048', fogNear: 2, fogFar: 18, preview: true });",
    });
    context.script.extend('levelBlock', (api, kind: string, options: Record<string, unknown> = {}) => addBlock(api, kind, options), {
      category: 'Plugins',
      signature: 's3d.levelBlock(kind, { x, y, width, depth, from, to, bend, floor, height, ceiling, rise, direction })',
      description: 'level.script.block',
      example: "s3d.levelBlock('room', { x: 0, y: 0, width: 8, depth: 6, height: 3, ceiling: true });",
    });
    context.script.extend('levelBlockEdit', (api, id: string, changes: Record<string, unknown> | null) => editBlock(api, id, changes), {
      category: 'Plugins',
      signature: 's3d.levelBlockEdit(id, changes | null)',
      description: 'level.script.blockEdit',
      example: "s3d.levelBlockEdit('room-1', { height: 4 });",
    });
    context.script.extend('levelBlockout', (api, options: { cell?: number } = {}) => refreshBlockout(api, options), {
      category: 'Plugins',
      signature: 's3d.levelBlockout({ cell })',
      description: 'level.script.blockout',
      example: 's3d.levelBlockout({ cell: 0.5 });',
    });
    context.script.extend(
      'levelObjects',
      () =>
        levelObjects().map((object) => ({
          id: object.id,
          kind: object.kind,
          name: object.instance.name,
          instance: object.instance.id,
          props: object.props,
        })),
      {
        category: 'Plugins',
        signature: 's3d.levelObjects()',
        description: 'level.script.objects',
        example: 's3d.levelObjects().forEach((object) => console.log(object.id, object.kind));',
      },
    );
    // like the export: copies of objects get ids of their own first (inside the script's undo step)
    context.script.extend(
      'levelFile',
      () => {
        repairIds();
        return levelFile();
      },
      {
        category: 'Plugins',
        signature: 's3d.levelFile()',
        description: 'level.script.file',
        example: 'console.log(JSON.stringify(s3d.levelFile().objects));',
      },
    );

    context.script.extend(
      'levelNav',
      () => {
        const grid = buildNav(levelObjects());
        return {
          cell: grid.cell,
          cells: grid.nodes.length,
          reached: grid.nodes.filter((node) => node.reached).length,
          problems: grid.problems.map((problem) => problem.text),
        };
      },
      {
        category: 'Plugins',
        signature: 's3d.levelNav()',
        description: 'level.script.nav',
        example: 'console.log(s3d.levelNav().problems);',
      },
    );

    context.files.registerExporter({
      id: EXPORTER,
      label: 'level.export.label',
      fileName: (editor) => `${editor.model.name || t('level.plugin.name')}.level.json`,
      mimeType: 'application/json',
      export: () => levelJson(),
    });
    // engine templates: a script for Godot, Unity or Unreal that builds the level's objects there
    for (const template of TEMPLATES) {
      context.files.registerExporter({
        id: template.id,
        label: template.label,
        fileName: (editor) => template.fileName(editor.model.name || 'level'),
        mimeType: 'text/plain',
        export: () => template.make(exportedLevelFile()),
      });
    }
    context.script.extend(
      'levelTemplate',
      (_api, engine: string) => {
        const template = TEMPLATES.find((candidate) => candidate.id === engine);
        if (!template) {
          throw new Error(t('level.errors.unknownEngine', { engine, engines: TEMPLATES.map((candidate) => candidate.id).join(', ') }));
        }
        return template.make(levelFile());
      },
      {
        category: 'Plugins',
        signature: "s3d.levelTemplate('godot' | 'unity' | 'unreal')",
        description: 'level.script.template',
        example: "console.log(s3d.levelTemplate('godot'));",
      },
    );
    context.commands.register({
      id: 'open',
      label: 'level.commands.open',
      icon: 'level',
      keywords: 'level game spawn trigger pickup waypoint door camera teleporter spiel editor tür kamera', // i18n-ignore – search words
      run: () => context.modes.open(MODE),
    });
    context.commands.register({
      id: 'play',
      label: 'level.commands.play',
      icon: 'level-play',
      keywords: 'test run play walk probelauf spielen laufen', // i18n-ignore – search words
      run: (editor) => {
        startIn(null);
        editor.setTool(PLAY_TOOL_ID);
      },
    });
    for (const view of ['first', 'third'] as const) {
      context.commands.register({
        id: `play-${view}`,
        label: `level.commands.play${view === 'first' ? 'First' : 'Third'}`,
        icon: 'level-play',
        run: (editor) => {
          startIn(view);
          editor.setTool(PLAY_TOOL_ID);
        },
      });
    }
    // another model: its walking grid is checked when asked for
    context.events.onNewModel(() => toggleNav(false));
    context.commands.register({
      id: 'nav',
      label: 'level.commands.nav',
      icon: 'level',
      keywords: 'reachable navigation nav mesh walk grid erreichbar laufraster', // i18n-ignore – search words
      run: () => {
        context.modes.open(MODE);
        context.panels.open(PANEL);
        toggleNav(true);
      },
    });
    context.commands.register({
      id: 'blockout',
      label: 'level.commands.blockout',
      icon: 'level-block',
      keywords: 'blockout greybox rooms corridors stairs räume gänge treppe grundriss', // i18n-ignore – search words
      run: () => {
        context.modes.open(MODE);
        context.panels.open(BLOCKOUT_PANEL);
      },
    });
    for (const kind of Object.keys(KINDS) as (keyof typeof KINDS)[]) {
      context.commands.register({
        id: `place-${kind}`,
        label: `level.commands.place.${kind}`,
        icon: 'level',
        run: (editor) => {
          useLevelState().placing = kind;
          editor.setTool(PLACE_TOOL_ID);
        },
      });
    }
  },
};

export default plugin;

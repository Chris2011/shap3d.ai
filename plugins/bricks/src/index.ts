// Clamp brick designer for Shap3D.ai: pick a brick and a colour, click to place it on the stud grid.
// - a catalog of bricks the plugin makes itself (no network needed), in the measures of the 8 mm grid
// - more parts from the LDraw library, loaded in a worker and kept in the browser; searching by name with Rebrickable
//   needs the user's own key
// - placing with snapping to the studs, stacking on what is below, turning, moving, deleting
// - a parts list (CSV), with the credits the library's licence asks for
// Bricks are components of the model, their colour is the instance's material – the app's tools work on them.
import type { S3dPlugin } from '../../../src/plugins/types';
import { addBrick, frameBricks, type PlaceOptions } from './bricks';
import { brickCsv } from './list';
import { MESSAGES, t, useRuntime } from './runtime';
import S3dBricks from './S3dBricks.vue';
import { useBrickState } from './state';
import { injectStyles } from './styles';
import { createBuildTool, TOOL_ID } from './tool';

const PANEL = 'designer';
const MODE = 'designer';

const plugin: S3dPlugin = {
  id: 'bricks',
  name: 'bricks.plugin.name',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'bricks.plugin.description',
  messages: MESSAGES,

  activate(context) {
    useRuntime(context);
    context.onDispose(injectStyles());

    context.icons.register(
      'bricks',
      '<path d="M3 12h18v8H3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M6 12V9.5h4V12M14 12V9.5h4V12" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>',
    );

    context.panels.register({ id: PANEL, label: 'bricks.panel', icon: 'bricks', width: 320, component: S3dBricks, inMode: true });
    context.tools.register({
      id: 'build',
      name: 'bricks.tool.name',
      icon: 'bricks',
      key: 'B',
      create: (editor) => createBuildTool(editor),
    });
    context.modes.register({
      id: MODE,
      label: 'bricks.mode',
      icon: 'bricks',
      tools: [TOOL_ID, 'select', 'move', 'rotate', 'eraser', 'orbit', 'pan', 'tape'],
      panels: [`bricks.${PANEL}`, 'entityinfo', 'outliner', 'tags', 'scenes'],
      enter: () => {
        // lines along every edge would cover the colours; they belong to the model's view and come back with it
        context.display.edges(false);
        context.panels.open(PANEL);
        frameBricks();
      },
      leave: () => {
        context.display.edges(true);
        useBrickState().placing = null;
      },
    });

    context.commands.register({
      id: 'open',
      label: 'bricks.commands.open',
      icon: 'bricks',
      keywords: 'brick bricks clamp stud build toy klemmbaustein baustein stein noppen brique ladrillo', // i18n-ignore – search words
      run: () => context.modes.open(MODE),
    });

    context.script.extend('brick', (_api, part: string, options: PlaceOptions = {}) => addBrick(part, options).id, {
      category: 'Plugins',
      signature: 's3d.brick(part, { at: [x, y], rotation, level, color })',
      description: 'bricks.script.brick',
      example: "s3d.brick('brick-2x4', { at: [0, 0], rotation: 90, color: 'red' });",
    });

    context.files.registerExporter({
      id: 'list',
      label: 'bricks.list.export',
      fileName: (editor) => `${editor.model.name || t('bricks.plugin.name')} – ${t('bricks.list.title')}.csv`,
      mimeType: 'text/csv',
      export: () => '﻿' + brickCsv(),
    });
  },
};

export default plugin;

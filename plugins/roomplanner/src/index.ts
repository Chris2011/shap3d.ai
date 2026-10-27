// Room planner for Shap3D.ai – furnish a room like in a furniture store's planner.
// - a room of any size with doors and windows in its walls (one group, rebuilt when it changes)
// - a catalog of simple, parametric furniture: living room, bedroom, wardrobes (sections, doors, interior),
//   kitchen (a whole kitchen run or single cabinets), dining, office, storage, bath, kids, extras
// - placing and moving with snapping to walls (back to the wall) and to other pieces, R turns by 90°
// - measures in the viewport: room size, openings, distances of a piece to walls and neighbours
// - a list of what is in the room (CSV)
// Pieces are components of the model – the app's own tools (move, rotate, paint, tape measure …) work on them.
// Scripts can do the same: s3d.room({ width, depth, … }) and s3d.furniture('sofa', { params, at, rotation }).
import type { S3dPlugin } from '../../../src/plugins/types';
import S3dRoomPlanner from './S3dRoomPlanner.vue';
import { placeFurniture, type PlaceOptions } from './furniture';
import { furnitureCsv } from './list';
import { drawRoomMeasures } from './measures';
import { WALL_VIEWS, buildRoom, findRoom, type RoomInput } from './room';
import { usePlannerState } from './state';
import { injectStyles } from './styles';
import { createPlannerTool } from './tool';
import { MESSAGES, t, useRuntime } from './runtime';

const PANEL = 'planner';

const plugin: S3dPlugin = {
  id: 'roomplanner',
  name: 'roomplanner.plugin.name',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'roomplanner.plugin.description',
  messages: MESSAGES,

  activate(context) {
    useRuntime(context);
    context.onDispose(injectStyles());

    context.icons.register(
      'roomplanner',
      '<path d="M4 20V9l8-5 8 5v11" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M7 20v-4.5h6V20M7 15.5v-2h6v2M15.5 20v-6h2.5v6" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>',
    );

    context.panels.register({
      id: PANEL,
      label: 'roomplanner.panel',
      icon: 'roomplanner',
      width: 340,
      component: S3dRoomPlanner,
      tile: 'last',
    });
    context.tools.register({
      id: 'planner',
      name: 'roomplanner.tool.name',
      icon: 'roomplanner',
      create: (editor) => createPlannerTool(editor),
    });
    context.overlay.draw((overlay) => drawRoomMeasures(overlay));

    context.script.extend('room', (api, room: RoomInput = {}) => buildRoom(api, room), {
      category: 'Plugins',
      returns: 'api.returns.gruppe',
      signature:
        's3d.room({ id, name, at, width, depth, height, wall, floor, shape, notch, points, slopes, roofWindows, upper, openings })',
      description: 'roomplanner.script.room',
      example:
        "s3d.room({ width: 5, depth: 4, openings: [{ kind: 'door', wall: 'south', offset: 0.6, width: 0.9, height: 2.1, sill: 0 }] });",
    });
    context.script.extend('furniture', (api, item: string, options: PlaceOptions = {}) => placeFurniture(api, item, options).id, {
      category: 'Plugins',
      signature: 's3d.furniture(item, { params, at: [x, y], rotation, replace })',
      description: 'roomplanner.script.furniture',
      example: "s3d.furniture('sofa', { params: { seats: 3, fabric: 'fabricBlue' }, at: [2.5, 3.5], rotation: 0 });",
    });

    context.commands.register({
      id: 'open',
      label: 'roomplanner.commands.open',
      icon: 'roomplanner',
      keywords: 'room planner furniture ikea kitchen wardrobe raum planer möbel küche schrank', // i18n-ignore – search words
      run: () => context.panels.open(PANEL),
    });
    // the floor of a maisonette that is worked on (the lower one hides the upper floor)
    for (const level of [0, 1]) {
      context.commands.register({
        id: `level${level}`,
        label: `roomplanner.commands.level${level}`,
        icon: 'roomplanner',
        enabled: () => (findRoom()?.levels.length ?? 1) > level,
        checked: () => usePlannerState().level === level,
        run: (editor) => {
          usePlannerState().level = level;
          editor.redraw();
        },
      });
    }
    // which walls are shown: see-through or hidden towards the camera, all, none
    for (const view of WALL_VIEWS) {
      context.commands.register({
        id: `walls-${view}`,
        label: `roomplanner.commands.walls.${view}`,
        icon: 'roomplanner',
        checked: () => usePlannerState().walls === view,
        run: (editor) => {
          usePlannerState().walls = view;
          editor.redraw();
        },
      });
    }
    context.files.registerExporter({
      id: 'list',
      label: 'roomplanner.list.export',
      fileName: (editor) => `${editor.model.name || t('roomplanner.plugin.name')} – ${t('roomplanner.list.title')}.csv`,
      mimeType: 'text/csv',
      export: () => '﻿' + furnitureCsv(),
    });
  },
};

export default plugin;

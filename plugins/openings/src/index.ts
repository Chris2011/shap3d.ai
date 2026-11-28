// Windows and doors for Shap3D.ai: parametric windows (sashes, glazing bars, sills) and doors (frame, leaf, handle)
// set into any wall – the opening is cut through the wall. A tool sets them by click, s3d.opening() from scripts; the
// schedule counts them and goes out as CSV.
import type { Instance } from '../../../src/core/model';
import type { S3dPlugin } from '../../../src/plugins/types';
import type { ScriptApi } from '../../../src/scripting/api';
import S3dOpeningsPanel from './S3dOpeningsPanel.vue';
import { scheduleCsv } from './list';
import { DEFAULT_DOOR, DEFAULT_WINDOW, type OpeningParams } from './parts';
import { openingPlace, placeOpening } from './place';
import { MESSAGES, THREE, t, useRuntime } from './runtime';
import { injectStyles } from './styles';
import { createPlaceTool } from './tool';
import { followOpenings } from './follow';

type OpeningCall = Partial<OpeningParams> & { at?: [number, number, number] };

const openingsPlugin: S3dPlugin = {
  id: 'openings',
  name: 'openings.plugin.name',
  version: '1.7.0',
  author: 'Shap3D.ai',
  description: 'openings.plugin.description',
  messages: MESSAGES,

  activate(context) {
    useRuntime(context);
    context.onDispose(injectStyles());
    context.onDispose(followOpenings(context));
    context.tools.register({ id: 'place', name: 'openings.tool.name', icon: 'component', create: createPlaceTool });
    // without a tile: the app adds the command "Windows and doors…" (menu Plugins, command palette)
    context.panels.register({ id: 'panel', label: 'openings.plugin.name', component: S3dOpeningsPanel, icon: 'component' });
    context.files.registerExporter({
      id: 'schedule',
      label: 'openings.list.export',
      mimeType: 'text/csv;charset=utf-8',
      fileName: () => `${context.editor.model.name || t('openings.list.file')}-${t('openings.list.file')}.csv`,
      export: () => scheduleCsv(context),
    });

    /** a window or door from a script: into the wall face of `wall` (a group, or the current context) that `at` lies on */
    const scriptOpening = (api: ScriptApi, wall: { inst?: Instance } | undefined, call: OpeningCall = {}) => {
      const entities = wall?.inst ? wall.inst.definition.entities : api.ents;
      const toLocal = wall?.inst ? wall.inst.matrix.clone().invert() : new THREE.Matrix4();
      const point = new THREE.Vector3(...(call.at ?? [0, 0, 0])).applyMatrix4(toLocal);
      const params = { ...(call.kind === 'door' ? DEFAULT_DOOR : DEFAULT_WINDOW), ...call };
      const face = [...entities.faces.values()].find((candidate) => {
        const place = openingPlace(entities, candidate.id, point, params);
        return place && !('error' in place) && entities.pointInFace(candidate, point, false);
      });
      if (!face) {
        throw new Error(t('openings.errors.noFace'));
      }
      const result = placeOpening(context, entities, face.id, point, params);
      if ('error' in result) {
        throw new Error(t(`openings.errors.${result.error}`));
      }
      return result.instance.id;
    };
    context.script.extend('opening', scriptOpening, {
      category: 'Plugins',
      signature:
        "s3d.opening(wall, { at: [x, y, z], kind: 'window' | 'door', width, height, sill, sashes, barsAcross, barsUpright, operation, hinge, glazed, shutter, shutterDown })",
      description: 'openings.script.opening',
      example:
        "const wall = s3d.box([0, 0, 0], 4, 0.3, 2.6);\ns3d.opening(wall, { at: [2, 0, 1], kind: 'window', width: 1.2, height: 1.3, sill: 0.9 });",
    });
  },
};

export default openingsPlugin;

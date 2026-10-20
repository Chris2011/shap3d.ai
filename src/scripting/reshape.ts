import type { Editor } from '../engine/editor';
import { Entities, type Instance, type Face } from '../core/model';
import { ScriptApi, PARAMETRIC } from './api';
import { toTriMesh, fromTriMesh, loopSubdivide, simplify, resampleCircle } from '../core/meshops';
import { t } from '../i18n';

/** Current segment / side count of a parametric shape. */
export const resolutionOf = (inst: Instance): { value: number; min: number; label: string; option: string } | null => {
  const shape = inst.definition.shape;
  const spec = shape && PARAMETRIC[shape.kind];
  if (!shape || !spec) {
    return null;
  }
  const resolution = Number(shape.opts[spec.option] ?? spec.defaultValue);
  return {
    value: Number.isFinite(resolution) ? resolution : spec.defaultValue,
    min: spec.min,
    label: t(`shapes.${shape.kind}`),
    option: spec.option,
  };
};

/** Rebuilds a parametric shape with a new segment count (exact geometry, one undo step). */
export const setResolution = (editor: Editor, inst: Instance, value: number): boolean => {
  const shape = inst.definition.shape;
  const spec = shape && PARAMETRIC[shape.kind];
  if (!shape || !spec) {
    return false;
  }
  const segments = Math.max(spec.min, Math.min(256, Math.round(value)));
  editor.commit(
    t(spec.option === 'sides' ? 'mesh.undoSides' : 'mesh.undoSegments', { shape: t(`shapes.${shape.kind}`), count: segments }),
    () => {
      const opts: Record<string, unknown> = { ...shape.opts, [spec.option]: segments };
      if (shape.kind === 'torus') {
        opts.sides = Math.max(3, Math.round(segments / 2));
      }
      // build it again in a scratch area, then move the new geometry into the existing definition
      const api = new ScriptApi(editor, new Entities());
      const group = (api as any)[shape.kind](...shape.args, opts);
      const fresh = group.inst.def;
      inst.definition.entities = fresh.entities;
      inst.definition.shape = { kind: shape.kind, args: shape.args, opts };
      editor.model.definitions.delete(fresh.id);
    },
  );
  return true;
};

/** Circle drawn with the circle/polygon tool (not extruded yet): redraw it with a new segment count. */
export const setCircleSegments = (editor: Editor, ents: Entities, face: Face, value: number): number | null => {
  let id: number | null = null;
  editor.commit(`Kreis: ${Math.round(value)} Segmente`, () => {
    id = resampleCircle(ents, face, value);
  });
  if (id != null) {
    editor.select([{ kind: 'face', id }]);
  }
  return id;
};

const MAX_TRIANGLES = 250_000;

/**
 * More polygons for any group/component: every triangle becomes four.
 * round = Loop subdivision (corners and curves get softer), otherwise the shape stays exactly the same.
 */
export const subdivideInstance = (editor: Editor, inst: Instance, round = true): string | null => {
  const triMesh = toTriMesh(inst.definition.entities);
  if (!triMesh.triangles.length) {
    return t('mesh.noTopFaces');
  }
  if ((triMesh.triangles.length / 3) * 4 > MAX_TRIANGLES) {
    return t('mesh.tooMany', { count: Math.round((triMesh.triangles.length / 3) * 4) });
  }
  editor.commit(round ? 'Mehr Polygone (abrunden)' : 'Mehr Polygone', () => {
    inst.definition.entities = fromTriMesh(loopSubdivide(triMesh, round), 40, round);
    inst.definition.shape = undefined;
    inst.definition.pluginData = undefined; // no longer parametric / plugin-made (e.g. terrain grid)
  });
  return null;
};

/** Fewer polygons for any group/component: edge-collapse simplification down to `keep` of the points. */
export const simplifyInstance = async (editor: Editor, inst: Instance, keep: number): Promise<string | null> => {
  const triMesh = toTriMesh(inst.definition.entities);
  if (triMesh.triangles.length < 12) {
    return t('mesh.fewAlready');
  }
  const out = await simplify(triMesh, keep);
  if (out.triangles.length < 3) {
    return t('mesh.cannotSimplify');
  }
  editor.commit('undo.fewerPolygons', () => {
    inst.definition.entities = fromTriMesh(out);
    inst.definition.shape = undefined;
    inst.definition.pluginData = undefined;
  });
  return null;
};

import type { Editor } from '../engine/editor';
import { Entities, type Instance, type Face } from '../core/model';
import { ScriptApi, PARAMETRIC } from './api';
import { toTriMesh, resampleCircle, type TriMesh } from '../core/meshops';
import { runMeshJob, type MeshJob } from './meshJobs';
import { unpackInto, type PreparedMesh } from './preparedMesh';
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
  editor.commit(t('mesh.undoCircle', { count: Math.round(value) }), () => {
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
const reshapeJob = (triMesh: TriMesh, operation: Extract<MeshJob, { kind: 'reshape' }>['operation']): MeshJob => {
  const materialNames = [...new Set([...triMesh.materials, ...triMesh.backMaterials].filter((name): name is string => !!name))];
  const indexOf = (name: string | undefined) => (name ? materialNames.indexOf(name) : -1);
  return {
    kind: 'reshape',
    operation,
    positions: Float64Array.from(triMesh.positions.flatMap((point) => [point.x, point.y, point.z])),
    triangles: Int32Array.from(triMesh.triangles),
    materials: Int32Array.from(triMesh.materials, indexOf),
    backMaterials: Int32Array.from(triMesh.backMaterials, indexOf),
    materialNames,
  };
};
const entitiesOf = (mesh: PreparedMesh) => {
  const entities = new Entities();
  unpackInto(entities, mesh);
  return entities;
};

export const subdivideInstance = async (editor: Editor, inst: Instance, round = true): Promise<string | null> => {
  const triMesh = toTriMesh(inst.definition.entities);
  if (!triMesh.triangles.length) {
    return t('mesh.noTopFaces');
  }
  if ((triMesh.triangles.length / 3) * 4 > MAX_TRIANGLES) {
    return t('mesh.tooMany', { count: Math.round((triMesh.triangles.length / 3) * 4) });
  }
  const [mesh] = await runMeshJob(reshapeJob(triMesh, { name: 'subdivide', round }));
  editor.commit(round ? 'mesh.undoSubdivideRound' : 'mesh.undoSubdivide', () => {
    inst.definition.entities = entitiesOf(mesh);
    inst.definition.procedure = undefined;
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
  const [mesh] = await runMeshJob(reshapeJob(triMesh, { name: 'simplify', keep }));
  if (!mesh) {
    return t('mesh.cannotSimplify');
  }
  editor.commit('undo.fewerPolygons', () => {
    inst.definition.entities = entitiesOf(mesh);
    inst.definition.procedure = undefined;
    inst.definition.shape = undefined;
    inst.definition.pluginData = undefined;
  });
  return null;
};

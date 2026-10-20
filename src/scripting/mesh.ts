import * as THREE from 'three';
import type { Editor } from '../engine/editor';
import { Entities } from '../core/model';
import type { RunResult } from './api';
import { t } from '../i18n';

/**
 * OBJ meshes (e.g. raw LLaMA-Mesh output: only `v x y z` and `f a b c` lines).
 * Everything else – prose, code fences, normals, texture coords, groups – is ignored.
 */
export interface ObjMesh {
  verts: THREE.Vector3[];
  faces: number[][];
  /** optional material name per face (same order as `faces`) */
  materials?: (string | null | undefined)[];
}
export interface MeshOptions {
  /** largest side in metres (default 1) */
  size?: number;
  /** the file is Y-up (OBJ convention, LLaMA-Mesh) and gets rotated to Z-up – default true */
  yUp?: boolean;
  /** soften edges between faces flatter than this angle (deg), 0 = keep all edges – default 30 */
  smooth?: number;
  /** false = keep the coordinates as they are (times `scale`) instead of fitting to `size` and centring – default true */
  fit?: boolean;
  /** with fit: false – factor from file units to metres (e.g. 0.001 for millimetres) */
  scale?: number;
}

/** True if the text looks like an OBJ mesh rather than a script. */
export const looksLikeObj = (text: string): boolean => {
  return (text.match(/^\s*v\s+-?[\d.]/gm) ?? []).length >= 3 && /^\s*f\s+\d/m.test(text) && !/\b(s3d|fw|su)\./.test(text);
};

export const parseObj = (text: string): ObjMesh => {
  const verts: THREE.Vector3[] = [];
  const faces: number[][] = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/);
    if (parts[0] === 'v' && parts.length >= 4) {
      verts.push(new THREE.Vector3(+parts[1], +parts[2], +parts[3]));
    } else if (parts[0] === 'f' && parts.length >= 4) {
      faces.push(
        parts
          .slice(1)
          .map((x) => parseInt(x.split('/')[0], 10))
          .map((i) => (i < 0 ? verts.length + i : i - 1)),
      );
    }
  }
  return { verts, faces };
};

/** Builds the mesh into `ents`: scaled to `size`, centred in X/Y, standing on z = 0 (or kept in place with `fit: false`). Returns the face count. */
export const buildMesh = (ents: Entities, mesh: ObjMesh, opts: MeshOptions = {}): number => {
  const { size = 1, yUp = true, smooth = 30, fit = true } = opts;
  if (!mesh.verts.length || !mesh.faces.length) {
    throw new Error(t('mesh.noMesh'));
  }
  if (mesh.verts.some((vertex) => !isFinite(vertex.x + vertex.y + vertex.z))) {
    throw new Error(t('mesh.invalidCoordinates'));
  }
  const pts = mesh.verts.map((vertex) => (yUp ? new THREE.Vector3(vertex.x, -vertex.z, vertex.y) : vertex.clone()));
  const box = new THREE.Box3().setFromPoints(pts);
  const extent = box.getSize(new THREE.Vector3());
  const scale = fit ? size / Math.max(extent.x, extent.y, extent.z, 1e-9) : (opts.scale ?? 1);
  // fit: centred on the ground; otherwise in place
  const center = box.getCenter(new THREE.Vector3());
  const origin = fit ? new THREE.Vector3(center.x, center.y, box.min.z) : new THREE.Vector3();
  const ids = pts.map((point) => ents.addVertex(point.clone().sub(origin).multiplyScalar(scale)));
  let made = 0;
  for (const [faceNumber, faceIndices] of mesh.faces.entries()) {
    if (faceIndices.some((i) => !(i >= 0 && i < ids.length))) {
      continue;
    }
    const loop = faceIndices.map((i) => ids[i]).filter((x, i, all) => x !== all[(i + 1) % all.length]);
    if (new Set(loop).size < 3) {
      continue;
    }
    const material = mesh.materials?.[faceNumber] ?? undefined;
    if (ents.createFaceRaw(loop, [], material ? { material } : {})) {
      made++;
    }
  }
  ents.mergeCoplanar([...ents.edges.keys()]);
  if (smooth > 0) {
    ents.autoSoften([...ents.edges.keys()], smooth);
  }
  return made;
};

/** Import OBJ text as a component placed next to the existing model (one undo step). */
export const importObj = (editor: Editor, text: string, opts: MeshOptions & { name?: string; label?: string } = {}): RunResult => {
  const startedAt = performance.now();
  try {
    const mesh = parseObj(text);
    const ents = new Entities();
    const made = buildMesh(ents, mesh, opts);
    const size = opts.size ?? 1;
    editor.commit(opts.label ?? 'undo.insertMesh', () => {
      const def = editor.model.newDefinition(editor.model.uniqueDefName(opts.name ?? 'Mesh'), true, ents);
      const box = editor.model.bounds();
      const x = box.isEmpty() ? 0 : box.max.x + 0.5 + size / 2;
      const inst = editor.entities.addInstance(def, new THREE.Matrix4().makeTranslation(x, 0, 0), '');
      editor.select([{ kind: 'instance', id: inst.id }]);
    });
    editor.zoomExtents();
    return {
      ok: true,
      logs: [{ kind: 'log', text: t('mesh.imported', { vertices: mesh.verts.length, faces: made }) }],
      durationMs: performance.now() - startedAt,
    };
  } catch (error: any) {
    return { ok: false, logs: [], error: error?.message ?? String(error), durationMs: performance.now() - startedAt };
  }
};

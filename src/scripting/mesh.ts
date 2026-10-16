import * as THREE from 'three';
import type { Editor } from '../engine/editor';
import { Entities } from '../core/model';
import type { RunResult } from './api';

/**
 * OBJ meshes (e.g. raw LLaMA-Mesh output: only `v x y z` and `f a b c` lines).
 * Everything else – prose, code fences, normals, texture coords, groups – is ignored.
 */
export interface ObjMesh { verts: THREE.Vector3[]; faces: number[][] }
export interface MeshOptions {
  /** largest side in metres (default 1) */
  size?: number;
  /** the file is Y-up (OBJ convention, LLaMA-Mesh) and gets rotated to Z-up – default true */
  yUp?: boolean;
  /** soften edges between faces flatter than this angle (deg), 0 = keep all edges – default 30 */
  smooth?: number;
}

/** True if the text looks like an OBJ mesh rather than a script. */
export function looksLikeObj(text: string): boolean {
  return (text.match(/^\s*v\s+-?[\d.]/gm) ?? []).length >= 3 && /^\s*f\s+\d/m.test(text) && !/\b(s3d|fw|su)\./.test(text);
}

export function parseObj(text: string): ObjMesh {
  const verts: THREE.Vector3[] = []; const faces: number[][] = [];
  for (const line of text.split(/\r?\n/)) {
    const p = line.trim().split(/\s+/);
    if (p[0] === 'v' && p.length >= 4) verts.push(new THREE.Vector3(+p[1], +p[2], +p[3]));
    else if (p[0] === 'f' && p.length >= 4) faces.push(p.slice(1).map(x => parseInt(x.split('/')[0], 10)).map(i => (i < 0 ? verts.length + i : i - 1)));
  }
  return { verts, faces };
}

/** Builds the mesh into `ents`: scaled to `size`, centred in X/Y, standing on z = 0. Returns the face count. */
export function buildMesh(ents: Entities, mesh: ObjMesh, opts: MeshOptions = {}): number {
  const { size = 1, yUp = true, smooth = 30 } = opts;
  if (!mesh.verts.length || !mesh.faces.length) throw new Error('Kein Mesh gefunden – erwartet werden Zeilen wie „v 1 2 3“ und „f 1 2 3“.');
  if (mesh.verts.some(v => !isFinite(v.x + v.y + v.z))) throw new Error('Ungültige Koordinaten im Mesh');
  const pts = mesh.verts.map(v => (yUp ? new THREE.Vector3(v.x, -v.z, v.y) : v.clone()));
  const bb = new THREE.Box3().setFromPoints(pts); const sz = bb.getSize(new THREE.Vector3());
  const k = size / Math.max(sz.x, sz.y, sz.z, 1e-9);
  const c = bb.getCenter(new THREE.Vector3());
  const ids = pts.map(v => ents.addVertex(new THREE.Vector3((v.x - c.x) * k, (v.y - c.y) * k, (v.z - bb.min.z) * k)));
  let made = 0;
  for (const f of mesh.faces) {
    if (f.some(i => !(i >= 0 && i < ids.length))) continue;
    const loop = f.map(i => ids[i]).filter((x, i, a) => x !== a[(i + 1) % a.length]);
    if (new Set(loop).size < 3) continue;
    if (ents.createFaceRaw(loop)) made++;
  }
  ents.mergeCoplanar([...ents.edges.keys()]);
  if (smooth > 0) ents.autoSoften([...ents.edges.keys()], smooth);
  return made;
}

/** Import OBJ text as a component placed next to the existing model (one undo step). */
export function importObj(ed: Editor, text: string, opts: MeshOptions & { name?: string; label?: string } = {}): RunResult {
  const t0 = performance.now();
  try {
    const mesh = parseObj(text);
    const ents = new Entities();
    const made = buildMesh(ents, mesh, opts);
    const size = opts.size ?? 1;
    ed.commit(opts.label ?? 'Mesh einfügen', () => {
      const def = ed.model.newDefinition(ed.model.uniqueDefName(opts.name ?? 'Mesh'), true, ents);
      const mb = ed.model.bounds(); const x = mb.isEmpty() ? 0 : mb.max.x + 0.5 + size / 2;
      const inst = ed.entities.addInstance(def, new THREE.Matrix4().makeTranslation(x, 0, 0), '');
      ed.select([{ kind: 'instance', id: inst.id }]);
    });
    ed.zoomExtents();
    return { ok: true, logs: [{ kind: 'log', text: `${mesh.verts.length} Ecken, ${made} Flächen importiert` }], ms: performance.now() - t0 };
  } catch (e: any) {
    return { ok: false, logs: [], error: e?.message ?? String(e), ms: performance.now() - t0 };
  }
}

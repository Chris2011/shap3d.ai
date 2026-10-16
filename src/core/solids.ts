import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { Entities, type Instance } from './model';

/** SketchUp definition of a solid: every edge borders exactly two faces. */
export function isSolid(ents: Entities): boolean {
  if (!ents.faces.size) return false;
  for (const e of ents.edges.values()) if (ents.facesOfEdge(e.id).length !== 2) return false;
  for (const i of ents.instances.values()) if (!isSolid(i.def.entities)) return false;
  return true;
}

/** Signed volume (divergence theorem) of the faces, transformed by m. */
export function volume(ents: Entities, m = new THREE.Matrix4()): number {
  let v = 0;
  for (const f of ents.faces.values()) {
    const tri = ents.faceTriangles(f); const pts = [...f.outer, ...f.holes.flat()].map(id => ents.pos(id).clone().applyMatrix4(m));
    for (let i = 0; i < tri.length; i += 3) { const a = pts[tri[i]], b = pts[tri[i + 1]], c = pts[tri[i + 2]]; v += a.dot(b.clone().cross(c)) / 6; }
  }
  for (const i of ents.instances.values()) v += volume(i.def.entities, m.clone().multiply(i.matrix));
  return v;
}

/** Triangulate an entities tree into a geometry with one group per material. */
function toBrush(ents: Entities, m: THREE.Matrix4, inherit?: string): Brush {
  const byMat = new Map<string, number[]>();
  const walk = (e: Entities, mm: THREE.Matrix4, inh?: string) => {
    const flip = mm.determinant() < 0;
    for (const f of e.faces.values()) {
      const key = f.material ?? inh ?? '';
      const tri = e.faceTriangles(f); const pts = [...f.outer, ...f.holes.flat()].map(id => e.pos(id).clone().applyMatrix4(mm));
      const arr = byMat.get(key) ?? []; byMat.set(key, arr);
      for (let i = 0; i < tri.length; i += 3) {
        const a = pts[tri[i]], b = pts[tri[flip ? i + 2 : i + 1]], c = pts[tri[flip ? i + 1 : i + 2]];
        arr.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }
    }
    for (const i of e.instances.values()) walk(i.def.entities, mm.clone().multiply(i.matrix), i.material ?? inh);
  };
  walk(ents, m, inherit);
  const pos: number[] = []; const g = new THREE.BufferGeometry(); const mats: THREE.Material[] = [];
  let start = 0;
  for (const [k, arr] of byMat) { pos.push(...arr); const n = arr.length / 3; g.addGroup(start, n, mats.length); const mat = new THREE.MeshBasicMaterial(); mat.name = k; mats.push(mat); start += n; }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  const b = new Brush(g, mats); b.updateMatrixWorld(true);
  return b;
}

/** Turn a triangle soup back into SketchUp-like faces (coplanar triangles merged). */
function fromMesh(mesh: THREE.Mesh): Entities {
  const ents = new Entities();
  const g = mesh.geometry; const pos = g.getAttribute('position'); const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.Material[];
  const groups = g.groups.length ? g.groups : [{ start: 0, count: g.index ? g.index.count : pos.count, materialIndex: 0 }];
  const idx = g.index;
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i);
  for (const gr of groups) {
    const name = mats[gr.materialIndex ?? 0]?.name || undefined;
    for (let i = gr.start; i + 2 < gr.start + gr.count; i += 3) {
      const a = v(i), b = v(i + 1), c = v(i + 2);
      if (b.clone().sub(a).cross(c.clone().sub(a)).length() < 1e-10) continue;
      const ids = [a, b, c].map(p => ents.addVertex(p)); if (new Set(ids).size < 3) continue;
      ents.createFaceRaw(ids, [], { material: name });
    }
  }
  ents.repairTJunctions();
  for (let k = 0; k < 3; k++) ents.mergeCoplanar([...ents.edges.keys()]);
  ents.removeLooseInnerEdges([...ents.edges.keys()]);
  ents.removeOrphanVertices();
  ents.healCollinear([...ents.vertices.keys()]);
  ents.autoSoften([...ents.edges.keys()], 20);
  return ents;
}

export type SolidOp = 'union' | 'subtract' | 'intersect' | 'outershell' | 'trim' | 'split';

/**
 * Boolean operation on instances (in the coordinates of their parent).
 * Returns the resulting Entities (in parent coordinates) – one or more pieces.
 */
export function solidOp(op: SolidOp, a: Instance, b: Instance): Entities[] {
  const ev = new Evaluator(); ev.attributes = ['position', 'uv', 'normal']; ev.useGroups = true;
  const A = toBrush(a.def.entities, a.matrix, a.material), B = toBrush(b.def.entities, b.matrix, b.material);
  const run = (x: Brush, y: Brush, o: number) => fromMesh(ev.evaluate(x, y, o) as unknown as THREE.Mesh);
  switch (op) {
    case 'union': case 'outershell': return [run(A, B, ADDITION)];
    case 'intersect': return [run(A, B, INTERSECTION)];
    case 'subtract': return [run(B, A, SUBTRACTION)];
    case 'trim': return [run(B, A, SUBTRACTION)];
    case 'split': return [run(A, B, SUBTRACTION), run(B, A, SUBTRACTION), run(A, B, INTERSECTION)];
  }
}

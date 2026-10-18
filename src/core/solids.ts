import * as THREE from 'three';
import { Brush, Evaluator, ADDITION, SUBTRACTION, INTERSECTION } from 'three-bvh-csg';
import { Entities, type Instance } from './model';

/** SketchUp definition of a solid: every edge borders exactly two faces. */
export const isSolid = (ents: Entities): boolean => {
  if (!ents.faces.size) return false;
  for (const edge of ents.edges.values()) if (ents.facesOfEdge(edge.id).length !== 2) return false;
  for (const instance of ents.instances.values()) if (!isSolid(instance.definition.entities)) return false;
  return true;
};

/** Signed volume (divergence theorem) of the faces, transformed by m. */
export const volume = (ents: Entities, matrix = new THREE.Matrix4()): number => {
  let signedVolume = 0;
  for (const face of ents.faces.values()) {
    const tri = ents.faceTriangles(face); const pts = [...face.outer, ...face.holes.flat()].map(id => ents.positionOf(id).clone().applyMatrix4(matrix));
    for (let i = 0; i < tri.length; i += 3) { const cornerA = pts[tri[i]], cornerB = pts[tri[i + 1]], cornerC = pts[tri[i + 2]]; signedVolume += cornerA.dot(cornerB.clone().cross(cornerC)) / 6; }
  }
  for (const instance of ents.instances.values()) signedVolume += volume(instance.definition.entities, matrix.clone().multiply(instance.matrix));
  return signedVolume;
};

/** Triangulate an entities tree into a geometry with one group per material. */
const toBrush = (ents: Entities, transform: THREE.Matrix4, inherit?: string): Brush => {
  const byMat = new Map<string, number[]>();
  const walk = (entities: Entities, matrix: THREE.Matrix4, inh?: string) => {
    const flip = matrix.determinant() < 0;
    for (const face of entities.faces.values()) {
      const key = face.material ?? inh ?? '';
      const tri = entities.faceTriangles(face); const pts = [...face.outer, ...face.holes.flat()].map(id => entities.positionOf(id).clone().applyMatrix4(matrix));
      const arr = byMat.get(key) ?? []; byMat.set(key, arr);
      for (let i = 0; i < tri.length; i += 3) {
        const cornerA = pts[tri[i]], cornerB = pts[tri[flip ? i + 2 : i + 1]], cornerC = pts[tri[flip ? i + 1 : i + 2]];
        arr.push(cornerA.x, cornerA.y, cornerA.z, cornerB.x, cornerB.y, cornerB.z, cornerC.x, cornerC.y, cornerC.z);
      }
    }
    for (const instance of entities.instances.values()) walk(instance.definition.entities, matrix.clone().multiply(instance.matrix), instance.material ?? inh);
  };
  walk(ents, transform, inherit);
  const pos: number[] = []; const geometry = new THREE.BufferGeometry(); const mats: THREE.Material[] = [];
  let start = 0;
  for (const [materialKey, arr] of byMat) { pos.push(...arr); const vertexCount = arr.length / 3; geometry.addGroup(start, vertexCount, mats.length); const mat = new THREE.MeshBasicMaterial(); mat.name = materialKey; mats.push(mat); start += vertexCount; }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.computeVertexNormals();
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
  const brush = new Brush(geometry, mats); brush.updateMatrixWorld(true);
  return brush;
};

/** Turn a triangle soup back into SketchUp-like faces (coplanar triangles merged). */
const fromMesh = (mesh: THREE.Mesh): Entities => {
  const ents = new Entities();
  const geometry = mesh.geometry; const pos = geometry.getAttribute('position'); const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as THREE.Material[];
  const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count: geometry.index ? geometry.index.count : pos.count, materialIndex: 0 }];
  const idx = geometry.index;
  const vertexAt = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, idx ? idx.getX(i) : i);
  for (const group of groups) {
    const name = mats[group.materialIndex ?? 0]?.name || undefined;
    for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
      const cornerA = vertexAt(i), cornerB = vertexAt(i + 1), cornerC = vertexAt(i + 2);
      if (cornerB.clone().sub(cornerA).cross(cornerC.clone().sub(cornerA)).length() < 1e-10) continue;
      const ids = [cornerA, cornerB, cornerC].map(point => ents.addVertex(point)); if (new Set(ids).size < 3) continue;
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
};

export type SolidOp = 'union' | 'subtract' | 'intersect' | 'outershell' | 'trim' | 'split';

/**
 * Boolean operation on instances (in the coordinates of their parent).
 * Returns the resulting Entities (in parent coordinates) – one or more pieces.
 */
export const solidOp = (operation: SolidOp, instance: Instance, other: Instance): Entities[] => {
  const evaluator = new Evaluator(); evaluator.attributes = ['position', 'uv', 'normal']; evaluator.useGroups = true;
  const brushA = toBrush(instance.definition.entities, instance.matrix, instance.material), brushB = toBrush(other.definition.entities, other.matrix, other.material);
  const run = (x: Brush, y: Brush, mode: number) => fromMesh(evaluator.evaluate(x, y, mode) as unknown as THREE.Mesh);
  switch (operation) {
    case 'union': case 'outershell': return [run(brushA, brushB, ADDITION)];
    case 'intersect': return [run(brushA, brushB, INTERSECTION)];
    case 'subtract': return [run(brushB, brushA, SUBTRACTION)];
    case 'trim': return [run(brushB, brushA, SUBTRACTION)];
    case 'split': return [run(brushA, brushB, SUBTRACTION), run(brushB, brushA, SUBTRACTION), run(brushA, brushB, INTERSECTION)];
  }
};

import * as THREE from 'three';
import type { Model } from '../core/document';
import { Entities, type Definition } from '../core/model';

/**
 * Turns a loaded three.js scene (Collada, glTF, OBJ, STL) into our entities: one group per named node,
 * materials with colour and opacity, front/back faces merged. The input must already be Z-up in metres
 * (pass `conv` to rotate/scale it).
 */
export interface ImportResult { root: Entities; triangles: number; groups: number; materials: number; skipped: number }

const MAX_TRIANGLES = 200_000;

export function sceneToEntities(obj: THREE.Object3D, model: Model, conv: THREE.Matrix4, baseName: string): ImportResult {
  obj.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  obj.traverse(o => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });

  // one group per node that owns geometry (SketchUp/Collada: a node per group or component)
  const owner = (m: THREE.Mesh) => (m.name ? m : (m.parent && m.parent !== obj ? m.parent : m));
  const owners = new Map<THREE.Object3D, THREE.Mesh[]>();
  for (const m of meshes) { const o = owner(m); (owners.get(o) ?? owners.set(o, []).get(o)!).push(m); }
  const useGroups = owners.size > 1 && owners.size <= 400;

  // materials: three.js material → model material name
  const matName = new Map<string, string | undefined>(); let newMats = 0;
  const materialFor = (mat: THREE.Material | undefined): string | undefined => {
    if (!mat) return undefined;
    if (matName.has(mat.uuid)) return matName.get(mat.uuid);
    const c = (mat as THREE.MeshStandardMaterial).color as THREE.Color | undefined;
    const map = (mat as THREE.MeshStandardMaterial).map;
    // textured materials keep their name; without the image a neutral tone stands in for white
    const hex = c ? '#' + c.getHexString(THREE.SRGBColorSpace) : '#cccccc';
    // loaders hand out an unnamed white material when the file has none (STL, OBJ without .mtl) – use the default face colour
    if (!mat.name && hex === '#ffffff' && !map && !mat.transparent) { matName.set(mat.uuid, undefined); return undefined; }
    const color = map && hex === '#ffffff' ? '#c8c4bc' : hex;
    const opacity = mat.transparent ? THREE.MathUtils.clamp(mat.opacity, 0.05, 1) : 1;
    let name = (mat.name || `${baseName} Material`).trim();
    const same = model.materials.find(m => m.name === name);
    if (same && (same.color.toLowerCase() !== color || Math.abs(same.opacity - opacity) > 0.01)) { let i = 2; while (model.materials.some(m => m.name === `${name} ${i}`)) i++; name = `${name} ${i}`; }
    if (!model.materials.some(m => m.name === name)) { model.materials.push({ name, color, opacity }); newMats++; }
    matName.set(mat.uuid, name);
    return name;
  };

  let triangles = 0, skipped = 0;
  const fill = (ents: Entities, list: THREE.Mesh[], toLocal: THREE.Matrix4) => {
    // faces keyed by their (unordered) vertex set: the second copy of a double-sided face becomes its back side
    const seen = new Map<string, number>();
    for (const m of list) {
      const g = m.geometry as THREE.BufferGeometry; const pos = g.getAttribute('position'); if (!pos) continue;
      const index = g.getIndex();
      const count = index ? index.count : pos.count;
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      const groups = g.groups.length ? g.groups : [{ start: 0, count, materialIndex: 0 }];
      const M = toLocal.clone().multiply(conv).multiply(m.matrixWorld);
      const flip = M.determinant() < 0;
      const at = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(M);
      for (const gr of groups) {
        const name = materialFor(mats[gr.materialIndex ?? 0]);
        for (let i = gr.start; i + 2 < gr.start + gr.count; i += 3) {
          if (triangles >= MAX_TRIANGLES) { skipped++; continue; }
          const p = [at(i), at(i + 1), at(i + 2)]; if (flip) p.reverse();
          if (p[1].clone().sub(p[0]).cross(p[2].clone().sub(p[0])).lengthSq() < 1e-14) continue;
          const ids = p.map(q => ents.addVertex(q)); if (new Set(ids).size < 3) continue;
          const key = [...ids].sort((a, b) => a - b).join('_');
          const prev = seen.get(key);
          if (prev != null) {
            const f = ents.faces.get(prev);
            if (f && name && name !== f.material) f.backMaterial = name;
            continue;
          }
          const f = ents.createFaceRaw(ids, [], { material: name });
          if (f) { seen.set(key, f.id); triangles++; }
        }
      }
    }
    ents.mergeCoplanar([...ents.edges.keys()]);
    ents.autoSoften([...ents.edges.keys()], 25);
  };

  const root = new Entities();
  let groups = 0;
  if (!useGroups) fill(root, meshes, new THREE.Matrix4());
  else {
    for (const [node, list] of owners) {
      // each group keeps its own origin at the centre of its geometry
      const tmp = new Entities(); fill(tmp, list, new THREE.Matrix4());
      if (!tmp.faces.size) continue;
      const bb = tmp.bounds(); const o = bb.getCenter(new THREE.Vector3()); o.z = bb.min.z;
      for (const v of tmp.vertices.values()) v.p.sub(o); tmp.invalidateHash();
      const def: Definition = model.newDefinition(model.uniqueDefName(node.name || `${baseName} Teil`), false, tmp);
      root.addInstance(def, new THREE.Matrix4().makeTranslation(o.x, o.y, o.z), node.name || '');
      groups++;
    }
  }
  return { root, triangles, groups, materials: newMats, skipped };
}

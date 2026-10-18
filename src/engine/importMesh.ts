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

export const sceneToEntities = (obj: THREE.Object3D, model: Model, conv: THREE.Matrix4, baseName: string): ImportResult => {
  obj.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  obj.traverse(object => { if ((object as THREE.Mesh).isMesh) meshes.push(object as THREE.Mesh); });

  // one group per node that owns geometry (SketchUp/Collada: a node per group or component)
  const owner = (mesh: THREE.Mesh) => (mesh.name ? mesh : (mesh.parent && mesh.parent !== obj ? mesh.parent : mesh));
  const owners = new Map<THREE.Object3D, THREE.Mesh[]>();
  for (const mesh of meshes) { const object = owner(mesh); (owners.get(object) ?? owners.set(object, []).get(object)!).push(mesh); }
  const useGroups = owners.size > 1 && owners.size <= 400;

  // materials: three.js material → model material name
  const matName = new Map<string, string | undefined>(); let newMats = 0;
  const materialFor = (mat: THREE.Material | undefined): string | undefined => {
    if (!mat) return undefined;
    if (matName.has(mat.uuid)) return matName.get(mat.uuid);
    const baseColor = (mat as THREE.MeshStandardMaterial).color as THREE.Color | undefined;
    const map = (mat as THREE.MeshStandardMaterial).map;
    // textured materials keep their name; without the image a neutral tone stands in for white
    const hex = baseColor ? '#' + baseColor.getHexString(THREE.SRGBColorSpace) : '#cccccc';
    // loaders hand out an unnamed white material when the file has none (STL, OBJ without .mtl) – use the default face colour
    if (!mat.name && hex === '#ffffff' && !map && !mat.transparent) { matName.set(mat.uuid, undefined); return undefined; }
    const color = map && hex === '#ffffff' ? '#c8c4bc' : hex;
    const opacity = mat.transparent ? THREE.MathUtils.clamp(mat.opacity, 0.05, 1) : 1;
    let name = (mat.name || `${baseName} Material`).trim();
    const same = model.materials.find(material => material.name === name);
    if (same && (same.color.toLowerCase() !== color || Math.abs(same.opacity - opacity) > 0.01)) { let i = 2; while (model.materials.some(material => material.name === `${name} ${i}`)) i++; name = `${name} ${i}`; }
    if (!model.materials.some(material => material.name === name)) { model.materials.push({ name, color, opacity }); newMats++; }
    matName.set(mat.uuid, name);
    return name;
  };

  let triangles = 0, skipped = 0;
  const fill = (ents: Entities, list: THREE.Mesh[], toLocal: THREE.Matrix4) => {
    // faces keyed by their (unordered) vertex set: the second copy of a double-sided face becomes its back side
    const seen = new Map<string, number>();
    for (const mesh of list) {
      const geometry = mesh.geometry as THREE.BufferGeometry; const pos = geometry.getAttribute('position'); if (!pos) continue;
      const index = geometry.getIndex();
      const count = index ? index.count : pos.count;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
      const matrix = toLocal.clone().multiply(conv).multiply(mesh.matrixWorld);
      const flip = matrix.determinant() < 0;
      const vertexAt = (i: number) => new THREE.Vector3().fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(matrix);
      for (const group of groups) {
        const name = materialFor(mats[group.materialIndex ?? 0]);
        for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
          if (triangles >= MAX_TRIANGLES) { skipped++; continue; }
          const corners = [vertexAt(i), vertexAt(i + 1), vertexAt(i + 2)]; if (flip) corners.reverse();
          if (corners[1].clone().sub(corners[0]).cross(corners[2].clone().sub(corners[0])).lengthSq() < 1e-14) continue;
          const ids = corners.map(corner => ents.addVertex(corner)); if (new Set(ids).size < 3) continue;
          const key = [...ids].sort((left, right) => left - right).join('_');
          const prev = seen.get(key);
          if (prev != null) {
            const existing = ents.faces.get(prev);
            if (existing && name && name !== existing.material) existing.backMaterial = name;
            continue;
          }
          const face = ents.createFaceRaw(ids, [], { material: name });
          if (face) { seen.set(key, face.id); triangles++; }
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
      const box = tmp.bounds(); const pivot = box.getCenter(new THREE.Vector3()); pivot.z = box.min.z;
      for (const vertex of tmp.vertices.values()) vertex.position.sub(pivot); tmp.invalidateHash();
      const def: Definition = model.newDefinition(model.uniqueDefName(node.name || `${baseName} Teil`), false, tmp);
      root.addInstance(def, new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z), node.name || '');
      groups++;
    }
  }
  return { root, triangles, groups, materials: newMats, skipped };
};

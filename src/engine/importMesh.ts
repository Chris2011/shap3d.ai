import * as THREE from 'three';
import type { Model } from '../core/document';
import { Entities, type Definition } from '../core/model';
import { t } from '../i18n';
import { runMeshJob } from '../scripting/meshJobs';
import { unpackInto } from '../scripting/preparedMesh';

/**
 * Turns a loaded three.js scene (Collada, glTF, OBJ, STL) into our entities: one group per named node,
 * materials with colour and opacity, front/back faces merged. The input must already be Z-up in metres
 * (pass `conv` to rotate/scale it).
 */
export interface ImportResult {
  triangles: number;
  groups: number;
  materials: number;
  skipped: number;
  /** puts the materials and groups into the model (inside its undo step); returns what holds them */
  build: () => Entities;
}

const MAX_TRIANGLES = 200_000;
const WHITE = new THREE.Color(1, 1, 1);
/** the picture is read this small, and this many corners of a mesh are looked at: a mean colour needs no more */
const SAMPLE_SIZE = 64;
const MAX_SAMPLES = 20_000;

/**
 * The mean colour (linear) of a texture at the corners of some triangles; null when it has no readable picture.
 * shortcut: only the first mesh using a material is looked at, a material shared by many meshes could differ – count them all if that shows.
 */
const meanTextureColor = (map: THREE.Texture, geometry: THREE.BufferGeometry, start: number, count: number) => {
  const uv = geometry.getAttribute('uv');
  const image = map.image as CanvasImageSource | null;
  if (!uv || !image) {
    return null;
  }
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SAMPLE_SIZE;
  const context = canvas.getContext('2d', { willReadFrequently: true })!;
  let pixels: Uint8ClampedArray;
  try {
    context.drawImage(image, 0, 0, SAMPLE_SIZE, SAMPLE_SIZE);
    pixels = context.getImageData(0, 0, SAMPLE_SIZE, SAMPLE_SIZE).data;
  } catch {
    // raw data textures cannot be drawn, a picture from elsewhere cannot be read back
    return null;
  }
  map.updateMatrix();
  const index = geometry.getIndex();
  const point = new THREE.Vector2();
  const sum = new THREE.Color(0, 0, 0);
  const color = new THREE.Color();
  const step = Math.max(1, Math.ceil(count / MAX_SAMPLES));
  let weight = 0;
  for (let i = start; i < start + count; i += step) {
    point.fromBufferAttribute(uv as THREE.BufferAttribute, index ? index.getX(i) : i).applyMatrix3(map.matrix);
    const u = point.x - Math.floor(point.x);
    const v = point.y - Math.floor(point.y);
    const x = Math.min(SAMPLE_SIZE - 1, Math.floor(u * SAMPLE_SIZE));
    const y = Math.min(SAMPLE_SIZE - 1, Math.floor((map.flipY ? 1 - v : v) * SAMPLE_SIZE));
    const at = (y * SAMPLE_SIZE + x) * 4;
    // see-through pixels hold no colour; means are taken in linear light, or they come out too dark
    const alpha = pixels[at + 3] / 255;
    color.setRGB(pixels[at] / 255, pixels[at + 1] / 255, pixels[at + 2] / 255, THREE.SRGBColorSpace);
    sum.r += color.r * alpha;
    sum.g += color.g * alpha;
    sum.b += color.b * alpha;
    weight += alpha;
  }
  return weight ? sum.multiplyScalar(1 / weight) : null;
};

export const sceneToEntities = async (obj: THREE.Object3D, model: Model, conv: THREE.Matrix4, baseName: string): Promise<ImportResult> => {
  obj.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  obj.traverse((object) => {
    if ((object as THREE.Mesh).isMesh) {
      meshes.push(object as THREE.Mesh);
    }
  });

  // one group per node that owns geometry (SketchUp/Collada: a node per group or component)
  const owner = (mesh: THREE.Mesh) => (mesh.name ? mesh : mesh.parent && mesh.parent !== obj ? mesh.parent : mesh);
  const owners = new Map<THREE.Object3D, THREE.Mesh[]>();
  for (const mesh of meshes) {
    const object = owner(mesh);
    (owners.get(object) ?? owners.set(object, []).get(object)!).push(mesh);
  }
  const useGroups = owners.size > 1 && owners.size <= 400;

  // materials: three.js material → model material name
  const matName = new Map<string, string | undefined>();
  /** materials the model does not have yet – added in its undo step */
  const newMaterials: { name: string; color: string; opacity: number }[] = [];
  const known = () => [...model.materials, ...newMaterials];
  const materialFor = (
    mat: THREE.Material | undefined,
    geometry: THREE.BufferGeometry,
    start: number,
    count: number,
  ): string | undefined => {
    if (!mat) {
      return undefined;
    }
    if (matName.has(mat.uuid)) {
      return matName.get(mat.uuid);
    }
    const baseColor = (mat as THREE.MeshStandardMaterial).color as THREE.Color | undefined;
    const map = (mat as THREE.MeshStandardMaterial).map;
    const hex = baseColor ? '#' + baseColor.getHexString(THREE.SRGBColorSpace) : '#cccccc';
    // loaders hand out an unnamed white material when the file has none (STL, OBJ without .mtl) – use the default face colour
    if (!mat.name && hex === '#ffffff' && !map && !mat.transparent) {
      matName.set(mat.uuid, undefined);
      return undefined;
    }
    // faces have no texture coordinates: a textured material becomes the mean colour of the picture where this mesh uses it
    const seen = map ? meanTextureColor(map, geometry, start, count) : null;
    // without a readable picture a neutral tone stands in for white
    const color = seen
      ? '#' + seen.multiply(baseColor ?? WHITE).getHexString(THREE.SRGBColorSpace)
      : map && hex === '#ffffff'
        ? '#c8c4bc'
        : hex;
    const opacity = mat.transparent ? THREE.MathUtils.clamp(mat.opacity, 0.05, 1) : 1;
    let name = (mat.name || `${baseName} Material`).trim();
    const same = known().find((material) => material.name === name);
    if (same && (same.color.toLowerCase() !== color || Math.abs(same.opacity - opacity) > 0.01)) {
      let i = 2;
      while (known().some((material) => material.name === `${name} ${i}`)) {
        i++;
      }
      name = `${name} ${i}`;
    }
    if (!known().some((material) => material.name === name)) {
      newMaterials.push({ name, color, opacity });
    }
    matName.set(mat.uuid, name);
    return name;
  };

  let triangles = 0,
    skipped = 0;
  const materialNames: string[] = [];
  /** the triangles of some meshes as flat arrays – faces are made of them in a worker */
  const collect = (list: THREE.Mesh[]) => {
    const positions: number[] = [];
    const materials: number[] = [];
    const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    for (const mesh of list) {
      const geometry = mesh.geometry as THREE.BufferGeometry;
      const pos = geometry.getAttribute('position');
      if (!pos) {
        continue;
      }
      const index = geometry.getIndex();
      const count = index ? index.count : pos.count;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const groups = geometry.groups.length ? geometry.groups : [{ start: 0, count, materialIndex: 0 }];
      const matrix = conv.clone().multiply(mesh.matrixWorld);
      const flip = matrix.determinant() < 0;
      for (const group of groups) {
        const name = materialFor(mats[group.materialIndex ?? 0], geometry, group.start, group.count);
        let material = name ? materialNames.indexOf(name) : -1;
        if (name && material < 0) {
          material = materialNames.push(name) - 1;
        }
        for (let i = group.start; i + 2 < group.start + group.count; i += 3) {
          if (triangles >= MAX_TRIANGLES) {
            skipped++;
            continue;
          }
          for (let k = 0; k < 3; k++) {
            const corner = i + (flip ? 2 - k : k);
            corners[k].fromBufferAttribute(pos, index ? index.getX(corner) : corner).applyMatrix4(matrix);
            positions.push(corners[k].x, corners[k].y, corners[k].z);
          }
          materials.push(material);
          triangles++;
        }
      }
    }
    return { positions: Float64Array.from(positions), materials: Int32Array.from(materials) };
  };

  const parts = useGroups ? [...owners] : [[null, meshes] as const];
  const prepared = await runMeshJob({ kind: 'triangles', materialNames, groups: parts.map(([, list]) => collect(list)) });
  let groups = 0;
  const build = () => {
    model.materials.push(...newMaterials);
    const root = new Entities();
    prepared.forEach((mesh, number) => {
      const node = parts[number][0];
      if (!node) {
        unpackInto(root, mesh);
        return;
      }
      // each group keeps its own origin at the centre of its geometry
      const tmp = new Entities();
      unpackInto(tmp, mesh);
      if (!tmp.faces.size) {
        return;
      }
      const box = tmp.bounds();
      const pivot = box.getCenter(new THREE.Vector3());
      pivot.z = box.min.z;
      for (const vertex of tmp.vertices.values()) {
        vertex.position.sub(pivot);
      }
      tmp.invalidateHash();
      const def: Definition = model.newDefinition(model.uniqueDefName(node.name || `${baseName} ${t('import.part')}`), false, tmp);
      root.addInstance(def, new THREE.Matrix4().makeTranslation(pivot.x, pivot.y, pivot.z), node.name || '');
      groups++;
    });
    return root;
  };
  return {
    triangles,
    get groups() {
      return groups;
    },
    materials: newMaterials.length,
    skipped,
    build,
  };
};

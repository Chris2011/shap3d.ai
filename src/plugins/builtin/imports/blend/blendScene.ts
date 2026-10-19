import * as THREE from 'three';
import { BlendFile, BStruct } from './blendFile';

/**
 * Turns a .blend file into a three.js scene (Z-up, Blender units = metres): one mesh per mesh object, with the
 * object's world transform and the base colours of its materials. Modifiers and geometry nodes are not evaluated –
 * the stored base mesh is used (apply modifiers in Blender to bring the final shape).
 *
 * Mesh storage changed a lot between Blender versions; all of these are handled:
 *   ≤ 3.4  MVert / MLoop / MPoly arrays          3.5+  "position" + ".corner_vert" attributes
 *   3.6+   poly_offset_indices                    4.x   face_offset_indices, "material_index" attribute
 */
export interface BlendImport { scene: THREE.Group; version: number; objects: number; meshes: number; skipped: string[] }

const OB_MESH = 1;

export const readBlend = (data: ArrayBuffer): BlendImport => {
  const blend = new BlendFile(data);
  const scene = new THREE.Group(); scene.name = 'Blender';
  const skipped: string[] = [];
  const geoCache = new Map<string, { geometry: THREE.BufferGeometry; materials: THREE.Material[] } | null>();
  const worldCache = new Map<string, THREE.Matrix4>();
  let objects = 0;

  for (const block of blend.blocksOf('OB')) {
    const object = blend.struct(block); if (!object) continue;
    const name = object.sub('id')?.str('name').slice(2) || 'Objekt';
    if (object.int('type') !== OB_MESH) continue;
    const meAddr = object.ptr('data'); const meBlock = blend.block(meAddr);
    if (!meAddr || !meBlock) { skipped.push(`${name} (verknüpfte Daten)`); continue; }
    if (!geoCache.has(meAddr)) {
      const struct = blend.struct(meBlock);
      let result: { geometry: THREE.BufferGeometry; materials: THREE.Material[] } | null = null;
      try { result = struct ? meshGeometry(blend, struct) : null; }
      catch (error) {
        // meshes linked from another .blend are only placeholders in this file
        const linked = !!struct?.sub('id')?.ptr('lib');
        skipped.push(`${name} (${linked ? 'aus verknüpfter Datei – dort öffnen' : (error as Error).message})`);
      }
      geoCache.set(meAddr, result);
    }
    const cached = geoCache.get(meAddr); if (!cached) continue;
    const mesh = new THREE.Mesh(cached.geometry, cached.materials.length ? cached.materials : new THREE.MeshStandardMaterial());
    mesh.name = name;
    mesh.matrixAutoUpdate = false; mesh.matrix.copy(worldMatrix(blend, object, block.addr, worldCache));
    scene.add(mesh); objects++;
  }
  return { scene, version: blend.version, objects, meshes: [...geoCache.values()].filter(Boolean).length, skipped };
};

// ------------------------------------------------------------ transforms
const mat16 = (struct: BStruct, name: string): THREE.Matrix4 | null => {
  const values = struct.floatArray(name); if (!values || values.length !== 16 || values.every(value => value === 0)) return null;
  return new THREE.Matrix4().fromArray(values); // Blender stores [column][row] – same order as three.js
};

/** World matrix: the saved one if the file has it, otherwise rebuilt from loc/rot/scale and the parent chain. */
const worldMatrix = (blend: BlendFile, struct: BStruct, addr: string, cache: Map<string, THREE.Matrix4>): THREE.Matrix4 => {
  const hit = cache.get(addr); if (hit) return hit;
  let matrix = mat16(struct, 'obmat') ?? mat16(struct, 'object_to_world');
  if (!matrix) {
    const loc = struct.floatArray('loc') ?? [0, 0, 0], dloc = struct.floatArray('dloc') ?? [0, 0, 0];
    const size = struct.floatArray('size') ?? [1, 1, 1], dscale = struct.floatArray('dscale') ?? [1, 1, 1];
    const mode = struct.int('rotmode', 1);
    const rotation = new THREE.Quaternion();
    if (mode === 0) { const quat = struct.floatArray('quat') ?? [1, 0, 0, 0]; rotation.set(quat[1], quat[2], quat[3], quat[0]).normalize(); }
    else if (mode === -1) { const axis = struct.floatArray('rotAxis') ?? [0, 1, 0]; rotation.setFromAxisAngle(new THREE.Vector3(...axis).normalize(), struct.float('rotAngle')); }
    else {
      const euler = struct.floatArray('rot') ?? [0, 0, 0];
      // Blender euler modes 1..6 = XYZ XZY YXZ YZX ZXY ZYX (applied in that order)
      const order = (['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'][mode - 1] ?? 'XYZ') as THREE.EulerOrder;
      rotation.setFromEuler(new THREE.Euler(euler[0], euler[1], euler[2], reverseOrder(order)));
    }
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(loc[0] + dloc[0], loc[1] + dloc[1], loc[2] + dloc[2]), rotation,
      new THREE.Vector3(size[0] * dscale[0], size[1] * dscale[1], size[2] * dscale[2]),
    );
    const parentAddr = struct.ptr('parent'); const parentBlock = blend.block(parentAddr);
    if (parentAddr && parentBlock) {
      const parent = blend.struct(parentBlock)!;
      const pinv = mat16(struct, 'parentinv') ?? new THREE.Matrix4();
      matrix = worldMatrix(blend, parent, parentAddr, cache).clone().multiply(pinv).multiply(local);
    } else matrix = local;
  }
  cache.set(addr, matrix);
  return matrix;
};
/** Blender's "XYZ" applies X first; three.js' Euler order names the matrix product, so the order is reversed. */
const reverseOrder = (order: string) => order.split('').reverse().join('') as THREE.EulerOrder;

// ------------------------------------------------------------ meshes
interface Layer { name: string; type: number; data: string | null }
/** Pre-5.0 attributes: CustomData layers (vdata/edata/pdata/ldata). */
const layers = (blend: BlendFile, customData: BStruct | null): Layer[] => {
  if (!customData) return [];
  const addr = customData.ptr('layers'); const block = blend.block(addr); const layerStruct = blend.structByType.get('CustomDataLayer'); if (!block || !layerStruct) return [];
  const count = Math.min(customData.int('totlayer', 0) || block.count, Math.floor(block.size / layerStruct.size));
  const out: Layer[] = [];
  for (let i = 0; i < count; i++) { const struct = blend.struct(block, i, 'CustomDataLayer'); if (struct) out.push({ name: struct.str('name'), type: struct.int('type'), data: struct.ptr('data') }); }
  return out;
};
/** Blender 5.0+: Mesh.attribute_storage – a list of named attributes; array data sits behind an AttributeArray. */
const storageLayers = (blend: BlendFile, mesh: BStruct): Layer[] => {
  const storage = mesh.sub('attribute_storage'); if (!storage) return [];
  const block = blend.block(storage.ptr('dna_attributes')); const attributeStruct = blend.structByType.get('Attribute'); if (!block || !attributeStruct) return [];
  const count = Math.min(storage.int('dna_attributes_num', 0) || block.count, Math.floor(block.size / attributeStruct.size));
  const out: Layer[] = [];
  for (let i = 0; i < count; i++) {
    const struct = blend.struct(block, i, 'Attribute'); if (!struct) continue;
    // Attribute.data is declared void*: for array storage it points at an AttributeArray { data, sharing_info, size }
    const holder = blend.block(struct.ptr('data'));
    const arr = holder && blend.structByType.has('AttributeArray') ? blend.struct(holder, 0, 'AttributeArray') : null;
    const data = arr ? arr.ptr('data') : struct.ptr('data');
    out.push({ name: blend.cstring(struct.ptr('name')), type: struct.int('data_type'), data });
  }
  return out;
};
/** Reads one field from every element of an array block (old MVert/MLoop/MPoly arrays). */
const column = (blend: BlendFile, addr: string | null, type: string, read: (struct: BStruct) => number[]): number[][] => {
  const block = blend.block(addr); const dnaStruct = blend.structByType.get(type); if (!block || !dnaStruct) return [];
  const count = Math.floor(block.size / dnaStruct.size);
  return Array.from({ length: count }, (_, i) => read(blend.struct(block, i, type)!));
};

const meshGeometry = (blend: BlendFile, mesh: BStruct): { geometry: THREE.BufferGeometry; materials: THREE.Material[] } | null => {
  // 5.0+ keeps all attributes in one list (names are unique across domains), older files per domain
  const stored = storageLayers(blend, mesh);
  const vertexLayers = [...layers(blend, mesh.sub('vdata')), ...stored], loopLayers = [...layers(blend, mesh.sub('ldata')), ...stored], polyLayers = [...layers(blend, mesh.sub('pdata')), ...stored];
  const find = (layerList: Layer[], name: string) => layerList.find(layer => layer.name === name)?.data ?? null;

  // vertex positions
  let pos: Float32Array | null = null;
  // newer files keep the old array fields with stale pointers – only use them if the data block exists
  const has = (field: string) => !!blend.block(mesh.ptr(field));
  if (has('mvert')) pos = Float32Array.from(column(blend, mesh.ptr('mvert'), 'MVert', struct => struct.floatArray('co') ?? [0, 0, 0]).flat());
  else pos = blend.floats(find(vertexLayers, 'position'));
  if (!pos || pos.length < 9) throw new Error('keine Eckpunkte');

  // corners → vertex index
  let corner: Int32Array | null = null;
  if (has('mloop')) corner = Int32Array.from(column(blend, mesh.ptr('mloop'), 'MLoop', struct => [struct.int('v')]).flat());
  else corner = blend.ints(find(loopLayers, '.corner_vert'));
  if (!corner) throw new Error('keine Flächenecken');

  // faces: start + size, material index
  let starts: number[] = [], sizes: number[] = [], matIdx: number[] = [];
  if (has('mpoly')) {
    for (const [loopStart, loopCount, materialIndex] of column(blend, mesh.ptr('mpoly'), 'MPoly', struct => [struct.int('loopstart'), struct.int('totloop'), struct.int('mat_nr')])) { starts.push(loopStart); sizes.push(loopCount); matIdx.push(materialIndex); }
  } else {
    const offs = blend.ints(mesh.ptr('face_offset_indices') ?? mesh.ptr('poly_offset_indices'));
    if (!offs) throw new Error('keine Flächenliste');
    const nFaces = mesh.int('faces_num', 0) || mesh.int('totpoly', 0) || offs.length - 1;
    for (let i = 0; i < nFaces && i + 1 < offs.length; i++) { starts.push(offs[i]); sizes.push(offs[i + 1] - offs[i]); }
    const materialIndices = blend.ints(find(polyLayers, 'material_index'));
    matIdx = starts.map((_, i) => (materialIndices ? materialIndices[i] ?? 0 : 0));
  }
  if (!starts.length) throw new Error('keine Flächen');

  // materials (base colour)
  const matAddrs = blend.pointerArray(mesh.ptr('mat'), mesh.int('totcol', 0) || undefined);
  const mats: THREE.Material[] = matAddrs.map(address => {
    const block = blend.block(address); const struct = block ? blend.struct(block) : null;
    const material = new THREE.MeshStandardMaterial();
    if (struct) {
      material.name = struct.sub('id')?.str('name').slice(2) ?? '';
      material.color.setRGB(struct.float('r', 0.8), struct.float('g', 0.8), struct.float('b', 0.8)); // linear values, like three.js
      const alpha = struct.has('a') ? struct.float('a', 1) : struct.float('alpha', 1);
      if (alpha < 0.999) { material.transparent = true; material.opacity = alpha; }
    }
    return material;
  });

  // triangulate per material
  const byMat = new Map<number, number[]>();
  const pointAt = (vertexIndex: number) => new THREE.Vector3(pos![vertexIndex * 3], pos![vertexIndex * 3 + 1], pos![vertexIndex * 3 + 2]);
  for (let faceIndex = 0; faceIndex < starts.length; faceIndex++) {
    const cornerCount = sizes[faceIndex]; if (cornerCount < 3) continue;
    const vertexIds: number[] = []; for (let k = 0; k < cornerCount; k++) { const vertex = corner[starts[faceIndex] + k]; if (vertex >= 0 && vertex * 3 + 2 < pos.length) vertexIds.push(vertex); }
    if (vertexIds.length < 3) continue;
    const materialSlot = mats.length ? Math.min(Math.max(matIdx[faceIndex] ?? 0, 0), mats.length - 1) : 0;
    const out = byMat.get(materialSlot) ?? byMat.set(materialSlot, []).get(materialSlot)!;
    const pts = vertexIds.map(pointAt);
    for (const [indexA, indexB, indexC] of triangulate(pts)) out.push(...pts[indexA].toArray(), ...pts[indexB].toArray(), ...pts[indexC].toArray());
  }
  const all: number[] = []; const geo = new THREE.BufferGeometry();
  for (const [materialSlot, arr] of [...byMat.entries()].sort((left, right) => left[0] - right[0])) { geo.addGroup(all.length / 3, arr.length / 3, materialSlot); all.push(...arr); }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(all, 3));
  return { geometry: geo, materials: mats };
};

/** Triangles of a (possibly concave) planar polygon, as index triples. */
const triangulate = (pts: THREE.Vector3[]): [number, number, number][] => {
  if (pts.length === 3) return [[0, 1, 2]];
  // Newell normal → project onto the dominant plane → earcut
  const normal = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) { const current = pts[i], next = pts[(i + 1) % pts.length]; normal.x += (current.y - next.y) * (current.z + next.z); normal.y += (current.z - next.z) * (current.x + next.x); normal.z += (current.x - next.x) * (current.y + next.y); }
  const absX = Math.abs(normal.x), absY = Math.abs(normal.y), absZ = Math.abs(normal.z);
  const flat = pts.map(point => (absZ >= absX && absZ >= absY ? new THREE.Vector2(point.x, point.y) : absX >= absY ? new THREE.Vector2(point.y, point.z) : new THREE.Vector2(point.z, point.x)));
  const ccw = !THREE.ShapeUtils.isClockWise(flat);
  const tris = THREE.ShapeUtils.triangulateShape(ccw ? flat : flat.slice().reverse(), []);
  const map = (i: number) => (ccw ? i : pts.length - 1 - i);
  // keep the polygon's own winding (= Blender's face direction)
  return tris.map(([indexA, indexB, indexC]) => (ccw ? [map(indexA), map(indexB), map(indexC)] : [map(indexA), map(indexC), map(indexB)]) as [number, number, number]);
};

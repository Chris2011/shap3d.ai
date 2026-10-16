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

export function readBlend(data: ArrayBuffer): BlendImport {
  const f = new BlendFile(data);
  const scene = new THREE.Group(); scene.name = 'Blender';
  const skipped: string[] = [];
  const geoCache = new Map<string, { geo: THREE.BufferGeometry; mats: THREE.Material[] } | null>();
  const worldCache = new Map<string, THREE.Matrix4>();
  let objects = 0;

  for (const b of f.blocksOf('OB')) {
    const ob = f.struct(b); if (!ob) continue;
    const name = ob.sub('id')?.str('name').slice(2) || 'Objekt';
    if (ob.int('type') !== OB_MESH) continue;
    const meAddr = ob.ptr('data'); const meBlock = f.block(meAddr);
    if (!meAddr || !meBlock) { skipped.push(`${name} (verknüpfte Daten)`); continue; }
    if (!geoCache.has(meAddr)) {
      const me = f.struct(meBlock);
      let r: { geo: THREE.BufferGeometry; mats: THREE.Material[] } | null = null;
      try { r = me ? meshGeometry(f, me) : null; }
      catch (e) {
        // meshes linked from another .blend are only placeholders in this file
        const linked = !!me?.sub('id')?.ptr('lib');
        skipped.push(`${name} (${linked ? 'aus verknüpfter Datei – dort öffnen' : (e as Error).message})`);
      }
      geoCache.set(meAddr, r);
    }
    const g = geoCache.get(meAddr); if (!g) continue;
    const mesh = new THREE.Mesh(g.geo, g.mats.length ? g.mats : new THREE.MeshStandardMaterial());
    mesh.name = name;
    mesh.matrixAutoUpdate = false; mesh.matrix.copy(worldMatrix(f, ob, b.addr, worldCache));
    scene.add(mesh); objects++;
  }
  return { scene, version: f.version, objects, meshes: [...geoCache.values()].filter(Boolean).length, skipped };
}

// ------------------------------------------------------------ transforms
function mat16(s: BStruct, name: string): THREE.Matrix4 | null {
  const a = s.floatArray(name); if (!a || a.length !== 16 || a.every(v => v === 0)) return null;
  return new THREE.Matrix4().fromArray(a); // Blender stores [column][row] – same order as three.js
}

/** World matrix: the saved one if the file has it, otherwise rebuilt from loc/rot/scale and the parent chain. */
function worldMatrix(f: BlendFile, ob: BStruct, addr: string, cache: Map<string, THREE.Matrix4>): THREE.Matrix4 {
  const hit = cache.get(addr); if (hit) return hit;
  let m = mat16(ob, 'obmat') ?? mat16(ob, 'object_to_world');
  if (!m) {
    const loc = ob.floatArray('loc') ?? [0, 0, 0], dloc = ob.floatArray('dloc') ?? [0, 0, 0];
    const size = ob.floatArray('size') ?? [1, 1, 1], dscale = ob.floatArray('dscale') ?? [1, 1, 1];
    const mode = ob.int('rotmode', 1);
    const q = new THREE.Quaternion();
    if (mode === 0) { const w = ob.floatArray('quat') ?? [1, 0, 0, 0]; q.set(w[1], w[2], w[3], w[0]).normalize(); }
    else if (mode === -1) { const ax = ob.floatArray('rotAxis') ?? [0, 1, 0]; q.setFromAxisAngle(new THREE.Vector3(...ax).normalize(), ob.float('rotAngle')); }
    else {
      const r = ob.floatArray('rot') ?? [0, 0, 0];
      // Blender euler modes 1..6 = XYZ XZY YXZ YZX ZXY ZYX (applied in that order)
      const order = (['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'][mode - 1] ?? 'XYZ') as THREE.EulerOrder;
      q.setFromEuler(new THREE.Euler(r[0], r[1], r[2], reverseOrder(order)));
    }
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(loc[0] + dloc[0], loc[1] + dloc[1], loc[2] + dloc[2]), q,
      new THREE.Vector3(size[0] * dscale[0], size[1] * dscale[1], size[2] * dscale[2]),
    );
    const parentAddr = ob.ptr('parent'); const pb = f.block(parentAddr);
    if (parentAddr && pb) {
      const parent = f.struct(pb)!;
      const pinv = mat16(ob, 'parentinv') ?? new THREE.Matrix4();
      m = worldMatrix(f, parent, parentAddr, cache).clone().multiply(pinv).multiply(local);
    } else m = local;
  }
  cache.set(addr, m);
  return m;
}
/** Blender's "XYZ" applies X first; three.js' Euler order names the matrix product, so the order is reversed. */
const reverseOrder = (o: string) => o.split('').reverse().join('') as THREE.EulerOrder;

// ------------------------------------------------------------ meshes
interface Layer { name: string; type: number; data: string | null }
/** Pre-5.0 attributes: CustomData layers (vdata/edata/pdata/ldata). */
function layers(f: BlendFile, cd: BStruct | null): Layer[] {
  if (!cd) return [];
  const addr = cd.ptr('layers'); const b = f.block(addr); const st = f.structByType.get('CustomDataLayer'); if (!b || !st) return [];
  const n = Math.min(cd.int('totlayer', 0) || b.count, Math.floor(b.size / st.size));
  const out: Layer[] = [];
  for (let i = 0; i < n; i++) { const l = f.struct(b, i, 'CustomDataLayer'); if (l) out.push({ name: l.str('name'), type: l.int('type'), data: l.ptr('data') }); }
  return out;
}
/** Blender 5.0+: Mesh.attribute_storage – a list of named attributes; array data sits behind an AttributeArray. */
function storageLayers(f: BlendFile, me: BStruct): Layer[] {
  const as = me.sub('attribute_storage'); if (!as) return [];
  const b = f.block(as.ptr('dna_attributes')); const st = f.structByType.get('Attribute'); if (!b || !st) return [];
  const n = Math.min(as.int('dna_attributes_num', 0) || b.count, Math.floor(b.size / st.size));
  const out: Layer[] = [];
  for (let i = 0; i < n; i++) {
    const a = f.struct(b, i, 'Attribute'); if (!a) continue;
    // Attribute.data is declared void*: for array storage it points at an AttributeArray { data, sharing_info, size }
    const holder = f.block(a.ptr('data'));
    const arr = holder && f.structByType.has('AttributeArray') ? f.struct(holder, 0, 'AttributeArray') : null;
    const data = arr ? arr.ptr('data') : a.ptr('data');
    out.push({ name: f.cstring(a.ptr('name')), type: a.int('data_type'), data });
  }
  return out;
}
/** Reads one field from every element of an array block (old MVert/MLoop/MPoly arrays). */
function column(f: BlendFile, addr: string | null, type: string, read: (s: BStruct) => number[]): number[][] {
  const b = f.block(addr); const st = f.structByType.get(type); if (!b || !st) return [];
  const n = Math.floor(b.size / st.size);
  return Array.from({ length: n }, (_, i) => read(f.struct(b, i, type)!));
}

function meshGeometry(f: BlendFile, me: BStruct): { geo: THREE.BufferGeometry; mats: THREE.Material[] } | null {
  // 5.0+ keeps all attributes in one list (names are unique across domains), older files per domain
  const stored = storageLayers(f, me);
  const vl = [...layers(f, me.sub('vdata')), ...stored], ll = [...layers(f, me.sub('ldata')), ...stored], pl = [...layers(f, me.sub('pdata')), ...stored];
  const find = (ls: Layer[], name: string) => ls.find(l => l.name === name)?.data ?? null;

  // vertex positions
  let pos: Float32Array | null = null;
  // newer files keep the old array fields with stale pointers – only use them if the data block exists
  const has = (field: string) => !!f.block(me.ptr(field));
  if (has('mvert')) pos = Float32Array.from(column(f, me.ptr('mvert'), 'MVert', s => s.floatArray('co') ?? [0, 0, 0]).flat());
  else pos = f.floats(find(vl, 'position'));
  if (!pos || pos.length < 9) throw new Error('keine Eckpunkte');

  // corners → vertex index
  let corner: Int32Array | null = null;
  if (has('mloop')) corner = Int32Array.from(column(f, me.ptr('mloop'), 'MLoop', s => [s.int('v')]).flat());
  else corner = f.ints(find(ll, '.corner_vert'));
  if (!corner) throw new Error('keine Flächenecken');

  // faces: start + size, material index
  let starts: number[] = [], sizes: number[] = [], matIdx: number[] = [];
  if (has('mpoly')) {
    for (const [s, n, m] of column(f, me.ptr('mpoly'), 'MPoly', s => [s.int('loopstart'), s.int('totloop'), s.int('mat_nr')])) { starts.push(s); sizes.push(n); matIdx.push(m); }
  } else {
    const offs = f.ints(me.ptr('face_offset_indices') ?? me.ptr('poly_offset_indices'));
    if (!offs) throw new Error('keine Flächenliste');
    const nFaces = me.int('faces_num', 0) || me.int('totpoly', 0) || offs.length - 1;
    for (let i = 0; i < nFaces && i + 1 < offs.length; i++) { starts.push(offs[i]); sizes.push(offs[i + 1] - offs[i]); }
    const mi = f.ints(find(pl, 'material_index'));
    matIdx = starts.map((_, i) => (mi ? mi[i] ?? 0 : 0));
  }
  if (!starts.length) throw new Error('keine Flächen');

  // materials (base colour)
  const matAddrs = f.pointerArray(me.ptr('mat'), me.int('totcol', 0) || undefined);
  const mats: THREE.Material[] = matAddrs.map(a => {
    const b = f.block(a); const ma = b ? f.struct(b) : null;
    const m = new THREE.MeshStandardMaterial();
    if (ma) {
      m.name = ma.sub('id')?.str('name').slice(2) ?? '';
      m.color.setRGB(ma.float('r', 0.8), ma.float('g', 0.8), ma.float('b', 0.8)); // linear values, like three.js
      const alpha = ma.has('a') ? ma.float('a', 1) : ma.float('alpha', 1);
      if (alpha < 0.999) { m.transparent = true; m.opacity = alpha; }
    }
    return m;
  });

  // triangulate per material
  const byMat = new Map<number, number[]>();
  const P = (vi: number) => new THREE.Vector3(pos![vi * 3], pos![vi * 3 + 1], pos![vi * 3 + 2]);
  for (let fi = 0; fi < starts.length; fi++) {
    const n = sizes[fi]; if (n < 3) continue;
    const vids: number[] = []; for (let k = 0; k < n; k++) { const v = corner[starts[fi] + k]; if (v >= 0 && v * 3 + 2 < pos.length) vids.push(v); }
    if (vids.length < 3) continue;
    const mi = mats.length ? Math.min(Math.max(matIdx[fi] ?? 0, 0), mats.length - 1) : 0;
    const out = byMat.get(mi) ?? byMat.set(mi, []).get(mi)!;
    const pts = vids.map(P);
    for (const [a, b, c] of triangulate(pts)) out.push(...pts[a].toArray(), ...pts[b].toArray(), ...pts[c].toArray());
  }
  const all: number[] = []; const geo = new THREE.BufferGeometry();
  for (const [mi, arr] of [...byMat.entries()].sort((a, b) => a[0] - b[0])) { geo.addGroup(all.length / 3, arr.length / 3, mi); all.push(...arr); }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(all, 3));
  return { geo, mats };
}

/** Triangles of a (possibly concave) planar polygon, as index triples. */
function triangulate(pts: THREE.Vector3[]): [number, number, number][] {
  if (pts.length === 3) return [[0, 1, 2]];
  // Newell normal → project onto the dominant plane → earcut
  const n = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; n.x += (a.y - b.y) * (a.z + b.z); n.y += (a.z - b.z) * (a.x + b.x); n.z += (a.x - b.x) * (a.y + b.y); }
  const ax = Math.abs(n.x), ay = Math.abs(n.y), az = Math.abs(n.z);
  const flat = pts.map(p => (az >= ax && az >= ay ? new THREE.Vector2(p.x, p.y) : ax >= ay ? new THREE.Vector2(p.y, p.z) : new THREE.Vector2(p.z, p.x)));
  const ccw = !THREE.ShapeUtils.isClockWise(flat);
  const tris = THREE.ShapeUtils.triangulateShape(ccw ? flat : flat.slice().reverse(), []);
  const map = (i: number) => (ccw ? i : pts.length - 1 - i);
  // keep the polygon's own winding (= Blender's face direction)
  return tris.map(([a, b, c]) => (ccw ? [map(a), map(b), map(c)] : [map(a), map(c), map(b)]) as [number, number, number]);
}

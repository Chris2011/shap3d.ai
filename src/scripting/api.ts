import * as THREE from 'three';
import type { Editor } from '../engine/editor';
import type { Entities, EntityRef, Instance, Definition } from '../core/model';
import { newId } from '../core/model';
import { buildText, type FontName } from '../core/text3d';
import { parseLength } from '../core/units';
import { offsetPolygon } from '../core/geometry';
import { TEXTURES, isTextureKind } from '../core/textures';
import { buildMesh, parseObj } from './mesh';
import { MATERIAL_LIBRARY, libraryMaterial } from '../core/materialLibrary';
import { newTerrain, generateHills, bakeTerrain } from '../core/terrain';

export type Pt = [number, number, number] | { x: number; y: number; z: number } | THREE.Vector3;
const V = (p: Pt | undefined, def: [number, number, number] = [0, 0, 0]): THREE.Vector3 => {
  if (!p) return new THREE.Vector3(...def);
  if (Array.isArray(p)) return new THREE.Vector3(p[0] ?? 0, p[1] ?? 0, p[2] ?? 0);
  return new THREE.Vector3(p.x, p.y, p.z);
};
const AX: Record<string, THREE.Vector3> = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1), red: new THREE.Vector3(1, 0, 0), green: new THREE.Vector3(0, 1, 0), blue: new THREE.Vector3(0, 0, 1) };
const axis = (a: string | Pt | undefined) => (typeof a === 'string' ? (AX[a.toLowerCase()] ?? AX.z).clone() : a ? V(a).normalize() : AX.z.clone());

/** Handle to a face created by a script. */
export class FaceHandle {
  constructor(private api: ScriptApi, public ents: Entities, public id: number) {}
  get exists() { return this.ents.faces.has(this.id); }
  get area() { const f = this.ents.faces.get(this.id); return f ? this.ents.faceArea(f) : 0; }
  get normal() { const f = this.ents.faces.get(this.id); return f ? this.ents.faceNormal(f).toArray() : [0, 0, 0]; }
  /** Push/Pull along the face normal. Returns the new top face. */
  pushpull(d: number | string): FaceHandle | null {
    const dist = this.api.len(d);
    const f = this.ents.faces.get(this.id); if (!f) throw new Error('Fläche existiert nicht mehr');
    // positive values always extrude "up/out" for faces lying on the ground (normal pointing down)
    const n = this.ents.faceNormal(f);
    const s = n.z < -0.999 ? -1 : 1;
    const top = this.ents.pushPull(this.id, s * dist);
    return top != null ? new FaceHandle(this.api, this.ents, top) : null;
  }
  /** Extrude by `d` towards a direction ('x' | 'y' | 'z' | '-x' ... or a vector), regardless of face orientation. */
  extrude(d: number | string, dir: string | Pt = 'z'): FaceHandle | null {
    const f = this.ents.faces.get(this.id); if (!f) throw new Error('Fläche existiert nicht mehr');
    let want: THREE.Vector3;
    if (typeof dir === 'string') { const neg = dir.startsWith('-'); want = axis(dir.replace('-', '')); if (neg) want.negate(); } else want = V(dir);
    const s = this.ents.faceNormal(f).dot(want) >= 0 ? 1 : -1;
    const top = this.ents.pushPull(this.id, s * this.api.len(d));
    return top != null ? new FaceHandle(this.api, this.ents, top) : null;
  }
  material(name: string) { const f = this.ents.faces.get(this.id); if (f) f.material = this.api.ensureMaterial(name); return this; }
  backMaterial(name: string) { const f = this.ents.faces.get(this.id); if (f) f.backMaterial = this.api.ensureMaterial(name); return this; }
  reverse() { const f = this.ents.faces.get(this.id); if (f) this.ents.reverseFace(f); return this; }
  offset(d: number | string) { const f = this.ents.faces.get(this.id); if (!f) return this; this.api.offsetFace(this.ents, this.id, this.api.len(d)); return this; }
  followMe(path: Pt[], closed = false) { this.ents.followMe(this.id, path.map(p => V(p)), closed); return this; }
  ref(): EntityRef { return { kind: 'face', id: this.id }; }
}

/** Handle to a group/component instance. */
export class GroupHandle {
  constructor(private api: ScriptApi, public parent: Entities, public inst: Instance) {}
  get name() { return this.inst.name || this.inst.def.name; }
  get entities() { return this.inst.def.entities; }
  move(v: Pt) { const d = V(v); this.inst.matrix.premultiply(new THREE.Matrix4().makeTranslation(d.x, d.y, d.z)); return this; }
  moveTo(p: Pt) { const d = V(p); const e = this.inst.matrix.elements; e[12] = d.x; e[13] = d.y; e[14] = d.z; return this; }
  rotate(deg: number, ax: string | Pt = 'z', center?: Pt) {
    const c = center ? V(center) : new THREE.Vector3().setFromMatrixPosition(this.inst.matrix);
    const m = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeRotationAxis(axis(ax), deg * Math.PI / 180)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
    this.inst.matrix.premultiply(m); return this;
  }
  scale(f: number | Pt, center?: Pt) {
    const s = typeof f === 'number' ? new THREE.Vector3(f, f, f) : V(f);
    const c = center ? V(center) : new THREE.Vector3().setFromMatrixPosition(this.inst.matrix);
    const m = new THREE.Matrix4().makeTranslation(c.x, c.y, c.z).multiply(new THREE.Matrix4().makeScale(s.x, s.y, s.z)).multiply(new THREE.Matrix4().makeTranslation(-c.x, -c.y, -c.z));
    this.inst.matrix.premultiply(m); return this;
  }
  material(name: string) { this.inst.material = this.api.ensureMaterial(name); return this; }
  tag(name: string) { this.inst.tag = this.api.ensureTag(name); return this; }
  hide() { this.inst.hidden = true; return this; }
  copy(offset?: Pt): GroupHandle {
    const def = this.inst.def.isComponent ? this.inst.def : this.api.ed.model.cloneDefinition(this.inst.def);
    const ni = this.parent.addInstance(def, this.inst.matrix.clone(), this.inst.name); ni.material = this.inst.material; ni.tag = this.inst.tag;
    const h = new GroupHandle(this.api, this.parent, ni); if (offset) h.move(offset); return h;
  }
  explode() { const refs = this.parent.merge(this.inst.def.entities, this.inst.matrix, this.api.ed.model, this.inst.material); this.parent.instances.delete(this.inst.id); return refs.length; }
  ref(): EntityRef { return { kind: 'instance', id: this.inst.id }; }
}

export interface ScriptLog { kind: 'log' | 'warn' | 'error' | 'result'; text: string }

/** The `s3d` object available to scripts. Units are meters unless strings like "50cm" are used. */
export class ScriptApi {
  private stack: Entities[] = [];
  logs: ScriptLog[] = [];
  private cameraAfter: (() => void) | null = null;
  constructor(public ed: Editor, root?: Entities) { this.stack = [root ?? ed.entities]; }

  get ents(): Entities { return this.stack[this.stack.length - 1]; }
  len(v: number | string): number { if (typeof v === 'number') return v; const r = parseLength(v, this.ed.model.settings.units); if (r == null) throw new Error(`Ungültige Länge: ${v}`); return r; }
  v(x = 0, y = 0, z = 0) { return [x, y, z] as [number, number, number]; }
  mm(x: number) { return x / 1000; }
  cm(x: number) { return x / 100; }
  m(x: number) { return x; }
  deg(x: number) { return x * Math.PI / 180; }
  get THREE() { return THREE; }

  log(...a: any[]) { this.logs.push({ kind: 'log', text: a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') }); }
  warn(...a: any[]) { this.logs.push({ kind: 'warn', text: a.map(x => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') }); }

  ensureMaterial(name: string, color?: string, opacity = 1): string {
    const m = this.ed.model.materials.find(x => x.name === name);
    if (m) { if (color) { m.color = color; m.opacity = opacity; } return name; }
    // ready-made materials ('Glas', 'Eiche hell', 'Stahl' …) need no definition
    const lib = !color ? libraryMaterial(name) : undefined;
    if (lib) { this.ed.model.materials.push({ name: lib.name, color: lib.color, opacity: lib.opacity ?? 1, texture: lib.texture, textureSize: lib.size }); return lib.name; }
    let c = color;
    if (!c) { if (/^#|^rgb/i.test(name)) c = name; else { const tmp = new THREE.Color(); try { tmp.setStyle(name); c = '#' + tmp.getHexString(); } catch { c = '#cccccc'; } } }
    this.ed.model.materials.push({ name, color: c!, opacity });
    return name;
  }
  ensureTag(name: string) { if (!this.ed.model.tags.some(t => t.name === name)) this.ed.model.tags.push({ name, visible: true, color: '#' + new THREE.Color().setHSL(Math.random(), 0.5, 0.6).getHexString() }); return name; }

  /** Define or update a material. */
  /**
   * Define or update a material. Third argument: opacity (0..1) or options
   * { opacity, texture: 'holz'|'ziegel'|'stein'|'gras'|'fliesen'|'beton'|'metall'|'stoff'|'wasser'|'marmor'|'dach'|'parkett', size: meters }.
   */
  material(name: string, color?: string, opts: number | { opacity?: number; texture?: string; size?: number } = 1) {
    if (color == null) { const n = this.ensureMaterial(name); return n; } // library material or CSS colour name
    const o = typeof opts === 'number' ? { opacity: opts } : opts;
    this.ensureMaterial(name, color, o.opacity ?? 1);
    const m = this.ed.model.materials.find(x => x.name === name)!;
    if (o.texture !== undefined) {
      if (o.texture && !isTextureKind(o.texture)) throw new Error(`Unbekannte Textur „${o.texture}“. Erlaubt: ${Object.keys(TEXTURES).join(', ')}`);
      m.texture = o.texture || undefined;
    }
    if (o.size) m.textureSize = this.len(o.size);
    return name;
  }
  /** Cylinder (or cone when r2 is given) from point a to point b – handy for legs, branches, pipes. */
  cylinderBetween(a: Pt, b: Pt, r: number | string, opts: { r2?: number | string; segments?: number; name?: string; material?: string; group?: boolean } = {}): GroupHandle | null {
    const A = V(a), B = V(b); const L = A.distanceTo(B); if (L < 1e-6) return null;
    const R1 = this.len(r), R2 = opts.r2 != null ? this.len(opts.r2) : R1; const n = opts.segments ?? 12;
    const make = () => {
      const dir = B.clone().sub(A).normalize();
      const u = Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(dir).normalize() : new THREE.Vector3(1, 0, 0).cross(dir).normalize();
      const w = dir.clone().cross(u).normalize();
      const ring = (c: THREE.Vector3, rr: number) => { const out: THREE.Vector3[] = []; for (let i = 0; i < n; i++) { const t = i / n * Math.PI * 2; out.push(c.clone().addScaledVector(u, Math.cos(t) * rr).addScaledVector(w, Math.sin(t) * rr)); } return out; };
      const E = this.ents; const ra = ring(A, R1).map(p => E.addVertex(p));
      const rb = R2 > 1e-6 ? ring(B, R2).map(p => E.addVertex(p)) : null; const tip = rb ? -1 : E.addVertex(B);
      for (let i = 0; i < n; i++) { const j = (i + 1) % n; if (rb) E.createFaceRaw([ra[i], ra[j], rb[j], rb[i]]); else E.createFaceRaw([ra[i], ra[j], tip]); }
      E.createFaceRaw([...ra].reverse()); if (rb) E.createFaceRaw(rb);
      E.autoSoften([...E.edges.keys()], 35);
      if (opts.material) this.paintAll(E, opts.material);
    };
    if (opts.group === false) { make(); return null; }
    return this.group(opts.name ?? 'Zylinder', make);
  }
  /** Ellipsoid with radii rx, ry, rz (bodies, heads, leaves …). */
  ellipsoid(center: Pt, rx: number | string, ry: number | string, rz: number | string, opts: { segments?: number; name?: string; material?: string } = {}): GroupHandle {
    const g = this.sphere([0, 0, 0], 1, { segments: opts.segments ?? 16, name: opts.name ?? 'Ellipsoid', material: opts.material });
    const c = V(center); g.inst.matrix.makeScale(this.len(rx), this.len(ry), this.len(rz)).setPosition(c);
    return g;
  }
  tag(name: string, visible = true) { this.ensureTag(name); const t = this.ed.model.tags.find(x => x.name === name)!; t.visible = visible; return name; }

  // ---------------- geometry ----------------
  clear() {
    const e = this.ents;
    for (const id of [...e.instances.keys()]) e.instances.delete(id);
    for (const id of [...e.faces.keys()]) e.removeFace(id);
    for (const ed of [...e.edges.values()]) e.eraseEdge(ed.id, false);
    e.removeOrphanVertices();
    if (this.stack.length === 1 && !this.ed.activePath.length) { this.ed.model.guides = []; this.ed.model.dimensions = []; this.ed.model.labels = []; this.ed.model.sections = []; }
  }
  line(a: Pt, b: Pt) { this.ents.addLine(V(a), V(b)); }
  polyline(points: Pt[], closed = false) { const p = points.map(x => V(x)); for (let i = 0; i < p.length - 1; i++) this.ents.addLine(p[i], p[i + 1]); if (closed && p.length > 2) this.ents.addLine(p[p.length - 1], p[0]); return this.lastFace(); }
  private lastFace(): FaceHandle | null { let max = -1; for (const id of this.ents.faces.keys()) if (id > max) max = id; return max >= 0 ? new FaceHandle(this, this.ents, max) : null; }
  /** Create a face from points (closed loop). */
  face(points: Pt[]): FaceHandle {
    const before = new Set(this.ents.faces.keys());
    const p = points.map(x => V(x)); this.ents.addLoop(p);
    // find the new face whose vertices match the loop
    const want = p.map(q => this.ents.findVertex(q));
    for (const f of this.ents.faces.values()) if (!before.has(f.id) && want.every(v => v != null && f.outer.includes(v))) return new FaceHandle(this, this.ents, f.id);
    for (const f of this.ents.faces.values()) if (want.every(v => v != null && f.outer.includes(v))) return new FaceHandle(this, this.ents, f.id);
    const lf = this.lastFace(); if (!lf) throw new Error('Fläche konnte nicht erstellt werden (Punkte nicht in einer Ebene?)'); return lf;
  }
  /** Rectangle with corner `at`, width (x) and depth (y). plane: 'xy' | 'xz' | 'yz'. */
  rect(at: Pt, w: number | string, d: number | string, plane: 'xy' | 'xz' | 'yz' = 'xy'): FaceHandle {
    const o = V(at); const W = this.len(w), D = this.len(d);
    const [u, v] = plane === 'xz' ? [AX.x, AX.z] : plane === 'yz' ? [AX.y, AX.z] : [AX.x, AX.y];
    return this.face([o, o.clone().addScaledVector(u, W), o.clone().addScaledVector(u, W).addScaledVector(v, D), o.clone().addScaledVector(v, D)]);
  }
  circle(center: Pt, r: number | string, opts: { segments?: number; normal?: string | Pt } = {}): FaceHandle {
    return this.ngon(center, this.len(r), opts.segments ?? 24, opts.normal);
  }
  polygon(center: Pt, r: number | string, sides = 6, normal?: string | Pt): FaceHandle { return this.ngon(center, this.len(r), sides, normal); }
  private ngon(center: Pt, r: number, n: number, normal?: string | Pt): FaceHandle {
    const c = V(center); const nn = axis(normal);
    const u = Math.abs(nn.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(nn).normalize() : new THREE.Vector3(1, 0, 0);
    const v = nn.clone().cross(u).normalize();
    const pts: THREE.Vector3[] = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push(c.clone().addScaledVector(u, Math.cos(a) * r).addScaledVector(v, Math.sin(a) * r)); }
    return this.face(pts);
  }
  arc(center: Pt, r: number | string, startDeg: number, endDeg: number, segments = 12, normal?: string | Pt) {
    const c = V(center), R = this.len(r), nn = axis(normal);
    const u = Math.abs(nn.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(nn).normalize() : new THREE.Vector3(1, 0, 0); const v = nn.clone().cross(u).normalize();
    const pts: THREE.Vector3[] = []; for (let i = 0; i <= segments; i++) { const a = (startDeg + (endDeg - startDeg) * i / segments) * Math.PI / 180; pts.push(c.clone().addScaledVector(u, Math.cos(a) * R).addScaledVector(v, Math.sin(a) * R)); }
    this.polyline(pts); return pts.map(p => p.toArray());
  }
  /** Box as a group (default) or raw geometry. */
  box(at: Pt, w: number | string, d: number | string, h: number | string, opts: { group?: boolean; name?: string; material?: string } = {}): GroupHandle | FaceHandle {
    const make = () => { const f = this.rect(at, w, d); return f.pushpull(h); };
    if (opts.group === false) { const t = make(); if (opts.material) this.paintAll(this.ents, opts.material); return t!; }
    return this.group(opts.name ?? 'Quader', () => { make(); if (opts.material) this.paintAll(this.ents, opts.material); });
  }
  cylinder(center: Pt, r: number | string, h: number | string, opts: { segments?: number; group?: boolean; name?: string; material?: string } = {}): GroupHandle | FaceHandle {
    const make = () => this.circle(center, r, { segments: opts.segments ?? 24 }).pushpull(h);
    if (opts.group === false) return make()!;
    return this.group(opts.name ?? 'Zylinder', () => { make(); if (opts.material) this.paintAll(this.ents, opts.material); });
  }
  sphere(center: Pt, r: number | string, opts: { segments?: number; name?: string; material?: string } = {}): GroupHandle {
    const c = V(center), R = this.len(r), n = opts.segments ?? 24;
    return this.group(opts.name ?? 'Kugel', () => {
      // latitude rings around the Z axis
      const prof: THREE.Vector3[] = []; for (let i = 0; i <= n / 2; i++) { const a = -Math.PI / 2 + i / (n / 2) * Math.PI; prof.push(new THREE.Vector3(c.x + Math.cos(a) * R, c.y, c.z + Math.sin(a) * R)); }
      const rings = prof.map(p => { const rr = Math.hypot(p.x - c.x, p.y - c.y); const pts: THREE.Vector3[] = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; pts.push(new THREE.Vector3(c.x + Math.cos(a) * rr, c.y + Math.sin(a) * rr, p.z)); } return pts; });
      const E = this.ents;
      for (let j = 0; j < rings.length - 1; j++) for (let i = 0; i < n; i++) {
        const a = rings[j][i], b = rings[j][(i + 1) % n], cc = rings[j + 1][(i + 1) % n], d = rings[j + 1][i];
        const ids = [a, b, cc, d].map(p => E.addVertex(p)); const uniq = ids.filter((x, k) => ids.indexOf(x) === k);
        if (uniq.length >= 3) E.createFaceRaw(uniq);
      }
      E.autoSoften([...E.edges.keys()], 45);
      if (opts.material) this.paintAll(E, opts.material);
    });
  }
  // ---------------- more solids ----------------
  /** Cone (or truncated cone with r2) standing on `center`. */
  cone(center: Pt, r: number | string, h: number | string, opts: { r2?: number | string; segments?: number; name?: string; material?: string } = {}): GroupHandle {
    const c = V(center);
    return this.cylinderBetween(c, c.clone().add(new THREE.Vector3(0, 0, this.len(h))), r, { r2: opts.r2 ?? 0, segments: opts.segments ?? 24, name: opts.name ?? 'Kegel', material: opts.material })!;
  }
  /** Pyramid on `center` – `size` is the base edge length (4 sides) or the edge of the regular n-gon. */
  pyramid(center: Pt, size: number | string, h: number | string, opts: { sides?: number; name?: string; material?: string } = {}): GroupHandle {
    const c = V(center), n = Math.max(3, opts.sides ?? 4), H = this.len(h);
    const R = this.len(size) / (2 * Math.sin(Math.PI / n));
    return this.group(opts.name ?? 'Pyramide', () => {
      const E = this.ents; const base: number[] = [];
      for (let i = 0; i < n; i++) { const a = Math.PI / n + i / n * Math.PI * 2 - (n === 4 ? Math.PI / 2 : 0); base.push(E.addVertex(new THREE.Vector3(c.x + Math.cos(a) * R, c.y + Math.sin(a) * R, c.z))); }
      const apex = E.addVertex(new THREE.Vector3(c.x, c.y, c.z + H));
      E.createFaceRaw([...base].reverse());
      for (let i = 0; i < n; i++) E.createFaceRaw([base[i], base[(i + 1) % n], apex]);
      if (opts.material) this.paintAll(E, opts.material);
    });
  }
  /** Upright prism with a regular n-gon base (6 = hexagon). */
  prism(center: Pt, r: number | string, h: number | string, opts: { sides?: number; name?: string; material?: string } = {}): GroupHandle {
    return this.group(opts.name ?? 'Prisma', () => { this.polygon(center, r, opts.sides ?? 6).pushpull(h); if (opts.material) this.paintAll(this.ents, opts.material); });
  }
  /** Hollow cylinder (pipe, ring, cup) standing on `center`. */
  tube(center: Pt, rOuter: number | string, rInner: number | string, h: number | string, opts: { segments?: number; name?: string; material?: string } = {}): GroupHandle {
    const c = V(center), Ro = this.len(rOuter), Ri = this.len(rInner), H = this.len(h), n = opts.segments ?? 24;
    if (!(Ri > 0 && Ri < Ro)) throw new Error('tube: Innenradius muss zwischen 0 und dem Außenradius liegen');
    return this.group(opts.name ?? 'Rohr', () => {
      const E = this.ents;
      const ring = (r: number, z: number) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2; return E.addVertex(new THREE.Vector3(c.x + Math.cos(a) * r, c.y + Math.sin(a) * r, c.z + z)); });
      const ob = ring(Ro, 0), ot = ring(Ro, H), ib = ring(Ri, 0), it = ring(Ri, H);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        E.createFaceRaw([ob[i], ob[j], ot[j], ot[i]]);   // outside
        E.createFaceRaw([ib[j], ib[i], it[i], it[j]]);   // inside
        E.createFaceRaw([ot[i], ot[j], it[j], it[i]]);   // top
        E.createFaceRaw([ob[i], ib[i], ib[j], ob[j]]);   // bottom
      }
      E.mergeCoplanar([...E.edges.keys()]);
      E.autoSoften([...E.edges.keys()], 35);
      if (opts.material) this.paintAll(E, opts.material);
    });
  }
  /** Torus (ring/donut) lying flat around `center`: R = ring radius, r = tube radius. */
  torus(center: Pt, R: number | string, r: number | string, opts: { segments?: number; sides?: number; name?: string; material?: string } = {}): GroupHandle {
    const c = V(center), RR = this.len(R), rr = this.len(r), nu = opts.segments ?? 24, nv = opts.sides ?? 12;
    return this.group(opts.name ?? 'Torus', () => {
      const E = this.ents;
      const p = (i: number, k: number) => { const u = (i % nu) / nu * Math.PI * 2, v = (k % nv) / nv * Math.PI * 2, q = RR + rr * Math.cos(v); return E.addVertex(new THREE.Vector3(c.x + q * Math.cos(u), c.y + q * Math.sin(u), c.z + rr * Math.sin(v))); };
      for (let i = 0; i < nu; i++) for (let k = 0; k < nv; k++) E.createFaceRaw([p(i, k), p(i + 1, k), p(i + 1, k + 1), p(i, k + 1)]);
      E.autoSoften([...E.edges.keys()], 45);
      if (opts.material) this.paintAll(E, opts.material);
    });
  }
  /** Wedge/ramp: footprint w × d from corner `at`, rising along +x to height h. */
  wedge(at: Pt, w: number | string, d: number | string, h: number | string, opts: { name?: string; material?: string } = {}): GroupHandle {
    const o = V(at), W = this.len(w), D = this.len(d), H = this.len(h);
    return this.group(opts.name ?? 'Keil', () => {
      const E = this.ents; const P = (x: number, y: number, z: number) => E.addVertex(new THREE.Vector3(o.x + x, o.y + y, o.z + z));
      const a0 = P(0, 0, 0), a1 = P(W, 0, 0), a2 = P(W, D, 0), a3 = P(0, D, 0), t1 = P(W, 0, H), t2 = P(W, D, H);
      E.createFaceRaw([a0, a3, a2, a1]); E.createFaceRaw([a1, a2, t2, t1]); E.createFaceRaw([a0, a1, t1]); E.createFaceRaw([a3, t2, a2]); E.createFaceRaw([a0, t1, t2, a3]);
      if (opts.material) this.paintAll(E, opts.material);
    });
  }
  /** Half sphere (dome) sitting on `center`. */
  dome(center: Pt, r: number | string, opts: { segments?: number; name?: string; material?: string } = {}): GroupHandle {
    const c = V(center), R = this.len(r), n = opts.segments ?? 24, rings = Math.max(3, Math.round(n / 4));
    return this.group(opts.name ?? 'Kuppel', () => {
      const E = this.ents;
      const ring = (k: number) => { const a = k / rings * Math.PI / 2, rr = Math.cos(a) * R, z = Math.sin(a) * R; return Array.from({ length: n }, (_, i) => { const t = i / n * Math.PI * 2; return E.addVertex(new THREE.Vector3(c.x + Math.cos(t) * rr, c.y + Math.sin(t) * rr, c.z + z)); }); };
      const rs = Array.from({ length: rings + 1 }, (_, k) => ring(k));
      for (let k = 0; k < rings; k++) for (let i = 0; i < n; i++) {
        const j = (i + 1) % n; const ids = [rs[k][i], rs[k][j], rs[k + 1][j], rs[k + 1][i]]; const uniq = ids.filter((x, q) => ids.indexOf(x) === q);
        if (uniq.length >= 3) E.createFaceRaw(uniq);
      }
      E.createFaceRaw([...rs[0]].reverse());
      E.autoSoften([...E.edges.keys()], 45);
      if (opts.material) this.paintAll(E, opts.material);
    });
  }
  /** Straight staircase starting at `at`, climbing along +x. Defaults: 10 steps, 17.5 cm rise, 28 cm run, 1 m wide. */
  stairs(at: Pt, opts: { steps?: number; rise?: number | string; run?: number | string; width?: number | string; name?: string; material?: string } = {}): GroupHandle {
    const o = V(at), N = Math.max(1, Math.round(opts.steps ?? 10)), rise = this.len(opts.rise ?? 0.175), run = this.len(opts.run ?? 0.28), W = this.len(opts.width ?? 1);
    return this.group(opts.name ?? 'Treppe', () => {
      const pts: THREE.Vector3[] = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(N * run, 0, 0), new THREE.Vector3(N * run, 0, N * rise)];
      for (let i = N - 1; i >= 0; i--) { pts.push(new THREE.Vector3(i * run, 0, (i + 1) * rise)); if (i > 0) pts.push(new THREE.Vector3(i * run, 0, i * rise)); }
      this.face(pts.map(p => p.add(o))).extrude(W, 'y');
      if (opts.material) this.paintAll(this.ents, opts.material);
    });
  }

  /**
   * Terrain (landscape) with hills/mountains as a group – editable later with the terrain tool.
   * hills = peak height in m (0 = flat), scale = metres per hill, rock/snow = height where rock/snow starts.
   */
  terrain(at: Pt, w: number | string, d: number | string, opts: { hills?: number | string; scale?: number | string; seed?: number; rock?: number | string; snow?: number | string; water?: number | string; skirt?: boolean; cell?: number | string; name?: string } = {}): GroupHandle {
    const o = V(at), W = this.len(w), D = this.len(d);
    const data = newTerrain(W, D, opts.cell != null ? this.len(opts.cell) : undefined);
    const hills = opts.hills != null ? this.len(opts.hills) : Math.max(W, D) * 0.1;
    if (hills > 0) generateHills(data, { height: hills, scale: opts.scale != null ? this.len(opts.scale) : undefined, seed: opts.seed });
    if (opts.rock != null) data.layers.rockHeight = this.len(opts.rock);
    else data.layers.rockHeight = Math.max(1, hills * 0.7);
    if (opts.snow != null) data.layers.snowHeight = this.len(opts.snow);
    if (opts.water != null) data.water = this.len(opts.water);
    if (opts.skirt === false) data.skirt = false;
    const g = this.group(opts.name ?? 'Gelände', () => { bakeTerrain(this.ents, data, this.ed.model); });
    g.inst.def.terrain = data;
    return g.move([o.x, o.y, o.z]);
  }

  /** Names of the ready-made materials (optionally one category, e.g. 'Holz', 'Metall'). */
  materials(category?: string): string[] { return MATERIAL_LIBRARY.filter(m => !category || m.category.toLowerCase().startsWith(category.toLowerCase())).map(m => m.name); }
  /** Texture kinds usable in s3d.material(name, color, { texture }). */
  textures(): string[] { return Object.keys(TEXTURES); }

  private paintAll(e: Entities, m: string) { const n = this.ensureMaterial(m); for (const f of e.faces.values()) f.material = n; }
  pushpull(face: FaceHandle, d: number | string) { return face.pushpull(d); }

  /** Create a group; geometry created inside `fn` goes into the group. */
  group(name: string, fn: (s3d: ScriptApi) => void): GroupHandle {
    const model = this.ed.model;
    const def = model.newDefinition(name, false);
    const parent = this.ents;
    const inst = parent.addInstance(def, new THREE.Matrix4(), name);
    this.stack.push(def.entities);
    try { fn(this); } finally { this.stack.pop(); }
    return new GroupHandle(this, parent, inst);
  }
  /** Create a component definition (reusable); returns a function to place instances. */
  component(name: string, fn: (s3d: ScriptApi) => void): { def: Definition; place: (at?: Pt, rotDeg?: number, scale?: number) => GroupHandle } {
    const def = this.ed.model.newDefinition(name, true);
    this.stack.push(def.entities);
    try { fn(this); } finally { this.stack.pop(); }
    const place = (at?: Pt, rotDeg = 0, scale = 1) => {
      const p = V(at); const m = new THREE.Matrix4().compose(p, new THREE.Quaternion().setFromAxisAngle(AX.z, rotDeg * Math.PI / 180), new THREE.Vector3(scale, scale, scale));
      return new GroupHandle(this, this.ents, this.ents.addInstance(def, m, ''));
    };
    return { def, place };
  }
  /** 3D text as a component. */
  text3d(text: string, opts: { at?: Pt; size?: number | string; depth?: number | string; font?: FontName; upright?: boolean; material?: string } = {}): GroupHandle {
    const g = this.group(`Text „${text}“`, () => { buildText(this.ents, text, { size: this.len(opts.size ?? 1), depth: this.len(opts.depth ?? 0.2), font: opts.font, upright: opts.upright ?? true }); if (opts.material) this.paintAll(this.ents, opts.material); });
    if (opts.at) g.move(opts.at);
    return g;
  }
  /** OBJ mesh text (`v …` / `f …` lines, e.g. from LLaMA-Mesh) as a group; `size` = largest side. */
  mesh(obj: string, opts: { at?: Pt; size?: number | string; yUp?: boolean; smooth?: number; name?: string; material?: string } = {}): GroupHandle {
    const g = this.group(opts.name ?? 'Mesh', () => {
      buildMesh(this.ents, parseObj(obj), { size: this.len(opts.size ?? 1), yUp: opts.yUp, smooth: opts.smooth });
      if (opts.material) this.paintAll(this.ents, opts.material);
    });
    if (opts.at) g.move(opts.at);
    return g;
  }
  offsetFace(e: Entities, fid: number, d: number) {
    const f = e.faces.get(fid)!; e.addLoop(offsetPolygon(e.facePoints(f), e.faceNormal(f), d));
  }

  guide(p: Pt, dir?: Pt) { if (dir) this.ed.model.guides.push({ id: newId(), kind: 'line', p: V(p), d: V(dir).normalize() }); else this.ed.model.guides.push({ id: newId(), kind: 'point', p: V(p) }); }
  dimension(a: Pt, b: Pt, offset: Pt = [0, -0.5, 0]) { this.ed.model.dimensions.push({ id: newId(), a: V(a), b: V(b), offset: V(offset) }); }
  label(p: Pt, text: string, offset: Pt = [0.5, 0.5, 0.8]) { this.ed.model.labels.push({ id: newId(), p: V(p), text, offset: V(offset) }); }

  // ---------------- view ----------------
  camera(pos: Pt, target: Pt, fov?: number) { const r = this.ed.viewer.rig; this.cameraAfter = () => r.applyState({ pos: V(pos).toArray(), target: V(target).toArray(), fov: fov ?? r.persp.fov, ortho: r.isOrtho }); }
  zoomExtents() { this.cameraAfter = () => this.ed.zoomExtents(); }
  view(name: 'top' | 'front' | 'back' | 'left' | 'right' | 'iso' | 'bottom') { this.cameraAfter = () => this.ed.viewer.rig.standardView(name, this.ed.model.bounds()); }
  shadows(on = true, hour?: number) { this.ed.model.settings.shadows = on; if (hour != null) this.ed.model.settings.shadowHour = hour; }
  style(s: Partial<import('../core/document').StyleSettings>) { Object.assign(this.ed.model.settings.style, s); }
  stats() { return this.ed.model.root.stats(); }
  random(min = 0, max = 1) { return min + Math.random() * (max - min); }
  afterRun() { this.cameraAfter?.(); }
}


// ---------------------------------------------------------------- parametric shapes
/**
 * Round shapes remember how they were made (kind, positional args, options) on their definition,
 * so the polygon panel can rebuild them with more or fewer segments. Number of positional args per kind:
 */
export const PARAMETRIC: Record<string, { args: number; res: 'segments' | 'sides'; def: number; min: number; label: string }> = {
  cylinder: { args: 3, res: 'segments', def: 24, min: 3, label: 'Zylinder' },
  cylinderBetween: { args: 3, res: 'segments', def: 12, min: 3, label: 'Stange' },
  cone: { args: 3, res: 'segments', def: 24, min: 3, label: 'Kegel' },
  sphere: { args: 2, res: 'segments', def: 24, min: 4, label: 'Kugel' },
  dome: { args: 2, res: 'segments', def: 24, min: 4, label: 'Kuppel' },
  ellipsoid: { args: 4, res: 'segments', def: 16, min: 4, label: 'Ellipsoid' },
  tube: { args: 4, res: 'segments', def: 24, min: 3, label: 'Rohr' },
  torus: { args: 3, res: 'segments', def: 24, min: 3, label: 'Torus' },
  prism: { args: 3, res: 'sides', def: 6, min: 3, label: 'Prisma' },
  pyramid: { args: 3, res: 'sides', def: 4, min: 3, label: 'Pyramide' },
};
const plain = (v: unknown): unknown => (v instanceof THREE.Vector3 ? v.toArray() : Array.isArray(v) ? v.map(plain) : v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);
for (const [kind, p] of Object.entries(PARAMETRIC)) {
  const proto = ScriptApi.prototype as any; const orig = proto[kind];
  proto[kind] = function (this: ScriptApi, ...a: unknown[]) {
    const r = orig.apply(this, a);
    if (r instanceof GroupHandle) r.inst.def.shape = { kind, args: a.slice(0, p.args).map(plain), opts: (plain(a[p.args] ?? {}) as Record<string, unknown>) };
    return r;
  };
}

export interface RunResult { ok: boolean; logs: ScriptLog[]; error?: string; ms: number }

/** Run a JavaScript snippet with the `s3d` API as one undoable step. */
export function runScript(ed: Editor, code: string, label = 'Skript'): RunResult {
  const api = new ScriptApi(ed); const t0 = performance.now();
  try {
    ed.commit(label, () => {
      // scripts only get s3d (old names: fw, su)/THREE/console – common browser globals are shadowed
      const fn = new Function('s3d', 'fw', 'su', 'THREE', 'console', 'window', 'document', 'fetch', 'localStorage', 'sessionStorage', 'indexedDB', 'XMLHttpRequest', 'WebSocket', 'globalThis', 'self', '"use strict";\n' + code);
      const consoleProxy = { log: (...a: any[]) => api.log(...a), warn: (...a: any[]) => api.warn(...a), error: (...a: any[]) => api.warn(...a), info: (...a: any[]) => api.log(...a) };
      const r = fn(api, api, api, THREE, consoleProxy);
      if (r instanceof Promise) api.warn('Asynchrone Skripte werden nicht unterstützt – „await“ wird ignoriert.');
      else if (r !== undefined) api.logs.push({ kind: 'result', text: typeof r === 'string' ? r : JSON.stringify(r) });
    });
    api.afterRun();
    return { ok: true, logs: api.logs, ms: performance.now() - t0 };
  } catch (e: any) {
    return { ok: false, logs: api.logs, error: (e?.message ?? String(e)) + (e?.stack ? '\n' + String(e.stack).split('\n').slice(1, 3).join('\n') : ''), ms: performance.now() - t0 };
  }
}

/** Declarative JSON → API calls. */
export function runJson(ed: Editor, text: string): RunResult {
  let doc: any;
  try { doc = JSON.parse(text); } catch (e: any) { return { ok: false, logs: [], error: 'JSON-Fehler: ' + e.message, ms: 0 }; }
  const api = new ScriptApi(ed); const t0 = performance.now();
  const build = (o: any) => {
    const t = o.type;
    let res: GroupHandle | FaceHandle | null = null;
    switch (t) {
      case 'box': res = api.box(o.at ?? [0, 0, 0], o.size?.[0] ?? 1, o.size?.[1] ?? 1, o.size?.[2] ?? 1, { name: o.name, material: o.material, group: o.group }); break;
      case 'cylinder': res = api.cylinder(o.at ?? [0, 0, 0], o.radius ?? 0.5, o.height ?? 1, { segments: o.segments, name: o.name, material: o.material, group: o.group }); break;
      case 'sphere': res = api.sphere(o.at ?? [0, 0, 0], o.radius ?? 0.5, { segments: o.segments, name: o.name, material: o.material }); break;
      case 'rect': res = api.rect(o.at ?? [0, 0, 0], o.size?.[0] ?? 1, o.size?.[1] ?? 1, o.plane); if (o.pushpull) res = (res as FaceHandle).pushpull(o.pushpull); if (o.material && res) (res as FaceHandle).material(o.material); break;
      case 'circle': res = api.circle(o.at ?? [0, 0, 0], o.radius ?? 1, { segments: o.segments, normal: o.normal }); if (o.pushpull) res = (res as FaceHandle).pushpull(o.pushpull); break;
      case 'polygon': res = api.polygon(o.at ?? [0, 0, 0], o.radius ?? 1, o.sides ?? 6, o.normal); if (o.pushpull) res = (res as FaceHandle).pushpull(o.pushpull); break;
      case 'face': res = api.face(o.points); if (o.material) res.material(o.material); if (o.pushpull) res = res.pushpull(o.pushpull); break;
      case 'line': api.polyline(o.points, !!o.closed); break;
      case 'text3d': res = api.text3d(o.text ?? 'Text', { at: o.at, size: o.size, depth: o.depth, material: o.material, upright: o.upright }); break;
      case 'group': res = api.group(o.name ?? 'Gruppe', () => { for (const c of o.children ?? []) build(c); }); break;
      case 'array': { const n = o.count ?? 2; const off = V(o.offset ?? [1, 0, 0]); for (let i = 0; i < n; i++) { const r = build(o.object); if (r instanceof GroupHandle) r.move(off.clone().multiplyScalar(i)); } return null; }
      case 'guide': api.guide(o.at ?? [0, 0, 0], o.direction); return null;
      case 'label': api.label(o.at ?? [0, 0, 0], o.text ?? ''); return null;
      case 'dimension': api.dimension(o.from, o.to, o.offset); return null;
      default: throw new Error(`Unbekannter Objekttyp: ${t}`);
    }
    if (res instanceof GroupHandle) {
      if (o.material) res.material(o.material);
      if (o.rotate) res.rotate(o.rotate.angle ?? 0, o.rotate.axis ?? 'z', o.rotate.center);
      if (o.scale) res.scale(o.scale);
      if (o.move) res.move(o.move);
      if (o.tag) res.tag(o.tag);
    }
    return res;
  };
  try {
    ed.commit('JSON-Skript', () => {
      if (doc.clear) api.clear();
      for (const [k, v] of Object.entries(doc.materials ?? {})) api.material(k, typeof v === 'string' ? v : (v as any).color, typeof v === 'string' ? 1 : (v as any).opacity ?? 1);
      for (const o of doc.objects ?? []) build(o);
      if (doc.view) api.view(doc.view); else if (doc.zoomExtents !== false) api.zoomExtents();
    });
    api.afterRun();
    return { ok: true, logs: api.logs, ms: performance.now() - t0 };
  } catch (e: any) { return { ok: false, logs: api.logs, error: e?.message ?? String(e), ms: performance.now() - t0 }; }
}

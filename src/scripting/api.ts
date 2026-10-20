import * as THREE from 'three';
import type { Editor } from '../engine/editor';
import type { StyleSettings } from '../core/document';
import type { Entities, EntityRef, Instance, Definition } from '../core/model';
import { newId } from '../core/model';
import { parseLength } from '../core/units';
import { offsetPolygon } from '../core/geometry';
import { TEXTURES, isTextureKind } from '../core/textures';
import { buildMesh, parseObj } from './mesh';
import { MATERIAL_LIBRARY, libraryMaterial } from '../core/materialLibrary';
import { t } from '../i18n';

export type Pt = [number, number, number] | { x: number; y: number; z: number } | THREE.Vector3;
const toVec = (point: Pt | undefined, def: [number, number, number] = [0, 0, 0]): THREE.Vector3 => {
  if (!point) {
    return new THREE.Vector3(...def);
  }
  if (Array.isArray(point)) {
    return new THREE.Vector3(point[0] ?? 0, point[1] ?? 0, point[2] ?? 0);
  }
  return new THREE.Vector3(point.x, point.y, point.z);
};
const AXIS_VECTORS: Record<string, THREE.Vector3> = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
  red: new THREE.Vector3(1, 0, 0),
  green: new THREE.Vector3(0, 1, 0),
  blue: new THREE.Vector3(0, 0, 1),
};
const axis = (spec: string | Pt | undefined) =>
  typeof spec === 'string'
    ? (AXIS_VECTORS[spec.toLowerCase()] ?? AXIS_VECTORS.z).clone()
    : spec
      ? toVec(spec).normalize()
      : AXIS_VECTORS.z.clone();

/** Handle to a face created by a script. */
export class FaceHandle {
  constructor(
    private api: ScriptApi,
    public ents: Entities,
    public id: number,
  ) {}
  get exists() {
    return this.ents.faces.has(this.id);
  }
  get area() {
    const face = this.ents.faces.get(this.id);
    return face ? this.ents.faceArea(face) : 0;
  }
  get normal() {
    const face = this.ents.faces.get(this.id);
    return face ? this.ents.faceNormal(face).toArray() : [0, 0, 0];
  }
  /** Push/Pull along the face normal. Returns the new top face. */
  pushpull(distance: number | string): FaceHandle | null {
    const dist = this.api.length(distance);
    const face = this.ents.faces.get(this.id);
    if (!face) {
      throw new Error(t('script.errors.faceGone'));
    }
    // positive values always extrude "up/out" for faces lying on the ground (normal pointing down)
    const normal = this.ents.faceNormal(face);
    const sign = normal.z < -0.999 ? -1 : 1;
    const top = this.ents.pushPull(this.id, sign * dist);
    return top != null ? new FaceHandle(this.api, this.ents, top) : null;
  }
  /** Extrude by `d` towards a direction ('x' | 'y' | 'z' | '-x' ... or a vector), regardless of face orientation. */
  extrude(distance: number | string, dir: string | Pt = 'z'): FaceHandle | null {
    const face = this.ents.faces.get(this.id);
    if (!face) {
      throw new Error(t('script.errors.faceGone'));
    }
    let want: THREE.Vector3;
    if (typeof dir === 'string') {
      const neg = dir.startsWith('-');
      want = axis(dir.replace('-', ''));
      if (neg) {
        want.negate();
      }
    } else {
      want = toVec(dir);
    }
    const sign = this.ents.faceNormal(face).dot(want) >= 0 ? 1 : -1;
    const top = this.ents.pushPull(this.id, sign * this.api.length(distance));
    return top != null ? new FaceHandle(this.api, this.ents, top) : null;
  }
  material(name: string) {
    const face = this.ents.faces.get(this.id);
    if (face) {
      face.material = this.api.ensureMaterial(name);
    }
    return this;
  }
  backMaterial(name: string) {
    const face = this.ents.faces.get(this.id);
    if (face) {
      face.backMaterial = this.api.ensureMaterial(name);
    }
    return this;
  }
  reverse() {
    const face = this.ents.faces.get(this.id);
    if (face) {
      this.ents.reverseFace(face);
    }
    return this;
  }
  offset(distance: number | string) {
    const face = this.ents.faces.get(this.id);
    if (!face) {
      return this;
    }
    this.api.offsetFace(this.ents, this.id, this.api.length(distance));
    return this;
  }
  followMe(path: Pt[], closed = false) {
    this.ents.followMe(
      this.id,
      path.map((point) => toVec(point)),
      closed,
    );
    return this;
  }
  ref(): EntityRef {
    return { kind: 'face', id: this.id };
  }
}

/** Handle to a group/component instance. */
export class GroupHandle {
  constructor(
    private api: ScriptApi,
    public parent: Entities,
    public inst: Instance,
  ) {}
  get name() {
    return this.inst.name || this.inst.definition.name;
  }
  get entities() {
    return this.inst.definition.entities;
  }
  move(vector: Pt) {
    const delta = toVec(vector);
    this.inst.matrix.premultiply(new THREE.Matrix4().makeTranslation(delta.x, delta.y, delta.z));
    return this;
  }
  moveTo(point: Pt) {
    const target = toVec(point);
    const elements = this.inst.matrix.elements;
    elements[12] = target.x;
    elements[13] = target.y;
    elements[14] = target.z;
    return this;
  }
  rotate(deg: number, axisSpec: string | Pt = 'z', center?: Pt) {
    const pivot = center ? toVec(center) : new THREE.Vector3().setFromMatrixPosition(this.inst.matrix);
    const matrix = new THREE.Matrix4()
      .makeTranslation(pivot.x, pivot.y, pivot.z)
      .multiply(new THREE.Matrix4().makeRotationAxis(axis(axisSpec), (deg * Math.PI) / 180))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    this.inst.matrix.premultiply(matrix);
    return this;
  }
  scale(factor: number | Pt, center?: Pt) {
    const scaleVec = typeof factor === 'number' ? new THREE.Vector3(factor, factor, factor) : toVec(factor);
    const pivot = center ? toVec(center) : new THREE.Vector3().setFromMatrixPosition(this.inst.matrix);
    const matrix = new THREE.Matrix4()
      .makeTranslation(pivot.x, pivot.y, pivot.z)
      .multiply(new THREE.Matrix4().makeScale(scaleVec.x, scaleVec.y, scaleVec.z))
      .multiply(new THREE.Matrix4().makeTranslation(-pivot.x, -pivot.y, -pivot.z));
    this.inst.matrix.premultiply(matrix);
    return this;
  }
  material(name: string) {
    this.inst.material = this.api.ensureMaterial(name);
    return this;
  }
  tag(name: string) {
    this.inst.tag = this.api.ensureTag(name);
    return this;
  }
  hide() {
    this.inst.hidden = true;
    return this;
  }
  copy(offset?: Pt): GroupHandle {
    const def = this.inst.definition.isComponent ? this.inst.definition : this.api.editor.model.cloneDefinition(this.inst.definition);
    const instance = this.parent.addInstance(def, this.inst.matrix.clone(), this.inst.name);
    instance.material = this.inst.material;
    instance.tag = this.inst.tag;
    const handle = new GroupHandle(this.api, this.parent, instance);
    if (offset) {
      handle.move(offset);
    }
    return handle;
  }
  explode() {
    const refs = this.parent.merge(this.inst.definition.entities, this.inst.matrix, this.api.editor.model, this.inst.material);
    this.parent.instances.delete(this.inst.id);
    return refs.length;
  }
  ref(): EntityRef {
    return { kind: 'instance', id: this.inst.id };
  }
}

/** one face of s3d.polyhedron(): point indices, or with holes and a material */
export type PolyhedronFace = number[] | { outer: number[]; holes?: number[][]; material?: string };

export interface ScriptLog {
  kind: 'log' | 'warn' | 'error' | 'result';
  text: string;
}

/** The `s3d` object available to scripts. Units are meters unless strings like "50cm" are used. */
export class ScriptApi {
  private stack: Entities[] = [];
  logs: ScriptLog[] = [];
  private cameraAfter: (() => void) | null = null;
  constructor(
    public editor: Editor,
    root?: Entities,
  ) {
    this.stack = [root ?? editor.entities];
  }

  get ents(): Entities {
    return this.stack[this.stack.length - 1];
  }
  length(value: number | string): number {
    if (typeof value === 'number') {
      return value;
    }
    const parsed = parseLength(value, this.editor.model.settings.units);
    if (parsed == null) {
      throw new Error(t('script.errors.invalidLength', { value }));
    }
    return parsed;
  }
  point(x = 0, y = 0, z = 0) {
    return [x, y, z] as [number, number, number];
  }
  millimeters(value: number) {
    return value / 1000;
  }
  centimeters(value: number) {
    return value / 100;
  }
  meters(value: number) {
    return value;
  }
  degrees(value: number) {
    return (value * Math.PI) / 180;
  }
  get THREE() {
    return THREE;
  }

  log(...args: any[]) {
    this.logs.push({ kind: 'log', text: args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') });
  }
  warn(...args: any[]) {
    this.logs.push({ kind: 'warn', text: args.map((x) => (typeof x === 'string' ? x : JSON.stringify(x))).join(' ') });
  }

  ensureMaterial(name: string, color?: string, opacity = 1): string {
    const material = this.editor.model.materials.find((x) => x.name === name);
    if (material) {
      if (color) {
        material.color = color;
        material.opacity = opacity;
      }
      return name;
    }
    // ready-made materials ('Glas', 'Eiche hell', 'Stahl' …) need no definition
    const lib = !color ? libraryMaterial(name) : undefined;
    if (lib) {
      this.editor.model.materials.push({
        name: lib.name,
        color: lib.color,
        opacity: lib.opacity ?? 1,
        texture: lib.texture,
        textureSize: lib.size,
      });
      return lib.name;
    }
    let resolved = color;
    if (!resolved) {
      if (/^#|^rgb/i.test(name)) {
        resolved = name;
      } else {
        const tmp = new THREE.Color();
        try {
          tmp.setStyle(name);
          resolved = '#' + tmp.getHexString();
        } catch {
          resolved = '#cccccc';
        }
      }
    }
    this.editor.model.materials.push({ name, color: resolved!, opacity });
    return name;
  }
  ensureTag(name: string) {
    if (!this.editor.model.tags.some((tag) => tag.name === name)) {
      this.editor.model.tags.push({ name, visible: true, color: '#' + new THREE.Color().setHSL(Math.random(), 0.5, 0.6).getHexString() });
    }
    return name;
  }

  /** Define or update a material. */
  /**
   * Define or update a material. Third argument: opacity (0..1) or options
   * { opacity, texture: 'holz'|'ziegel'|'stein'|'gras'|'fliesen'|'beton'|'metall'|'stoff'|'wasser'|'marmor'|'dach'|'parkett', size: meters }.
   */
  material(name: string, color?: string, opts: number | { opacity?: number; texture?: string; size?: number } = 1) {
    if (color == null) {
      const materialName = this.ensureMaterial(name);
      return materialName;
    } // library material or CSS colour name
    const options = typeof opts === 'number' ? { opacity: opts } : opts;
    this.ensureMaterial(name, color, options.opacity ?? 1);
    const material = this.editor.model.materials.find((x) => x.name === name)!;
    if (options.texture !== undefined) {
      if (options.texture && !isTextureKind(options.texture)) {
        throw new Error(t('script.errors.unknownTexture', { texture: options.texture, allowed: Object.keys(TEXTURES).join(', ') }));
      }
      material.texture = options.texture || undefined;
    }
    if (options.size) {
      material.textureSize = this.length(options.size);
    }
    return name;
  }
  /** Cylinder (or cone when endRadius is given) from point a to point b – handy for legs, branches, pipes. */
  cylinderBetween(
    fromPoint: Pt,
    toPoint: Pt,
    radius: number | string,
    opts: { endRadius?: number | string; segments?: number; name?: string; material?: string; group?: boolean } = {},
  ): GroupHandle | null {
    const start = toVec(fromPoint),
      end = toVec(toPoint);
    const span = start.distanceTo(end);
    if (span < 1e-6) {
      return null;
    }
    const startRadius = this.length(radius),
      endRadius = opts.endRadius != null ? this.length(opts.endRadius) : startRadius;
    const segments = opts.segments ?? 12;
    const make = () => {
      const dir = end.clone().sub(start).normalize();
      const basisU =
        Math.abs(dir.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(dir).normalize() : new THREE.Vector3(1, 0, 0).cross(dir).normalize();
      const basisW = dir.clone().cross(basisU).normalize();
      const ring = (center: THREE.Vector3, ringRadius: number) => {
        const out: THREE.Vector3[] = [];
        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          out.push(
            center
              .clone()
              .addScaledVector(basisU, Math.cos(angle) * ringRadius)
              .addScaledVector(basisW, Math.sin(angle) * ringRadius),
          );
        }
        return out;
      };
      const entities = this.ents;
      const startRing = ring(start, startRadius).map((point) => entities.addVertex(point));
      const endRing = endRadius > 1e-6 ? ring(end, endRadius).map((point) => entities.addVertex(point)) : null;
      const tip = endRing ? -1 : entities.addVertex(end);
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % segments;
        if (endRing) {
          entities.createFaceRaw([startRing[i], startRing[j], endRing[j], endRing[i]]);
        } else {
          entities.createFaceRaw([startRing[i], startRing[j], tip]);
        }
      }
      entities.createFaceRaw([...startRing].reverse());
      if (endRing) {
        entities.createFaceRaw(endRing);
      }
      entities.autoSoften([...entities.edges.keys()], 35);
      if (opts.material) {
        this.paintAll(entities, opts.material);
      }
    };
    if (opts.group === false) {
      make();
      return null;
    }
    return this.group(opts.name ?? 'Zylinder', make);
  }
  /** Ellipsoid with radii rx, ry, rz (bodies, heads, leaves …). */
  ellipsoid(
    center: Pt,
    radiusX: number | string,
    radiusY: number | string,
    radiusZ: number | string,
    opts: { segments?: number; name?: string; material?: string } = {},
  ): GroupHandle {
    const group = this.sphere([0, 0, 0], 1, { segments: opts.segments ?? 16, name: opts.name ?? 'Ellipsoid', material: opts.material });
    const centerVec = toVec(center);
    group.inst.matrix.makeScale(this.length(radiusX), this.length(radiusY), this.length(radiusZ)).setPosition(centerVec);
    return group;
  }
  tag(name: string, visible = true) {
    this.ensureTag(name);
    const tag = this.editor.model.tags.find((x) => x.name === name)!;
    tag.visible = visible;
    return name;
  }

  // ---------------- geometry ----------------
  clear() {
    const entities = this.ents;
    for (const id of [...entities.instances.keys()]) {
      entities.instances.delete(id);
    }
    for (const id of [...entities.faces.keys()]) {
      entities.removeFace(id);
    }
    for (const editor of [...entities.edges.values()]) {
      entities.eraseEdge(editor.id, false);
    }
    entities.removeOrphanVertices();
    if (this.stack.length === 1 && !this.editor.activePath.length) {
      this.editor.model.guides = [];
      this.editor.model.dimensions = [];
      this.editor.model.labels = [];
      this.editor.model.sections = [];
    }
  }
  line(fromPoint: Pt, toPoint: Pt) {
    this.ents.addLine(toVec(fromPoint), toVec(toPoint));
  }
  /**
   * Faces from a point list and index lists (like OpenSCAD's polyhedron) – exact, any shape.
   * A face is [i, j, k, …] or { outer: [...], holes: [[...]], material: 'Name' }. Returns the number of faces made.
   */
  polyhedron(points: Pt[], faces: PolyhedronFace[], opts: { material?: string } = {}): number {
    const ids = points.map((point) => this.ents.addVertex(toVec(point)));
    const vertexOf = (index: number) => {
      const id = ids[index];
      if (id == null) {
        throw new Error(t('script.errors.noPoint', { index }));
      }
      return id;
    };
    let made = 0;
    for (const face of faces) {
      const spec = Array.isArray(face) ? { outer: face } : face;
      const material = spec.material ?? opts.material;
      const created = this.ents.createFaceRaw(
        spec.outer.map(vertexOf),
        (spec.holes ?? []).map((hole) => hole.map(vertexOf)),
        material ? { material: this.ensureMaterial(material) } : {},
      );
      if (created) {
        made++;
      }
    }
    return made;
  }
  polyline(points: Pt[], closed = false) {
    const vectors = points.map((x) => toVec(x));
    for (let i = 0; i < vectors.length - 1; i++) {
      this.ents.addLine(vectors[i], vectors[i + 1]);
    }
    if (closed && vectors.length > 2) {
      this.ents.addLine(vectors[vectors.length - 1], vectors[0]);
    }
    return this.lastFace();
  }
  private lastFace(): FaceHandle | null {
    let max = -1;
    for (const id of this.ents.faces.keys()) {
      if (id > max) {
        max = id;
      }
    }
    return max >= 0 ? new FaceHandle(this, this.ents, max) : null;
  }
  /** Create a face from points (closed loop). */
  face(points: Pt[]): FaceHandle {
    const before = new Set(this.ents.faces.keys());
    const vectors = points.map((x) => toVec(x));
    this.ents.addLoop(vectors);
    // find the new face whose vertices match the loop
    const want = vectors.map((vector) => this.ents.findVertex(vector));
    for (const face of this.ents.faces.values()) {
      if (!before.has(face.id) && want.every((vertex) => vertex != null && face.outer.includes(vertex))) {
        return new FaceHandle(this, this.ents, face.id);
      }
    }
    for (const face of this.ents.faces.values()) {
      if (want.every((vertex) => vertex != null && face.outer.includes(vertex))) {
        return new FaceHandle(this, this.ents, face.id);
      }
    }
    const lastFace = this.lastFace();
    if (!lastFace) {
      throw new Error(t('script.errors.faceFailed'));
    }
    return lastFace;
  }
  /** Rectangle with corner `at`, width (x) and depth (y). plane: 'xy' | 'xz' | 'yz'. */
  rect(corner: Pt, width: number | string, depth: number | string, plane: 'xy' | 'xz' | 'yz' = 'xy'): FaceHandle {
    const base = toVec(corner);
    const widthValue = this.length(width),
      depthValue = this.length(depth);
    const [basisU, basisV] =
      plane === 'xz'
        ? [AXIS_VECTORS.x, AXIS_VECTORS.z]
        : plane === 'yz'
          ? [AXIS_VECTORS.y, AXIS_VECTORS.z]
          : [AXIS_VECTORS.x, AXIS_VECTORS.y];
    return this.face([
      base,
      base.clone().addScaledVector(basisU, widthValue),
      base.clone().addScaledVector(basisU, widthValue).addScaledVector(basisV, depthValue),
      base.clone().addScaledVector(basisV, depthValue),
    ]);
  }
  circle(center: Pt, radius: number | string, opts: { segments?: number; normal?: string | Pt } = {}): FaceHandle {
    return this.ngon(center, this.length(radius), opts.segments ?? 24, opts.normal);
  }
  polygon(center: Pt, radius: number | string, sides = 6, normal?: string | Pt): FaceHandle {
    return this.ngon(center, this.length(radius), sides, normal);
  }
  private ngon(center: Pt, radius: number, sides: number, normal?: string | Pt): FaceHandle {
    const centerVec = toVec(center);
    const normalVec = axis(normal);
    const basisU = Math.abs(normalVec.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(normalVec).normalize() : new THREE.Vector3(1, 0, 0);
    const basisV = normalVec.clone().cross(basisU).normalize();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      pts.push(
        centerVec
          .clone()
          .addScaledVector(basisU, Math.cos(angle) * radius)
          .addScaledVector(basisV, Math.sin(angle) * radius),
      );
    }
    return this.face(pts);
  }
  arc(center: Pt, radius: number | string, startDeg: number, endDeg: number, segments = 12, normal?: string | Pt) {
    const centerVec = toVec(center),
      radiusValue = this.length(radius),
      normalVec = axis(normal);
    const basisU = Math.abs(normalVec.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(normalVec).normalize() : new THREE.Vector3(1, 0, 0);
    const basisV = normalVec.clone().cross(basisU).normalize();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = ((startDeg + ((endDeg - startDeg) * i) / segments) * Math.PI) / 180;
      pts.push(
        centerVec
          .clone()
          .addScaledVector(basisU, Math.cos(angle) * radiusValue)
          .addScaledVector(basisV, Math.sin(angle) * radiusValue),
      );
    }
    this.polyline(pts);
    return pts.map((point) => point.toArray());
  }
  /** Box as a group (default) or raw geometry. */
  box(
    corner: Pt,
    width: number | string,
    depth: number | string,
    height: number | string,
    opts: { group?: boolean; name?: string; material?: string } = {},
  ): GroupHandle | FaceHandle {
    const make = () => {
      const face = this.rect(corner, width, depth);
      return face.pushpull(height);
    };
    if (opts.group === false) {
      const result = make();
      if (opts.material) {
        this.paintAll(this.ents, opts.material);
      }
      return result!;
    }
    return this.group(opts.name ?? 'Quader', () => {
      make();
      if (opts.material) {
        this.paintAll(this.ents, opts.material);
      }
    });
  }
  cylinder(
    center: Pt,
    radius: number | string,
    height: number | string,
    opts: { segments?: number; group?: boolean; name?: string; material?: string } = {},
  ): GroupHandle | FaceHandle {
    const make = () => this.circle(center, radius, { segments: opts.segments ?? 24 }).pushpull(height);
    if (opts.group === false) {
      return make()!;
    }
    return this.group(opts.name ?? 'Zylinder', () => {
      make();
      if (opts.material) {
        this.paintAll(this.ents, opts.material);
      }
    });
  }
  sphere(center: Pt, radius: number | string, opts: { segments?: number; name?: string; material?: string } = {}): GroupHandle {
    const centerVec = toVec(center),
      radiusValue = this.length(radius),
      segments = opts.segments ?? 24;
    return this.group(opts.name ?? 'Kugel', () => {
      // latitude rings around the Z axis
      const prof: THREE.Vector3[] = [];
      for (let i = 0; i <= segments / 2; i++) {
        const angle = -Math.PI / 2 + (i / (segments / 2)) * Math.PI;
        prof.push(new THREE.Vector3(centerVec.x + Math.cos(angle) * radiusValue, centerVec.y, centerVec.z + Math.sin(angle) * radiusValue));
      }
      const rings = prof.map((point) => {
        const ringRadius = Math.hypot(point.x - centerVec.x, point.y - centerVec.y);
        const pts: THREE.Vector3[] = [];
        for (let i = 0; i < segments; i++) {
          const angle = (i / segments) * Math.PI * 2;
          pts.push(new THREE.Vector3(centerVec.x + Math.cos(angle) * ringRadius, centerVec.y + Math.sin(angle) * ringRadius, point.z));
        }
        return pts;
      });
      const entities = this.ents;
      for (let j = 0; j < rings.length - 1; j++) {
        for (let i = 0; i < segments; i++) {
          const cornerA = rings[j][i],
            cornerB = rings[j][(i + 1) % segments],
            cornerC = rings[j + 1][(i + 1) % segments],
            cornerD = rings[j + 1][i];
          const ids = [cornerA, cornerB, cornerC, cornerD].map((point) => entities.addVertex(point));
          const uniq = ids.filter((x, k) => ids.indexOf(x) === k);
          if (uniq.length >= 3) {
            entities.createFaceRaw(uniq);
          }
        }
      }
      entities.autoSoften([...entities.edges.keys()], 45);
      if (opts.material) {
        this.paintAll(entities, opts.material);
      }
    });
  }
  // ---------------- more solids ----------------
  /** Cone (or truncated cone with endRadius) standing on `center`. */
  cone(
    center: Pt,
    radius: number | string,
    height: number | string,
    opts: { endRadius?: number | string; segments?: number; name?: string; material?: string } = {},
  ): GroupHandle {
    const centerVec = toVec(center);
    return this.cylinderBetween(centerVec, centerVec.clone().add(new THREE.Vector3(0, 0, this.length(height))), radius, {
      endRadius: opts.endRadius ?? 0,
      segments: opts.segments ?? 24,
      name: opts.name ?? 'Kegel',
      material: opts.material,
    })!;
  }
  /** Pyramid on `center` – `size` is the base edge length (4 sides) or the edge of the regular n-gon. */
  pyramid(
    center: Pt,
    size: number | string,
    height: number | string,
    opts: { sides?: number; name?: string; material?: string } = {},
  ): GroupHandle {
    const centerVec = toVec(center),
      sides = Math.max(3, opts.sides ?? 4),
      heightValue = this.length(height);
    const radiusValue = this.length(size) / (2 * Math.sin(Math.PI / sides));
    return this.group(opts.name ?? 'Pyramide', () => {
      const entities = this.ents;
      const base: number[] = [];
      for (let i = 0; i < sides; i++) {
        const angle = Math.PI / sides + (i / sides) * Math.PI * 2 - (sides === 4 ? Math.PI / 2 : 0);
        base.push(
          entities.addVertex(
            new THREE.Vector3(centerVec.x + Math.cos(angle) * radiusValue, centerVec.y + Math.sin(angle) * radiusValue, centerVec.z),
          ),
        );
      }
      const apex = entities.addVertex(new THREE.Vector3(centerVec.x, centerVec.y, centerVec.z + heightValue));
      entities.createFaceRaw([...base].reverse());
      for (let i = 0; i < sides; i++) {
        entities.createFaceRaw([base[i], base[(i + 1) % sides], apex]);
      }
      if (opts.material) {
        this.paintAll(entities, opts.material);
      }
    });
  }
  /** Upright prism with a regular n-gon base (6 = hexagon). */
  prism(
    center: Pt,
    radius: number | string,
    height: number | string,
    opts: { sides?: number; name?: string; material?: string } = {},
  ): GroupHandle {
    return this.group(opts.name ?? 'Prisma', () => {
      this.polygon(center, radius, opts.sides ?? 6).pushpull(height);
      if (opts.material) {
        this.paintAll(this.ents, opts.material);
      }
    });
  }
  /** Hollow cylinder (pipe, ring, cup) standing on `center`. */
  tube(
    center: Pt,
    rOuter: number | string,
    rInner: number | string,
    height: number | string,
    opts: { segments?: number; name?: string; material?: string } = {},
  ): GroupHandle {
    const centerVec = toVec(center),
      outerRadius = this.length(rOuter),
      innerRadius = this.length(rInner),
      heightValue = this.length(height),
      segments = opts.segments ?? 24;
    if (!(innerRadius > 0 && innerRadius < outerRadius)) {
      throw new Error(t('script.errors.tubeRadius'));
    }
    return this.group(opts.name ?? 'Rohr', () => {
      const entities = this.ents;
      const ring = (ringRadius: number, z: number) =>
        Array.from({ length: segments }, (_, i) => {
          const angle = (i / segments) * Math.PI * 2;
          return entities.addVertex(
            new THREE.Vector3(centerVec.x + Math.cos(angle) * ringRadius, centerVec.y + Math.sin(angle) * ringRadius, centerVec.z + z),
          );
        });
      const outerBottom = ring(outerRadius, 0),
        outerTop = ring(outerRadius, heightValue),
        innerBottom = ring(innerRadius, 0),
        innerTop = ring(innerRadius, heightValue);
      for (let i = 0; i < segments; i++) {
        const j = (i + 1) % segments;
        entities.createFaceRaw([outerBottom[i], outerBottom[j], outerTop[j], outerTop[i]]); // outside
        entities.createFaceRaw([innerBottom[j], innerBottom[i], innerTop[i], innerTop[j]]); // inside
        entities.createFaceRaw([outerTop[i], outerTop[j], innerTop[j], innerTop[i]]); // top
        entities.createFaceRaw([outerBottom[i], innerBottom[i], innerBottom[j], outerBottom[j]]); // bottom
      }
      entities.mergeCoplanar([...entities.edges.keys()]);
      entities.autoSoften([...entities.edges.keys()], 35);
      if (opts.material) {
        this.paintAll(entities, opts.material);
      }
    });
  }
  /** Torus (ring/donut) lying flat around `center`: R = ring radius, r = tube radius. */
  torus(
    center: Pt,
    majorRadius: number | string,
    minorRadius: number | string,
    opts: { segments?: number; sides?: number; name?: string; material?: string } = {},
  ): GroupHandle {
    const centerVec = toVec(center),
      majorValue = this.length(majorRadius),
      minorValue = this.length(minorRadius),
      segments = opts.segments ?? 24,
      sides = opts.sides ?? 12;
    return this.group(opts.name ?? 'Torus', () => {
      const entities = this.ents;
      const vertexAt = (i: number, k: number) => {
        const majorAngle = ((i % segments) / segments) * Math.PI * 2,
          minorAngle = ((k % sides) / sides) * Math.PI * 2,
          ringDistance = majorValue + minorValue * Math.cos(minorAngle);
        return entities.addVertex(
          new THREE.Vector3(
            centerVec.x + ringDistance * Math.cos(majorAngle),
            centerVec.y + ringDistance * Math.sin(majorAngle),
            centerVec.z + minorValue * Math.sin(minorAngle),
          ),
        );
      };
      for (let i = 0; i < segments; i++) {
        for (let k = 0; k < sides; k++) {
          entities.createFaceRaw([vertexAt(i, k), vertexAt(i + 1, k), vertexAt(i + 1, k + 1), vertexAt(i, k + 1)]);
        }
      }
      entities.autoSoften([...entities.edges.keys()], 45);
      if (opts.material) {
        this.paintAll(entities, opts.material);
      }
    });
  }
  /** Wedge/ramp: footprint w × d from corner `at`, rising along +x to height h. */
  wedge(
    corner: Pt,
    width: number | string,
    depth: number | string,
    height: number | string,
    opts: { name?: string; material?: string } = {},
  ): GroupHandle {
    const base = toVec(corner),
      widthValue = this.length(width),
      depthValue = this.length(depth),
      heightValue = this.length(height);
    return this.group(opts.name ?? 'Keil', () => {
      const entities = this.ents;
      const vertexAt = (x: number, y: number, z: number) => entities.addVertex(new THREE.Vector3(base.x + x, base.y + y, base.z + z));
      const base0 = vertexAt(0, 0, 0),
        base1 = vertexAt(widthValue, 0, 0),
        base2 = vertexAt(widthValue, depthValue, 0),
        base3 = vertexAt(0, depthValue, 0),
        top1 = vertexAt(widthValue, 0, heightValue),
        top2 = vertexAt(widthValue, depthValue, heightValue);
      entities.createFaceRaw([base0, base3, base2, base1]);
      entities.createFaceRaw([base1, base2, top2, top1]);
      entities.createFaceRaw([base0, base1, top1]);
      entities.createFaceRaw([base3, top2, base2]);
      entities.createFaceRaw([base0, top1, top2, base3]);
      if (opts.material) {
        this.paintAll(entities, opts.material);
      }
    });
  }
  /** Half sphere (dome) sitting on `center`. */
  dome(center: Pt, radius: number | string, opts: { segments?: number; name?: string; material?: string } = {}): GroupHandle {
    const centerVec = toVec(center),
      radiusValue = this.length(radius),
      segments = opts.segments ?? 24,
      rings = Math.max(3, Math.round(segments / 4));
    return this.group(opts.name ?? 'Kuppel', () => {
      const entities = this.ents;
      const ring = (k: number) => {
        const angle = ((k / rings) * Math.PI) / 2,
          ringRadius = Math.cos(angle) * radiusValue,
          z = Math.sin(angle) * radiusValue;
        return Array.from({ length: segments }, (_, i) => {
          const segmentAngle = (i / segments) * Math.PI * 2;
          return entities.addVertex(
            new THREE.Vector3(
              centerVec.x + Math.cos(segmentAngle) * ringRadius,
              centerVec.y + Math.sin(segmentAngle) * ringRadius,
              centerVec.z + z,
            ),
          );
        });
      };
      const ringIds = Array.from({ length: rings + 1 }, (_, k) => ring(k));
      for (let k = 0; k < rings; k++) {
        for (let i = 0; i < segments; i++) {
          const j = (i + 1) % segments;
          const ids = [ringIds[k][i], ringIds[k][j], ringIds[k + 1][j], ringIds[k + 1][i]];
          const uniq = ids.filter((x, position) => ids.indexOf(x) === position);
          if (uniq.length >= 3) {
            entities.createFaceRaw(uniq);
          }
        }
      }
      entities.createFaceRaw([...ringIds[0]].reverse());
      entities.autoSoften([...entities.edges.keys()], 45);
      if (opts.material) {
        this.paintAll(entities, opts.material);
      }
    });
  }
  /** Straight staircase starting at `at`, climbing along +x. Defaults: 10 steps, 17.5 cm rise, 28 cm run, 1 m wide. */
  stairs(
    corner: Pt,
    opts: { steps?: number; rise?: number | string; run?: number | string; width?: number | string; name?: string; material?: string } = {},
  ): GroupHandle {
    const base = toVec(corner),
      steps = Math.max(1, Math.round(opts.steps ?? 10)),
      rise = this.length(opts.rise ?? 0.175),
      run = this.length(opts.run ?? 0.28),
      widthValue = this.length(opts.width ?? 1);
    return this.group(opts.name ?? 'Treppe', () => {
      const pts: THREE.Vector3[] = [
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(steps * run, 0, 0),
        new THREE.Vector3(steps * run, 0, steps * rise),
      ];
      for (let i = steps - 1; i >= 0; i--) {
        pts.push(new THREE.Vector3(i * run, 0, (i + 1) * rise));
        if (i > 0) {
          pts.push(new THREE.Vector3(i * run, 0, i * rise));
        }
      }
      this.face(pts.map((point) => point.add(base))).extrude(widthValue, 'y');
      if (opts.material) {
        this.paintAll(this.ents, opts.material);
      }
    });
  }

  /** Names of the ready-made materials (optionally one category, e.g. 'Holz', 'Metall'). */
  materials(category?: string): string[] {
    return MATERIAL_LIBRARY.filter((material) => !category || material.category.toLowerCase().startsWith(category.toLowerCase())).map(
      (material) => material.name,
    );
  }
  /** Texture kinds usable in s3d.material(name, color, { texture }). */
  textures(): string[] {
    return Object.keys(TEXTURES);
  }

  private paintAll(entities: Entities, material: string) {
    const materialName = this.ensureMaterial(material);
    for (const face of entities.faces.values()) {
      face.material = materialName;
    }
  }
  pushpull(face: FaceHandle, distance: number | string) {
    return face.pushpull(distance);
  }

  /** Create a group; geometry created inside `fn` goes into the group. */
  group(name: string, build: (s3d: ScriptApi) => void): GroupHandle {
    const model = this.editor.model;
    const def = model.newDefinition(name, false);
    const parent = this.ents;
    const inst = parent.addInstance(def, new THREE.Matrix4(), name);
    this.stack.push(def.entities);
    try {
      build(this);
    } finally {
      this.stack.pop();
    }
    return new GroupHandle(this, parent, inst);
  }
  /** Create a component definition (reusable); returns a function to place instances. */
  component(
    name: string,
    build: (s3d: ScriptApi) => void,
  ): { def: Definition; place: (position?: Pt, rotDeg?: number, scale?: number) => GroupHandle } {
    const def = this.editor.model.newDefinition(name, true);
    this.stack.push(def.entities);
    try {
      build(this);
    } finally {
      this.stack.pop();
    }
    const place = (position?: Pt, rotDeg = 0, scale = 1) => {
      const point = toVec(position);
      const matrix = new THREE.Matrix4().compose(
        point,
        new THREE.Quaternion().setFromAxisAngle(AXIS_VECTORS.z, (rotDeg * Math.PI) / 180),
        new THREE.Vector3(scale, scale, scale),
      );
      return new GroupHandle(this, this.ents, this.ents.addInstance(def, matrix, ''));
    };
    return { def, place };
  }
  /** OBJ mesh text (`v …` / `f …` lines, e.g. from LLaMA-Mesh) as a group; `size` = largest side. */
  mesh(
    obj: string,
    opts: { at?: Pt; size?: number | string; yUp?: boolean; smooth?: number; name?: string; material?: string } = {},
  ): GroupHandle {
    const group = this.group(opts.name ?? 'Mesh', () => {
      buildMesh(this.ents, parseObj(obj), { size: this.length(opts.size ?? 1), yUp: opts.yUp, smooth: opts.smooth });
      if (opts.material) {
        this.paintAll(this.ents, opts.material);
      }
    });
    if (opts.at) {
      group.move(opts.at);
    }
    return group;
  }
  offsetFace(entities: Entities, faceId: number, distance: number) {
    const face = entities.faces.get(faceId)!;
    entities.addLoop(offsetPolygon(entities.facePoints(face), entities.faceNormal(face), distance));
  }

  guide(point: Pt, dir?: Pt) {
    if (dir) {
      this.editor.model.guides.push({ id: newId(), kind: 'line', point: toVec(point), direction: toVec(dir).normalize() });
    } else {
      this.editor.model.guides.push({ id: newId(), kind: 'point', point: toVec(point) });
    }
  }
  dimension(fromPoint: Pt, toPoint: Pt, offset: Pt = [0, -0.5, 0]) {
    this.editor.model.dimensions.push({ id: newId(), start: toVec(fromPoint), end: toVec(toPoint), offset: toVec(offset) });
  }
  label(point: Pt, text: string, offset: Pt = [0.5, 0.5, 0.8]) {
    this.editor.model.labels.push({ id: newId(), point: toVec(point), text, offset: toVec(offset) });
  }

  // ---------------- view ----------------
  camera(pos: Pt, target: Pt, fov?: number) {
    const rig = this.editor.viewer.rig;
    this.cameraAfter = () =>
      rig.applyState({ position: toVec(pos).toArray(), target: toVec(target).toArray(), fov: fov ?? rig.persp.fov, ortho: rig.isOrtho });
  }
  zoomExtents() {
    this.cameraAfter = () => this.editor.zoomExtents();
  }
  view(name: 'top' | 'front' | 'back' | 'left' | 'right' | 'iso' | 'bottom') {
    this.cameraAfter = () => this.editor.viewer.rig.standardView(name, this.editor.model.bounds());
  }
  shadows(enabled = true, hour?: number) {
    this.editor.model.settings.shadows = enabled;
    if (hour != null) {
      this.editor.model.settings.shadowHour = hour;
    }
  }
  style(settings: Partial<StyleSettings>) {
    Object.assign(this.editor.model.settings.style, settings);
  }
  stats() {
    return this.editor.model.root.stats();
  }
  random(min = 0, max = 1) {
    return min + Math.random() * (max - min);
  }
  afterRun() {
    this.cameraAfter?.();
  }
}

// ---------------------------------------------------------------- parametric shapes
/**
 * Round shapes remember how they were made (kind, positional args, options) on their definition,
 * so the polygon panel can rebuild them with more or fewer segments. Number of positional args per kind:
 */
// i18n-ignore-start – default names of what scripts build are part of the s3d API (labels in the UI: shapes.<kind>)
export const PARAMETRIC: Record<string, { args: number; option: 'segments' | 'sides'; defaultValue: number; min: number; label: string }> =
  {
    cylinder: { args: 3, option: 'segments', defaultValue: 24, min: 3, label: 'Zylinder' },
    cylinderBetween: { args: 3, option: 'segments', defaultValue: 12, min: 3, label: 'Stange' },
    cone: { args: 3, option: 'segments', defaultValue: 24, min: 3, label: 'Kegel' },
    sphere: { args: 2, option: 'segments', defaultValue: 24, min: 4, label: 'Kugel' },
    dome: { args: 2, option: 'segments', defaultValue: 24, min: 4, label: 'Kuppel' },
    ellipsoid: { args: 4, option: 'segments', defaultValue: 16, min: 4, label: 'Ellipsoid' },
    tube: { args: 4, option: 'segments', defaultValue: 24, min: 3, label: 'Rohr' },
    torus: { args: 3, option: 'segments', defaultValue: 24, min: 3, label: 'Torus' },
    prism: { args: 3, option: 'sides', defaultValue: 6, min: 3, label: 'Prisma' },
    pyramid: { args: 3, option: 'sides', defaultValue: 4, min: 3, label: 'Pyramide' },
  };
// i18n-ignore-end
const plain = (value: unknown): unknown =>
  value instanceof THREE.Vector3
    ? value.toArray()
    : Array.isArray(value)
      ? value.map(plain)
      : value && typeof value === 'object'
        ? JSON.parse(JSON.stringify(value))
        : value;
for (const [kind, meta] of Object.entries(PARAMETRIC)) {
  const proto = ScriptApi.prototype as any;
  const orig = proto[kind];
  proto[kind] = function (this: ScriptApi, ...args: unknown[]) {
    const result = orig.apply(this, args);
    if (result instanceof GroupHandle) {
      result.inst.definition.shape = {
        kind,
        args: args.slice(0, meta.args).map(plain),
        opts: plain(args[meta.args] ?? {}) as Record<string, unknown>,
      };
    }
    return result;
  };
}

export interface RunResult {
  ok: boolean;
  logs: ScriptLog[];
  error?: string;
  durationMs: number;
}

/** Run a JavaScript snippet with the `s3d` API as one undoable step. */
export const runScript = (editor: Editor, code: string, label = 'undo.script'): RunResult => {
  const api = new ScriptApi(editor);
  const startedAt = performance.now();
  try {
    editor.commit(label, () => {
      // scripts only get s3d (old names: fw, su)/THREE/console – common browser globals are shadowed
      const compiled = new Function(
        's3d',
        'fw',
        'su',
        'THREE',
        'console',
        'window',
        'document',
        'fetch',
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'XMLHttpRequest',
        'WebSocket',
        'globalThis',
        'self',
        '"use strict";\n' + code,
      );
      const consoleProxy = {
        log: (...args: any[]) => api.log(...args),
        warn: (...args: any[]) => api.warn(...args),
        error: (...args: any[]) => api.warn(...args),
        info: (...args: any[]) => api.log(...args),
      };
      const result = compiled(api, api, api, THREE, consoleProxy);
      if (result instanceof Promise) {
        api.warn(t('script.errors.async'));
      } else if (result !== undefined) {
        api.logs.push({ kind: 'result', text: typeof result === 'string' ? result : JSON.stringify(result) });
      }
    });
    api.afterRun();
    return { ok: true, logs: api.logs, durationMs: performance.now() - startedAt };
  } catch (error: any) {
    return {
      ok: false,
      logs: api.logs,
      error: (error?.message ?? String(error)) + (error?.stack ? '\n' + String(error.stack).split('\n').slice(1, 3).join('\n') : ''),
      durationMs: performance.now() - startedAt,
    };
  }
};

/** Declarative JSON → API calls. */
export const runJson = (editor: Editor, text: string): RunResult => {
  let doc: any;
  try {
    doc = JSON.parse(text);
  } catch (error: any) {
    return { ok: false, logs: [], error: 'JSON-Fehler: ' + error.message, durationMs: 0 };
  }
  const api = new ScriptApi(editor);
  const startedAt = performance.now();
  const build = (node: any) => {
    const type = node.type;
    let res: GroupHandle | FaceHandle | null = null;
    switch (type) {
      case 'box':
        res = api.box(node.at ?? [0, 0, 0], node.size?.[0] ?? 1, node.size?.[1] ?? 1, node.size?.[2] ?? 1, {
          name: node.name,
          material: node.material,
          group: node.group,
        });
        break;
      case 'cylinder':
        res = api.cylinder(node.at ?? [0, 0, 0], node.radius ?? 0.5, node.height ?? 1, {
          segments: node.segments,
          name: node.name,
          material: node.material,
          group: node.group,
        });
        break;
      case 'sphere':
        res = api.sphere(node.at ?? [0, 0, 0], node.radius ?? 0.5, { segments: node.segments, name: node.name, material: node.material });
        break;
      case 'rect':
        res = api.rect(node.at ?? [0, 0, 0], node.size?.[0] ?? 1, node.size?.[1] ?? 1, node.plane);
        if (node.pushpull) {
          res = (res as FaceHandle).pushpull(node.pushpull);
        }
        if (node.material && res) {
          (res as FaceHandle).material(node.material);
        }
        break;
      case 'circle':
        res = api.circle(node.at ?? [0, 0, 0], node.radius ?? 1, { segments: node.segments, normal: node.normal });
        if (node.pushpull) {
          res = (res as FaceHandle).pushpull(node.pushpull);
        }
        break;
      case 'polygon':
        res = api.polygon(node.at ?? [0, 0, 0], node.radius ?? 1, node.sides ?? 6, node.normal);
        if (node.pushpull) {
          res = (res as FaceHandle).pushpull(node.pushpull);
        }
        break;
      case 'face':
        res = api.face(node.points);
        if (node.material) {
          res.material(node.material);
        }
        if (node.pushpull) {
          res = res.pushpull(node.pushpull);
        }
        break;
      case 'line':
        api.polyline(node.points, !!node.closed);
        break;
      case 'polyhedron':
        api.polyhedron(node.points ?? [], node.faces ?? [], { material: node.material });
        return null;
      case 'text3d': {
        // provided by the built-in 3D-text plugin
        const text3d = (api as unknown as Record<string, unknown>).text3d as ((text: string, opts: object) => GroupHandle) | undefined;
        if (!text3d) {
          throw new Error(t('script.errors.needsText3d'));
        }
        res = text3d.call(api, node.text ?? 'Text', {
          at: node.at,
          size: node.size,
          depth: node.depth,
          material: node.material,
          upright: node.upright,
          filled: node.filled,
          font: node.font,
        });
        break;
      }
      case 'group':
        res = api.group(node.name ?? 'Gruppe', () => {
          for (const child of node.children ?? []) {
            build(child);
          }
        });
        break;
      case 'array': {
        const count = node.count ?? 2;
        const off = toVec(node.offset ?? [1, 0, 0]);
        for (let i = 0; i < count; i++) {
          const result = build(node.object);
          if (result instanceof GroupHandle) {
            result.move(off.clone().multiplyScalar(i));
          }
        }
        return null;
      }
      case 'guide':
        api.guide(node.at ?? [0, 0, 0], node.direction);
        return null;
      case 'label':
        api.label(node.at ?? [0, 0, 0], node.text ?? '');
        return null;
      case 'dimension':
        api.dimension(node.from, node.to, node.offset);
        return null;
      default:
        throw new Error(t('script.errors.unknownType', { type }));
    }
    if (res instanceof GroupHandle) {
      if (node.material) {
        res.material(node.material);
      }
      if (node.rotate) {
        res.rotate(node.rotate.angle ?? 0, node.rotate.axis ?? 'z', node.rotate.center);
      }
      if (node.scale) {
        res.scale(node.scale);
      }
      if (node.move) {
        res.move(node.move);
      }
      if (node.tag) {
        res.tag(node.tag);
      }
    }
    return res;
  };
  try {
    editor.commit('JSON-Skript', () => {
      if (doc.clear) {
        api.clear();
      }
      for (const [materialName, value] of Object.entries(doc.materials ?? {})) {
        api.material(
          materialName,
          typeof value === 'string' ? value : (value as any).color,
          typeof value === 'string' ? 1 : ((value as any).opacity ?? 1),
        );
      }
      for (const node of doc.objects ?? []) {
        build(node);
      }
      if (doc.view) {
        api.view(doc.view);
      } else if (doc.zoomExtents !== false) {
        api.zoomExtents();
      }
    });
    api.afterRun();
    return { ok: true, logs: api.logs, durationMs: performance.now() - startedAt };
  } catch (error: any) {
    return { ok: false, logs: api.logs, error: error?.message ?? String(error), durationMs: performance.now() - startedAt };
  }
};

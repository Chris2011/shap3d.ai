import * as THREE from 'three';
import { Definition, Entities, ensureIdAbove, newId, type DefinitionRegistry, type Instance } from './model';
import { terrainToJSON, terrainFromJSON, cloneTerrain } from './terrain';

export interface MaterialDef { name: string; color: string; opacity: number; texture?: string; textureSize?: number }
export interface Tag { name: string; visible: boolean; color: string }
export interface Guide { id: number; kind: 'line' | 'point'; p: THREE.Vector3; d?: THREE.Vector3 }
export interface Dimension { id: number; a: THREE.Vector3; b: THREE.Vector3; offset: THREE.Vector3 }
export interface Label { id: number; p: THREE.Vector3; text: string; offset: THREE.Vector3 }
export interface SectionPlane { id: number; p: THREE.Vector3; n: THREE.Vector3; active: boolean; name: string }
export interface CameraState { pos: number[]; target: number[]; fov: number; ortho: boolean }
export interface Scene { id: number; name: string; camera: CameraState; style?: Partial<StyleSettings>; hiddenTags?: string[] }

export type Units = 'mm' | 'cm' | 'm' | 'in' | 'ft';
export type FaceStyle = 'wireframe' | 'hiddenline' | 'shaded' | 'textured' | 'monochrome';

export interface StyleSettings {
  faceStyle: FaceStyle;
  xray: boolean;
  backEdges: boolean;
  edges: boolean;
  profiles: boolean;
  frontColor: string;
  backColor: string;
  skyColor: string;
  groundColor: string;
  sky: boolean;
  ground: boolean;
  edgeColor: string;
}

export interface ModelSettings {
  units: Units;
  precision: number;
  axes: boolean;
  guides: boolean;
  sectionPlanes: boolean;
  sectionCuts: boolean;
  shadows: boolean;
  shadowHour: number; // 0..24
  shadowMonth: number; // 1..12
  hiddenGeometry: boolean;
  style: StyleSettings;
}

export const DEFAULT_STYLE: StyleSettings = {
  faceStyle: 'textured', xray: false, backEdges: false, edges: true, profiles: true,
  frontColor: '#ffffff', backColor: '#b9c9d3', skyColor: '#c4d3de', groundColor: '#ccccc9',
  sky: true, ground: true, edgeColor: '#000000',
};

export const DEFAULT_MATERIALS: MaterialDef[] = [
  { name: 'Ziegel', color: '#b5523b', opacity: 1 },
  { name: 'Beton', color: '#a7a39b', opacity: 1 },
  { name: 'Holz hell', color: '#d8b07a', opacity: 1 },
  { name: 'Holz dunkel', color: '#7a4b2a', opacity: 1 },
  { name: 'Glas', color: '#9fd3e6', opacity: 0.35 },
  { name: 'Rasen', color: '#6aa84f', opacity: 1 },
  { name: 'Wasser', color: '#3d85c6', opacity: 0.6 },
  { name: 'Metall', color: '#8f9aa5', opacity: 1 },
  { name: 'Dach rot', color: '#a83a2a', opacity: 1 },
  { name: 'Putz weiß', color: '#f1eee6', opacity: 1 },
  { name: 'Stein grau', color: '#6f6f6f', opacity: 1 },
  { name: 'Sand', color: '#e3cf9c', opacity: 1 },
  { name: 'Rot', color: '#e53935', opacity: 1 },
  { name: 'Orange', color: '#fb8c00', opacity: 1 },
  { name: 'Gelb', color: '#fdd835', opacity: 1 },
  { name: 'Grün', color: '#43a047', opacity: 1 },
  { name: 'Blau', color: '#1e88e5', opacity: 1 },
  { name: 'Violett', color: '#8e24aa', opacity: 1 },
  { name: 'Schwarz', color: '#222222', opacity: 1 },
  { name: 'Weiß', color: '#ffffff', opacity: 1 },
];

export class Model implements DefinitionRegistry {
  root = new Entities();
  definitions = new Map<number, Definition>();
  materials: MaterialDef[] = DEFAULT_MATERIALS.map(m => ({ ...m }));
  tags: Tag[] = [{ name: 'Untagged', visible: true, color: '#888888' }];
  guides: Guide[] = [];
  dimensions: Dimension[] = [];
  labels: Label[] = [];
  sections: SectionPlane[] = [];
  scenes: Scene[] = [];
  settings: ModelSettings = {
    units: 'mm', precision: 2, axes: true, guides: true, sectionPlanes: true, sectionCuts: true,
    shadows: false, shadowHour: 13.5, shadowMonth: 6, hiddenGeometry: false, style: { ...DEFAULT_STYLE },
  };
  name = 'Unbenannt';

  material(name?: string): MaterialDef | undefined {
    if (!name) return undefined;
    const m = this.materials.find(x => x.name === name); if (m) return m;
    // plain colours ("#rrggbb") work as anonymous materials, e.g. for imported illustrations
    return /^#[0-9a-f]{6}$/i.test(name) ? { name, color: name, opacity: 1 } : undefined;
  }
  hiddenTags(): Set<string> { return new Set(this.tags.filter(t => !t.visible).map(t => t.name)); }

  newDefinition(name: string, isComponent: boolean, entities = new Entities()): Definition {
    const d = new Definition(name, isComponent, entities); this.definitions.set(d.id, d); return d;
  }
  cloneDefinition(d: Definition): Definition {
    const nd = new Definition(d.name, d.isComponent, d.entities.clone(this)); nd.faceMe = d.faceMe; if (d.terrain) nd.terrain = cloneTerrain(d.terrain); if (d.shape) nd.shape = JSON.parse(JSON.stringify(d.shape));
    this.definitions.set(nd.id, nd); return nd;
  }
  uniqueDefName(base: string) { let i = 1; const names = new Set([...this.definitions.values()].map(d => d.name)); while (names.has(`${base}#${i}`)) i++; return `${base}#${i}`; }

  /** Remove definitions that are not referenced anymore. */
  purge() {
    const used = new Set<number>();
    const walk = (e: Entities) => { for (const i of e.instances.values()) { if (!used.has(i.def.id)) { used.add(i.def.id); walk(i.def.entities); } } };
    walk(this.root);
    for (const id of [...this.definitions.keys()]) if (!used.has(id)) this.definitions.delete(id);
  }

  bounds(): THREE.Box3 { return this.root.bounds(new THREE.Box3(), new THREE.Matrix4(), this.hiddenTags()); }

  clear() {
    this.root = new Entities(); this.definitions.clear(); this.guides = []; this.dimensions = []; this.labels = []; this.sections = [];
  }

  // ---------------- serialization ----------------
  toJSON(): any {
    const ents = (e: Entities) => ({
      v: [...e.vertices.values()].map(v => [v.id, +v.p.x.toFixed(6), +v.p.y.toFixed(6), +v.p.z.toFixed(6)]),
      e: [...e.edges.values()].map(x => { const o: any = [x.id, x.a, x.b]; const fl = (x.soft ? 1 : 0) | (x.hidden ? 2 : 0); if (fl || x.tag) o.push(fl); if (x.tag) o.push(x.tag); return o; }),
      f: [...e.faces.values()].map(f => { const o: any = { id: f.id, o: f.outer }; if (f.holes.length) o.h = f.holes; if (f.material) o.m = f.material; if (f.backMaterial) o.bm = f.backMaterial; if (f.tag) o.t = f.tag; if (f.hidden) o.hd = 1; return o; }),
      i: [...e.instances.values()].map(i => ({ id: i.id, d: i.def.id, m: i.matrix.toArray().map(x => +x.toFixed(6)), n: i.name, mat: i.material, t: i.tag, hd: i.hidden ? 1 : undefined, lk: i.locked ? 1 : undefined })),
    });
    const v3 = (p: THREE.Vector3) => [p.x, p.y, p.z];
    return {
      format: 'shap3d/1', name: this.name,
      settings: this.settings, materials: this.materials, tags: this.tags,
      definitions: [...this.definitions.values()].map(d => ({ id: d.id, name: d.name, c: d.isComponent, fm: d.faceMe ? 1 : undefined, tr: d.terrain ? terrainToJSON(d.terrain) : undefined, sh: d.shape, ents: ents(d.entities) })),
      root: ents(this.root),
      guides: this.guides.map(g => ({ id: g.id, k: g.kind, p: v3(g.p), d: g.d ? v3(g.d) : undefined })),
      dimensions: this.dimensions.map(d => ({ id: d.id, a: v3(d.a), b: v3(d.b), o: v3(d.offset) })),
      labels: this.labels.map(l => ({ id: l.id, p: v3(l.p), t: l.text, o: v3(l.offset) })),
      sections: this.sections.map(s => ({ id: s.id, p: v3(s.p), n: v3(s.n), a: s.active, name: s.name })),
      scenes: this.scenes,
    };
  }

  static fromJSON(j: any): Model {
    const m = new Model();
    m.load(j); return m;
  }

  load(j: any) {
    this.clear();
    if (!['shap3d/1', 'formwerk/1', 'sketchup-vue/1'].includes(j.format)) throw new Error('Unbekanntes Dateiformat');
    let maxId = 0; const seen = (id: number) => { if (id > maxId) maxId = id; return id; };
    const V = (a: number[]) => new THREE.Vector3(a[0], a[1], a[2]);
    this.name = j.name ?? 'Unbenannt';
    this.settings = { ...this.settings, ...(j.settings ?? {}), style: { ...DEFAULT_STYLE, ...(j.settings?.style ?? {}) } };
    if (j.materials) this.materials = j.materials;
    if (j.tags) this.tags = j.tags;
    const defs = new Map<number, Definition>();
    for (const d of j.definitions ?? []) { const def = new Definition(d.name, !!d.c); def.faceMe = !!d.fm; if (d.tr) def.terrain = terrainFromJSON(d.tr); if (d.sh) def.shape = d.sh; (def as any).id = seen(d.id); defs.set(d.id, def); this.definitions.set(d.id, def); }
    const fill = (e: Entities, s: any) => {
      for (const [id, x, y, z] of s.v) e.rawVertex(new THREE.Vector3(x, y, z), seen(id));
      for (const x of s.e) { const fl = x[3] ?? 0; e.createEdgeRaw(x[1], x[2], { soft: !!(fl & 1) || undefined, hidden: !!(fl & 2) || undefined, tag: x[4] }, seen(x[0])); }
      for (const f of s.f) e.createFaceRaw(f.o, f.h ?? [], { material: f.m, backMaterial: f.bm, tag: f.t, hidden: f.hd ? true : undefined }, seen(f.id));
      for (const i of s.i) { const def = defs.get(i.d); if (!def) continue; const inst: Instance = { id: seen(i.id), def, matrix: new THREE.Matrix4().fromArray(i.m), name: i.n ?? '', material: i.mat, tag: i.t, hidden: !!i.hd, locked: !!i.lk }; e.instances.set(inst.id, inst); }
    };
    for (const d of j.definitions ?? []) fill(defs.get(d.id)!.entities, d.ents);
    fill(this.root, j.root);
    this.guides = (j.guides ?? []).map((g: any) => ({ id: seen(g.id), kind: g.k, p: V(g.p), d: g.d ? V(g.d) : undefined }));
    this.dimensions = (j.dimensions ?? []).map((d: any) => ({ id: seen(d.id), a: V(d.a), b: V(d.b), offset: V(d.o) }));
    this.labels = (j.labels ?? []).map((l: any) => ({ id: seen(l.id), p: V(l.p), text: l.t, offset: V(l.o) }));
    this.sections = (j.sections ?? []).map((s: any) => ({ id: seen(s.id), p: V(s.p), n: V(s.n), active: !!s.a, name: s.name ?? 'Schnitt' }));
    this.scenes = j.scenes ?? [];
    ensureIdAbove(maxId);
  }
}

export { newId };

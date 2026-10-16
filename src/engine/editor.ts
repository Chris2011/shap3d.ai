import * as THREE from 'three';
import { reactive, markRaw } from 'vue';
import { Model } from '../core/document';
import type { Entities, EntityRef, Instance } from '../core/model';
import { Viewer } from './viewer';
import { InferenceEngine } from './inference';
import type { Overlay } from './overlay';
import { formatLength, formatArea } from '../core/units';
import { nav, wheelAction } from './navigation';

/** Tools of SketchUp Web's main toolbar (others appear as recently used tools). */
export const MAIN_TOOLS = ['select', 'eraser', 'line', 'rectangle', 'pushpull', 'move', 'rotate', 'scale', 'paint', 'orbit', 'pan', 'tape'];

export interface PEvt { x: number; y: number; button: number; shift: boolean; ctrl: boolean; alt: boolean; detail: number }

export abstract class Tool {
  abstract id: string;
  abstract name: string;
  cursor = 'default';
  vcbLabel = '';
  constructor(public ed: Editor) {}
  status(): string { return ''; }
  activate() {}
  deactivate() {}
  onDown(_e: PEvt) {}
  onMove(_e: PEvt) {}
  onUp(_e: PEvt) {}
  onDblClick(_e: PEvt) {}
  onKey(_e: KeyboardEvent, _down: boolean): boolean { return false; }
  onVcb(_text: string): boolean { return false; }
  draw(_o: Overlay) {}
  /** Esc */
  cancel() {}
  /** true while the tool is in the middle of an operation (Esc resets, nav keeps state) */
  busy() { return false; }
}

export interface UiState {
  tool: string;
  status: string;
  vcbLabel: string;
  vcbValue: string;
  vcbEditing: boolean;
  rev: number;            // model revision – panels re-read
  selRev: number;         // selection revision
  canUndo: boolean; canRedo: boolean; undoLabel: string; redoLabel: string;
  currentMaterial: string | null;
  contextName: string;
  toast: string;
  saved: boolean;
  renderer: string;
  projection: 'persp' | 'ortho';
  dialog: null | { kind: string; data?: any };
  recentTools: string[];
}

export class Editor {
  model = new Model();
  viewer!: Viewer;
  infer!: InferenceEngine;
  ui: UiState = reactive({
    tool: 'select', status: '', vcbLabel: '', vcbValue: '', vcbEditing: false, rev: 0, selRev: 0,
    canUndo: false, canRedo: false, undoLabel: '', redoLabel: '', currentMaterial: null, contextName: '', toast: '', saved: true,
    renderer: 'WebGL', projection: 'persp', dialog: null, recentTools: ['circle', 'offset', 'arc2'],
  });
  tools = new Map<string, Tool>();
  tool!: Tool;
  activePath: Instance[] = [];
  selection = new Map<string, EntityRef>();
  hover: EntityRef | null = null;
  mouse = { x: 0, y: 0, inside: false };
  private undoStack: { label: string; snap: any; path: number[] }[] = [];
  private redoStack: { label: string; snap: any; path: number[] }[] = [];
  private nav: { mode: 'orbit' | 'pan'; x: number; y: number; pivot: THREE.Vector3 | null } | null = null;
  private dirty = true;
  private selDirty = true;
  clipboard: any = null;
  lastPushPull = 0;
  lastOffset = 0;
  onToolChange: (() => void)[] = [];

  constructor() { (this as any).model = markRaw(this.model); }

  attach(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement) {
    this.viewer = markRaw(new Viewer(canvas, overlay));
    this.viewer.model = this.model;
    this.infer = markRaw(new InferenceEngine(this.viewer, () => this.model.guides));
    this.viewer.overlay.drawers.push(o => this.drawOverlay(o));
    this.viewer.onFrame = () => this.frame();
    this.setTool('select');
    this.dirty = true;
  }

  register(t: Tool) { this.tools.set(t.id, markRaw(t)); }

  // ------------------------------------------------------------ context
  get entities(): Entities { return this.activePath.length ? this.activePath[this.activePath.length - 1].def.entities : this.model.root; }
  get contextMatrix(): THREE.Matrix4 { const m = new THREE.Matrix4(); for (const i of this.activePath) m.multiply(i.matrix); return m; }
  get contextInverse(): THREE.Matrix4 { return this.contextMatrix.invert(); }
  toLocal(p: THREE.Vector3) { return p.clone().applyMatrix4(this.contextInverse); }
  toWorld(p: THREE.Vector3) { return p.clone().applyMatrix4(this.contextMatrix); }
  dirToLocal(d: THREE.Vector3) { return d.clone().transformDirection(this.contextInverse); }

  setContext(path: Instance[]) { this.activePath = path; this.clearSelection(); this.updateContextName(); this.invalidate(); }
  enterInstance(inst: Instance) { this.activePath = [...this.activePath, inst]; this.clearSelection(); this.updateContextName(); this.invalidate(); }
  exitContext(all = false) {
    if (!this.activePath.length) return;
    const left = this.activePath[this.activePath.length - 1];
    this.activePath = all ? [] : this.activePath.slice(0, -1);
    this.clearSelection();
    if (!all) this.select([{ kind: 'instance', id: left.id }]);
    this.updateContextName(); this.invalidate();
  }
  private updateContextName() { this.ui.contextName = this.activePath.map(i => i.name || i.def.name).join(' › '); }

  /** Returns whether a pick context lies inside the active editing context. */
  inContext(path: Instance[]) { if (path.length < this.activePath.length) return false; return this.activePath.every((p, i) => path[i] === p); }

  /** Map a pick (face/edge/vertex hit in any nested entities) to a selectable ref in the active context. */
  refFromPick(path: Instance[], kind: 'face' | 'edge', id: number): EntityRef | null {
    if (!this.inContext(path)) return null;
    if (path.length === this.activePath.length) return { kind, id };
    return { kind: 'instance', id: path[this.activePath.length].id };
  }

  // ------------------------------------------------------------ selection
  key(r: EntityRef) { return `${r.kind}:${r.id}`; }
  select(refs: EntityRef[], mode: 'set' | 'add' | 'toggle' | 'remove' = 'set') {
    if (mode === 'set') this.selection.clear();
    for (const r of refs) {
      const k = this.key(r);
      if (mode === 'remove') this.selection.delete(k);
      else if (mode === 'toggle') { if (this.selection.has(k)) this.selection.delete(k); else this.selection.set(k, r); }
      else this.selection.set(k, r);
    }
    this.selectionChanged();
  }
  clearSelection() { if (this.selection.size) { this.selection.clear(); this.selectionChanged(); } }
  selectionChanged() { this.selDirty = true; this.ui.selRev++; }
  selected(): EntityRef[] { return this.pruneSelection(); }
  pruneSelection(): EntityRef[] {
    const ents = this.entities; const out: EntityRef[] = [];
    for (const [k, r] of this.selection) {
      const ok = r.kind === 'face' ? ents.faces.has(r.id) : r.kind === 'edge' ? ents.edges.has(r.id) : ents.instances.has(r.id);
      if (ok) out.push(r); else this.selection.delete(k);
    }
    return out;
  }
  selectAll() {
    const e = this.entities; const refs: EntityRef[] = [];
    e.faces.forEach(f => refs.push({ kind: 'face', id: f.id })); e.edges.forEach(x => refs.push({ kind: 'edge', id: x.id })); e.instances.forEach(i => refs.push({ kind: 'instance', id: i.id }));
    this.select(refs);
  }
  setHover(r: EntityRef | null) {
    const k = r ? this.key(r) : '', o = this.hover ? this.key(this.hover) : '';
    if (k !== o) { this.hover = r; this.selDirty = true; }
  }

  // ------------------------------------------------------------ history
  private snapshot() { return this.model.toJSON(); }
  /** Run a modelling operation as one undoable step. */
  commit<T>(label: string, fn: () => T): T {
    const snap = this.snapshot(); const path = this.activePath.map(i => i.id);
    let r: T;
    try { r = fn(); }
    catch (e) { console.error(e); this.restore(snap, path); this.toast('Fehler: ' + (e as Error).message); throw e; }
    this.undoStack.push({ label, snap, path }); if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.changed();
    return r;
  }
  changed() { this.ui.saved = false; this.updateHistoryUi(); this.invalidate(); }

  /** Long-running interactive operation (move/rotate preview): snapshot now, finish later. */
  private op: { label: string; snap: any; path: number[] } | null = null;
  beginOp(label: string) { if (this.op) this.abortOp(); this.op = { label, snap: this.snapshot(), path: this.activePath.map(i => i.id) }; }
  get opSnapshot() { return this.op?.snap; }
  endOp() {
    if (!this.op) return;
    this.undoStack.push(this.op); this.redoStack = []; this.op = null; this.changed();
  }
  abortOp() { if (!this.op) return; const o = this.op; this.op = null; this.restore(o.snap, o.path); }
  inOp() { return !!this.op; }

  /** Modal text prompt rendered by the UI. */
  prompt(title: string, value = '', multiline = false): Promise<string | null> {
    return new Promise(resolve => { this.ui.dialog = { kind: 'prompt', data: { title, value, multiline, resolve: (v: string | null) => { this.ui.dialog = null; resolve(v); } } }; });
  }
  confirm(title: string): Promise<boolean> {
    return new Promise(resolve => { this.ui.dialog = { kind: 'confirm', data: { title, resolve: (v: boolean) => { this.ui.dialog = null; resolve(v); } } }; });
  }
  private restore(snap: any, path: number[]) {
    this.model.load(snap);
    // re-resolve the editing context by instance ids
    const newPath: Instance[] = []; let ents = this.model.root;
    for (const id of path) { const i = ents.instances.get(id); if (!i) break; newPath.push(i); ents = i.def.entities; }
    this.activePath = newPath; this.updateContextName();
    this.pruneSelection(); this.selectionChanged();
    this.invalidate();
  }
  undo() {
    if (this.tool.busy()) { this.tool.cancel(); return; }
    const s = this.undoStack.pop(); if (!s) return;
    this.redoStack.push({ label: s.label, snap: this.snapshot(), path: this.activePath.map(i => i.id) });
    this.restore(s.snap, s.path); this.updateHistoryUi(); this.toast(`Rückgängig: ${s.label}`);
  }
  redo() {
    const s = this.redoStack.pop(); if (!s) return;
    this.undoStack.push({ label: s.label, snap: this.snapshot(), path: this.activePath.map(i => i.id) });
    this.restore(s.snap, s.path); this.updateHistoryUi(); this.toast(`Wiederholen: ${s.label}`);
  }
  private updateHistoryUi() {
    this.ui.canUndo = this.undoStack.length > 0; this.ui.canRedo = this.redoStack.length > 0;
    this.ui.undoLabel = this.undoStack[this.undoStack.length - 1]?.label ?? ''; this.ui.redoLabel = this.redoStack[this.redoStack.length - 1]?.label ?? '';
  }
  resetHistory() { this.undoStack = []; this.redoStack = []; this.updateHistoryUi(); }

  newModel() { this.model.load(new Model().toJSON()); this.model.name = 'Unbenannt'; this.activePath = []; this.updateContextName(); this.clearSelection(); this.onNewModel.forEach(f => f()); this.resetHistory(); this.ui.saved = true; this.invalidate(); this.setTool('select'); this.viewer.rig.applyState({ pos: [-11, -17, 5.5], target: [2, 2, 1.2], fov: 35, ortho: false }); }
  onNewModel: (() => void)[] = [];
  loadJSON(j: any) { this.model.load(j); this.activePath = []; this.updateContextName(); this.resetHistory(); this.clearSelection(); this.ui.saved = true; this.invalidate(); this.zoomExtents(false); }

  invalidate() { this.dirty = true; this.selDirty = true; this.ui.rev++; }
  redraw() { this.viewer.needsRender = true; }

  private frame() {
    if (this.dirty) { this.dirty = false; this.selDirty = false; this.pruneSelection(); this.viewer.rebuild(this.viewState()); }
    else if (this.selDirty) { this.selDirty = false; this.viewer.rebuildHighlight(this.viewState()); }
  }
  private viewState() { return { activePath: this.activePath, selection: this.selection, hover: this.hover }; }

  // ------------------------------------------------------------ tools
  setTool(id: string) {
    const t = this.tools.get(id); if (!t) return;
    if (this.tool) { this.tool.cancel(); this.tool.deactivate(); }
    this.tool = t; this.ui.tool = id;
    if (!MAIN_TOOLS.includes(id) && !['place', 'zoomwindow', 'poscam', 'lookaround', 'walk', 'zoom'].includes(id)) this.ui.recentTools = [id, ...this.ui.recentTools.filter(x => x !== id)].slice(0, 3); this.ui.vcbValue = ''; this.ui.vcbLabel = t.vcbLabel;
    this.infer?.reset(); this.setHover(null);
    t.activate();
    this.refreshStatus();
    this.onToolChange.forEach(f => f());
    this.redraw();
  }
  refreshStatus() { if (this.tool) { this.ui.status = this.tool.status(); this.ui.vcbLabel = this.tool.vcbLabel; } }
  setVcb(v: string, label?: string) { if (!this.ui.vcbEditing) this.ui.vcbValue = v; if (label != null) this.ui.vcbLabel = label; }
  fmt(v: number) { return formatLength(v, this.model.settings.units, this.model.settings.precision); }
  fmtArea(v: number) { return formatArea(v, this.model.settings.units, this.model.settings.precision); }
  toast(msg: string) { this.ui.toast = msg; clearTimeout((this as any)._tt); (this as any)._tt = setTimeout(() => (this.ui.toast = ''), 2600); }

  submitVcb(text: string) {
    this.ui.vcbEditing = false;
    const ok = this.tool.onVcb(text.trim());
    if (!ok) this.toast('Ungültige Eingabe im Feld „Maße“');
    this.redraw();
  }

  // ------------------------------------------------------------ input
  private lastDown = { t: 0, x: 0, y: 0 };
  pointerDown(e: PEvt) {
    if (e.button === 1 || (e.button === 0 && this.ui.tool === 'orbit' && false)) {
      const fh = this.viewer.pickFace(e.x, e.y);
      this.nav = { mode: e.shift ? 'pan' : 'orbit', x: e.x, y: e.y, pivot: fh ? fh.point : null };
      return;
    }
    if (e.button === 2) return;
    this.tool.onDown(e); this.refreshStatus(); this.redraw();
  }
  pointerMove(e: PEvt) {
    this.mouse.x = e.x; this.mouse.y = e.y; this.mouse.inside = true;
    if (this.nav) {
      const dx = e.x - this.nav.x, dy = e.y - this.nav.y; this.nav.x = e.x; this.nav.y = e.y;
      if (this.nav.mode === 'orbit' && !e.shift) this.viewer.rig.orbit(dx, dy, this.nav.pivot ?? undefined);
      else this.viewer.rig.pan(dx, dy, this.viewer.height, this.nav.pivot ?? undefined);
      return;
    }
    this.tool.onMove(e); this.redraw();
  }
  pointerUp(e: PEvt) {
    if (this.nav && e.button === 1) { this.nav = null; return; }
    if (e.button !== 0) return;
    this.tool.onUp(e); this.refreshStatus(); this.redraw();
  }
  dblClick(e: PEvt) { if (e.button === 0) { this.tool.onDblClick(e); this.refreshStatus(); this.redraw(); } }
  private gesture: { pivot: THREE.Vector3 | null; t: number } | null = null;
  /** Wheel / trackpad gestures: zoom, orbit or pan depending on device and Shift/Ctrl (see navigation.ts). */
  wheel(x: number, y: number, e: { dx: number; dy: number; shift: boolean; ctrl: boolean; mode: number }) {
    const unit = e.mode === 1 ? 16 : e.mode === 2 ? this.viewer.height : 1;
    let dx = e.dx * unit, dy = e.dy * unit;
    // browsers turn Shift+wheel into a horizontal scroll on mouse wheels
    if (e.shift && nav.device === 'mouse' && dy === 0) { dy = dx; dx = 0; }
    const action = wheelAction(e.shift, e.ctrl);
    const now = performance.now();
    if (!this.gesture || now - this.gesture.t > 250) this.gesture = { pivot: this.pivotAt(x, y), t: now };
    this.gesture.t = now;
    const rig = this.viewer.rig; const sens = nav.sensitivity[action]; const inv = nav.invert[action] ? -1 : 1;
    if (action === 'zoom') {
      // pinch deltas are small, wheel notches are ~100px
      const k = nav.device === 'trackpad' ? (e.ctrl ? 0.012 : 0.004) : 0.0016;
      rig.zoomAt(this.pivotAt(x, y), Math.exp(THREE.MathUtils.clamp(dy * k * sens * inv, -0.6, 0.6)));
    } else if (action === 'orbit') {
      const k = (nav.device === 'mouse' ? 0.35 : 0.8) * sens * inv;
      rig.orbit(dx * k, dy * k, this.gesture.pivot ?? undefined);
    } else {
      const k = (nav.device === 'mouse' ? 0.6 : 1) * sens * inv;
      rig.pan(-dx * k, -dy * k, this.viewer.height, this.gesture.pivot ?? undefined);
    }
  }
  /** Point under the cursor (face hit, else ground plane, else target distance). */
  pivotAt(x: number, y: number): THREE.Vector3 {
    const fh = this.viewer.pickFace(x, y); if (fh) return fh.point;
    const r = this.viewer.ray(x, y); const d = this.viewer.rig.position.distanceTo(this.viewer.rig.target);
    const g = r.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
    return g && g.distanceTo(r.origin) < d * 8 ? g : r.at(d, new THREE.Vector3());
  }

  zoomExtents(animate = true) { this.viewer.rig.zoomExtents(this.model.bounds(), animate); }

  // ------------------------------------------------------------ overlay
  private drawOverlay(o: Overlay) {
    // open-group bounding box (dashed)
    if (this.activePath.length) {
      const inst = this.activePath[this.activePath.length - 1];
      const parent = new THREE.Matrix4(); for (const i of this.activePath.slice(0, -1)) parent.multiply(i.matrix);
      const bb = inst.def.entities.bounds(new THREE.Box3());
      if (!bb.isEmpty()) {
        const m = parent.clone().multiply(inst.matrix);
        const c = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new THREE.Vector3(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).applyMatrix4(m));
        const E = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
        for (const [a, b] of E) o.line(c[a], c[b], '#555', 1, [4, 3]);
      }
    }
    // guide points
    if (this.model.settings.guides) for (const g of this.model.guides) if (g.kind === 'point') o.marker(g.p, 'guide');
    // dimensions & labels
    for (const d of this.model.dimensions) this.drawDimension(o, d.a, d.b, d.offset);
    for (const l of this.model.labels) {
      const tip = l.p, at = l.p.clone().add(l.offset);
      o.line(tip, at, '#000', 1); const s = o.screen(tip); if (s) { o.ctx.fillStyle = '#000'; o.ctx.beginPath(); o.ctx.arc(s.x, s.y, 2, 0, 7); o.ctx.fill(); }
      o.text(at, l.text, { bg: '#ffffffd9', align: 'left', dx: 4 });
    }
    // section planes
    if (this.model.settings.sectionPlanes) for (const s of this.model.sections) this.drawSection(o, s.p, s.n, s.active);
    this.tool.draw(o);
  }

  drawDimension(o: Overlay, a: THREE.Vector3, b: THREE.Vector3, off: THREE.Vector3) {
    const A = a.clone().add(off), B = b.clone().add(off);
    o.line(a, A, '#000', 1); o.line(b, B, '#000', 1); o.line(A, B, '#000', 1);
    const sa = o.screen(A), sb = o.screen(B);
    if (sa && sb) {
      const c = o.ctx; const d = sb.clone().sub(sa).normalize().multiplyScalar(9); const n = new THREE.Vector2(-d.y, d.x).multiplyScalar(0.35);
      c.fillStyle = '#000';
      for (const [p, s] of [[sa, 1], [sb, -1]] as const) { c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(p.x + d.x * s + n.x, p.y + d.y * s + n.y); c.lineTo(p.x + d.x * s - n.x, p.y + d.y * s - n.y); c.closePath(); c.fill(); }
    }
    o.text(A.clone().add(B).multiplyScalar(0.5), this.fmt(a.distanceTo(b)), { bg: '#ffffffe6' });
  }

  drawSection(o: Overlay, p: THREE.Vector3, n: THREE.Vector3, active: boolean) {
    const s = this.viewer.worldPerPixel(p) * 60;
    const u = Math.abs(n.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(n).normalize() : new THREE.Vector3(1, 0, 0).cross(n).normalize();
    const v = n.clone().cross(u).normalize();
    const c = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => p.clone().addScaledVector(u, x * s).addScaledVector(v, y * s));
    o.fillPolygon(c, active ? 'rgba(255,140,0,0.12)' : 'rgba(120,120,120,0.08)');
    o.polyline(c, active ? '#e07000' : '#888', 1.5, true);
    for (const k of [0, 1, 2, 3]) { const q = c[k].clone().lerp(p, 0.15); o.line(q, q.clone().addScaledVector(n, s * 0.35), active ? '#e07000' : '#888', 1.5); }
  }

  // ------------------------------------------------------------ status helpers
  selectionSummary(): string {
    const s = this.selected();
    if (!s.length) return 'Keine Auswahl';
    const c = { face: 0, edge: 0, instance: 0 }; s.forEach(r => c[r.kind]++);
    const parts: string[] = [];
    if (c.face) parts.push(`${c.face} ${c.face === 1 ? 'Fläche' : 'Flächen'}`);
    if (c.edge) parts.push(`${c.edge} ${c.edge === 1 ? 'Kante' : 'Kanten'}`);
    if (c.instance) parts.push(`${c.instance} ${c.instance === 1 ? 'Gruppe/Komponente' : 'Gruppen/Komponenten'}`);
    return parts.join(', ');
  }
}

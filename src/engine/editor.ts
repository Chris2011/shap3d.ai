import * as THREE from 'three';
import { drawMeasure } from './measureView';
import { reactive, markRaw } from 'vue';
import { Model } from '../core/document';
import type { Entities, EntityRef, Instance } from '../core/model';
import { Viewer } from './viewer';
import { InferenceEngine } from './inference';
import type { Overlay } from './overlay';
import { formatLength, formatArea } from '../core/units';
import { nav, wheelAction } from './navigation';
import { t, localize, normalizeNumberInput } from '../i18n';

/** Tools of SketchUp Web's main toolbar (others appear as recently used tools). */
export const MAIN_TOOLS = ['select', 'eraser', 'line', 'rectangle', 'pushpull', 'move', 'rotate', 'scale', 'paint', 'orbit', 'pan', 'tape'];

export interface PEvt {
  x: number;
  y: number;
  button: number;
  shift: boolean;
  ctrl: boolean;
  alt: boolean;
  detail: number;
}

export abstract class Tool {
  abstract id: string;
  abstract name: string;
  cursor = 'default';
  vcbLabel = '';
  constructor(public editor: Editor) {}
  status(): string {
    return '';
  }
  activate() {}
  deactivate() {}
  onDown(_event: PEvt) {}
  onMove(_event: PEvt) {}
  onUp(_event: PEvt) {}
  onDblClick(_event: PEvt) {}
  onKey(_event: KeyboardEvent, _down: boolean): boolean {
    return false;
  }
  onVcb(_text: string): boolean {
    return false;
  }
  draw(_overlay: Overlay) {}
  /** Esc */
  cancel() {}
  /** true while the tool is in the middle of an operation (Esc resets, nav keeps state) */
  busy() {
    return false;
  }
}

export interface UiState {
  tool: string;
  status: string;
  vcbLabel: string;
  vcbValue: string;
  vcbEditing: boolean;
  revision: number; // model revision – panels re-read
  selRev: number; // selection revision
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
  currentMaterial: string | null;
  contextName: string;
  toast: string;
  saved: boolean;
  renderer: string;
  projection: 'persp' | 'ortho';
  dialog: null | { kind: string; data?: any };
  recentTools: string[];
  /** bumped when a tool is registered or removed (plugins) – the toolbars re-check what exists */
  toolsRevision: number;
}

export class Editor {
  model = new Model();
  viewer!: Viewer;
  infer!: InferenceEngine;
  ui: UiState = reactive({
    tool: 'select',
    status: '',
    vcbLabel: '',
    vcbValue: '',
    vcbEditing: false,
    revision: 0,
    selRev: 0,
    canUndo: false,
    canRedo: false,
    undoLabel: '',
    redoLabel: '',
    currentMaterial: null,
    contextName: '',
    toast: '',
    saved: true,
    renderer: 'WebGL',
    projection: 'persp',
    dialog: null,
    recentTools: ['circle', 'offset', 'arc2'],
    toolsRevision: 0,
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
  /**
   * run at the end of every undo step, still inside it – what they change is undone with the step (e.g. plugins
   * answering changed plugin data)
   */
  settling: (() => void)[] = [];
  private commitDepth = 0;

  constructor() {
    (this as any).model = markRaw(this.model);
  }

  attach(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement) {
    this.viewer = markRaw(new Viewer(canvas, overlay));
    this.viewer.model = this.model;
    this.infer = markRaw(
      new InferenceEngine(
        this.viewer,
        () => this.model.guides,
        () => this.entities,
      ),
    );
    this.viewer.overlay.drawers.push((canvasOverlay) => drawMeasure(canvasOverlay, this)); // below tool feedback
    this.viewer.overlay.drawers.push((canvasOverlay) => this.drawOverlay(canvasOverlay));
    this.viewer.onFrame = () => this.frame();
    this.setTool('select');
    this.dirty = true;
  }

  register(tool: Tool) {
    this.tools.set(tool.id, markRaw(tool));
    this.ui.toolsRevision++;
  }
  /** Removes a tool (plugin switched off): leaves it if active and drops it from the toolbar right away. */
  unregister(id: string) {
    if (this.ui.tool === id) {
      this.setTool('select');
    }
    this.tools.delete(id);
    this.ui.recentTools = this.ui.recentTools.filter((recent) => recent !== id);
    this.ui.toolsRevision++;
  }
  /** true if a tool with this id is registered (reactive through ui.toolsRevision) */
  hasTool(id: string) {
    void this.ui.toolsRevision;
    return this.tools.has(id);
  }

  // ------------------------------------------------------------ context
  get entities(): Entities {
    return this.activePath.length ? this.activePath[this.activePath.length - 1].definition.entities : this.model.root;
  }
  get contextMatrix(): THREE.Matrix4 {
    const matrix = new THREE.Matrix4();
    for (const instance of this.activePath) {
      matrix.multiply(instance.matrix);
    }
    return matrix;
  }
  get contextInverse(): THREE.Matrix4 {
    return this.contextMatrix.invert();
  }
  toLocal(point: THREE.Vector3) {
    return point.clone().applyMatrix4(this.contextInverse);
  }
  toWorld(point: THREE.Vector3) {
    return point.clone().applyMatrix4(this.contextMatrix);
  }
  dirToLocal(direction: THREE.Vector3) {
    return direction.clone().transformDirection(this.contextInverse);
  }

  setContext(path: Instance[]) {
    this.activePath = path;
    this.clearSelection();
    this.updateContextName();
    this.invalidate();
  }
  enterInstance(inst: Instance) {
    this.activePath = [...this.activePath, inst];
    this.clearSelection();
    this.updateContextName();
    this.invalidate();
  }
  exitContext(all = false) {
    if (!this.activePath.length) {
      return;
    }
    const left = this.activePath[this.activePath.length - 1];
    this.activePath = all ? [] : this.activePath.slice(0, -1);
    this.clearSelection();
    if (!all) {
      this.select([{ kind: 'instance', id: left.id }]);
    }
    this.updateContextName();
    this.invalidate();
  }
  private updateContextName() {
    this.ui.contextName = this.activePath.map((instance) => instance.name || instance.definition.name).join(' › ');
  }

  /** Returns whether a pick context lies inside the active editing context. */
  inContext(path: Instance[]) {
    if (path.length < this.activePath.length) {
      return false;
    }
    return this.activePath.every((instance, i) => path[i] === instance);
  }

  /** Map a pick (face/edge/vertex hit in any nested entities) to a selectable ref in the active context. */
  refFromPick(path: Instance[], kind: 'face' | 'edge', id: number): EntityRef | null {
    if (!this.inContext(path)) {
      return null;
    }
    if (path.length === this.activePath.length) {
      return { kind, id };
    }
    return { kind: 'instance', id: path[this.activePath.length].id };
  }

  // ------------------------------------------------------------ selection
  key(entityRef: EntityRef) {
    return `${entityRef.kind}:${entityRef.id}`;
  }
  select(refs: EntityRef[], mode: 'set' | 'add' | 'toggle' | 'remove' = 'set') {
    if (mode === 'set') {
      this.selection.clear();
    }
    for (const entityRef of refs) {
      const key = this.key(entityRef);
      if (mode === 'remove') {
        this.selection.delete(key);
      } else if (mode === 'toggle') {
        if (this.selection.has(key)) {
          this.selection.delete(key);
        } else {
          this.selection.set(key, entityRef);
        }
      } else {
        this.selection.set(key, entityRef);
      }
    }
    this.selectionChanged();
  }
  clearSelection() {
    if (this.selection.size) {
      this.selection.clear();
      this.selectionChanged();
    }
  }
  selectionChanged() {
    this.selDirty = true;
    this.ui.selRev++;
  }
  selected(): EntityRef[] {
    return this.pruneSelection();
  }
  pruneSelection(): EntityRef[] {
    const ents = this.entities;
    const out: EntityRef[] = [];
    for (const [key, entityRef] of this.selection) {
      const ok =
        entityRef.kind === 'face'
          ? ents.faces.has(entityRef.id)
          : entityRef.kind === 'edge'
            ? ents.edges.has(entityRef.id)
            : ents.instances.has(entityRef.id);
      if (ok) {
        out.push(entityRef);
      } else {
        this.selection.delete(key);
      }
    }
    return out;
  }
  selectAll() {
    const entities = this.entities;
    const refs: EntityRef[] = [];
    entities.faces.forEach((face) => refs.push({ kind: 'face', id: face.id }));
    entities.edges.forEach((x) => refs.push({ kind: 'edge', id: x.id }));
    entities.instances.forEach((instance) => refs.push({ kind: 'instance', id: instance.id }));
    this.select(refs);
  }
  setHover(entityRef: EntityRef | null) {
    const key = entityRef ? this.key(entityRef) : '',
      hoverKey = this.hover ? this.key(this.hover) : '';
    if (key !== hoverKey) {
      this.hover = entityRef;
      this.selDirty = true;
    }
  }

  // ------------------------------------------------------------ history
  private snapshot() {
    return this.model.toJSON();
  }
  /** Run a modelling operation as one undoable step. */
  commit<T>(label: string, action: () => T): T {
    const snap = this.snapshot();
    const path = this.activePath.map((instance) => instance.id);
    let result: T;
    this.commitDepth++;
    try {
      result = action();
      if (this.commitDepth === 1) {
        this.settle();
      }
    } catch (error) {
      console.error(error);
      this.restore(snap, path);
      this.toast('Fehler: ' + (error as Error).message);
      throw error;
    } finally {
      this.commitDepth--;
    }
    this.undoStack.push({ label, snap, path });
    if (this.undoStack.length > 100) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.changed();
    return result;
  }
  /** inside an undo step (commit or a long-running operation)? */
  changing() {
    return this.commitDepth > 0 || !!this.operation;
  }
  private settle() {
    for (const listener of [...this.settling]) {
      listener();
    }
  }
  changed() {
    this.ui.saved = false;
    this.updateHistoryUi();
    this.invalidate();
  }

  /** Long-running interactive operation (move/rotate preview): snapshot now, finish later. */
  private operation: { label: string; snap: any; path: number[] } | null = null;
  beginOp(label: string) {
    if (this.operation) {
      this.abortOp();
    }
    this.operation = { label, snap: this.snapshot(), path: this.activePath.map((instance) => instance.id) };
  }
  get opSnapshot() {
    return this.operation?.snap;
  }
  endOp() {
    if (!this.operation) {
      return;
    }
    this.settle();
    this.undoStack.push(this.operation);
    this.redoStack = [];
    this.operation = null;
    this.changed();
  }
  abortOp() {
    if (!this.operation) {
      return;
    }
    const pending = this.operation;
    this.operation = null;
    this.restore(pending.snap, pending.path);
  }
  inOp() {
    return !!this.operation;
  }

  /** Modal text prompt rendered by the UI. */
  prompt(title: string, value = '', multiline = false): Promise<string | null> {
    return new Promise((resolve) => {
      this.ui.dialog = {
        kind: 'prompt',
        data: {
          title,
          value,
          multiline,
          resolve: (answer: string | null) => {
            this.ui.dialog = null;
            resolve(answer);
          },
        },
      };
    });
  }
  confirm(title: string): Promise<boolean> {
    return new Promise((resolve) => {
      this.ui.dialog = {
        kind: 'confirm',
        data: {
          title,
          resolve: (confirmed: boolean) => {
            this.ui.dialog = null;
            resolve(confirmed);
          },
        },
      };
    });
  }
  private restore(snap: any, path: number[]) {
    this.model.load(snap);
    // re-resolve the editing context by instance ids
    const newPath: Instance[] = [];
    let ents = this.model.root;
    for (const id of path) {
      const instance = ents.instances.get(id);
      if (!instance) {
        break;
      }
      newPath.push(instance);
      ents = instance.definition.entities;
    }
    this.activePath = newPath;
    this.updateContextName();
    this.pruneSelection();
    this.selectionChanged();
    this.invalidate();
  }
  undo() {
    if (this.tool.busy()) {
      this.tool.cancel();
      return;
    }
    const entry = this.undoStack.pop();
    if (!entry) {
      return;
    }
    this.redoStack.push({ label: entry.label, snap: this.snapshot(), path: this.activePath.map((instance) => instance.id) });
    this.restore(entry.snap, entry.path);
    this.updateHistoryUi();
    this.toast(t('editor.undone', { action: localize(entry.label) }));
  }
  redo() {
    const entry = this.redoStack.pop();
    if (!entry) {
      return;
    }
    this.undoStack.push({ label: entry.label, snap: this.snapshot(), path: this.activePath.map((instance) => instance.id) });
    this.restore(entry.snap, entry.path);
    this.updateHistoryUi();
    this.toast(t('editor.redone', { action: localize(entry.label) }));
  }
  private updateHistoryUi() {
    this.ui.canUndo = this.undoStack.length > 0;
    this.ui.canRedo = this.redoStack.length > 0;
    this.ui.undoLabel = this.undoStack[this.undoStack.length - 1]?.label ?? '';
    this.ui.redoLabel = this.redoStack[this.redoStack.length - 1]?.label ?? '';
  }
  resetHistory() {
    this.undoStack = [];
    this.redoStack = [];
    this.updateHistoryUi();
  }

  newModel() {
    this.model.load(new Model().toJSON());
    this.model.name = t('names.untitled');
    this.activePath = [];
    this.updateContextName();
    this.clearSelection();
    this.onNewModel.forEach((listener) => listener());
    this.resetHistory();
    this.ui.saved = true;
    this.invalidate();
    this.setTool('select');
    this.viewer.rig.applyState({ position: [-11, -17, 5.5], target: [2, 2, 1.2], fov: 35, ortho: false });
  }
  onNewModel: (() => void)[] = [];
  loadJSON(json: any) {
    this.model.load(json);
    this.activePath = [];
    this.updateContextName();
    this.resetHistory();
    this.clearSelection();
    this.ui.saved = true;
    this.invalidate();
    this.zoomExtents(false);
  }

  invalidate() {
    this.dirty = true;
    this.selDirty = true;
    this.ui.revision++;
  }
  redraw() {
    this.viewer.needsRender = true;
  }

  private frame() {
    if (this.dirty) {
      this.dirty = false;
      this.selDirty = false;
      this.pruneSelection();
      this.viewer.rebuild(this.viewState());
    } else if (this.selDirty) {
      this.selDirty = false;
      this.viewer.rebuildHighlight(this.viewState());
    }
  }
  private viewState() {
    return { activePath: this.activePath, selection: this.selection, hover: this.hover };
  }

  // ------------------------------------------------------------ tools
  setTool(id: string) {
    const tool = this.tools.get(id);
    if (!tool) {
      return;
    }
    if (this.tool) {
      this.tool.cancel();
      this.tool.deactivate();
    }
    this.tool = tool;
    this.ui.tool = id;
    if (!MAIN_TOOLS.includes(id) && !['place', 'zoomwindow', 'poscam', 'lookaround', 'walk', 'zoom'].includes(id)) {
      this.ui.recentTools = [id, ...this.ui.recentTools.filter((x) => x !== id)].slice(0, 3);
    }
    this.ui.vcbValue = '';
    this.ui.vcbLabel = tool.vcbLabel;
    this.infer?.reset();
    this.setHover(null);
    tool.activate();
    this.refreshStatus();
    this.onToolChange.forEach((listener) => listener());
    this.redraw();
  }
  refreshStatus() {
    if (this.tool) {
      this.ui.status = this.tool.status();
      this.ui.vcbLabel = this.tool.vcbLabel;
    }
  }
  setVcb(value: string, label?: string) {
    if (!this.ui.vcbEditing) {
      this.ui.vcbValue = value;
    }
    if (label != null) {
      this.ui.vcbLabel = label;
    }
  }
  fmt(value: number) {
    return formatLength(value, this.model.settings.units, this.model.settings.precision);
  }
  fmtArea(value: number) {
    return formatArea(value, this.model.settings.units, this.model.settings.precision);
  }
  toast(msg: string) {
    this.ui.toast = msg;
    clearTimeout((this as any)._tt);
    (this as any)._tt = setTimeout(() => (this.ui.toast = ''), 2600);
  }

  submitVcb(text: string) {
    this.ui.vcbEditing = false;
    // Arabic-Indic digits, "٫", "؛" and translated unit symbols → what the tools parse
    const ok = this.tool.onVcb(normalizeNumberInput(text).trim());
    if (!ok) {
      this.toast(t('editor.invalidVcb'));
    }
    this.redraw();
  }

  // ------------------------------------------------------------ input
  private lastDown = { t: 0, x: 0, y: 0 };
  pointerDown(pointer: PEvt) {
    if (pointer.button === 1 || (pointer.button === 0 && this.ui.tool === 'orbit' && false)) {
      const faceHit = this.viewer.pickFace(pointer.x, pointer.y);
      this.nav = { mode: pointer.shift ? 'pan' : 'orbit', x: pointer.x, y: pointer.y, pivot: faceHit ? faceHit.point : null };
      return;
    }
    if (pointer.button === 2) {
      return;
    }
    this.tool.onDown(pointer);
    this.refreshStatus();
    this.redraw();
  }
  pointerMove(pointer: PEvt) {
    this.mouse.x = pointer.x;
    this.mouse.y = pointer.y;
    this.mouse.inside = true;
    if (this.nav) {
      const deltaX = pointer.x - this.nav.x,
        deltaY = pointer.y - this.nav.y;
      this.nav.x = pointer.x;
      this.nav.y = pointer.y;
      if (this.nav.mode === 'orbit' && !pointer.shift) {
        this.viewer.rig.orbit(deltaX, deltaY, this.nav.pivot ?? undefined);
      } else {
        this.viewer.rig.pan(deltaX, deltaY, this.viewer.height, this.nav.pivot ?? undefined);
      }
      return;
    }
    this.tool.onMove(pointer);
    this.redraw();
  }
  pointerUp(pointer: PEvt) {
    if (this.nav && pointer.button === 1) {
      this.nav = null;
      return;
    }
    if (pointer.button !== 0) {
      return;
    }
    this.tool.onUp(pointer);
    this.refreshStatus();
    this.redraw();
  }
  dblClick(pointer: PEvt) {
    if (pointer.button === 0) {
      this.tool.onDblClick(pointer);
      this.refreshStatus();
      this.redraw();
    }
  }
  private gesture: { pivot: THREE.Vector3 | null; time: number } | null = null;
  /** Wheel / trackpad gestures: zoom, orbit or pan depending on device and Shift/Ctrl (see navigation.ts). */
  wheel(x: number, y: number, wheelEvent: { deltaX: number; deltaY: number; shift: boolean; ctrl: boolean; mode: number }) {
    const unit = wheelEvent.mode === 1 ? 16 : wheelEvent.mode === 2 ? this.viewer.height : 1;
    let deltaX = wheelEvent.deltaX * unit,
      deltaY = wheelEvent.deltaY * unit;
    // browsers turn Shift+wheel into a horizontal scroll on mouse wheels
    if (wheelEvent.shift && nav.device === 'mouse' && deltaY === 0) {
      deltaY = deltaX;
      deltaX = 0;
    }
    const action = wheelAction(wheelEvent.shift, wheelEvent.ctrl);
    const now = performance.now();
    if (!this.gesture || now - this.gesture.time > 250) {
      this.gesture = { pivot: this.pivotAt(x, y), time: now };
    }
    this.gesture.time = now;
    const rig = this.viewer.rig;
    const sens = nav.sensitivity[action];
    const inv = nav.invert[action] ? -1 : 1;
    if (action === 'zoom') {
      // pinch deltas are small, wheel notches are ~100px
      const speed = nav.device === 'trackpad' ? (wheelEvent.ctrl ? 0.012 : 0.004) : 0.0016;
      rig.zoomAt(this.pivotAt(x, y), Math.exp(THREE.MathUtils.clamp(deltaY * speed * sens * inv, -0.6, 0.6)));
    } else if (action === 'orbit') {
      const k = (nav.device === 'mouse' ? 0.35 : 0.8) * sens * inv;
      rig.orbit(deltaX * k, deltaY * k, this.gesture.pivot ?? undefined);
    } else {
      const k = (nav.device === 'mouse' ? 0.6 : 1) * sens * inv;
      rig.pan(-deltaX * k, -deltaY * k, this.viewer.height, this.gesture.pivot ?? undefined);
    }
  }
  /** Point under the cursor (face hit, else ground plane, else target distance). */
  pivotAt(x: number, y: number): THREE.Vector3 {
    const faceHit = this.viewer.pickFace(x, y);
    if (faceHit) {
      return faceHit.point;
    }
    const ray = this.viewer.ray(x, y);
    const distance = this.viewer.rig.position.distanceTo(this.viewer.rig.target);
    const groundPoint = ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3());
    return groundPoint && groundPoint.distanceTo(ray.origin) < distance * 8 ? groundPoint : ray.at(distance, new THREE.Vector3());
  }

  zoomExtents(animate = true) {
    this.viewer.rig.zoomExtents(this.model.bounds(), animate);
  }

  // ------------------------------------------------------------ overlay
  private drawOverlay(overlay: Overlay) {
    // open-group bounding box (dashed)
    if (this.activePath.length) {
      const inst = this.activePath[this.activePath.length - 1];
      const parent = new THREE.Matrix4();
      for (const instance of this.activePath.slice(0, -1)) {
        parent.multiply(instance.matrix);
      }
      const box = inst.definition.entities.bounds(new THREE.Box3());
      if (!box.isEmpty()) {
        const matrix = parent.clone().multiply(inst.matrix);
        const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
          new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(
            matrix,
          ),
        );
        const boxEdges = [
          [0, 1],
          [1, 3],
          [3, 2],
          [2, 0],
          [4, 5],
          [5, 7],
          [7, 6],
          [6, 4],
          [0, 4],
          [1, 5],
          [2, 6],
          [3, 7],
        ];
        for (const [fromIndex, toIndex] of boxEdges) {
          overlay.line(corners[fromIndex], corners[toIndex], '#555', 1, [4, 3]);
        }
      }
    }
    // guide points
    if (this.model.settings.guides) {
      for (const guide of this.model.guides) {
        if (guide.kind === 'point') {
          overlay.marker(guide.point, 'guide');
        }
      }
    }
    // dimensions & labels
    for (const dimension of this.model.dimensions) {
      this.drawDimension(overlay, dimension.start, dimension.end, dimension.offset);
    }
    for (const label of this.model.labels) {
      const tip = label.point,
        anchor = label.point.clone().add(label.offset);
      overlay.line(tip, anchor, '#000', 1);
      const tipScreen = overlay.screen(tip);
      if (tipScreen) {
        overlay.context.fillStyle = '#000';
        overlay.context.beginPath();
        overlay.context.arc(tipScreen.x, tipScreen.y, 2, 0, 7);
        overlay.context.fill();
      }
      overlay.text(anchor, label.text, { background: '#ffffffd9', align: 'left', offsetX: 4 });
    }
    // section planes
    if (this.model.settings.sectionPlanes) {
      for (const section of this.model.sections) {
        this.drawSection(overlay, section.point, section.normal, section.active);
      }
    }
    this.tool.draw(overlay);
  }

  drawDimension(overlay: Overlay, start: THREE.Vector3, end: THREE.Vector3, off: THREE.Vector3) {
    const offsetStart = start.clone().add(off),
      offsetEnd = end.clone().add(off);
    overlay.line(start, offsetStart, '#000', 1);
    overlay.line(end, offsetEnd, '#000', 1);
    overlay.line(offsetStart, offsetEnd, '#000', 1);
    const screenStart = overlay.screen(offsetStart),
      screenEnd = overlay.screen(offsetEnd);
    if (screenStart && screenEnd) {
      const context = overlay.context;
      const direction = screenEnd.clone().sub(screenStart).normalize().multiplyScalar(9);
      const normal = new THREE.Vector2(-direction.y, direction.x).multiplyScalar(0.35);
      context.fillStyle = '#000';
      for (const [tip, sign] of [
        [screenStart, 1],
        [screenEnd, -1],
      ] as const) {
        context.beginPath();
        context.moveTo(tip.x, tip.y);
        context.lineTo(tip.x + direction.x * sign + normal.x, tip.y + direction.y * sign + normal.y);
        context.lineTo(tip.x + direction.x * sign - normal.x, tip.y + direction.y * sign - normal.y);
        context.closePath();
        context.fill();
      }
    }
    overlay.text(offsetStart.clone().add(offsetEnd).multiplyScalar(0.5), this.fmt(start.distanceTo(end)), { background: '#ffffffe6' });
  }

  drawSection(overlay: Overlay, planePoint: THREE.Vector3, planeNormal: THREE.Vector3, active: boolean) {
    const size = this.viewer.worldPerPixel(planePoint) * 60;
    const basisU =
      Math.abs(planeNormal.z) < 0.9
        ? new THREE.Vector3(0, 0, 1).cross(planeNormal).normalize()
        : new THREE.Vector3(1, 0, 0).cross(planeNormal).normalize();
    const basisV = planeNormal.clone().cross(basisU).normalize();
    const scales = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([x, y]) =>
      planePoint
        .clone()
        .addScaledVector(basisU, x * size)
        .addScaledVector(basisV, y * size),
    );
    overlay.fillPolygon(scales, active ? 'rgba(255,140,0,0.12)' : 'rgba(120,120,120,0.08)');
    overlay.polyline(scales, active ? '#e07000' : '#888', 1.5, true);
    for (const k of [0, 1, 2, 3]) {
      const corner = scales[k].clone().lerp(planePoint, 0.15);
      overlay.line(corner, corner.clone().addScaledVector(planeNormal, size * 0.35), active ? '#e07000' : '#888', 1.5);
    }
  }

  // ------------------------------------------------------------ status helpers
  selectionSummary(): string {
    const entityRefs = this.selected();
    if (!entityRefs.length) {
      return t('editor.noSelection');
    }
    const counts = { face: 0, edge: 0, instance: 0 };
    entityRefs.forEach((entityRef) => counts[entityRef.kind]++);
    const parts: string[] = [];
    if (counts.face) {
      parts.push(t('editor.faces', { count: counts.face }));
    }
    if (counts.edge) {
      parts.push(t('editor.edges', { count: counts.edge }));
    }
    if (counts.instance) {
      parts.push(t('editor.instances', { count: counts.instance }));
    }
    return parts.join(', ');
  }
}

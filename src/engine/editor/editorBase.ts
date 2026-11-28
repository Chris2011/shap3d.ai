import { reactive, markRaw } from 'vue';
import { Model } from '../../core/document';
import type { Entities, EntityRef, Instance } from '../../core/model';
import { formatArea, formatLength } from '../../core/units';
import { applyDrawingAxes } from '../drawingAxes';
import type { InferenceEngine } from '../inference';
import type { Viewer } from '../viewer';
import type { Tool, UiState } from './tool';

/**
 * The editor's state – the model, the view, the tools, the open group and the selection – with what every other part
 * needs: the view brought up to date, lengths formatted, short messages. The editor is a chain of classes, one job
 * each: EditorBase → EditorContext → EditorTools → EditorHistory → EditorAnnotations → EditorInput → EditorView → Editor.
 */
export abstract class EditorBase {
  /** the text, dimension or guide selected with the Select tool, null = none */
  selectedAnnotation: number | null = null;
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
  protected dirty = true;
  protected selDirty = true;
  clipboard: any = null;
  lastPushPull = 0;
  lastOffset = 0;
  onToolChange: (() => void)[] = [];
  /**
   * run at the end of every undo step, still inside it – what they change is undone with the step (e.g. plugins
   * answering changed plugin data)
   */
  settling: (() => void)[] = [];
  onNewModel: (() => void)[] = [];

  constructor() {
    (this as any).model = markRaw(this.model);
  }

  get entities(): Entities {
    return this.activePath.length ? this.activePath[this.activePath.length - 1].definition.entities : this.model.root;
  }

  invalidate() {
    this.dirty = true;
    this.selDirty = true;
    this.ui.revision++;
  }
  redraw() {
    this.viewer.needsRender = true;
  }

  /** brings pending model changes into the view – every frame, and before a picture is taken of it */
  frame() {
    if (this.dirty) {
      this.dirty = false;
      this.selDirty = false;
      this.pruneSelection();
      applyDrawingAxes(this.model.settings);
      this.viewer.rebuild(this.viewState());
    } else if (this.selDirty) {
      this.selDirty = false;
      this.viewer.rebuildHighlight(this.viewState());
    }
  }
  private viewState() {
    return { activePath: this.activePath, selection: this.selection, hover: this.hover };
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
    this.selectedAnnotation = null;
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
}

// The Eraser: drag over edges, groups, texts, dimensions and guides – they are marked and go when the button is let go
// (Shift hides, Ctrl softens, Ctrl+Shift unsoftens edges instead).
import { Tool, type PEvt } from '../engine/editor';
import type { Overlay } from '../engine/overlay';
import type { EntityRef } from '../core/model';
import { drawSelectedGuide } from '../engine/guidePick';
import { t } from '../i18n';
import { visibleEdge } from './select';

type Point = { x: number; y: number };

/** a fast drag jumps many pixels between two events – the way in between is looked at in steps this big */
const STEP_PX = 3;
/** but not more often than this per event, so a huge jump stays quick */
const MAX_STEPS = 60;

export class EraserTool extends Tool {
  id = 'eraser';
  name = 'tools.eraser';
  cursor = 'crosshair';
  marked = new Map<string, EntityRef>();
  /** texts, dimensions and guides crossed while dragging */
  markedAnnotations = new Set<number>();
  active = false;
  mods = { shift: false, ctrl: false };
  private last: Point | null = null;
  status() {
    return t('tools.status.eraser');
  }
  /** the edge, or the group or component, under a screen point */
  mark(pointer: Point) {
    const editor = this.editor;
    const edgeHit = editor.viewer.pickEdge(pointer.x, pointer.y, 6, visibleEdge(editor));
    let picked: EntityRef | null = null;
    if (edgeHit) {
      picked = editor.refFromPick(edgeHit.rec.context.path, 'edge', edgeHit.rec.edgeId);
    }
    if (!picked) {
      const faceHit = editor.viewer.pickFace(pointer.x, pointer.y);
      if (faceHit) {
        const entityRef = editor.refFromPick(faceHit.context.path, 'face', faceHit.faceId);
        if (entityRef?.kind === 'instance') {
          picked = entityRef;
        }
      }
    }
    return picked;
  }
  /** marks what lies under one point; texts, dimensions and guides only when erasing (not hiding or softening) */
  private markAt(point: Point) {
    const editor = this.editor;
    const annotation = this.mods.shift || this.mods.ctrl ? null : editor.pickAnnotation(point.x, point.y);
    if (annotation !== null) {
      this.markedAnnotations.add(annotation);
      return;
    }
    const entityRef = this.mark(point);
    if (entityRef) {
      this.marked.set(editor.key(entityRef), entityRef);
    }
  }
  /** everything along the way from the last point to this one */
  private markAlong(to: Point) {
    const from = this.last ?? to;
    const steps = Math.min(MAX_STEPS, Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.y - from.y) / STEP_PX)));
    for (let step = 1; step <= steps; step++) {
      this.markAt({ x: from.x + ((to.x - from.x) * step) / steps, y: from.y + ((to.y - from.y) * step) / steps });
    }
    this.last = { x: to.x, y: to.y };
  }
  onDown(pointer: PEvt) {
    this.active = true;
    this.mods = { shift: pointer.shift, ctrl: pointer.ctrl };
    this.marked.clear();
    this.markedAnnotations.clear();
    this.last = null;
    this.markAlong(pointer);
    this.sync();
  }
  onMove(pointer: PEvt) {
    if (this.active) {
      this.markAlong(pointer);
      this.sync();
    } else {
      this.editor.setHover(this.mark(pointer));
    }
  }
  sync() {
    const editor = this.editor;
    editor.selection.clear();
    for (const [key, entityRef] of this.marked) {
      editor.selection.set(key, entityRef);
    }
    editor.selectionChanged();
  }
  onUp() {
    const editor = this.editor;
    this.active = false;
    this.last = null;
    const refs = [...this.marked.values()];
    const annotations = new Set(this.markedAnnotations);
    this.marked.clear();
    this.markedAnnotations.clear();
    editor.clearSelection();
    if (!refs.length && !annotations.size) {
      return;
    }
    if (this.mods.ctrl) {
      editor.commit('commands.soften', () => {
        for (const entityRef of refs) {
          const edge = entityRef.kind === 'edge' ? editor.entities.edges.get(entityRef.id) : undefined;
          if (edge) {
            edge.soft = !this.mods.shift;
          }
        }
      });
      return;
    }
    if (this.mods.shift) {
      editor.commit('commands.hide', () => {
        for (const entityRef of refs) {
          const item = entityRef.kind === 'edge' ? editor.entities.edges.get(entityRef.id) : editor.entities.instances.get(entityRef.id);
          if (item && entityRef.kind !== 'face') {
            item.hidden = true;
          }
        }
      });
      return;
    }
    editor.commit('commands.delete', () => {
      for (const entityRef of refs) {
        if (entityRef.kind === 'edge') {
          editor.entities.eraseEdge(entityRef.id, true);
        } else if (entityRef.kind === 'instance') {
          editor.entities.instances.delete(entityRef.id);
        }
      }
      editor.entities.removeOrphanVertices();
      const model = editor.model;
      model.labels = model.labels.filter((label) => !annotations.has(label.id));
      model.dimensions = model.dimensions.filter((dimension) => !annotations.has(dimension.id));
      model.guides = model.guides.filter((guide) => !annotations.has(guide.id));
    });
    editor.selectedAnnotation = null;
  }
  busy() {
    return this.active;
  }
  cancel() {
    this.active = false;
    this.last = null;
    this.marked.clear();
    this.markedAnnotations.clear();
  }
  /** marked guides in the selection colour – edges and groups show as the selection */
  draw(overlay: Overlay) {
    for (const id of this.markedAnnotations) {
      drawSelectedGuide(overlay, this.editor.model.guides, id);
    }
  }
}

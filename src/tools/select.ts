import * as THREE from 'three';
import { Tool, type PEvt, type Editor } from '../engine/editor';
import type { Overlay } from '../engine/overlay';
import type { EntityRef, Entities } from '../core/model';

/** Pick the most specific entity under the cursor and map it into the active context. */
export const pickRef = (editor: Editor, x: number, y: number): { ref: EntityRef | null; outside: boolean } => {
  const edgeHit = editor.viewer.pickEdge(x, y, 5);
  const faceHit = editor.viewer.pickFace(x, y);
  // prefer edge if it's in front or no face
  if (edgeHit) { const entityRef = editor.refFromPick(edgeHit.rec.context.path, 'edge', edgeHit.rec.edgeId); if (entityRef) return { ref: entityRef, outside: false }; }
  if (faceHit) { const entityRef = editor.refFromPick(faceHit.context.path, 'face', faceHit.faceId); return { ref: entityRef, outside: !entityRef }; }
  if (edgeHit) return { ref: null, outside: true };
  return { ref: null, outside: true };
};

const segIntersectsRect = (startX: number, startY: number, endX: number, endY: number, minX: number, minY: number, maxX: number, maxY: number) => {
  const inside = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY;
  if (inside(startX, startY) || inside(endX, endY)) return true;
  const segs = [[minX, minY, maxX, minY], [maxX, minY, maxX, maxY], [maxX, maxY, minX, maxY], [minX, maxY, minX, minY]];
  const cross = (pivot: number[], first: number[], second: number[]) => (first[0] - pivot[0]) * (second[1] - pivot[1]) - (first[1] - pivot[1]) * (second[0] - pivot[0]);
  for (const side of segs) {
    const segStart = [startX, startY], segEnd = [endX, endY], sideStart = [side[0], side[1]], sideEnd = [side[2], side[3]];
    const crossStart = cross(sideStart, sideEnd, segStart), crossEnd = cross(sideStart, sideEnd, segEnd), crossSideStart = cross(segStart, segEnd, sideStart), crossSideEnd = cross(segStart, segEnd, sideEnd);
    if (((crossStart > 0 && crossEnd < 0) || (crossStart < 0 && crossEnd > 0)) && ((crossSideStart > 0 && crossSideEnd < 0) || (crossSideStart < 0 && crossSideEnd > 0))) return true;
  }
  return false;
};

const pointInPoly = (x: number, y: number, poly: { x: number; y: number }[]) => {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const current = poly[i], previous = poly[j];
    if (((current.y > y) !== (previous.y > y)) && (x < (previous.x - current.x) * (y - current.y) / (previous.y - current.y) + current.x)) inside = !inside;
  }
  return inside;
};

/** Entities of the context whose projected points pass a test. */
const regionSelect = (editor: Editor, test: (pts: { x: number; y: number }[], segs: [{ x: number; y: number }, { x: number; y: number }][]) => boolean): EntityRef[] => {
  const ents = editor.entities; const matrix = editor.contextMatrix; const viewer = editor.viewer;
  const proj = new Map<number, { x: number; y: number }>();
  const screenOf = (vertexId: number) => { let cached = proj.get(vertexId); if (!cached) { const projected = viewer.project(ents.positionOf(vertexId).clone().applyMatrix4(matrix)); cached = { x: projected.x, y: projected.y }; proj.set(vertexId, cached); } return cached; };
  const hidden = editor.model.hiddenTags();
  const out: EntityRef[] = [];
  for (const edge of ents.edges.values()) { if (edge.hidden || (edge.tag && hidden.has(edge.tag))) continue; const start = screenOf(edge.start), end = screenOf(edge.end); if (test([start, end], [[start, end]])) out.push({ kind: 'edge', id: edge.id }); }
  for (const face of ents.faces.values()) { if (face.hidden || (face.tag && hidden.has(face.tag))) continue; const pts = ents.faceVertices(face).map(screenOf); const segs = ents.faceEdges(face).map(edge => [screenOf(edge.start), screenOf(edge.end)] as [any, any]); if (test(pts, segs)) out.push({ kind: 'face', id: face.id }); }
  for (const instance of ents.instances.values()) {
    if (instance.hidden || (instance.tag && hidden.has(instance.tag))) continue;
    const box = instance.definition.entities.bounds(new THREE.Box3(), matrix.clone().multiply(instance.matrix)); if (box.isEmpty()) continue;
    const corners = [0, 1, 2, 3, 4, 5, 6, 7].map(k => { const projected = viewer.project(new THREE.Vector3(k & 1 ? box.max.x : box.min.x, k & 2 ? box.max.y : box.min.y, k & 4 ? box.max.z : box.min.z)); return { x: projected.x, y: projected.y }; });
    const boxEdges = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]].map(([fromIndex, toIndex]) => [corners[fromIndex], corners[toIndex]] as [any, any]);
    if (test(corners, boxEdges)) out.push({ kind: 'instance', id: instance.id });
  }
  return out;
};

const connected = (ents: Entities, start: EntityRef): EntityRef[] => {
  const faces = new Set<number>(), edges = new Set<number>();
  const stack: number[] = [];
  if (start.kind === 'edge') { const edge = ents.edges.get(start.id); if (edge) stack.push(edge.start, edge.end); }
  if (start.kind === 'face') { const face = ents.faces.get(start.id); if (face) stack.push(...ents.faceVertices(face)); }
  const seenV = new Set<number>();
  while (stack.length) {
    const vertex = stack.pop()!; if (seenV.has(vertex)) continue; seenV.add(vertex);
    for (const edge of ents.edgesOfVertex(vertex)) { if (!edges.has(edge.id)) { edges.add(edge.id); stack.push(edge.start, edge.end); } for (const face of ents.facesOfEdge(edge.id)) faces.add(face.id); }
  }
  return [...[...faces].map(id => ({ kind: 'face' as const, id })), ...[...edges].map(id => ({ kind: 'edge' as const, id }))];
};

export const bounding = (editor: Editor, entityRef: EntityRef): EntityRef[] => {
  const ents = editor.entities;
  if (entityRef.kind === 'face') { const face = ents.faces.get(entityRef.id); return face ? [entityRef, ...ents.faceEdges(face).map(edge => ({ kind: 'edge' as const, id: edge.id }))] : [entityRef]; }
  if (entityRef.kind === 'edge') return [entityRef, ...ents.facesOfEdge(entityRef.id).map(face => ({ kind: 'face' as const, id: face.id }))];
  return [entityRef];
};

// ===================================================================== Select
export class SelectTool extends Tool {
  id = 'select'; name = 'Auswählen'; cursor = 'default';
  drag: { startX: number; startY: number; endX: number; endY: number } | null = null; down: { x: number; y: number; shift: boolean; ctrl: boolean } | null = null;
  clickCount = 0; lastClick = 0;
  status() { return 'Klicken oder Ziehen, um Objekte auszuwählen. Umschalttaste = Hinzufügen/Entfernen. Strg-Taste = Hinzufügen. Umschalttaste + Strg = Entfernen.'; }
  mode(modifiers: { shift: boolean; ctrl: boolean }): 'set' | 'add' | 'toggle' | 'remove' { return modifiers.shift && modifiers.ctrl ? 'remove' : modifiers.shift ? 'toggle' : modifiers.ctrl ? 'add' : 'set'; }
  onDown(pointer: PEvt) { this.down = { x: pointer.x, y: pointer.y, shift: pointer.shift, ctrl: pointer.ctrl }; }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    if (this.down) {
      if (this.drag || Math.hypot(pointer.x - this.down.x, pointer.y - this.down.y) > 4) { this.drag = { startX: this.down.x, startY: this.down.y, endX: pointer.x, endY: pointer.y }; editor.setHover(null); }
      return;
    }
    // SketchUp Web shows no pre-selection highlight for the select tool
  }
  onUp(pointer: PEvt) {
    const editor = this.editor;
    if (this.drag) {
      const { startX: startX, startY: startY, endX: endX, endY: endY } = this.drag; const window = endX >= startX;
      const minX = Math.min(startX, endX), maxX = Math.max(startX, endX), minY = Math.min(startY, endY), maxY = Math.max(startY, endY);
      const inside = (point: { x: number; y: number }) => point.x >= minX && point.x <= maxX && point.y >= minY && point.y <= maxY;
      const refs = regionSelect(editor, (pts, segs) => window ? pts.every(inside) : (pts.some(inside) || segs.some(([start, end]) => segIntersectsRect(start.x, start.y, end.x, end.y, minX, minY, maxX, maxY))));
      editor.select(refs, this.mode(this.down!));
      this.drag = null; this.down = null; return;
    }
    const now = performance.now();
    this.clickCount = now - this.lastClick < 380 ? this.clickCount + 1 : 1; this.lastClick = now;
    const selectMode = this.mode(this.down ?? pointer); this.down = null;
    const { ref, outside } = pickRef(editor, pointer.x, pointer.y);
    if (!ref) {
      if (outside && editor.activePath.length && selectMode === 'set') { editor.exitContext(); return; }
      if (selectMode === 'set') editor.clearSelection();
      return;
    }
    if (this.clickCount === 3) { editor.select(ref.kind === 'instance' ? [ref] : connected(editor.entities, ref), selectMode === 'set' ? 'set' : 'add'); return; }
    if (this.clickCount === 2) {
      if (ref.kind === 'instance') { const instance = editor.entities.instances.get(ref.id); if (instance && !instance.locked) { editor.enterInstance(instance); } else if (instance?.locked) editor.toast('Gesperrt'); return; }
      editor.select(bounding(editor, ref), selectMode === 'set' ? 'set' : 'add'); return;
    }
    editor.select([ref], selectMode);
  }
  cancel() { this.drag = null; this.down = null; }
  draw(overlay: Overlay) { if (this.drag) overlay.rect2D(this.drag.startX, this.drag.startY, this.drag.endX, this.drag.endY, this.drag.endX < this.drag.startX); }
}

// ===================================================================== Lasso
export class LassoTool extends Tool {
  id = 'lasso'; name = 'Lasso'; cursor = 'crosshair';
  pts: { x: number; y: number }[] = []; mods = { shift: false, ctrl: false };
  status() { return 'Ziehen Sie eine Schleife um Objekte. Im Uhrzeigersinn = vollständig enthalten, gegen den Uhrzeigersinn = berührt.'; }
  onDown(pointer: PEvt) { this.pts = [{ x: pointer.x, y: pointer.y }]; this.mods = { shift: pointer.shift, ctrl: pointer.ctrl }; }
  onMove(pointer: PEvt) { if (this.pts.length) this.pts.push({ x: pointer.x, y: pointer.y }); }
  onUp() {
    const editor = this.editor; const poly = this.pts; this.pts = [];
    if (poly.length < 3) return;
    let area = 0; for (let i = 0; i < poly.length; i++) { const current = poly[i], next = poly[(i + 1) % poly.length]; area += current.x * next.y - next.x * current.y; }
    const window = area > 0; // clockwise on screen (y down)
    const refs = regionSelect(editor, (pts) => window ? pts.every(point => pointInPoly(point.x, point.y, poly)) : pts.some(point => pointInPoly(point.x, point.y, poly)));
    editor.select(refs, this.mods.shift && this.mods.ctrl ? 'remove' : this.mods.shift ? 'toggle' : this.mods.ctrl ? 'add' : 'set');
  }
  cancel() { this.pts = []; }
  draw(overlay: Overlay) {
    if (this.pts.length < 2) return; const context = overlay.context; context.strokeStyle = '#000'; context.setLineDash([4, 3]); context.beginPath();
    this.pts.forEach((point, i) => (i ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y))); context.stroke(); context.setLineDash([]);
  }
}

// ===================================================================== Eraser
export class EraserTool extends Tool {
  id = 'eraser'; name = 'Radiergummi'; cursor = 'crosshair';
  marked = new Map<string, EntityRef>(); active = false; mods = { shift: false, ctrl: false };
  status() { return 'Klicken oder ziehen Sie über Kanten, um sie zu löschen. Umschalt = Ausblenden, Strg = Abmildern.'; }
  mark(pointer: PEvt) {
    const editor = this.editor; const edgeHit = editor.viewer.pickEdge(pointer.x, pointer.y, 6);
    let picked: EntityRef | null = null;
    if (edgeHit) picked = editor.refFromPick(edgeHit.rec.context.path, 'edge', edgeHit.rec.edgeId);
    if (!picked) { const faceHit = editor.viewer.pickFace(pointer.x, pointer.y); if (faceHit) { const entityRef = editor.refFromPick(faceHit.context.path, 'face', faceHit.faceId); if (entityRef?.kind === 'instance') picked = entityRef; } }
    return picked;
  }
  onDown(pointer: PEvt) { this.active = true; this.mods = { shift: pointer.shift, ctrl: pointer.ctrl }; this.marked.clear(); const entityRef = this.mark(pointer); if (entityRef) this.marked.set(this.editor.key(entityRef), entityRef); this.sync(); }
  onMove(pointer: PEvt) { const entityRef = this.mark(pointer); if (this.active) { if (entityRef) this.marked.set(this.editor.key(entityRef), entityRef); this.sync(); } else this.editor.setHover(entityRef); }
  sync() { const editor = this.editor; editor.selection.clear(); for (const [key, entityRef] of this.marked) editor.selection.set(key, entityRef); editor.selectionChanged(); }
  onUp() {
    const editor = this.editor; this.active = false; const refs = [...this.marked.values()]; this.marked.clear(); editor.clearSelection();
    if (!refs.length) return;
    if (this.mods.ctrl) { editor.commit('Abmildern', () => { for (const entityRef of refs) if (entityRef.kind === 'edge') { const edge = editor.entities.edges.get(entityRef.id); if (edge) edge.soft = !this.mods.shift; } }); return; }
    if (this.mods.shift) { editor.commit('Ausblenden', () => { for (const entityRef of refs) { if (entityRef.kind === 'edge') { const edge = editor.entities.edges.get(entityRef.id); if (edge) edge.hidden = true; } else if (entityRef.kind === 'instance') { const instance = editor.entities.instances.get(entityRef.id); if (instance) instance.hidden = true; } } }); return; }
    editor.commit('Löschen', () => {
      for (const entityRef of refs) { if (entityRef.kind === 'edge') editor.entities.eraseEdge(entityRef.id, true); else if (entityRef.kind === 'instance') editor.entities.instances.delete(entityRef.id); }
      editor.entities.removeOrphanVertices();
    });
  }
  cancel() { this.active = false; this.marked.clear(); }
}

// ===================================================================== Paint bucket
export class PaintTool extends Tool {
  id = 'paint'; name = 'Farbeimer'; cursor = 'crosshair';
  status() { const material = this.editor.ui.currentMaterial ?? 'Standard'; return `Material „${material}“: Klicken, um Flächen zu bemalen. Alt = Material aufnehmen, Strg = verbundene Flächen, Umschalt = alle passenden Flächen.`; }
  onMove(pointer: PEvt) { const faceHit = this.editor.viewer.pickFace(pointer.x, pointer.y); this.editor.setHover(faceHit ? this.editor.refFromPick(faceHit.context.path, 'face', faceHit.faceId) : null); }
  onDown(pointer: PEvt) {
    const editor = this.editor; const faceHit = editor.viewer.pickFace(pointer.x, pointer.y); if (!faceHit) return;
    const ref = editor.refFromPick(faceHit.context.path, 'face', faceHit.faceId); if (!ref) return;
    const ents = editor.entities; const mat = editor.ui.currentMaterial ?? undefined;
    if (pointer.alt) { // sample
      const material = ref.kind === 'face' ? ents.faces.get(ref.id)?.material : ents.instances.get(ref.id)?.material;
      editor.ui.currentMaterial = material ?? null; editor.refreshStatus(); return;
    }
    // back face clicked?
    const ray = editor.viewer.ray(pointer.x, pointer.y); const back = faceHit.normal.dot(ray.direction) > 0;
    editor.commit('Material', () => {
      const sel = editor.selected();
      const targets: EntityRef[] = sel.some(entityRef => editor.key(entityRef) === editor.key(ref)) ? sel : [ref];
      let faces = targets;
      if (ref.kind === 'face' && (pointer.ctrl || pointer.shift)) {
        const src = ents.faces.get(ref.id)!; const srcMat = src.material;
        const pool = pointer.shift ? [...ents.faces.values()] : connected(ents, ref).filter(entityRef => entityRef.kind === 'face').map(entityRef => ents.faces.get(entityRef.id)!);
        faces = pool.filter(face => face.material === srcMat).map(face => ({ kind: 'face' as const, id: face.id }));
      }
      for (const entityRef of faces) {
        if (entityRef.kind === 'face') { const face = ents.faces.get(entityRef.id); if (!face) continue; if (back && targets.length === 1 && !pointer.ctrl && !pointer.shift) face.backMaterial = mat; else face.material = mat; }
        if (entityRef.kind === 'instance') { const instance = ents.instances.get(entityRef.id); if (instance) instance.material = mat; }
      }
    });
  }
}

export class SampleTool extends Tool {
  id = 'sample'; name = 'Materialprobe entnehmen'; cursor = 'crosshair';
  status() { return 'Klicken Sie auf eine Fläche, um ihr Material aufzunehmen.'; }
  onDown(pointer: PEvt) {
    const editor = this.editor; const faceHit = editor.viewer.pickFace(pointer.x, pointer.y); if (!faceHit) return;
    const face = faceHit.context.entities.faces.get(faceHit.faceId); let material = face?.material;
    if (!material) for (let i = faceHit.context.path.length - 1; i >= 0 && !material; i--) material = faceHit.context.path[i].material;
    editor.ui.currentMaterial = material ?? null; editor.setTool('paint');
  }
}

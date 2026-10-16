import * as THREE from 'three';
import { Tool, type PEvt, type Editor } from '../engine/editor';
import type { Overlay } from '../engine/overlay';
import type { EntityRef, Entities } from '../core/model';

/** Pick the most specific entity under the cursor and map it into the active context. */
export function pickRef(ed: Editor, x: number, y: number): { ref: EntityRef | null; outside: boolean } {
  const eh = ed.viewer.pickEdge(x, y, 5);
  const fh = ed.viewer.pickFace(x, y);
  // prefer edge if it's in front or no face
  if (eh) { const r = ed.refFromPick(eh.rec.ctx.path, 'edge', eh.rec.eid); if (r) return { ref: r, outside: false }; }
  if (fh) { const r = ed.refFromPick(fh.ctx.path, 'face', fh.fid); return { ref: r, outside: !r }; }
  if (eh) return { ref: null, outside: true };
  return { ref: null, outside: true };
}

function segIntersectsRect(ax: number, ay: number, bx: number, by: number, x0: number, y0: number, x1: number, y1: number) {
  const inside = (x: number, y: number) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
  if (inside(ax, ay) || inside(bx, by)) return true;
  const segs = [[x0, y0, x1, y0], [x1, y0, x1, y1], [x1, y1, x0, y1], [x0, y1, x0, y0]];
  const cross = (p: number[], q: number[], r: number[]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  for (const s of segs) {
    const p1 = [ax, ay], p2 = [bx, by], p3 = [s[0], s[1]], p4 = [s[2], s[3]];
    const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
    if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  }
  return false;
}

function pointInPoly(x: number, y: number, poly: { x: number; y: number }[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (((a.y > y) !== (b.y > y)) && (x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x)) inside = !inside;
  }
  return inside;
}

/** Entities of the context whose projected points pass a test. */
function regionSelect(ed: Editor, test: (pts: { x: number; y: number }[], segs: [{ x: number; y: number }, { x: number; y: number }][]) => boolean): EntityRef[] {
  const ents = ed.entities; const M = ed.contextMatrix; const v = ed.viewer;
  const proj = new Map<number, { x: number; y: number }>();
  const P = (vid: number) => { let p = proj.get(vid); if (!p) { const r = v.project(ents.pos(vid).clone().applyMatrix4(M)); p = { x: r.x, y: r.y }; proj.set(vid, p); } return p; };
  const hidden = ed.model.hiddenTags();
  const out: EntityRef[] = [];
  for (const e of ents.edges.values()) { if (e.hidden || (e.tag && hidden.has(e.tag))) continue; const a = P(e.a), b = P(e.b); if (test([a, b], [[a, b]])) out.push({ kind: 'edge', id: e.id }); }
  for (const f of ents.faces.values()) { if (f.hidden || (f.tag && hidden.has(f.tag))) continue; const pts = ents.faceVertices(f).map(P); const segs = ents.faceEdges(f).map(e => [P(e.a), P(e.b)] as [any, any]); if (test(pts, segs)) out.push({ kind: 'face', id: f.id }); }
  for (const i of ents.instances.values()) {
    if (i.hidden || (i.tag && hidden.has(i.tag))) continue;
    const b = i.def.entities.bounds(new THREE.Box3(), M.clone().multiply(i.matrix)); if (b.isEmpty()) continue;
    const c = [0, 1, 2, 3, 4, 5, 6, 7].map(k => { const r = v.project(new THREE.Vector3(k & 1 ? b.max.x : b.min.x, k & 2 ? b.max.y : b.min.y, k & 4 ? b.max.z : b.min.z)); return { x: r.x, y: r.y }; });
    const E = [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]].map(([a, b2]) => [c[a], c[b2]] as [any, any]);
    if (test(c, E)) out.push({ kind: 'instance', id: i.id });
  }
  return out;
}

function connected(ents: Entities, start: EntityRef): EntityRef[] {
  const faces = new Set<number>(), edges = new Set<number>();
  const stack: number[] = [];
  if (start.kind === 'edge') { const e = ents.edges.get(start.id); if (e) stack.push(e.a, e.b); }
  if (start.kind === 'face') { const f = ents.faces.get(start.id); if (f) stack.push(...ents.faceVertices(f)); }
  const seenV = new Set<number>();
  while (stack.length) {
    const v = stack.pop()!; if (seenV.has(v)) continue; seenV.add(v);
    for (const e of ents.edgesOfVertex(v)) { if (!edges.has(e.id)) { edges.add(e.id); stack.push(e.a, e.b); } for (const f of ents.facesOfEdge(e.id)) faces.add(f.id); }
  }
  return [...[...faces].map(id => ({ kind: 'face' as const, id })), ...[...edges].map(id => ({ kind: 'edge' as const, id }))];
}

export function bounding(ed: Editor, r: EntityRef): EntityRef[] {
  const ents = ed.entities;
  if (r.kind === 'face') { const f = ents.faces.get(r.id); return f ? [r, ...ents.faceEdges(f).map(e => ({ kind: 'edge' as const, id: e.id }))] : [r]; }
  if (r.kind === 'edge') return [r, ...ents.facesOfEdge(r.id).map(f => ({ kind: 'face' as const, id: f.id }))];
  return [r];
}

// ===================================================================== Select
export class SelectTool extends Tool {
  id = 'select'; name = 'Auswählen'; cursor = 'default';
  drag: { x0: number; y0: number; x1: number; y1: number } | null = null; down: { x: number; y: number; shift: boolean; ctrl: boolean } | null = null;
  clickCount = 0; lastClick = 0;
  status() { return 'Klicken oder Ziehen, um Objekte auszuwählen. Umschalttaste = Hinzufügen/Entfernen. Strg-Taste = Hinzufügen. Umschalttaste + Strg = Entfernen.'; }
  mode(e: { shift: boolean; ctrl: boolean }): 'set' | 'add' | 'toggle' | 'remove' { return e.shift && e.ctrl ? 'remove' : e.shift ? 'toggle' : e.ctrl ? 'add' : 'set'; }
  onDown(e: PEvt) { this.down = { x: e.x, y: e.y, shift: e.shift, ctrl: e.ctrl }; }
  onMove(e: PEvt) {
    const ed = this.ed;
    if (this.down) {
      if (this.drag || Math.hypot(e.x - this.down.x, e.y - this.down.y) > 4) { this.drag = { x0: this.down.x, y0: this.down.y, x1: e.x, y1: e.y }; ed.setHover(null); }
      return;
    }
    // SketchUp Web shows no pre-selection highlight for the select tool
  }
  onUp(e: PEvt) {
    const ed = this.ed;
    if (this.drag) {
      const { x0, y0, x1, y1 } = this.drag; const window = x1 >= x0;
      const X0 = Math.min(x0, x1), X1 = Math.max(x0, x1), Y0 = Math.min(y0, y1), Y1 = Math.max(y0, y1);
      const inside = (p: { x: number; y: number }) => p.x >= X0 && p.x <= X1 && p.y >= Y0 && p.y <= Y1;
      const refs = regionSelect(ed, (pts, segs) => window ? pts.every(inside) : (pts.some(inside) || segs.some(([a, b]) => segIntersectsRect(a.x, a.y, b.x, b.y, X0, Y0, X1, Y1))));
      ed.select(refs, this.mode(this.down!));
      this.drag = null; this.down = null; return;
    }
    const now = performance.now();
    this.clickCount = now - this.lastClick < 380 ? this.clickCount + 1 : 1; this.lastClick = now;
    const m = this.mode(this.down ?? e); this.down = null;
    const { ref, outside } = pickRef(ed, e.x, e.y);
    if (!ref) {
      if (outside && ed.activePath.length && m === 'set') { ed.exitContext(); return; }
      if (m === 'set') ed.clearSelection();
      return;
    }
    if (this.clickCount === 3) { ed.select(ref.kind === 'instance' ? [ref] : connected(ed.entities, ref), m === 'set' ? 'set' : 'add'); return; }
    if (this.clickCount === 2) {
      if (ref.kind === 'instance') { const i = ed.entities.instances.get(ref.id); if (i && !i.locked) { ed.enterInstance(i); } else if (i?.locked) ed.toast('Gesperrt'); return; }
      ed.select(bounding(ed, ref), m === 'set' ? 'set' : 'add'); return;
    }
    ed.select([ref], m);
  }
  cancel() { this.drag = null; this.down = null; }
  draw(o: Overlay) { if (this.drag) o.rect2D(this.drag.x0, this.drag.y0, this.drag.x1, this.drag.y1, this.drag.x1 < this.drag.x0); }
}

// ===================================================================== Lasso
export class LassoTool extends Tool {
  id = 'lasso'; name = 'Lasso'; cursor = 'crosshair';
  pts: { x: number; y: number }[] = []; mods = { shift: false, ctrl: false };
  status() { return 'Ziehen Sie eine Schleife um Objekte. Im Uhrzeigersinn = vollständig enthalten, gegen den Uhrzeigersinn = berührt.'; }
  onDown(e: PEvt) { this.pts = [{ x: e.x, y: e.y }]; this.mods = { shift: e.shift, ctrl: e.ctrl }; }
  onMove(e: PEvt) { if (this.pts.length) this.pts.push({ x: e.x, y: e.y }); }
  onUp() {
    const ed = this.ed; const poly = this.pts; this.pts = [];
    if (poly.length < 3) return;
    let area = 0; for (let i = 0; i < poly.length; i++) { const a = poly[i], b = poly[(i + 1) % poly.length]; area += a.x * b.y - b.x * a.y; }
    const window = area > 0; // clockwise on screen (y down)
    const refs = regionSelect(ed, (pts) => window ? pts.every(p => pointInPoly(p.x, p.y, poly)) : pts.some(p => pointInPoly(p.x, p.y, poly)));
    ed.select(refs, this.mods.shift && this.mods.ctrl ? 'remove' : this.mods.shift ? 'toggle' : this.mods.ctrl ? 'add' : 'set');
  }
  cancel() { this.pts = []; }
  draw(o: Overlay) {
    if (this.pts.length < 2) return; const c = o.ctx; c.strokeStyle = '#000'; c.setLineDash([4, 3]); c.beginPath();
    this.pts.forEach((p, i) => (i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y))); c.stroke(); c.setLineDash([]);
  }
}

// ===================================================================== Eraser
export class EraserTool extends Tool {
  id = 'eraser'; name = 'Radiergummi'; cursor = 'crosshair';
  marked = new Map<string, EntityRef>(); active = false; mods = { shift: false, ctrl: false };
  status() { return 'Klicken oder ziehen Sie über Kanten, um sie zu löschen. Umschalt = Ausblenden, Strg = Abmildern.'; }
  mark(e: PEvt) {
    const ed = this.ed; const eh = ed.viewer.pickEdge(e.x, e.y, 6);
    let r: EntityRef | null = null;
    if (eh) r = ed.refFromPick(eh.rec.ctx.path, 'edge', eh.rec.eid);
    if (!r) { const fh = ed.viewer.pickFace(e.x, e.y); if (fh) { const rr = ed.refFromPick(fh.ctx.path, 'face', fh.fid); if (rr?.kind === 'instance') r = rr; } }
    return r;
  }
  onDown(e: PEvt) { this.active = true; this.mods = { shift: e.shift, ctrl: e.ctrl }; this.marked.clear(); const r = this.mark(e); if (r) this.marked.set(this.ed.key(r), r); this.sync(); }
  onMove(e: PEvt) { const r = this.mark(e); if (this.active) { if (r) this.marked.set(this.ed.key(r), r); this.sync(); } else this.ed.setHover(r); }
  sync() { const ed = this.ed; ed.selection.clear(); for (const [k, r] of this.marked) ed.selection.set(k, r); ed.selectionChanged(); }
  onUp() {
    const ed = this.ed; this.active = false; const refs = [...this.marked.values()]; this.marked.clear(); ed.clearSelection();
    if (!refs.length) return;
    if (this.mods.ctrl) { ed.commit('Abmildern', () => { for (const r of refs) if (r.kind === 'edge') { const e = ed.entities.edges.get(r.id); if (e) e.soft = !this.mods.shift; } }); return; }
    if (this.mods.shift) { ed.commit('Ausblenden', () => { for (const r of refs) { if (r.kind === 'edge') { const e = ed.entities.edges.get(r.id); if (e) e.hidden = true; } else if (r.kind === 'instance') { const i = ed.entities.instances.get(r.id); if (i) i.hidden = true; } } }); return; }
    ed.commit('Löschen', () => {
      for (const r of refs) { if (r.kind === 'edge') ed.entities.eraseEdge(r.id, true); else if (r.kind === 'instance') ed.entities.instances.delete(r.id); }
      ed.entities.removeOrphanVertices();
    });
  }
  cancel() { this.active = false; this.marked.clear(); }
}

// ===================================================================== Paint bucket
export class PaintTool extends Tool {
  id = 'paint'; name = 'Farbeimer'; cursor = 'crosshair';
  status() { const m = this.ed.ui.currentMaterial ?? 'Standard'; return `Material „${m}“: Klicken, um Flächen zu bemalen. Alt = Material aufnehmen, Strg = verbundene Flächen, Umschalt = alle passenden Flächen.`; }
  onMove(e: PEvt) { const fh = this.ed.viewer.pickFace(e.x, e.y); this.ed.setHover(fh ? this.ed.refFromPick(fh.ctx.path, 'face', fh.fid) : null); }
  onDown(e: PEvt) {
    const ed = this.ed; const fh = ed.viewer.pickFace(e.x, e.y); if (!fh) return;
    const ref = ed.refFromPick(fh.ctx.path, 'face', fh.fid); if (!ref) return;
    const ents = ed.entities; const mat = ed.ui.currentMaterial ?? undefined;
    if (e.alt) { // sample
      const m = ref.kind === 'face' ? ents.faces.get(ref.id)?.material : ents.instances.get(ref.id)?.material;
      ed.ui.currentMaterial = m ?? null; ed.refreshStatus(); return;
    }
    // back face clicked?
    const ray = ed.viewer.ray(e.x, e.y); const back = fh.normal.dot(ray.direction) > 0;
    ed.commit('Material', () => {
      const sel = ed.selected();
      const targets: EntityRef[] = sel.some(s => ed.key(s) === ed.key(ref)) ? sel : [ref];
      let faces = targets;
      if (ref.kind === 'face' && (e.ctrl || e.shift)) {
        const src = ents.faces.get(ref.id)!; const srcMat = src.material;
        const pool = e.shift ? [...ents.faces.values()] : connected(ents, ref).filter(r => r.kind === 'face').map(r => ents.faces.get(r.id)!);
        faces = pool.filter(f => f.material === srcMat).map(f => ({ kind: 'face' as const, id: f.id }));
      }
      for (const t of faces) {
        if (t.kind === 'face') { const f = ents.faces.get(t.id); if (!f) continue; if (back && targets.length === 1 && !e.ctrl && !e.shift) f.backMaterial = mat; else f.material = mat; }
        if (t.kind === 'instance') { const i = ents.instances.get(t.id); if (i) i.material = mat; }
      }
    });
  }
}

export class SampleTool extends Tool {
  id = 'sample'; name = 'Materialprobe entnehmen'; cursor = 'crosshair';
  status() { return 'Klicken Sie auf eine Fläche, um ihr Material aufzunehmen.'; }
  onDown(e: PEvt) {
    const ed = this.ed; const fh = ed.viewer.pickFace(e.x, e.y); if (!fh) return;
    const f = fh.ctx.entities.faces.get(fh.fid); let m = f?.material;
    if (!m) for (let i = fh.ctx.path.length - 1; i >= 0 && !m; i--) m = fh.ctx.path[i].material;
    ed.ui.currentMaterial = m ?? null; ed.setTool('paint');
  }
}

import * as THREE from 'three';
import type { PEvt } from '../engine/editor';
import type { Overlay } from '../engine/overlay';
import { PointTool } from './base';
import type { Definition } from '../core/model';
import { Entities } from '../core/model';
import { buildText, type FontName } from '../core/text3d';

/** Places a component definition at the clicked point (used by 3D text and the component browser). */
export class PlaceTool extends PointTool {
  id = 'place'; name = 'Platzieren'; cursor = 'crosshair';
  def: Definition | null = null; box = new THREE.Box3(); orient: 'auto' | 'flat' = 'auto'; rot = 0; material?: string;
  status() { return this.def ? `„${this.def.name}“ platzieren: Klicken Sie auf die Zielposition. Pfeiltasten drehen um 90°.` : 'Nichts zu platzieren.'; }
  start(def: Definition, material?: string) { this.def = def; this.material = material; this.box = def.entities.bounds(new THREE.Box3()); this.rot = 0; this.ed.setTool(this.id); }
  onKey(e: KeyboardEvent, d: boolean) { if (d && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { this.rot += e.key === 'ArrowLeft' ? 90 : -90; return true; } return false; }
  matrixAt(): THREE.Matrix4 {
    const r = this.inf; const p = r?.point.clone() ?? new THREE.Vector3();
    const m = new THREE.Matrix4().makeTranslation(p.x, p.y, p.z);
    // glue to faces: align component Z with the face normal
    if (r?.face && r.kind === 'face') {
      const n = r.face.normal.clone().normalize();
      if (Math.abs(n.z) < 0.999) {
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
        // for upright text on walls: rotate so local -Y faces outwards
        m.multiply(new THREE.Matrix4().makeRotationFromQuaternion(q));
      } else if (n.z < 0) m.multiply(new THREE.Matrix4().makeRotationX(Math.PI));
    }
    m.multiply(new THREE.Matrix4().makeRotationZ(this.rot * Math.PI / 180));
    return this.ed.contextInverse.multiply(m);
  }
  onMove(e: PEvt) { this.pick(e, null); }
  onDown(e: PEvt) {
    if (!this.def) return; this.pick(e, null);
    const ed = this.ed; const def = this.def; const m = this.matrixAt(); const mat = this.material;
    ed.commit('Platzieren', () => { const i = ed.entities.addInstance(def, m, ''); if (mat) i.material = mat; ed.select([{ kind: 'instance', id: i.id }]); });
    this.def = null; ed.setTool('select');
  }
  cancel() { if (this.def) { this.ed.model.purge(); } this.def = null; }
  draw(o: Overlay) {
    if (!this.def || this.box.isEmpty()) { this.drawInference(o); return; }
    const M = this.ed.contextMatrix.multiply(this.matrixAt()); const b = this.box;
    const c = [0, 1, 2, 3, 4, 5, 6, 7].map(i => new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z).applyMatrix4(M));
    for (const [i, j] of [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) o.line(c[i], c[j], '#1d4ed8', 1.2);
    // draw the definition's edges as preview
    const E = this.def.entities; let n = 0;
    for (const e of E.edges.values()) { if (n++ > 3000) break; if (e.soft) continue; o.line(E.pos(e.a).clone().applyMatrix4(M), E.pos(e.b).clone().applyMatrix4(M), '#333', 1); }
    this.drawInference(o, false);
  }
}

export interface Text3DOptions { text: string; font: FontName; size: number; depth: number; filled: boolean; upright: boolean; material?: string }

export function start3DText(ed: any, o: Text3DOptions) {
  const ents = new Entities();
  buildText(ents, o.text, { size: o.size, depth: o.filled ? o.depth : 0, font: o.font, filled: o.filled, upright: o.upright });
  if (o.material) for (const f of ents.faces.values()) f.material = o.material;
  const def = ed.model.newDefinition(`3D-Text „${o.text.slice(0, 20)}“`, true, ents);
  (ed.tools.get('place') as PlaceTool).start(def);
}

import * as THREE from 'three';
import { Tool, type PEvt } from '../engine/editor';
import type { Overlay } from '../engine/overlay';
import {
  terrainUi, session, openTerrain, applyTerrain, hitTerrain, toGrid, gridHeight, gridToWorld, dab, syncGeometry, pushUndo, undoStroke,
} from '../terrain/session';

const MODE_COLOR: Record<string, string> = { raise: '#2e9b4b', lower: '#c62828', smooth: '#1f6fbf', flatten: '#8a5300', rough: '#7b4bb3' };
const MODE_NAME: Record<string, string> = { raise: 'Anheben', lower: 'Absenken', smooth: 'Glätten', flatten: 'Ebnen', rough: 'Zerklüften' };

/** Sculpt brush for terrain ("Sandkiste"): hold the mouse to raise/lower, Shift inverts. */
export class TerrainTool extends Tool {
  id = 'terrain';
  name = 'Gelände';
  cursor = 'crosshair';
  private hit: THREE.Vector3 | null = null;
  private down = false;
  private shift = false;
  private target = 0;
  private last = 0;
  private raf = 0;
  private leaving = false;

  status() {
    if (!session()) return 'Gelände: Wähle ein Rechteck aus oder lege im Fenster ein neues Gelände an.';
    return `${MODE_NAME[terrainUi.brush.mode]} – Maustaste halten und ziehen · Umschalt: umkehren · [ ] Pinselgröße · Strg+Z: Pinselstrich zurück · Enter/Esc: Übernehmen`;
  }
  activate() { if (!session()) openTerrain(this.ed); }
  deactivate() {
    this.stop();
    // switching to another tool keeps the work: the terrain is applied
    if (session() && !this.leaving) { this.leaving = true; try { applyTerrain(false); } finally { this.leaving = false; } }
  }

  onMove(e: PEvt) { this.shift = e.shift; this.hit = hitTerrain(e.x, e.y); }
  onDown(e: PEvt) {
    if (e.button !== 0 || !session()) return;
    this.hit = hitTerrain(e.x, e.y); if (!this.hit) return;
    this.shift = e.shift; this.down = true;
    pushUndo();
    const g = toGrid(this.hit); this.target = gridHeight(g.x, g.y);
    this.last = performance.now();
    const loop = () => {
      if (!this.down) return;
      const now = performance.now(); const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      // the surface moves under the cursor – re-pick every frame
      const h = hitTerrain(this.ed.mouse.x, this.ed.mouse.y); if (h) this.hit = h;
      if (this.hit) { const p = toGrid(this.hit); if (dab(p.x, p.y, dt, this.shift, this.target)) syncGeometry(); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  onUp() { this.stop(); }
  private stop() { this.down = false; cancelAnimationFrame(this.raf); }
  busy() { return this.down; }
  cancel() { this.stop(); }

  onKey(e: KeyboardEvent, isDown: boolean): boolean {
    if (e.key === 'Shift') { this.shift = isDown; this.ed.redraw(); return false; }
    if (!isDown || !session()) return false;
    const b = terrainUi.brush;
    if (e.key === '[' || e.key === ']') { b.radius = +Math.max(0.2, b.radius * (e.key === ']' ? 1.2 : 1 / 1.2)).toFixed(2); this.ed.redraw(); return true; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { undoStroke(); return true; }
    if (e.key === 'Enter' || e.key === 'Escape') { applyTerrain(); return true; }
    const modes: Record<string, typeof b.mode> = { '1': 'raise', '2': 'lower', '3': 'smooth', '4': 'flatten', '5': 'rough' };
    if (modes[e.key]) { b.mode = modes[e.key]; this.ed.refreshStatus(); return true; }
    return false;
  }

  draw(o: Overlay) {
    if (!session() || !this.hit) return;
    const b = terrainUi.brush; const c = toGrid(this.hit);
    let mode = b.mode; if (this.shift && mode === 'raise') mode = 'lower'; else if (this.shift && mode === 'lower') mode = 'raise';
    const col = MODE_COLOR[mode];
    // brush ring follows the ground
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k < 48; k++) { const a = k / 48 * Math.PI * 2; const x = c.x + Math.cos(a) * b.radius, y = c.y + Math.sin(a) * b.radius; ring.push(gridToWorld(x, y, gridHeight(x, y) + 0.02)); }
    o.polyline(ring, col, 2, true);
    const inner: THREE.Vector3[] = [];
    for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2; const x = c.x + Math.cos(a) * b.radius * 0.5, y = c.y + Math.sin(a) * b.radius * 0.5; inner.push(gridToWorld(x, y, gridHeight(x, y) + 0.02)); }
    o.polyline(inner, col, 1, true, [3, 3]);
    const centre = gridToWorld(c.x, c.y, gridHeight(c.x, c.y));
    o.line(centre, centre.clone().add(new THREE.Vector3(0, 0, mode === 'lower' ? -b.radius * 0.4 : b.radius * 0.4)), col, 2);
    const s = o.screen(centre);
    if (s) o.tooltip(s.x, s.y, `${MODE_NAME[mode]} · Ø ${this.ed.fmt(b.radius * 2)} · Höhe ${this.ed.fmt(gridHeight(c.x, c.y))}`);
  }
}

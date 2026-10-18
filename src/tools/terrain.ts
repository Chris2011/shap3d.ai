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
  activate() { if (!session()) openTerrain(this.editor); }
  deactivate() {
    this.stop();
    // switching to another tool keeps the work: the terrain is applied
    if (session() && !this.leaving) { this.leaving = true; try { applyTerrain(false); } finally { this.leaving = false; } }
  }

  onMove(pointer: PEvt) { this.shift = pointer.shift; this.hit = hitTerrain(pointer.x, pointer.y); }
  onDown(pointer: PEvt) {
    if (pointer.button !== 0 || !session()) return;
    this.hit = hitTerrain(pointer.x, pointer.y); if (!this.hit) return;
    this.shift = pointer.shift; this.down = true;
    pushUndo();
    const startCell = toGrid(this.hit); this.target = gridHeight(startCell.x, startCell.y);
    this.last = performance.now();
    const loop = () => {
      if (!this.down) return;
      const now = performance.now(); const elapsed = Math.min(0.05, (now - this.last) / 1000); this.last = now;
      // the surface moves under the cursor – re-pick every frame
      const hit = hitTerrain(this.editor.mouse.x, this.editor.mouse.y); if (hit) this.hit = hit;
      if (this.hit) { const cell = toGrid(this.hit); if (dab(cell.x, cell.y, elapsed, this.shift, this.target)) syncGeometry(); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  onUp() { this.stop(); }
  private stop() { this.down = false; cancelAnimationFrame(this.raf); }
  busy() { return this.down; }
  cancel() { this.stop(); }

  onKey(keyEvent: KeyboardEvent, isDown: boolean): boolean {
    if (keyEvent.key === 'Shift') { this.shift = isDown; this.editor.redraw(); return false; }
    if (!isDown || !session()) return false;
    const brush = terrainUi.brush;
    if (keyEvent.key === '[' || keyEvent.key === ']') { brush.radius = +Math.max(0.2, brush.radius * (keyEvent.key === ']' ? 1.2 : 1 / 1.2)).toFixed(2); this.editor.redraw(); return true; }
    if ((keyEvent.ctrlKey || keyEvent.metaKey) && keyEvent.key.toLowerCase() === 'z') { undoStroke(); return true; }
    if (keyEvent.key === 'Enter' || keyEvent.key === 'Escape') { applyTerrain(); return true; }
    const modes: Record<string, typeof brush.mode> = { '1': 'raise', '2': 'lower', '3': 'smooth', '4': 'flatten', '5': 'rough' };
    if (modes[keyEvent.key]) { brush.mode = modes[keyEvent.key]; this.editor.refreshStatus(); return true; }
    return false;
  }

  draw(overlay: Overlay) {
    if (!session() || !this.hit) return;
    const brush = terrainUi.brush; const center = toGrid(this.hit);
    let mode = brush.mode; if (this.shift && mode === 'raise') mode = 'lower'; else if (this.shift && mode === 'lower') mode = 'raise';
    const col = MODE_COLOR[mode];
    // brush ring follows the ground
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k < 48; k++) { const angle = k / 48 * Math.PI * 2; const x = center.x + Math.cos(angle) * brush.radius, y = center.y + Math.sin(angle) * brush.radius; ring.push(gridToWorld(x, y, gridHeight(x, y) + 0.02)); }
    overlay.polyline(ring, col, 2, true);
    const inner: THREE.Vector3[] = [];
    for (let k = 0; k < 24; k++) { const angle = k / 24 * Math.PI * 2; const x = center.x + Math.cos(angle) * brush.radius * 0.5, y = center.y + Math.sin(angle) * brush.radius * 0.5; inner.push(gridToWorld(x, y, gridHeight(x, y) + 0.02)); }
    overlay.polyline(inner, col, 1, true, [3, 3]);
    const centre = gridToWorld(center.x, center.y, gridHeight(center.x, center.y));
    overlay.line(centre, centre.clone().add(new THREE.Vector3(0, 0, mode === 'lower' ? -brush.radius * 0.4 : brush.radius * 0.4)), col, 2);
    const screenPos = overlay.screen(centre);
    if (screenPos) overlay.tooltip(screenPos.x, screenPos.y, `${MODE_NAME[mode]} · Ø ${this.editor.fmt(brush.radius * 2)} · Höhe ${this.editor.fmt(gridHeight(center.x, center.y))}`);
  }
}

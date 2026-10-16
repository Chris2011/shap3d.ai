import * as THREE from 'three';
import type { Viewer } from './viewer';

export type DrawFn = (o: Overlay) => void;

/** 2D canvas drawn on top of the WebGL view for tool feedback (rubber bands, inference, labels). */
export class Overlay {
  ctx: CanvasRenderingContext2D;
  drawers: DrawFn[] = [];
  dpr = 1;
  constructor(public canvas: HTMLCanvasElement, public viewer: Viewer) { this.ctx = canvas.getContext('2d')!; }

  resize(w: number, h: number) {
    this.dpr = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
  }

  draw() {
    const c = this.ctx;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const d of this.drawers) { c.save(); try { d(this); } catch (e) { console.error(e); } c.restore(); }
  }

  /** Project with near-plane clipping of the segment. */
  private clipSegment(a: THREE.Vector3, b: THREE.Vector3): [THREE.Vector2, THREE.Vector2] | null {
    const cam = this.viewer.rig.camera as THREE.PerspectiveCamera;
    const view = cam.matrixWorldInverse;
    const A = a.clone().applyMatrix4(view), B = b.clone().applyMatrix4(view);
    if (!this.viewer.rig.isOrtho) {
      const near = -0.02;
      if (A.z > near && B.z > near) return null;
      if (A.z > near) A.lerp(B, (A.z - near) / (A.z - B.z));
      else if (B.z > near) B.lerp(A, (B.z - near) / (B.z - A.z));
    }
    const toScreen = (v: THREE.Vector3) => { const p = v.clone().applyMatrix4(cam.projectionMatrix); return new THREE.Vector2((p.x + 1) / 2 * this.viewer.width, (1 - p.y) / 2 * this.viewer.height); };
    return [toScreen(A), toScreen(B)];
  }

  screen(p: THREE.Vector3): THREE.Vector2 | null { const r = this.viewer.project(p); return r.visible ? new THREE.Vector2(r.x, r.y) : null; }

  line(a: THREE.Vector3, b: THREE.Vector3, color = '#000', width = 1, dash?: number[]) {
    const s = this.clipSegment(a, b); if (!s) return;
    const c = this.ctx; c.beginPath(); c.strokeStyle = color; c.lineWidth = width; c.setLineDash(dash ?? []);
    c.moveTo(s[0].x, s[0].y); c.lineTo(s[1].x, s[1].y); c.stroke(); c.setLineDash([]);
  }

  polyline(pts: THREE.Vector3[], color = '#000', width = 1, closed = false, dash?: number[]) {
    for (let i = 0; i < pts.length - 1; i++) this.line(pts[i], pts[i + 1], color, width, dash);
    if (closed && pts.length > 2) this.line(pts[pts.length - 1], pts[0], color, width, dash);
  }

  fillPolygon(pts: THREE.Vector3[], fill: string) {
    const sp = pts.map(p => this.screen(p)); if (sp.some(p => !p)) return;
    const c = this.ctx; c.beginPath(); sp.forEach((p, i) => (i ? c.lineTo(p!.x, p!.y) : c.moveTo(p!.x, p!.y))); c.closePath(); c.fillStyle = fill; c.fill();
  }

  /** Inference markers like SketchUp: endpoint (green), midpoint (cyan), on edge (red), on face (blue)... */
  marker(p: THREE.Vector3, kind: string) {
    const s = this.screen(p); if (!s) return;
    const c = this.ctx; c.lineWidth = 1.5; c.setLineDash([]);
    const col: Record<string, string> = { endpoint: '#00b000', midpoint: '#00b5d8', edge: '#e00000', face: '#2040ff', center: '#00b000', guide: '#555', intersection: '#000', axis: '#000', origin: '#e0a000' };
    const color = col[kind] ?? '#000';
    c.fillStyle = color; c.strokeStyle = '#ffffffcc';
    if (kind === 'endpoint' || kind === 'center' || kind === 'origin') { c.beginPath(); c.arc(s.x, s.y, 5.5, 0, Math.PI * 2); c.fill(); c.lineWidth = 1; c.stroke(); }
    else if (kind === 'midpoint') { c.beginPath(); c.arc(s.x, s.y, 5, 0, Math.PI * 2); c.fill(); c.stroke(); }
    else if (kind === 'edge') { c.fillRect(s.x - 4.5, s.y - 4.5, 9, 9); c.strokeRect(s.x - 4.5, s.y - 4.5, 9, 9); }
    else if (kind === 'face') { c.beginPath(); c.moveTo(s.x, s.y - 6); c.lineTo(s.x + 6, s.y); c.lineTo(s.x, s.y + 6); c.lineTo(s.x - 6, s.y); c.closePath(); c.fill(); c.stroke(); }
    else if (kind === 'intersection') { c.strokeStyle = '#000'; c.lineWidth = 2; c.beginPath(); c.moveTo(s.x - 5, s.y - 5); c.lineTo(s.x + 5, s.y + 5); c.moveTo(s.x + 5, s.y - 5); c.lineTo(s.x - 5, s.y + 5); c.stroke(); }
    else if (kind === 'guide') { c.strokeStyle = '#333'; c.lineWidth = 1; c.beginPath(); c.moveTo(s.x - 6, s.y); c.lineTo(s.x + 6, s.y); c.moveTo(s.x, s.y - 6); c.lineTo(s.x, s.y + 6); c.stroke(); }
    else { c.beginPath(); c.arc(s.x, s.y, 3, 0, Math.PI * 2); c.fill(); }
  }

  /** SketchUp-like yellow tooltip near the cursor. */
  tooltip(x: number, y: number, text: string) {
    const c = this.ctx; c.font = '12px "Open Sans", "Segoe UI", sans-serif';
    const w = c.measureText(text).width + 10, h = 18;
    const X = Math.min(x + 14, this.viewer.width - w - 2), Y = Math.min(y + 18, this.viewer.height - h - 2);
    c.fillStyle = '#ffffe1'; c.strokeStyle = '#767676'; c.lineWidth = 1;
    c.fillRect(X, Y, w, h); c.strokeRect(X + 0.5, Y + 0.5, w - 1, h - 1);
    c.fillStyle = '#000'; c.textBaseline = 'middle'; c.fillText(text, X + 5, Y + h / 2 + 0.5);
  }

  text(p: THREE.Vector3, text: string, opts: { color?: string; bg?: string; align?: CanvasTextAlign; font?: string; dx?: number; dy?: number } = {}) {
    const s = this.screen(p); if (!s) return;
    const c = this.ctx; c.font = opts.font ?? '12px "Open Sans", "Segoe UI", sans-serif';
    c.textAlign = opts.align ?? 'center'; c.textBaseline = 'middle';
    const x = s.x + (opts.dx ?? 0), y = s.y + (opts.dy ?? 0);
    if (opts.bg) { const w = c.measureText(text).width + 8; const ox = c.textAlign === 'center' ? -w / 2 : c.textAlign === 'right' ? -w : 0; c.fillStyle = opts.bg; c.fillRect(x + ox - (c.textAlign === 'left' ? 4 : 0), y - 9, w, 18); }
    c.fillStyle = opts.color ?? '#000'; c.fillText(text, x, y);
  }

  rect2D(x0: number, y0: number, x1: number, y1: number, dashed: boolean) {
    const c = this.ctx; c.strokeStyle = '#000'; c.lineWidth = 1; c.setLineDash(dashed ? [5, 4] : []);
    c.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0)); c.setLineDash([]);
  }

  /** Circle in 3D (polyline) – used by protractor and rotate tool. */
  circle3D(center: THREE.Vector3, normal: THREE.Vector3, radius: number, color: string, width = 1, segments = 48, dash?: number[]) {
    const u = Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1).cross(normal).normalize() : new THREE.Vector3(1, 0, 0).cross(normal).normalize();
    const v = normal.clone().cross(u).normalize();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) { const a = i / segments * Math.PI * 2; pts.push(center.clone().addScaledVector(u, Math.cos(a) * radius).addScaledVector(v, Math.sin(a) * radius)); }
    this.polyline(pts, color, width, false, dash);
  }
}

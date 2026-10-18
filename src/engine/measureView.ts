import * as THREE from 'three';
import { reactive } from 'vue';
import { useStorage } from '@vueuse/core';
import type { Overlay } from './overlay';
import type { Editor } from './editor';
import { theme } from '../theme';
import { formatLength } from '../core/units';

/**
 * Measuring aids in the viewport:
 *  - rulers: tick marks along the axes that get finer while zooming in (m → 10 cm → cm → mm)
 *  - people: height dimension next to every reference person
 */
// README screenshots start without them and don't touch the stored setting
const shotMode = new URLSearchParams(location.search).has('shot');
export const measureView: { rulers: boolean; people: boolean } = shotMode
  ? reactive({ rulers: false, people: false })
  : useStorage('s3d:measure', { rulers: true, people: true }, undefined, { mergeDefaults: true }).value;

const STEPS = [100, 10, 1, 0.1, 0.01, 0.001];
const MIN_TICK = 7;    // px between neighbouring ticks of one level
const MIN_LABEL = 58;  // px between ticks before they get a label
const AXES = [
  { dir: new THREE.Vector3(1, 0, 0), color: '#d63a3a' },
  { dir: new THREE.Vector3(0, 1, 0), color: '#2e9e3e' },
  { dir: new THREE.Vector3(0, 0, 1), color: '#3555d6' },
];

/** Label for a tick at `t` metres whose finest level is `step`: whole metres, then cm, then mm. */
function tickLabel(t: number, step: number): string {
  const sign = t < 0 ? '−' : ''; const a = Math.abs(t);
  if (step >= 1) return `${sign}${Math.round(a)} m`;
  if (step >= 0.01) return `${sign}${Math.round(a * 100)} cm`;
  return `${sign}${Math.round(a * 1000)} mm`;
}

function label(c: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'center') {
  c.font = '600 11px "Open Sans", "Segoe UI", sans-serif'; c.textAlign = align; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineWidth = 3; c.strokeStyle = theme.night ? 'rgba(10,14,20,.85)' : 'rgba(255,255,255,.9)';
  c.strokeText(text, x, y); c.fillStyle = color; c.fillText(text, x, y);
}

function drawRulers(o: Overlay) {
  const v = o.viewer, c = o.ctx, W = v.width, H = v.height, M = 30;
  const cam = (v.rig.camera as THREE.Camera).position;
  const reach = Math.max(200, cam.length() * 6);
  const textCol = theme.night ? '#dfe6ee' : '#2b3035';

  for (const ax of AXES) {
    const P = (t: number) => ax.dir.clone().multiplyScalar(t);
    // one subdivision step: draw the tick at `a` (unless the parent already did) and recurse into tenths
    const visit = (a: number, b: number, level: number, drawStart: boolean) => {
      const seg = o.projectSegment(P(a), P(b)); if (!seg) return;
      const [p, q] = seg;
      if (Math.max(p.x, q.x) < -M || Math.min(p.x, q.x) > W + M || Math.max(p.y, q.y) < -M || Math.min(p.y, q.y) > H + M) return;
      const len = p.distanceTo(q); if (len < MIN_TICK) return;
      if (drawStart && a !== 0) {
        const s = o.screen(P(a));
        if (s) {
          const d = q.clone().sub(p).normalize(); const n = new THREE.Vector2(-d.y, d.x);
          if (n.y < 0 || (Math.abs(n.y) < 1e-3 && n.x < 0)) n.negate(); // ticks hang below / to the right
          const tl = Math.min(14, 3 + len * 0.06);
          c.globalAlpha = Math.min(1, 0.3 + (len - MIN_TICK) / (MIN_TICK * 3));
          c.strokeStyle = ax.color; c.lineWidth = len >= MIN_LABEL ? 1.6 : 1; c.setLineDash([]);
          c.beginPath(); c.moveTo(s.x, s.y); c.lineTo(s.x + n.x * tl, s.y + n.y * tl); c.stroke();
          c.globalAlpha = 1;
          if (len >= MIN_LABEL) label(c, tickLabel(a, STEPS[level]), s.x + n.x * (tl + 10), s.y + n.y * (tl + 10), textCol);
        }
      }
      if (level + 1 >= STEPS.length || len / 10 < MIN_TICK) return;
      const s = (b - a) / 10;
      for (let i = 0; i < 10; i++) visit(a + i * s, a + (i + 1) * s, level + 1, i > 0);
    };
    for (const sign of [1, -1]) {
      const n = Math.ceil(reach / STEPS[0]);
      for (let k = 0; k < n; k++) visit(sign * k * STEPS[0], sign * (k + 1) * STEPS[0], 0, true);
    }
  }
}

function drawPeople(o: Overlay) {
  const v = o.viewer, c = o.ctx;
  const col = theme.night ? '#dfe6ee' : '#2b3035';
  for (const f of v.faceMe) {
    if (!f.group.visible) continue;
    const box = new THREE.Box3().setFromObject(f.group); if (box.isEmpty()) continue;
    const h = box.max.z - box.min.z;
    const ctr = box.getCenter(new THREE.Vector3());
    const bot = o.screen(new THREE.Vector3(ctr.x, ctr.y, box.min.z)), top = o.screen(new THREE.Vector3(ctr.x, ctr.y, box.max.z));
    if (!bot || !top || Math.abs(bot.y - top.y) < 36) continue;
    // right edge of the figure on screen
    let maxX = -Infinity;
    for (let i = 0; i < 8; i++) {
      const s = o.screen(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
      if (s) maxX = Math.max(maxX, s.x);
    }
    const x = Math.round(maxX + 14) + 0.5;
    c.strokeStyle = col; c.lineWidth = 1; c.setLineDash([]); c.beginPath();
    c.moveTo(x, bot.y); c.lineTo(x, top.y);
    c.moveTo(x - 5, bot.y); c.lineTo(x + 5, bot.y); c.moveTo(x - 5, top.y); c.lineTo(x + 5, top.y);
    // little arrow heads
    const dir = Math.sign(bot.y - top.y) || 1;
    c.moveTo(x - 3, top.y + 5 * dir); c.lineTo(x, top.y); c.lineTo(x + 3, top.y + 5 * dir);
    c.moveTo(x - 3, bot.y - 5 * dir); c.lineTo(x, bot.y); c.lineTo(x + 3, bot.y - 5 * dir);
    c.stroke();
    const px = Math.abs(bot.y - top.y) / h; // pixels per metre at the figure
    const text = px > 2500 ? `${Math.round(h * 1000)} mm` : px > 500 ? `${(h * 100).toFixed(1).replace('.', ',')} cm` : formatLength(h, 'm', 2);
    label(c, text, x + 8, (bot.y + top.y) / 2, col, 'left');
  }
}

export function drawMeasure(o: Overlay, ed: Editor) {
  if (measureView.rulers && ed.model.settings.axes) drawRulers(o);
  if (measureView.people) drawPeople(o);
}

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
const tickLabel = (value: number, step: number): string => {
  const sign = value < 0 ? '−' : ''; const magnitude = Math.abs(value);
  if (step >= 1) return `${sign}${Math.round(magnitude)} m`;
  if (step >= 0.01) return `${sign}${Math.round(magnitude * 100)} cm`;
  return `${sign}${Math.round(magnitude * 1000)} mm`;
};

const label = (context: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'center') => {
  context.font = '600 11px "Open Sans", "Segoe UI", sans-serif'; context.textAlign = align; context.textBaseline = 'middle';
  context.lineJoin = 'round'; context.lineWidth = 3; context.strokeStyle = theme.night ? 'rgba(10,14,20,.85)' : 'rgba(255,255,255,.9)';
  context.strokeText(text, x, y); context.fillStyle = color; context.fillText(text, x, y);
};

const drawRulers = (overlay: Overlay) => {
  const viewer = overlay.viewer, context = overlay.context, viewWidth = viewer.width, viewHeight = viewer.height, margin = 30;
  const cam = (viewer.rig.camera as THREE.Camera).position;
  const reach = Math.max(200, cam.length() * 6);
  const textCol = theme.night ? '#dfe6ee' : '#2b3035';

  for (const axis of AXES) {
    const pointAt = (distance: number) => axis.dir.clone().multiplyScalar(distance);
    // one subdivision step: draw the tick at `start` (unless the parent already did) and recurse into tenths
    const visit = (start: number, end: number, level: number, drawStart: boolean) => {
      const seg = overlay.projectSegment(pointAt(start), pointAt(end)); if (!seg) return;
      const [screenStart, screenEnd] = seg;
      if (Math.max(screenStart.x, screenEnd.x) < -margin || Math.min(screenStart.x, screenEnd.x) > viewWidth + margin || Math.max(screenStart.y, screenEnd.y) < -margin || Math.min(screenStart.y, screenEnd.y) > viewHeight + margin) return;
      const len = screenStart.distanceTo(screenEnd); if (len < MIN_TICK) return;
      if (drawStart && start !== 0) {
        const tickPos = overlay.screen(pointAt(start));
        if (tickPos) {
          const direction = screenEnd.clone().sub(screenStart).normalize(); const tickNormal = new THREE.Vector2(-direction.y, direction.x);
          if (tickNormal.y < 0 || (Math.abs(tickNormal.y) < 1e-3 && tickNormal.x < 0)) tickNormal.negate(); // ticks hang below / to the right
          const tickLength = Math.min(14, 3 + len * 0.06);
          context.globalAlpha = Math.min(1, 0.3 + (len - MIN_TICK) / (MIN_TICK * 3));
          context.strokeStyle = axis.color; context.lineWidth = len >= MIN_LABEL ? 1.6 : 1; context.setLineDash([]);
          context.beginPath(); context.moveTo(tickPos.x, tickPos.y); context.lineTo(tickPos.x + tickNormal.x * tickLength, tickPos.y + tickNormal.y * tickLength); context.stroke();
          context.globalAlpha = 1;
          if (len >= MIN_LABEL) label(context, tickLabel(start, STEPS[level]), tickPos.x + tickNormal.x * (tickLength + 10), tickPos.y + tickNormal.y * (tickLength + 10), textCol);
        }
      }
      if (level + 1 >= STEPS.length || len / 10 < MIN_TICK) return;
      const subStep = (end - start) / 10;
      for (let i = 0; i < 10; i++) visit(start + i * subStep, start + (i + 1) * subStep, level + 1, i > 0);
    };
    for (const sign of [1, -1]) {
      const count = Math.ceil(reach / STEPS[0]);
      for (let k = 0; k < count; k++) visit(sign * k * STEPS[0], sign * (k + 1) * STEPS[0], 0, true);
    }
  }
};

const drawPeople = (overlay: Overlay) => {
  const viewer = overlay.viewer, context = overlay.context;
  const col = theme.night ? '#dfe6ee' : '#2b3035';
  for (const figure of viewer.faceMe) {
    if (!figure.group.visible) continue;
    const box = new THREE.Box3().setFromObject(figure.group); if (box.isEmpty()) continue;
    const height = box.max.z - box.min.z;
    const ctr = box.getCenter(new THREE.Vector3());
    const bot = overlay.screen(new THREE.Vector3(ctr.x, ctr.y, box.min.z)), top = overlay.screen(new THREE.Vector3(ctr.x, ctr.y, box.max.z));
    if (!bot || !top || Math.abs(bot.y - top.y) < 36) continue;
    // right edge of the figure on screen
    let maxX = -Infinity;
    for (let i = 0; i < 8; i++) {
      const corner = overlay.screen(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
      if (corner) maxX = Math.max(maxX, corner.x);
    }
    const x = Math.round(maxX + 14) + 0.5;
    context.strokeStyle = col; context.lineWidth = 1; context.setLineDash([]); context.beginPath();
    context.moveTo(x, bot.y); context.lineTo(x, top.y);
    context.moveTo(x - 5, bot.y); context.lineTo(x + 5, bot.y); context.moveTo(x - 5, top.y); context.lineTo(x + 5, top.y);
    // little arrow heads
    const dir = Math.sign(bot.y - top.y) || 1;
    context.moveTo(x - 3, top.y + 5 * dir); context.lineTo(x, top.y); context.lineTo(x + 3, top.y + 5 * dir);
    context.moveTo(x - 3, bot.y - 5 * dir); context.lineTo(x, bot.y); context.lineTo(x + 3, bot.y - 5 * dir);
    context.stroke();
    const pixelsPerMetre = Math.abs(bot.y - top.y) / height; // pixels per metre at the figure
    const text = pixelsPerMetre > 2500 ? `${Math.round(height * 1000)} mm` : pixelsPerMetre > 500 ? `${(height * 100).toFixed(1).replace('.', ',')} cm` : formatLength(height, 'm', 2);
    label(context, text, x + 8, (bot.y + top.y) / 2, col, 'left');
  }
};

export const drawMeasure = (overlay: Overlay, editor: Editor) => {
  if (measureView.rulers && editor.model.settings.axes) drawRulers(overlay);
  if (measureView.people) drawPeople(overlay);
};

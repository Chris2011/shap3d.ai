import * as THREE from 'three';
import { reactive } from 'vue';
import { useStorage } from '@vueuse/core';
import type { Overlay } from './overlay';
import type { Editor } from './editor';
import { theme } from '../theme';
import { formatLength } from '../core/units';
import type { Units } from '../core/document';
import { gridLevels, GRID_FADE_IN } from './gridView';
import { t, unitSymbol, formatDecimal } from '../i18n';

/**
 * Measuring aids in the viewport:
 *  - rulers: tick marks along the axes that get finer while zooming in (m → 10 cm → cm → mm)
 *  - people: height dimension next to every reference person
 *  - grid: labels and a legend for the infinite ground grid (the grid itself is drawn by gridView)
 *  - gridAxes: red and green lines through the origin of the ground grid
 *  - labels: numbers along the axes and the grid legend (the ticks stay with the rulers)
 */
// README screenshots start without them and don't touch the stored setting
const shotMode = new URLSearchParams(location.search).has('shot');
export const measureView: { rulers: boolean; people: boolean; grid: boolean; gridAxes: boolean; labels: boolean } = shotMode
  ? reactive({ rulers: false, people: false, grid: false, gridAxes: true, labels: true })
  : useStorage('s3d:measure', { rulers: true, people: true, grid: true, gridAxes: true, labels: true }, undefined, { mergeDefaults: true })
      .value;

const INCH = 0.0254,
  FOOT = 0.3048;
const imperial = (units: Units) => units === 'in' || units === 'ft';
/** Ruler levels from coarse to fine, each one a whole fraction of the one before. */
const rulerSteps = (units: Units) => (imperial(units) ? [100 * FOOT, 10 * FOOT, FOOT, INCH, INCH / 16] : [100, 10, 1, 0.1, 0.01, 0.001]);
const MIN_TICK = 7; // px between neighbouring ticks of one level
const MIN_LABEL = 58; // px between ticks before they get a label
const AXES = [
  { dir: new THREE.Vector3(1, 0, 0), color: '#d63a3a' },
  { dir: new THREE.Vector3(0, 1, 0), color: '#2e9e3e' },
  { dir: new THREE.Vector3(0, 0, 1), color: '#3555d6' },
];

/** 3 5/16" – inches with sixteenths, reduced */
const inches = (value: number): string => {
  const sixteenths = Math.round(value / (INCH / 16));
  const whole = Math.trunc(sixteenths / 16);
  let rest = sixteenths % 16,
    denominator = 16;
  while (rest && rest % 2 === 0) {
    rest /= 2;
    denominator /= 2;
  }
  if (!rest) {
    return `${whole}"`;
  }
  return `${whole ? `${whole} ` : ''}${rest}/${denominator}"`;
};

/** Label for a tick at `value` metres whose finest level is `step`: whole metres, then cm, then mm (feet and inches for imperial models). */
const tickLabel = (value: number, step: number, units: Units): string => {
  const sign = value < 0 ? '−' : '';
  const magnitude = Math.abs(value);
  if (imperial(units)) {
    if (step >= FOOT - 1e-9) {
      return `${sign}${Math.round(magnitude / FOOT)}'`;
    }
    const feet = Math.floor((magnitude + 1e-9) / FOOT);
    return `${sign}${feet ? `${feet}' ` : ''}${inches(magnitude - feet * FOOT)}`;
  }
  if (step >= 1) {
    return `${sign}${Math.round(magnitude)} ${unitSymbol('m')}`;
  }
  if (step >= 0.01) {
    return `${sign}${Math.round(magnitude * 100)} ${unitSymbol('cm')}`;
  }
  return `${sign}${Math.round(magnitude * 1000)} ${unitSymbol('mm')}`;
};

/** Size of one grid spacing: "1 mm", "10 cm", "100 m", 1/16", 10' */
const spacingLabel = (step: number, units: Units): string => {
  if (imperial(units)) {
    return step >= FOOT - 1e-9 ? `${Math.round(step / FOOT)}'` : inches(step);
  }
  if (step >= 1000) {
    return `${Math.round(step / 1000)} km`;
  }
  if (step >= 1) {
    return `${Math.round(step)} ${unitSymbol('m')}`;
  }
  if (step >= 0.01) {
    return `${Math.round(step * 100)} ${unitSymbol('cm')}`;
  }
  return `${Math.round(step * 1000)} ${unitSymbol('mm')}`;
};

const label = (context: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, align: CanvasTextAlign = 'center') => {
  context.font = '600 11px "Open Sans", "Segoe UI", sans-serif';
  context.textAlign = align;
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineWidth = 3;
  context.strokeStyle = theme.night ? 'rgba(10,14,20,.85)' : 'rgba(255,255,255,.9)';
  context.strokeText(text, x, y);
  context.fillStyle = color;
  context.fillText(text, x, y);
};

/** Ticks and labels along the axes; without ticks only the labels are drawn (grid labels along X and Y), without labels only the ticks. */
const drawRulers = (overlay: Overlay, units: Units, axes = AXES, ticks = true, labels = true) => {
  const viewer = overlay.viewer,
    context = overlay.context,
    viewWidth = viewer.width,
    viewHeight = viewer.height,
    margin = 30;
  const cam = (viewer.rig.camera as THREE.Camera).position;
  const reach = Math.max(200, cam.length() * 6);
  const textCol = theme.night ? '#dfe6ee' : '#2b3035';
  const steps = rulerSteps(units);

  for (const axis of axes) {
    const pointAt = (distance: number) => axis.dir.clone().multiplyScalar(distance);
    // one subdivision step: draw the tick at `start` (unless the parent already did) and recurse into the next level
    const visit = (start: number, end: number, level: number, drawStart: boolean) => {
      const seg = overlay.projectSegment(pointAt(start), pointAt(end));
      if (!seg) {
        return;
      }
      const [screenStart, screenEnd] = seg;
      if (
        Math.max(screenStart.x, screenEnd.x) < -margin ||
        Math.min(screenStart.x, screenEnd.x) > viewWidth + margin ||
        Math.max(screenStart.y, screenEnd.y) < -margin ||
        Math.min(screenStart.y, screenEnd.y) > viewHeight + margin
      ) {
        return;
      }
      const len = screenStart.distanceTo(screenEnd);
      if (len < MIN_TICK) {
        return;
      }
      if (drawStart && start !== 0) {
        const tickPos = overlay.screen(pointAt(start));
        // geometry wins: ticks and labels behind faces stay hidden
        if (tickPos && !viewer.isHidden(pointAt(start))) {
          const direction = screenEnd.clone().sub(screenStart).normalize();
          const tickNormal = new THREE.Vector2(-direction.y, direction.x);
          if (tickNormal.y < 0 || (Math.abs(tickNormal.y) < 1e-3 && tickNormal.x < 0)) {
            tickNormal.negate();
          } // ticks hang below / to the right
          const tickLength = ticks ? Math.min(14, 3 + len * 0.06) : 2;
          if (ticks) {
            context.globalAlpha = Math.min(1, 0.3 + (len - MIN_TICK) / (MIN_TICK * 3));
            context.strokeStyle = axis.color;
            context.lineWidth = len >= MIN_LABEL ? 1.6 : 1;
            context.setLineDash([]);
            context.beginPath();
            context.moveTo(tickPos.x, tickPos.y);
            context.lineTo(tickPos.x + tickNormal.x * tickLength, tickPos.y + tickNormal.y * tickLength);
            context.stroke();
            context.globalAlpha = 1;
          }
          if (labels && len >= MIN_LABEL) {
            // keep the whole text clear of the axis, also where the axis runs steeply across the screen
            const text = tickLabel(start, steps[level], units);
            context.font = '600 11px "Open Sans", "Segoe UI", sans-serif';
            const gap =
              tickLength + 4 + Math.max(6, (Math.abs(tickNormal.x) * context.measureText(text).width) / 2 + Math.abs(tickNormal.y) * 7);
            label(context, text, tickPos.x + tickNormal.x * gap, tickPos.y + tickNormal.y * gap, textCol);
          }
        }
      }
      if (level + 1 >= steps.length) {
        return;
      }
      const parts = Math.round(steps[level] / steps[level + 1]);
      if (len / parts < MIN_TICK) {
        return;
      }
      const subStep = (end - start) / parts;
      for (let i = 0; i < parts; i++) {
        visit(start + i * subStep, start + (i + 1) * subStep, level + 1, i > 0);
      }
    };
    for (const sign of [1, -1]) {
      const count = Math.ceil(reach / steps[0]);
      for (let k = 0; k < count; k++) {
        visit(sign * k * steps[0], sign * (k + 1) * steps[0], 0, true);
      }
    }
  }
};

/** Legend for the ground grid: spacing of the fine and the major lines where the view centre meets the ground. */
const drawGridLegend = (overlay: Overlay, units: Units) => {
  const viewer = overlay.viewer;
  const ray = viewer.ray(viewer.width / 2, viewer.height / 2);
  const ground =
    ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3()) ??
    (viewer.rig.isOrtho ? null : new THREE.Vector3(viewer.rig.target.x, viewer.rig.target.y, 0));
  if (!ground) {
    return;
  }
  const centre = overlay.screen(ground);
  if (!centre) {
    return;
  }
  // world size of one pixel as the grid shader measures it: the coarser of the two directions
  const probe = 0.001 * Math.max(1, viewer.rig.position.distanceTo(ground));
  let pixel = 0;
  for (const offset of [new THREE.Vector3(probe, 0, 0), new THREE.Vector3(0, probe, 0)]) {
    const moved = overlay.screen(ground.clone().add(offset));
    if (!moved) {
      return;
    }
    pixel = Math.max(pixel, probe / Math.max(Math.abs(moved.x - centre.x), Math.abs(moved.y - centre.y), 1e-6));
  }
  const levels = gridLevels(units);
  // the finest level that is clearly visible there, and the next coarser one as major lines
  const fine = levels.findIndex((step) => step / pixel >= (GRID_FADE_IN[0] + GRID_FADE_IN[1]) / 2);
  if (fine < 0) {
    return;
  }
  const text = `${t('measure.grid')} ${spacingLabel(levels[fine], units)}${fine + 1 < levels.length ? ` · ${spacingLabel(levels[fine + 1], units)}` : ''}`;
  // right of the tool bar, which reaches down to the status bar
  label(overlay.context, text, 62, viewer.height - 14, theme.night ? '#dfe6ee' : '#2b3035', 'left');
};

const drawPeople = (overlay: Overlay) => {
  const viewer = overlay.viewer,
    context = overlay.context;
  const col = theme.night ? '#dfe6ee' : '#2b3035';
  for (const figure of viewer.faceMe) {
    if (!figure.group.visible) {
      continue;
    }
    const box = new THREE.Box3().setFromObject(figure.group);
    if (box.isEmpty()) {
      continue;
    }
    const height = box.max.z - box.min.z;
    const ctr = box.getCenter(new THREE.Vector3());
    const bot = overlay.screen(new THREE.Vector3(ctr.x, ctr.y, box.min.z)),
      top = overlay.screen(new THREE.Vector3(ctr.x, ctr.y, box.max.z));
    if (!bot || !top || Math.abs(bot.y - top.y) < 36) {
      continue;
    }
    // hidden as soon as geometry covers the whole figure (the figure itself doesn't count)
    if (
      viewer.isHidden(new THREE.Vector3(ctr.x, ctr.y, box.min.z), figure.group) &&
      viewer.isHidden(new THREE.Vector3(ctr.x, ctr.y, box.max.z), figure.group)
    ) {
      continue;
    }
    // right edge of the figure on screen
    let maxX = -Infinity;
    for (let i = 0; i < 8; i++) {
      const corner = overlay.screen(
        new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z),
      );
      if (corner) {
        maxX = Math.max(maxX, corner.x);
      }
    }
    const x = Math.round(maxX + 14) + 0.5;
    context.strokeStyle = col;
    context.lineWidth = 1;
    context.setLineDash([]);
    context.beginPath();
    context.moveTo(x, bot.y);
    context.lineTo(x, top.y);
    context.moveTo(x - 5, bot.y);
    context.lineTo(x + 5, bot.y);
    context.moveTo(x - 5, top.y);
    context.lineTo(x + 5, top.y);
    // little arrow heads
    const dir = Math.sign(bot.y - top.y) || 1;
    context.moveTo(x - 3, top.y + 5 * dir);
    context.lineTo(x, top.y);
    context.lineTo(x + 3, top.y + 5 * dir);
    context.moveTo(x - 3, bot.y - 5 * dir);
    context.lineTo(x, bot.y);
    context.lineTo(x + 3, bot.y - 5 * dir);
    context.stroke();
    const pixelsPerMetre = Math.abs(bot.y - top.y) / height; // pixels per metre at the figure
    const text =
      pixelsPerMetre > 2500
        ? `${Math.round(height * 1000)} ${unitSymbol('mm')}`
        : pixelsPerMetre > 500
          ? `${formatDecimal(height * 100, 1)} ${unitSymbol('cm')}`
          : formatLength(height, 'm', 2);
    label(context, text, x + 8, (bot.y + top.y) / 2, col, 'left');
  }
};

export const drawMeasure = (overlay: Overlay, editor: Editor) => {
  const units = editor.model.settings.units;
  const rulers = measureView.rulers && editor.model.settings.axes;
  // the labels switch belongs to the grid: without the grid the rulers keep their numbers
  if (rulers) {
    drawRulers(overlay, units, AXES, true, measureView.labels || !measureView.grid);
  }
  if (measureView.grid && measureView.labels) {
    // the rulers already label the axes; otherwise the grid labels its lines along X and Y
    if (!rulers) {
      drawRulers(overlay, units, AXES.slice(0, 2), false);
    }
    drawGridLegend(overlay, units);
  }
  if (measureView.people) {
    drawPeople(overlay);
  }
};

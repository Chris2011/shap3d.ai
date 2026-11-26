// Sizes shown right at the preview while drawing: lengths at the edges, radius and diameter, or the current value at the
// cursor – so you see how big a line, rectangle or circle gets without looking down at the measurements box.
import type * as THREE from 'three';
import { useLocalStorage } from '@vueuse/core';
import type { Editor } from '../engine/editor';
import type { Overlay } from '../engine/overlay';
import { t } from '../i18n';

/** View › Sizes while drawing – on unless switched off */
export const drawLabelsOn = useLocalStorage('s3d.drawLabels', true);

const LABEL = { color: '#1d1d1f', background: '#ffffffe6', font: '600 12px "Open Sans", "Segoe UI", sans-serif' };

/** the length of an edge of the preview, a little beside its middle */
export const edgeLabel = (editor: Editor, overlay: Overlay, start: THREE.Vector3, end: THREE.Vector3, prefix = '') => {
  const length = start.distanceTo(end);
  if (!drawLabelsOn.value || length < 1e-6) {
    return;
  }
  overlay.text(start.clone().lerp(end, 0.5), prefix + editor.fmt(length), { ...LABEL, offsetY: -12 });
};

/** a text at a point of the preview (a circle's diameter, a polygon's side) */
export const pointLabel = (overlay: Overlay, point: THREE.Vector3, text: string) => {
  if (drawLabelsOn.value && text) {
    overlay.text(point, text, { ...LABEL, offsetY: -12 });
  }
};

/** the value the measurements box shows (with its name), beside the cursor – for tools whose preview has no single edge */
export const valueLabel = (editor: Editor, overlay: Overlay) => {
  const value = editor.ui.vcbValue;
  if (!drawLabelsOn.value || !value) {
    return;
  }
  const text = `${t(editor.ui.vcbLabel)} ${value}`;
  const context = overlay.context;
  context.font = LABEL.font;
  const width = context.measureText(text).width + 8;
  const x = Math.min(editor.mouse.x + 14, editor.viewer.width - width - 2);
  const y = Math.max(editor.mouse.y - 22, 11);
  context.fillStyle = LABEL.background;
  context.fillRect(x, y - 9, width, 18);
  context.fillStyle = LABEL.color;
  context.textAlign = 'left';
  context.textBaseline = 'middle';
  context.fillText(text, x + 4, y);
};

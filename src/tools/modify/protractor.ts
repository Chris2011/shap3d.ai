// The protractor of the Rotate tool: a circle with ticks every 15°, coloured by the axis it lies across.
import type * as THREE from 'three';
import type { Editor } from '../../engine/editor';
import type { Overlay } from '../../engine/overlay';
import { planeAxes } from '../base';

export const drawProtractor = (editor: Editor, overlay: Overlay, center: THREE.Vector3, normal: THREE.Vector3) => {
  const radius = editor.viewer.worldPerPixel(center) * 55;
  const color =
    Math.abs(normal.z) > 0.99 ? '#0000e0' : Math.abs(normal.x) > 0.99 ? '#e00000' : Math.abs(normal.y) > 0.99 ? '#00a000' : '#555';
  overlay.circle3D(center, normal, radius, color, 1.5, 64);
  const { basisU, basisV } = planeAxes(normal);
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2;
    const direction = basisU.clone().multiplyScalar(Math.cos(angle)).addScaledVector(basisV, Math.sin(angle));
    // every 90° a longer tick
    overlay.line(
      center.clone().addScaledVector(direction, radius * (i % 6 === 0 ? 0.78 : 0.88)),
      center.clone().addScaledVector(direction, radius),
      color,
      1,
    );
  }
  overlay.marker(center, 'center');
};

import * as THREE from 'three';
import { t } from '../../i18n';
import type { Overlay } from '../overlay';
import { ANNOTATION_FONT } from './editorAnnotations';
import { EditorInput } from './editorInput';

/** Drawing dimensions and section planes over the view, and the selection's summary for the status line. */
export abstract class EditorView extends EditorInput {
  drawDimension(overlay: Overlay, start: THREE.Vector3, end: THREE.Vector3, off: THREE.Vector3, selected = false) {
    const offsetStart = start.clone().add(off),
      offsetEnd = end.clone().add(off);
    const color = selected ? '#1d4ed8' : '#000';
    const width = selected ? 2 : 1;
    overlay.line(start, offsetStart, color, width);
    overlay.line(end, offsetEnd, color, width);
    overlay.line(offsetStart, offsetEnd, color, width);
    const screenStart = overlay.screen(offsetStart),
      screenEnd = overlay.screen(offsetEnd);
    if (screenStart && screenEnd) {
      const context = overlay.context;
      const direction = screenEnd.clone().sub(screenStart).normalize().multiplyScalar(9);
      const normal = new THREE.Vector2(-direction.y, direction.x).multiplyScalar(0.35);
      context.fillStyle = color;
      for (const [tip, sign] of [
        [screenStart, 1],
        [screenEnd, -1],
      ] as const) {
        context.beginPath();
        context.moveTo(tip.x, tip.y);
        context.lineTo(tip.x + direction.x * sign + normal.x, tip.y + direction.y * sign + normal.y);
        context.lineTo(tip.x + direction.x * sign - normal.x, tip.y + direction.y * sign - normal.y);
        context.closePath();
        context.fill();
      }
    }
    overlay.text(offsetStart.clone().add(offsetEnd).multiplyScalar(0.5), this.fmt(start.distanceTo(end)), {
      color,
      background: '#ffffffe6',
      font: ANNOTATION_FONT,
    });
  }

  drawSection(overlay: Overlay, planePoint: THREE.Vector3, planeNormal: THREE.Vector3, active: boolean) {
    const size = this.viewer.worldPerPixel(planePoint) * 60;
    const basisU =
      Math.abs(planeNormal.z) < 0.9
        ? new THREE.Vector3(0, 0, 1).cross(planeNormal).normalize()
        : new THREE.Vector3(1, 0, 0).cross(planeNormal).normalize();
    const basisV = planeNormal.clone().cross(basisU).normalize();
    const scales = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([x, y]) =>
      planePoint
        .clone()
        .addScaledVector(basisU, x * size)
        .addScaledVector(basisV, y * size),
    );
    overlay.fillPolygon(scales, active ? 'rgba(255,140,0,0.12)' : 'rgba(120,120,120,0.08)');
    overlay.polyline(scales, active ? '#e07000' : '#888', 1.5, true);
    for (const k of [0, 1, 2, 3]) {
      const corner = scales[k].clone().lerp(planePoint, 0.15);
      overlay.line(corner, corner.clone().addScaledVector(planeNormal, size * 0.35), active ? '#e07000' : '#888', 1.5);
    }
  }

  // ------------------------------------------------------------ status helpers
  selectionSummary(): string {
    const entityRefs = this.selected();
    if (!entityRefs.length) {
      return t('editor.noSelection');
    }
    const counts = { face: 0, edge: 0, instance: 0 };
    entityRefs.forEach((entityRef) => counts[entityRef.kind]++);
    const parts: string[] = [];
    if (counts.face) {
      parts.push(t('editor.faces', { count: counts.face }));
    }
    if (counts.edge) {
      parts.push(t('editor.edges', { count: counts.edge }));
    }
    if (counts.instance) {
      parts.push(t('editor.instances', { count: counts.instance }));
    }
    return parts.join(', ');
  }
}

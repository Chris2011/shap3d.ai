import * as THREE from 'three';
import type { Viewer } from './viewer';

export type DrawFn = (overlay: Overlay) => void;

/** 2D canvas drawn on top of the WebGL view for tool feedback (rubber bands, inference, labels). */
export class Overlay {
  context: CanvasRenderingContext2D;
  drawers: DrawFn[] = [];
  pixelRatio = 1;
  constructor(
    public canvas: HTMLCanvasElement,
    public viewer: Viewer,
  ) {
    this.context = canvas.getContext('2d')!;
  }

  resize(width: number, height: number) {
    this.pixelRatio = Math.min(window.devicePixelRatio, 2);
    this.canvas.width = Math.round(width * this.pixelRatio);
    this.canvas.height = Math.round(height * this.pixelRatio);
    this.canvas.style.width = width + 'px';
    this.canvas.style.height = height + 'px';
  }

  draw() {
    const context = this.context;
    context.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const drawer of this.drawers) {
      context.save();
      try {
        drawer(this);
      } catch (error) {
        console.error(error);
      }
      context.restore();
    }
  }

  /** Project with near-plane clipping of the segment. */
  projectSegment(start: THREE.Vector3, end: THREE.Vector3): [THREE.Vector2, THREE.Vector2] | null {
    const cam = this.viewer.rig.camera as THREE.PerspectiveCamera;
    const view = cam.matrixWorldInverse;
    const viewStart = start.clone().applyMatrix4(view),
      viewEnd = end.clone().applyMatrix4(view);
    if (!this.viewer.rig.isOrtho) {
      const near = -0.02;
      if (viewStart.z > near && viewEnd.z > near) {
        return null;
      }
      if (viewStart.z > near) {
        viewStart.lerp(viewEnd, (viewStart.z - near) / (viewStart.z - viewEnd.z));
      } else if (viewEnd.z > near) {
        viewEnd.lerp(viewStart, (viewEnd.z - near) / (viewEnd.z - viewStart.z));
      }
    }
    const toScreen = (viewPoint: THREE.Vector3) => {
      const projected = viewPoint.clone().applyMatrix4(cam.projectionMatrix);
      return new THREE.Vector2(((projected.x + 1) / 2) * this.viewer.width, ((1 - projected.y) / 2) * this.viewer.height);
    };
    return [toScreen(viewStart), toScreen(viewEnd)];
  }

  screen(point: THREE.Vector3): THREE.Vector2 | null {
    const projected = this.viewer.project(point);
    return projected.visible ? new THREE.Vector2(projected.x, projected.y) : null;
  }

  line(start: THREE.Vector3, end: THREE.Vector3, color = '#000', width = 1, dash?: number[]) {
    const segment = this.projectSegment(start, end);
    if (!segment) {
      return;
    }
    const context = this.context;
    context.beginPath();
    context.strokeStyle = color;
    context.lineWidth = width;
    context.setLineDash(dash ?? []);
    context.moveTo(segment[0].x, segment[0].y);
    context.lineTo(segment[1].x, segment[1].y);
    context.stroke();
    context.setLineDash([]);
  }

  polyline(pts: THREE.Vector3[], color = '#000', width = 1, closed = false, dash?: number[]) {
    for (let i = 0; i < pts.length - 1; i++) {
      this.line(pts[i], pts[i + 1], color, width, dash);
    }
    if (closed && pts.length > 2) {
      this.line(pts[pts.length - 1], pts[0], color, width, dash);
    }
  }

  fillPolygon(pts: THREE.Vector3[], fill: string) {
    const screenPoints = pts.map((point) => this.screen(point));
    if (screenPoints.some((screenPoint) => !screenPoint)) {
      return;
    }
    const context = this.context;
    context.beginPath();
    screenPoints.forEach((screenPoint, i) =>
      i ? context.lineTo(screenPoint!.x, screenPoint!.y) : context.moveTo(screenPoint!.x, screenPoint!.y),
    );
    context.closePath();
    context.fillStyle = fill;
    context.fill();
  }

  /** Inference markers like SketchUp: endpoint (green), midpoint (cyan), on edge (red), on face (blue)... */
  marker(point: THREE.Vector3, kind: string) {
    const screenPos = this.screen(point);
    if (!screenPos) {
      return;
    }
    const context = this.context;
    context.lineWidth = 1.5;
    context.setLineDash([]);
    const col: Record<string, string> = {
      endpoint: '#00b000',
      midpoint: '#00b5d8',
      edge: '#e00000',
      face: '#2040ff',
      center: '#00b000',
      guide: '#555',
      intersection: '#000',
      axis: '#000',
      origin: '#e0a000',
    };
    const color = col[kind] ?? '#000';
    context.fillStyle = color;
    context.strokeStyle = '#ffffffcc';
    if (kind === 'endpoint' || kind === 'center' || kind === 'origin') {
      context.beginPath();
      context.arc(screenPos.x, screenPos.y, 5.5, 0, Math.PI * 2);
      context.fill();
      context.lineWidth = 1;
      context.stroke();
    } else if (kind === 'midpoint') {
      context.beginPath();
      context.arc(screenPos.x, screenPos.y, 5, 0, Math.PI * 2);
      context.fill();
      context.stroke();
    } else if (kind === 'edge') {
      context.fillRect(screenPos.x - 4.5, screenPos.y - 4.5, 9, 9);
      context.strokeRect(screenPos.x - 4.5, screenPos.y - 4.5, 9, 9);
    } else if (kind === 'face') {
      context.beginPath();
      context.moveTo(screenPos.x, screenPos.y - 6);
      context.lineTo(screenPos.x + 6, screenPos.y);
      context.lineTo(screenPos.x, screenPos.y + 6);
      context.lineTo(screenPos.x - 6, screenPos.y);
      context.closePath();
      context.fill();
      context.stroke();
    } else if (kind === 'intersection') {
      context.strokeStyle = '#000';
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(screenPos.x - 5, screenPos.y - 5);
      context.lineTo(screenPos.x + 5, screenPos.y + 5);
      context.moveTo(screenPos.x + 5, screenPos.y - 5);
      context.lineTo(screenPos.x - 5, screenPos.y + 5);
      context.stroke();
    } else if (kind === 'guide') {
      context.strokeStyle = '#333';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(screenPos.x - 6, screenPos.y);
      context.lineTo(screenPos.x + 6, screenPos.y);
      context.moveTo(screenPos.x, screenPos.y - 6);
      context.lineTo(screenPos.x, screenPos.y + 6);
      context.stroke();
    } else {
      context.beginPath();
      context.arc(screenPos.x, screenPos.y, 3, 0, Math.PI * 2);
      context.fill();
    }
  }

  /** SketchUp-like yellow tooltip near the cursor. */
  tooltip(x: number, y: number, text: string) {
    const context = this.context;
    context.font = '12px "Open Sans", "Segoe UI", sans-serif';
    const boxWidth = context.measureText(text).width + 10,
      boxHeight = 18;
    const boxX = Math.min(x + 14, this.viewer.width - boxWidth - 2),
      boxY = Math.min(y + 18, this.viewer.height - boxHeight - 2);
    context.fillStyle = '#ffffe1';
    context.strokeStyle = '#767676';
    context.lineWidth = 1;
    context.fillRect(boxX, boxY, boxWidth, boxHeight);
    context.strokeRect(boxX + 0.5, boxY + 0.5, boxWidth - 1, boxHeight - 1);
    context.fillStyle = '#000';
    context.textBaseline = 'middle';
    context.fillText(text, boxX + 5, boxY + boxHeight / 2 + 0.5);
  }

  text(
    point: THREE.Vector3,
    text: string,
    opts: { color?: string; background?: string; align?: CanvasTextAlign; font?: string; offsetX?: number; offsetY?: number } = {},
  ) {
    const screenPos = this.screen(point);
    if (!screenPos) {
      return;
    }
    const context = this.context;
    context.font = opts.font ?? '12px "Open Sans", "Segoe UI", sans-serif';
    context.textAlign = opts.align ?? 'center';
    context.textBaseline = 'middle';
    const x = screenPos.x + (opts.offsetX ?? 0),
      y = screenPos.y + (opts.offsetY ?? 0);
    if (opts.background) {
      const boxWidth = context.measureText(text).width + 8;
      const offsetX = context.textAlign === 'center' ? -boxWidth / 2 : context.textAlign === 'right' ? -boxWidth : 0;
      context.fillStyle = opts.background;
      context.fillRect(x + offsetX - (context.textAlign === 'left' ? 4 : 0), y - 9, boxWidth, 18);
    }
    context.fillStyle = opts.color ?? '#000';
    context.fillText(text, x, y);
  }

  rect2D(startX: number, startY: number, endX: number, endY: number, dashed: boolean) {
    const context = this.context;
    context.strokeStyle = '#000';
    context.lineWidth = 1;
    context.setLineDash(dashed ? [5, 4] : []);
    context.strokeRect(Math.min(startX, endX) + 0.5, Math.min(startY, endY) + 0.5, Math.abs(endX - startX), Math.abs(endY - startY));
    context.setLineDash([]);
  }

  /** Circle in 3D (polyline) – used by protractor and rotate tool. */
  circle3D(center: THREE.Vector3, normal: THREE.Vector3, radius: number, color: string, width = 1, segments = 48, dash?: number[]) {
    const basisU =
      Math.abs(normal.z) < 0.9
        ? new THREE.Vector3(0, 0, 1).cross(normal).normalize()
        : new THREE.Vector3(1, 0, 0).cross(normal).normalize();
    const basisV = normal.clone().cross(basisU).normalize();
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2;
      pts.push(
        center
          .clone()
          .addScaledVector(basisU, Math.cos(angle) * radius)
          .addScaledVector(basisV, Math.sin(angle) * radius),
      );
    }
    this.polyline(pts, color, width, false, dash);
  }
}

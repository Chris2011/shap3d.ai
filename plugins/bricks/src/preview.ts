import { colorById } from './colors';
import { modelSpec, previewMesh } from './parts';
import type { BrickMesh } from './shapes';

/**
 * A small picture of a part for the catalog, drawn from its real mesh: seen from above at an angle, faces turned away
 * left out, the rest sorted back to front and shaded by how they face the light. Only numbers go into it, so it is
 * safe as v-html; a loaded part is numbers by then too.
 */

const VIEW = { right: [0.755, -0.656, 0], up: [0.262, 0.302, 0.915], toEye: [-0.6, -0.69, 0.4] } as const;
/** bricks are flat things seen from above: what lies higher comes later, or a top would cover the studs standing on it */
const HEIGHT_WEIGHT = 20;
const LIGHT = [-0.35, -0.55, 0.76];
const dot = (a: readonly number[], b: readonly number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

const shade = (hex: string, factor: number) => {
  const value = parseInt(hex.slice(1), 16);
  const channel = (shift: number) => Math.min(255, Math.round(((value >> shift) & 255) * factor));
  return `rgb(${channel(16)} ${channel(8)} ${channel(0)})`;
};

const normalOf = (points: number[][]) => {
  const normal = [0, 0, 0];
  points.forEach((point, i) => {
    const next = points[(i + 1) % points.length];
    normal[0] += (point[1] - next[1]) * (point[2] + next[2]);
    normal[1] += (point[2] - next[2]) * (point[0] + next[0]);
    normal[2] += (point[0] - next[0]) * (point[1] + next[1]);
  });
  const length = Math.hypot(...normal) || 1;
  return normal.map((value) => value / length);
};

/** a model with more parts than this gets no picture: it would be heavier than the page around it */
const MOST_PARTS_IN_PICTURE = 200;

/** one mesh, with a colour for each face */
const drawMesh = (mesh: BrickMesh, colors: string[]) => {
  const screen = mesh.vertices.map((point) => [dot(point, VIEW.right), -dot(point, VIEW.up), dot(point, VIEW.toEye)]);
  const shapes: { depth: number; path: string }[] = [];
  for (const [number, face] of mesh.faces.entries()) {
    const color = colorById(colors[number]);
    const points = face.map((index) => mesh.vertices[index]);
    const normal = normalOf(points);
    if (dot(normal, VIEW.toEye) <= 0) {
      continue;
    }
    const corners = face.map((index) => screen[index]);
    const light = 0.55 + 0.55 * Math.max(0, dot(normal, LIGHT));
    const line = corners.map((corner) => `${(corner[0] * 1000).toFixed(2)} ${(corner[1] * 1000).toFixed(2)}`).join('L');
    shapes.push({
      depth:
        (corners.reduce((sum, corner) => sum + corner[2], 0) + HEIGHT_WEIGHT * points.reduce((sum, point) => sum + point[2], 0)) /
        corners.length,
      path: `<path d="M${line}Z" fill="${shade(color.hex, light)}" stroke="${shade(color.hex, light)}" stroke-width="0.08"/>`,
    });
  }
  shapes.sort((a, b) => a.depth - b.depth);
  const xs = screen.map((point) => point[0] * 1000);
  const ys = screen.map((point) => point[1] * 1000);
  const x0 = Math.min(...xs);
  const y0 = Math.min(...ys);
  const width = Math.max(...xs) - x0;
  const height = Math.max(...ys) - y0;
  const pad = Math.max(width, height) * 0.05;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${(x0 - pad).toFixed(2)} ${(y0 - pad).toFixed(2)} ${(width + 2 * pad).toFixed(2)} ${(height + 2 * pad).toFixed(2)}">${shapes.map((shape) => shape.path).join('')}</svg>`;
};

const pictures = new Map<string, string>();

/** all parts of a model in one mesh, each in its place and colour */
const modelPicture = (id: string) => {
  const spec = modelSpec(id);
  if (!spec || spec.placements.length > MOST_PARTS_IN_PICTURE) {
    return '';
  }
  const whole: BrickMesh = { vertices: [], faces: [] };
  const colors: string[] = [];
  for (const { part, matrix: m, color } of spec.placements) {
    const mesh = previewMesh(part);
    if (mesh) {
      const first = whole.vertices.length;
      for (const [x, y, z] of mesh.vertices) {
        whole.vertices.push([
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
        ]);
      }
      for (const face of mesh.faces) {
        whole.faces.push(face.map((index) => index + first));
        colors.push(color);
      }
    }
  }
  return whole.faces.length ? drawMesh(whole, colors) : '';
};

export const previewSvg = (partId: string, colorId: string) => {
  const key = `${partId}/${colorId}`;
  let picture = pictures.get(key);
  if (picture === undefined) {
    if (modelSpec(partId)) {
      picture = modelPicture(partId);
    } else {
      const mesh = previewMesh(partId);
      picture = mesh
        ? drawMesh(
            mesh,
            mesh.faces.map(() => colorId),
          )
        : '';
    }
    pictures.set(key, picture);
  }
  return picture;
};

import type { PluginMesh } from '../../../src/plugins/types';
import type { Plane } from './paving';

/**
 * Collects boxes and quads in the coordinates of a plane – u along it, v up it, h out of it – into one mesh.
 * Facades are built on a wall's plane, cities on the ground (u = x, v = y, h = z).
 */
export const meshBuilder = (plane: Plane) => {
  const vertices: [number, number, number][] = [];
  const faces: number[][] = [];
  const faceMaterials: (string | null)[] = [];
  const at = (u: number, v: number, h: number) =>
    vertices.push(
      [0, 1, 2].map((axis) => plane.origin[axis] + plane.u[axis] * u + plane.v[axis] * v + plane.normal[axis] * h) as [
        number,
        number,
        number,
      ],
    ) - 1;

  /** a face from corner indices (counter-clockwise seen from the side it faces) */
  const face = (corners: number[], material: string | null) => {
    faces.push(corners);
    faceMaterials.push(material);
  };

  /** a box between two corners (u0 < u1, v0 < v1, h0 < h1); `top` is the material of the side facing +h */
  const box = (
    u0: number,
    v0: number,
    h0: number,
    u1: number,
    v1: number,
    h1: number,
    material: string,
    top: string = material,
    bottom = true,
  ) => {
    if (u1 - u0 < 1e-4 || v1 - v0 < 1e-4 || h1 - h0 < 1e-4) {
      return;
    }
    const corner = [
      at(u0, v0, h0),
      at(u1, v0, h0),
      at(u1, v1, h0),
      at(u0, v1, h0),
      at(u0, v0, h1),
      at(u1, v0, h1),
      at(u1, v1, h1),
      at(u0, v1, h1),
    ];
    // a box standing on another one leaves its bottom out – two faces on top of each other would flicker
    if (bottom) {
      face([corner[3], corner[2], corner[1], corner[0]], material);
    }
    face([corner[4], corner[5], corner[6], corner[7]], top);
    face([corner[0], corner[1], corner[5], corner[4]], material);
    face([corner[1], corner[2], corner[6], corner[5]], material);
    face([corner[2], corner[3], corner[7], corner[6]], material);
    face([corner[3], corner[0], corner[4], corner[7]], material);
  };

  /** a flat rectangle at height h, facing +h */
  const quad = (u0: number, v0: number, u1: number, v1: number, h: number, material: string) => {
    if (u1 - u0 < 1e-4 || v1 - v0 < 1e-4) {
      return;
    }
    face([at(u0, v0, h), at(u1, v0, h), at(u1, v1, h), at(u0, v1, h)], material);
  };

  /** a prism over a polygon (counter-clockwise in u/v) from h0 to h1 */
  const prism = (outline: [number, number][], h0: number, h1: number, material: string, top: string = material) => {
    const bottom = outline.map(([u, v]) => at(u, v, h0));
    const upper = outline.map(([u, v]) => at(u, v, h1));
    face([...bottom].reverse(), material);
    face(upper, top);
    for (let index = 0; index < outline.length; index++) {
      const next = (index + 1) % outline.length;
      face([bottom[index], bottom[next], upper[next], upper[index]], material);
    }
  };

  /**
   * A pitched roof on the rectangle (u0, v0) – (u1, v1) at height h, its ridge `rise` higher and along u or v.
   * A gable roof has upright triangles (`wall`) at its ends, a hip roof slopes there too (a pyramid on a square).
   */
  const pitched = (
    u0: number,
    v0: number,
    u1: number,
    v1: number,
    h: number,
    rise: number,
    alongU: boolean,
    kind: 'gable' | 'hip',
    wall: string,
    roof: string,
  ) => {
    if (u1 - u0 < 1e-4 || v1 - v0 < 1e-4) {
      return;
    }
    // seen with the ridge along u; along v the rectangle is turned a quarter round
    const [a0, b0, a1, b1] = alongU ? [u0, v0, u1, v1] : [v0, u0, v1, u1];
    const point = (a: number, b: number, height: number) => (alongU ? at(a, b, height) : at(b, a, height));
    const middle = (b0 + b1) / 2;
    const inset = kind === 'hip' ? Math.min((b1 - b0) / 2, (a1 - a0) / 2) : 0;
    const corners = [point(a0, b0, h), point(a1, b0, h), point(a1, b1, h), point(a0, b1, h)];
    const ridge0 = point(a0 + inset, middle, h + rise);
    const ridge1 = a1 - a0 - 2 * inset > 1e-3 ? point(a1 - inset, middle, h + rise) : ridge0;
    const end = kind === 'hip' ? roof : wall;
    // turning the rectangle mirrors it, so the faces' order flips with it
    const add = (corner: number[], material: string) => face(alongU ? corner : [...corner].reverse(), material);
    add(ridge1 === ridge0 ? [corners[0], corners[1], ridge0] : [corners[0], corners[1], ridge1, ridge0], roof);
    add(ridge1 === ridge0 ? [corners[2], corners[3], ridge0] : [corners[2], corners[3], ridge0, ridge1], roof);
    add([corners[1], corners[2], ridge1], end);
    add([corners[3], corners[0], ridge0], end);
  };

  /** a face through free corners (u, v, h; counter-clockwise seen from the side it faces) – corners that fall together count once */
  const facet = (corners: [number, number, number][], material: string) => {
    const distinct = corners.filter((corner, index) => {
      const next = corners[(index + 1) % corners.length];
      return Math.abs(corner[0] - next[0]) + Math.abs(corner[1] - next[1]) + Math.abs(corner[2] - next[2]) > 1e-5;
    });
    if (distinct.length >= 3) {
      face(
        distinct.map(([u, v, h]) => at(u, v, h)),
        material,
      );
    }
  };

  const mesh = (): PluginMesh => ({ vertices, faces, faceMaterials });
  const isEmpty = () => faces.length === 0;
  return { box, quad, prism, pitched, facet, mesh, isEmpty };
};

export type MeshBuilder = ReturnType<typeof meshBuilder>;

/** the plane of a vertical wall face: u along the wall (to the right seen from outside), v up, h out of the wall */
export const wallPlane = (origin: [number, number, number], normal: [number, number, number]): Plane => {
  const [nx, ny] = normal;
  const length = Math.hypot(nx, ny) || 1;
  // u = z × n (horizontal, to the right when looking at the wall)
  const u: [number, number, number] = [-ny / length, nx / length, 0];
  return { origin, u, v: [0, 0, 1], normal: [nx / length, ny / length, 0] };
};

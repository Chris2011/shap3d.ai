import type { PluginMesh } from '../../../src/plugins/types';
import { fractal, type FractalOptions } from './noise';

/**
 * Triangle meshes for the noise tools: refining (every edge shorter than a length, without cracks) and moving
 * the points along their normals by 3D noise – used for "roughen a group" and for the rocks and tree crowns.
 */

export type Vector = [number, number, number];
export interface TriangleMesh {
  vertices: Vector[];
  triangles: [number, number, number][];
  /** material per triangle */
  materials: (string | null)[];
}

/** at most this many triangles come out of refining – beyond that the faces get too slow to build */
export const MAX_TRIANGLES = 40000;

const distance = (a: Vector, b: Vector) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** joins points that lie on top of each other (faces of a group share their corners only by position) */
export const weld = (mesh: TriangleMesh): TriangleMesh => {
  const byPosition = new Map<string, number>();
  const vertices: Vector[] = [];
  const remap = mesh.vertices.map((vertex) => {
    const key = vertex.map((value) => Math.round(value * 1e5)).join(',');
    let index = byPosition.get(key);
    if (index == null) {
      index = vertices.push(vertex) - 1;
      byPosition.set(key, index);
    }
    return index;
  });
  return {
    vertices,
    triangles: mesh.triangles.map(([a, b, c]) => [remap[a], remap[b], remap[c]]),
    materials: mesh.materials,
  };
};

/**
 * Splits every edge longer than `length` in the middle until none is (or the mesh reaches MAX_TRIANGLES).
 * An edge is split for both triangles that share it, so the result has no cracks.
 */
export const refine = (mesh: TriangleMesh, length: number): TriangleMesh => {
  let { vertices, triangles, materials } = mesh;
  vertices = [...vertices];
  for (let pass = 0; pass < 8; pass++) {
    const midpoints = new Map<string, number>();
    const edgeKey = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`);
    const midpoint = (a: number, b: number) => {
      if (distance(vertices[a], vertices[b]) <= length) {
        return -1;
      }
      const key = edgeKey(a, b);
      let index = midpoints.get(key);
      if (index == null) {
        const [ax, ay, az] = vertices[a],
          [bx, by, bz] = vertices[b];
        index = vertices.push([(ax + bx) / 2, (ay + by) / 2, (az + bz) / 2]) - 1;
        midpoints.set(key, index);
      }
      return index;
    };
    const nextTriangles: [number, number, number][] = [];
    const nextMaterials: (string | null)[] = [];
    let split = false;
    for (const [index, [a, b, c]] of triangles.entries()) {
      const material = materials[index];
      const add = (...corners: [number, number, number][]) => {
        for (const corner of corners) {
          nextTriangles.push(corner);
          nextMaterials.push(material);
        }
      };
      const ab = midpoint(a, b),
        bc = midpoint(b, c),
        ca = midpoint(c, a);
      const count = (ab >= 0 ? 1 : 0) + (bc >= 0 ? 1 : 0) + (ca >= 0 ? 1 : 0);
      split ||= count > 0;
      if (count === 0) {
        add([a, b, c]);
      } else if (count === 3) {
        add([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]);
      } else if (count === 1) {
        if (ab >= 0) {
          add([a, ab, c], [ab, b, c]);
        } else if (bc >= 0) {
          add([a, b, bc], [a, bc, c]);
        } else {
          add([a, b, ca], [ca, b, c]);
        }
      } else if (ab < 0) {
        // bc and ca split
        add([a, b, bc], [a, bc, ca], [ca, bc, c]);
      } else if (bc < 0) {
        // ab and ca split
        add([a, ab, ca], [ab, b, c], [ab, c, ca]);
      } else {
        // ab and bc split
        add([a, ab, c], [ab, b, bc], [ab, bc, c]);
      }
    }
    if (!split || nextTriangles.length > MAX_TRIANGLES) {
      break;
    }
    triangles = nextTriangles;
    materials = nextMaterials;
  }
  return { vertices, triangles, materials };
};

/** area-weighted normal per point */
export const vertexNormals = (mesh: TriangleMesh) => {
  const normals: Vector[] = mesh.vertices.map(() => [0, 0, 0]);
  for (const [a, b, c] of mesh.triangles) {
    const [ax, ay, az] = mesh.vertices[a],
      [bx, by, bz] = mesh.vertices[b],
      [cx, cy, cz] = mesh.vertices[c];
    const ux = bx - ax,
      uy = by - ay,
      uz = bz - az,
      vx = cx - ax,
      vy = cy - ay,
      vz = cz - az;
    const normal: Vector = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    for (const corner of [a, b, c]) {
      normals[corner][0] += normal[0];
      normals[corner][1] += normal[1];
      normals[corner][2] += normal[2];
    }
  }
  return normals.map(([x, y, z]) => {
    const length = Math.hypot(x, y, z) || 1;
    return [x / length, y / length, z / length] as Vector;
  });
};

export interface DisplaceOptions extends FractalOptions {
  /** the largest movement in metres (in and out) */
  amount: number;
  /** metres per bump */
  scale: number;
  /** squashes the movement along z (0 = only sideways, 1 = all directions) */
  vertical?: number;
}

/** moves every point along its normal by 3D noise (−amount … amount) */
export const displace = (mesh: TriangleMesh, options: DisplaceOptions): TriangleMesh => {
  const normals = vertexNormals(mesh);
  const scale = Math.max(0.001, options.scale);
  const vertical = options.vertical ?? 1;
  const vertices = mesh.vertices.map(([x, y, z], index) => {
    const offset = fractal(x / scale, y / scale, z / scale, options) * options.amount * (options.mode && options.mode !== 'fbm' ? 2 : 1.6);
    const [nx, ny, nz] = normals[index];
    return [x + nx * offset, y + ny * offset, z + nz * offset * vertical] as Vector;
  });
  return { ...mesh, vertices };
};

/** as a plugin mesh – only the points some triangle uses (the app would keep loose ones) */
export const toPluginMesh = (mesh: TriangleMesh): PluginMesh => {
  const remap = new Map<number, number>();
  const vertices: Vector[] = [];
  const use = (index: number) => {
    let mapped = remap.get(index);
    if (mapped == null) {
      mapped = vertices.push(mesh.vertices[index]) - 1;
      remap.set(index, mapped);
    }
    return mapped;
  };
  return { faces: mesh.triangles.map((triangle) => triangle.map(use)), vertices, faceMaterials: mesh.materials };
};

/** an icosahedron refined `levels` times onto a sphere – the start of rocks and tree crowns */
export const icosphere = (radius: number, levels: number, material: string | null): TriangleMesh => {
  const golden = (1 + Math.sqrt(5)) / 2;
  let vertices: Vector[] = [
    [-1, golden, 0],
    [1, golden, 0],
    [-1, -golden, 0],
    [1, -golden, 0],
    [0, -1, golden],
    [0, 1, golden],
    [0, -1, -golden],
    [0, 1, -golden],
    [golden, 0, -1],
    [golden, 0, 1],
    [-golden, 0, -1],
    [-golden, 0, 1],
  ];
  let triangles: [number, number, number][] = [
    [0, 11, 5],
    [0, 5, 1],
    [0, 1, 7],
    [0, 7, 10],
    [0, 10, 11],
    [1, 5, 9],
    [5, 11, 4],
    [11, 10, 2],
    [10, 7, 6],
    [7, 1, 8],
    [3, 9, 4],
    [3, 4, 2],
    [3, 2, 6],
    [3, 6, 8],
    [3, 8, 9],
    [4, 9, 5],
    [2, 4, 11],
    [6, 2, 10],
    [8, 6, 7],
    [9, 8, 1],
  ];
  for (let level = 0; level < levels; level++) {
    const midpoints = new Map<string, number>();
    const midpoint = (a: number, b: number) => {
      const key = a < b ? `${a}:${b}` : `${b}:${a}`;
      let index = midpoints.get(key);
      if (index == null) {
        index = vertices.push(vertices[a].map((value, axis) => (value + vertices[b][axis]) / 2) as Vector) - 1;
        midpoints.set(key, index);
      }
      return index;
    };
    triangles = triangles.flatMap(([a, b, c]) => {
      const ab = midpoint(a, b),
        bc = midpoint(b, c),
        ca = midpoint(c, a);
      return [
        [a, ab, ca],
        [b, bc, ab],
        [c, ca, bc],
        [ab, bc, ca],
      ] as [number, number, number][];
    });
  }
  vertices = vertices.map((vertex) => {
    const length = Math.hypot(...vertex);
    return vertex.map((value) => (value / length) * radius) as Vector;
  });
  return { vertices, triangles, materials: triangles.map(() => material) };
};

/** moves and stretches a mesh (scale per axis, then offset) */
export const transformMesh = (mesh: TriangleMesh, scale: Vector, offset: Vector): TriangleMesh => ({
  ...mesh,
  vertices: mesh.vertices.map(([x, y, z]) => [x * scale[0] + offset[0], y * scale[1] + offset[1], z * scale[2] + offset[2]] as Vector),
});

/** several meshes as one */
export const joinMeshes = (...meshes: TriangleMesh[]): TriangleMesh => {
  const joined: TriangleMesh = { vertices: [], triangles: [], materials: [] };
  for (const mesh of meshes) {
    const start = joined.vertices.length;
    joined.vertices.push(...mesh.vertices);
    joined.triangles.push(...mesh.triangles.map(([a, b, c]) => [a + start, b + start, c + start] as [number, number, number]));
    joined.materials.push(...mesh.materials);
  }
  return joined;
};

/** an upright cone or (with top radius) a frustum with `sides` sides, closed at the bottom */
export const cone = (
  radius: number,
  topRadius: number,
  height: number,
  sides: number,
  z: number,
  material: string | null,
): TriangleMesh => {
  const vertices: Vector[] = [];
  const triangles: [number, number, number][] = [];
  for (let side = 0; side < sides; side++) {
    const angle = (side / sides) * Math.PI * 2;
    vertices.push([Math.cos(angle) * radius, Math.sin(angle) * radius, z]);
  }
  const pointed = topRadius <= 0;
  if (pointed) {
    vertices.push([0, 0, z + height]);
  } else {
    for (let side = 0; side < sides; side++) {
      const angle = (side / sides) * Math.PI * 2;
      vertices.push([Math.cos(angle) * topRadius, Math.sin(angle) * topRadius, z + height]);
    }
  }
  const bottomCentre = vertices.push([0, 0, z]) - 1;
  for (let side = 0; side < sides; side++) {
    const next = (side + 1) % sides;
    if (pointed) {
      triangles.push([side, next, sides]);
    } else {
      triangles.push([side, next, sides + next], [side, sides + next, sides + side]);
    }
    triangles.push([next, side, bottomCentre]);
  }
  if (!pointed) {
    const topCentre = vertices.push([0, 0, z + height]) - 1;
    for (let side = 0; side < sides; side++) {
      triangles.push([sides + side, sides + ((side + 1) % sides), topCentre]);
    }
  }
  return { vertices, triangles, materials: triangles.map(() => material) };
};

export interface BendOptions {
  /** turn of the top against the bottom round the vertical axis (degrees) */
  twist?: number;
  /** size of the top compared with the bottom (1 = unchanged, 0 = a point) */
  taper?: number;
  /** how far the top bends over towards +x (degrees) */
  bend?: number;
}

/**
 * Twists, tapers and bends a mesh along its height (z) – like the modifiers of other 3D programs. The bottom
 * stays where it is; the axis runs through the middle of the mesh's footprint.
 */
export const bendMesh = (mesh: TriangleMesh, options: BendOptions): TriangleMesh => {
  const twist = ((options.twist ?? 0) * Math.PI) / 180,
    taper = options.taper ?? 1,
    bend = ((options.bend ?? 0) * Math.PI) / 180;
  if (!twist && taper === 1 && !bend) {
    return mesh;
  }
  const xs = mesh.vertices.map((vertex) => vertex[0]),
    ys = mesh.vertices.map((vertex) => vertex[1]),
    zs = mesh.vertices.map((vertex) => vertex[2]);
  const centreX = (Math.min(...xs) + Math.max(...xs)) / 2,
    centreY = (Math.min(...ys) + Math.max(...ys)) / 2,
    bottom = Math.min(...zs),
    height = Math.max(...zs) - bottom || 1;
  const vertices = mesh.vertices.map(([x, y, z]) => {
    const share = (z - bottom) / height;
    let offsetX = (x - centreX) * (1 + (taper - 1) * share),
      offsetY = (y - centreY) * (1 + (taper - 1) * share);
    const angle = twist * share;
    [offsetX, offsetY] = [offsetX * Math.cos(angle) - offsetY * Math.sin(angle), offsetX * Math.sin(angle) + offsetY * Math.cos(angle)];
    let level = z - bottom;
    if (bend) {
      // the height becomes an arc round a centre at radius height/bend on the +x side
      const radius = height / bend;
      const theta = bend * share;
      const fromCentre = radius - offsetX;
      offsetX = radius - fromCentre * Math.cos(theta);
      level = fromCentre * Math.sin(theta);
    }
    return [centreX + offsetX, centreY + offsetY, bottom + level] as Vector;
  });
  return { ...mesh, vertices };
};

import type { ScriptApi } from '../../../src/scripting/api';
import type { Parts, Point3 } from './catalog';
import { FINISHES, materialName, type MaterialId } from './materials';
import { THREE } from './runtime';

/**
 * The building blocks of the catalog on the app's script API: every part is a box, cylinder or sphere group of
 * the app (so it stays editable), its material made once per finish. Prisms and beams are convex solids made
 * with s3d.polyhedron – their faces are turned outwards here.
 */

/** a convex solid's faces, each turned so it faces away from the solid's centre */
const outwardFaces = (points: Point3[], faces: number[][]) => {
  const centre = points.reduce((sum, point) => sum.add(new THREE.Vector3(...point)), new THREE.Vector3()).divideScalar(points.length);
  return faces.map((face) => {
    const [a, b, c] = face.slice(0, 3).map((index) => new THREE.Vector3(...points[index]));
    const normal = b.clone().sub(a).cross(c.clone().sub(a));
    const middle = face.reduce((sum, index) => sum.add(new THREE.Vector3(...points[index])), new THREE.Vector3()).divideScalar(face.length);
    return normal.dot(middle.sub(centre)) < 0 ? [...face].reverse() : face;
  });
};

/** a convex polygon (x, y) from z0 up by h – bottom, top and sides */
export const prismSolid = (points: [number, number][], z0: number, h: number) => {
  const count = points.length;
  const vertices: Point3[] = [...points.map(([x, y]): Point3 => [x, y, z0]), ...points.map(([x, y]): Point3 => [x, y, z0 + h])];
  const faces = [
    points.map((_, i) => i),
    points.map((_, i) => count + i),
    ...points.map((_, i) => [i, (i + 1) % count, count + ((i + 1) % count), count + i]),
  ];
  return { vertices, faces: outwardFaces(vertices, faces) };
};

/** a bar of width × height from a to b (its width lies horizontal, across the direction) */
export const beamSolid = (a: Point3, b: Point3, width: number, height: number) => {
  const start = new THREE.Vector3(...a),
    end = new THREE.Vector3(...b);
  const direction = end.clone().sub(start).normalize();
  const side =
    Math.abs(direction.z) > 0.999
      ? new THREE.Vector3(1, 0, 0)
      : direction
          .clone()
          .cross(new THREE.Vector3(0, 0, 1))
          .normalize();
  const up = side.clone().cross(direction).normalize();
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ];
  const vertices: Point3[] = [start, end].flatMap((point) =>
    corners.map(
      ([s, u]) =>
        point
          .clone()
          .addScaledVector(side, (s * width) / 2)
          .addScaledVector(up, (u * height) / 2)
          .toArray() as Point3,
    ),
  );
  const faces = [
    [0, 1, 2, 3],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ];
  return { vertices, faces: outwardFaces(vertices, faces) };
};

/** any convex solid (vertices and faces as index lists) – faces are turned outwards */
export const convexSolid = (vertices: Point3[], faces: number[][]) => ({ vertices, faces: outwardFaces(vertices, faces) });

export const usePartsOf = (
  api: ScriptApi,
): Parts & {
  solid: (solid: { vertices: Point3[]; faces: number[][] }, material: MaterialId) => void;
  /** the model's name of a finish (made on first use) */
  material: (id: MaterialId) => string;
} => {
  const made = new Map<MaterialId, string>();
  const material = (id: MaterialId) => {
    let name = made.get(id);
    if (!name) {
      const finish = FINISHES[id];
      name = materialName(id);
      api.material(name, finish.color, { opacity: finish.opacity ?? 1, texture: finish.texture, size: finish.size });
      made.set(id, name);
    }
    return name;
  };
  const solid = ({ vertices, faces }: { vertices: Point3[]; faces: number[][] }, id: MaterialId) => {
    api.group(material(id), () => api.polyhedron(vertices, faces, { material: material(id) }));
  };
  return {
    box: (x, y, z, w, d, h, id) => {
      if (w > 0.0005 && d > 0.0005 && h > 0.0005) {
        api.box([x, y, z], w, d, h, { name: material(id), material: material(id) });
      }
    },
    cylinder: (x, y, z, radius, h, id, segments = 16) => {
      api.cylinder([x, y, z], radius, h, { segments, name: material(id), material: material(id) });
    },
    sphere: (x, y, z, radius, id) => {
      api.sphere([x, y, z], radius, { segments: 16, name: material(id), material: material(id) });
    },
    prism: (points, z0, h, id) => {
      if (h > 0.0005 && points.length >= 3) {
        solid(prismSolid(points, z0, h), id);
      }
    },
    beam: (a, b, width, height, id) => solid(beamSolid(a, b, width, height), id),
    solid,
    material,
  };
};

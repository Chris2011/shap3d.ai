/**
 * The geometry of the plugin's own bricks, in metres (Z up), built from the usual measures of the 8 mm stud grid.
 * Pure functions without the app, so they can be tested. A brick's origin is the middle of its underside.
 */

/** from one stud to the next */
export const PITCH = 0.008;
export const BRICK_HEIGHT = 0.0096;
export const PLATE_HEIGHT = 0.0032;
const BASEPLATE_HEIGHT = 0.0016;
const STUD_RADIUS = 0.0024;
const STUD_HEIGHT = 0.0017;
const WALL = 0.0012;
const CEILING = 0.001;
const TUBE_OUTER = 0.003255;
const TUBE_INNER = 0.0024;
const PIN_RADIUS = 0.0015;
/** each side stays this much inside its cells, so neighbours do not share a surface */
const CLEARANCE = 0.0001;
const STUD_SEGMENTS = 12;

export type Point3 = [number, number, number];
type Point2 = [number, number];

export interface BrickMesh {
  vertices: Point3[];
  faces: number[][];
}

interface MeshWriter extends BrickMesh {
  /** a polygon, counter-clockwise seen from outside */
  face: (points: Point3[]) => void;
}

const createMesh = (): MeshWriter => {
  const vertices: Point3[] = [];
  const faces: number[][] = [];
  const known = new Map<string, number>();
  const indexOf = (point: Point3) => {
    const key = point.map((value) => Math.round(value * 1e7)).join();
    let index = known.get(key);
    if (index === undefined) {
      index = vertices.length;
      known.set(key, index);
      vertices.push(point);
    }
    return index;
  };
  return { vertices, faces, face: (points) => faces.push(points.map(indexOf)) };
};

const box = (mesh: MeshWriter, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
  mesh.face([
    [x0, y0, z0],
    [x0, y1, z0],
    [x1, y1, z0],
    [x1, y0, z0],
  ]);
  mesh.face([
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ]);
  mesh.face([
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y0, z1],
    [x0, y0, z1],
  ]);
  mesh.face([
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y1, z1],
    [x1, y1, z1],
  ]);
  mesh.face([
    [x0, y1, z0],
    [x0, y0, z0],
    [x0, y0, z1],
    [x0, y1, z1],
  ]);
  mesh.face([
    [x1, y0, z0],
    [x1, y1, z0],
    [x1, y1, z1],
    [x1, y0, z1],
  ]);
};

const circle = (cx: number, cy: number, z: number, radius: number, segments: number): Point3[] =>
  Array.from({ length: segments }, (_, i) => {
    const angle = (2 * Math.PI * i) / segments;
    return [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle), z];
  });

/** the side of a cone or cylinder between two rings – turned inwards for the inside of a tube */
const ringSide = (mesh: MeshWriter, lower: Point3[], upper: Point3[], inwards = false) => {
  lower.forEach((point, i) => {
    const next = (i + 1) % lower.length;
    const quad: Point3[] = [point, lower[next], upper[next], upper[i]];
    mesh.face(inwards ? quad.reverse() : quad);
  });
};

/** a cylinder or cone standing at (cx, cy); `base` closes its underside */
const round = (
  mesh: MeshWriter,
  cx: number,
  cy: number,
  z0: number,
  z1: number,
  r0: number,
  r1: number,
  segments: number,
  base = false,
) => {
  const lower = circle(cx, cy, z0, r0, segments);
  const upper = circle(cx, cy, z1, r1, segments);
  ringSide(mesh, lower, upper);
  mesh.face(upper);
  if (base) {
    mesh.face([...lower].reverse());
  }
};

/** a ring seen from below, for the open end of a tube */
const ringBottom = (mesh: MeshWriter, outer: Point3[], inner: Point3[]) => {
  outer.forEach((point, i) => {
    const next = (i + 1) % outer.length;
    mesh.face([point, inner[i], inner[next], outer[next]]);
  });
};

/** the middle of a stud column or row: `count` cells around 0 */
const cellCentre = (index: number, count: number) => (index - (count - 1) / 2) * PITCH;

const studs = (
  mesh: MeshWriter,
  w: number,
  d: number,
  z: number,
  wanted: (ix: number, iy: number) => boolean = () => true,
  segments = STUD_SEGMENTS,
) => {
  for (let ix = 0; ix < w; ix++) {
    for (let iy = 0; iy < d; iy++) {
      if (wanted(ix, iy)) {
        round(mesh, cellCentre(ix, w), cellCentre(iy, d), z, z + STUD_HEIGHT, STUD_RADIUS, STUD_RADIUS, segments);
      }
    }
  }
};

/** outer walls, top, and the open underside with its walls and ceiling */
const shell = (mesh: MeshWriter, w: number, d: number, height: number, outsideOnly = false) => {
  const X = (w * PITCH) / 2 - CLEARANCE;
  const Y = (d * PITCH) / 2 - CLEARANCE;
  const x = X - WALL;
  const y = Y - WALL;
  const ceiling = height - CEILING;
  const corners = (a: number, b: number, z: number): Point3[] => [
    [-a, -b, z],
    [a, -b, z],
    [a, b, z],
    [-a, b, z],
  ];
  const outerBottom = corners(X, Y, 0);
  const innerBottom = corners(x, y, 0);
  mesh.face(corners(X, Y, height));
  ringSide(mesh, outerBottom, corners(X, Y, height));
  if (outsideOnly) {
    return;
  }
  ringSide(mesh, innerBottom, corners(x, y, ceiling), true);
  ringBottom(mesh, outerBottom, innerBottom);
  mesh.face(corners(x, y, ceiling).reverse());
};

/** tubes between the studs of a wide brick, pins under a narrow one – what holds the stud below */
const underside = (mesh: MeshWriter, w: number, d: number, height: number) => {
  const top = height - CEILING;
  const pin = (cx: number, cy: number) => {
    const lower = circle(cx, cy, 0, PIN_RADIUS, 8);
    ringSide(mesh, lower, circle(cx, cy, top, PIN_RADIUS, 8));
    mesh.face([...lower].reverse());
  };
  if (w >= 2 && d >= 2) {
    for (let ix = 0; ix < w - 1; ix++) {
      for (let iy = 0; iy < d - 1; iy++) {
        const cx = (ix + 1 - w / 2) * PITCH;
        const cy = (iy + 1 - d / 2) * PITCH;
        const outer = circle(cx, cy, 0, TUBE_OUTER, STUD_SEGMENTS);
        const inner = circle(cx, cy, 0, TUBE_INNER, STUD_SEGMENTS);
        ringSide(mesh, outer, circle(cx, cy, top, TUBE_OUTER, STUD_SEGMENTS));
        ringSide(mesh, inner, circle(cx, cy, top, TUBE_INNER, STUD_SEGMENTS), true);
        ringBottom(mesh, outer, inner);
      }
    }
  } else if (Math.max(w, d) >= 2) {
    const long = Math.max(w, d);
    for (let i = 0; i < long - 1; i++) {
      const along = (i + 1 - long / 2) * PITCH;
      pin(w >= d ? along : 0, w >= d ? 0 : along);
    }
  }
};

/** a polygon (y, z), counter-clockwise seen from +x, as a solid from x0 to x1 */
const extrudeX = (mesh: MeshWriter, profile: Point2[], x0: number, x1: number) => {
  mesh.face(profile.map(([y, z]): Point3 => [x1, y, z]));
  mesh.face(profile.map(([y, z]): Point3 => [x0, y, z]).reverse());
  profile.forEach(([y, z], i) => {
    const [nextY, nextZ] = profile[(i + 1) % profile.length];
    mesh.face([
      [x1, y, z],
      [x0, y, z],
      [x0, nextY, nextZ],
      [x1, nextY, nextZ],
    ]);
  });
};

/** a polygon (x, z), counter-clockwise seen from -y, as a solid from y0 to y1 */
const extrudeY = (mesh: MeshWriter, profile: Point2[], y0: number, y1: number) => {
  mesh.face(profile.map(([x, z]): Point3 => [x, y0, z]));
  mesh.face(profile.map(([x, z]): Point3 => [x, y1, z]).reverse());
  profile.forEach(([x, z], i) => {
    const [nextX, nextZ] = profile[(i + 1) % profile.length];
    mesh.face([
      [x, y0, z],
      [x, y1, z],
      [nextX, y1, nextZ],
      [nextX, y0, nextZ],
    ]);
  });
};

// ------------------------------------------------------------ the kinds of brick
export interface BuildOptions {
  /** leaves out what cannot be seen from above – for small pictures */
  outsideOnly?: boolean;
}
export type Builder = (mesh: MeshWriter, options: BuildOptions) => void;

const half = (studCount: number) => (studCount * PITCH) / 2 - CLEARANCE;

export const blockBuilder =
  (w: number, d: number, height: number, withStuds = true): Builder =>
  (mesh, { outsideOnly }) => {
    shell(mesh, w, d, height, outsideOnly);
    if (!outsideOnly) {
      underside(mesh, w, d, height);
    }
    if (withStuds) {
      studs(mesh, w, d, height);
    }
  };

/** a thin plate with a closed underside and simple studs – it may have thousands of them */
export const baseplateBuilder =
  (studsWide: number): Builder =>
  (mesh) => {
    const size = half(studsWide);
    box(mesh, -size, -size, 0, size, size, BASEPLATE_HEIGHT);
    studs(mesh, studsWide, studsWide, BASEPLATE_HEIGHT, () => true, 8);
  };
export const BASEPLATE_STACK = BASEPLATE_HEIGHT;

/** falls towards -y; the last `flatRows` rows at the back stay flat and carry studs */
export const slopeBuilder =
  (w: number, d: number, height: number, flatRows: number): Builder =>
  (mesh) => {
    const X = half(w);
    const Y = half(d);
    const flatDepth = flatRows > 0 ? flatRows * PITCH : WALL;
    extrudeX(
      mesh,
      [
        [-Y, 0],
        [Y, 0],
        [Y, height],
        [Y - flatDepth, height],
        [-Y, Math.min(WALL, height / 3)],
      ],
      -X,
      X,
    );
    studs(mesh, w, d, height, (_ix, iy) => iy >= d - flatRows);
  };

/** the same upside down: its underside narrows towards the back, its top is whole */
export const invertedSlopeBuilder =
  (w: number, d: number, height: number): Builder =>
  (mesh) => {
    const X = half(w);
    const Y = half(d);
    extrudeX(
      mesh,
      [
        [Y - PITCH, 0],
        [Y, 0],
        [Y, height],
        [-Y, height],
        [-Y, height - WALL],
      ],
      -X,
      X,
    );
    studs(mesh, w, d, height);
  };

export const roundBuilder =
  (studsWide: number, height: number): Builder =>
  (mesh) => {
    const segments = studsWide > 1 ? 24 : 16;
    const radius = half(studsWide);
    round(mesh, 0, 0, 0, height, radius, radius, segments, true);
    studs(mesh, studsWide, studsWide, height);
  };

export const coneBuilder = (): Builder => (mesh) => {
  round(mesh, 0, 0, 0, BRICK_HEIGHT, half(1), STUD_RADIUS, 16, true);
  studs(mesh, 1, 1, BRICK_HEIGHT);
};

/** two cells wide and deep, the cell at the front right is missing */
export const cornerBuilder =
  (height: number): Builder =>
  (mesh) => {
    const H = half(2);
    const inner = CLEARANCE;
    const outline: Point2[] = [
      [-H, -H],
      [-inner, -H],
      [-inner, -inner],
      [H, -inner],
      [H, H],
      [-H, H],
    ];
    mesh.face(outline.map(([x, y]): Point3 => [x, y, height]));
    mesh.face(outline.map(([x, y]): Point3 => [x, y, 0]).reverse());
    outline.forEach(([x, y], i) => {
      const [nextX, nextY] = outline[(i + 1) % outline.length];
      mesh.face([
        [x, y, 0],
        [nextX, nextY, 0],
        [nextX, nextY, height],
        [x, y, height],
      ]);
    });
    studs(mesh, 2, 2, height, (ix, iy) => !(ix === 1 && iy === 0));
  };

/** one cell deep, standing on a cell at each end, with a round opening between them */
export const archBuilder =
  (w: number, height: number): Builder =>
  (mesh) => {
    const X = half(w);
    const Y = half(1);
    const opening = ((w - 2) * PITCH) / 2;
    const rise = height - PLATE_HEIGHT / 2;
    const arc: Point2[] = Array.from({ length: 13 }, (_, i) => {
      const angle = Math.PI - (Math.PI * i) / 12;
      return [opening * Math.cos(angle), rise * Math.sin(angle)];
    });
    extrudeY(mesh, [[-X, 0], ...arc, [X, 0], [X, height], [-X, height]], -Y, Y);
    studs(mesh, w, 1, height);
  };

/** a frame one cell deep: top and sides, with a sill for a window, without one for a door */
export const frameBuilder =
  (w: number, height: number, sill: boolean): Builder =>
  (mesh) => {
    const X = half(w);
    const Y = half(1);
    const post = WALL * 1.5;
    const bottom = sill ? PLATE_HEIGHT : 0;
    if (sill) {
      box(mesh, -X, -Y, 0, X, Y, PLATE_HEIGHT);
    }
    box(mesh, -X, -Y, height - PLATE_HEIGHT, X, Y, height);
    box(mesh, -X, -Y, bottom, -X + post, Y, height - PLATE_HEIGHT);
    box(mesh, X - post, -Y, bottom, X, Y, height - PLATE_HEIGHT);
    studs(mesh, w, 1, height);
  };

/** a thin wall at the back, on a low base, with a rim on top that carries the studs */
export const panelBuilder =
  (w: number, height: number): Builder =>
  (mesh) => {
    const X = half(w);
    const Y = half(1);
    box(mesh, -X, -Y, 0, X, Y, PLATE_HEIGHT);
    box(mesh, -X, Y - WALL, PLATE_HEIGHT, X, Y, height - PLATE_HEIGHT);
    box(mesh, -X, -Y, height - PLATE_HEIGHT, X, Y, height);
    studs(mesh, w, 1, height);
  };

/** a part's faces and points */
export const buildMesh = (builder: Builder, options: BuildOptions = {}): BrickMesh => {
  const mesh = createMesh();
  builder(mesh, options);
  return { vertices: mesh.vertices, faces: mesh.faces };
};

// The parts as meshes – walls along a line, straight and spiral stairs – closed bodies with their faces facing out.
// Plain numbers only (no three.js), so they can be checked on their own (scripts/checks/linework.check.mts).

export type Point = [number, number, number];
export interface Mesh {
  vertices: Point[];
  faces: number[][];
}

export interface WallParams {
  thickness: number;
  height: number;
  /** where the wall lies: on the left of the line (seen along it), centred on it, or on its right */
  align: 'left' | 'center' | 'right';
}
export interface StairParams {
  width: number;
  height: number;
  steps: number;
}
export interface SpiralParams {
  height: number;
  steps: number;
  /** degrees it turns from bottom to top – negative turns clockwise */
  turn: number;
  /** the spindle's radius (0 = none) */
  inner: number;
  /** thickness of each step */
  thickness: number;
}

const add = (a: Point, b: Point): Point => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Point, factor: number): Point => [a[0] * factor, a[1] * factor, a[2] * factor];

/** a mesh being built: points are added once per face (the app welds equal points) */
const meshBuilder = () => {
  const mesh: Mesh = { vertices: [], faces: [] };
  return {
    mesh,
    face: (points: Point[]) => {
      const start = mesh.vertices.length;
      mesh.vertices.push(...points);
      mesh.faces.push(points.map((_, index) => start + index));
    },
  };
};

/**
 * A prism: the profile (counter-clockwise in the u–v plane) placed at `origin` and pushed `depth` along w = u × v.
 * Its faces face outwards.
 */
const extrudeProfile = (face: (points: Point[]) => void, profile: [number, number][], origin: Point, u: Point, v: Point, depth: number) => {
  const w: Point = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const at = (index: number, side: 0 | 1) => {
    const [a, b] = profile[index];
    return add(add(add(origin, scale(u, a)), scale(v, b)), scale(w, side * depth));
  };
  face(profile.map((_, index) => at(index, 1)));
  face(profile.map((_, index) => at(profile.length - 1 - index, 0)));
  for (let index = 0; index < profile.length; index++) {
    const next = (index + 1) % profile.length;
    face([at(index, 0), at(next, 0), at(next, 1), at(index, 1)]);
  }
};

/** the way to the left of a horizontal direction, as a unit vector (0 for a vertical segment) */
const leftOf = (from: Point, to: Point): Point => {
  const dx = to[0] - from[0],
    dy = to[1] - from[1];
  const length = Math.hypot(dx, dy);
  return length < 1e-9 ? [0, 0, 0] : [-dy / length, dx / length, 0];
};

/**
 * A wall standing on the line `path` (closed: back to its start). At the corners its sides meet in a mitre; very sharp
 * corners are cut off at four times the thickness.
 */
export const wallMesh = (path: Point[], closed: boolean, params: WallParams): Mesh => {
  const { mesh, face } = meshBuilder();
  const count = path.length;
  if (count < 2 || params.thickness <= 0 || params.height <= 0) {
    return mesh;
  }
  const [toLeft, toRight] =
    params.align === 'left'
      ? [params.thickness, 0]
      : params.align === 'right'
        ? [0, -params.thickness]
        : [params.thickness / 2, -params.thickness / 2];
  // the offset at each point: along the bisector of its two segments, longer at a corner so the sides stay parallel
  const mitre = (index: number): Point => {
    const previous = closed ? path[(index - 1 + count) % count] : path[index - 1];
    const next = closed ? path[(index + 1) % count] : path[index + 1];
    const before = previous ? leftOf(previous, path[index]) : null;
    const after = next ? leftOf(path[index], next) : null;
    const one = before ?? after!,
      two = after ?? before!;
    const sum: Point = [one[0] + two[0], one[1] + two[1], 0];
    const length = Math.hypot(sum[0], sum[1]);
    if (length < 1e-9) {
      return one;
    }
    const cos = (one[0] * sum[0] + one[1] * sum[1]) / length;
    return scale([sum[0] / length, sum[1] / length, 0], 1 / Math.max(cos, 0.25));
  };
  const up: Point = [0, 0, params.height];
  const left = path.map((point, index) => add(point, scale(mitre(index), toLeft)));
  const right = path.map((point, index) => add(point, scale(mitre(index), toRight)));
  const segments = closed ? count : count - 1;
  for (let index = 0; index < segments; index++) {
    const next = (index + 1) % count;
    const [l0, l1, r0, r1] = [left[index], left[next], right[index], right[next]];
    face([add(r0, up), add(r1, up), add(l1, up), add(l0, up)]); // top
    face([l0, l1, r1, r0]); // bottom
    face([add(l0, up), add(l1, up), l1, l0]); // left side
    face([r0, r1, add(r1, up), add(r0, up)]); // right side
  }
  if (!closed) {
    const last = count - 1;
    face([left[0], right[0], add(right[0], up), add(left[0], up)]); // start
    face([right[last], left[last], add(left[last], up), add(right[last], up)]); // end
  }
  return mesh;
};

/** a straight flight from `start` up to `end` (the line is its middle), solid down to the floor */
export const stairMesh = (start: Point, end: Point, params: StairParams): Mesh => {
  const { mesh, face } = meshBuilder();
  const run = Math.hypot(end[0] - start[0], end[1] - start[1]);
  const steps = Math.max(1, Math.round(params.steps));
  if (run < 1e-6 || params.width <= 0 || params.height <= 0) {
    return mesh;
  }
  const along: Point = [(end[0] - start[0]) / run, (end[1] - start[1]) / run, 0];
  const going = run / steps,
    rise = params.height / steps;
  // the sawtooth of the flight, counter-clockwise (along the floor, up the back, down the steps)
  const profile: [number, number][] = [
    [0, 0],
    [run, 0],
  ];
  for (let step = steps - 1; step >= 0; step--) {
    profile.push([(step + 1) * going, (step + 1) * rise], [step * going, (step + 1) * rise]);
  }
  // w = along × up points to the right: start on the left edge
  const right: Point = [along[1], -along[0], 0];
  extrudeProfile(face, profile, add(start, scale(right, -params.width / 2)), along, [0, 0, 1], params.width);
  return mesh;
};

/** a spiral stair around `center`: wedge steps out to `radius`, starting towards `startAngle` (radians) */
export const spiralMesh = (center: Point, radius: number, startAngle: number, params: SpiralParams): Mesh => {
  const { mesh, face } = meshBuilder();
  const steps = Math.max(1, Math.round(params.steps));
  if (radius <= params.inner || params.height <= 0) {
    return mesh;
  }
  const turn = (params.turn * Math.PI) / 180;
  const sweep = turn / steps;
  const rise = params.height / steps;
  const thickness = Math.min(Math.max(params.thickness, 0.01), rise);
  const arc = 3; // segments per step along its curved edges
  for (let step = 0; step < steps; step++) {
    // counter-clockwise in the plane, whichever way the stair turns
    const [a0, a1] = [startAngle + step * sweep, startAngle + (step + 1) * sweep].sort((x, y) => x - y);
    const profile: [number, number][] = [];
    for (let k = 0; k <= arc; k++) {
      const angle = a0 + ((a1 - a0) * k) / arc;
      profile.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
    if (params.inner > 1e-6) {
      for (let k = arc; k >= 0; k--) {
        const angle = a0 + ((a1 - a0) * k) / arc;
        profile.push([Math.cos(angle) * params.inner, Math.sin(angle) * params.inner]);
      }
    } else {
      profile.push([0, 0]); // without a spindle the steps meet in the middle
    }
    const top = (step + 1) * rise;
    extrudeProfile(face, profile, add(center, [0, 0, top - thickness]), [1, 0, 0], [0, 1, 0], thickness);
  }
  if (params.inner > 0) {
    const circle: [number, number][] = [];
    for (let k = 0; k < 16; k++) {
      circle.push([Math.cos((k / 16) * Math.PI * 2) * params.inner, Math.sin((k / 16) * Math.PI * 2) * params.inner]);
    }
    extrudeProfile(face, circle, center, [1, 0, 0], [0, 1, 0], params.height);
  }
  return mesh;
};

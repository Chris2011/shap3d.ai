import { displace, icosphere, joinMeshes, transformMesh, type TriangleMesh, type Vector } from './mesh';
import { fractal, randomGenerator } from './noise';

/**
 * Procedural trees: a trunk that forks again and again (each branch shorter and thinner, at an angle, turned
 * round its parent), every branch bent by 3D noise, leaves as clusters of noise-bent spheres at the tips.
 * Conifers grow a straight stem with whorls of drooping branches, palms a leaning stem with a crown of fronds.
 */

export const TREE_SPECIES = ['oak', 'birch', 'pine', 'palm'] as const;
export type TreeSpecies = (typeof TREE_SPECIES)[number];

// i18n-ignore-start – material names (model content)
export const TREE_MATERIALS = {
  bark: 'Rinde',
  birchBark: 'Birkenrinde',
  leaves: 'Laub',
  birchLeaves: 'Birkenlaub',
  needles: 'Nadeln',
  palmTrunk: 'Palmstamm',
  fronds: 'Palmwedel',
};
// i18n-ignore-end
export const TREE_COLOURS: Record<keyof typeof TREE_MATERIALS, string> = {
  bark: '#6b4a32',
  birchBark: '#e6e1d6',
  leaves: '#4c8a3c',
  birchLeaves: '#8cb84c',
  needles: '#2e5a35',
  palmTrunk: '#8a7356',
  fronds: '#5d8f3a',
};

export interface TreeOptions {
  species: TreeSpecies;
  /** total height (m) */
  height: number;
  /** 0 … 1: how much the branches bend */
  gnarl: number;
  /** 0 … 1: how full the crown is (more branches and leaves) */
  density: number;
  seed: number;
}

export const TREE_DEFAULTS: TreeOptions = { species: 'oak', height: 9, gnarl: 0.5, density: 0.6, seed: 1 };

// ------------------------------------------------------------ vector helpers
const add = (a: Vector, b: Vector): Vector => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: Vector, factor: number): Vector => [a[0] * factor, a[1] * factor, a[2] * factor];
const cross = (a: Vector, b: Vector): Vector => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vector, b: Vector) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const normalise = (a: Vector): Vector => {
  const length = Math.hypot(...a) || 1;
  return [a[0] / length, a[1] / length, a[2] / length];
};
/** any unit vector at right angles to `a` */
const perpendicular = (a: Vector): Vector => normalise(Math.abs(a[2]) < 0.9 ? cross(a, [0, 0, 1]) : cross(a, [1, 0, 0]));
/** `direction` tilted by `tilt` (rad) away from itself, towards the side at `turn` (rad) round it */
const tilted = (direction: Vector, tilt: number, turn: number): Vector => {
  const side = perpendicular(direction);
  const other = cross(direction, side);
  const sideways = add(scale(side, Math.cos(turn)), scale(other, Math.sin(turn)));
  return normalise(add(scale(direction, Math.cos(tilt)), scale(sideways, Math.sin(tilt))));
};

/** a tube along a polyline – rings of `sides` points with their radius, closed at the end */
const tube = (points: Vector[], radii: number[], sides: number, material: string): TriangleMesh => {
  const vertices: Vector[] = [];
  const triangles: [number, number, number][] = [];
  let normal: Vector | null = null;
  for (let index = 0; index < points.length; index++) {
    const tangent = normalise(
      index === 0
        ? add(points[1], scale(points[0], -1))
        : index === points.length - 1
          ? add(points[index], scale(points[index - 1], -1))
          : add(points[index + 1], scale(points[index - 1], -1)),
    );
    // parallel transport: keep the previous ring's normal, only made square to the new tangent
    normal = normalise(normal ? add(normal, scale(tangent, -dot(normal, tangent))) : perpendicular(tangent));
    const binormal = cross(tangent, normal);
    for (let side = 0; side < sides; side++) {
      const angle = (side / sides) * Math.PI * 2;
      vertices.push(
        add(points[index], add(scale(normal, Math.cos(angle) * radii[index]), scale(binormal, Math.sin(angle) * radii[index]))),
      );
    }
  }
  for (let ring = 0; ring + 1 < points.length; ring++) {
    for (let side = 0; side < sides; side++) {
      const a = ring * sides + side,
        b = ring * sides + ((side + 1) % sides),
        upperA = a + sides,
        upperB = b + sides;
      triangles.push([a, b, upperB], [a, upperB, upperA]);
    }
  }
  const tip = vertices.push(points[points.length - 1]) - 1;
  const last = (points.length - 1) * sides;
  for (let side = 0; side < sides; side++) {
    triangles.push([tip, last + side, last + ((side + 1) % sides)]);
  }
  return { vertices, triangles, materials: triangles.map(() => material) };
};

/** a cluster of leaves: a sphere bent by noise, a little flattened */
const cluster = (centre: Vector, radius: number, seed: number, material: string, flatten = 0.8): TriangleMesh =>
  transformMesh(
    displace(icosphere(radius, 1, material), { amount: radius * 0.28, scale: radius * 0.9, seed, octaves: 2 }),
    [1, 1, flatten],
    centre,
  );

/** the trunk and branches of a broadleaf tree (oak, birch) */
const broadleaf = (options: TreeOptions, random: () => number): TriangleMesh => {
  const birch = options.species === 'birch';
  const parts: TriangleMesh[] = [];
  const height = options.height;
  const levels = 3;
  const bark = birch ? TREE_MATERIALS.birchBark : TREE_MATERIALS.bark;
  const leaves = birch ? TREE_MATERIALS.birchLeaves : TREE_MATERIALS.leaves;
  const spread = birch ? 0.45 : 0.75;
  const leafRadius = height * (birch ? 0.075 : 0.1) * (0.8 + options.density * 0.4);
  const bend = (point: Vector, length: number, salt: number): Vector => {
    const frequency = 0.6 / Math.max(0.5, length);
    const amount = options.gnarl * length * 0.18;
    return [
      fractal(point[0] * frequency, point[1] * frequency, point[2] * frequency + salt, { seed: options.seed, octaves: 2 }) * amount,
      fractal(point[0] * frequency + 31, point[1] * frequency, point[2] * frequency + salt, { seed: options.seed, octaves: 2 }) * amount,
      0,
    ];
  };
  const grow = (start: Vector, direction: Vector, length: number, radius: number, level: number) => {
    const steps = level === 0 ? 4 : 3;
    const points: Vector[] = [start];
    const radii: number[] = [radius];
    let current = start;
    let heading = direction;
    for (let step = 1; step <= steps; step++) {
      // a little upwards (birches more), then bent by the noise
      heading = normalise(add(heading, [0, 0, birch ? 0.12 : 0.05]));
      current = add(add(current, scale(heading, length / steps)), bend(current, length, level * 7 + step));
      points.push(current);
      radii.push(radius * (1 - (step / steps) * 0.45));
    }
    parts.push(tube(points, radii, level === 0 ? 7 : level === 1 ? 5 : 4, bark));
    if (level >= levels) {
      parts.push(cluster(current, leafRadius * (0.8 + random() * 0.4), options.seed + parts.length, leaves));
      return;
    }
    const children = Math.round(2 + options.density * 2 + random());
    const offset = random() * Math.PI * 2;
    for (let child = 0; child < children; child++) {
      // children spring from the upper part of the branch, turned round it
      const share = 0.55 + (child / children) * 0.45;
      const from = points[Math.min(points.length - 1, Math.round(share * steps))];
      const turn = offset + (child / children) * Math.PI * 2 + (random() - 0.5) * 0.6;
      const tilt = spread * (0.7 + random() * 0.6) * (level === 0 ? 0.8 : 1);
      const childDirection = tilted(heading, tilt, turn);
      const childLength = length * (birch ? 0.62 : 0.68) * (0.8 + random() * 0.4);
      grow(from, childDirection, childLength, radius * 0.55, level + 1);
    }
    // the leader of a birch keeps going up
    if (birch && level < levels) {
      grow(current, tilted(heading, 0.1, random() * Math.PI * 2), length * 0.7, radius * 0.6, level + 1);
    }
  };
  const trunk = height * (birch ? 0.42 : 0.36);
  grow([0, 0, 0], [0, 0, 1], trunk, height * (birch ? 0.022 : 0.035), 0);
  return joinMeshes(...parts);
};

/** a conifer: a straight stem with whorls of drooping branches, needles in flat clusters */
const conifer = (options: TreeOptions, random: () => number): TriangleMesh => {
  const height = options.height;
  const parts: TriangleMesh[] = [
    tube(
      [0, 0.25, 0.5, 0.75, 1].map((share): Vector => [
        Math.sin(share * 3 + options.seed) * options.gnarl * 0.05 * height,
        0,
        share * height,
      ]),
      [1, 0.75, 0.5, 0.3, 0.05].map((factor) => factor * height * 0.025),
      6,
      TREE_MATERIALS.bark,
    ),
  ];
  const whorls = Math.round(6 + options.density * 4);
  for (let whorl = 0; whorl < whorls; whorl++) {
    const share = 0.22 + (whorl / whorls) * 0.72;
    const z = share * height;
    const length = height * 0.32 * (1 - share) + height * 0.04;
    const branches = 5;
    const offset = random() * Math.PI;
    for (let branch = 0; branch < branches; branch++) {
      const turn = offset + (branch / branches) * Math.PI * 2;
      const out: Vector = [Math.cos(turn), Math.sin(turn), 0];
      const droop = -0.25 - options.gnarl * 0.2;
      const end = add([0, 0, z], add(scale(out, length), [0, 0, length * droop]));
      parts.push(
        tube(
          [[0, 0, z], add([0, 0, z], scale(add(scale(out, length * 0.5), [0, 0, length * droop * 0.3]), 1)), end],
          [height * 0.008, height * 0.006, height * 0.003],
          3,
          TREE_MATERIALS.bark,
        ),
      );
      parts.push(
        cluster(
          add(scale(add([0, 0, z], end), 0.5), [0, 0, length * 0.05]),
          length * 0.55,
          options.seed + whorl * 7 + branch,
          TREE_MATERIALS.needles,
          0.4,
        ),
      );
    }
  }
  parts.push(cluster([0, 0, height * 0.97], height * 0.06, options.seed + 99, TREE_MATERIALS.needles, 1.4));
  return joinMeshes(...parts);
};

/** a palm: a leaning, curved stem and a crown of arching fronds */
const palm = (options: TreeOptions, random: () => number): TriangleMesh => {
  const height = options.height;
  const lean = (random() - 0.5) * 0.5 * (0.4 + options.gnarl);
  const turn = random() * Math.PI * 2;
  const stem: Vector[] = [];
  for (let step = 0; step <= 8; step++) {
    const share = step / 8;
    const sideways = Math.pow(share, 1.6) * lean * height;
    stem.push([Math.cos(turn) * sideways, Math.sin(turn) * sideways, share * height]);
  }
  const parts: TriangleMesh[] = [
    tube(
      stem,
      stem.map((_, step) => height * (0.028 - step * 0.0015)),
      7,
      TREE_MATERIALS.palmTrunk,
    ),
  ];
  const top = stem[stem.length - 1];
  const fronds = Math.round(7 + options.density * 4);
  for (let frond = 0; frond < fronds; frond++) {
    const angle = (frond / fronds) * Math.PI * 2 + random() * 0.3;
    const out: Vector = [Math.cos(angle), Math.sin(angle), 0];
    const side: Vector = [-Math.sin(angle), Math.cos(angle), 0];
    const length = height * (0.42 + random() * 0.12);
    const rise = 0.35 + random() * 0.3;
    // a frond is a folded strip: a rib along an arc, two halves rising to it like a roof
    const vertices: Vector[] = [];
    const triangles: [number, number, number][] = [];
    const steps = 6;
    for (let step = 0; step <= steps; step++) {
      const share = step / steps;
      const rib = add(top, add(scale(out, share * length), [0, 0, length * (rise * share - share * share * 0.9)]));
      const width = length * 0.16 * Math.sin(Math.PI * Math.min(0.98, share * 0.9 + 0.08));
      vertices.push(
        rib,
        add(add(rib, scale(side, width)), [0, 0, -width * 0.35]),
        add(add(rib, scale(side, -width)), [0, 0, -width * 0.35]),
      );
    }
    for (let step = 0; step < steps; step++) {
      const rib = step * 3,
        next = rib + 3;
      // counter-clockwise from above: the frond's upper side faces the sky
      triangles.push([rib, next + 1, rib + 1], [rib, next, next + 1], [rib, next + 2, next], [rib, rib + 2, next + 2]);
    }
    parts.push({ vertices, triangles, materials: triangles.map(() => TREE_MATERIALS.fronds) });
  }
  return joinMeshes(...parts);
};

/** a tree of a species – the same seed always grows the same tree */
export const treeMesh = (options: TreeOptions): TriangleMesh => {
  const random = randomGenerator(options.seed * 3.1 + 0.7);
  if (options.species === 'pine') {
    return conifer(options, random);
  }
  if (options.species === 'palm') {
    return palm(options, random);
  }
  return broadleaf(options, random);
};

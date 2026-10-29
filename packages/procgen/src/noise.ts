/**
 * Seeded simplex noise in 2D and 3D (after Stefan Gustavson's reference implementation) and the fractal
 * variants built from it: fBm, ridged, billow, with domain warping and terraces. Pure functions, no three.js –
 * the same numbers in the panel, in scripts and in the deform tool.
 */

/** a small, fast seeded random generator (mulberry32) – 0 ≤ value < 1 */
export const randomGenerator = (seed: number) => {
  let state = Math.floor(seed * 2654435761) >>> 0 || 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = state;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
};

const GRADIENTS_3D = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];
const F2 = 0.5 * (Math.sqrt(3) - 1),
  G2 = (3 - Math.sqrt(3)) / 6;
const F3 = 1 / 3,
  G3 = 1 / 6;

export interface Simplex {
  /** −1 … 1 */
  noise2: (x: number, y: number) => number;
  /** −1 … 1 */
  noise3: (x: number, y: number, z: number) => number;
}

/** the permutation table for a seed – shuffled once, then every lookup is plain arithmetic */
const permutationFor = (seed: number) => {
  const random = randomGenerator(seed);
  const table = Array.from({ length: 256 }, (_, index) => index);
  for (let index = 255; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [table[index], table[swap]] = [table[swap], table[index]];
  }
  const permutation = new Uint8Array(512);
  for (let index = 0; index < 512; index++) {
    permutation[index] = table[index & 255];
  }
  return permutation;
};

const simplexCache = new Map<number, Simplex>();

/** simplex noise for a seed (cached – asking again for the same seed is free) */
export const simplex = (seed = 0): Simplex => {
  const cached = simplexCache.get(seed);
  if (cached) {
    return cached;
  }
  const permutation = permutationFor(seed);
  const gradientIndex = (index: number) => permutation[index] % 12;

  const noise2 = (x: number, y: number) => {
    const skew = (x + y) * F2;
    const i = Math.floor(x + skew),
      j = Math.floor(y + skew);
    const unskew = (i + j) * G2;
    const x0 = x - (i - unskew),
      y0 = y - (j - unskew);
    const [i1, j1] = x0 > y0 ? [1, 0] : [0, 1];
    const x1 = x0 - i1 + G2,
      y1 = y0 - j1 + G2,
      x2 = x0 - 1 + 2 * G2,
      y2 = y0 - 1 + 2 * G2;
    const ii = i & 255,
      jj = j & 255;
    const corner = (dx: number, dy: number, gradient: number) => {
      const falloff = 0.5 - dx * dx - dy * dy;
      if (falloff < 0) {
        return 0;
      }
      const [gx, gy] = GRADIENTS_3D[gradient];
      return falloff ** 4 * (gx * dx + gy * dy);
    };
    const total =
      corner(x0, y0, gradientIndex(ii + permutation[jj])) +
      corner(x1, y1, gradientIndex(ii + i1 + permutation[jj + j1])) +
      corner(x2, y2, gradientIndex(ii + 1 + permutation[jj + 1]));
    return 70 * total;
  };

  const noise3 = (x: number, y: number, z: number) => {
    const skew = (x + y + z) * F3;
    const i = Math.floor(x + skew),
      j = Math.floor(y + skew),
      k = Math.floor(z + skew);
    const unskew = (i + j + k) * G3;
    const x0 = x - (i - unskew),
      y0 = y - (j - unskew),
      z0 = z - (k - unskew);
    let i1, j1, k1, i2, j2, k2;
    if (x0 >= y0) {
      if (y0 >= z0) {
        [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0];
      } else if (x0 >= z0) {
        [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1];
      } else {
        [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1];
      }
    } else if (y0 < z0) {
      [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1];
    } else if (x0 < z0) {
      [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1];
    } else {
      [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0];
    }
    const ii = i & 255,
      jj = j & 255,
      kk = k & 255;
    const corner = (dx: number, dy: number, dz: number, gradient: number) => {
      const falloff = 0.6 - dx * dx - dy * dy - dz * dz;
      if (falloff < 0) {
        return 0;
      }
      const [gx, gy, gz] = GRADIENTS_3D[gradient];
      return falloff ** 4 * (gx * dx + gy * dy + gz * dz);
    };
    const total =
      corner(x0, y0, z0, gradientIndex(ii + permutation[jj + permutation[kk]])) +
      corner(x0 - i1 + G3, y0 - j1 + G3, z0 - k1 + G3, gradientIndex(ii + i1 + permutation[jj + j1 + permutation[kk + k1]])) +
      corner(x0 - i2 + 2 * G3, y0 - j2 + 2 * G3, z0 - k2 + 2 * G3, gradientIndex(ii + i2 + permutation[jj + j2 + permutation[kk + k2]])) +
      corner(x0 - 1 + 3 * G3, y0 - 1 + 3 * G3, z0 - 1 + 3 * G3, gradientIndex(ii + 1 + permutation[jj + 1 + permutation[kk + 1]]));
    return 32 * total;
  };

  const created = { noise2, noise3 };
  simplexCache.set(seed, created);
  return created;
};

/** how the octaves are combined */
export type NoiseMode = 'fbm' | 'ridged' | 'billow';

export interface FractalOptions {
  seed?: number;
  /** number of layers, each finer than the one before (1–10) */
  octaves?: number;
  /** how much each octave counts compared with the previous one (0–1) */
  persistence?: number;
  /** how much finer each octave is (usually 2) */
  lacunarity?: number;
  mode?: NoiseMode;
}

const clampOctaves = (octaves: number) => Math.max(1, Math.min(10, Math.round(octaves)));

/**
 * Fractal noise at a point (coordinates in noise units, one unit ≈ one feature). Without z it is 2D.
 * fbm: −1 … 1; ridged and billow: 0 … 1 (sharp crests / round bumps).
 */
export const fractal = (x: number, y: number, z: number | undefined, options: FractalOptions = {}) => {
  const { seed = 0, persistence = 0.5, lacunarity = 2, mode = 'fbm' } = options;
  const octaves = clampOctaves(options.octaves ?? 5);
  let total = 0,
    amplitude = 1,
    frequency = 1,
    norm = 0,
    weight = 1;
  for (let octave = 0; octave < octaves; octave++) {
    // every octave gets its own seed, so the layers don't line up at the origin
    const layer = simplex(seed * 31 + octave * 101);
    const value = z == null ? layer.noise2(x * frequency, y * frequency) : layer.noise3(x * frequency, y * frequency, z * frequency);
    if (mode === 'ridged') {
      // ridged multifractal: finer octaves count where the coarser ones already have a crest, so the valleys
      // stay smooth and only the ridges get rugged
      const crest = 1 - Math.abs(value);
      const sharpened = crest * crest * weight;
      weight = Math.min(1, Math.max(0, sharpened * 2));
      total += sharpened * amplitude;
    } else if (mode === 'billow') {
      total += Math.abs(value) * amplitude;
    } else {
      total += value * amplitude;
    }
    norm += amplitude;
    amplitude *= persistence;
    frequency *= lacunarity;
  }
  return total / norm;
};

/** settings of a height field – everything the panel and s3d.noiseTerrain() share */
export interface HeightOptions extends FractalOptions {
  /** metres per feature (hill, valley) */
  scale?: number;
  /** metres from the lowest to the highest point */
  height?: number;
  /** bends the noise by noise – meandering valleys and folded ridges (0 = off, 1 = strong) */
  warp?: number;
  /** steps of this height (m) – 0 = none */
  terraces?: number;
  /** 0 … 1: how sharp the steps are (1 = flat plateaus with vertical risers) */
  terraceSharpness?: number;
  /** pushes the ground down towards the edges: 0 = none, 1 = an island in the sea */
  falloff?: number;
  /** above 1 the valleys get wider and the peaks sharper, below 1 the other way round */
  exponent?: number;
  /** moves the noise without changing its look (m) */
  offsetX?: number;
  offsetY?: number;
}

export const HEIGHT_DEFAULTS: Required<HeightOptions> = {
  seed: 1,
  octaves: 5,
  persistence: 0.5,
  lacunarity: 2,
  mode: 'fbm',
  scale: 20,
  height: 6,
  warp: 0,
  terraces: 0,
  terraceSharpness: 0.6,
  falloff: 0,
  exponent: 1,
  offsetX: 0,
  offsetY: 0,
};

/**
 * A height function for a field `width` × `depth` metres (local x/y from its corner): 0 … height, before terraces.
 * The edge falloff needs the size; everything else is in metres, so a bigger field shows more of the same landscape.
 */
export const heightField = (options: HeightOptions, width: number, depth: number) => {
  const settings = { ...HEIGHT_DEFAULTS, ...options };
  const scale = Math.max(0.01, settings.scale);
  const warpLayer = simplex(settings.seed * 7 + 3);
  const terraceStep = Math.max(0, settings.terraces);
  return (x: number, y: number) => {
    let noiseX = (x + settings.offsetX) / scale,
      noiseY = (y + settings.offsetY) / scale;
    if (settings.warp > 0) {
      const strength = settings.warp * 1.5;
      const shiftX = warpLayer.noise2(noiseX * 0.7 + 5.2, noiseY * 0.7 + 1.3),
        shiftY = warpLayer.noise2(noiseX * 0.7 + 8.3, noiseY * 0.7 + 2.8);
      noiseX += shiftX * strength;
      noiseY += shiftY * strength;
    }
    const raw = fractal(noiseX, noiseY, undefined, settings);
    // fbm is −1 … 1 (mostly −0.6 … 0.6), ridged and billow 0 … 1 – all become 0 … 1
    let unit = settings.mode === 'fbm' ? Math.min(1, Math.max(0, raw * 0.8 + 0.5)) : Math.min(1, Math.max(0, raw));
    if (settings.exponent !== 1) {
      unit = Math.pow(unit, Math.max(0.1, settings.exponent));
    }
    if (settings.falloff > 0 && width > 0 && depth > 0) {
      // distance to the middle, 0 in the centre and 1 at the edge (rounded square)
      const edgeX = Math.abs((x / width) * 2 - 1),
        edgeY = Math.abs((y / depth) * 2 - 1);
      const edge = Math.min(1, Math.pow(Math.pow(edgeX, 4) + Math.pow(edgeY, 4), 0.25));
      const keep = 1 - Math.pow(edge, 2.2);
      unit = unit * (1 - settings.falloff) + unit * keep * settings.falloff - settings.falloff * 0.15 * (1 - keep);
    }
    let height = unit * settings.height;
    if (terraceStep > 0) {
      height = terrace(height, terraceStep, settings.terraceSharpness);
    }
    return height;
  };
};

/** steps of `step` metres; sharpness 0 = unchanged, 1 = flat plateaus */
export const terrace = (height: number, step: number, sharpness: number) => {
  const level = Math.floor(height / step);
  const within = height / step - level;
  // a smooth step that gets steeper with the sharpness – the riser stays a slope, not a wall
  const power = 1 + Math.max(0, Math.min(1, sharpness)) * 7;
  const eased = within < 0.5 ? Math.pow(within * 2, power) / 2 : 1 - Math.pow((1 - within) * 2, power) / 2;
  return (level + eased) * step;
};

// ------------------------------------------------------------ cellular (Worley / Voronoi) noise

/** a well-mixed hash of two integers and a seed – 0 ≤ value < 1 */
export const hash2 = (i: number, j: number, seed: number) => {
  let mixed = Math.imul(i, 0x27d4eb2d) ^ Math.imul(j, 0x165667b1) ^ Math.imul(seed + 0x9e3779b9, 0x85ebca6b);
  mixed = Math.imul(mixed ^ (mixed >>> 15), 0x2c1b3c6d);
  mixed = Math.imul(mixed ^ (mixed >>> 12), 0x297a2d39);
  return ((mixed ^ (mixed >>> 15)) >>> 0) / 4294967296;
};

/** the site of grid cell (i, j): somewhere in the cell, `jitter` 0 = in the middle (a regular grid), 1 = anywhere */
export const cellSite = (i: number, j: number, seed: number, jitter: number): [number, number] => [
  i + 0.5 + (hash2(i, j, seed) - 0.5) * jitter,
  j + 0.5 + (hash2(i, j, seed + 1013) - 0.5) * jitter,
];

export interface CellSample {
  /** distance to the nearest site (in noise units) */
  f1: number;
  /** distance to the second nearest – f2 − f1 is 0 on the borders between cells */
  f2: number;
  /** a number 0 … 1 per cell – the same everywhere in it (colour, height) */
  id: number;
  /** the nearest site */
  site: [number, number];
}

/** cellular noise at a point (one cell ≈ one noise unit) */
export const cellular = (x: number, y: number, seed = 0, jitter = 1): CellSample => {
  const column = Math.floor(x),
    row = Math.floor(y);
  let f1 = Infinity,
    f2 = Infinity,
    id = 0;
  let site: [number, number] = [x, y];
  for (let j = row - 1; j <= row + 1; j++) {
    for (let i = column - 1; i <= column + 1; i++) {
      const candidate = cellSite(i, j, seed, jitter);
      const distance = Math.hypot(candidate[0] - x, candidate[1] - y);
      if (distance < f1) {
        f2 = f1;
        f1 = distance;
        id = hash2(i, j, seed + 7);
        site = candidate;
      } else if (distance < f2) {
        f2 = distance;
      }
    }
  }
  return { f1, f2, id, site };
};

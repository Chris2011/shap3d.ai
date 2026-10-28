import type { PluginShader } from '../../../src/plugins/types';

/**
 * A material drawn by noise: two colours mixed by fractal noise in the object's own coordinates (solid – no
 * seams at edges). Modes as for terrains: fBm (clouds, stains), ridged (veins, cracks), billow (puffy spots).
 * GLSL names carry the prefix nz, so nothing clashes with three.js or other plugins.
 */
export const NOISE_SHADER: PluginShader = {
  id: 'noise',
  label: 'noise.shader.label',
  size: 1,
  params: [
    { name: 'color2', label: 'noise.shader.color2', type: 'color', default: '#2f3a2c' },
    { name: 'mode', label: 'noise.shader.mode', type: 'number', default: 0, min: 0, max: 2, step: 1 },
    { name: 'octaves', label: 'noise.shader.octaves', type: 'number', default: 5, min: 1, max: 8, step: 1 },
    { name: 'persistence', label: 'noise.shader.persistence', type: 'number', default: 0.5, min: 0.1, max: 0.9 },
    { name: 'warp', label: 'noise.shader.warp', type: 'number', default: 0.4, min: 0, max: 2 },
    { name: 'contrast', label: 'noise.shader.contrast', type: 'number', default: 1.4, min: 0.2, max: 4 },
    { name: 'balance', label: 'noise.shader.balance', type: 'number', default: 0.5, min: 0, max: 1 },
  ],
  glsl: /* glsl */ `
float nzHash(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.x + p.y) * p.z);
}
/** gradient-like value noise, −1 … 1 */
float nzNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = nzHash(i);
  float n100 = nzHash(i + vec3(1.0, 0.0, 0.0));
  float n010 = nzHash(i + vec3(0.0, 1.0, 0.0));
  float n110 = nzHash(i + vec3(1.0, 1.0, 0.0));
  float n001 = nzHash(i + vec3(0.0, 0.0, 1.0));
  float n101 = nzHash(i + vec3(1.0, 0.0, 1.0));
  float n011 = nzHash(i + vec3(0.0, 1.0, 1.0));
  float n111 = nzHash(i + 1.0);
  float value = mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y), mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
  return value * 2.0 - 1.0;
}
float nzFractal(vec3 p) {
  float total = 0.0;
  float amplitude = 1.0;
  float norm = 0.0;
  for (int octave = 0; octave < 8; octave++) {
    if (float(octave) >= u_octaves) {
      break;
    }
    float value = nzNoise(p);
    if (u_mode > 1.5) {
      value = abs(value);
    } else if (u_mode > 0.5) {
      value = 1.0 - abs(value);
      value *= value;
    } else {
      value = value * 0.5 + 0.5;
    }
    total += value * amplitude;
    norm += amplitude;
    amplitude *= u_persistence;
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
  }
  return total / norm;
}
vec3 s3dSurface(vec3 p, vec3 n, vec3 base) {
  vec3 q = p * 4.0;
  q += u_warp * vec3(nzNoise(q * 0.5 + 3.1), nzNoise(q * 0.5 + 7.7), nzNoise(q * 0.5 + 1.3));
  float value = nzFractal(q);
  float mixed = clamp((value - u_balance) * u_contrast + 0.5, 0.0, 1.0);
  return mix(base, u_color2, mixed);
}
`,
};

/**
 * Cells: a Voronoi pattern – stones with joints, crazy paving, dried mud. Each cell has a shade of its own;
 * the joints have the second colour. Drawn in the plane the face is closest to (floors x/y, walls along the wall).
 */
export const CELLS_SHADER: PluginShader = {
  id: 'cells',
  label: 'noise.shader.cellsLabel',
  size: 0.5,
  params: [
    { name: 'color2', label: 'noise.shader.jointColor', type: 'color', default: '#5d5850' },
    { name: 'joint', label: 'noise.shader.joint', type: 'number', default: 0.06, min: 0, max: 0.3 },
    { name: 'jitter', label: 'noise.shader.jitter', type: 'number', default: 1, min: 0, max: 1 },
    { name: 'variation', label: 'noise.shader.variation', type: 'number', default: 0.25, min: 0, max: 1 },
  ],
  glsl: /* glsl */ `
vec2 nzCellHash(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453);
}
vec2 nzPlanar(vec3 p, vec3 n) {
  vec3 a = abs(n);
  if (a.z >= a.x && a.z >= a.y) {
    return p.xy;
  }
  return a.x >= a.y ? p.yz : p.xz;
}
vec3 s3dSurface(vec3 p, vec3 n, vec3 base) {
  vec2 q = nzPlanar(p, n);
  vec2 cell = floor(q);
  vec2 local = fract(q);
  float nearest = 8.0;
  vec2 nearestCell = vec2(0.0);
  vec2 nearestOffset = vec2(0.0);
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 neighbour = vec2(float(i), float(j));
      vec2 offset = neighbour + 0.5 + (nzCellHash(cell + neighbour) - 0.5) * u_jitter - local;
      float distance = dot(offset, offset);
      if (distance < nearest) {
        nearest = distance;
        nearestCell = cell + neighbour;
        nearestOffset = offset;
      }
    }
  }
  // distance to the border: the closest bisector to any other site
  float border = 8.0;
  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 neighbour = vec2(float(i), float(j));
      vec2 offset = neighbour + 0.5 + (nzCellHash(cell + neighbour) - 0.5) * u_jitter - local;
      vec2 between = offset - nearestOffset;
      if (dot(between, between) > 0.00001) {
        border = min(border, dot(0.5 * (nearestOffset + offset), normalize(between)));
      }
    }
  }
  float shade = 1.0 + (nzCellHash(nearestCell + 17.0).x - 0.5) * 2.0 * u_variation;
  float stone = smoothstep(u_joint * 0.5, u_joint * 0.5 + 0.02, border);
  return mix(u_color2, base * shade, stone);
}
`,
};

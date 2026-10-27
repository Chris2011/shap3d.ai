import type { PluginShader } from '../../../src/plugins/types';

/**
 * The shaders. Each one is a GLSL function `vec3 s3dSurface(vec3 p, vec3 n, vec3 base)` the app draws faces
 * with: `p` is the point in the object's own coordinates (1 = one tile of the material's size), so the pattern
 * is solid – it runs on round every edge without seams and moves with the object. Colours are linear.
 * Parameters arrive as uniforms `u_<name>`.
 */

/** value noise and fractal noise in 3D – prefixed, so nothing clashes with three.js' own GLSL */
const NOISE = /* glsl */ `
float shHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float shNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(shHash(i), shHash(i + vec3(1.0, 0.0, 0.0)), f.x), mix(shHash(i + vec3(0.0, 1.0, 0.0)), shHash(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
    mix(mix(shHash(i + vec3(0.0, 0.0, 1.0)), shHash(i + vec3(1.0, 0.0, 1.0)), f.x), mix(shHash(i + vec3(0.0, 1.0, 1.0)), shHash(i + 1.0), f.x), f.y),
    f.z);
}
float shFbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int octave = 0; octave < 5; octave++) {
    value += amplitude * shNoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 3.1);
    amplitude *= 0.5;
  }
  return value;
}
/** 2D coordinates on the face: the plane the face is closest to – x/y on walls run along the wall and up */
vec2 shPlanar(vec3 p, vec3 n) {
  vec3 a = abs(n);
  if (a.z >= a.x && a.z >= a.y) {
    return p.xy;
  }
  return a.x >= a.y ? p.yz : p.xz;
}
`;

const shader = (id: string, params: PluginShader['params'], body: string, size?: number): PluginShader => ({
  id,
  label: `shaders.shader.${id}`,
  params: params?.map((param) => ({ ...param, label: `shaders.param.${param.name}` })),
  size,
  glsl: NOISE + body,
});

export const SHADERS: PluginShader[] = [
  shader(
    'wood',
    [
      { name: 'ringColor', label: '', type: 'color', default: '#8a5e32' },
      { name: 'rings', label: '', type: 'number', default: 14, min: 3, max: 40, step: 1 },
      { name: 'distortion', label: '', type: 'number', default: 0.5, min: 0, max: 1.5 },
      { name: 'grain', label: '', type: 'number', default: 0.5, min: 0, max: 1 },
      { name: 'axis', label: '', type: 'number', default: 0, min: 0, max: 2, step: 1 },
    ],
    /* glsl */ `
vec3 s3dSurface(vec3 p, vec3 n, vec3 base) {
  // q.z runs along the grain: x, y or z of the object
  vec3 q = u_axis < 0.5 ? p.yzx : (u_axis < 1.5 ? p.zxy : p);
  float d = length(q.xy + vec2(0.37, 0.61));
  d += u_distortion * 0.12 * shFbm(q * vec3(3.0, 3.0, 0.35));
  float ring = fract(d * u_rings);
  float late = smoothstep(0.55, 0.95, ring) * (1.0 - smoothstep(0.95, 1.0, ring));
  float fibre = shNoise(q * vec3(90.0, 90.0, 1.5));
  vec3 color = mix(base, u_ringColor, late);
  color *= 1.0 - u_grain * 0.35 * fibre;
  return color * (0.92 + 0.16 * shNoise(q * vec3(4.0, 4.0, 0.3)));
}`,
  ),
  shader(
    'marble',
    [
      { name: 'veinColor', label: '', type: 'color', default: '#7d7d80' },
      { name: 'veins', label: '', type: 'number', default: 3, min: 0.5, max: 10 },
      { name: 'sharpness', label: '', type: 'number', default: 6, min: 1, max: 16 },
      { name: 'turbulence', label: '', type: 'number', default: 1.4, min: 0, max: 3 },
    ],
    /* glsl */ `
vec3 s3dSurface(vec3 p, vec3 n, vec3 base) {
  float t = (p.x + 0.6 * p.y + 0.3 * p.z) * u_veins + u_turbulence * 4.0 * shFbm(p * 2.2);
  float vein = pow(1.0 - abs(sin(t)), u_sharpness);
  float fine = pow(1.0 - abs(sin(t * 2.7 + 3.0 * shFbm(p * 5.0))), u_sharpness * 2.0) * 0.5;
  vec3 color = base * (0.94 + 0.06 * shFbm(p * 6.0));
  return mix(color, u_veinColor, clamp(vein + fine, 0.0, 1.0));
}`,
  ),
  shader(
    'granite',
    [
      { name: 'darkColor', label: '', type: 'color', default: '#262626' },
      { name: 'lightColor', label: '', type: 'color', default: '#efece6' },
      { name: 'grainSize', label: '', type: 'number', default: 1, min: 0.3, max: 3 },
      { name: 'amount', label: '', type: 'number', default: 0.5, min: 0, max: 1 },
    ],
    /* glsl */ `
vec3 s3dSurface(vec3 p, vec3 n, vec3 base) {
  vec3 q = p * 30.0 / u_grainSize;
  vec3 color = base * (0.88 + 0.24 * shNoise(q * 0.2));
  float dark = shNoise(q);
  float light = shNoise(q * 1.3 + 17.0);
  color = mix(color, u_darkColor, 0.85 * smoothstep(0.82 - 0.25 * u_amount, 0.9 - 0.25 * u_amount, dark));
  return mix(color, u_lightColor, 0.7 * smoothstep(0.86, 0.93, light));
}`,
  ),
  shader(
    'terrazzo',
    [
      { name: 'chip1', label: '', type: 'color', default: '#c0533a' },
      { name: 'chip2', label: '', type: 'color', default: '#e3b448' },
      { name: 'chip3', label: '', type: 'color', default: '#6f8187' },
      { name: 'density', label: '', type: 'number', default: 0.6, min: 0, max: 1 },
      { name: 'chips', label: '', type: 'number', default: 10, min: 4, max: 40, step: 1 },
    ],
    /* glsl */ `
vec3 s3dSurface(vec3 p, vec3 n, vec3 base) {
  vec3 q = p * u_chips;
  vec3 cell = floor(q);
  vec3 f = fract(q);
  float nearest = 9.0;
  float id = 0.0;
  for (int z = -1; z <= 1; z++) {
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec3 g = vec3(float(x), float(y), float(z));
        vec3 o = vec3(shHash(cell + g), shHash(cell + g + 19.1), shHash(cell + g + 47.7));
        float d = length(g + o - f);
        if (d < nearest) {
          nearest = d;
          id = shHash(cell + g + 5.3);
        }
      }
    }
  }
  float radius = 0.22 + 0.25 * fract(id * 7.0);
  float chip = step(id, u_density) * (1.0 - smoothstep(radius - 0.04, radius, nearest));
  float pick = id / max(u_density, 0.001);
  vec3 chipColor = pick < 0.34 ? u_chip1 : (pick < 0.67 ? u_chip2 : u_chip3);
  vec3 color = base * (0.95 + 0.1 * shNoise(p * 40.0));
  return mix(color, chipColor, chip);
}`,
  ),
  shader(
    'rust',
    [
      { name: 'rustColor', label: '', type: 'color', default: '#8a3b12' },
      { name: 'amount', label: '', type: 'number', default: 0.5, min: 0, max: 1 },
      { name: 'scale', label: '', type: 'number', default: 3, min: 0.5, max: 10 },
    ],
    /* glsl */ `
vec3 s3dSurface(vec3 p, vec3 n, vec3 base) {
  float m = shFbm(p * u_scale);
  float threshold = mix(0.72, 0.28, u_amount);
  float rust = smoothstep(threshold - 0.04, threshold + 0.06, m);
  vec3 metal = base * (0.9 + 0.2 * shNoise(p * vec3(200.0, 6.0, 6.0)));
  vec3 crust = u_rustColor * (0.6 + 0.8 * shNoise(p * 35.0));
  return mix(metal, crust, rust);
}`,
  ),
  shader(
    'bricks',
    [
      { name: 'mortarColor', label: '', type: 'color', default: '#cbc4b6' },
      { name: 'brickWidth', label: '', type: 'number', default: 0.25, min: 0.05, max: 1 },
      { name: 'brickHeight', label: '', type: 'number', default: 0.075, min: 0.02, max: 0.5 },
      { name: 'joint', label: '', type: 'number', default: 0.012, min: 0, max: 0.04, step: 0.001 },
      { name: 'variation', label: '', type: 'number', default: 0.35, min: 0, max: 1 },
    ],
    /* glsl */ `
vec3 s3dSurface(vec3 p, vec3 n, vec3 base) {
  vec2 uv = shPlanar(p, n);
  float row = floor(uv.y / u_brickHeight);
  float x = uv.x / u_brickWidth + 0.5 * mod(row, 2.0);
  float column = floor(x);
  vec2 local = vec2(fract(x) * u_brickWidth, fract(uv.y / u_brickHeight) * u_brickHeight);
  float halfJoint = u_joint * 0.5;
  float mortar = 1.0 - step(halfJoint, local.x) * step(local.x, u_brickWidth - halfJoint) * step(halfJoint, local.y) * step(local.y, u_brickHeight - halfJoint);
  float tint = shHash(vec3(column, row, 3.0)) - 0.5;
  vec3 brick = base * (1.0 + u_variation * tint) * (0.9 + 0.2 * shNoise(p * 80.0));
  vec3 joint = u_mortarColor * (0.9 + 0.2 * shNoise(p * 120.0));
  return mix(brick, joint, mortar);
}`,
  ),
  shader(
    'checker',
    [
      { name: 'color2', label: '', type: 'color', default: '#202020' },
      { name: 'squares', label: '', type: 'number', default: 2, min: 1, max: 20, step: 1 },
    ],
    /* glsl */ `
vec3 s3dSurface(vec3 p, vec3 n, vec3 base) {
  // a hair inside the face, so faces lying exactly on a square's border don't flicker
  vec3 q = floor((p - n * 0.0005) * u_squares);
  return mod(q.x + q.y + q.z, 2.0) < 0.5 ? base : u_color2;
}`,
  ),
  shader(
    'concrete',
    [
      { name: 'stains', label: '', type: 'number', default: 0.5, min: 0, max: 1 },
      { name: 'pores', label: '', type: 'number', default: 0.4, min: 0, max: 1 },
      { name: 'panels', label: '', type: 'number', default: 0.5, min: 0, max: 1 },
    ],
    /* glsl */ `
vec3 s3dSurface(vec3 p, vec3 n, vec3 base) {
  vec3 color = base * (1.0 - u_stains * 0.5 * (shFbm(p * 1.2) - 0.45));
  color *= 1.0 - u_pores * 0.5 * step(0.9, shNoise(p * 160.0));
  // formwork panels 2.5 × 1.25 m with their joints and tie holes
  vec2 panel = shPlanar(p, n) / vec2(2.5, 1.25);
  vec2 edge = min(fract(panel), 1.0 - fract(panel)) * vec2(2.5, 1.25);
  float joint = 1.0 - step(0.008, min(edge.x, edge.y));
  vec2 hole = abs(fract(panel * vec2(4.0, 2.0)) - 0.5) * vec2(0.625, 0.625);
  float tie = 1.0 - step(0.018, length(hole));
  return color * (1.0 - u_panels * 0.35 * max(joint, tie));
}`,
  ),
];

/** a ready-made material: name (message key), shader, colour, parameters */
export interface Preset {
  id: string;
  shader: string;
  color: string;
  params?: Record<string, number | string>;
  size?: number;
}

export const PRESETS: Preset[] = [
  { id: 'oak', shader: 'wood', color: '#c9a36b', params: { ringColor: '#94683a' } },
  { id: 'walnut', shader: 'wood', color: '#6b4528', params: { ringColor: '#3a2414', rings: 18 } },
  { id: 'pine', shader: 'wood', color: '#e3c189', params: { ringColor: '#b47a3a', rings: 8, distortion: 0.8 } },
  { id: 'carrara', shader: 'marble', color: '#eeece7', params: { veinColor: '#8d8d90' } },
  { id: 'nero', shader: 'marble', color: '#1d1d1f', params: { veinColor: '#e8e6e0', sharpness: 10, veins: 2 } },
  { id: 'granite', shader: 'granite', color: '#8e8c88' },
  { id: 'terrazzo', shader: 'terrazzo', color: '#e9e4da' },
  { id: 'rustySteel', shader: 'rust', color: '#6f747a', params: { amount: 0.6 } },
  { id: 'copperPatina', shader: 'rust', color: '#b5653a', params: { rustColor: '#4fa58f', amount: 0.3, scale: 2 } },
  { id: 'clinker', shader: 'bricks', color: '#9e4a2e' },
  { id: 'sandstoneBrick', shader: 'bricks', color: '#d8b679', params: { mortarColor: '#8f8a80', brickWidth: 0.4, brickHeight: 0.2 } },
  { id: 'checker', shader: 'checker', color: '#f2f2f2' },
  { id: 'exposedConcrete', shader: 'concrete', color: '#a8a7a1' },
];

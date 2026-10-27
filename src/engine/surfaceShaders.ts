import * as THREE from 'three';
import { shallowReactive } from 'vue';
import type { MaterialDef } from '../core/document';

/**
 * Shader materials: a surface function in GLSL that a plugin registers. A material that names it (`shader`)
 * is drawn with it instead of its flat colour – light, shadows, clipping and colour space stay with the viewer.
 * Without the plugin the material simply shows its colour again.
 *
 * The GLSL defines `vec3 s3dSurface(vec3 p, vec3 n, vec3 base)`:
 * - `p` the point in the object's own coordinates divided by the material's size (one unit = one tile),
 * - `n` the face normal in the same coordinates,
 * - `base` the material colour (linear) – returns the colour of the point (linear).
 * Every parameter is a uniform `u_<name>` (float, or vec3 for colours – linear as well).
 */
export interface SurfaceShaderParam {
  name: string;
  /** text or message key */
  label: string;
  type: 'number' | 'color';
  default: number | string;
  min?: number;
  max?: number;
  step?: number;
}

export interface SurfaceShader {
  /** full id, e.g. "shaders.wood" */
  id: string;
  /** text or message key */
  label: string;
  glsl: string;
  params?: SurfaceShaderParam[];
  /** size in metres one tile covers (default 1) */
  size?: number;
}

/** what of a material the shaders read – model materials and swatch sources both fit */
export type ShadedMaterial = Pick<MaterialDef, 'color' | 'shader' | 'shaderParams' | 'textureSize'>;

/** the registered shaders – reactive, so lists in panels follow plugins being switched on and off */
export const SURFACE_SHADERS = shallowReactive<SurfaceShader[]>([]);

export const registerSurfaceShader = (shader: SurfaceShader) => {
  const existing = SURFACE_SHADERS.findIndex((candidate) => candidate.id === shader.id);
  if (existing >= 0) {
    SURFACE_SHADERS.splice(existing, 1);
  }
  SURFACE_SHADERS.push(shader);
  return () => {
    const index = SURFACE_SHADERS.indexOf(shader);
    if (index >= 0) {
      SURFACE_SHADERS.splice(index, 1);
    }
  };
};

export const surfaceShader = (id: string | undefined) => (id ? SURFACE_SHADERS.find((shader) => shader.id === id) : undefined);

/** the material's shader – only when its plugin is on */
export const materialShader = (material: Pick<MaterialDef, 'shader'> | undefined) => surfaceShader(material?.shader);

/** the value of a parameter for this material (its own, else the shader's default) */
export const shaderParam = (material: Pick<MaterialDef, 'shaderParams'>, param: SurfaceShaderParam) =>
  material.shaderParams?.[param.name] ?? param.default;

export const shaderSize = (material: Pick<MaterialDef, 'textureSize'>, shader: SurfaceShader) => material.textureSize ?? shader.size ?? 1;

const VALID_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;

/** uniform declarations and the shader's own GLSL – goes before main() of a fragment shader */
const fragmentHeader = (shader: SurfaceShader) =>
  [
    'varying vec3 vS3dPos;',
    'varying vec3 vS3dNormal;',
    ...(shader.params ?? [])
      .filter((param) => VALID_NAME.test(param.name))
      .map((param) => `uniform ${param.type === 'color' ? 'vec3' : 'float'} u_${param.name};`),
    shader.glsl,
  ].join('\n');

const VERTEX_HEADER = 'uniform float s3dSize;\nvarying vec3 vS3dPos;\nvarying vec3 vS3dNormal;';
const VERTEX_MAIN = 'vS3dPos = position / s3dSize; vS3dNormal = normal;';
const SURFACE_CALL = 's3dSurface(vS3dPos, normalize(vS3dNormal), ';

const uniformsOf = (shader: SurfaceShader, material: ShadedMaterial) => {
  const uniforms: Record<string, THREE.IUniform> = { s3dSize: { value: shaderSize(material, shader) } };
  for (const param of shader.params ?? []) {
    const value = shaderParam(material, param);
    uniforms[`u_${param.name}`] = { value: param.type === 'color' ? new THREE.Color(String(value)) : Number(value) };
  }
  return uniforms;
};

/** What the viewer needs to draw a material with its shader. */
export interface SurfaceSetup {
  /** program cache key – materials with the same shader share a program */
  key: string;
  uniforms: Record<string, THREE.IUniform>;
  vertexHeader: string;
  vertexMain: string;
  fragmentHeader: string;
  /** the call that turns `base` into the surface colour, e.g. surfaceCall('vColor.rgb') */
  surfaceCall: (base: string) => string;
}

export const surfaceSetup = (shader: SurfaceShader, material: ShadedMaterial): SurfaceSetup => ({
  key: shader.id,
  uniforms: uniformsOf(shader, material),
  vertexHeader: VERTEX_HEADER,
  vertexMain: VERTEX_MAIN,
  fragmentHeader: fragmentHeader(shader),
  surfaceCall: (base) => `${SURFACE_CALL}${base})`,
});

/**
 * Lets a three.js material (Lambert, Basic) draw the surface: the shader replaces the vertex colour.
 * Used when shadows are on – the viewer's own shading material takes the setup directly.
 */
export const applySurface = (material: THREE.Material, setup: SurfaceSetup) => {
  material.onBeforeCompile = (program) => {
    Object.assign(program.uniforms, setup.uniforms);
    program.vertexShader = program.vertexShader
      .replace('#include <common>', `#include <common>\n${setup.vertexHeader}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\n${setup.vertexMain}`);
    program.fragmentShader = program.fragmentShader
      .replace('#include <common>', `#include <common>\n${setup.fragmentHeader}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb = ${setup.surfaceCall('diffuseColor.rgb')};`);
  };
  material.customProgramCacheKey = () => `s3d-surface:${setup.key}`;
};

// ---- swatches: a small picture of the surface, rendered once per material look

let swatchRenderer: THREE.WebGLRenderer | null = null;
const swatchUrls = new Map<string, string>();
const SWATCH_PIXELS = 96;

const renderSwatch = (shader: SurfaceShader, material: ShadedMaterial) => {
  if (!swatchRenderer) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SWATCH_PIXELS;
    swatchRenderer = new THREE.WebGLRenderer({ canvas, preserveDrawingBuffer: true, antialias: false });
  }
  const setup = surfaceSetup(shader, material);
  const base = new THREE.Color(material.color);
  // a slice through the solid pattern, upright like a wall – 1.5 tiles across
  const swatchMaterial = new THREE.ShaderMaterial({
    uniforms: { ...setup.uniforms, base: { value: base } },
    vertexShader: `varying vec3 vS3dPos; varying vec3 vS3dNormal;
void main(){ vS3dPos = vec3(position.x * 0.75 + 0.75, 0.37, position.y * 0.75 + 0.75); vS3dNormal = vec3(0.0, -1.0, 0.0); gl_Position = vec4(position.xy, 0.0, 1.0); }`,
    fragmentShader: `uniform vec3 base;
${setup.fragmentHeader}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){ gl_FragColor = vec4(toSRGB(clamp(${setup.surfaceCall('base')}, 0.0, 1.0)), 1.0); }`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), swatchMaterial);
  const scene = new THREE.Scene();
  scene.add(quad);
  swatchRenderer.render(scene, new THREE.Camera());
  const url = swatchRenderer.domElement.toDataURL('image/jpeg', 0.85);
  quad.geometry.dispose();
  swatchMaterial.dispose();
  return url;
};

/** small JPEG of a shader material (data URL, cached) – '' when it can't be drawn */
export const shaderSwatchUrl = (material: ShadedMaterial): string => {
  const shader = materialShader(material);
  if (!shader) {
    return '';
  }
  const key = JSON.stringify([shader.id, shader.glsl.length, material.color, material.textureSize, material.shaderParams]);
  let url = swatchUrls.get(key);
  if (url === undefined) {
    try {
      url = renderSwatch(shader, material);
    } catch {
      url = '';
    }
    swatchUrls.set(key, url);
  }
  return url;
};

// ---- baking: the solid pattern as a picture with texture coordinates – for exports (glTF) that know no shaders

/** One face to bake: its triangle corners (object coordinates, three per triangle) and its normal. */
export interface BakeFace {
  points: THREE.Vector3[];
  normal: THREE.Vector3;
}

export interface BakedSurface {
  texture: THREE.CanvasTexture;
  /** texture coordinates, two per point – in the order of the faces and their points */
  uvs: number[];
}

/** largest side of a baked picture (px) */
const BAKE_LIMIT = 2048;
/** sharpness: pixels one shader tile gets, when everything fits */
const BAKE_TILE_PIXELS = 256;
/** pixels around each face, so filtering never reads a neighbour */
const BAKE_GUTTER = 2;

let bakeRenderer: THREE.WebGLRenderer | null = null;

interface BakeSlot {
  face: BakeFace;
  axisU: THREE.Vector3;
  axisV: THREE.Vector3;
  /** plane offset along the normal */
  depth: number;
  minU: number;
  minV: number;
  sizeU: number;
  sizeV: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** shelf packing at `density` px/m – the height used, or Infinity when it does not fit */
const packSlots = (slots: BakeSlot[], density: number) => {
  let x = 0,
    y = 0,
    rowHeight = 0;
  for (const slot of slots) {
    slot.width = Math.ceil(slot.sizeU * density) + 2 * BAKE_GUTTER;
    slot.height = Math.ceil(slot.sizeV * density) + 2 * BAKE_GUTTER;
    if (slot.width > BAKE_LIMIT) {
      return Infinity;
    }
    if (x + slot.width > BAKE_LIMIT) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    slot.x = x;
    slot.y = y;
    x += slot.width;
    rowHeight = Math.max(rowHeight, slot.height);
  }
  return y + rowHeight;
};

/**
 * Bakes a shader material into one picture for the given faces: every face gets its own patch, drawn from its real
 * positions – so the pattern runs on around corners exactly like in the viewer. Null when WebGL is not at hand.
 */
export const bakeSurface = (shader: SurfaceShader, material: ShadedMaterial, faces: BakeFace[]): BakedSurface | null => {
  const slots: BakeSlot[] = faces.map((face) => {
    const axisN = face.normal.clone().normalize();
    const reference = Math.abs(axisN.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(1, 0, 0);
    const axisU = reference.cross(axisN).normalize();
    const axisV = axisN.clone().cross(axisU).normalize();
    let minU = Infinity,
      minV = Infinity,
      maxU = -Infinity,
      maxV = -Infinity;
    for (const point of face.points) {
      const along = point.dot(axisU),
        across = point.dot(axisV);
      minU = Math.min(minU, along);
      maxU = Math.max(maxU, along);
      minV = Math.min(minV, across);
      maxV = Math.max(maxV, across);
    }
    const depth = face.points.length ? face.points[0].dot(axisN) : 0;
    return { face, axisU, axisV, depth, minU, minV, sizeU: maxU - minU, sizeV: maxV - minV, x: 0, y: 0, width: 0, height: 0 };
  });
  if (!slots.length) {
    return null;
  }
  // tall faces first keeps the shelves tight; as sharp as the limit allows
  const order = [...slots].sort((a, b) => b.sizeV - a.sizeV);
  let density = BAKE_TILE_PIXELS / shaderSize(material, shader);
  let height = packSlots(order, density);
  for (let attempt = 0; height > BAKE_LIMIT && attempt < 60; attempt++) {
    density *= height === Infinity ? 0.5 : Math.max(0.5, Math.sqrt(BAKE_LIMIT / height) * 0.98);
    height = packSlots(order, density);
  }
  if (height > BAKE_LIMIT) {
    return null;
  }
  const width = Math.min(
    BAKE_LIMIT,
    slots.reduce((widest, slot) => Math.max(widest, slot.x + slot.width), 1),
  );
  height = Math.max(1, height);

  // one quad per patch (gutter included) – the plane is flat, so its corners carry the exact positions
  const positions: number[] = [],
    normals: number[] = [],
    targets: number[] = [],
    uvs: number[] = [];
  const corner = new THREE.Vector3();
  for (const slot of slots) {
    const pad = BAKE_GUTTER / density;
    const corners = [
      [slot.minU - pad, slot.minV - pad, slot.x, slot.y],
      [slot.minU - pad + slot.width / density, slot.minV - pad, slot.x + slot.width, slot.y],
      [slot.minU - pad + slot.width / density, slot.minV - pad + slot.height / density, slot.x + slot.width, slot.y + slot.height],
      [slot.minU - pad, slot.minV - pad + slot.height / density, slot.x, slot.y + slot.height],
    ];
    for (const index of [0, 1, 2, 0, 2, 3]) {
      const [along, across, pixelX, pixelY] = corners[index];
      corner
        .copy(slot.axisU)
        .multiplyScalar(along)
        .addScaledVector(slot.axisV, across)
        .addScaledVector(slot.face.normal.clone().normalize(), slot.depth);
      positions.push(corner.x, corner.y, corner.z);
      normals.push(slot.face.normal.x, slot.face.normal.y, slot.face.normal.z);
      targets.push((pixelX / width) * 2 - 1, (pixelY / height) * 2 - 1);
    }
    for (const point of slot.face.points) {
      uvs.push(
        (slot.x + BAKE_GUTTER + (point.dot(slot.axisU) - slot.minU) * density) / width,
        (slot.y + BAKE_GUTTER + (point.dot(slot.axisV) - slot.minV) * density) / height,
      );
    }
  }

  try {
    if (!bakeRenderer) {
      bakeRenderer = new THREE.WebGLRenderer({ canvas: document.createElement('canvas'), preserveDrawingBuffer: true, antialias: false });
      bakeRenderer.setPixelRatio(1);
    }
    bakeRenderer.setSize(width, height, false);
    const setup = surfaceSetup(shader, material);
    const bakeMaterial = new THREE.ShaderMaterial({
      uniforms: { ...setup.uniforms, base: { value: new THREE.Color(material.color) } },
      vertexShader: `attribute vec2 bakeTarget;
${setup.vertexHeader}
void main(){ ${setup.vertexMain} gl_Position = vec4(bakeTarget, 0.0, 1.0); }`,
      fragmentShader: `uniform vec3 base;
${setup.fragmentHeader}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){ gl_FragColor = vec4(toSRGB(clamp(${setup.surfaceCall('base')}, 0.0, 1.0)), 1.0); }`,
      side: THREE.DoubleSide,
      depthTest: false,
    });
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setAttribute('bakeTarget', new THREE.Float32BufferAttribute(targets, 2));
    const quads = new THREE.Mesh(geometry, bakeMaterial);
    quads.frustumCulled = false;
    const scene = new THREE.Scene();
    scene.add(quads);
    bakeRenderer.setClearColor(new THREE.Color(material.color), 1);
    bakeRenderer.clear();
    bakeRenderer.render(scene, new THREE.Camera());
    // a copy – the renderer's canvas changes with the next bake
    const picture = document.createElement('canvas');
    picture.width = width;
    picture.height = height;
    picture.getContext('2d')!.drawImage(bakeRenderer.domElement, 0, 0);
    geometry.dispose();
    bakeMaterial.dispose();
    const texture = new THREE.CanvasTexture(picture);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.userData.mimeType = 'image/jpeg';
    return { texture, uvs };
  } catch {
    return null;
  }
};

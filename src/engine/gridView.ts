import * as THREE from 'three';
import type { Units } from '../core/document';

/**
 * Infinite ground grid in the XY plane (like Blender or KiCad).
 * A full-screen pass intersects every pixel's view ray with z = 0 and draws anti-aliased lines there.
 * Line spacing follows the zoom: every level fades in once its lines are far enough apart on screen,
 * coarser levels are drawn stronger (major lines). Depth is written per pixel and nudged slightly
 * behind the ground plane, so faces, edges and axes at height 0 always win and nothing flickers.
 */

const MAX_LEVELS = 8;
const INCH = 0.0254, FOOT = 0.3048;
/** Grid spacings from fine to coarse in metres – decimal for metric models, 1/16" · 1" · 1' · 10' … for imperial ones. */
export const gridLevels = (units: Units): number[] =>
  units === 'in' || units === 'ft'
    ? [INCH / 16, INCH, FOOT, 10 * FOOT, 100 * FOOT, 1000 * FOOT, 10000 * FOOT]
    : [0.001, 0.01, 0.1, 1, 10, 100, 1000, 10000];

/** px between neighbouring lines where a level starts / finishes fading in, and where it counts as major */
export const GRID_FADE_IN: [number, number] = [7, 22];
const GRID_MAJOR: [number, number] = [22, 140];

const vertexShader = `varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const fragmentShader = `
  uniform mat4 invProj; uniform mat4 camWorld; uniform mat4 viewProj;
  uniform float levels[${MAX_LEVELS}]; uniform int levelCount;
  uniform vec3 lineColor; uniform vec3 xColor; uniform vec3 yColor; uniform float strength; uniform float ortho;
  uniform vec2 fadeIn; uniform vec2 major; uniform vec2 distanceFade;
  varying vec2 vNdc;

  // 1 on a line of spacing 'step', 0 between lines; 'footprint' is the world size of a pixel, 'width' the line width in px
  // (derivatives are taken once outside the level loop - inside non-uniform control flow they are undefined)
  float lines(vec2 coord, vec2 footprint, float step, float width) {
    vec2 distancePx = abs(fract(coord / step - 0.5) - 0.5) * step / max(footprint, vec2(1e-9));
    vec2 line = 1.0 - clamp(distancePx - (width - 1.0) * 0.5, 0.0, 1.0);
    return max(line.x, line.y);
  }

  void main(){
    vec4 nearPoint = invProj * vec4(vNdc, -1.0, 1.0); nearPoint /= nearPoint.w;
    vec4 farPoint = invProj * vec4(vNdc, 1.0, 1.0); farPoint /= farPoint.w;
    // perspective rays start at the eye (the near plane may already lie below the ground when zoomed in close)
    vec3 origin = (camWorld * vec4(ortho > 0.5 ? nearPoint.xyz : vec3(0.0), 1.0)).xyz;
    vec3 direction = normalize((camWorld * vec4(farPoint.xyz - nearPoint.xyz, 0.0)).xyz);
    float hit = -origin.z / (abs(direction.z) < 1e-6 ? 1e-6 : direction.z);
    vec3 point = origin + direction * hit;

    // world size of one pixel; the larger direction decides so lines never crowd at grazing angles
    vec2 footprint = fwidth(point.xy);
    float pixel = max(max(footprint.x, footprint.y), 1e-9);
    if (hit <= 0.0) discard; // looking away from the ground

    float alpha = 0.0;
    for (int i = 0; i < ${MAX_LEVELS}; i++) {
      if (i >= levelCount) break;
      float spacingPx = levels[i] / pixel;
      float visible = smoothstep(fadeIn.x, fadeIn.y, spacingPx);
      if (visible <= 0.0) continue;
      float weight = smoothstep(major.x, major.y, spacingPx);
      alpha = max(alpha, lines(point.xy, footprint, levels[i], mix(1.0, 1.6, weight)) * visible * mix(0.32, 1.0, weight));
    }

    // the two lines through the origin are tinted like the axes
    vec2 axisPx = abs(point.xy) / max(footprint, vec2(1e-9));
    float onX = 1.0 - clamp(axisPx.y - 0.5, 0.0, 1.0), onY = 1.0 - clamp(axisPx.x - 0.5, 0.0, 1.0);
    vec3 color = mix(mix(lineColor, xColor, onX), yColor, onY * (1.0 - onX));
    alpha = max(alpha, max(onX, onY) * 0.9);

    // fade towards the horizon and into the distance
    float fade = ortho > 0.5 ? 1.0 : smoothstep(0.0, 0.22, abs(direction.z));
    fade *= 1.0 - smoothstep(distanceFade.x, distanceFade.y, hit);
    alpha *= fade * strength;
    if (alpha < 0.003) discard;

    // depth of the hit point, a hair behind z = 0 so geometry on the ground stays in front:
    // perspective pushes 0.2 % further along the ray, parallel projection a few depth-buffer steps
    vec4 clip = viewProj * vec4(ortho > 0.5 ? point : origin + direction * hit * 1.002, 1.0);
    gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5 + (ortho > 0.5 ? 3e-6 : 0.0), 0.0, 1.0);
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }`;

export class GroundGrid {
  material = new THREE.ShaderMaterial({
    uniforms: {
      invProj: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() }, viewProj: { value: new THREE.Matrix4() },
      levels: { value: new Array(MAX_LEVELS).fill(1) }, levelCount: { value: 0 },
      lineColor: { value: new THREE.Color() }, xColor: { value: new THREE.Color() }, yColor: { value: new THREE.Color() },
      strength: { value: 1 }, ortho: { value: 0 },
      fadeIn: { value: new THREE.Vector2(...GRID_FADE_IN) }, major: { value: new THREE.Vector2(...GRID_MAJOR) },
      distanceFade: { value: new THREE.Vector2(100, 400) },
    },
    vertexShader, fragmentShader,
    transparent: true, depthWrite: false, depthTest: true,
  });
  mesh: THREE.Mesh;
  private units: Units | null = null;

  constructor() {
    const triangle = new THREE.BufferGeometry(); triangle.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.mesh = new THREE.Mesh(triangle, this.material);
    // drawn first among the transparent objects: after opaque faces/edges, before glass, x-ray and the shadow catcher
    this.mesh.frustumCulled = false; this.mesh.renderOrder = -2;
  }

  /** Per frame: camera matrices, colours for day/night and the unit system of the model. */
  update(camera: THREE.Camera, isOrtho: boolean, target: THREE.Vector3, units: Units, night: boolean) {
    const uniforms = this.material.uniforms;
    uniforms.invProj.value.copy(camera.projectionMatrixInverse);
    uniforms.camWorld.value.copy(camera.matrixWorld);
    uniforms.viewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    uniforms.ortho.value = isOrtho ? 1 : 0;
    if (units !== this.units) {
      this.units = units;
      const levels = gridLevels(units);
      uniforms.levels.value = [...levels, ...new Array(MAX_LEVELS - levels.length).fill(1)];
      uniforms.levelCount.value = levels.length;
    }
    uniforms.lineColor.value.set(night ? '#a9b8cc' : '#4a525c');
    uniforms.xColor.value.set(night ? '#e06a6a' : '#d63a3a');
    uniforms.yColor.value.set(night ? '#5fc46e' : '#2e9e3e');
    uniforms.strength.value = night ? 0.42 : 0.38;
    // fade out far beyond what the camera looks at, never closer than its height above the ground;
    // parallel projection has no horizon (and its rays start far behind the eye), the zoom levels alone thin it out
    const reach = Math.max(Math.abs(camera.position.z), camera.position.distanceTo(target), 1);
    if (isOrtho) uniforms.distanceFade.value.set(1e12, 2e12);
    else uniforms.distanceFade.value.set(reach * 12, reach * 40);
  }
}

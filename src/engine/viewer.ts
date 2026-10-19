import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { MeshBVH } from 'three-mesh-bvh';
import type { Entities, Instance, EntityRef } from '../core/model';
import type { Model } from '../core/document';
import { CameraRig } from './camera';
import { Overlay } from './overlay';
import { makeTexture, isTextureKind, TEXTURE_SIZE } from '../core/textures';
import { planeBasis } from '../core/geometry';
import { theme, onThemeChange } from '../theme';
import { meshView } from './meshView';
import { measureView } from './measureView';
import { GroundGrid } from './gridView';

/**
 * Night scene: the model's sky/ground colours are pushed towards a night sky, faces get moonlight and
 * dark edges turn light so the geometry stays readable. The model's own style settings stay untouched.
 */
const NIGHT_SKY = new THREE.Color('#0a1424'), NIGHT_GROUND = new THREE.Color('#0d1116');
const NIGHT_EDGE = '#c3cedb', MOON = new THREE.Color('#b9c8ff');
const tmpSky = new THREE.Color(), tmpGround = new THREE.Color();
const tmpSphere = new THREE.Sphere(), tmpMatrix = new THREE.Matrix4();
/** BVHs for the occlusion test of overlay labels, dropped together with their geometry */
const occlusionTrees = new WeakMap<THREE.BufferGeometry, MeshBVH>();
/** Edge colours that would vanish on a night background are replaced. */
const nightEdge = (color: string) => (new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l < 0.35 ? NIGHT_EDGE : color);

export interface PickContext { path: Instance[]; entities: Entities; world: THREE.Matrix4 }
export interface EdgeRec { start: THREE.Vector3; end: THREE.Vector3; edgeId: number; context: PickContext }
export interface VertRec { position: THREE.Vector3; vertexId: number; context: PickContext }
export interface FaceHit { point: THREE.Vector3; faceId: number; context: PickContext; normal: THREE.Vector3; distance: number }

export interface ViewState {
  activePath: Instance[];
  selection: Map<string, EntityRef>;
  hover: EntityRef | null;
}

const SEL_COLOR = 0x1d4ed8;

const stippleMat = new THREE.ShaderMaterial({
  uniforms: { color: { value: new THREE.Color(SEL_COLOR) } },
  vertexShader: `#include <common>\n#include <clipping_planes_pars_vertex>\nvoid main(){ vec4 mvPosition = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * mvPosition;\n#include <clipping_planes_vertex>\n}`,
  fragmentShader: `uniform vec3 color;\n#include <clipping_planes_pars_fragment>\nvoid main(){\n#include <clipping_planes_fragment>\n vec2 c = floor(mod(gl_FragCoord.xy, 3.0)); if(mod(c.x + c.y, 3.0) > 0.5) discard; gl_FragColor = vec4(color,1.0); }`,
  side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, depthWrite: false, clipping: true,
});

/** SketchUp-style face shading: camera-relative light, mixed in sRGB like "Light 80 / Dark 45". */
export const shadeUniforms = { lightDir: { value: new THREE.Vector3(0, -1, 0) }, dark: { value: 0.45 }, light: { value: 0.8 } };
const makeShadeMaterial = (opts: { side: THREE.Side; transparent: boolean; opacity: number; depthWrite: boolean; clippingPlanes: THREE.Plane[]; map?: THREE.Texture }) => {
  return new THREE.ShaderMaterial({
    uniforms: { ...shadeUniforms, opacity: { value: opts.opacity }, map: { value: opts.map ?? null } },
    defines: opts.map ? { USE_SU_MAP: '' } : {},
    vertexColors: true, side: opts.side, transparent: opts.transparent, depthWrite: opts.depthWrite,
    polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, clipping: true, clippingPlanes: opts.clippingPlanes,
    vertexShader: `#include <common>
#include <color_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec3 vN; varying vec2 vSuUv;
void main(){
  #include <color_vertex>
  #ifdef USE_SU_MAP
  vSuUv = uv;
  #endif
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`,
    fragmentShader: `uniform vec3 lightDir; uniform float dark; uniform float light; uniform float opacity; uniform sampler2D map;
varying vec3 vN; varying vec2 vSuUv;
#include <color_pars_fragment>
#include <clipping_planes_pars_fragment>
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  #include <clipping_planes_fragment>
  vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  float f = clamp(dark + light * max(dot(n, lightDir), 0.0), 0.0, 1.0);
  #ifdef USE_SU_MAP
  vec3 base = texture2D(map, vSuUv).rgb;
  #else
  vec3 base = vColor.rgb;
  #endif
  gl_FragColor = vec4(toSRGB(base) * f, opacity);
}`,
  });
};

interface ProfileRec { start: THREE.Vector3; end: THREE.Vector3; normals: THREE.Vector3[]; faded: boolean }

const sunDirection = (hour: number, month: number): THREE.Vector3 => {
  // simple solar model for ~48°N
  const lat = THREE.MathUtils.degToRad(48);
  const decl = THREE.MathUtils.degToRad(23.44) * Math.sin(2 * Math.PI * ((month - 1) * 30.4 + 15 - 81) / 365);
  const hourAngle = THREE.MathUtils.degToRad((hour - 12) * 15);
  const alt = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle));
  let azimuth = Math.atan2(-Math.sin(hourAngle), Math.tan(decl) * Math.cos(lat) - Math.sin(lat) * Math.cos(hourAngle));
  // az measured from south → convert to x(east)/y(north)
  const x = Math.cos(alt) * Math.sin(azimuth), y = -Math.cos(alt) * Math.cos(azimuth), z = Math.sin(alt);
  return new THREE.Vector3(-x, y, Math.max(z, 0.05)).normalize();
};

/** Full quality first, then cheaper settings – weak or software GPUs sometimes refuse antialias/preserveDrawingBuffer. */
const createRenderer = (canvas: HTMLCanvasElement): THREE.WebGLRenderer => {
  const tries: THREE.WebGLRendererParameters[] = [
    { antialias: true, preserveDrawingBuffer: true },
    { antialias: false, preserveDrawingBuffer: true },
    { antialias: false, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false },
  ];
  let last: unknown;
  for (const params of tries) {
    try { return new THREE.WebGLRenderer({ canvas, ...params }); } catch (error) { last = error; }
  }
  throw new WebGLUnavailableError(String((last as Error)?.message ?? last));
};

export class WebGLUnavailableError extends Error { override name = 'WebGLUnavailableError'; }

export class Viewer {
  renderer: THREE.WebGLRenderer;
  rig = new CameraRig();
  scene = new THREE.Scene();
  bgScene = new THREE.Scene();
  bgCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  bgMat: THREE.ShaderMaterial;
  content = new THREE.Group();
  helpers = new THREE.Group();
  highlight = new THREE.Group();
  ambient = new THREE.AmbientLight(0xffffff, 0.75);
  sun = new THREE.DirectionalLight(0xffffff, 1.5);
  shadowGround: THREE.Mesh;
  grid = new GroundGrid();
  overlay: Overlay;
  model!: Model;
  edges: EdgeRec[] = [];
  verts: VertRec[] = [];
  pickMeshes: THREE.Mesh[] = [];
  clipPlanes: THREE.Plane[] = [];
  needsRender = true;
  width = 1; height = 1;
  frontMats: THREE.Material[] = [];
  onFrame: (() => void) | null = null;

  constructor(public canvas: HTMLCanvasElement, overlayCanvas: HTMLCanvasElement) {
    this.renderer = createRenderer(canvas);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.overlay = new Overlay(overlayCanvas, this);

    this.bgMat = new THREE.ShaderMaterial({
      uniforms: { invProj: { value: new THREE.Matrix4() }, camWorld: { value: new THREE.Matrix4() }, sky: { value: new THREE.Color() }, ground: { value: new THREE.Color() }, horizon: { value: new THREE.Color('#e9ecee') }, useSky: { value: 1 }, useGround: { value: 1 }, bg: { value: new THREE.Color('#ffffff') }, ortho: { value: 0 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }`,
      fragmentShader: `uniform mat4 invProj; uniform mat4 camWorld; uniform vec3 sky; uniform vec3 ground; uniform vec3 horizon; uniform vec3 bg; uniform float useSky; uniform float useGround; uniform float ortho; varying vec2 vUv;
        void main(){
          vec4 a = invProj * vec4(vUv, -1.0, 1.0); a /= a.w; vec4 b = invProj * vec4(vUv, 1.0, 1.0); b /= b.w;
          vec3 d = normalize((camWorld * vec4(b.xyz - a.xyz, 0.0)).xyz);
          float z = d.z; vec3 col = bg;
          if(z >= 0.0){ if(useSky > 0.5){ float t = pow(clamp(z,0.0,1.0), 0.55); col = mix(horizon, sky, t); } }
          else { if(useGround > 0.5){ col = ground; } }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
      depthWrite: false, depthTest: false,
    });
    const tri = new THREE.BufferGeometry(); tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const mesh = new THREE.Mesh(tri, this.bgMat); mesh.frustumCulled = false; this.bgScene.add(mesh);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.ambient, this.sun, this.sun.target, this.content, this.helpers, this.highlight);
    this.shadowGround = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: 0.25 }));
    this.shadowGround.receiveShadow = true; this.shadowGround.position.z = -0.001; this.shadowGround.renderOrder = -1;
    this.scene.add(this.shadowGround, this.grid.mesh);
    this.rig.onChange = () => { this.needsRender = true; };
    onThemeChange(() => { this.needsRender = true; });
    this.buildAxes();
    const loop = () => {
      if (this.disposed) return;
      this.raf = requestAnimationFrame(loop);
      if (this.rig.update()) this.needsRender = true; this.onFrame?.(); if (this.needsRender) this.render();
    };
    loop();
  }

  private raf = 0;
  private disposed = false;
  /** Stop the frame loop and hand the GL context back – otherwise every remount (e.g. HMR) leaks a live context. */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }

  axes = new THREE.Group();
  private buildAxes() {
    const AXIS_LENGTH = 2000;
    const makeAxis = (dir: THREE.Vector3, color: number) => {
      const pos = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(AXIS_LENGTH)]);
      const neg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(-AXIS_LENGTH)]);
      const solidLine = new THREE.Line(pos, new THREE.LineBasicMaterial({ color }));
      const dashedLine = new THREE.Line(neg, new THREE.LineDashedMaterial({ color, dashSize: 0.04, gapSize: 0.12, transparent: true, opacity: 0.9 }));
      dashedLine.computeLineDistances();
      this.axes.add(solidLine, dashedLine);
    };
    makeAxis(new THREE.Vector3(1, 0, 0), 0xd00000); makeAxis(new THREE.Vector3(0, 1, 0), 0x00a000); makeAxis(new THREE.Vector3(0, 0, 1), 0x0000d0);
    this.scene.add(this.axes);
  }

  resize(width: number, height: number) {
    this.width = width; this.height = height;
    this.renderer.setSize(width, height, false);
    this.rig.setAspect(width / Math.max(height, 1));
    this.overlay.resize(width, height);
    for (const material of this.lineMats) material.resolution.set(width, height);
    this.needsRender = true;
  }

  private lineMats: LineMaterial[] = [];
  private lineMat(color: number, width: number, opts: Partial<LineMaterial> = {}) {
    const material = new LineMaterial({ color, linewidth: width, ...opts } as any);
    material.resolution.set(this.width, this.height); material.clippingPlanes = this.clipPlanes; this.lineMats.push(material); return material;
  }

  // ------------------------------------------------------------ build
  rebuild(state: ViewState) {
    const model = this.model;
    const style = model.settings.style;
    // dispose old
    this.content.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.geometry) mesh.geometry.dispose(); const mat = (mesh as any).material; if (mat && !Array.isArray(mat) && mat.userData?.owned) mat.dispose(); });
    this.content.clear();
    this.lineMats = this.lineMats.filter(material => !material.userData.owned);
    this.edges = []; this.verts = []; this.pickMeshes = []; this.profiles = []; this.profileKey = ''; this.faceMe = [];

    // section planes
    this.clipPlanes.length = 0;
    if (model.settings.sectionCuts) for (const section of model.sections) if (section.active) this.clipPlanes.push(new THREE.Plane().setFromNormalAndCoplanarPoint(section.normal.clone().normalize(), section.point));

    const hiddenTags = model.hiddenTags();
    const activeKey = state.activePath.map(instance => instance.id).join('/');
    const showHidden = model.settings.hiddenGeometry;

    const walk = (ents: Entities, path: Instance[], world: THREE.Matrix4, inheritMat: string | undefined) => {
      const key = path.map(instance => instance.id).join('/');
      const inContext = key.startsWith(activeKey);
      const faded = activeKey !== '' && !inContext;
      const context: PickContext = { path, entities: ents, world };
      const faceMe = path.length ? path[path.length - 1].definition.faceMe : false;
      const grp = this.buildEntities(ents, context, inheritMat, faded, hiddenTags, showHidden, faceMe);
      if (faceMe) this.faceMe.push({ group: grp, world: world.clone() });
      for (const inst of ents.instances.values()) {
        if ((inst.hidden && !showHidden) || (inst.tag && hiddenTags.has(inst.tag))) continue;
        walk(inst.definition.entities, [...path, inst], world.clone().multiply(inst.matrix), inst.material ?? inheritMat);
      }
    };
    walk(model.root, [], new THREE.Matrix4(), undefined);

    // shadows & lighting
    const sunDir = sunDirection(model.settings.shadowHour, model.settings.shadowMonth);
    const box = model.bounds(); const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const radius = box.isEmpty() ? 10 : Math.max(10, box.getBoundingSphere(new THREE.Sphere()).radius * 1.5);
    this.sun.position.copy(center).addScaledVector(sunDir, radius * 2); this.sun.target.position.copy(center);
    const camera = this.sun.shadow.camera as THREE.OrthographicCamera; camera.left = -radius; camera.right = radius; camera.top = radius; camera.bottom = -radius; camera.near = 0.1; camera.far = radius * 5; camera.updateProjectionMatrix();
    this.renderer.shadowMap.enabled = model.settings.shadows;
    this.sun.castShadow = model.settings.shadows;
    this.shadowGround.visible = model.settings.shadows && style.ground;
    // three.js divides Lambert irradiance by π – these values give SketchUp-like light/dark (≈ 80/45)
    if (model.settings.shadows) { this.ambient.intensity = 1.45; this.sun.intensity = 2.6; }
    else { this.ambient.intensity = 1.85; this.sun.intensity = 1.55; }
    if (theme.night) { this.ambient.intensity *= 0.4; this.sun.intensity *= 0.55; this.sun.color.copy(MOON); this.ambient.color.copy(MOON); }
    else { this.sun.color.set(0xffffff); this.ambient.color.set(0xffffff); }
    this.axes.visible = model.settings.axes;

    this.content.updateMatrixWorld(true);
    this.buildGuides();
    this.rebuildHighlight(state);
    this.needsRender = true;
  }

  private colorOf(name: string | undefined, fallback: string): { color: THREE.Color; opacity: number } {
    // "#rrggbb" names are handled by Model.material()
    const material = this.model.material(name);
    return material ? { color: new THREE.Color(material.color), opacity: material.opacity } : { color: new THREE.Color(fallback), opacity: 1 };
  }

  private buildEntities(ents: Entities, context: PickContext, inheritMat: string | undefined, faded: boolean, hiddenTags: Set<string>, showHidden: boolean, faceMe = false): THREE.Group {
    const style = this.model.settings.style;
    const group = new THREE.Group(); group.matrixAutoUpdate = false; group.matrix.copy(context.world); group.updateMatrixWorld(true);
    const fadeCol = (color: THREE.Color) => (faded ? color.clone().lerp(new THREE.Color(1, 1, 1), 0.6) : color);

    // ---- faces
    type Bucket = { positions: number[]; normals: number[]; uvs: number[]; frontColors: number[]; backColors: number[]; triangles: number[]; opacities: number[]; map?: THREE.Texture };
    const bucket = (): Bucket => ({ positions: [], normals: [], uvs: [], frontColors: [], backColors: [], triangles: [], opacities: [] });
    const opaque = bucket(), trans = bucket();
    const textured = new Map<string, Bucket>();
    const mono = style.faceStyle === 'monochrome' || style.faceStyle === 'hiddenline';
    for (const face of ents.faces.values()) {
      if ((face.hidden && !showHidden) || (face.tag && hiddenTags.has(face.tag))) continue;
      const tri = ents.faceTriangles(face); if (!tri.length) continue;
      const pts = [...face.outer, ...face.holes.flat()].map(vertex => ents.positionOf(vertex));
      const normal = ents.faceNormal(face);
      const frontLook = mono ? { color: new THREE.Color(style.frontColor), opacity: 1 } : this.colorOf(face.material ?? inheritMat, style.frontColor);
      const backLook = mono ? { color: new THREE.Color(style.backColor), opacity: 1 } : (face.backMaterial ? this.colorOf(face.backMaterial, style.backColor) : face.material || inheritMat ? frontLook : { color: new THREE.Color(style.backColor), opacity: 1 });
      // textured materials get their own mesh with planar UVs (texture size in meters, like SketchUp)
      const mdef = !mono && !faded && style.faceStyle === 'textured' ? this.model.material(face.material ?? inheritMat) : undefined;
      let target = frontLook.opacity < 1 ? trans : opaque;
      let texU: THREE.Vector3 | null = null, texV: THREE.Vector3 | null = null, tsz = 1;
      if (mdef?.texture && isTextureKind(mdef.texture)) {
        const key = mdef.name + (frontLook.opacity < 1 ? ':t' : '');
        let textureBucket = textured.get(key); if (!textureBucket) { textureBucket = bucket(); textureBucket.map = makeTexture(mdef.texture, mdef.color); textured.set(key, textureBucket); }
        target = textureBucket; const basis = planeBasis(normal); texU = basis.basisU; texV = basis.basisV; tsz = mdef.textureSize ?? TEXTURE_SIZE[mdef.texture];
      }
      const color = fadeCol(frontLook.color), backColor = fadeCol(backLook.color);
      for (let i = 0; i < tri.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          const point = pts[tri[i + k]]; target.positions.push(point.x, point.y, point.z); target.normals.push(normal.x, normal.y, normal.z); target.frontColors.push(color.r, color.g, color.b); target.backColors.push(backColor.r, backColor.g, backColor.b);
          if (texU && texV) target.uvs.push(point.dot(texU) / tsz, point.dot(texV) / tsz);
        }
        target.triangles.push(face.id);
        target.opacities.push(frontLook.opacity);
      }
    }
    const xray = style.xray || faded;
    const mkMesh = (data: Bucket, transparent: boolean, opacity: number) => {
      if (!data.positions.length) return;
      const meshGeometry = new THREE.BufferGeometry();
      meshGeometry.setAttribute('position', new THREE.Float32BufferAttribute(data.positions, 3));
      meshGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(data.normals, 3));
      if (data.map) meshGeometry.setAttribute('uv', new THREE.Float32BufferAttribute(data.uvs, 2));
      const unlit = style.faceStyle === 'hiddenline';
      const shadows = this.model.settings.shadows;
      const Mat: any = unlit ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial;
      const common: any = { vertexColors: !data.map, map: data.map ?? null, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, transparent: transparent || xray, opacity: xray ? Math.min(opacity, 0.5) : opacity, depthWrite: !(transparent || xray), clippingPlanes: this.clipPlanes };
      const makeMaterial = (side: THREE.Side) => (unlit || shadows ? new Mat({ ...common, side }) : makeShadeMaterial({ side, transparent: common.transparent, opacity: common.opacity, depthWrite: common.depthWrite, clippingPlanes: this.clipPlanes, map: data.map }));
      const frontGeometry = meshGeometry.clone(); frontGeometry.setAttribute('color', new THREE.Float32BufferAttribute(data.frontColors, 3));
      const geometry = meshGeometry.clone(); geometry.setAttribute('color', new THREE.Float32BufferAttribute(data.backColors, 3));
      const front = new THREE.Mesh(frontGeometry, makeMaterial(THREE.FrontSide));
      const back = new THREE.Mesh(geometry, makeMaterial(THREE.BackSide));
      (front.material as any).userData.owned = true; (back.material as any).userData.owned = true;
      for (const mesh of [front, back]) {
        mesh.userData.ctx = context; mesh.userData.tri = data.triangles; mesh.castShadow = !transparent; mesh.receiveShadow = true;
        mesh.matrixAutoUpdate = false;
        group.add(mesh); this.pickMeshes.push(mesh);
        mesh.visible = style.faceStyle !== 'wireframe';
      }
      meshGeometry.dispose();
    };
    mkMesh(opaque, false, 1);
    for (const textureBucket of textured.values()) { const opacity = textureBucket.opacities.reduce((lowest, value) => Math.min(lowest, value), 1); mkMesh(textureBucket, opacity < 1, opacity); }
    if (trans.positions.length) mkMesh(trans, true, trans.opacities.reduce((lowest, value) => Math.min(lowest, value), 1));

    // ---- edges
    const linePositions: number[] = [];
    const showEdges = style.edges || style.faceStyle === 'wireframe';
    for (const edge of ents.edges.values()) {
      const start = ents.positionOf(edge.start), end = ents.positionOf(edge.end);
      const hidden = (edge.hidden && !showHidden) || (edge.tag && hiddenTags.has(edge.tag));
      if (hidden) continue;
      const worldStart = start.clone().applyMatrix4(context.world), worldEnd = end.clone().applyMatrix4(context.world);
      if (!faceMe) this.edges.push({ start: worldStart, end: worldEnd, edgeId: edge.id, context: context });
      if (edge.soft && !showHidden) continue;
      const faces = ents.facesOfEdge(edge.id).filter(face => !((face.hidden && !showHidden) || (face.tag && hiddenTags.has(face.tag))));
      if (!showEdges) {
        // still draw edges without faces (loose lines) so they are visible
        if (faces.length) continue;
      }
      linePositions.push(start.x, start.y, start.z, end.x, end.y, end.z);
      if (style.profiles && faces.length && style.faceStyle !== 'wireframe') this.profiles.push({ start: worldStart, end: worldEnd, normals: faces.slice(0, 2).map(face => ents.faceNormal(face).transformDirection(context.world)), faded });
    }
    if (!faceMe) for (const vertex of ents.vertices.values()) this.verts.push({ position: vertex.position.clone().applyMatrix4(context.world), vertexId: vertex.id, context: context });
    if (meshView.on && !faceMe) this.buildMeshView(ents, group, faded, showHidden, hiddenTags);
    if (linePositions.length) {
      const lineGeometry = new LineSegmentsGeometry(); lineGeometry.setPositions(linePositions);
      const col = faded ? (theme.night ? 0x4a5563 : 0xb4b4b4) : new THREE.Color(theme.night ? nightEdge(style.edgeColor) : style.edgeColor).getHex();
      const mat = this.lineMat(col, 1, faded ? ({ transparent: true, opacity: 0.6 } as any) : {}); mat.userData.owned = true;
      const lines = new LineSegments2(lineGeometry, mat); lines.matrixAutoUpdate = false; group.add(lines);
    }
    this.content.add(group);
    return group;
  }

  /** Polygon view overlay for one entities level (local coordinates – the group carries the world matrix). */
  private buildMeshView(ents: Entities, group: THREE.Group, faded: boolean, showHidden: boolean, hiddenTags: Set<string>) {
    const accent = theme.night ? 0x5fd4e6 : 0x0e8ca0;
    const visibleFace = (face: { hidden?: boolean; tag?: string }) => !((face.hidden && !showHidden) || (face.tag && hiddenTags.has(face.tag)));
    // triangulation lines (only the inner diagonals – polygon borders are already edges)
    if (meshView.triangles) {
      const triPositions: number[] = [];
      for (const face of ents.faces.values()) {
        if (!visibleFace(face)) continue;
        const ids = [...face.outer, ...face.holes.flat()]; const triangles = ents.faceTriangles(face);
        const border = new Set<string>(); const loops = [face.outer, ...face.holes];
        for (const loop of loops) for (let i = 0; i < loop.length; i++) { const vertexA = loop[i], vertexB = loop[(i + 1) % loop.length]; border.add(vertexA < vertexB ? `${vertexA}_${vertexB}` : `${vertexB}_${vertexA}`); }
        const seen = new Set<string>();
        for (let i = 0; i < triangles.length; i += 3) for (let k = 0; k < 3; k++) {
          const vertexA = ids[triangles[i + k]], vertexB = ids[triangles[i + (k + 1) % 3]]; const key = vertexA < vertexB ? `${vertexA}_${vertexB}` : `${vertexB}_${vertexA}`;
          if (border.has(key) || seen.has(key)) continue; seen.add(key);
          const start = ents.positionOf(vertexA), end = ents.positionOf(vertexB); triPositions.push(start.x, start.y, start.z, end.x, end.y, end.z);
        }
      }
      if (triPositions.length) {
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(triPositions, 3));
        const material = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: faded ? 0.15 : 0.45, depthTest: true }); material.userData.owned = true;
        const lines = new THREE.LineSegments(geometry, material); lines.matrixAutoUpdate = false; lines.renderOrder = 3; group.add(lines);
      }
    }
    // softened edges (normally invisible) as dashed lines
    if (meshView.soft) {
      const softPositions: number[] = [];
      for (const edge of ents.edges.values()) if (edge.soft) { const start = ents.positionOf(edge.start), end = ents.positionOf(edge.end); softPositions.push(start.x, start.y, start.z, end.x, end.y, end.z); }
      if (softPositions.length) {
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(softPositions, 3));
        const material = new THREE.LineBasicMaterial({ color: theme.night ? 0xc3cedb : 0x3a4148, transparent: true, opacity: faded ? 0.2 : 0.75 }); material.userData.owned = true;
        const lines = new THREE.LineSegments(geometry, material); lines.matrixAutoUpdate = false; lines.renderOrder = 3; group.add(lines);
      }
    }
    // corner points
    if (meshView.points && ents.vertices.size) {
      const pointPositions: number[] = []; for (const vertex of ents.vertices.values()) pointPositions.push(vertex.position.x, vertex.position.y, vertex.position.z);
      const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3));
      const material = new THREE.PointsMaterial({ color: accent, size: 5, sizeAttenuation: false, transparent: faded, opacity: faded ? 0.3 : 1 }); material.userData.owned = true;
      const pts = new THREE.Points(geometry, material); pts.matrixAutoUpdate = false; pts.renderOrder = 4; group.add(pts);
    }
  }

  faceMe: { group: THREE.Group; world: THREE.Matrix4 }[] = [];
  /** Turn face-me components so their front (−Y) looks at the camera, rotating about their own Z axis. */
  private updateFaceMe() {
    if (!this.faceMe.length) return;
    const eye = (this.rig.camera as THREE.Camera).position; const fwd = this.rig.forward();
    for (const figure of this.faceMe) {
      const anchor = new THREE.Vector3().setFromMatrixPosition(figure.world);
      const front = new THREE.Vector3(0, -1, 0).transformDirection(figure.world); front.z = 0;
      const want = this.rig.isOrtho ? fwd.clone().negate() : eye.clone().sub(anchor); want.z = 0;
      if (front.lengthSq() < 1e-9 || want.lengthSq() < 1e-9) continue;
      front.normalize(); want.normalize();
      const ang = Math.atan2(front.x * want.y - front.y * want.x, front.dot(want));
      figure.group.matrix.copy(figure.world).multiply(new THREE.Matrix4().makeRotationZ(ang));
      figure.group.updateMatrixWorld(true);
    }
  }
  profiles: ProfileRec[] = [];
  profileKey = '';
  profileLines: LineSegments2 | null = null;
  /** Thick silhouette ("profile") edges depend on the view: recompute when the camera moved. */
  private updateProfiles() {
    const cam = this.rig.camera as THREE.PerspectiveCamera;
    const key = cam.matrixWorld.elements.map(value => value.toFixed(4)).join(',') + this.rig.isOrtho + this.profiles.length;
    if (key === this.profileKey) return; this.profileKey = key;
    if (this.profileLines) { this.profileLines.geometry.dispose(); this.scene.remove(this.profileLines); this.profileLines = null; }
    const style = this.model?.settings.style; if (!style?.profiles || !this.profiles.length) return;
    const eye = cam.position; const fwd = this.rig.forward(); const pos: number[] = [];
    for (const profile of this.profiles) {
      if (profile.faded) continue;
      const mid = profile.start.clone().add(profile.end).multiplyScalar(0.5);
      const toEye = this.rig.isOrtho ? fwd.clone().negate() : eye.clone().sub(mid);
      const facing = profile.normals.map(normal => normal.dot(toEye) > 0);
      if (facing.length === 1 || facing[0] !== facing[1]) pos.push(profile.start.x, profile.start.y, profile.start.z, profile.end.x, profile.end.y, profile.end.z);
    }
    if (!pos.length) return;
    const lineGeometry = new LineSegmentsGeometry(); lineGeometry.setPositions(pos);
    if (!this.profileMat) this.profileMat = this.lineMat(0x000000, 2.4);
    this.profileMat.color.set(style.edgeColor); this.profileMat.clippingPlanes = this.clipPlanes;
    this.profileLines = new LineSegments2(lineGeometry, this.profileMat); this.profileLines.renderOrder = 2;
    this.scene.add(this.profileLines);
  }
  private profileMat: LineMaterial | null = null;

  guideGroup = new THREE.Group();
  private buildGuides() {
    this.guideGroup.traverse(object => { const line = object as THREE.Line; line.geometry?.dispose(); });
    this.guideGroup.clear();
    if (!this.model.settings.guides) return;
    const mat = new THREE.LineDashedMaterial({ color: 0x555555, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.85 });
    for (const guide of this.model.guides) {
      if (guide.kind !== 'line' || !guide.direction) continue;
      const geo = new THREE.BufferGeometry().setFromPoints([guide.point.clone().addScaledVector(guide.direction, -500), guide.point.clone().addScaledVector(guide.direction, 500)]);
      const line = new THREE.Line(geo, mat); line.computeLineDistances(); this.guideGroup.add(line);
    }
    if (!this.guideGroup.parent) this.scene.add(this.guideGroup);
  }

  rebuildHighlight(state: ViewState) {
    this.highlight.traverse(object => { const mesh = object as THREE.Mesh; if (mesh.geometry) mesh.geometry.dispose(); });
    this.highlight.clear();
    this.lineMats = this.lineMats.filter(material => !material.userData.hl);
    const ctxEnts = state.activePath.length ? state.activePath[state.activePath.length - 1].definition.entities : this.model.root;
    const world = new THREE.Matrix4(); for (const instance of state.activePath) world.multiply(instance.matrix);
    const pos: number[] = []; const linePositions: number[] = []; const hoverPositions: number[] = [];
    const boxes: THREE.Box3[] = [];
    const addFace = (faceId: number) => { const face = ctxEnts.faces.get(faceId); if (!face) return; const tri = ctxEnts.faceTriangles(face); const pts = [...face.outer, ...face.holes.flat()].map(vertex => ctxEnts.positionOf(vertex)); for (const i of tri) { const point = pts[i]; pos.push(point.x, point.y, point.z); } };
    for (const selectedRef of state.selection.values()) {
      if (selectedRef.kind === 'face') addFace(selectedRef.id);
      if (selectedRef.kind === 'edge') { const edge = ctxEnts.edges.get(selectedRef.id); if (edge) { const start = ctxEnts.positionOf(edge.start), end = ctxEnts.positionOf(edge.end); linePositions.push(start.x, start.y, start.z, end.x, end.y, end.z); } }
      if (selectedRef.kind === 'instance') { const instance = ctxEnts.instances.get(selectedRef.id); if (instance) boxes.push(instance.definition.entities.bounds(new THREE.Box3(), instance.matrix.clone())); }
    }
    const entityRef = state.hover;
    if (entityRef && !state.selection.has(`${entityRef.kind}:${entityRef.id}`)) {
      if (entityRef.kind === 'edge') { const edge = ctxEnts.edges.get(entityRef.id); if (edge) { const start = ctxEnts.positionOf(edge.start), end = ctxEnts.positionOf(edge.end); hoverPositions.push(start.x, start.y, start.z, end.x, end.y, end.z); } }
      if (entityRef.kind === 'face') addFace(entityRef.id); // pre-selection shows the same dotted face as SketchUp Web
      if (entityRef.kind === 'instance') { const instance = ctxEnts.instances.get(entityRef.id); if (instance) { const box = instance.definition.entities.bounds(new THREE.Box3(), instance.matrix.clone()); this.boxLines(box, hoverPositions); } }
    }
    for (const box of boxes) this.boxLines(box, linePositions);
    const group = new THREE.Group(); group.matrixAutoUpdate = false; group.matrix.copy(world);
    if (pos.length) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); stippleMat.clippingPlanes = this.clipPlanes; const mesh = new THREE.Mesh(geo, stippleMat); mesh.renderOrder = 10; group.add(mesh); }
    if (linePositions.length) { const geo = new LineSegmentsGeometry(); geo.setPositions(linePositions); const material = this.lineMat(SEL_COLOR, 2.2, { depthTest: true } as any); material.userData.hl = true; const lines = new LineSegments2(geo, material); lines.renderOrder = 5; group.add(lines); }
    if (hoverPositions.length) { const geo = new LineSegmentsGeometry(); geo.setPositions(hoverPositions); const material = this.lineMat(SEL_COLOR, 2.0); material.userData.hl = true; const lines = new LineSegments2(geo, material); lines.renderOrder = 4; group.add(lines); }
    this.highlight.add(group); group.updateMatrixWorld(true);
    this.needsRender = true;
  }

  boxLines(box: THREE.Box3, out: number[]) {
    if (box.isEmpty()) return;
    const { min: boxMin, max: boxMax } = box;
    const corners = [[boxMin.x, boxMin.y, boxMin.z], [boxMax.x, boxMin.y, boxMin.z], [boxMax.x, boxMax.y, boxMin.z], [boxMin.x, boxMax.y, boxMin.z], [boxMin.x, boxMin.y, boxMax.z], [boxMax.x, boxMin.y, boxMax.z], [boxMax.x, boxMax.y, boxMax.z], [boxMin.x, boxMax.y, boxMax.z]];
    const boxEdges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [i, j] of boxEdges) out.push(...corners[i], ...corners[j]);
  }

  // ------------------------------------------------------------ render
  render() {
    this.needsRender = false;
    const style = this.model?.settings.style;
    const cam = this.rig.camera as THREE.PerspectiveCamera;
    cam.updateMatrixWorld();
    this.bgMat.uniforms.invProj.value.copy(cam.projectionMatrixInverse);
    this.bgMat.uniforms.camWorld.value.copy(cam.matrixWorld);
    if (style) {
      tmpSky.set(style.skyColor); tmpGround.set(style.groundColor);
      // blended in linear space – a light model colour only leaves a faint tint
      if (theme.night) { tmpSky.lerp(NIGHT_SKY, 0.97); tmpGround.lerp(NIGHT_GROUND, 0.96); }
      this.bgMat.uniforms.horizon.value.set(theme.night ? '#1b2636' : '#e9ecee');
      this.bgMat.uniforms.bg.value.set(theme.night ? '#0d1116' : '#ffffff');
      this.bgMat.uniforms.sky.value.copy(tmpSky); this.bgMat.uniforms.ground.value.copy(tmpGround);
      this.bgMat.uniforms.useSky.value = style.sky ? 1 : 0; this.bgMat.uniforms.useGround.value = style.ground ? 1 : 0;
    }
    // camera-relative light like SketchUp's default (no sun shading)
    const viewDir = this.rig.forward().negate(); const rightDir = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0); const upDir = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    // measured in SketchUp Web: brightness = 0.45 + 0.8 · (n · view direction)
    shadeUniforms.lightDir.value.copy(viewDir.normalize()); void rightDir; void upDir;
    // moonlight: same direction, much dimmer
    shadeUniforms.dark.value = theme.night ? 0.2 : 0.45; shadeUniforms.light.value = theme.night ? 0.52 : 0.8;
    if (this.profileMat && style) this.profileMat.color.set(theme.night ? nightEdge(style.edgeColor) : style.edgeColor);
    if (this.model) { this.updateFaceMe(); this.updateProfiles(); }
    this.grid.mesh.visible = measureView.grid && !!this.model;
    if (this.grid.mesh.visible) this.grid.update(cam, this.rig.isOrtho, this.rig.target, this.model.settings.units, theme.night);
    this.renderer.clear();
    this.renderer.render(this.bgScene, this.bgCam);
    this.renderer.render(this.scene, cam);
    this.overlay.draw();
  }

  // ------------------------------------------------------------ picking helpers
  ndc(x: number, y: number) { return new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1); }
  ray(x: number, y: number): THREE.Ray { return this.rig.ray(this.ndc(x, y)); }

  project(point: THREE.Vector3): { x: number; y: number; z: number; visible: boolean } {
    const projected = point.clone().project(this.rig.camera);
    return { x: (projected.x + 1) / 2 * this.width, y: (1 - projected.y) / 2 * this.height, z: projected.z, visible: projected.z > -1 && projected.z < 1 };
  }

  pickFace(x: number, y: number, filter?: (context: PickContext, faceId: number) => boolean): FaceHit | null {
    const raycaster = new THREE.Raycaster(); raycaster.setFromCamera(this.ndc(x, y), this.rig.camera);
    const vis = this.pickMeshes.filter(mesh => mesh.visible);
    const hits = raycaster.intersectObjects(vis, false);
    for (const hit of hits) {
      if (this.clipPlanes.some(plane => plane.distanceToPoint(hit.point) < -1e-6)) continue;
      const mesh = hit.object as THREE.Mesh; const faceId = mesh.userData.tri[Math.floor(hit.faceIndex! )];
      if (faceId == null) continue;
      const context: PickContext = mesh.userData.ctx;
      if (filter && !filter(context, faceId)) continue;
      const face = context.entities.faces.get(faceId); if (!face) continue;
      const normal = context.entities.faceNormal(face).transformDirection(context.world);
      return { point: hit.point.clone(), faceId: faceId, context: context, normal: normal, distance: hit.distance };
    }
    return null;
  }

  /** Distance along view ray to the nearest face (for occlusion tests). */
  faceDepth(x: number, y: number): number { const hit = this.pickFace(x, y); return hit ? hit.distance : Infinity; }

  isOccluded(point: THREE.Vector3, x: number, y: number): boolean {
    if (this.model.settings.style.xray || this.model.settings.style.faceStyle === 'wireframe') return false;
    const camPos = (this.rig.camera as THREE.Camera).position;
    let depth: number;
    if (this.rig.isOrtho) { const ray = this.ray(x, y); depth = point.clone().sub(ray.origin).dot(ray.direction); }
    else depth = point.distanceTo(camPos);
    const faceDistance = this.faceDepth(x, y);
    return faceDistance < depth - Math.max(0.002, depth * 0.002);
  }

  /**
   * Whether opaque faces hide a world point from the camera – overlay ticks, labels and dimensions behind
   * geometry are skipped. Uses a BVH per mesh (built lazily, `indirect` keeps the triangle order for picking).
   */
  isHidden(point: THREE.Vector3, ignore?: THREE.Object3D): boolean {
    const style = this.model?.settings.style;
    if (!style || style.xray || style.faceStyle === 'wireframe' || !this.pickMeshes.length) return false;
    const forward = this.rig.forward();
    // parallel projection also shows what lies behind the eye, so its rays start far in front of the point
    const origin = this.rig.isOrtho ? point.clone().addScaledVector(forward, -1e4) : (this.rig.camera as THREE.Camera).position.clone();
    const depth = point.distanceTo(origin); if (depth < 1e-9) return false;
    const ray = new THREE.Ray(origin, point.clone().sub(origin).divideScalar(depth));
    const limit = depth - Math.max(0.002, (this.rig.isOrtho ? point.distanceTo((this.rig.camera as THREE.Camera).position) : depth) * 0.002);
    for (const mesh of this.pickMeshes) {
      const material = mesh.material as THREE.Material;
      if (!mesh.visible || material.transparent) continue;
      if (ignore) { let inside = false; mesh.traverseAncestors(ancestor => { if (ancestor === ignore) inside = true; }); if (inside) continue; }
      const geometry = mesh.geometry;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      if (!ray.intersectsSphere(tmpSphere.copy(geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld))) continue;
      let bvh = occlusionTrees.get(geometry);
      if (!bvh) { bvh = new MeshBVH(geometry, { indirect: true }); occlusionTrees.set(geometry, bvh); }
      const toLocal = tmpMatrix.copy(mesh.matrixWorld).invert();
      const localRay = ray.clone().applyMatrix4(toLocal);
      // with active section cuts the first hit may be cut away, so all hits are checked
      const hits = this.clipPlanes.length ? bvh.raycast(localRay, material) : [bvh.raycastFirst(localRay, material)];
      for (const hit of hits) {
        if (!hit) continue;
        const hitPoint = hit.point.clone().applyMatrix4(mesh.matrixWorld);
        if (hitPoint.distanceTo(origin) >= limit) continue;
        if (this.clipPlanes.some(plane => plane.distanceToPoint(hitPoint) < -1e-6)) continue;
        return true;
      }
    }
    return false;
  }

  pickEdge(x: number, y: number, tolPx = 6, filter?: (edgeRec: EdgeRec) => boolean): { rec: EdgeRec; point: THREE.Vector3; dist: number } | null {
    let best: { rec: EdgeRec; point: THREE.Vector3; dist: number } | null = null;
    const mouse = new THREE.Vector2(x, y);
    for (const edgeRec of this.edges) {
      if (filter && !filter(edgeRec)) continue;
      const projStart = this.project(edgeRec.start), projEnd = this.project(edgeRec.end);
      if (!projStart.visible && !projEnd.visible) continue;
      const screenStart = new THREE.Vector2(projStart.x, projStart.y), screenEnd = new THREE.Vector2(projEnd.x, projEnd.y);
      const segment = screenEnd.clone().sub(screenStart); const lengthSq = segment.lengthSq();
      let param = lengthSq > 1e-9 ? mouse.clone().sub(screenStart).dot(segment) / lengthSq : 0; param = Math.max(0, Math.min(1, param));
      const distance = screenStart.clone().add(segment.multiplyScalar(param)).distanceTo(mouse);
      if (distance > tolPx || (best && distance >= best.dist)) continue;
      // 3D point on edge closest to the view ray
      const ray = this.ray(x, y); const dir = edgeRec.end.clone().sub(edgeRec.start);
      const offset = ray.origin.clone().sub(edgeRec.start); const edgeDot = dir.dot(dir), crossDot = dir.dot(ray.direction), rayDot = ray.direction.dot(ray.direction), edgeOffset = dir.dot(offset), rayOffset = ray.direction.dot(offset);
      const den = edgeDot * rayDot - crossDot * crossDot; let edgeParam = den > 1e-12 ? (crossDot * rayOffset - rayDot * edgeOffset) / den : param; edgeParam = Math.max(0, Math.min(1, edgeParam));
      const closest = edgeRec.start.clone().addScaledVector(dir, edgeParam);
      if (this.clipPlanes.some(plane => plane.distanceToPoint(closest) < -1e-6)) continue;
      if (this.isOccluded(closest, x, y)) continue;
      best = { rec: edgeRec, point: closest, dist: distance };
    }
    return best;
  }

  pickVertex(x: number, y: number, tolPx = 10, filter?: (vertex: VertRec) => boolean): { rec: VertRec; dist: number } | null {
    let best: { rec: VertRec; dist: number } | null = null;
    for (const vertex of this.verts) {
      if (filter && !filter(vertex)) continue;
      const projected = this.project(vertex.position); if (!projected.visible) continue;
      const distance = Math.hypot(projected.x - x, projected.y - y);
      if (distance > tolPx || (best && distance >= best.dist)) continue;
      if (this.clipPlanes.some(plane => plane.distanceToPoint(vertex.position) < -1e-6)) continue;
      if (this.isOccluded(vertex.position, x, y)) continue;
      best = { rec: vertex, dist: distance };
    }
    return best;
  }

  /** Screen-space size of one world unit at point p (for constant-size gizmos). */
  worldPerPixel(point: THREE.Vector3): number {
    if (this.rig.isOrtho) return (this.rig.ortho.top - this.rig.ortho.bottom) / this.height;
    const depth = point.clone().sub(this.rig.persp.position).dot(this.rig.forward());
    return 2 * Math.max(depth, 0.01) * Math.tan(THREE.MathUtils.degToRad(this.rig.persp.fov / 2)) / this.height;
  }

  snapshot(): string { this.render(); return this.canvas.toDataURL('image/png'); }
}

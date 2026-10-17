import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import type { Entities, Instance, EntityRef } from '../core/model';
import type { Model } from '../core/document';
import { CameraRig } from './camera';
import { Overlay } from './overlay';
import { makeTexture, isTextureKind, TEXTURE_SIZE } from '../core/textures';
import { planeBasis } from '../core/geometry';
import { theme, onThemeChange } from '../theme';
import { meshView } from './meshView';

/**
 * Night scene: the model's sky/ground colours are pushed towards a night sky, faces get moonlight and
 * dark edges turn light so the geometry stays readable. The model's own style settings stay untouched.
 */
const NIGHT_SKY = new THREE.Color('#0a1424'), NIGHT_GROUND = new THREE.Color('#0d1116');
const NIGHT_EDGE = '#c3cedb', MOON = new THREE.Color('#b9c8ff');
const tmpSky = new THREE.Color(), tmpGround = new THREE.Color();
/** Edge colours that would vanish on a night background are replaced. */
const nightEdge = (c: string) => (new THREE.Color(c).getHSL({ h: 0, s: 0, l: 0 }).l < 0.35 ? NIGHT_EDGE : c);

export interface PickContext { path: Instance[]; entities: Entities; world: THREE.Matrix4 }
export interface EdgeRec { a: THREE.Vector3; b: THREE.Vector3; eid: number; ctx: PickContext }
export interface VertRec { p: THREE.Vector3; vid: number; ctx: PickContext }
export interface FaceHit { point: THREE.Vector3; fid: number; ctx: PickContext; normal: THREE.Vector3; distance: number }

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
function makeShadeMaterial(opts: { side: THREE.Side; transparent: boolean; opacity: number; depthWrite: boolean; clippingPlanes: THREE.Plane[]; map?: THREE.Texture }) {
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
}

interface ProfileRec { a: THREE.Vector3; b: THREE.Vector3; n: THREE.Vector3[]; faded: boolean }

function sunDirection(hour: number, month: number): THREE.Vector3 {
  // simple solar model for ~48°N
  const lat = THREE.MathUtils.degToRad(48);
  const decl = THREE.MathUtils.degToRad(23.44) * Math.sin(2 * Math.PI * ((month - 1) * 30.4 + 15 - 81) / 365);
  const h = THREE.MathUtils.degToRad((hour - 12) * 15);
  const alt = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(h));
  let az = Math.atan2(-Math.sin(h), Math.tan(decl) * Math.cos(lat) - Math.sin(lat) * Math.cos(h));
  // az measured from south → convert to x(east)/y(north)
  const x = Math.cos(alt) * Math.sin(az), y = -Math.cos(alt) * Math.cos(az), z = Math.sin(alt);
  return new THREE.Vector3(-x, y, Math.max(z, 0.05)).normalize();
}

/** Full quality first, then cheaper settings – weak or software GPUs sometimes refuse antialias/preserveDrawingBuffer. */
function createRenderer(canvas: HTMLCanvasElement): THREE.WebGLRenderer {
  const tries: THREE.WebGLRendererParameters[] = [
    { antialias: true, preserveDrawingBuffer: true },
    { antialias: false, preserveDrawingBuffer: true },
    { antialias: false, preserveDrawingBuffer: false, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false },
  ];
  let last: unknown;
  for (const p of tries) {
    try { return new THREE.WebGLRenderer({ canvas, ...p }); } catch (e) { last = e; }
  }
  throw new WebGLUnavailableError(String((last as Error)?.message ?? last));
}

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
    const bg = new THREE.Mesh(tri, this.bgMat); bg.frustumCulled = false; this.bgScene.add(bg);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005; this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.ambient, this.sun, this.sun.target, this.content, this.helpers, this.highlight);
    this.shadowGround = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: 0.25 }));
    this.shadowGround.receiveShadow = true; this.shadowGround.position.z = -0.001; this.shadowGround.renderOrder = -1;
    this.scene.add(this.shadowGround);
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
    const L = 2000;
    const mk = (dir: THREE.Vector3, color: number) => {
      const pos = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(L)]);
      const neg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), dir.clone().multiplyScalar(-L)]);
      const l1 = new THREE.Line(pos, new THREE.LineBasicMaterial({ color }));
      const l2 = new THREE.Line(neg, new THREE.LineDashedMaterial({ color, dashSize: 0.04, gapSize: 0.12, transparent: true, opacity: 0.9 }));
      l2.computeLineDistances();
      this.axes.add(l1, l2);
    };
    mk(new THREE.Vector3(1, 0, 0), 0xd00000); mk(new THREE.Vector3(0, 1, 0), 0x00a000); mk(new THREE.Vector3(0, 0, 1), 0x0000d0);
    this.scene.add(this.axes);
  }

  resize(w: number, h: number) {
    this.width = w; this.height = h;
    this.renderer.setSize(w, h, false);
    this.rig.setAspect(w / Math.max(h, 1));
    this.overlay.resize(w, h);
    for (const m of this.lineMats) m.resolution.set(w, h);
    this.needsRender = true;
  }

  private lineMats: LineMaterial[] = [];
  private lineMat(color: number, width: number, opts: Partial<LineMaterial> = {}) {
    const m = new LineMaterial({ color, linewidth: width, ...opts } as any);
    m.resolution.set(this.width, this.height); m.clippingPlanes = this.clipPlanes; this.lineMats.push(m); return m;
  }

  // ------------------------------------------------------------ build
  rebuild(state: ViewState) {
    const model = this.model;
    const st = model.settings.style;
    // dispose old
    this.content.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); const mat = (m as any).material; if (mat && !Array.isArray(mat) && mat.userData?.owned) mat.dispose(); });
    this.content.clear();
    this.lineMats = this.lineMats.filter(m => !m.userData.owned);
    this.edges = []; this.verts = []; this.pickMeshes = []; this.profiles = []; this.profileKey = ''; this.faceMe = [];

    // section planes
    this.clipPlanes.length = 0;
    if (model.settings.sectionCuts) for (const s of model.sections) if (s.active) this.clipPlanes.push(new THREE.Plane().setFromNormalAndCoplanarPoint(s.n.clone().normalize(), s.p));

    const hiddenTags = model.hiddenTags();
    const activeKey = state.activePath.map(i => i.id).join('/');
    const showHidden = model.settings.hiddenGeometry;

    const walk = (ents: Entities, path: Instance[], world: THREE.Matrix4, inheritMat: string | undefined) => {
      const key = path.map(i => i.id).join('/');
      const inContext = key.startsWith(activeKey);
      const faded = activeKey !== '' && !inContext;
      const ctx: PickContext = { path, entities: ents, world };
      const fm = path.length ? path[path.length - 1].def.faceMe : false;
      const grp = this.buildEntities(ents, ctx, inheritMat, faded, hiddenTags, showHidden, fm);
      if (fm) this.faceMe.push({ group: grp, world: world.clone() });
      for (const inst of ents.instances.values()) {
        if ((inst.hidden && !showHidden) || (inst.tag && hiddenTags.has(inst.tag))) continue;
        walk(inst.def.entities, [...path, inst], world.clone().multiply(inst.matrix), inst.material ?? inheritMat);
      }
    };
    walk(model.root, [], new THREE.Matrix4(), undefined);

    // shadows & lighting
    const sd = sunDirection(model.settings.shadowHour, model.settings.shadowMonth);
    const bb = model.bounds(); const c = bb.isEmpty() ? new THREE.Vector3() : bb.getCenter(new THREE.Vector3());
    const r = bb.isEmpty() ? 10 : Math.max(10, bb.getBoundingSphere(new THREE.Sphere()).radius * 1.5);
    this.sun.position.copy(c).addScaledVector(sd, r * 2); this.sun.target.position.copy(c);
    const sc = this.sun.shadow.camera as THREE.OrthographicCamera; sc.left = -r; sc.right = r; sc.top = r; sc.bottom = -r; sc.near = 0.1; sc.far = r * 5; sc.updateProjectionMatrix();
    this.renderer.shadowMap.enabled = model.settings.shadows;
    this.sun.castShadow = model.settings.shadows;
    this.shadowGround.visible = model.settings.shadows && st.ground;
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

  private colorOf(name: string | undefined, fallback: string): { c: THREE.Color; o: number } {
    // "#rrggbb" names are handled by Model.material()
    const m = this.model.material(name);
    return m ? { c: new THREE.Color(m.color), o: m.opacity } : { c: new THREE.Color(fallback), o: 1 };
  }

  private buildEntities(ents: Entities, ctx: PickContext, inheritMat: string | undefined, faded: boolean, hiddenTags: Set<string>, showHidden: boolean, faceMe = false): THREE.Group {
    const st = this.model.settings.style;
    const group = new THREE.Group(); group.matrixAutoUpdate = false; group.matrix.copy(ctx.world); group.updateMatrixWorld(true);
    const fadeCol = (c: THREE.Color) => (faded ? c.clone().lerp(new THREE.Color(1, 1, 1), 0.6) : c);

    // ---- faces
    type Bucket = { pos: number[]; nor: number[]; uv: number[]; fcol: number[]; bcol: number[]; tri: number[]; op: number[]; map?: THREE.Texture };
    const bucket = (): Bucket => ({ pos: [], nor: [], uv: [], fcol: [], bcol: [], tri: [], op: [] });
    const opaque = bucket(), trans = bucket();
    const textured = new Map<string, Bucket>();
    const mono = st.faceStyle === 'monochrome' || st.faceStyle === 'hiddenline';
    for (const f of ents.faces.values()) {
      if ((f.hidden && !showHidden) || (f.tag && hiddenTags.has(f.tag))) continue;
      const tri = ents.faceTriangles(f); if (!tri.length) continue;
      const pts = [...f.outer, ...f.holes.flat()].map(v => ents.pos(v));
      const n = ents.faceNormal(f);
      const fm = mono ? { c: new THREE.Color(st.frontColor), o: 1 } : this.colorOf(f.material ?? inheritMat, st.frontColor);
      const bm = mono ? { c: new THREE.Color(st.backColor), o: 1 } : (f.backMaterial ? this.colorOf(f.backMaterial, st.backColor) : f.material || inheritMat ? fm : { c: new THREE.Color(st.backColor), o: 1 });
      // textured materials get their own mesh with planar UVs (texture size in meters, like SketchUp)
      const mdef = !mono && !faded && st.faceStyle === 'textured' ? this.model.material(f.material ?? inheritMat) : undefined;
      let target = fm.o < 1 ? trans : opaque;
      let U: THREE.Vector3 | null = null, Vb: THREE.Vector3 | null = null, tsz = 1;
      if (mdef?.texture && isTextureKind(mdef.texture)) {
        const key = mdef.name + (fm.o < 1 ? ':t' : '');
        let b = textured.get(key); if (!b) { b = bucket(); b.map = makeTexture(mdef.texture, mdef.color); textured.set(key, b); }
        target = b; const pb = planeBasis(n); U = pb.u; Vb = pb.v; tsz = mdef.textureSize ?? TEXTURE_SIZE[mdef.texture];
      }
      const fc = fadeCol(fm.c), bc = fadeCol(bm.c);
      for (let i = 0; i < tri.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          const p = pts[tri[i + k]]; target.pos.push(p.x, p.y, p.z); target.nor.push(n.x, n.y, n.z); target.fcol.push(fc.r, fc.g, fc.b); target.bcol.push(bc.r, bc.g, bc.b);
          if (U && Vb) target.uv.push(p.dot(U) / tsz, p.dot(Vb) / tsz);
        }
        target.tri.push(f.id);
        target.op.push(fm.o);
      }
    }
    const xray = st.xray || faded;
    const mkMesh = (d: Bucket, transparent: boolean, opacity: number) => {
      if (!d.pos.length) return;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(d.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(d.nor, 3));
      if (d.map) g.setAttribute('uv', new THREE.Float32BufferAttribute(d.uv, 2));
      const unlit = st.faceStyle === 'hiddenline';
      const shadows = this.model.settings.shadows;
      const Mat: any = unlit ? THREE.MeshBasicMaterial : THREE.MeshLambertMaterial;
      const common: any = { vertexColors: !d.map, map: d.map ?? null, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1, transparent: transparent || xray, opacity: xray ? Math.min(opacity, 0.5) : opacity, depthWrite: !(transparent || xray), clippingPlanes: this.clipPlanes };
      const mk = (side: THREE.Side) => (unlit || shadows ? new Mat({ ...common, side }) : makeShadeMaterial({ side, transparent: common.transparent, opacity: common.opacity, depthWrite: common.depthWrite, clippingPlanes: this.clipPlanes, map: d.map }));
      const gf = g.clone(); gf.setAttribute('color', new THREE.Float32BufferAttribute(d.fcol, 3));
      const gb = g.clone(); gb.setAttribute('color', new THREE.Float32BufferAttribute(d.bcol, 3));
      const front = new THREE.Mesh(gf, mk(THREE.FrontSide));
      const back = new THREE.Mesh(gb, mk(THREE.BackSide));
      (front.material as any).userData.owned = true; (back.material as any).userData.owned = true;
      for (const m of [front, back]) {
        m.userData.ctx = ctx; m.userData.tri = d.tri; m.castShadow = !transparent; m.receiveShadow = true;
        m.matrixAutoUpdate = false;
        group.add(m); this.pickMeshes.push(m);
        m.visible = st.faceStyle !== 'wireframe';
      }
      g.dispose();
    };
    mkMesh(opaque, false, 1);
    for (const b of textured.values()) { const op = b.op.reduce((a, c) => Math.min(a, c), 1); mkMesh(b, op < 1, op); }
    if (trans.pos.length) mkMesh(trans, true, trans.op.reduce((a, b) => Math.min(a, b), 1));

    // ---- edges
    const lp: number[] = [];
    const showEdges = st.edges || st.faceStyle === 'wireframe';
    for (const e of ents.edges.values()) {
      const a = ents.pos(e.a), b = ents.pos(e.b);
      const hidden = (e.hidden && !showHidden) || (e.tag && hiddenTags.has(e.tag));
      if (hidden) continue;
      const wa = a.clone().applyMatrix4(ctx.world), wb = b.clone().applyMatrix4(ctx.world);
      if (!faceMe) this.edges.push({ a: wa, b: wb, eid: e.id, ctx });
      if (e.soft && !showHidden) continue;
      const fs = ents.facesOfEdge(e.id).filter(f => !((f.hidden && !showHidden) || (f.tag && hiddenTags.has(f.tag))));
      if (!showEdges) {
        // still draw edges without faces (loose lines) so they are visible
        if (fs.length) continue;
      }
      lp.push(a.x, a.y, a.z, b.x, b.y, b.z);
      if (st.profiles && fs.length && st.faceStyle !== 'wireframe') this.profiles.push({ a: wa, b: wb, n: fs.slice(0, 2).map(f => ents.faceNormal(f).transformDirection(ctx.world)), faded });
    }
    if (!faceMe) for (const v of ents.vertices.values()) this.verts.push({ p: v.p.clone().applyMatrix4(ctx.world), vid: v.id, ctx });
    if (meshView.on && !faceMe) this.buildMeshView(ents, group, faded, showHidden, hiddenTags);
    if (lp.length) {
      const g = new LineSegmentsGeometry(); g.setPositions(lp);
      const col = faded ? (theme.night ? 0x4a5563 : 0xb4b4b4) : new THREE.Color(theme.night ? nightEdge(st.edgeColor) : st.edgeColor).getHex();
      const mat = this.lineMat(col, 1, faded ? ({ transparent: true, opacity: 0.6 } as any) : {}); mat.userData.owned = true;
      const ls = new LineSegments2(g, mat); ls.matrixAutoUpdate = false; group.add(ls);
    }
    this.content.add(group);
    return group;
  }

  /** Polygon view overlay for one entities level (local coordinates – the group carries the world matrix). */
  private buildMeshView(ents: Entities, group: THREE.Group, faded: boolean, showHidden: boolean, hiddenTags: Set<string>) {
    const accent = theme.night ? 0x5fd4e6 : 0x0e8ca0;
    const visibleFace = (f: { hidden?: boolean; tag?: string }) => !((f.hidden && !showHidden) || (f.tag && hiddenTags.has(f.tag)));
    // triangulation lines (only the inner diagonals – polygon borders are already edges)
    if (meshView.triangles) {
      const tp: number[] = [];
      for (const f of ents.faces.values()) {
        if (!visibleFace(f)) continue;
        const ids = [...f.outer, ...f.holes.flat()]; const t = ents.faceTriangles(f);
        const border = new Set<string>(); const loops = [f.outer, ...f.holes];
        for (const l of loops) for (let i = 0; i < l.length; i++) { const a = l[i], b = l[(i + 1) % l.length]; border.add(a < b ? `${a}_${b}` : `${b}_${a}`); }
        const seen = new Set<string>();
        for (let i = 0; i < t.length; i += 3) for (let k = 0; k < 3; k++) {
          const a = ids[t[i + k]], b = ids[t[i + (k + 1) % 3]]; const key = a < b ? `${a}_${b}` : `${b}_${a}`;
          if (border.has(key) || seen.has(key)) continue; seen.add(key);
          const p = ents.pos(a), q = ents.pos(b); tp.push(p.x, p.y, p.z, q.x, q.y, q.z);
        }
      }
      if (tp.length) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(tp, 3));
        const m = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: faded ? 0.15 : 0.45, depthTest: true }); m.userData.owned = true;
        const ls = new THREE.LineSegments(g, m); ls.matrixAutoUpdate = false; ls.renderOrder = 3; group.add(ls);
      }
    }
    // softened edges (normally invisible) as dashed lines
    if (meshView.soft) {
      const sp: number[] = [];
      for (const e of ents.edges.values()) if (e.soft) { const p = ents.pos(e.a), q = ents.pos(e.b); sp.push(p.x, p.y, p.z, q.x, q.y, q.z); }
      if (sp.length) {
        const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
        const m = new THREE.LineBasicMaterial({ color: theme.night ? 0xc3cedb : 0x3a4148, transparent: true, opacity: faded ? 0.2 : 0.75 }); m.userData.owned = true;
        const ls = new THREE.LineSegments(g, m); ls.matrixAutoUpdate = false; ls.renderOrder = 3; group.add(ls);
      }
    }
    // corner points
    if (meshView.points && ents.vertices.size) {
      const pp: number[] = []; for (const v of ents.vertices.values()) pp.push(v.p.x, v.p.y, v.p.z);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pp, 3));
      const m = new THREE.PointsMaterial({ color: accent, size: 5, sizeAttenuation: false, transparent: faded, opacity: faded ? 0.3 : 1 }); m.userData.owned = true;
      const pts = new THREE.Points(g, m); pts.matrixAutoUpdate = false; pts.renderOrder = 4; group.add(pts);
    }
  }

  faceMe: { group: THREE.Group; world: THREE.Matrix4 }[] = [];
  /** Turn face-me components so their front (−Y) looks at the camera, rotating about their own Z axis. */
  private updateFaceMe() {
    if (!this.faceMe.length) return;
    const eye = (this.rig.camera as THREE.Camera).position; const fwd = this.rig.forward();
    for (const f of this.faceMe) {
      const o = new THREE.Vector3().setFromMatrixPosition(f.world);
      const front = new THREE.Vector3(0, -1, 0).transformDirection(f.world); front.z = 0;
      const want = this.rig.isOrtho ? fwd.clone().negate() : eye.clone().sub(o); want.z = 0;
      if (front.lengthSq() < 1e-9 || want.lengthSq() < 1e-9) continue;
      front.normalize(); want.normalize();
      const ang = Math.atan2(front.x * want.y - front.y * want.x, front.dot(want));
      f.group.matrix.copy(f.world).multiply(new THREE.Matrix4().makeRotationZ(ang));
      f.group.updateMatrixWorld(true);
    }
  }
  profiles: ProfileRec[] = [];
  profileKey = '';
  profileLines: LineSegments2 | null = null;
  /** Thick silhouette ("profile") edges depend on the view: recompute when the camera moved. */
  private updateProfiles() {
    const cam = this.rig.camera as THREE.PerspectiveCamera;
    const key = cam.matrixWorld.elements.map(v => v.toFixed(4)).join(',') + this.rig.isOrtho + this.profiles.length;
    if (key === this.profileKey) return; this.profileKey = key;
    if (this.profileLines) { this.profileLines.geometry.dispose(); this.scene.remove(this.profileLines); this.profileLines = null; }
    const st = this.model?.settings.style; if (!st?.profiles || !this.profiles.length) return;
    const eye = cam.position; const fwd = this.rig.forward(); const pos: number[] = [];
    for (const p of this.profiles) {
      if (p.faded) continue;
      const mid = p.a.clone().add(p.b).multiplyScalar(0.5);
      const v = this.rig.isOrtho ? fwd.clone().negate() : eye.clone().sub(mid);
      const s = p.n.map(n => n.dot(v) > 0);
      if (s.length === 1 || s[0] !== s[1]) pos.push(p.a.x, p.a.y, p.a.z, p.b.x, p.b.y, p.b.z);
    }
    if (!pos.length) return;
    const g = new LineSegmentsGeometry(); g.setPositions(pos);
    if (!this.profileMat) this.profileMat = this.lineMat(0x000000, 2.4);
    this.profileMat.color.set(st.edgeColor); this.profileMat.clippingPlanes = this.clipPlanes;
    this.profileLines = new LineSegments2(g, this.profileMat); this.profileLines.renderOrder = 2;
    this.scene.add(this.profileLines);
  }
  private profileMat: LineMaterial | null = null;

  guideGroup = new THREE.Group();
  private buildGuides() {
    this.guideGroup.traverse(o => { const m = o as THREE.Line; m.geometry?.dispose(); });
    this.guideGroup.clear();
    if (!this.model.settings.guides) return;
    const mat = new THREE.LineDashedMaterial({ color: 0x555555, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.85 });
    for (const g of this.model.guides) {
      if (g.kind !== 'line' || !g.d) continue;
      const geo = new THREE.BufferGeometry().setFromPoints([g.p.clone().addScaledVector(g.d, -500), g.p.clone().addScaledVector(g.d, 500)]);
      const l = new THREE.Line(geo, mat); l.computeLineDistances(); this.guideGroup.add(l);
    }
    if (!this.guideGroup.parent) this.scene.add(this.guideGroup);
  }

  rebuildHighlight(state: ViewState) {
    this.highlight.traverse(o => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    this.highlight.clear();
    this.lineMats = this.lineMats.filter(m => !m.userData.hl);
    const ctxEnts = state.activePath.length ? state.activePath[state.activePath.length - 1].def.entities : this.model.root;
    const world = new THREE.Matrix4(); for (const i of state.activePath) world.multiply(i.matrix);
    const pos: number[] = []; const lp: number[] = []; const hp: number[] = [];
    const boxes: THREE.Box3[] = [];
    const addFace = (fid: number) => { const f = ctxEnts.faces.get(fid); if (!f) return; const tri = ctxEnts.faceTriangles(f); const pts = [...f.outer, ...f.holes.flat()].map(v => ctxEnts.pos(v)); for (const i of tri) { const p = pts[i]; pos.push(p.x, p.y, p.z); } };
    for (const r of state.selection.values()) {
      if (r.kind === 'face') addFace(r.id);
      if (r.kind === 'edge') { const e = ctxEnts.edges.get(r.id); if (e) { const a = ctxEnts.pos(e.a), b = ctxEnts.pos(e.b); lp.push(a.x, a.y, a.z, b.x, b.y, b.z); } }
      if (r.kind === 'instance') { const i = ctxEnts.instances.get(r.id); if (i) boxes.push(i.def.entities.bounds(new THREE.Box3(), i.matrix.clone())); }
    }
    const hv = state.hover;
    if (hv && !state.selection.has(`${hv.kind}:${hv.id}`)) {
      if (hv.kind === 'edge') { const e = ctxEnts.edges.get(hv.id); if (e) { const a = ctxEnts.pos(e.a), b = ctxEnts.pos(e.b); hp.push(a.x, a.y, a.z, b.x, b.y, b.z); } }
      if (hv.kind === 'face') addFace(hv.id); // pre-selection shows the same dotted face as SketchUp Web
      if (hv.kind === 'instance') { const i = ctxEnts.instances.get(hv.id); if (i) { const bb = i.def.entities.bounds(new THREE.Box3(), i.matrix.clone()); this.boxLines(bb, hp); } }
    }
    for (const b of boxes) this.boxLines(b, lp);
    const g = new THREE.Group(); g.matrixAutoUpdate = false; g.matrix.copy(world);
    if (pos.length) { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); stippleMat.clippingPlanes = this.clipPlanes; const sm = new THREE.Mesh(geo, stippleMat); sm.renderOrder = 10; g.add(sm); }
    if (lp.length) { const geo = new LineSegmentsGeometry(); geo.setPositions(lp); const m = this.lineMat(SEL_COLOR, 2.2, { depthTest: true } as any); m.userData.hl = true; const l = new LineSegments2(geo, m); l.renderOrder = 5; g.add(l); }
    if (hp.length) { const geo = new LineSegmentsGeometry(); geo.setPositions(hp); const m = this.lineMat(SEL_COLOR, 2.0); m.userData.hl = true; const l = new LineSegments2(geo, m); l.renderOrder = 4; g.add(l); }
    this.highlight.add(g); g.updateMatrixWorld(true);
    this.needsRender = true;
  }

  boxLines(b: THREE.Box3, out: number[]) {
    if (b.isEmpty()) return;
    const { min: n, max: x } = b;
    const c = [[n.x, n.y, n.z], [x.x, n.y, n.z], [x.x, x.y, n.z], [n.x, x.y, n.z], [n.x, n.y, x.z], [x.x, n.y, x.z], [x.x, x.y, x.z], [n.x, x.y, x.z]];
    const E = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
    for (const [i, j] of E) out.push(...c[i], ...c[j]);
  }

  // ------------------------------------------------------------ render
  render() {
    this.needsRender = false;
    const st = this.model?.settings.style;
    const cam = this.rig.camera as THREE.PerspectiveCamera;
    cam.updateMatrixWorld();
    this.bgMat.uniforms.invProj.value.copy(cam.projectionMatrixInverse);
    this.bgMat.uniforms.camWorld.value.copy(cam.matrixWorld);
    if (st) {
      tmpSky.set(st.skyColor); tmpGround.set(st.groundColor);
      // blended in linear space – a light model colour only leaves a faint tint
      if (theme.night) { tmpSky.lerp(NIGHT_SKY, 0.97); tmpGround.lerp(NIGHT_GROUND, 0.96); }
      this.bgMat.uniforms.horizon.value.set(theme.night ? '#1b2636' : '#e9ecee');
      this.bgMat.uniforms.bg.value.set(theme.night ? '#0d1116' : '#ffffff');
      this.bgMat.uniforms.sky.value.copy(tmpSky); this.bgMat.uniforms.ground.value.copy(tmpGround);
      this.bgMat.uniforms.useSky.value = st.sky ? 1 : 0; this.bgMat.uniforms.useGround.value = st.ground ? 1 : 0;
    }
    // camera-relative light like SketchUp's default (no sun shading)
    const V = this.rig.forward().negate(); const Rv = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0); const U = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    // measured in SketchUp Web: brightness = 0.45 + 0.8 · (n · view direction)
    shadeUniforms.lightDir.value.copy(V.normalize()); void Rv; void U;
    // moonlight: same direction, much dimmer
    shadeUniforms.dark.value = theme.night ? 0.2 : 0.45; shadeUniforms.light.value = theme.night ? 0.52 : 0.8;
    if (this.profileMat && st) this.profileMat.color.set(theme.night ? nightEdge(st.edgeColor) : st.edgeColor);
    if (this.model) { this.updateFaceMe(); this.updateProfiles(); }
    this.renderer.clear();
    this.renderer.render(this.bgScene, this.bgCam);
    this.renderer.render(this.scene, cam);
    this.overlay.draw();
  }

  // ------------------------------------------------------------ picking helpers
  ndc(x: number, y: number) { return new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1); }
  ray(x: number, y: number): THREE.Ray { return this.rig.ray(this.ndc(x, y)); }

  project(p: THREE.Vector3): { x: number; y: number; z: number; visible: boolean } {
    const v = p.clone().project(this.rig.camera);
    return { x: (v.x + 1) / 2 * this.width, y: (1 - v.y) / 2 * this.height, z: v.z, visible: v.z > -1 && v.z < 1 };
  }

  pickFace(x: number, y: number, filter?: (ctx: PickContext, fid: number) => boolean): FaceHit | null {
    const rc = new THREE.Raycaster(); rc.setFromCamera(this.ndc(x, y), this.rig.camera);
    const vis = this.pickMeshes.filter(m => m.visible);
    const hits = rc.intersectObjects(vis, false);
    for (const h of hits) {
      if (this.clipPlanes.some(pl => pl.distanceToPoint(h.point) < -1e-6)) continue;
      const m = h.object as THREE.Mesh; const fid = m.userData.tri[Math.floor(h.faceIndex! )];
      if (fid == null) continue;
      const ctx: PickContext = m.userData.ctx;
      if (filter && !filter(ctx, fid)) continue;
      const f = ctx.entities.faces.get(fid); if (!f) continue;
      const n = ctx.entities.faceNormal(f).transformDirection(ctx.world);
      return { point: h.point.clone(), fid, ctx, normal: n, distance: h.distance };
    }
    return null;
  }

  /** Distance along view ray to the nearest face (for occlusion tests). */
  faceDepth(x: number, y: number): number { const h = this.pickFace(x, y); return h ? h.distance : Infinity; }

  isOccluded(p: THREE.Vector3, x: number, y: number): boolean {
    if (this.model.settings.style.xray || this.model.settings.style.faceStyle === 'wireframe') return false;
    const camPos = (this.rig.camera as THREE.Camera).position;
    let d: number;
    if (this.rig.isOrtho) { const r = this.ray(x, y); d = p.clone().sub(r.origin).dot(r.direction); }
    else d = p.distanceTo(camPos);
    const fd = this.faceDepth(x, y);
    return fd < d - Math.max(0.002, d * 0.002);
  }

  pickEdge(x: number, y: number, tolPx = 6, filter?: (e: EdgeRec) => boolean): { rec: EdgeRec; point: THREE.Vector3; dist: number } | null {
    let best: { rec: EdgeRec; point: THREE.Vector3; dist: number } | null = null;
    const m = new THREE.Vector2(x, y);
    for (const r of this.edges) {
      if (filter && !filter(r)) continue;
      const pa = this.project(r.a), pb = this.project(r.b);
      if (!pa.visible && !pb.visible) continue;
      const A = new THREE.Vector2(pa.x, pa.y), B = new THREE.Vector2(pb.x, pb.y);
      const ab = B.clone().sub(A); const l2 = ab.lengthSq();
      let t = l2 > 1e-9 ? m.clone().sub(A).dot(ab) / l2 : 0; t = Math.max(0, Math.min(1, t));
      const d = A.clone().add(ab.multiplyScalar(t)).distanceTo(m);
      if (d > tolPx || (best && d >= best.dist)) continue;
      // 3D point on edge closest to the view ray
      const ray = this.ray(x, y); const dir = r.b.clone().sub(r.a);
      const w0 = ray.origin.clone().sub(r.a); const a = dir.dot(dir), b = dir.dot(ray.direction), c = ray.direction.dot(ray.direction), dd = dir.dot(w0), e = ray.direction.dot(w0);
      const den = a * c - b * b; let s = den > 1e-12 ? (b * e - c * dd) / den : t; s = Math.max(0, Math.min(1, s));
      const P = r.a.clone().addScaledVector(dir, s);
      if (this.clipPlanes.some(pl => pl.distanceToPoint(P) < -1e-6)) continue;
      if (this.isOccluded(P, x, y)) continue;
      best = { rec: r, point: P, dist: d };
    }
    return best;
  }

  pickVertex(x: number, y: number, tolPx = 10, filter?: (v: VertRec) => boolean): { rec: VertRec; dist: number } | null {
    let best: { rec: VertRec; dist: number } | null = null;
    for (const v of this.verts) {
      if (filter && !filter(v)) continue;
      const p = this.project(v.p); if (!p.visible) continue;
      const d = Math.hypot(p.x - x, p.y - y);
      if (d > tolPx || (best && d >= best.dist)) continue;
      if (this.clipPlanes.some(pl => pl.distanceToPoint(v.p) < -1e-6)) continue;
      if (this.isOccluded(v.p, x, y)) continue;
      best = { rec: v, dist: d };
    }
    return best;
  }

  /** Screen-space size of one world unit at point p (for constant-size gizmos). */
  worldPerPixel(p: THREE.Vector3): number {
    if (this.rig.isOrtho) return (this.rig.ortho.top - this.rig.ortho.bottom) / this.height;
    const d = p.clone().sub(this.rig.persp.position).dot(this.rig.forward());
    return 2 * Math.max(d, 0.01) * Math.tan(THREE.MathUtils.degToRad(this.rig.persp.fov / 2)) / this.height;
  }

  snapshot(): string { this.render(); return this.canvas.toDataURL('image/png'); }
}

import * as THREE from 'three';
import { PluginLighting } from './pluginLighting';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { acceleratedRaycast, MeshBVH } from 'three-mesh-bvh';
import { SMOOTH_MIN_COS, Entities, isProcedureInput, type Instance, type EntityRef } from '../core/model';
import type { Model } from '../core/document';
import { CameraRig } from './camera';
import { Overlay } from './overlay';
import {
  defaultTextureSize,
  imageTexture,
  isPbrMaterial,
  mapTile,
  releaseImageTextures,
  textureTile,
  tileUv,
  onImageTextureLoad,
  type TextureTile,
} from '../core/textures';
import type { MaterialDef } from '../core/document';
import { loadEnvironment, type LoadedEnvironment } from './environment';
import { applySurface, materialShader, shaderSize, surfaceSetup, type SurfaceSetup } from './surfaceShaders';
import { planeBasis } from '../core/geometry';
import { theme, onThemeChange } from '../theme';
import { meshView } from './meshView';
import { measureView } from './measureView';
import { GroundGrid } from './gridView';
import { AmbientOcclusion } from './ambientOcclusion';

/**
 * Night scene: the model's sky/ground colours are pushed towards a night sky, faces get moonlight and
 * dark edges turn light so the geometry stays readable. The model's own style settings stay untouched.
 */
const NIGHT_SKY = new THREE.Color('#0a1424'),
  NIGHT_GROUND = new THREE.Color('#0d1116');
const NIGHT_EDGE = '#c3cedb',
  MOON = new THREE.Color('#b9c8ff');
const tmpSky = new THREE.Color(),
  tmpGround = new THREE.Color();
const tmpPoint = new THREE.Vector3(),
  tmpRim = new THREE.Vector3(),
  tmpUp = new THREE.Vector3();
const tmpSphere = new THREE.Sphere(),
  tmpMatrix = new THREE.Matrix4();
/** BVHs for the occlusion test of overlay labels, dropped together with their geometry */
/** a tree for fast picking per shape – front, back and copies of a component have the same positions (`indirect` keeps the triangle order) */
const shapeTrees = new WeakMap<THREE.BufferAttribute | THREE.InterleavedBufferAttribute, MeshBVH>();
const shapeTree = (geometry: THREE.BufferGeometry) => {
  const position = geometry.getAttribute('position');
  let tree = shapeTrees.get(position);
  if (!tree) {
    tree = new MeshBVH(geometry, { indirect: true });
    shapeTrees.set(position, tree);
  }
  return tree;
};
/** Edge colours that would vanish on a night background are replaced. */
const nightEdge = (color: string) => (new THREE.Color(color).getHSL({ h: 0, s: 0, l: 0 }).l < 0.35 ? NIGHT_EDGE : color);

export interface PickContext {
  path: Instance[];
  entities: Entities;
  world: THREE.Matrix4;
}
export interface EdgeRec {
  start: THREE.Vector3;
  end: THREE.Vector3;
  edgeId: number;
  context: PickContext;
  /** its ends in the entities' own coordinates – start and end follow when the group is shown elsewhere */
  local: [THREE.Vector3, THREE.Vector3];
}
export interface VertRec {
  position: THREE.Vector3;
  vertexId: number;
  context: PickContext;
  /** in the entities' own coordinates */
  local: THREE.Vector3;
}
export interface FaceHit {
  point: THREE.Vector3;
  faceId: number;
  context: PickContext;
  normal: THREE.Vector3;
  distance: number;
}

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
  side: THREE.DoubleSide,
  polygonOffset: true,
  polygonOffsetFactor: -1,
  polygonOffsetUnits: -1,
  depthWrite: false,
  clipping: true,
});

/** SketchUp-style face shading: camera-relative light, mixed in sRGB like "Light 80 / Dark 45". */
export const shadeUniforms = { lightDir: { value: new THREE.Vector3(0, -1, 0) }, dark: { value: 0.45 }, light: { value: 0.8 } };
const makeShadeMaterial = (opts: {
  side: THREE.Side;
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  clippingPlanes: THREE.Plane[];
  map?: THREE.Texture;
  surface?: SurfaceSetup;
}) => {
  const surface = opts.surface;
  const material = new THREE.ShaderMaterial({
    uniforms: { ...shadeUniforms, ...surface?.uniforms, opacity: { value: opts.opacity }, map: { value: opts.map ?? null } },
    defines: opts.map ? { USE_SU_MAP: '' } : surface ? { USE_S3D_SURFACE: '' } : {},
    vertexColors: true,
    side: opts.side,
    transparent: opts.transparent,
    depthWrite: opts.depthWrite,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    clipping: true,
    clippingPlanes: opts.clippingPlanes,
    vertexShader: `#include <common>
#include <color_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec3 vN; varying vec2 vSuUv;
${surface?.vertexHeader ?? ''}
void main(){
  #include <color_vertex>
  #ifdef USE_SU_MAP
  vSuUv = uv;
  #endif
  ${surface?.vertexMain ?? ''}
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <clipping_planes_vertex>
}`,
    fragmentShader: `uniform vec3 lightDir; uniform float dark; uniform float light; uniform float opacity; uniform sampler2D map;
varying vec3 vN; varying vec2 vSuUv;
#include <color_pars_fragment>
#include <clipping_planes_pars_fragment>
${surface?.fragmentHeader ?? ''}
vec3 toSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main(){
  #include <clipping_planes_fragment>
  vec3 n = normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0);
  float f = clamp(dark + light * max(dot(n, lightDir), 0.0), 0.0, 1.0);
  #ifdef USE_SU_MAP
  vec3 base = texture2D(map, vSuUv).rgb;
  #elif defined(USE_S3D_SURFACE)
  vec3 base = ${surface?.surfaceCall('vColor.rgb') ?? 'vColor.rgb'};
  #else
  vec3 base = vColor.rgb;
  #endif
  gl_FragColor = vec4(toSRGB(base) * f, opacity);
}`,
  });
  if (surface) {
    material.customProgramCacheKey = () => `s3d-shade-surface:${surface.key}`;
  }
  return material;
};

interface ProfileRec {
  start: THREE.Vector3;
  end: THREE.Vector3;
  normals: THREE.Vector3[];
  faded: boolean;
  /** the built group the edge belongs to – it moves with it when its instance is shown elsewhere (display places) */
  built?: { group: THREE.Group; world: THREE.Matrix4 };
}

/** from the model towards the sun: x east, y north (the green axis, unless `north` turns it), z up */
const sunDirection = (hour: number, month: number, latitude: number, north: number): THREE.Vector3 => {
  const lat = THREE.MathUtils.degToRad(latitude);
  const decl = THREE.MathUtils.degToRad(23.44) * Math.sin((2 * Math.PI * ((month - 1) * 30.4 + 15 - 81)) / 365);
  const hourAngle = THREE.MathUtils.degToRad((hour - 12) * 15);
  const alt = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle));
  const azimuth = Math.atan2(-Math.sin(hourAngle), Math.tan(decl) * Math.cos(lat) - Math.sin(lat) * Math.cos(hourAngle));
  // azimuth clockwise from north, as seen from above
  const x = Math.cos(alt) * Math.sin(azimuth),
    y = Math.cos(alt) * Math.cos(azimuth),
    z = Math.sin(alt);
  return new THREE.Vector3(x, y, Math.max(z, 0.05))
    .normalize()
    .applyAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(-north));
};

/** Full quality first, then cheaper settings – weak or software GPUs sometimes refuse antialias/preserveDrawingBuffer. */
const createRenderer = (canvas: HTMLCanvasElement): THREE.WebGLRenderer => {
  const tries: THREE.WebGLRendererParameters[] = [
    { antialias: true, preserveDrawingBuffer: true, stencil: true },
    { antialias: false, preserveDrawingBuffer: true, stencil: true },
    { antialias: false, preserveDrawingBuffer: false, stencil: true, powerPreference: 'low-power', failIfMajorPerformanceCaveat: false },
  ];
  let last: unknown;
  for (const params of tries) {
    try {
      return new THREE.WebGLRenderer({ canvas, ...params });
    } catch (error) {
      last = error;
    }
  }
  throw new WebGLUnavailableError(String((last as Error)?.message ?? last));
};

/** an instance shown for now in another colour (CSS), see-through (0 … 1, multiplies with its own) or hidden */
export interface DisplayLook {
  color?: string;
  opacity?: number;
  hidden?: boolean;
}

/** a material shown for now in another colour (CSS) or opacity (0 … 1) wherever it is used */
export interface DisplayMaterialLook {
  color?: string;
  opacity?: number;
}

/** what a face material needs, so an instance can get its own later */
interface FaceMaterialSetup {
  map?: THREE.Texture;
  surface?: SurfaceSetup;
  /** physically based: its values and pictures */
  pbr?: MaterialDef;
  transparent: boolean;
  opacity: number;
}
/** one level of the model as it is drawn */
interface EntityParts {
  faces: {
    geometry: THREE.BufferGeometry;
    material: THREE.Material;
    setup: FaceMaterialSetup;
    /** the face of each triangle */
    triangles: number[];
    /** each triangle's material (for materials shown in another colour) */
    materials: (string | undefined)[];
    castShadow: boolean;
    base: { opacity: number; transparent: boolean; depthWrite: boolean };
  }[];
  lines: { geometry: LineSegmentsGeometry; material: LineMaterial } | null;
}

/** meshes with fewer triangle corners are picked without a tree */
const PICK_TREE_CORNERS = 15000;

export class WebGLUnavailableError extends Error {
  override name = 'WebGLUnavailableError';
}

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
  /** lights and atmosphere plugins bring (a level's lamps, fog, darkness) */
  pluginLighting = new PluginLighting();
  /** every built group with the instances above it and the place it was built at – for places shown for now */
  private builtGroups: {
    group: THREE.Group;
    path: Instance[];
    world: THREE.Matrix4;
    context: PickContext;
    shown: Entities;
    faceMe: boolean;
    /** the shown shape's box in its own coordinates, null when empty */
    sphere: THREE.Sphere | null;
    /** made when something is picked near this group – models have many */
    records?: { edges: EdgeRec[]; verts: VertRec[] };
  }[] = [];
  /** geometry and materials per level of the model and look – instances that look the same share them */
  /** drawn by plugins over each frame (`render.pass`) – one that throws is taken out */
  renderPasses = new Set<(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) => void>();
  private sharedParts = new Map<Entities, Map<string, EntityParts>>();
  private spheres = new Map<Entities, THREE.Sphere>();
  private recordFilter: { hiddenTags: Set<string>; showHidden: boolean } = { hiddenTags: new Set(), showHidden: false };
  /** edge and vertex records are behind a display place that changed – brought up to date before they are used */
  /** instances shown at another place for now (a test run's moving enemies) – the model is not changed */
  private displayPlaces = new Map<Instance, THREE.Matrix4>();
  /** instances and materials shown in another look for now – the model is not changed */
  private displayLooks = new Map<Instance, DisplayLook>();
  private displayMaterials = new Map<string, DisplayMaterialLook>();
  sun = new THREE.DirectionalLight(0xffffff, 1.5);
  shadowGround: THREE.Mesh;
  grid = new GroundGrid();
  private ambientOcclusion: AmbientOcclusion | null = null;
  overlay: Overlay;
  model!: Model;
  pickMeshes: THREE.Mesh[] = [];
  clipPlanes: THREE.Plane[] = [];
  needsRender = true;
  width = 1;
  height = 1;
  frontMats: THREE.Material[] = [];
  onFrame: (() => void) | null = null;
  /** image textures arrive after the first frame that shows them */
  private stopImageListener = onImageTextureLoad(() => {
    this.needsRender = true;
  });

  constructor(
    public canvas: HTMLCanvasElement,
    overlayCanvas: HTMLCanvasElement,
  ) {
    this.renderer = createRenderer(canvas);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.autoClear = false;
    this.renderer.localClippingEnabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.overlay = new Overlay(overlayCanvas, this);

    this.bgMat = new THREE.ShaderMaterial({
      uniforms: {
        invProj: { value: new THREE.Matrix4() },
        camWorld: { value: new THREE.Matrix4() },
        sky: { value: new THREE.Color() },
        ground: { value: new THREE.Color() },
        horizon: { value: new THREE.Color('#e9ecee') },
        useSky: { value: 1 },
        useGround: { value: 1 },
        bg: { value: new THREE.Color('#ffffff') },
        ortho: { value: 0 },
      },
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
      depthWrite: false,
      depthTest: false,
    });
    const tri = new THREE.BufferGeometry();
    tri.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const mesh = new THREE.Mesh(tri, this.bgMat);
    mesh.frustumCulled = false;
    this.bgScene.add(mesh);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.ambient, this.sun, this.sun.target, this.content, this.helpers, this.highlight, this.pluginLighting.group);
    this.shadowGround = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: 0.25 }));
    this.shadowGround.receiveShadow = true;
    this.shadowGround.position.z = -0.001;
    this.shadowGround.renderOrder = -1;
    this.scene.add(this.shadowGround, this.grid.mesh);
    this.rig.onChange = () => {
      this.needsRender = true;
    };
    onThemeChange(() => {
      this.needsRender = true;
    });
    this.buildAxes();
    const loop = () => {
      if (this.disposed) {
        return;
      }
      this.raf = requestAnimationFrame(loop);
      if (this.rig.update()) {
        this.needsRender = true;
      }
      this.onFrame?.();
      if (this.needsRender) {
        this.render();
      }
    };
    loop();
  }

  private raf = 0;
  private disposed = false;
  /** Stop the frame loop and hand the GL context back – otherwise every remount (e.g. HMR) leaks a live context. */
  dispose() {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.stopImageListener();
    cancelAnimationFrame(this.raf);
    this.ambientOcclusion?.dispose();
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
      const dashedLine = new THREE.Line(
        neg,
        new THREE.LineDashedMaterial({ color, dashSize: 0.04, gapSize: 0.12, transparent: true, opacity: 0.9 }),
      );
      dashedLine.computeLineDistances();
      this.axes.add(solidLine, dashedLine);
    };
    makeAxis(new THREE.Vector3(1, 0, 0), 0xd00000);
    makeAxis(new THREE.Vector3(0, 1, 0), 0x00a000);
    makeAxis(new THREE.Vector3(0, 0, 1), 0x0000d0);
    this.scene.add(this.axes);
  }

  resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.rig.setAspect(width / Math.max(height, 1));
    this.overlay.resize(width, height);
    for (const material of this.lineMats) {
      material.resolution.set(width, height);
    }
    this.needsRender = true;
  }

  private lineMats: LineMaterial[] = [];
  private lineMat(color: number, width: number, opts: Partial<LineMaterial> = {}) {
    const material = new LineMaterial({ color, linewidth: width, ...opts } as any);
    material.resolution.set(this.width, this.height);
    material.clippingPlanes = this.clipPlanes;
    this.lineMats.push(material);
    return material;
  }

  // ------------------------------------------------------------ build
  rebuild(state: ViewState) {
    const model = this.model;
    // dispose old
    this.content.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
      const mat = (mesh as any).material;
      if (mat && !Array.isArray(mat) && mat.userData?.owned) {
        mat.dispose();
      }
    });
    this.content.clear();
    // parts a display look has replaced on all its meshes are no longer in the view
    for (const partsOfEntities of this.sharedParts.values()) {
      for (const parts of partsOfEntities.values()) {
        for (const part of parts.faces) {
          part.geometry.dispose();
          part.material.dispose();
        }
      }
    }
    this.sharedParts.clear();
    this.spheres.clear();
    this.builtGroups = [];
    this.lineMats = this.lineMats.filter((material) => !material.userData.owned);
    this.pickMeshes = [];
    this.profiles = [];
    this.profileKey = '';
    this.faceMe = [];

    // section planes
    this.clipPlanes.length = 0;
    if (model.settings.sectionCuts) {
      for (const section of model.sections) {
        if (section.active) {
          this.clipPlanes.push(new THREE.Plane().setFromNormalAndCoplanarPoint(section.normal.clone().normalize(), section.point));
        }
      }
    }

    const hiddenTags = model.hiddenTags();
    const activeKey = state.activePath.map((instance) => instance.id).join('/');
    const showHidden = model.settings.hiddenGeometry;
    // a procedure that is open shows its inputs instead of its result
    const openEntities = new Set(state.activePath.map((instance) => instance.definition.entities));
    const noGeometry = new Entities();
    this.recordFilter = { hiddenTags, showHidden };

    const walk = (ents: Entities, path: Instance[], world: THREE.Matrix4, inheritMat: string | undefined) => {
      const key = path.map((instance) => instance.id).join('/');
      const inContext = key.startsWith(activeKey);
      const faded = activeKey !== '' && !inContext;
      const context: PickContext = { path, entities: ents, world };
      const faceMe = path.length ? path[path.length - 1].definition.faceMe : false;
      const firstProfile = this.profiles.length;
      const openProcedure = openEntities.has(ents) && !!path[path.length - 1]?.definition.procedure;
      const grp = this.buildEntities(openProcedure ? noGeometry : ents, context, inheritMat, faded, hiddenTags, showHidden, faceMe);
      const built = {
        group: grp,
        path,
        world: world.clone(),
        context,
        shown: openProcedure ? noGeometry : ents,
        faceMe,
        sphere: this.partsSphere(openProcedure ? noGeometry : ents),
      };
      this.builtGroups.push(built);
      for (let index = firstProfile; index < this.profiles.length; index++) {
        this.profiles[index].built = built;
      }
      if (faceMe) {
        this.faceMe.push({ group: grp, world: world.clone() });
      }
      for (const inst of ents.instances.values()) {
        if (inst.procedureRole) {
          if (isProcedureInput(inst) !== openProcedure) {
            continue;
          }
        } else if ((inst.hidden && !showHidden) || (inst.tag && hiddenTags.has(inst.tag))) {
          continue;
        }
        walk(inst.definition.entities, [...path, inst], world.clone().multiply(inst.matrix), inst.material ?? inheritMat);
      }
    };
    walk(model.root, [], new THREE.Matrix4(), undefined);

    this.applyLighting();
    this.scene.fog = this.pluginLighting.fog();
    this.axes.visible = model.settings.axes;

    this.applyDisplayPlaces();
    this.applyDisplayLooks();
    this.content.updateMatrixWorld(true);
    releaseImageTextures(
      new Set(model.materials.flatMap((material) => [...(material.image ? [material.image] : []), ...Object.values(material.maps ?? {})])),
    );
    this.applyEnvironment(state);
    this.buildGuides();
    this.rebuildHighlight(state);
    this.needsRender = true;
  }

  private loadedEnvironment: LoadedEnvironment | null = null;
  /** the stored picture `loadedEnvironment` was made from */
  private environmentData: string | undefined;

  /** the model's environment as light, reflections and sky; a new picture is read in the background and builds the view again */
  private applyEnvironment(state: ViewState) {
    const { environment, settings } = this.model;
    if (environment?.data !== this.environmentData) {
      const wanted = (this.environmentData = environment?.data);
      this.loadedEnvironment?.dispose();
      this.loadedEnvironment = null;
      if (environment) {
        loadEnvironment(this.renderer, environment)
          .then((loaded) => {
            if (wanted !== this.environmentData) {
              loaded.dispose();
              return;
            }
            this.loadedEnvironment = loaded;
            this.rebuild(state);
          })
          .catch((error) => console.error('Environment:', error));
      }
    }
    const loaded = this.loadedEnvironment;
    this.scene.environment = loaded?.lighting.texture ?? null;
    this.scene.environmentIntensity = settings.environmentIntensity;
    this.scene.background = loaded && settings.environmentBackground ? loaded.background : null;
    this.scene.backgroundIntensity = settings.environmentIntensity;
    // the pictures have Y up, the model Z
    this.scene.environmentRotation.set(Math.PI / 2, 0, 0);
    this.scene.backgroundRotation.set(Math.PI / 2, 0, 0);
  }

  /**
   * the sun (from the model's shadow settings or a plugin's sun), the room light and the shadows – done while the
   * view is built and again when a plugin moves its sun, which needs no new build
   */
  applyLighting() {
    const model = this.model;
    const style = model.settings.style;
    // a plugin's sun (an animation's sunset) – else the model's
    const pluginSun = this.pluginLighting.sun;
    const { latitude, north } = model.settings;
    const sunDir = sunDirection(
      pluginSun?.hour ?? model.settings.shadowHour,
      pluginSun?.month ?? model.settings.shadowMonth,
      latitude,
      north,
    );
    const box = model.bounds();
    const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
    const radius = box.isEmpty() ? 10 : Math.max(10, box.getBoundingSphere(new THREE.Sphere()).radius * 1.5);
    this.sun.position.copy(center).addScaledVector(sunDir, radius * 2);
    this.sun.target.position.copy(center);
    const camera = this.sun.shadow.camera as THREE.OrthographicCamera;
    camera.left = -radius;
    camera.right = radius;
    camera.top = radius;
    camera.bottom = -radius;
    camera.near = 0.1;
    camera.far = radius * 5;
    camera.updateProjectionMatrix();
    // the model's sun shadows – or the shadows of lights a plugin brought
    this.renderer.shadowMap.enabled = model.settings.shadows || this.pluginLighting.casts();
    this.sun.castShadow = model.settings.shadows;
    this.shadowGround.visible = model.settings.shadows && style.ground;
    // three.js divides Lambert irradiance by π – these values give SketchUp-like light/dark (≈ 80/45)
    if (model.settings.shadows) {
      this.ambient.intensity = 1.45;
      this.sun.intensity = 2.6;
    } else {
      this.ambient.intensity = 1.85;
      this.sun.intensity = 1.55;
    }
    if (theme.night) {
      this.ambient.intensity *= 0.4;
      this.sun.intensity *= 0.55;
      this.sun.color.copy(MOON);
      this.ambient.color.copy(MOON);
    } else {
      this.sun.color.set(0xffffff);
      this.ambient.color.set(0xffffff);
    }
    // a plugin's atmosphere: less daylight (night, a dark house) and fog
    const daylight = this.pluginLighting.daylight();
    this.ambient.intensity *= daylight * (0.25 + 0.75 * (pluginSun?.daylight ?? 1));
    this.sun.intensity *= daylight * (pluginSun?.daylight ?? 1);
    // a plugin's sun near the horizon fades out, below it is gone
    if (pluginSun?.hour !== undefined) {
      const height = sunDirection(pluginSun.hour, pluginSun.month ?? model.settings.shadowMonth, latitude, north).z;
      const night = pluginSun.hour < 4 || pluginSun.hour > 22;
      this.sun.intensity *= night ? 0 : Math.min(1, Math.max(0, (height - 0.05) / 0.2) + 0.15);
    }
    this.needsRender = true;
  }

  private colorOf(name: string | undefined, fallback: string): { color: THREE.Color; opacity: number } {
    // "#rrggbb" names are handled by Model.material()
    const material = this.model.material(name);
    // a material's opacity shown for now decides which mesh its faces go into (opaque or see-through)
    const shown = material ? this.displayMaterials.get(material.name)?.opacity : undefined;
    return material
      ? { color: new THREE.Color(material.color), opacity: shown ?? material.opacity }
      : { color: new THREE.Color(fallback), opacity: 1 };
  }

  private buildEntities(
    ents: Entities,
    context: PickContext,
    inheritMat: string | undefined,
    faded: boolean,
    hiddenTags: Set<string>,
    showHidden: boolean,
    faceMe = false,
  ): THREE.Group {
    const style = this.model.settings.style;
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    group.matrix.copy(context.world);
    group.updateMatrixWorld(true);
    // copies of a component with the same look share geometry and materials
    const partsKey = `${faded ? 1 : 0}|${inheritMat ?? ''}`;
    const partsOfEntities = this.sharedParts.get(ents) ?? this.sharedParts.set(ents, new Map()).get(ents)!;
    let parts = partsOfEntities.get(partsKey);
    if (!parts) {
      parts = this.buildParts(ents, inheritMat, faded, hiddenTags, showHidden);
      partsOfEntities.set(partsKey, parts);
    }
    for (const part of parts.faces) {
      const mesh = new THREE.Mesh(part.geometry, part.material);
      mesh.raycast = acceleratedRaycast;
      mesh.userData.ctx = context;
      mesh.userData.tri = part.triangles;
      mesh.userData.materials = part.materials;
      // what display looks start from
      mesh.userData.faded = faded;
      mesh.userData.shared = true;
      mesh.userData.setup = part.setup;
      mesh.userData.base = part.base;
      mesh.castShadow = part.castShadow;
      mesh.receiveShadow = true;
      mesh.matrixAutoUpdate = false;
      group.add(mesh);
      this.pickMeshes.push(mesh);
      mesh.visible = style.faceStyle !== 'wireframe';
    }
    // ---- edges drawn sharp between faces at an angle, as the model's profiles
    if (style.profiles && style.faceStyle !== 'wireframe') {
      for (const edge of ents.edges.values()) {
        if ((edge.hidden && !showHidden) || (edge.tag && hiddenTags.has(edge.tag)) || (edge.soft && !showHidden)) {
          continue;
        }
        const faces = ents.facesOfEdge(edge.id).filter((face) => !((face.hidden && !showHidden) || (face.tag && hiddenTags.has(face.tag))));
        if (faces.length) {
          this.profiles.push({
            start: ents.positionOf(edge.start).clone().applyMatrix4(context.world),
            end: ents.positionOf(edge.end).clone().applyMatrix4(context.world),
            normals: faces.slice(0, 2).map((face) => ents.faceNormal(face).transformDirection(context.world)),
            faded,
          });
        }
      }
    }
    if (meshView.on && !faceMe) {
      this.buildMeshView(ents, group, faded, showHidden, hiddenTags);
    }
    if (parts.lines) {
      const lines = new LineSegments2(parts.lines.geometry, parts.lines.material);
      lines.matrixAutoUpdate = false;
      group.add(lines);
    }
    this.content.add(group);
    return group;
  }

  /** A material for faces. */
  private faceMaterial(setup: FaceMaterialSetup, side: THREE.Side) {
    const style = this.model.settings.style;
    const unlit = style.faceStyle === 'hiddenline';
    let material: THREE.Material;
    // lit materials with shadows – and while plugins bring lights or an atmosphere, so they fall on the faces
    if (unlit || this.model.settings.shadows || this.pluginLighting.active() || setup.pbr || this.loadedEnvironment) {
      // the environment only lights physically based materials
      const physical = !unlit && (setup.pbr || this.loadedEnvironment);
      const Mat: any = unlit ? THREE.MeshBasicMaterial : physical ? THREE.MeshStandardMaterial : THREE.MeshLambertMaterial;
      const maps = setup.pbr?.maps;
      const physicalParameters = physical
        ? {
            roughness: setup.pbr?.roughness ?? (maps?.roughness ? 1 : 0.8),
            metalness: setup.pbr?.metalness ?? (maps?.metalness ? 1 : 0),
            ...(maps?.normal ? { normalMap: imageTexture(maps.normal, true) } : {}),
            ...(maps?.roughness ? { roughnessMap: imageTexture(maps.roughness, true) } : {}),
            ...(maps?.metalness ? { metalnessMap: imageTexture(maps.metalness, true) } : {}),
            ...(maps?.ao ? { aoMap: imageTexture(maps.ao, true) } : {}),
          }
        : {};
      material = new Mat({
        vertexColors: !setup.map,
        map: setup.map ?? null,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
        transparent: setup.transparent,
        opacity: setup.opacity,
        depthWrite: !setup.transparent,
        clippingPlanes: this.clipPlanes,
        side,
        ...physicalParameters,
      });
      if (setup.surface) {
        applySurface(material as any, setup.surface);
      }
    } else {
      material = makeShadeMaterial({
        side,
        transparent: setup.transparent,
        opacity: setup.opacity,
        depthWrite: !setup.transparent,
        clippingPlanes: this.clipPlanes,
        map: setup.map,
        surface: setup.surface,
      });
    }
    material.userData.owned = true;
    return material;
  }

  /** The geometry and materials of one level of the model – for every instance that looks the same. */
  private buildParts(
    ents: Entities,
    inheritMat: string | undefined,
    faded: boolean,
    hiddenTags: Set<string>,
    showHidden: boolean,
  ): EntityParts {
    const style = this.model.settings.style;
    const parts: EntityParts = { faces: [], lines: null };
    const fadeCol = (color: THREE.Color) => (faded ? color.clone().lerp(new THREE.Color(1, 1, 1), 0.6) : color);

    // ---- faces
    type Bucket = {
      positions: number[];
      normals: number[];
      uvs: number[];
      frontColors: number[];
      backColors: number[];
      triangles: number[];
      opacities: number[];
      /** each triangle's material on its front and its back (for materials shown in another colour) */
      frontMaterials: (string | undefined)[];
      backMaterials: (string | undefined)[];
      map?: THREE.Texture;
      surface?: SurfaceSetup;
      pbr?: MaterialDef;
    };
    const bucket = (): Bucket => ({
      positions: [],
      normals: [],
      uvs: [],
      frontColors: [],
      backColors: [],
      triangles: [],
      opacities: [],
      frontMaterials: [],
      backMaterials: [],
    });
    const opaque = bucket(),
      trans = bucket();
    const textured = new Map<string, Bucket>();
    const mono = style.faceStyle === 'monochrome' || style.faceStyle === 'hiddenline';
    // a pattern made for walls is one colour on a small part: without a size of its own, it fits what it is on
    const halfSize = this.partsSphere(ents)?.radius ?? Infinity;
    const faceLooks = new Map<number, { normal: THREE.Vector3; area: number }>();
    const fittedMaterials = new Map<MaterialDef, MaterialDef>();
    const fitted = (material: MaterialDef) => {
      let result = fittedMaterials.get(material);
      if (!result) {
        const shader = materialShader(material);
        const usual = shader ? shaderSize(material, shader) : defaultTextureSize(material);
        result = material.textureSize === undefined && halfSize < usual ? { ...material, textureSize: halfSize } : material;
        fittedMaterials.set(material, result);
      }
      return result;
    };
    for (const face of ents.faces.values()) {
      if ((face.hidden && !showHidden) || (face.tag && hiddenTags.has(face.tag))) {
        continue;
      }
      const tri = ents.faceTriangles(face);
      if (!tri.length) {
        continue;
      }
      const pts = [...face.outer, ...face.holes.flat()].map((vertex) => ents.positionOf(vertex));
      const normal = ents.faceNormal(face);
      const corners = [...face.outer, ...face.holes.flat()];
      const cornerNormals = ents.faceEdges(face).some((edge) => edge.soft)
        ? corners.map((vertex) => ents.smoothNormal(face, vertex, SMOOTH_MIN_COS, faceLooks))
        : null;
      const frontLook = mono
        ? { color: new THREE.Color(style.frontColor), opacity: 1 }
        : this.colorOf(face.material ?? inheritMat, style.frontColor);
      const backLook = mono
        ? { color: new THREE.Color(style.backColor), opacity: 1 }
        : face.backMaterial
          ? this.colorOf(face.backMaterial, style.backColor)
          : face.material || inheritMat
            ? frontLook
            : { color: new THREE.Color(style.backColor), opacity: 1 };
      // textured materials get their own mesh with planar UVs (texture size in meters, like SketchUp)
      const mdef = !mono && !faded && style.faceStyle === 'textured' ? this.model.material(face.material ?? inheritMat) : undefined;
      let target = frontLook.opacity < 1 ? trans : opaque;
      let texU: THREE.Vector3 | null = null,
        texV: THREE.Vector3 | null = null,
        tile: TextureTile | undefined;
      const shader = materialShader(mdef);
      if (mdef && shader) {
        // shader materials: their own mesh too, the shader draws the pattern from the positions
        const key = 'shader:' + mdef.name + (frontLook.opacity < 1 ? ':t' : '');
        let shaderBucket = textured.get(key);
        if (!shaderBucket) {
          shaderBucket = bucket();
          shaderBucket.surface = surfaceSetup(shader, fitted(mdef));
          textured.set(key, shaderBucket);
        }
        target = shaderBucket;
      } else if (mdef && isPbrMaterial(mdef)) {
        const key = 'pbr:' + mdef.name + (frontLook.opacity < 1 ? ':t' : '');
        let pbrBucket = textured.get(key);
        const colorTile = textureTile(fitted(mdef));
        if (!pbrBucket) {
          pbrBucket = bucket();
          pbrBucket.map = colorTile?.map;
          pbrBucket.pbr = mdef;
          textured.set(key, pbrBucket);
        }
        target = pbrBucket;
        tile = colorTile ?? ({ ...mapTile(fitted(mdef)), map: undefined } as unknown as TextureTile);
        const basis = planeBasis(normal);
        texU = basis.basisU;
        texV = basis.basisV;
      } else if ((tile = textureTile(mdef && fitted(mdef)))) {
        const key = mdef!.name + (frontLook.opacity < 1 ? ':t' : '');
        let textureBucket = textured.get(key);
        if (!textureBucket) {
          textureBucket = bucket();
          textureBucket.map = tile.map;
          textured.set(key, textureBucket);
        }
        target = textureBucket;
        const basis = planeBasis(normal);
        texU = basis.basisU;
        texV = basis.basisV;
      }
      const color = fadeCol(frontLook.color),
        backColor = fadeCol(backLook.color);
      for (let i = 0; i < tri.length; i += 3) {
        for (let k = 0; k < 3; k++) {
          const point = pts[tri[i + k]];
          target.positions.push(point.x, point.y, point.z);
          const shading = cornerNormals?.[tri[i + k]] ?? normal;
          target.normals.push(shading.x, shading.y, shading.z);
          target.frontColors.push(color.r, color.g, color.b);
          target.backColors.push(backColor.r, backColor.g, backColor.b);
          if (tile && texU && texV) {
            target.uvs.push(...tileUv(tile, point, texU, texV));
          }
        }
        target.triangles.push(face.id);
        target.opacities.push(frontLook.opacity);
        target.frontMaterials.push(mono ? undefined : (face.material ?? inheritMat));
        target.backMaterials.push(
          mono ? undefined : (face.backMaterial ?? (face.material || inheritMat ? (face.material ?? inheritMat) : undefined)),
        );
      }
    }
    const xray = style.xray || faded;
    const mkMesh = (data: Bucket, transparent: boolean, opacity: number) => {
      if (!data.positions.length) {
        return;
      }
      const position = new THREE.Float32BufferAttribute(data.positions, 3);
      const normal = new THREE.Float32BufferAttribute(data.normals, 3);
      const uv = data.uvs.length ? new THREE.Float32BufferAttribute(data.uvs, 2) : null;
      const setup: FaceMaterialSetup = {
        map: data.map,
        surface: data.surface,
        pbr: data.pbr,
        transparent: transparent || xray,
        opacity: xray ? Math.min(opacity, 0.5) : opacity,
      };
      const addSide = (side: THREE.Side, colors: number[], materials: (string | undefined)[]) => {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', position);
        geometry.setAttribute('normal', normal);
        if (uv) {
          geometry.setAttribute('uv', uv);
        }
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const material = this.faceMaterial(setup, side);
        parts.faces.push({
          geometry,
          material,
          setup,
          triangles: data.triangles,
          materials,
          castShadow: !transparent,
          base: { opacity: material.opacity, transparent: material.transparent, depthWrite: material.depthWrite },
        });
      };
      addSide(THREE.FrontSide, data.frontColors, data.frontMaterials);
      addSide(THREE.BackSide, data.backColors, data.backMaterials);
    };
    mkMesh(opaque, false, 1);
    for (const textureBucket of textured.values()) {
      const opacity = textureBucket.opacities.reduce((lowest, value) => Math.min(lowest, value), 1);
      mkMesh(textureBucket, opacity < 1, opacity);
    }
    if (trans.positions.length) {
      mkMesh(
        trans,
        true,
        trans.opacities.reduce((lowest, value) => Math.min(lowest, value), 1),
      );
    }

    // ---- edges
    const linePositions: number[] = [];
    const showEdges = style.edges || style.faceStyle === 'wireframe';
    for (const edge of ents.edges.values()) {
      if ((edge.hidden && !showHidden) || (edge.tag && hiddenTags.has(edge.tag)) || (edge.soft && !showHidden)) {
        continue;
      }
      // without edges shown, those without faces (loose lines) are still drawn
      if (
        !showEdges &&
        ents.facesOfEdge(edge.id).some((face) => !((face.hidden && !showHidden) || (face.tag && hiddenTags.has(face.tag))))
      ) {
        continue;
      }
      const start = ents.positionOf(edge.start),
        end = ents.positionOf(edge.end);
      linePositions.push(start.x, start.y, start.z, end.x, end.y, end.z);
    }
    if (linePositions.length) {
      const geometry = new LineSegmentsGeometry();
      geometry.setPositions(linePositions);
      const col = faded
        ? theme.night
          ? 0x4a5563
          : 0xb4b4b4
        : new THREE.Color(theme.night ? nightEdge(style.edgeColor) : style.edgeColor).getHex();
      const material = this.lineMat(col, 1, faded ? ({ transparent: true, opacity: 0.6 } as any) : {});
      material.userData.owned = true;
      parts.lines = { geometry, material };
    }
    return parts;
  }

  /** Polygon view overlay for one entities level (local coordinates – the group carries the world matrix). */
  private buildMeshView(ents: Entities, group: THREE.Group, faded: boolean, showHidden: boolean, hiddenTags: Set<string>) {
    const accent = theme.night ? 0x5fd4e6 : 0x0e8ca0;
    const visibleFace = (face: { hidden?: boolean; tag?: string }) =>
      !((face.hidden && !showHidden) || (face.tag && hiddenTags.has(face.tag)));
    // triangulation lines (only the inner diagonals – polygon borders are already edges)
    if (meshView.triangles) {
      const triPositions: number[] = [];
      for (const face of ents.faces.values()) {
        if (!visibleFace(face)) {
          continue;
        }
        const ids = [...face.outer, ...face.holes.flat()];
        const triangles = ents.faceTriangles(face);
        const border = new Set<string>();
        const loops = [face.outer, ...face.holes];
        for (const loop of loops) {
          for (let i = 0; i < loop.length; i++) {
            const vertexA = loop[i],
              vertexB = loop[(i + 1) % loop.length];
            border.add(vertexA < vertexB ? `${vertexA}_${vertexB}` : `${vertexB}_${vertexA}`);
          }
        }
        const seen = new Set<string>();
        for (let i = 0; i < triangles.length; i += 3) {
          for (let k = 0; k < 3; k++) {
            const vertexA = ids[triangles[i + k]],
              vertexB = ids[triangles[i + ((k + 1) % 3)]];
            const key = vertexA < vertexB ? `${vertexA}_${vertexB}` : `${vertexB}_${vertexA}`;
            if (border.has(key) || seen.has(key)) {
              continue;
            }
            seen.add(key);
            const start = ents.positionOf(vertexA),
              end = ents.positionOf(vertexB);
            triPositions.push(start.x, start.y, start.z, end.x, end.y, end.z);
          }
        }
      }
      if (triPositions.length) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(triPositions, 3));
        const material = new THREE.LineBasicMaterial({ color: accent, transparent: true, opacity: faded ? 0.15 : 0.45, depthTest: true });
        material.userData.owned = true;
        const lines = new THREE.LineSegments(geometry, material);
        lines.matrixAutoUpdate = false;
        lines.renderOrder = 3;
        group.add(lines);
      }
    }
    // softened edges (normally invisible) as dashed lines
    if (meshView.soft) {
      const softPositions: number[] = [];
      for (const edge of ents.edges.values()) {
        if (edge.soft) {
          const start = ents.positionOf(edge.start),
            end = ents.positionOf(edge.end);
          softPositions.push(start.x, start.y, start.z, end.x, end.y, end.z);
        }
      }
      if (softPositions.length) {
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(softPositions, 3));
        const material = new THREE.LineBasicMaterial({
          color: theme.night ? 0xc3cedb : 0x3a4148,
          transparent: true,
          opacity: faded ? 0.2 : 0.75,
        });
        material.userData.owned = true;
        const lines = new THREE.LineSegments(geometry, material);
        lines.matrixAutoUpdate = false;
        lines.renderOrder = 3;
        group.add(lines);
      }
    }
    // corner points
    if (meshView.points && ents.vertices.size) {
      const pointPositions: number[] = [];
      for (const vertex of ents.vertices.values()) {
        pointPositions.push(vertex.position.x, vertex.position.y, vertex.position.z);
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(pointPositions, 3));
      const material = new THREE.PointsMaterial({
        color: accent,
        size: 5,
        sizeAttenuation: false,
        transparent: faded,
        opacity: faded ? 0.3 : 1,
      });
      material.userData.owned = true;
      const pts = new THREE.Points(geometry, material);
      pts.matrixAutoUpdate = false;
      pts.renderOrder = 4;
      group.add(pts);
    }
  }

  faceMe: { group: THREE.Group; world: THREE.Matrix4 }[] = [];
  /** Turn face-me components so their front (−Y) looks at the camera, rotating about their own Z axis. */
  /**
   * Shows an instance at another place for now (its matrix in its parent, null: back to its own) – the model is not
   * changed and the view is not built again; the place stays shown until it is taken back.
   */
  placeForDisplay(instance: Instance, matrix: THREE.Matrix4 | null) {
    if (matrix) {
      this.displayPlaces.set(instance, matrix.clone());
    } else {
      this.displayPlaces.delete(instance);
    }
    this.applyDisplayPlaces(instance);
    this.displayRevision++;
    this.needsRender = true;
  }
  /** bumped when a display place changes – the profile edges follow then */
  private displayRevision = 0;

  /**
   * Shows an instance (and everything in it) in another colour, see-through or hidden for now – null gives it its
   * own look back. Applied to the built meshes, so the view is not built again.
   */
  /** the look an instance is shown with for now (`lookForDisplay`), or null */
  shownLook(instance: Instance): DisplayLook | null {
    return this.displayLooks.get(instance) ?? null;
  }
  lookForDisplay(instance: Instance, look: DisplayLook | null) {
    if (look) {
      this.displayLooks.set(instance, { ...look });
    } else if (!this.displayLooks.delete(instance)) {
      return;
    }
    this.applyDisplayLooks();
    this.highlightStale = true;
    this.needsRender = true;
  }

  /**
   * Shows a material in another colour or opacity for now, wherever it is used – null gives it its own back. Returns
   * true when the view has to be built again (its opacity changed: faces may go into another mesh); a colour alone
   * is put onto the built meshes.
   */
  materialForDisplay(name: string, look: DisplayMaterialLook | null): boolean {
    const before = this.displayMaterials.get(name);
    if (look) {
      this.displayMaterials.set(name, { ...look });
    } else if (!this.displayMaterials.delete(name)) {
      return false;
    }
    if (before?.opacity !== look?.opacity) {
      return true;
    }
    this.applyDisplayLooks();
    this.needsRender = true;
    return false;
  }

  /** the looks shown for now on the built meshes: colours, opacity and hidden groups – from what the build made */
  private applyDisplayLooks() {
    const materialColors = new Map<string, THREE.Color>();
    for (const [name, look] of this.displayMaterials) {
      if (look.color) {
        materialColors.set(name, new THREE.Color(look.color));
      }
    }
    const white = new THREE.Color(1, 1, 1);
    for (const built of this.builtGroups) {
      const looks = built.path.map((instance) => this.displayLooks.get(instance)).filter((look) => !!look);
      if (!looks.length && !materialColors.size && !built.group.userData.looked) {
        continue;
      }
      built.group.userData.looked = looks.length > 0 || materialColors.size > 0;
      built.group.visible = !looks.some((look) => look.hidden);
      // the innermost colour wins, opacities multiply
      const tintColor = [...looks].reverse().find((look) => look.color)?.color;
      const tint = tintColor ? new THREE.Color(tintColor) : null;
      const opacity = Math.min(
        1,
        Math.max(
          0,
          looks.reduce((product, look) => product * (look.opacity ?? 1), 1),
        ),
      );
      for (const child of built.group.children) {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || !mesh.userData.tri) {
          continue;
        }
        this.ownFaceMesh(mesh);
        const faded = (color: THREE.Color) => (mesh.userData.faded ? color.clone().lerp(white, 0.6) : color);
        const attribute = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
        const colors = attribute.array as Float32Array;
        colors.set(mesh.userData.baseColors);
        if (tint) {
          const shown = faded(tint);
          for (let index = 0; index < colors.length; index += 3) {
            colors[index] = shown.r;
            colors[index + 1] = shown.g;
            colors[index + 2] = shown.b;
          }
        } else if (materialColors.size) {
          (mesh.userData.materials as (string | undefined)[]).forEach((name, triangle) => {
            const color = name !== undefined ? materialColors.get(name) : undefined;
            if (color) {
              const shown = faded(color);
              for (let corner = 0; corner < 3; corner++) {
                colors.set([shown.r, shown.g, shown.b], (triangle * 3 + corner) * 3);
              }
            }
          });
        }
        attribute.needsUpdate = true;
        const material = mesh.material as THREE.Material;
        const base = mesh.userData.base as { opacity: number; transparent: boolean; depthWrite: boolean };
        const transparent = base.transparent || opacity < 1;
        if (material.transparent !== transparent) {
          material.needsUpdate = true;
        }
        material.transparent = transparent;
        material.opacity = base.opacity * opacity;
        material.depthWrite = opacity < 1 ? false : base.depthWrite;
        if ('uniforms' in material && (material as THREE.ShaderMaterial).uniforms.opacity) {
          (material as THREE.ShaderMaterial).uniforms.opacity.value = material.opacity;
        }
      }
    }
  }

  /** a mesh about to look different from the other instances: its own colours and material – its shape stays shared */
  private ownFaceMesh(mesh: THREE.Mesh) {
    if (!mesh.userData.shared) {
      return;
    }
    mesh.userData.shared = false;
    const geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(mesh.geometry.attributes)) {
      geometry.setAttribute(name, name === 'color' ? (attribute as THREE.BufferAttribute).clone() : attribute);
    }
    geometry.boundingSphere = mesh.geometry.boundingSphere;
    mesh.userData.baseColors = (mesh.geometry.getAttribute('color').array as Float32Array).slice();
    mesh.geometry = geometry;
    mesh.material = this.faceMaterial(mesh.userData.setup, (mesh.material as THREE.Material).side);
  }

  /** the box around a level's points as a sphere, shared by its instances */
  private partsSphere(ents: Entities) {
    if (!ents.vertices.size) {
      return null;
    }
    let sphere = this.spheres.get(ents);
    if (!sphere) {
      const box = new THREE.Box3();
      for (const vertex of ents.vertices.values()) {
        box.expandByPoint(vertex.position);
      }
      sphere = box.getBoundingSphere(new THREE.Sphere());
      this.spheres.set(ents, sphere);
    }
    return sphere;
  }

  /** Edge and vertex records of one built group, where it is shown now. */
  private groupRecords(built: Viewer['builtGroups'][number]) {
    if (built.records) {
      return built.records;
    }
    const { hiddenTags, showHidden } = this.recordFilter;
    const { shown, context } = built;
    const records: { edges: EdgeRec[]; verts: VertRec[] } = { edges: [], verts: [] };
    for (const edge of shown.edges.values()) {
      if ((edge.hidden && !showHidden) || (edge.tag && hiddenTags.has(edge.tag))) {
        continue;
      }
      const start = shown.positionOf(edge.start),
        end = shown.positionOf(edge.end);
      records.edges.push({
        start: start.clone().applyMatrix4(context.world),
        end: end.clone().applyMatrix4(context.world),
        edgeId: edge.id,
        context,
        local: [start, end],
      });
    }
    for (const vertex of shown.vertices.values()) {
      records.verts.push({
        position: vertex.position.clone().applyMatrix4(context.world),
        vertexId: vertex.id,
        context,
        local: vertex.position,
      });
    }
    built.records = records;
    return records;
  }

  /** whether a group can have anything within `tolPx` of a screen point – most of a big scene does not */
  private groupNear(built: Viewer['builtGroups'][number], x: number, y: number, tolPx: number) {
    if (!built.sphere) {
      return false;
    }
    const center = tmpPoint.copy(built.sphere.center).applyMatrix4(built.context.world);
    const radius = built.sphere.radius * built.context.world.getMaxScaleOnAxis();
    const camera = this.rig.camera as THREE.Camera;
    // the eye in or close to it: no sensible circle on the screen
    if (!this.rig.isOrtho && center.distanceTo(camera.position) < radius * 1.5) {
      return true;
    }
    const projected = this.project(center);
    if (!projected.visible) {
      return true;
    }
    const rim = this.project(tmpRim.copy(center).addScaledVector(tmpUp.setFromMatrixColumn(camera.matrixWorld, 1), radius));
    const radiusPx = Math.hypot(rim.x - projected.x, rim.y - projected.y) * 1.3; // perspective makes it a little larger
    return Math.hypot(projected.x - x, projected.y - y) <= radiusPx + tolPx;
  }

  /** the snap points of everything shown, where it is shown now; `vertexId` is the point's place in its definition */
  snapRecords() {
    const records: VertRec[] = [];
    for (const { path, context } of this.builtGroups) {
      path[path.length - 1]?.definition.snaps?.forEach((point, index) => {
        const local = new THREE.Vector3(point[0], point[1], point[2]);
        records.push({ position: local.clone().applyMatrix4(context.world), vertexId: index, context, local });
      });
    }
    return records;
  }

  /** the edge and vertex records (for picking and snapping) of the groups near a screen point */
  recordsNear(x: number, y: number, tolPx: number) {
    const edges: EdgeRec[][] = [];
    const verts: VertRec[][] = [];
    for (const built of this.builtGroups) {
      if (!built.faceMe && this.groupNear(built, x, y, tolPx)) {
        const records = this.groupRecords(built);
        edges.push(records.edges);
        verts.push(records.verts);
      }
    }
    return { edges: edges.flat(), verts: verts.flat() };
  }

  /** the edge and vertex records of everything shown, where it is shown now */
  pickRecords() {
    const edges: EdgeRec[][] = [];
    const verts: VertRec[][] = [];
    for (const built of this.builtGroups) {
      if (!built.faceMe) {
        const records = this.groupRecords(built);
        edges.push(records.edges);
        verts.push(records.verts);
      }
    }
    return { edges: edges.flat(), verts: verts.flat() };
  }

  /** an instance's matrix in its parent as the view shows it – its display place, else the model's */
  shownMatrix(instance: Instance) {
    return this.displayPlaces.get(instance) ?? instance.matrix;
  }

  /**
   * puts the groups below the instances shown elsewhere there (only those below `only`, when given): every instance
   * on the way down counts with the place it is shown at, so a group inside a moved group moves along and adds its own
   */
  private applyDisplayPlaces(only?: Instance) {
    for (const built of this.builtGroups) {
      if (only ? !built.path.includes(only) : !built.path.some((instance) => this.displayPlaces.has(instance))) {
        continue;
      }
      const world = new THREE.Matrix4();
      for (const instance of built.path) {
        world.multiply(this.shownMatrix(instance));
      }
      built.group.matrix.copy(world);
      built.group.updateMatrixWorld(true);
      // picks in the group (faces, edges, vertices) are where it is shown
      built.context.world.copy(world);
      built.records = undefined;
    }
    this.highlightStale = true;
  }

  private updateFaceMe() {
    if (!this.faceMe.length) {
      return;
    }
    const eye = (this.rig.camera as THREE.Camera).position;
    const fwd = this.rig.forward();
    for (const figure of this.faceMe) {
      const anchor = new THREE.Vector3().setFromMatrixPosition(figure.world);
      const front = new THREE.Vector3(0, -1, 0).transformDirection(figure.world);
      front.z = 0;
      const want = this.rig.isOrtho ? fwd.clone().negate() : eye.clone().sub(anchor);
      want.z = 0;
      if (front.lengthSq() < 1e-9 || want.lengthSq() < 1e-9) {
        continue;
      }
      front.normalize();
      want.normalize();
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
    const key =
      cam.matrixWorld.elements.map((value) => value.toFixed(4)).join(',') +
      this.rig.isOrtho +
      this.profiles.length +
      '/' +
      this.displayRevision;
    if (key === this.profileKey) {
      return;
    }
    this.profileKey = key;
    if (this.profileLines) {
      this.profileLines.geometry.dispose();
      this.scene.remove(this.profileLines);
      this.profileLines = null;
    }
    const style = this.model?.settings.style;
    if (!style?.profiles || !this.profiles.length) {
      return;
    }
    const eye = cam.position;
    const fwd = this.rig.forward();
    const pos: number[] = [];
    // edges of groups shown elsewhere (display places) move with them: by the group's matrix against the built one
    const shifts = new Map<THREE.Group, THREE.Matrix4 | null>();
    const shiftOf = (built: NonNullable<ProfileRec['built']>) => {
      if (!shifts.has(built.group)) {
        const moved = !built.group.matrix.equals(built.world);
        shifts.set(built.group, moved ? built.group.matrix.clone().multiply(built.world.clone().invert()) : null);
      }
      return shifts.get(built.group)!;
    };
    for (const profile of this.profiles) {
      if (profile.faded) {
        continue;
      }
      const shift = profile.built && this.displayPlaces.size ? shiftOf(profile.built) : null;
      const start = shift ? profile.start.clone().applyMatrix4(shift) : profile.start;
      const end = shift ? profile.end.clone().applyMatrix4(shift) : profile.end;
      const normals = shift ? profile.normals.map((normal) => normal.clone().transformDirection(shift)) : profile.normals;
      const mid = start.clone().add(end).multiplyScalar(0.5);
      const toEye = this.rig.isOrtho ? fwd.clone().negate() : eye.clone().sub(mid);
      const facing = normals.map((normal) => normal.dot(toEye) > 0);
      if (facing.length === 1 || facing[0] !== facing[1]) {
        pos.push(start.x, start.y, start.z, end.x, end.y, end.z);
      }
    }
    if (!pos.length) {
      return;
    }
    const lineGeometry = new LineSegmentsGeometry();
    lineGeometry.setPositions(pos);
    if (!this.profileMat) {
      this.profileMat = this.lineMat(0x000000, 2.4);
    }
    this.profileMat.color.set(style.edgeColor);
    this.profileMat.clippingPlanes = this.clipPlanes;
    this.profileLines = new LineSegments2(lineGeometry, this.profileMat);
    this.profileLines.renderOrder = 2;
    this.scene.add(this.profileLines);
  }
  private profileMat: LineMaterial | null = null;

  guideGroup = new THREE.Group();
  private buildGuides() {
    this.guideGroup.traverse((object) => {
      const line = object as THREE.Line;
      line.geometry?.dispose();
    });
    this.guideGroup.clear();
    if (!this.model.settings.guides) {
      return;
    }
    const mat = new THREE.LineDashedMaterial({ color: 0x555555, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: 0.85 });
    for (const guide of this.model.guides) {
      if (guide.kind !== 'line' || !guide.direction) {
        continue;
      }
      const geo = new THREE.BufferGeometry().setFromPoints([
        guide.point.clone().addScaledVector(guide.direction, -500),
        guide.point.clone().addScaledVector(guide.direction, 500),
      ]);
      const line = new THREE.Line(geo, mat);
      line.computeLineDistances();
      this.guideGroup.add(line);
    }
    if (!this.guideGroup.parent) {
      this.scene.add(this.guideGroup);
    }
  }

  /** the selection the outline was last drawn for – drawn again when a display place moves what it outlines */
  private highlightState: ViewState | null = null;
  private highlightStale = false;
  rebuildHighlight(state: ViewState) {
    this.highlight.traverse((object) => {
      const mesh = object as THREE.Mesh;
      if (mesh.geometry) {
        mesh.geometry.dispose();
      }
    });
    this.highlight.clear();
    this.lineMats = this.lineMats.filter((material) => !material.userData.hl);
    const ctxEnts = state.activePath.length ? state.activePath[state.activePath.length - 1].definition.entities : this.model.root;
    this.highlightState = state;
    this.highlightStale = false;
    // groups shown elsewhere (display places) are outlined where they are shown
    const world = new THREE.Matrix4();
    for (const instance of state.activePath) {
      world.multiply(this.shownMatrix(instance));
    }
    const pos: number[] = [];
    const linePositions: number[] = [];
    const hoverPositions: number[] = [];
    const boxes: THREE.Box3[] = [];
    const addFace = (faceId: number) => {
      const face = ctxEnts.faces.get(faceId);
      if (!face) {
        return;
      }
      const tri = ctxEnts.faceTriangles(face);
      const pts = [...face.outer, ...face.holes.flat()].map((vertex) => ctxEnts.positionOf(vertex));
      for (const i of tri) {
        const point = pts[i];
        pos.push(point.x, point.y, point.z);
      }
    };
    for (const selectedRef of state.selection.values()) {
      if (selectedRef.kind === 'face') {
        addFace(selectedRef.id);
      }
      if (selectedRef.kind === 'edge') {
        const edge = ctxEnts.edges.get(selectedRef.id);
        if (edge) {
          const start = ctxEnts.positionOf(edge.start),
            end = ctxEnts.positionOf(edge.end);
          linePositions.push(start.x, start.y, start.z, end.x, end.y, end.z);
        }
      }
      if (selectedRef.kind === 'instance') {
        const instance = ctxEnts.instances.get(selectedRef.id);
        if (instance) {
          boxes.push(instance.definition.entities.bounds(new THREE.Box3(), this.shownMatrix(instance).clone()));
        }
      }
    }
    const entityRef = state.hover;
    if (entityRef && !state.selection.has(`${entityRef.kind}:${entityRef.id}`)) {
      if (entityRef.kind === 'edge') {
        const edge = ctxEnts.edges.get(entityRef.id);
        if (edge) {
          const start = ctxEnts.positionOf(edge.start),
            end = ctxEnts.positionOf(edge.end);
          hoverPositions.push(start.x, start.y, start.z, end.x, end.y, end.z);
        }
      }
      if (entityRef.kind === 'face') {
        addFace(entityRef.id);
      } // pre-selection shows the same dotted face as SketchUp Web
      if (entityRef.kind === 'instance') {
        const instance = ctxEnts.instances.get(entityRef.id);
        if (instance) {
          const box = instance.definition.entities.bounds(new THREE.Box3(), this.shownMatrix(instance).clone());
          this.boxLines(box, hoverPositions);
        }
      }
    }
    for (const box of boxes) {
      this.boxLines(box, linePositions);
    }
    const group = new THREE.Group();
    group.matrixAutoUpdate = false;
    group.matrix.copy(world);
    if (pos.length) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      stippleMat.clippingPlanes = this.clipPlanes;
      const mesh = new THREE.Mesh(geo, stippleMat);
      mesh.renderOrder = 10;
      group.add(mesh);
    }
    if (linePositions.length) {
      const geo = new LineSegmentsGeometry();
      geo.setPositions(linePositions);
      const material = this.lineMat(SEL_COLOR, 2.2, { depthTest: true } as any);
      material.userData.hl = true;
      const lines = new LineSegments2(geo, material);
      lines.renderOrder = 5;
      group.add(lines);
    }
    if (hoverPositions.length) {
      const geo = new LineSegmentsGeometry();
      geo.setPositions(hoverPositions);
      const material = this.lineMat(SEL_COLOR, 2.0);
      material.userData.hl = true;
      const lines = new LineSegments2(geo, material);
      lines.renderOrder = 4;
      group.add(lines);
    }
    this.highlight.add(group);
    group.updateMatrixWorld(true);
    this.needsRender = true;
  }

  boxLines(box: THREE.Box3, out: number[]) {
    if (box.isEmpty()) {
      return;
    }
    const { min: boxMin, max: boxMax } = box;
    const corners = [
      [boxMin.x, boxMin.y, boxMin.z],
      [boxMax.x, boxMin.y, boxMin.z],
      [boxMax.x, boxMax.y, boxMin.z],
      [boxMin.x, boxMax.y, boxMin.z],
      [boxMin.x, boxMin.y, boxMax.z],
      [boxMax.x, boxMin.y, boxMax.z],
      [boxMax.x, boxMax.y, boxMax.z],
      [boxMin.x, boxMax.y, boxMax.z],
    ];
    const boxEdges = [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 0],
      [4, 5],
      [5, 6],
      [6, 7],
      [7, 4],
      [0, 4],
      [1, 5],
      [2, 6],
      [3, 7],
    ];
    for (const [i, j] of boxEdges) {
      out.push(...corners[i], ...corners[j]);
    }
  }

  // ------------------------------------------------------------ render
  render() {
    this.needsRender = false;
    if (this.highlightStale && this.highlightState) {
      this.rebuildHighlight(this.highlightState);
    }
    const style = this.model?.settings.style;
    const cam = this.rig.camera as THREE.PerspectiveCamera;
    cam.updateMatrixWorld();
    this.bgMat.uniforms.invProj.value.copy(cam.projectionMatrixInverse);
    this.bgMat.uniforms.camWorld.value.copy(cam.matrixWorld);
    if (style) {
      tmpSky.set(style.skyColor);
      tmpGround.set(style.groundColor);
      // blended in linear space – a light model colour only leaves a faint tint
      if (theme.night) {
        tmpSky.lerp(NIGHT_SKY, 0.97);
        tmpGround.lerp(NIGHT_GROUND, 0.96);
      }
      this.bgMat.uniforms.horizon.value.set(theme.night ? '#1b2636' : '#e9ecee');
      this.bgMat.uniforms.bg.value.set(theme.night ? '#0d1116' : '#ffffff');
      this.bgMat.uniforms.sky.value.copy(tmpSky);
      this.bgMat.uniforms.ground.value.copy(tmpGround);
      this.bgMat.uniforms.useSky.value = style.sky ? 1 : 0;
      this.bgMat.uniforms.useGround.value = style.ground ? 1 : 0;
    }
    // a plugin's atmosphere has a plain background (its fog's colour) – the sky would shine through the fog
    const background = this.pluginLighting.background();
    if (background) {
      this.bgMat.uniforms.bg.value.set(background);
      this.bgMat.uniforms.useSky.value = 0;
      this.bgMat.uniforms.useGround.value = 0;
    }
    // camera-relative light like SketchUp's default (no sun shading)
    const viewDir = this.rig.forward().negate();
    const rightDir = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const upDir = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    // measured in SketchUp Web: brightness = 0.45 + 0.8 · (n · view direction)
    shadeUniforms.lightDir.value.copy(viewDir.normalize());
    void rightDir;
    void upDir;
    // moonlight: same direction, much dimmer
    shadeUniforms.dark.value = theme.night ? 0.2 : 0.45;
    shadeUniforms.light.value = theme.night ? 0.52 : 0.8;
    if (this.profileMat && style) {
      this.profileMat.color.set(theme.night ? nightEdge(style.edgeColor) : style.edgeColor);
    }
    if (this.model) {
      this.updateFaceMe();
      this.updateProfiles();
    }
    this.grid.mesh.visible = measureView.grid && !!this.model;
    if (this.grid.mesh.visible) {
      this.grid.update(cam, this.rig.isOrtho, this.rig.target, this.model.settings.units, theme.night, measureView.gridAxes);
    }
    this.renderer.clear();
    this.renderer.render(this.bgScene, this.bgCam);
    this.renderer.render(this.scene, cam);
    this.renderSectionFills(cam);
    if (style?.ao && style.faceStyle !== 'wireframe' && !style.xray) {
      this.renderOcclusion(cam);
    }
    for (const pass of this.renderPasses) {
      try {
        pass(this.renderer, this.scene, cam);
      } catch (error) {
        this.renderPasses.delete(pass);
        console.error(error);
      }
    }
    this.overlay.draw();
  }

  /**
   * Fills where section planes cut closed things: seen through the cut, a closed body shows more backs than fronts. Those
   * pixels are counted in the stencil buffer, and the plane is drawn where the count is not zero.
   */
  private renderSectionFills(cam: THREE.Camera) {
    const style = this.model?.settings.style;
    if (!style || !this.clipPlanes.length || !this.model.settings.sectionFill || style.xray || style.faceStyle === 'wireframe') {
      return;
    }
    const layer = 6;
    const meshes = this.pickMeshes.filter((mesh) => {
      const material = mesh.material as THREE.Material;
      return material.side === THREE.FrontSide && !material.transparent && mesh.visible && mesh.parent?.visible !== false;
    });
    const savedLayers = cam.layers.mask;
    const savedOverride = this.scene.overrideMaterial;
    const savedBackground = this.scene.background;
    this.scene.background = null;
    for (const mesh of meshes) {
      mesh.layers.enable(layer);
    }
    cam.layers.set(layer);
    const count = (side: THREE.Side, operation: THREE.StencilOp, clippingPlanes: THREE.Plane[]) =>
      new THREE.MeshBasicMaterial({
        side,
        colorWrite: false,
        depthWrite: false,
        depthTest: false,
        stencilWrite: true,
        stencilFunc: THREE.AlwaysStencilFunc,
        stencilFail: operation,
        stencilZFail: operation,
        stencilZPass: operation,
        clippingPlanes,
      });
    const box = this.model.bounds();
    const size = box.isEmpty() ? 100 : box.getBoundingSphere(new THREE.Sphere()).radius * 4;
    const capGeometry = new THREE.PlaneGeometry(size, size);
    for (const plane of this.clipPlanes) {
      this.renderer.clearStencil();
      const others = this.clipPlanes.filter((other) => other !== plane);
      const backs = count(THREE.BackSide, THREE.IncrementWrapStencilOp, this.clipPlanes);
      const fronts = count(THREE.FrontSide, THREE.DecrementWrapStencilOp, this.clipPlanes);
      for (const material of [backs, fronts]) {
        this.scene.overrideMaterial = material;
        this.renderer.render(this.scene, cam);
        material.dispose();
      }
      this.scene.overrideMaterial = savedOverride;
      const capMaterial = new THREE.MeshBasicMaterial({
        color: theme.night ? 0x59616b : 0x8a9199,
        side: THREE.DoubleSide,
        stencilWrite: true,
        stencilRef: 0,
        stencilFunc: THREE.NotEqualStencilFunc,
        clippingPlanes: others,
      });
      const cap = new THREE.Mesh(capGeometry, capMaterial);
      // on the plane, around the point of the model closest to the middle
      const center = box.isEmpty() ? new THREE.Vector3() : box.getCenter(new THREE.Vector3());
      cap.position.copy(plane.projectPoint(center, new THREE.Vector3()));
      cap.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), plane.normal);
      cap.layers.set(layer);
      cap.updateMatrixWorld(true);
      this.renderer.render(cap, cam);
      capMaterial.dispose();
    }
    capGeometry.dispose();
    this.renderer.clearStencil();
    this.scene.background = savedBackground;
    this.scene.overrideMaterial = savedOverride;
    cam.layers.mask = savedLayers;
    for (const mesh of meshes) {
      mesh.layers.disable(layer);
    }
  }

  /** darkens corners and contact points over the frame – opaque faces cast it, glass does not */
  private renderOcclusion(cam: THREE.Camera) {
    const style = this.model.settings.style;
    const meshes: THREE.Object3D[] = this.pickMeshes.filter((mesh) => !(mesh.material as THREE.Material).transparent);
    // the ground catches occlusion from what stands on it, seen from above (shown only with shadows otherwise)
    const groundVisible = this.shadowGround.visible;
    if (style.ground && !this.pluginLighting.background() && (cam.position.z > 0 || this.rig.isOrtho)) {
      meshes.push(this.shadowGround);
      this.shadowGround.visible = true;
    }
    this.ambientOcclusion ??= new AmbientOcclusion();
    try {
      this.ambientOcclusion.render(this.renderer, this.scene, cam, meshes, this.clipPlanes, {
        distance: style.aoDistance,
        intensity: style.aoIntensity,
        color: style.aoColor,
      });
    } finally {
      this.shadowGround.visible = groundVisible;
    }
  }

  // ------------------------------------------------------------ picking helpers
  ndc(x: number, y: number) {
    return new THREE.Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1);
  }
  ray(x: number, y: number): THREE.Ray {
    return this.rig.ray(this.ndc(x, y));
  }

  project(point: THREE.Vector3): { x: number; y: number; z: number; visible: boolean } {
    const projected = point.clone().project(this.rig.camera);
    return {
      x: ((projected.x + 1) / 2) * this.width,
      y: ((1 - projected.y) / 2) * this.height,
      z: projected.z,
      visible: projected.z > -1 && projected.z < 1,
    };
  }

  pickFace(x: number, y: number, filter?: (context: PickContext, faceId: number) => boolean): FaceHit | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(this.ndc(x, y), this.rig.camera);
    const vis = this.pickMeshes.filter((mesh) => mesh.visible && mesh.parent?.visible !== false);
    for (const mesh of vis) {
      // big meshes get a tree, small ones are quick to test anyway
      if (mesh.geometry.getAttribute('position').count >= PICK_TREE_CORNERS) {
        mesh.geometry.boundsTree = shapeTree(mesh.geometry);
      }
    }
    const hits = raycaster.intersectObjects(vis, false);
    for (const hit of hits) {
      if (this.clipPlanes.some((plane) => plane.distanceToPoint(hit.point) < -1e-6)) {
        continue;
      }
      const mesh = hit.object as THREE.Mesh;
      const faceId = mesh.userData.tri[Math.floor(hit.faceIndex!)];
      if (faceId == null) {
        continue;
      }
      const context: PickContext = mesh.userData.ctx;
      if (filter && !filter(context, faceId)) {
        continue;
      }
      const face = context.entities.faces.get(faceId);
      if (!face) {
        continue;
      }
      const normal = context.entities.faceNormal(face).transformDirection(context.world);
      return { point: hit.point.clone(), faceId: faceId, context: context, normal: normal, distance: hit.distance };
    }
    return null;
  }

  /** Distance along view ray to the nearest face (for occlusion tests). */
  faceDepth(x: number, y: number): number {
    const hit = this.pickFace(x, y);
    return hit ? hit.distance : Infinity;
  }

  isOccluded(point: THREE.Vector3, x: number, y: number): boolean {
    if (this.model.settings.style.xray || this.model.settings.style.faceStyle === 'wireframe') {
      return false;
    }
    const camPos = (this.rig.camera as THREE.Camera).position;
    let depth: number;
    if (this.rig.isOrtho) {
      const ray = this.ray(x, y);
      depth = point.clone().sub(ray.origin).dot(ray.direction);
    } else {
      depth = point.distanceTo(camPos);
    }
    const faceDistance = this.faceDepth(x, y);
    return faceDistance < depth - Math.max(0.002, depth * 0.002);
  }

  /**
   * Whether opaque faces hide a world point from the camera – overlay ticks, labels and dimensions behind
   * geometry are skipped. Uses a BVH per mesh (built lazily, `indirect` keeps the triangle order for picking).
   */
  isHidden(point: THREE.Vector3, ignore?: THREE.Object3D): boolean {
    const style = this.model?.settings.style;
    if (!style || style.xray || style.faceStyle === 'wireframe' || !this.pickMeshes.length) {
      return false;
    }
    const forward = this.rig.forward();
    // parallel projection also shows what lies behind the eye, so its rays start far in front of the point
    const origin = this.rig.isOrtho ? point.clone().addScaledVector(forward, -1e4) : (this.rig.camera as THREE.Camera).position.clone();
    const depth = point.distanceTo(origin);
    if (depth < 1e-9) {
      return false;
    }
    const ray = new THREE.Ray(origin, point.clone().sub(origin).divideScalar(depth));
    const limit =
      depth - Math.max(0.002, (this.rig.isOrtho ? point.distanceTo((this.rig.camera as THREE.Camera).position) : depth) * 0.002);
    for (const mesh of this.pickMeshes) {
      const material = mesh.material as THREE.Material;
      if (!mesh.visible || mesh.parent?.visible === false || material.transparent) {
        continue;
      }
      if (ignore) {
        let inside = false;
        mesh.traverseAncestors((ancestor) => {
          if (ancestor === ignore) {
            inside = true;
          }
        });
        if (inside) {
          continue;
        }
      }
      const geometry = mesh.geometry;
      if (!geometry.boundingSphere) {
        geometry.computeBoundingSphere();
      }
      if (!ray.intersectsSphere(tmpSphere.copy(geometry.boundingSphere!).applyMatrix4(mesh.matrixWorld))) {
        continue;
      }
      const bvh = shapeTree(geometry);
      const toLocal = tmpMatrix.copy(mesh.matrixWorld).invert();
      const localRay = ray.clone().applyMatrix4(toLocal);
      // with active section cuts the first hit may be cut away, so all hits are checked
      const hits = this.clipPlanes.length ? bvh.raycast(localRay, material) : [bvh.raycastFirst(localRay, material)];
      for (const hit of hits) {
        if (!hit) {
          continue;
        }
        const hitPoint = hit.point.clone().applyMatrix4(mesh.matrixWorld);
        if (hitPoint.distanceTo(origin) >= limit) {
          continue;
        }
        if (this.clipPlanes.some((plane) => plane.distanceToPoint(hitPoint) < -1e-6)) {
          continue;
        }
        return true;
      }
    }
    return false;
  }

  pickEdge(
    x: number,
    y: number,
    tolPx = 6,
    filter?: (edgeRec: EdgeRec) => boolean,
  ): { rec: EdgeRec; point: THREE.Vector3; dist: number } | null {
    let best: { rec: EdgeRec; point: THREE.Vector3; dist: number } | null = null;
    const mouse = new THREE.Vector2(x, y);
    for (const edgeRec of this.recordsNear(x, y, tolPx).edges) {
      if (filter && !filter(edgeRec)) {
        continue;
      }
      const projStart = this.project(edgeRec.start),
        projEnd = this.project(edgeRec.end);
      if (!projStart.visible && !projEnd.visible) {
        continue;
      }
      const screenStart = new THREE.Vector2(projStart.x, projStart.y),
        screenEnd = new THREE.Vector2(projEnd.x, projEnd.y);
      const segment = screenEnd.clone().sub(screenStart);
      const lengthSq = segment.lengthSq();
      let param = lengthSq > 1e-9 ? mouse.clone().sub(screenStart).dot(segment) / lengthSq : 0;
      param = Math.max(0, Math.min(1, param));
      const distance = screenStart.clone().add(segment.multiplyScalar(param)).distanceTo(mouse);
      if (distance > tolPx || (best && distance >= best.dist)) {
        continue;
      }
      // 3D point on edge closest to the view ray
      const ray = this.ray(x, y);
      const dir = edgeRec.end.clone().sub(edgeRec.start);
      const offset = edgeRec.start.clone().sub(ray.origin);
      const edgeDot = dir.dot(dir),
        crossDot = dir.dot(ray.direction),
        rayDot = ray.direction.dot(ray.direction),
        edgeOffset = dir.dot(offset),
        rayOffset = ray.direction.dot(offset);
      const den = edgeDot * rayDot - crossDot * crossDot;
      let edgeParam = den > 1e-12 ? (crossDot * rayOffset - rayDot * edgeOffset) / den : param;
      edgeParam = Math.max(0, Math.min(1, edgeParam));
      const closest = edgeRec.start.clone().addScaledVector(dir, edgeParam);
      if (this.clipPlanes.some((plane) => plane.distanceToPoint(closest) < -1e-6)) {
        continue;
      }
      if (this.isHidden(closest)) {
        continue;
      }
      best = { rec: edgeRec, point: closest, dist: distance };
    }
    return best;
  }

  pickVertex(x: number, y: number, tolPx = 10, filter?: (vertex: VertRec) => boolean): { rec: VertRec; dist: number } | null {
    let best: { rec: VertRec; dist: number } | null = null;
    for (const vertex of this.recordsNear(x, y, tolPx).verts) {
      if (filter && !filter(vertex)) {
        continue;
      }
      const projected = this.project(vertex.position);
      if (!projected.visible) {
        continue;
      }
      const distance = Math.hypot(projected.x - x, projected.y - y);
      if (distance > tolPx || (best && distance >= best.dist)) {
        continue;
      }
      if (this.clipPlanes.some((plane) => plane.distanceToPoint(vertex.position) < -1e-6)) {
        continue;
      }
      // tested along the line of sight to the vertex itself, not under the cursor – near silhouettes the cursor ray hits other faces
      if (this.isHidden(vertex.position)) {
        continue;
      }
      best = { rec: vertex, dist: distance };
    }
    return best;
  }

  /** Screen-space size of one world unit at point p (for constant-size gizmos). */
  worldPerPixel(point: THREE.Vector3): number {
    if (this.rig.isOrtho) {
      return (this.rig.ortho.top - this.rig.ortho.bottom) / this.height;
    }
    const depth = point.clone().sub(this.rig.persp.position).dot(this.rig.forward());
    return (2 * Math.max(depth, 0.01) * Math.tan(THREE.MathUtils.degToRad(this.rig.persp.fov / 2))) / this.height;
  }

  snapshot(): string {
    this.render();
    return this.canvas.toDataURL('image/png');
  }
}

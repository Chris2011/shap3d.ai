import * as THREE from 'three';
import type { Editor } from './editor';
import type { CameraState, StyleSettings } from '../core/document';
import { measureView } from './measureView';

/**
 * Renders a view of the model on demand – for the layout plugin's viewports, exports and the like – without
 * changing what the viewport shows: camera, style, tag visibility and size are set for one render and put back
 * before the next frame. Either as an image or as lines (visible edges and silhouettes, hidden ones removed).
 */
export interface ViewRequest {
  camera: CameraState;
  /** size of the result in pixels */
  width: number;
  height: number;
  /** style for this view (e.g. a scene's style); missing settings come from the model */
  style?: Partial<StyleSettings>;
  /** tags hidden in this view; undefined = as in the model now */
  hiddenTags?: string[];
  /** parallel projection showing this many metres from top to bottom – a drawing scale (1:50 …) */
  orthoHeight?: number;
}

/** a visible line of the view, in pixels from the top left */
export type ViewLine = [x1: number, y1: number, x2: number, y2: number];

export interface ViewLines {
  width: number;
  height: number;
  /** edges of the model, cut where faces hide them */
  edges: ViewLine[];
  /** silhouettes of round shapes (soft edges between a front and a back face) and outer edges – drawn thicker */
  profiles: ViewLine[];
}

/** Sets up the view, runs `draw` and restores everything – all within one call, so the viewport never shows it. */
const withView = <T>(editor: Editor, request: ViewRequest, draw: () => T): T => {
  const viewer = editor.viewer;
  const model = editor.model;
  const rig = viewer.rig;
  const saved = {
    camera: rig.getState(),
    isOrtho: rig.isOrtho,
    width: viewer.width,
    height: viewer.height,
    pixelRatio: viewer.renderer.getPixelRatio(),
    style: { ...model.settings.style },
    axes: model.settings.axes,
    guides: model.settings.guides,
    tags: model.tags.map((tag) => tag.visible),
    measure: { ...measureView },
  };
  try {
    Object.assign(model.settings.style, request.style ?? {});
    model.settings.axes = false;
    model.settings.guides = false;
    Object.assign(measureView, { rulers: false, people: false, grid: false });
    if (request.hiddenTags) {
      for (const tag of model.tags) {
        tag.visible = !request.hiddenTags.includes(tag.name);
      }
    }
    // no selection, no hover, the whole model
    viewer.rebuild({ activePath: [], selection: new Map(), hover: null });
    viewer.renderer.setPixelRatio(1);
    viewer.resize(request.width, request.height);
    rig.applyState(request.camera, false);
    if (request.orthoHeight) {
      rig.isOrtho = true;
      rig.syncOrtho();
      const half = request.orthoHeight / 2;
      Object.assign(rig.ortho, { top: half, bottom: -half, left: -half * rig.aspect, right: half * rig.aspect });
      rig.ortho.updateProjectionMatrix();
    }
    return draw();
  } finally {
    Object.assign(model.settings.style, saved.style);
    model.settings.axes = saved.axes;
    model.settings.guides = saved.guides;
    model.tags.forEach((tag, i) => (tag.visible = saved.tags[i] ?? tag.visible));
    Object.assign(measureView, saved.measure);
    viewer.renderer.setPixelRatio(saved.pixelRatio);
    viewer.resize(saved.width, saved.height);
    rig.applyState(saved.camera, false);
    rig.isOrtho = saved.isOrtho;
    rig.syncOrtho();
    editor.invalidate(); // the next frame rebuilds the scene with the selection again
  }
};

/** The view as a PNG (data URL). */
export const renderViewImage = (editor: Editor, request: ViewRequest): string =>
  withView(editor, request, () => {
    editor.viewer.render();
    return editor.viewer.canvas.toDataURL('image/png');
  });

/** depth of every pixel (0 near … 1 far), rendered from the faces only */
const depthBuffer = (editor: Editor, width: number, height: number) => {
  const viewer = editor.viewer;
  const camera = viewer.rig.camera;
  const target = new THREE.WebGLRenderTarget(width, height, { type: THREE.FloatType, depthBuffer: true });
  const material = new THREE.MeshDepthMaterial({ depthPacking: THREE.BasicDepthPacking, side: THREE.DoubleSide });
  material.clippingPlanes = viewer.clipPlanes;
  const layer = 7;
  const meshes = viewer.pickMeshes.filter((mesh) => mesh.visible);
  for (const mesh of meshes) {
    mesh.layers.enable(layer);
  }
  const savedLayers = camera.layers.mask;
  const savedOverride = viewer.scene.overrideMaterial;
  camera.layers.set(layer);
  viewer.scene.overrideMaterial = material;
  const pixels = new Float32Array(width * height * 4);
  try {
    viewer.renderer.setRenderTarget(target);
    viewer.renderer.setClearColor(0x000000, 0); // BasicDepthPacking writes 1 - depth: cleared = far
    viewer.renderer.clear();
    viewer.renderer.render(viewer.scene, camera);
    viewer.renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
  } finally {
    viewer.renderer.setRenderTarget(null);
    viewer.scene.overrideMaterial = savedOverride;
    camera.layers.mask = savedLayers;
    for (const mesh of meshes) {
      mesh.layers.disable(layer);
    }
    material.dispose();
    target.dispose();
  }
  // rows come bottom-up
  return (x: number, y: number) => {
    const column = Math.min(width - 1, Math.max(0, Math.floor(x)));
    const row = Math.min(height - 1, Math.max(0, Math.floor(height - 1 - y)));
    return 1 - pixels[(row * width + column) * 4];
  };
};

const SAMPLE_STEP = 2; // px between visibility tests along an edge

/**
 * Narrows near/far to the model for the line view: the depth buffer is far more precise then, and a wall in
 * front of an edge is told apart from the face the edge lies on. Returns a function that puts them back.
 */
const fitDepthRange = (editor: Editor, camera: THREE.PerspectiveCamera | THREE.OrthographicCamera) => {
  const saved = { near: camera.near, far: camera.far };
  const sphere = editor.model.root.bounds().getBoundingSphere(new THREE.Sphere());
  if (!sphere.isEmpty() && sphere.radius > 0) {
    const distance = camera.position.distanceTo(sphere.center);
    const margin = sphere.radius * 1.05 + 0.01;
    camera.near = (camera as THREE.PerspectiveCamera).isPerspectiveCamera ? Math.max(0.01, distance - margin) : distance - margin;
    camera.far = distance + margin;
    camera.updateProjectionMatrix();
  }
  return () => {
    camera.near = saved.near;
    camera.far = saved.far;
    camera.updateProjectionMatrix();
  };
};

/** a depth-buffer value (0 near … 1 far) as distance in front of the camera, in metres */
const linearDistance = (camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, depth: number) => {
  const { near, far } = camera;
  return (camera as THREE.PerspectiveCamera).isPerspectiveCamera
    ? (near * far) / (far - depth * (far - near))
    : near + depth * (far - near);
};

/**
 * The view as lines: every edge (and every silhouette of a soft surface) is followed in steps of a few pixels
 * and cut where the faces in front of it hide it. Section planes cut the lines like the faces.
 */
export const renderViewLines = (editor: Editor, request: ViewRequest): ViewLines =>
  withView(editor, request, () => {
    const viewer = editor.viewer;
    const camera = viewer.rig.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    camera.updateMatrixWorld();
    const restoreDepthRange = fitDepthRange(editor, camera);
    try {
      return traceLines(editor, camera, request);
    } finally {
      restoreDepthRange();
    }
  });

const traceLines = (editor: Editor, camera: THREE.PerspectiveCamera | THREE.OrthographicCamera, request: ViewRequest): ViewLines => {
  const viewer = editor.viewer;
  const { width, height } = request;
  const hasFaces = viewer.model.settings.style.faceStyle !== 'wireframe' && !viewer.model.settings.style.xray;
  const depthAt = hasFaces ? depthBuffer(editor, width, height) : () => 1;
  const toScreen = (point: THREE.Vector3) => {
    const projected = point.clone().project(camera);
    return { x: ((projected.x + 1) / 2) * width, y: ((1 - projected.y) / 2) * height, depth: (projected.z + 1) / 2 };
  };
  const clipped = (point: THREE.Vector3) => viewer.clipPlanes.some((plane) => plane.distanceToPoint(point) < -1e-6);
  const eye = camera.position;
  const forward = viewer.rig.forward();

  /** the visible pieces of a world-space segment */
  const visiblePieces = (start: THREE.Vector3, end: THREE.Vector3, out: ViewLine[]) => {
    const startScreen = toScreen(start),
      endScreen = toScreen(end);
    const length = Math.hypot(endScreen.x - startScreen.x, endScreen.y - startScreen.y);
    const steps = Math.max(1, Math.ceil(length / SAMPLE_STEP));
    let runStart: { x: number; y: number } | null = null;
    let last: { x: number; y: number } | null = null;
    for (let i = 0; i <= steps; i++) {
      const point = start.clone().lerp(end, i / steps);
      const screen = toScreen(point);
      const inside =
        screen.depth >= 0 && screen.depth <= 1 && screen.x >= -1 && screen.x <= width + 1 && screen.y >= -1 && screen.y <= height + 1;
      // in front of (or on) the nearest face at this pixel – compared as distances, with a little slack for the face the edge lies on
      const distance = linearDistance(camera, screen.depth);
      const visible =
        inside && !clipped(point) && distance <= linearDistance(camera, depthAt(screen.x, screen.y)) + Math.max(0.003, distance * 0.004);
      if (visible) {
        runStart ??= screen;
        last = screen;
      } else if (runStart && last) {
        if (runStart !== last) {
          out.push([runStart.x, runStart.y, last.x, last.y]);
        }
        runStart = null;
      }
    }
    if (runStart && last && runStart !== last) {
      out.push([runStart.x, runStart.y, last.x, last.y]);
    }
  };

  const edges: ViewLine[] = [];
  const profiles: ViewLine[] = [];
  for (const record of viewer.edges) {
    const entities = record.context.entities;
    const edge = entities.edges.get(record.edgeId);
    if (!edge) {
      continue;
    }
    const normals = entities
      .facesOfEdge(edge.id)
      .filter((face) => !face.hidden)
      .slice(0, 2)
      .map((face) => entities.faceNormal(face).transformDirection(record.context.world));
    const middle = record.start.clone().add(record.end).multiplyScalar(0.5);
    const toEye = viewer.rig.isOrtho ? forward.clone().negate() : eye.clone().sub(middle);
    const facing = normals.map((normal) => normal.dot(toEye) > 0);
    // outline: only one face, or a front and a back face meet here
    const outline = normals.length === 1 || (normals.length === 2 && facing[0] !== facing[1]);
    if (edge.soft && !outline) {
      continue;
    }
    visiblePieces(record.start, record.end, outline && hasFaces ? profiles : edges);
  }
  return { width, height, edges, profiles };
};

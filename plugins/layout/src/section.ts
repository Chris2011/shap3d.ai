import type * as Three from 'three';
import type { ViewRequest } from '../../../src/plugins/types';
import type { ViewportElement } from './document';
import { pluginContext, THREE } from './runtime';

/**
 * Sections per viewport and the fill of their cut surfaces – done in the plugin with what the app offers: the
 * model's section planes are switched for one render (and put back right after), and the cut surfaces are
 * computed from the faces the app has just built for that render.
 */

/** the model's section planes as this viewport wants them while `draw` runs; section planes themselves stay hidden */
export const withSection = <T>(viewport: ViewportElement, draw: () => T): T => {
  const model = pluginContext().editor.model;
  const saved = {
    cuts: model.settings.sectionCuts,
    planes: model.settings.sectionPlanes,
    active: model.sections.map((section) => section.active),
  };
  try {
    model.settings.sectionPlanes = false;
    if (viewport.sectionId !== undefined) {
      model.settings.sectionCuts = viewport.sectionId !== null;
      model.sections.forEach((section) => (section.active = section.id === viewport.sectionId));
    }
    return draw();
  } finally {
    model.settings.sectionCuts = saved.cuts;
    model.settings.sectionPlanes = saved.planes;
    model.sections.forEach((section, i) => (section.active = saved.active[i] ?? section.active));
    pluginContext().editor.invalidate();
  }
};

/** the planes that cut this viewport (as the model is while `withSection` runs) */
const cuttingPlanes = () => {
  const model = pluginContext().editor.model;
  if (!model.settings.sectionCuts) {
    return [];
  }
  return model.sections
    .filter((section) => section.active)
    .map((section) => new THREE.Plane().setFromNormalAndCoplanarPoint(section.normal.clone().normalize(), section.point));
};

/** the camera the app renders the request with (same set-up as the app's camera rig: Z up) */
export const requestCamera = (request: ViewRequest) => {
  const aspect = request.width / request.height;
  const perspective = new THREE.PerspectiveCamera(request.camera.fov, aspect, 0.01, 20000);
  perspective.up.set(0, 0, 1);
  perspective.position.fromArray(request.camera.position);
  const target = new THREE.Vector3().fromArray(request.camera.target);
  perspective.lookAt(target);
  perspective.updateMatrixWorld();
  if (!request.camera.ortho && !request.orthoHeight) {
    return perspective;
  }
  const distance = perspective.position.distanceTo(target);
  const half = request.orthoHeight ? request.orthoHeight / 2 : distance * Math.tan(THREE.MathUtils.degToRad(request.camera.fov / 2));
  const ortho = new THREE.OrthographicCamera(-half * aspect, half * aspect, half, -half, -distance * 50, distance * 50 + 10000);
  ortho.position.copy(perspective.position);
  ortho.quaternion.copy(perspective.quaternion);
  ortho.updateProjectionMatrix();
  ortho.updateMatrixWorld();
  return ortho;
};

const KEY_STEP = 1e-4;
const keyOf = (point: Three.Vector3) =>
  `${Math.round(point.x / KEY_STEP)},${Math.round(point.y / KEY_STEP)},${Math.round(point.z / KEY_STEP)}`;

/** the closed outlines where the plane cuts the faces (world coordinates) */
const cutLoops = (meshes: Three.Mesh[], plane: Three.Plane, others: Three.Plane[]) => {
  const segments: [Three.Vector3, Three.Vector3][] = [];
  const corner = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const distance = [0, 0, 0];
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute('position');
    if (!position) {
      continue;
    }
    mesh.updateWorldMatrix(true, false);
    const index = mesh.geometry.getIndex();
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      for (let k = 0; k < 3; k++) {
        const vertex = index ? index.getX(i + k) : i + k;
        corner[k].fromBufferAttribute(position, vertex).applyMatrix4(mesh.matrixWorld);
        distance[k] = plane.distanceToPoint(corner[k]);
      }
      // the points where the triangle's sides cross the plane
      const crossings: Three.Vector3[] = [];
      for (let k = 0; k < 3; k++) {
        const a = k,
          b = (k + 1) % 3;
        if ((distance[a] < 0 && distance[b] >= 0) || (distance[a] >= 0 && distance[b] < 0)) {
          crossings.push(corner[a].clone().lerp(corner[b], distance[a] / (distance[a] - distance[b])));
        }
      }
      if (crossings.length === 2 && crossings[0].distanceTo(crossings[1]) > 1e-6) {
        // pieces that another section plane cuts away are not there
        if (!others.some((other) => other.distanceToPoint(crossings[0]) < -1e-6 && other.distanceToPoint(crossings[1]) < -1e-6)) {
          segments.push([crossings[0], crossings[1]]);
        }
      }
    }
  }
  // the app draws some faces twice (front and back): each piece once, then chain the pieces into loops
  const seen = new Set<string>();
  const unique = segments.filter(([a, b]) => {
    const key = [keyOf(a), keyOf(b)].sort().join('|');
    return !seen.has(key) && !!seen.add(key);
  });
  segments.length = 0;
  segments.push(...unique);
  const byEnd = new Map<string, number[]>();
  segments.forEach(([a, b], i) => {
    for (const point of [a, b]) {
      const key = keyOf(point);
      byEnd.set(key, [...(byEnd.get(key) ?? []), i]);
    }
  });
  const used = new Set<number>();
  const loops: Three.Vector3[][] = [];
  segments.forEach((first, start) => {
    if (used.has(start)) {
      return;
    }
    used.add(start);
    const loop = [first[0], first[1]];
    let end = first[1];
    for (;;) {
      const next = (byEnd.get(keyOf(end)) ?? []).find((candidate) => !used.has(candidate));
      if (next === undefined) {
        break;
      }
      used.add(next);
      const [a, b] = segments[next];
      end = keyOf(a) === keyOf(end) ? b : a;
      loop.push(end);
    }
    if (loop.length > 3 && keyOf(loop[0]) === keyOf(loop[loop.length - 1])) {
      loops.push(loop.slice(0, -1));
    }
  });
  return loops;
};

/**
 * The cut surfaces of the view as an SVG path in request pixels – call it right after the app rendered
 * `request` (inside `withSection`): the app's faces are then still the ones of that render.
 */
export const sectionCutPath = (request: ViewRequest): string => {
  const planes = cuttingPlanes();
  if (!planes.length) {
    return '';
  }
  const viewer = pluginContext().editor.viewer;
  const meshes = viewer.pickMeshes.filter((mesh) => {
    for (let node: Three.Object3D | null = mesh; node; node = node.parent) {
      if (!node.visible) {
        return false;
      }
    }
    return true;
  });
  const camera = requestCamera(request);
  const toPixels = (point: Three.Vector3) => {
    const projected = point.clone().project(camera);
    return `${((projected.x + 1) / 2) * request.width} ${((1 - projected.y) / 2) * request.height}`;
  };
  const eye = camera.position;
  const forward = new THREE.Vector3().fromArray(request.camera.target).sub(eye).normalize();
  const ortho = (camera as Three.OrthographicCamera).isOrthographicCamera;
  return planes
    .filter((plane) => {
      // only a cut the camera looks at: from the side that is cut away
      return ortho ? plane.normal.dot(forward) > 1e-6 : plane.distanceToPoint(eye) < 0;
    })
    .flatMap((plane) =>
      cutLoops(
        meshes,
        plane,
        planes.filter((other) => other !== plane),
      ),
    )
    .map((loop) => `M${loop.map(toPixels).join('L')}Z`)
    .join('');
};

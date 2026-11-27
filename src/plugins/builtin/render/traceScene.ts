// The scene the path tracer renders: the faces as the 3D view shows them now, with physically based materials, the
// model's environment or a sky gradient, and the sun.
import * as THREE from 'three';
import { GradientEquirectTexture } from 'three-gpu-pathtracer';
import type { Editor } from '../../../engine/editor';

/** what the viewer keeps on a face mesh about its material */
interface FaceSetup {
  map?: THREE.Texture;
  pbr?: { roughness?: number; metalness?: number };
  transparent: boolean;
  opacity: number;
}

/** a MeshStandardMaterial per kind of face – the path tracer only knows those */
const traceMaterial = (source: THREE.Material, setup: FaceSetup | undefined, cache: Map<string, THREE.MeshStandardMaterial>) => {
  const map = setup?.map ?? (source as THREE.MeshStandardMaterial).map ?? null;
  const roughness = setup?.pbr?.roughness ?? 0.8;
  const metalness = setup?.pbr?.metalness ?? 0;
  const opacity = setup?.opacity ?? 1;
  const key = `${map?.uuid ?? '-'}|${roughness}|${metalness}|${opacity}|${source.side}`;
  let material = cache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      // the colours of the faces are vertex colours; a picture brings its own
      vertexColors: !map,
      map,
      roughness,
      metalness,
      transparent: opacity < 1,
      opacity,
      side: source.side,
    });
    cache.set(key, material);
  }
  return material;
};

/**
 * the face mesh's triangles for the path tracer: position and normals shared, the vertex colours as RGBA – the tracer
 * reads four values per vertex, and the view's RGB colours would slide into the alpha and make faces see-through
 */
const traceGeometry = (source: THREE.BufferGeometry, cache: Map<THREE.BufferGeometry, THREE.BufferGeometry>) => {
  let geometry = cache.get(source);
  if (!geometry) {
    geometry = new THREE.BufferGeometry();
    for (const [name, attribute] of Object.entries(source.attributes)) {
      if (name !== 'color') {
        geometry.setAttribute(name, attribute);
      }
    }
    const color = source.getAttribute('color');
    if (color) {
      const rgba = new Float32Array(color.count * 4);
      for (let i = 0; i < color.count; i++) {
        rgba.set([color.getX(i), color.getY(i), color.getZ(i), color.itemSize === 4 ? color.getW(i) : 1], i * 4);
      }
      geometry.setAttribute('color', new THREE.BufferAttribute(rgba, 4));
    }
    cache.set(source, geometry);
  }
  return geometry;
};

/** the camera of the 3D view as it is now (a copy – the view goes on moving) */
const viewCamera = (editor: Editor, aspect: number) => {
  const camera = (editor.viewer.rig.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera).clone();
  if ((camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    (camera as THREE.PerspectiveCamera).aspect = aspect;
  }
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  return camera;
};

/**
 * A scene of everything the 3D view shows: each visible face mesh with its place, its triangles shared (not copied).
 * `dispose` frees the materials and the sky made for it.
 */
export const buildTraceScene = (editor: Editor, aspect: number) => {
  const viewer = editor.viewer;
  editor.frame();
  viewer.content.updateMatrixWorld(true);
  const scene = new THREE.Scene();
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const geometries = new Map<THREE.BufferGeometry, THREE.BufferGeometry>();
  const visible = (object: THREE.Object3D | null): boolean => !object || (object.visible && visible(object.parent));
  for (const mesh of viewer.pickMeshes) {
    if (!visible(mesh)) {
      continue;
    }
    const source = mesh.material as THREE.Material;
    const copy = new THREE.Mesh(
      traceGeometry(mesh.geometry, geometries),
      traceMaterial(source, mesh.userData.setup as FaceSetup | undefined, materials),
    );
    copy.matrixAutoUpdate = false;
    copy.matrix.copy(mesh.matrixWorld);
    scene.add(copy);
  }
  // light: the model's environment picture if it has one, else a sky from the style's colours
  const style = editor.model.settings.style;
  const sky = new GradientEquirectTexture();
  sky.topColor.set(style.skyColor);
  sky.bottomColor.set(style.groundColor);
  sky.update();
  scene.environment = viewer.scene.environment ?? sky;
  scene.background = viewer.scene.environment ?? sky;
  // sky and sun together like a bright, slightly hazy day – stronger values wash out light faces
  scene.environmentIntensity = 0.6;
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.copy(viewer.sun.position).sub(viewer.sun.target.position).normalize().multiplyScalar(100);
  scene.add(sun);
  scene.updateMatrixWorld(true);
  return {
    scene,
    camera: viewCamera(editor, aspect),
    dispose: () => {
      materials.forEach((material) => material.dispose());
      // frees what the tracer's own renderer uploaded – the view's renderer never saw these geometries
      geometries.forEach((geometry) => geometry.dispose());
      sky.dispose();
    },
  };
};

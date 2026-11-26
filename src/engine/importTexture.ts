// The picture of an imported textured material, kept in the model, and how large it lies on the faces.
import * as THREE from 'three';
import { IMAGE_LIMIT } from '../utils/imageFile';

/** this many triangles of a mesh are looked at to find how large the picture lies */
const MAX_SAMPLES = 2000;

export interface ImportedImage {
  /** data URL, as the model saves material pictures */
  image: string;
  /** height / width of one tile */
  imageAspect: number;
  /** width of one tile (m) */
  textureSize: number;
}

/** the texture's picture as a data URL (at most IMAGE_LIMIT px); null when it cannot be drawn or read back */
const pictureUrl = (map: THREE.Texture, seeThrough: boolean) => {
  const image = map.image as (CanvasImageSource & { width: number; height: number }) | null;
  if (!image?.width || !image.height) {
    return null;
  }
  const scale = Math.min(1, IMAGE_LIMIT / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  try {
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(seeThrough ? 'image/png' : 'image/jpeg', 0.9);
  } catch {
    // raw data textures cannot be drawn, a picture from elsewhere cannot be read back
    return null;
  }
};

const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
};

/**
 * Metres per texture unit along u and v, from the triangles' texture coordinates (median, so a few stretched
 * triangles do not count); null without texture coordinates.
 */
const metresPerUnit = (map: THREE.Texture, geometry: THREE.BufferGeometry, start: number, count: number, matrix: THREE.Matrix4) => {
  const uv = geometry.getAttribute('uv');
  const position = geometry.getAttribute('position');
  if (!uv || !position) {
    return null;
  }
  map.updateMatrix();
  const index = geometry.getIndex();
  const corner = (i: number) => (index ? index.getX(i) : i);
  const points = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const coords = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
  const alongU: number[] = [];
  const alongV: number[] = [];
  const step = Math.max(1, Math.ceil(count / 3 / MAX_SAMPLES)) * 3;
  for (let i = start; i + 2 < start + count; i += step) {
    for (let k = 0; k < 3; k++) {
      points[k].fromBufferAttribute(position as THREE.BufferAttribute, corner(i + k)).applyMatrix4(matrix);
      coords[k].fromBufferAttribute(uv as THREE.BufferAttribute, corner(i + k)).applyMatrix3(map.matrix);
    }
    const edge1 = points[1].clone().sub(points[0]),
      edge2 = points[2].clone().sub(points[0]);
    const [du1, dv1, du2, dv2] = [
      coords[1].x - coords[0].x,
      coords[1].y - coords[0].y,
      coords[2].x - coords[0].x,
      coords[2].y - coords[0].y,
    ];
    const det = du1 * dv2 - du2 * dv1;
    if (Math.abs(det) < 1e-12) {
      continue;
    }
    // how far the surface runs for one unit of u and of v
    alongU.push(edge1.clone().multiplyScalar(dv2).sub(edge2.clone().multiplyScalar(dv1)).length() / Math.abs(det));
    alongV.push(edge2.clone().multiplyScalar(du1).sub(edge1.clone().multiplyScalar(du2)).length() / Math.abs(det));
  }
  return alongU.length ? { u: median(alongU), v: median(alongV) } : null;
};

/**
 * The picture of a textured material and its tile size from where `geometry` uses it (triangles `start` … `start + count`,
 * placed by `matrix`). Null when the picture cannot be read – the caller then keeps the mean colour.
 * shortcut: faces map pictures flat (like SketchUp), so only the size is taken over, not where and how turned each
 * triangle shows its part of the picture – an atlas or a photo-scanned model will look scrambled; per-face texture
 * positions would be needed for that.
 */
export const importedImage = (
  map: THREE.Texture,
  geometry: THREE.BufferGeometry,
  start: number,
  count: number,
  matrix: THREE.Matrix4,
  seeThrough: boolean,
): ImportedImage | null => {
  const image = pictureUrl(map, seeThrough);
  const size = image ? metresPerUnit(map, geometry, start, count, matrix) : null;
  if (!image || !size || !(size.u > 1e-6) || !(size.v > 1e-6)) {
    return null;
  }
  return { image, textureSize: size.u, imageAspect: size.v / size.u };
};

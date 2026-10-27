import * as THREE from 'three';
import { localized } from '../i18n';
import type { MaterialDef } from './document';

/** Procedural textures (drawn on a canvas, tinted with the material colour). */
const TEXTURE_KINDS = [
  'holz',
  'ziegel',
  'stein',
  'gras',
  'fliesen',
  'beton',
  'metall',
  'stoff',
  'wasser',
  'marmor',
  'dach',
  'parkett',
] as const;
export type TextureKind = (typeof TEXTURE_KINDS)[number];
/** kind (as saved in models and scripts) → name in the current language (`textures.<kind>`) */
export const TEXTURES = {} as Record<TextureKind, string>;
for (const kind of TEXTURE_KINDS) {
  localized(TEXTURES, kind, `textures.${kind}`);
}
export const isTextureKind = (value: unknown): value is TextureKind => typeof value === 'string' && value in TEXTURES;

/** Default real-world size (m) one texture tile covers. */
export const TEXTURE_SIZE: Record<TextureKind, number> = {
  holz: 1,
  ziegel: 0.8,
  stein: 1.2,
  gras: 1.5,
  fliesen: 0.6,
  beton: 2,
  metall: 1,
  stoff: 0.4,
  wasser: 2,
  marmor: 1.5,
  dach: 1,
  parkett: 1,
};

const cache = new Map<string, THREE.CanvasTexture>();

const rng = (seed: number) => {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
};
const shade = (color: THREE.Color, factor: number) => {
  const scaled = color.clone().multiplyScalar(factor);
  return `rgb(${Math.min(255, scaled.r * 255) | 0},${Math.min(255, scaled.g * 255) | 0},${Math.min(255, scaled.b * 255) | 0})`;
};

export const makeTexture = (kind: TextureKind, color: string): THREE.CanvasTexture => {
  const key = kind + color;
  const hit = cache.get(key);
  if (hit) {
    return hit;
  }
  const SIZE = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const context = canvas.getContext('2d')!;
  const base = new THREE.Color(color);
  const random = rng(kind.length * 977 + Math.floor(base.r * 255));
  context.fillStyle = shade(base, 1);
  context.fillRect(0, 0, SIZE, SIZE);
  const noise = (amt: number, count = 4000, dotSize = 2) => {
    for (let i = 0; i < count; i++) {
      context.fillStyle = shade(base, 1 + (random() - 0.5) * amt);
      context.fillRect(random() * SIZE, random() * SIZE, dotSize, dotSize);
    }
  };
  switch (kind) {
    case 'holz':
    case 'parkett': {
      const planks = kind === 'parkett' ? 8 : 4;
      for (let plank = 0; plank < planks; plank++) {
        const plankTop = (plank * SIZE) / planks,
          tint = 0.85 + random() * 0.3;
        context.fillStyle = shade(base, tint);
        context.fillRect(0, plankTop, SIZE, SIZE / planks);
        for (let k = 0; k < 14; k++) {
          context.strokeStyle = shade(base, tint * (0.75 + random() * 0.2));
          context.lineWidth = 1 + random() * 1.5;
          context.beginPath();
          const y = plankTop + (random() * SIZE) / planks;
          context.moveTo(0, y);
          for (let x = 0; x <= SIZE; x += 16) {
            context.lineTo(x, y + Math.sin(x / 30 + k) * 2);
          }
          context.stroke();
        }
        context.fillStyle = shade(base, 0.55);
        context.fillRect(0, plankTop, SIZE, 1.5);
        if (kind === 'parkett') {
          const x = random() * SIZE;
          context.fillRect(x, plankTop, 1.5, SIZE / planks);
        }
      }
      break;
    }
    case 'ziegel':
    case 'fliesen': {
      const rows = kind === 'ziegel' ? 8 : 4,
        cols = kind === 'ziegel' ? 4 : 4,
        rowHeight = SIZE / rows,
        colWidth = SIZE / cols;
      context.fillStyle = kind === 'ziegel' ? '#d8d2c6' : '#e9e9e9';
      context.fillRect(0, 0, SIZE, SIZE);
      for (let y = 0; y < rows; y++) {
        for (let x = -1; x <= cols; x++) {
          const offsetX = kind === 'ziegel' && y % 2 ? colWidth / 2 : 0;
          context.fillStyle = shade(base, 0.85 + random() * 0.3);
          context.fillRect(x * colWidth + offsetX + 2, y * rowHeight + 2, colWidth - 4, rowHeight - 4);
        }
      }
      noise(0.15, 3000, 1.5);
      break;
    }
    case 'dach': {
      const rows = 6,
        cols = 5,
        rowHeight = SIZE / rows,
        colWidth = SIZE / cols;
      for (let y = 0; y < rows; y++) {
        for (let x = -1; x <= cols; x++) {
          const offsetX = y % 2 ? colWidth / 2 : 0;
          context.fillStyle = shade(base, 0.85 + random() * 0.25);
          context.beginPath();
          context.moveTo(x * colWidth + offsetX, y * rowHeight);
          context.lineTo(x * colWidth + offsetX + colWidth, y * rowHeight);
          context.lineTo(x * colWidth + offsetX + colWidth, y * rowHeight + rowHeight * 0.75);
          context.quadraticCurveTo(
            x * colWidth + offsetX + colWidth / 2,
            y * rowHeight + rowHeight * 1.05,
            x * colWidth + offsetX,
            y * rowHeight + rowHeight * 0.75,
          );
          context.closePath();
          context.fill();
          context.fillStyle = shade(base, 0.6);
          context.fillRect(x * colWidth + offsetX, y * rowHeight + rowHeight - 2, colWidth, 2);
        }
      }
      break;
    }
    case 'stein': {
      context.fillStyle = shade(base, 0.6);
      context.fillRect(0, 0, SIZE, SIZE);
      for (let i = 0; i < 40; i++) {
        const centerX = random() * SIZE,
          centerY = random() * SIZE,
          rad = 18 + random() * 22;
        context.fillStyle = shade(base, 0.8 + random() * 0.4);
        context.beginPath();
        for (let corner = 0; corner < 7; corner++) {
          const ang = (corner / 7) * Math.PI * 2,
            cornerRadius = rad * (0.75 + random() * 0.3);
          const pointX = centerX + Math.cos(ang) * cornerRadius,
            pointY = centerY + Math.sin(ang) * cornerRadius;
          if (corner) {
            context.lineTo(pointX, pointY);
          } else {
            context.moveTo(pointX, pointY);
          }
        }
        context.closePath();
        context.fill();
      }
      noise(0.2, 2000, 1.5);
      break;
    }
    case 'gras': {
      noise(0.35, 9000, 2);
      for (let i = 0; i < 1500; i++) {
        context.strokeStyle = shade(base, 0.7 + random() * 0.6);
        context.lineWidth = 1;
        const x = random() * SIZE,
          y = random() * SIZE;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + (random() - 0.5) * 4, y - 3 - random() * 6);
        context.stroke();
      }
      break;
    }
    case 'beton':
      noise(0.18, 12000, 1.5);
      for (let i = 0; i < 30; i++) {
        context.fillStyle = shade(base, 0.8);
        context.beginPath();
        context.arc(random() * SIZE, random() * SIZE, 1 + random() * 2, 0, 7);
        context.fill();
      }
      break;
    case 'metall':
      for (let y = 0; y < SIZE; y++) {
        context.fillStyle = shade(base, 0.9 + random() * 0.2);
        context.fillRect(0, y, SIZE, 1);
      }
      break;
    case 'stoff':
      for (let i = 0; i < SIZE; i += 4) {
        context.fillStyle = shade(base, 0.85);
        context.fillRect(i, 0, 2, SIZE);
        context.fillStyle = shade(base, 1.1);
        context.fillRect(0, i, SIZE, 2);
      }
      break;
    case 'wasser':
      for (let k = 0; k < 40; k++) {
        context.strokeStyle = shade(base, 1.1 + random() * 0.3);
        context.lineWidth = 1.5;
        context.beginPath();
        const y = random() * SIZE;
        for (let x = 0; x <= SIZE; x += 8) {
          context.lineTo(x, y + Math.sin(x / 18 + k) * 4);
        }
        context.stroke();
      }
      break;
    case 'marmor':
      noise(0.06, 4000, 2);
      for (let k = 0; k < 9; k++) {
        context.strokeStyle = shade(base, 0.6 + random() * 0.2);
        context.lineWidth = 0.8 + random() * 1.6;
        context.beginPath();
        let x = random() * SIZE,
          y = 0;
        context.moveTo(x, y);
        while (y < SIZE) {
          x += (random() - 0.5) * 30;
          y += 10 + random() * 20;
          context.lineTo(x, y);
        }
        context.stroke();
      }
      break;
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  cache.set(key, texture);
  return texture;
};

// ---- the user's own images (data URLs saved in the model)

const imageCache = new Map<string, THREE.Texture>();
const imageListeners = new Set<() => void>();

/** called whenever an image texture has finished loading – the viewer draws again */
export const onImageTextureLoad = (listener: () => void) => {
  imageListeners.add(listener);
  return () => imageListeners.delete(listener);
};

/** A texture of an image (data URL), shared by every material showing it. It stays empty until the image has loaded. */
export const imageTexture = (url: string): THREE.Texture => {
  let texture = imageCache.get(url);
  if (texture) {
    return texture;
  }
  const image = new Image();
  texture = new THREE.Texture(image);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  // photos stay JPEG in glTF exports instead of growing into PNGs
  texture.userData.mimeType = url.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
  const loaded = texture;
  image.onload = () => {
    loaded.needsUpdate = true;
    imageListeners.forEach((listener) => listener());
  };
  image.src = url;
  imageCache.set(url, texture);
  return texture;
};

/** resolves once every image texture made so far has loaded (or failed) – exporters need the pixels */
export const imageTexturesReady = () =>
  Promise.all([...imageCache.values()].map((texture) => (texture.image as HTMLImageElement).decode().catch(() => undefined)));

/** How a texture lies on a face: tile size (m), offset (m) and turn. */
export interface TextureTile {
  map: THREE.Texture;
  width: number;
  height: number;
  offsetU: number;
  offsetV: number;
  cos: number;
  sin: number;
}

type TexturedMaterial = Pick<
  MaterialDef,
  'color' | 'texture' | 'textureSize' | 'image' | 'imageAspect' | 'textureOffset' | 'textureRotation'
>;

/** the default tile width of a material's texture (m) */
export const defaultTextureSize = (material: Pick<MaterialDef, 'texture' | 'image'>) =>
  !material.image && isTextureKind(material.texture) ? TEXTURE_SIZE[material.texture] : 1;

/** the material's image or procedural texture with its layout – undefined for plain colours */
export const textureTile = (material: TexturedMaterial | undefined): TextureTile | undefined => {
  if (!material) {
    return undefined;
  }
  const map = material.image
    ? imageTexture(material.image)
    : isTextureKind(material.texture)
      ? makeTexture(material.texture, material.color)
      : undefined;
  if (!map) {
    return undefined;
  }
  const width = material.textureSize ?? defaultTextureSize(material);
  const angle = THREE.MathUtils.degToRad(material.textureRotation ?? 0);
  return {
    map,
    width,
    height: material.image ? width * (material.imageAspect ?? 1) : width,
    offsetU: material.textureOffset?.[0] ?? 0,
    offsetV: material.textureOffset?.[1] ?? 0,
    cos: Math.cos(angle),
    sin: Math.sin(angle),
  };
};

/** texture coordinates of a point on a face with the axes `basisU`, `basisV` (planar mapping, like SketchUp) */
export const tileUv = (tile: TextureTile, point: THREE.Vector3, basisU: THREE.Vector3, basisV: THREE.Vector3): [number, number] => {
  const along = point.dot(basisU),
    across = point.dot(basisV);
  return [
    (along * tile.cos + across * tile.sin - tile.offsetU) / tile.width,
    (across * tile.cos - along * tile.sin - tile.offsetV) / tile.height,
  ];
};

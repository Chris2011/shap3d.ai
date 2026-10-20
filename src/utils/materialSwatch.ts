import { makeTexture, isTextureKind } from '../core/textures';

/** What a swatch needs to know about a material – model materials and library materials both fit. */
export interface SwatchSource {
  color: string;
  texture?: string;
  opacity?: number;
}

const textureUrls = new Map<string, string>();

/** Small JPEG of a procedural texture in the given colour (cached – generating it is not free). */
export const textureUrl = (kind: string, color: string): string => {
  const key = kind + color;
  let url = textureUrls.get(key);
  if (!url && isTextureKind(kind)) {
    url = (makeTexture(kind, color).image as HTMLCanvasElement).toDataURL('image/jpeg', 0.8);
    textureUrls.set(key, url);
  }
  return url ?? '';
};

/**
 * Inline style for a material swatch: texture image, flat colour, or a diagonal split for see-through materials.
 * `null` is the default material (white/grey split).
 */
export const swatchStyle = (material: SwatchSource | null | undefined): Record<string, string> => {
  if (!material) {
    return { background: 'linear-gradient(135deg, #fff 50%, #a4b2bf 50%)' };
  }
  if (material.texture && isTextureKind(material.texture)) {
    return { background: `url(${textureUrl(material.texture, material.color)}) center / cover` };
  }
  if ((material.opacity ?? 1) < 1) {
    return { background: `linear-gradient(135deg, ${material.color} 50%, ${material.color}66 50%)` };
  }
  return { background: material.color };
};

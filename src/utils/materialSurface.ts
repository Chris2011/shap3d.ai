import type { MaterialDef } from '../core/document';

/** Shaders share the texture list in the Materials panel – their values carry this prefix. */
export const SHADER_PREFIX = 'shader:';
/** The list entry for the user's own image. */
export const IMAGE_VALUE = 'image:';

/** The value of the surface list for `material`: `shader:<id>`, `image:`, a texture kind, or '' for plain colour. */
export const surfaceValueOf = (material: MaterialDef | null | undefined) =>
  material?.shader ? SHADER_PREFIX + material.shader : material?.image ? IMAGE_VALUE : (material?.texture ?? '');

/**
 * Switches `material` to a texture kind, a shader (`shader:<id>`) or plain colour (''): drops the image and
 * the texture layout, and the shader's parameters when the shader changes. `IMAGE_VALUE` is not handled here –
 * an image has to be picked first.
 */
export const applySurface = (material: MaterialDef, value: string) => {
  const shaderId = value.startsWith(SHADER_PREFIX) ? value.slice(SHADER_PREFIX.length) : undefined;
  material.texture = shaderId ? undefined : value || undefined;
  material.image = material.imageAspect = undefined;
  material.textureSize = material.textureRotation = undefined;
  material.textureOffset = undefined;
  if (material.shader !== shaderId) {
    material.shader = shaderId;
    material.shaderParams = undefined;
  }
};

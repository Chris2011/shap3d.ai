import type { PluginShader, PluginShaderParam } from '../../../src/plugins/types';
import { NOISE, SHADERS } from './library.ts';

/**
 * Materials mixed from layers: a base pattern and up to three more on top, each with its strength and size. The layers
 * become one shader whose id names them ("mix-bricks-rust"), so a model needs nothing else to show it again: the plugin
 * builds the shader from the id when a material asks for it (materials.resolveShaders). Colour, relief and roughness
 * are mixed alike – each layer is drawn on what lies below it.
 */

export const MIX_PREFIX = 'mix-';
export const MAX_LAYERS = 4;

/** the layers a mixed shader's id names, or undefined when it names no such mix */
export const layersOf = (id: string) => {
  const ids = id.startsWith(MIX_PREFIX) ? id.slice(MIX_PREFIX.length).split('-') : [];
  return ids.length && ids.length <= MAX_LAYERS && ids.every((layer) => SHADERS.some((shader) => shader.id === layer)) ? ids : undefined;
};

export const mixId = (layers: string[]) => MIX_PREFIX + layers.join('-');

const DEFINITION = /\b(?:vec[234]|float|int|bool|void)\s+([A-Za-z_]\w*)\s*\(/g;

/** a shader's own GLSL for layer `index`: its functions and parameters renamed, so the same pattern can lie twice */
const layerSource = (shader: PluginShader, index: number) => {
  let body = shader.glsl.slice(NOISE.length);
  for (const name of new Set([...body.matchAll(DEFINITION)].map((match) => match[1]))) {
    body = body.replace(new RegExp(`\\b${name}\\b`, 'g'), `${name}_l${index}`);
  }
  return body.replace(/\bu_(\w+)/g, `u_l${index}_$1`);
};

const defines = (shader: PluginShader, name: string) => new RegExp(`\\bfloat\\s+${name}\\s*\\(`).test(shader.glsl);

/**
 * The shader of a mix. `label` names a layer's parameter for the Materials panel (layer number from 1, the parameter's
 * own label), `title` the whole mix.
 */
export const composeLayers = (
  layers: string[],
  label: (layer: number, param: string) => string,
  title: (layers: string[]) => string,
): PluginShader => {
  const shaders = layers.map((id) => SHADERS.find((shader) => shader.id === id)!);
  const params: PluginShaderParam[] = shaders.flatMap((shader, index) => [
    ...(shader.params ?? []).map((param) => ({ ...param, name: `l${index}_${param.name}`, label: label(index + 1, param.label) })),
    ...(index
      ? [
          { name: `l${index}_mix`, label: label(index + 1, 'shaders.mix.strength'), type: 'number' as const, default: 0.5, min: 0, max: 1 },
          { name: `l${index}_size`, label: label(index + 1, 'shaders.mix.size'), type: 'number' as const, default: 1, min: 0.1, max: 10 },
        ]
      : []),
  ]);
  // a layer above the base works on the point divided by its size; its relief is in its own tiles, so it is scaled back
  const at = (index: number) => (index ? `p / u_l${index}_size` : 'p');
  const scaled = (index: number) => (index ? ` * u_l${index}_size` : '');
  const strength = (index: number) => `u_l${index}_mix`;
  const lines = (kind: 's3dHeight' | 's3dRoughness', start: string, value: (index: number) => string) =>
    shaders
      .map((shader, index) => {
        if (!defines(shader, kind)) {
          return index ? '' : `  float v = ${start};`;
        }
        return index ? `  v = mix(v, ${value(index)}, ${strength(index)});` : `  float v = ${value(0)};`;
      })
      .filter(Boolean)
      .join('\n');
  const height = shaders.some((shader) => defines(shader, 's3dHeight'))
    ? `float s3dHeight(vec3 p, vec3 n) {\n${lines('s3dHeight', '0.0', (index) => `s3dHeight_l${index}(${at(index)}, n)${scaled(index)}`)}\n  return v;\n}`
    : '';
  const roughness = shaders.some((shader) => defines(shader, 's3dRoughness'))
    ? `float s3dRoughness(vec3 p, vec3 n) {\n${lines('s3dRoughness', '0.8', (index) => `s3dRoughness_l${index}(${at(index)}, n)`)}\n  return v;\n}`
    : '';
  const surface = [
    'vec3 s3dSurface(vec3 p, vec3 n, vec3 base) {',
    '  vec3 color = s3dSurface_l0(p, n, base);',
    ...shaders
      .slice(1)
      .map((_, step) => `  color = mix(color, s3dSurface_l${step + 1}(${at(step + 1)}, n, color), ${strength(step + 1)});`),
    '  return color;',
    '}',
  ].join('\n');
  return {
    id: mixId(layers),
    label: title(layers),
    params,
    glsl: [NOISE, ...shaders.map(layerSource), surface, height, roughness].join('\n'),
  };
};

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { composeLayers, layersOf, mixId } from '../src/layers.ts';

const label = (layer: number, param: string) => `${layer}:${param}`;
const title = (layers: string[]) => layers.join(' + ');

test('a mix id names its layers, and nothing else passes', () => {
  assert.deepEqual(layersOf(mixId(['bricks', 'rust'])), ['bricks', 'rust']);
  assert.equal(layersOf('mix-bricks-nothing'), undefined);
  assert.equal(layersOf('mix-'), undefined);
  assert.equal(layersOf('wood'), undefined);
  assert.equal(layersOf('mix-wood-wood-wood-wood-wood'), undefined);
});

test('the same pattern twice: every function and parameter has a name of its own', () => {
  const shader = composeLayers(['bricks', 'bricks'], label, title);
  const definitions = [...shader.glsl.matchAll(/\b(?:vec[234]|float)\s+(\w+)\s*\(/g)].map((match) => match[1]);
  assert.equal(new Set(definitions).size, definitions.length, `defined twice: ${definitions}`);
  const uniforms = new Set([...shader.glsl.matchAll(/\bu_(\w+)/g)].map((match) => match[1]));
  const params = new Set(shader.params!.map((param) => param.name));
  for (const uniform of uniforms) {
    assert.ok(params.has(uniform), `uniform u_${uniform} has no parameter`);
  }
  assert.ok(params.has('l1_mix') && params.has('l1_size') && !params.has('l0_mix'));
  assert.equal(shader.params!.find((param) => param.name === 'l1_mortarColor')!.label, '2:shaders.param.mortarColor');
});

test('relief and roughness are mixed only from layers that have them', () => {
  const shader = composeLayers(['checker', 'rust'], label, title);
  assert.match(shader.glsl, /float s3dHeight\(vec3 p, vec3 n\) \{\n {2}float v = 0\.0;\n {2}v = mix\(v, s3dHeight_l1\(p \/ u_l1_size, n\) \* u_l1_size, u_l1_mix\);/);
  assert.match(shader.glsl, /float v = s3dRoughness_l0\(p, n\);/);
  assert.equal(shader.label, 'checker + rust');
  // a layer without relief leaves the relief below it alone
  const flatOnTop = composeLayers(['bricks', 'checker'], label, title);
  assert.doesNotMatch(flatOnTop.glsl, /s3dHeight_l1/);
});

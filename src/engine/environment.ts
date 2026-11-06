import * as THREE from 'three';
import type { ModelEnvironment } from '../core/document';

/** the picture of an environment and its prepared form for lighting; both freed with `dispose` */
export interface LoadedEnvironment {
  background: THREE.Texture;
  lighting: THREE.WebGLRenderTarget;
  dispose: () => void;
}

/** Reads an HDR or EXR image stored in the model and prepares it as light and reflections. The loaders come in on first use. */
export const loadEnvironment = async (renderer: THREE.WebGLRenderer, environment: ModelEnvironment): Promise<LoadedEnvironment> => {
  // a file with an address elsewhere would tell that server who opened it
  if (!environment.data.startsWith('data:')) {
    throw new Error('environment: not stored in the model');
  }
  const bytes = await (await fetch(environment.data)).arrayBuffer();
  const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js');
  const { HDRLoader } = await import('three/examples/jsm/loaders/HDRLoader.js');
  const loader = /\.exr$/i.test(environment.name) ? new EXRLoader() : new HDRLoader();
  const parsed = loader.parse(bytes);
  const background = new THREE.DataTexture(parsed.data, parsed.width, parsed.height, parsed.format ?? THREE.RGBAFormat, parsed.type);
  background.mapping = THREE.EquirectangularReflectionMapping;
  background.colorSpace = THREE.LinearSRGBColorSpace;
  // as the loaders' own textures: files start with the top row
  background.flipY = true;
  background.minFilter = background.magFilter = THREE.LinearFilter;
  background.needsUpdate = true;
  const generator = new THREE.PMREMGenerator(renderer);
  const lighting = generator.fromEquirectangular(background);
  generator.dispose();
  return {
    background,
    lighting,
    dispose: () => {
      background.dispose();
      lighting.dispose();
    },
  };
};

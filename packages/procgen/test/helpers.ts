import type { PluginMesh } from '../../../src/plugins/types';
import { makeGrid, normaliseSettings, type TerrainSettings } from '../src';

/** a small, gentle noise terrain – the same for every test that asks for the same settings */
export const testGrid = (settings: Partial<TerrainSettings> = {}) =>
  makeGrid(normaliseSettings({ width: 80, depth: 60, detail: 80, height: 8, scale: 40, octaves: 4, skirt: false, seed: 3, ...settings }));

/** every face of a mesh points at vertices that exist, and has at least three of them */
export const expectValidMesh = (mesh: PluginMesh) => {
  for (const face of mesh.faces) {
    if (face.length < 3) {
      throw new Error(`a face with ${face.length} corners`);
    }
    for (const index of face) {
      if (!Number.isInteger(index) || index < 0 || index >= mesh.vertices.length) {
        throw new Error(`a face points at vertex ${index} of ${mesh.vertices.length}`);
      }
    }
  }
  for (const vertex of mesh.vertices) {
    if (!vertex.every(Number.isFinite)) {
      throw new Error(`a vertex is not finite: ${vertex.join(', ')}`);
    }
  }
  if (mesh.faceMaterials && mesh.faceMaterials.length !== mesh.faces.length) {
    throw new Error('not one material per face');
  }
};

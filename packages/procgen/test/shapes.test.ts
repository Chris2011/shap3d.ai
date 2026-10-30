import { describe, expect, it } from 'vitest';
import {
  facadeMesh,
  FACADE_DEFAULTS,
  icosphere,
  inside,
  meshBuilder,
  PAVING_DEFAULTS,
  pavingStones,
  ProcgenError,
  toPluginMesh,
  TREE_DEFAULTS,
  TREE_MATERIALS,
  TREE_SPECIES,
  treeMesh,
  wallPlane,
} from '../src';
import { expectValidMesh } from './helpers';

const square: [number, number][] = [
  [0, 0],
  [4, 0],
  [4, 3],
  [0, 3],
];

describe('pavingStones', () => {
  it('lays stones inside the outline, the same for the same seed', () => {
    const stones = pavingStones(square, { ...PAVING_DEFAULTS, seed: 2 });
    expect(stones.length).toBeGreaterThan(20);
    expect(pavingStones(square, { ...PAVING_DEFAULTS, seed: 2 })).toEqual(stones);
    for (const stone of stones) {
      for (const [x, y] of stone.outline) {
        expect(x).toBeGreaterThanOrEqual(-1e-6);
        expect(y).toBeGreaterThanOrEqual(-1e-6);
        expect(x).toBeLessThanOrEqual(4 + 1e-6);
        expect(y).toBeLessThanOrEqual(3 + 1e-6);
      }
    }
  });

  it('refuses too many stones with a code, not a text', () => {
    try {
      pavingStones(
        [
          [0, 0],
          [500, 0],
          [500, 500],
          [0, 500],
        ],
        { ...PAVING_DEFAULTS, size: 0.1 },
      );
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(ProcgenError);
      expect((error as ProcgenError).code).toBe('paving.tooMany');
      expect((error as ProcgenError).params.max).toBeGreaterThan(0);
    }
  });

  it('inside tells points in and out of a polygon', () => {
    expect(inside(square, [2, 1])).toBe(true);
    expect(inside(square, [5, 1])).toBe(false);
  });
});

describe('treeMesh', () => {
  it('grows every species the same for the same seed, with valid faces and the tree materials', () => {
    const materials = new Set<string | null>([...Object.values(TREE_MATERIALS), null]);
    for (const species of TREE_SPECIES) {
      const options = { ...TREE_DEFAULTS, species, seed: 3 };
      const tree = treeMesh(options);
      expect(treeMesh(options)).toEqual(tree);
      expect(tree.triangles.length).toBeGreaterThan(100);
      expect(tree.materials.every((material) => materials.has(material))).toBe(true);
      expectValidMesh(toPluginMesh(tree));
      // it stands on the ground and reaches about its height
      const heights = tree.vertices.map(([, , z]) => z);
      expect(Math.min(...heights)).toBeGreaterThan(-0.5);
      expect(Math.max(...heights)).toBeGreaterThan(options.height * 0.6);
    }
  });
});

describe('meshes', () => {
  it('icosphere and the builder give valid meshes', () => {
    expectValidMesh(toPluginMesh(icosphere(1, 2, null)));
    const builder = meshBuilder({ origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] });
    builder.box(0, 0, 0, 2, 3, 4, 'wall');
    builder.pitched(0, 0, 2, 3, 4, 1.5, true, 'gable', 'wall', 'roof');
    builder.pitched(0, 0, 3, 3, 4, 1.5, true, 'hip', 'wall', 'roof');
    builder.facet(
      [
        [0, 0, 0],
        [1, 0, 0],
        [1, 0, 0],
        [1, 1, 0],
      ],
      'wall',
    );
    const mesh = builder.mesh();
    expectValidMesh(mesh);
    expect(mesh.faces.every((face) => face.length >= 3)).toBe(true);
  });

  it('facadeMesh puts windows on a wall', () => {
    const plane = wallPlane([0, 0, 0], [0, -1, 0]);
    const builder = facadeMesh(plane, 12, 9, FACADE_DEFAULTS, {
      frame: 'frame',
      glass: 'glass',
      litGlass: 'lit',
      shutter: 'shutter',
      balcony: 'balcony',
      railing: 'railing',
      door: 'door',
    });
    expectValidMesh(builder.mesh());
    expect(builder.isEmpty()).toBe(false);
  });
});

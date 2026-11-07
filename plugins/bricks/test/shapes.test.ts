import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CATALOG } from '../src/catalog.ts';
import { buildMesh, PITCH, type BrickMesh } from '../src/shapes.ts';

/** closed solids only have a meaning for this: positive when the faces look outwards */
const signedVolume = ({ vertices, faces }: BrickMesh) => {
  let volume = 0;
  for (const face of faces) {
    const [a] = face.map((index) => vertices[index]);
    for (let i = 1; i < face.length - 1; i++) {
      const b = vertices[face[i]];
      const c = vertices[face[i + 1]];
      volume += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
  }
  return volume / 6;
};

const bounds = ({ vertices }: BrickMesh) => {
  const of = (axis: number) => vertices.map((point) => point[axis]);
  return {
    x: [Math.min(...of(0)), Math.max(...of(0))],
    y: [Math.min(...of(1)), Math.max(...of(1))],
    z: [Math.min(...of(2)), Math.max(...of(2))],
  };
};

test('every part stays inside its cells and on the ground', () => {
  for (const part of CATALOG) {
    const box = bounds(buildMesh(part.build));
    assert.ok(box.x[1] <= (part.w * PITCH) / 2 && box.x[0] >= (-part.w * PITCH) / 2, `${part.id} x`);
    assert.ok(box.y[1] <= (part.d * PITCH) / 2 && box.y[0] >= (-part.d * PITCH) / 2, `${part.id} y`);
    assert.ok(Math.abs(box.z[0]) < 1e-9, `${part.id} stands on z = 0`);
    assert.ok(box.z[1] >= part.height - 1e-9, `${part.id} reaches its height`);
  }
});

test('faces look outwards', () => {
  for (const part of CATALOG) {
    assert.ok(signedVolume(buildMesh(part.build)) > 0, part.id);
  }
});

test('faces refer to existing points and have no repeated corner', () => {
  for (const part of CATALOG) {
    const { vertices, faces } = buildMesh(part.build);
    for (const face of faces) {
      assert.ok(face.length >= 3, part.id);
      assert.equal(new Set(face).size, face.length, part.id);
      assert.ok(face.every((index) => index >= 0 && index < vertices.length), part.id);
    }
  }
});

test('ids are unique', () => {
  assert.equal(new Set(CATALOG.map((part) => part.id)).size, CATALOG.length);
});

test('a 2 × 4 brick measures 32 × 16 × 9.6 mm with 8 studs', () => {
  const part = CATALOG.find((entry) => entry.id === 'brick-2x4')!;
  assert.equal(part.height, 0.0096);
  const mesh = buildMesh(part.build);
  const box = bounds(mesh);
  assert.ok(Math.abs(box.x[1] - box.x[0] - 0.0158) < 1e-9);
  assert.ok(Math.abs(box.y[1] - box.y[0] - 0.0318) < 1e-9);
  assert.ok(Math.abs(box.z[1] - (0.0096 + 0.0017)) < 1e-9);
  const studTops = mesh.faces.filter((face) => face.length === 12 && face.every((index) => Math.abs(mesh.vertices[index][2] - box.z[1]) < 1e-9));
  assert.equal(studTops.length, 8);
});

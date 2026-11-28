import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_DOOR, DEFAULT_WINDOW, boxMesh, frameMesh, openingPieces, type Mesh } from '../src/parts.ts';

const key = (point: number[]) => point.map((value) => value.toFixed(6)).join(',');

/** closed and facing out: every edge is walked once each way, and the volume (divergence theorem) is positive */
const volumeOf = (mesh: Mesh) => {
  const edges = new Map<string, number>();
  let volume = 0;
  for (const face of mesh.faces) {
    const points = face.map((index) => mesh.vertices[index]);
    for (let i = 0; i < points.length; i++) {
      const edge = `${key(points[i])}|${key(points[(i + 1) % points.length])}`;
      edges.set(edge, (edges.get(edge) ?? 0) + 1);
    }
    for (let i = 1; i + 1 < points.length; i++) {
      const [a, b, c] = [points[0], points[i], points[i + 1]];
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  for (const [edge, count] of edges) {
    const [a, b] = edge.split('|');
    assert.equal(count, 1, `edge ${edge} walked ${count}×`);
    assert.equal(edges.get(`${b}|${a}`), 1, `edge ${edge} has no opposite`);
  }
  assert.ok(volume > 0, `faces face inwards (volume ${volume})`);
  return volume;
};

test('a box and a frame are closed and face out', () => {
  assert.ok(Math.abs(volumeOf(boxMesh([0, 0, 0], [2, 3, 4])) - 24) < 1e-9);
  // a 1 × 1 frame with 0.1 bars, 0.07 deep: (1 − 0.8²) · 0.07
  assert.ok(Math.abs(volumeOf(frameMesh(0, 0, 1, 1, 0.1, 0.1, 0.17)) - 0.36 * 0.07) < 1e-9);
});

test('a window: frame, one sash with glass per side, bars, two sills – all closed', () => {
  const pieces = openingPieces({ ...DEFAULT_WINDOW, sashes: 2, barsAcross: 1, barsUpright: 1 }, 0.3);
  const count = (name: string) => pieces.filter((piece) => piece.name === name).length;
  assert.equal(count('frame'), 1);
  assert.equal(count('sash'), 2);
  assert.equal(count('glass'), 2);
  assert.equal(count('bar'), 2 * 2 * 2); // per sash one across and one upright, on both faces
  assert.equal(count('sill'), 2);
  pieces.forEach((piece) => volumeOf(piece.mesh));
  // the frame sits in the middle of the wall
  const ys = pieces.find((piece) => piece.name === 'frame')!.mesh.vertices.map((point) => point[1]);
  assert.ok(Math.abs((Math.min(...ys) + Math.max(...ys)) / 2 - 0.15) < 1e-9);
});

test('a door: three-sided frame, leaf and handles; a thin wall gets no inner sill', () => {
  const pieces = openingPieces({ ...DEFAULT_DOOR, hinge: 'right' }, 0.08);
  assert.deepEqual(
    pieces.map((piece) => piece.name),
    ['frame', 'frame', 'frame', 'leaf', 'handle', 'handle'],
  );
  pieces.forEach((piece) => volumeOf(piece.mesh));
  // hinges on the right: the handle is near the left jamb
  assert.ok(pieces[4].mesh.vertices.every((point) => point[0] < 0.2));
  assert.equal(
    openingPieces(DEFAULT_WINDOW, 0.08).filter((piece) => piece.name === 'sill').length,
    1,
  );
});

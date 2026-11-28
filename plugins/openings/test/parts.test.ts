import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_DOOR, DEFAULT_WINDOW, boxMesh, frameMesh, type Mesh } from '../src/parts.ts';
import { openingPieces } from '../src/pieces.ts';

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
  assert.equal(count('handle'), 2); // one inside on each sash
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

test('a fixed window: panes in the frame with mullions, no sashes and no handles', () => {
  const pieces = openingPieces({ ...DEFAULT_WINDOW, operation: 'fixed', sashes: 3, barsAcross: 1 }, 0.3);
  const count = (name: string) => pieces.filter((piece) => piece.name === name).length;
  assert.deepEqual([count('sash'), count('glass'), count('mullion'), count('handle'), count('bar')], [0, 3, 2, 0, 6]);
  pieces.forEach((piece) => volumeOf(piece.mesh));
});

test('sliding sashes overlap and run one behind the other', () => {
  const sashes = openingPieces({ ...DEFAULT_WINDOW, operation: 'sliding', sashes: 2 }, 0.3).filter((piece) => piece.name === 'sash');
  const span = (piece: (typeof sashes)[number], axis: 0 | 1) => {
    const values = piece.mesh.vertices.map((point) => point[axis]);
    return [Math.min(...values), Math.max(...values)];
  };
  const [[aLeft, aRight], [bLeft, bRight]] = sashes.map((piece) => span(piece, 0));
  assert.ok(bLeft < aRight, 'the sashes overlap');
  assert.ok(Math.abs(aLeft - 0.06) < 1e-9 && Math.abs(bRight - (DEFAULT_WINDOW.width - 0.06)) < 1e-9, 'they fill the frame');
  const [[aFront, aBack], [bFront, bBack]] = sashes.map((piece) => span(piece, 1));
  assert.ok(aBack <= bFront + 1e-9 || bBack <= aFront + 1e-9, 'one behind the other');
  sashes.forEach((piece) => volumeOf(piece.mesh));
});

test('a glazed door: the leaf is a frame round a glass pane', () => {
  const pieces = openingPieces({ ...DEFAULT_DOOR, glazed: true }, 0.3);
  assert.deepEqual(
    pieces.map((piece) => piece.name),
    ['frame', 'frame', 'frame', 'leaf', 'glass', 'handle', 'handle'],
  );
  pieces.forEach((piece) => volumeOf(piece.mesh));
});

test('a double door: two leaves meeting in the middle, a handle by the middle on each', () => {
  const pieces = openingPieces({ ...DEFAULT_DOOR, width: 1.6, sashes: 2, glazed: true }, 0.3);
  const of = (name: string) => pieces.filter((piece) => piece.name === name);
  assert.deepEqual([of('leaf').length, of('glass').length, of('handle').length], [2, 2, 4]);
  const span = (piece: (typeof pieces)[number]) => {
    const xs = piece.mesh.vertices.map((point) => point[0]);
    return [Math.min(...xs), Math.max(...xs)];
  };
  const [[, firstRight], [secondLeft]] = of('leaf').map(span);
  assert.ok(firstRight < 0.8 && secondLeft > 0.8 && secondLeft - firstRight < 0.01, 'they meet in the middle');
  assert.ok(of('handle').every((handle) => Math.abs((span(handle)[0] + span(handle)[1]) / 2 - 0.8) < 0.15), 'handles by the middle');
  pieces.forEach((piece) => volumeOf(piece.mesh));
});

test('a roller shutter: box above the window, rails beside it, the curtain let down as far as asked', () => {
  const pieces = openingPieces({ ...DEFAULT_WINDOW, shutter: true, shutterDown: 0.5 }, 0.3);
  const of = (name: string) => pieces.filter((piece) => piece.name === name);
  assert.deepEqual([of('shutterBox').length, of('rail').length, of('curtain').length], [1, 2, 1]);
  const zs = of('curtain')[0].mesh.vertices.map((point) => point[2]);
  assert.ok(Math.abs(Math.max(...zs) - Math.min(...zs) - DEFAULT_WINDOW.height / 2) < 1e-9, 'half down');
  // all of it in front of the wall
  assert.ok([...of('shutterBox'), ...of('rail'), ...of('curtain')].every((piece) => piece.mesh.vertices.every((point) => point[1] <= 1e-9)));
  pieces.forEach((piece) => volumeOf(piece.mesh));
  assert.equal(openingPieces({ ...DEFAULT_WINDOW, shutter: true, shutterDown: 0 }, 0.3).filter((piece) => piece.name === 'curtain').length, 0);
});

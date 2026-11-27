// Self-check of the walls and stairs of "Parts from lines" – run with: node scripts/checks/linework.check.mts
import assert from 'node:assert/strict';
import { stairMesh, spiralMesh, wallMesh, type Mesh } from '../../src/plugins/builtin/linework/geometry.ts';

const key = (point: number[]) => point.map((value) => value.toFixed(6)).join(',');

/** closed and facing out: every edge is walked once each way, and the volume (divergence theorem) is positive */
const check = (name: string, mesh: Mesh, volume?: number) => {
  assert.ok(mesh.faces.length, `${name}: no faces`);
  const edges = new Map<string, number>();
  let signed = 0;
  for (const face of mesh.faces) {
    const points = face.map((index) => mesh.vertices[index]);
    for (let i = 0; i < points.length; i++) {
      const [a, b] = [key(points[i]), key(points[(i + 1) % points.length])];
      edges.set(`${a}|${b}`, (edges.get(`${a}|${b}`) ?? 0) + 1);
    }
    for (let i = 1; i + 1 < points.length; i++) {
      const [a, b, c] = [points[0], points[i], points[i + 1]];
      signed += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
  }
  for (const [edge, count] of edges) {
    const [a, b] = edge.split('|');
    assert.equal(count, 1, `${name}: edge ${edge} walked ${count}×`);
    assert.equal(edges.get(`${b}|${a}`), 1, `${name}: edge ${edge} has no opposite`);
  }
  assert.ok(signed > 0, `${name}: faces face inwards (volume ${signed})`);
  if (volume !== undefined) {
    assert.ok(Math.abs(signed - volume) < 1e-6, `${name}: volume ${signed} instead of ${volume}`);
  }
};

// a straight wall 4 m long, 0.24 thick, 2.5 high
check(
  'wall straight',
  wallMesh(
    [
      [0, 0, 0],
      [4, 0, 0],
    ],
    false,
    { thickness: 0.24, height: 2.5, align: 'center' },
  ),
  4 * 0.24 * 2.5,
);
// an L, on the left of the line: inner corner at (0.2, 0.2) – outer legs 4 and 3, inner 3.8 and 2.8
check(
  'wall L left',
  wallMesh(
    [
      [4, 0, 0],
      [0, 0, 0],
      [0, 3, 0],
    ],
    false,
    { thickness: 0.2, height: 2, align: 'right' },
  ),
);
// a closed square room, centred walls: (outer² − inner²) · height
check(
  'wall room',
  wallMesh(
    [
      [0, 0, 0],
      [5, 0, 0],
      [5, 4, 0],
      [0, 4, 0],
    ],
    true,
    { thickness: 0.3, height: 2.5, align: 'center' },
  ),
  (5.3 * 4.3 - 4.7 * 3.7) * 2.5,
);
// a flight of 10 steps over 3 m, 2 m high, 1 m wide: sum of the steps' columns
check('stairs', stairMesh([0, 0, 0], [3, 0, 0], { width: 1, height: 2, steps: 10 }), 1 * 0.3 * ((0.2 * (10 * 11)) / 2));
check('stairs diagonal', stairMesh([1, 1, 0], [3, 4, 0.5], { width: 1.2, height: 2.8, steps: 16 }));
// a spiral stair, both ways round, with and without spindle
check('spiral', spiralMesh([0, 0, 0], 1, 0, { height: 2.8, steps: 14, turn: 360, inner: 0.1, thickness: 0.05 }));
check('spiral clockwise', spiralMesh([2, 2, 0], 1.2, 1, { height: 3, steps: 12, turn: -270, inner: 0, thickness: 0.06 }));
// nothing sensible to build: no faces
assert.equal(wallMesh([[0, 0, 0]], false, { thickness: 0.2, height: 2, align: 'center' }).faces.length, 0);
assert.equal(stairMesh([0, 0, 0], [0, 0, 1], { width: 1, height: 2, steps: 5 }).faces.length, 0);
console.log('linework: all checks passed');

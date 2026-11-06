import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ShapeUtils, Vector2 } from 'three';
import { buildingsToStl, type Point } from '../src/buildings.ts';

const vectors = (ring: Point[]) => ring.map(({ x, y }) => new Vector2(x, y));
const shapes = {
  triangulate: (ring: Point[]) => ShapeUtils.triangulateShape(vectors(ring), []),
  area: (ring: Point[]) => ShapeUtils.area(vectors(ring)),
};

test('a footprint becomes a closed block with its height, outward either way round', () => {
  const corners = [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 0.001 },
    { lat: 0.001, lon: 0.001 },
    { lat: 0.001, lon: 0 },
    { lat: 0, lon: 0 },
  ];
  for (const geometry of [corners, [...corners].reverse()]) {
    const { bytes, count } = buildingsToStl([{ geometry, tags: { height: '12.5 m' } }], 0, 0, shapes);
    // 2 roof + 2 floor + 8 wall triangles
    assert.equal(count, 12);
    assert.equal(bytes.byteLength, 84 + 12 * 50);
    const view = new DataView(bytes);
    const heights = Array.from({ length: 36 }, (_, corner) => view.getFloat32(84 + Math.floor(corner / 3) * 50 + 12 + (corner % 3) * 12 + 8, true));
    assert.equal(Math.max(...heights), 12.5);
    assert.equal(Math.min(...heights), 0);
    // the signed volume of a closed mesh with outward faces is positive: 111 m × 111 m × 12.5 m
    let volume = 0;
    for (let triangle = 0; triangle < 12; triangle++) {
      const at = 84 + triangle * 50 + 12;
      const point = (index: number) => [0, 1, 2].map((axis) => view.getFloat32(at + index * 12 + axis * 4, true));
      const [a, b, c] = [point(0), point(1), point(2)];
      volume += (a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6;
    }
    assert.ok(Math.abs(volume - 111.19 * 111.19 * 12.5) < 200, `volume ${volume}`);
  }
});

test('heights: levels, then a default; broken ways are skipped', () => {
  const square = [
    { lat: 0, lon: 0 },
    { lat: 0, lon: 0.0001 },
    { lat: 0.0001, lon: 0.0001 },
    { lat: 0.0001, lon: 0 },
  ];
  const top = (tags?: Record<string, string>) => {
    const view = new DataView(buildingsToStl([{ geometry: square, tags }], 0, 0, shapes).bytes);
    return view.getFloat32(84 + 12 + 8, true);
  };
  assert.equal(top({ 'building:levels': '5' }), 15);
  assert.equal(top({ height: 'tall' }), 9);
  assert.equal(buildingsToStl([{}, { geometry: square.slice(0, 2) }], 0, 0, shapes).count, 0);
});

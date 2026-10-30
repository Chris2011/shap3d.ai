import { describe, expect, it } from 'vitest';
import { blockoutMesh, generateFloorplan } from '../src';
import { expectValidMesh } from './helpers';

describe('generateFloorplan', () => {
  const plan = generateFloorplan({ rooms: 9, size: 50, seed: 7 });

  it('places the rooms asked for, apart from each other', () => {
    expect(plan.rooms).toHaveLength(9);
    for (let a = 0; a < plan.rooms.length; a++) {
      for (let b = a + 1; b < plan.rooms.length; b++) {
        const [p, q] = [plan.rooms[a], plan.rooms[b]];
        const apart = p.x + p.width + 4 <= q.x || q.x + q.width + 4 <= p.x || p.y + p.depth + 4 <= q.y || q.y + q.depth + 4 <= p.y;
        expect(apart).toBe(true);
      }
    }
  });

  it('reaches every room from the start, the end furthest away', () => {
    expect(plan.depth.every((value) => Number.isFinite(value))).toBe(true);
    expect(plan.depth[plan.start]).toBe(0);
    expect(plan.depth[plan.end]).toBe(Math.max(...plan.depth));
    // a spanning tree and a few loops
    expect(plan.links.length).toBeGreaterThanOrEqual(plan.rooms.length - 1);
  });

  it('is the same for the same seed and different for another', () => {
    expect(generateFloorplan({ rooms: 9, size: 50, seed: 7 })).toEqual(plan);
    expect(generateFloorplan({ rooms: 9, size: 50, seed: 8 }).rooms).not.toEqual(plan.rooms);
  });

  it('gives pieces the blockout builds', () => {
    expect(plan.pieces.filter((piece) => piece.kind === 'room')).toHaveLength(9);
    expect(plan.pieces.filter((piece) => piece.kind === 'corridor')).toHaveLength(plan.links.length);
    const mesh = blockoutMesh(plan.pieces, 0.5, { floor: 'f', wall: 'w', ceiling: 'c', stairs: 's' });
    expectValidMesh(mesh);
    expect(mesh.faces.length).toBeGreaterThan(20);
  });
});

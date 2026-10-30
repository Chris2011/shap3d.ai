import { describe, expect, it } from 'vitest';
import { meetRoads, planVillages, roadOn, ROAD_DEFAULTS, VILLAGE_DEFAULTS, type Point2 } from '../src';
import { expectValidMesh, testGrid } from './helpers';

const MATERIALS = { surface: 'asphalt', marking: 'marking' };

/** distance from a point to a polyline */
const distanceTo = (line: Point2[], x: number, y: number) => {
  let best = Infinity;
  for (let index = 1; index < line.length; index++) {
    const [ax, ay] = line[index - 1],
      [bx, by] = line[index];
    const lengthSq = (bx - ax) ** 2 + (by - ay) ** 2 || 1;
    const along = Math.min(1, Math.max(0, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / lengthSq));
    best = Math.min(best, Math.hypot(x - ax - (bx - ax) * along, y - ay - (by - ay) * along));
  }
  return best;
};

/** a road across the terrain from west to east, and a second one built after it */
const twoRoads = (second: Point2[], options = {}) => {
  const grid = testGrid();
  const first = roadOn(
    grid,
    { ...ROAD_DEFAULTS, width: 6 },
    [
      [4, 30],
      [40, 31],
      [76, 30],
    ],
    MATERIALS,
  );
  const next = roadOn(first.grid, { ...ROAD_DEFAULTS, width: 4, ...options }, second, MATERIALS, [], [], [first.course]);
  return { first, next };
};

describe('junctions', () => {
  it('ends a road that runs into another one at its edge, at its height', () => {
    const { first, next } = twoRoads([
      [30, 4],
      [36, 18],
      [40, 31],
    ]);
    expectValidMesh(next.surface);
    const half = first.course.half!;
    // nothing of the new road lies on the old road's surface
    for (const [x, y] of next.surface.vertices) {
      expect(distanceTo(first.course.line, x, y)).toBeGreaterThan(half - 0.05);
    }
    // where it meets the old road's edge it is as high as the old road there
    // (the top of each slab – its underside lies 0.5 m lower at the same spot)
    const top = (vertices: number[][]) =>
      vertices.filter(([x, y, z]) => !vertices.some(([ox, oy, oz]) => Math.abs(ox - x) + Math.abs(oy - y) < 1e-6 && oz > z + 0.1));
    const meeting = top(next.surface.vertices).filter(([x, y]) => distanceTo(first.course.line, x, y) < half + 0.05);
    expect(meeting.length).toBeGreaterThan(0);
    const old = top(first.surface.vertices);
    for (const [x, y, z] of meeting) {
      const [, , nearest] = old.reduce((best, vertex) =>
        Math.hypot(vertex[0] - x, vertex[1] - y) < Math.hypot(best[0] - x, best[1] - y) ? vertex : best,
      );
      expect(Math.abs(z - nearest)).toBeLessThan(0.1);
    }
    // the corners are rounded off: the new road's surface reaches out along the old road's edge
    expect(meeting.some(([x]) => Math.abs(x - 40) > 3.5)).toBe(true);
  });

  it('splits a road that crosses another one into a piece on each side', () => {
    const { first, next } = twoRoads([
      [40, 4],
      [42, 30],
      [40, 56],
    ]);
    expectValidMesh(next.surface);
    const half = first.course.half!;
    for (const [x, y] of next.surface.vertices) {
      expect(distanceTo(first.course.line, x, y)).toBeGreaterThan(half - 0.05);
    }
    expect(next.surface.vertices.some(([, y]) => y < 25)).toBe(true);
    expect(next.surface.vertices.some(([, y]) => y > 36)).toBe(true);
    // no dashes in the mouth of the junction
    const marks = next.surface.faces
      .filter((_, index) => next.surface.faceMaterials![index] === 'marking')
      .flatMap((face) => face.map((corner) => next.surface.vertices[corner]));
    expect(marks.length).toBeGreaterThan(0);
    for (const [x, y] of marks) {
      expect(distanceTo(first.course.line, x, y)).toBeGreaterThan(half + 2);
    }
  });

  it('goes on from the end of another road', () => {
    const { first, next } = twoRoads([
      [76.5, 30.5],
      [78, 45],
      [70, 56],
    ]);
    // its start is moved onto the old road's end, at its height
    expect(next.course.line[0]).toEqual(first.course.line[first.course.line.length - 1]);
    expect(next.course.levels![0]).toBeCloseTo(first.course.levels![first.course.levels!.length - 1], 2);
  });

  it('remembers the surface height and width with the course', () => {
    const { next } = twoRoads([
      [30, 4],
      [40, 31],
    ]);
    expect(next.course.half).toBe(2);
    expect(next.course.levels).toHaveLength(next.course.line.length);
  });

  it('leaves a road alone that meets no other one', () => {
    const line: Point2[] = [
      [0, 0],
      [10, 0],
      [20, 0],
    ];
    const met = meetRoads(line, [1, 2, 3], 2, []);
    expect(met.pieces).toHaveLength(1);
    expect(met.pieces[0].line).toEqual(line);
    expect(met.levels).toEqual([1, 2, 3]);
    expect(met.corners).toHaveLength(0);
  });
});

describe('village streets', () => {
  it('run the main street through the centre and branch the side streets off it', () => {
    const grid = testGrid({ width: 200, depth: 160, detail: 100, height: 6, scale: 90 });
    const villages = planVillages(grid, { ...VILLAGE_DEFAULTS, count: 2, houses: 20, seed: 2 }, () => false, 4, 4);
    expect(villages.length).toBeGreaterThan(0);
    for (const { centre, streets } of villages) {
      const [main, ...side] = streets;
      // the centre lies on the main street, not at one of its ends
      expect(distanceTo(main, centre[0], centre[1])).toBeLessThan(0.01);
      expect(main[0]).not.toEqual(centre);
      expect(main[main.length - 1]).not.toEqual(centre);
      for (const street of side) {
        expect(street[0]).toEqual(centre);
      }
    }
  });
});

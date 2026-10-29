import { describe, expect, it } from 'vitest';
import {
  findRoute,
  lineLength,
  onCourse,
  resample,
  riverOn,
  roadOn,
  ROAD_DEFAULTS,
  RIVER_DEFAULTS,
  sampleGrid,
  simplifyLine,
  smoothLine,
  type Point2,
} from '../src';
import { expectValidMesh, testGrid } from './helpers';

const MATERIALS = { surface: 'asphalt', marking: 'marking' };

describe('lines', () => {
  const zigzag: Point2[] = [
    [0, 0],
    [10, 5],
    [20, 0],
    [30, 5],
  ];

  it('smoothLine and simplifyLine keep the ends', () => {
    for (const line of [smoothLine(zigzag, 4), simplifyLine(zigzag, 1)]) {
      expect(line[0]).toEqual(zigzag[0]);
      expect(line[line.length - 1]).toEqual(zigzag[zigzag.length - 1]);
    }
  });

  it('simplifyLine drops the points within its tolerance', () => {
    expect(simplifyLine(zigzag, 10)).toHaveLength(2);
    expect(simplifyLine(zigzag, 0.1)).toHaveLength(zigzag.length);
  });

  it('resample puts the points about a step apart', () => {
    const points = resample(zigzag, 1);
    for (let index = 1; index < points.length; index++) {
      const distance = Math.hypot(points[index][0] - points[index - 1][0], points[index][1] - points[index - 1][1]);
      expect(distance).toBeLessThanOrEqual(1.3 + 1e-9);
    }
    expect(lineLength(points)).toBeCloseTo(lineLength(zigzag), 0);
  });

  it('onCourse is true near a line and false away from it', () => {
    const courses = [{ line: zigzag, reach: 2 }];
    expect(onCourse(courses, 10, 6)).toBe(true);
    expect(onCourse(courses, 10, 12)).toBe(false);
    // a course of one point is a circle
    expect(onCourse([{ line: [[5, 5] as Point2, [5, 5] as Point2], reach: 3 }], 7, 5)).toBe(true);
  });
});

describe('findRoute', () => {
  it('runs from the start to the goal in steps of the grid', () => {
    const grid = testGrid();
    const from: Point2 = [2, 3],
      to: Point2 = [75, 55];
    const route = findRoute(grid, from, to, (_, __, length) => length);
    expect(route[0]).toEqual(from);
    expect(route[route.length - 1]).toEqual(to);
    const cell = Math.max(grid.width / grid.columns, grid.depth / grid.rows);
    for (let index = 1; index < route.length - 1; index++) {
      const step = Math.hypot(route[index][0] - route[index - 1][0], route[index][1] - route[index - 1][1]);
      expect(step).toBeLessThanOrEqual(cell * Math.SQRT2 * 1.01 + 1);
    }
  });

  it('takes longer steps with a stride', () => {
    const grid = testGrid();
    const short = findRoute(grid, [2, 3], [75, 55], (_, __, length) => length);
    const long = findRoute(grid, [2, 3], [75, 55], (_, __, length) => length, 4);
    expect(long.length).toBeLessThan(short.length);
  });
});

describe('riverOn', () => {
  const grid = testGrid({ height: 10 });
  const river = riverOn(grid, { ...RIVER_DEFAULTS, width: 5, depth: 1.5 }, 'water');

  it('only digs – nothing gets higher', () => {
    river.grid.heights.forEach((height, index) => expect(height).toBeLessThanOrEqual(grid.heights[index] + 1e-9));
    expect(river.grid.heights).not.toEqual(grid.heights);
  });

  it('has a water surface that only falls downstream', () => {
    const { levels } = river.course;
    for (let index = 1; index < levels.length; index++) {
      expect(levels[index]).toBeLessThanOrEqual(levels[index - 1] + 1e-6);
    }
  });

  it('is the same for the same seed and gives a valid water mesh', () => {
    const again = riverOn(grid, { ...RIVER_DEFAULTS, width: 5, depth: 1.5 }, 'water');
    expect(again.grid.heights).toEqual(river.grid.heights);
    expect(river.water.faces.length).toBeGreaterThan(0);
    expectValidMesh(river.water);
    expect(river.length).toBeGreaterThan(20);
  });
});

describe('roadOn', () => {
  it('lays a road between two points on an evenly graded bed below its surface', () => {
    const grid = testGrid();
    const road = roadOn(
      grid,
      { ...ROAD_DEFAULTS, width: 4 },
      [
        [5, 5],
        [75, 50],
      ],
      MATERIALS,
    );
    expectValidMesh(road.surface);
    expect(road.surface.faceMaterials).toContain('marking');
    expect(road.grid.heights).toHaveLength(grid.heights.length);
    // the ground under the road's middle lies below the road surface
    const middle = road.course.line[Math.floor(road.course.line.length / 2)];
    const surface = Math.max(...road.surface.vertices.filter(([x, y]) => Math.hypot(x - middle[0], y - middle[1]) < 1).map(([, , z]) => z));
    expect(sampleGrid(road.grid, middle[0], middle[1]).height).toBeLessThan(surface);
  });

  it('follows the given points when there are more than two', () => {
    const grid = testGrid();
    const points: Point2[] = [
      [5, 5],
      [40, 10],
      [40, 50],
    ];
    const road = roadOn(grid, { ...ROAD_DEFAULTS, width: 3, surface: 'gravel' }, points, MATERIALS);
    expect(road.surface.faceMaterials).not.toContain('marking');
    // the corner is rounded off, so a little shorter than the points' 75 m
    expect(road.length).toBeGreaterThan(65);
    expect(road.length).toBeLessThan(76);
  });

  it('bridges a river 1.2 m above the water', () => {
    const grid = testGrid({ height: 10 });
    const river = riverOn(grid, { ...RIVER_DEFAULTS, width: 5, depth: 1.5 }, 'water', [0, 30], [80, 30]);
    const road = roadOn(
      river.grid,
      { ...ROAD_DEFAULTS, width: 4 },
      [
        [40, 2],
        [40, 58],
      ],
      MATERIALS,
      [river.course],
    );
    // where the road comes nearest to the river's middle, and the water there
    let nearest = { distance: Infinity, road: [0, 0] as Point2, water: 0 };
    for (const point of road.course.line) {
      river.course.line.forEach((riverPoint, index) => {
        const distance = Math.hypot(point[0] - riverPoint[0], point[1] - riverPoint[1]);
        if (distance < nearest.distance) {
          nearest = { distance, road: point, water: river.course.levels[index] };
        }
      });
    }
    expect(nearest.distance).toBeLessThan(3);
    const { water } = nearest;
    const deck = Math.max(
      ...road.surface.vertices.filter(([x, y]) => Math.hypot(x - nearest.road[0], y - nearest.road[1]) < 2).map(([, , z]) => z),
    );
    expect(deck).toBeGreaterThanOrEqual(water + 1.2 - 0.05);
  });
});

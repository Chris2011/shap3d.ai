import { describe, expect, it } from 'vitest';
import { CITY_DEFAULTS, planCity, planVillages, sampleGrid, terrainGround, villageLinks, VILLAGE_DEFAULTS, type Building } from '../src';
import { testGrid } from './helpers';

const overlap = (a: Building, b: Building) =>
  a.x < b.x + b.width - 1e-6 && b.x < a.x + a.width - 1e-6 && a.y < b.y + b.depth - 1e-6 && b.y < a.y + a.depth - 1e-6;

describe('planCity', () => {
  const options = { ...CITY_DEFAULTS, width: 200, depth: 150, courts: 0.5, parks: 0.2, seed: 4 };
  const plan = planCity(options, 5, 3);

  it('is the same for the same seed', () => {
    expect(planCity(options, 5, 3)).toEqual(plan);
    expect(planCity({ ...options, seed: 5 }, 5, 3)).not.toEqual(plan);
  });

  it('keeps every building inside the city and apart from the others', () => {
    expect(plan.buildings.length).toBeGreaterThan(20);
    for (const building of plan.buildings) {
      expect(building.x).toBeGreaterThanOrEqual(0);
      expect(building.y).toBeGreaterThanOrEqual(0);
      expect(building.x + building.width).toBeLessThanOrEqual(options.width + 1e-6);
      expect(building.y + building.depth).toBeLessThanOrEqual(options.depth + 1e-6);
      expect(building.floors).toBeGreaterThanOrEqual(1);
    }
    for (let first = 0; first < plan.buildings.length; first++) {
      for (let second = first + 1; second < plan.buildings.length; second++) {
        expect(overlap(plan.buildings[first], plan.buildings[second])).toBe(false);
      }
    }
  });

  it('builds nothing on a park', () => {
    for (const park of plan.blocks.filter((block) => block.park)) {
      for (const building of plan.buildings) {
        const centreX = building.x + building.width / 2,
          centreY = building.y + building.depth / 2;
        const inPark = centreX > park.x && centreX < park.x + park.width && centreY > park.y && centreY < park.y + park.depth;
        expect(inPark).toBe(false);
      }
    }
  });

  it('gives pitched roofs only to low buildings', () => {
    for (const building of plan.buildings.filter((candidate) => candidate.roof !== 'flat')) {
      // perimeter blocks may be one storey higher than the limit
      expect(building.floors).toBeLessThanOrEqual(options.pitchedFloors + 2);
    }
  });
});

describe('terrainGround', () => {
  it('sinks the terrain under the city below every street and terrace', () => {
    const grid = testGrid({ width: 120, depth: 90, height: 10 });
    const options = { ...CITY_DEFAULTS, width: 90, depth: 60, block: 24, street: 8, seed: 2 };
    const { blocks } = planCity(options, 5, 3);
    const offset: [number, number] = [15, 15];
    const { grid: levelled, ground } = terrainGround(grid, blocks, offset, options.width, options.depth, 0.7, 0.15);
    expect(ground.streets.length).toBeGreaterThan(0);
    // inside the city, every grid point lies at least the sinking (0.4 m) below the surface above it
    const cellX = grid.width / grid.columns,
      cellY = grid.depth / grid.rows;
    for (let row = 0; row <= grid.rows; row++) {
      for (let column = 0; column <= grid.columns; column++) {
        const x = column * cellX - offset[0],
          y = row * cellY - offset[1];
        if (x < 0 || y < 0 || x > options.width || y > options.depth) {
          continue;
        }
        const block = blocks.findIndex(
          (candidate) => x >= candidate.x && x <= candidate.x + candidate.width && y >= candidate.y && y <= candidate.y + candidate.depth,
        );
        const surface = block >= 0 ? ground.terrace(block) : ground.streetAt(x, y);
        expect(sampleGrid(levelled, x + offset[0], y + offset[1]).height).toBeLessThanOrEqual(surface - 0.4 + 1e-6);
      }
    }
    // a block's walls reach below the streets around it
    blocks.forEach((block, index) => {
      expect(ground.footing(index)).toBeLessThan(ground.streetAt(block.x, block.y));
      expect(ground.footing(index)).toBeLessThan(ground.terrace(index));
    });
  });
});

describe('planVillages', () => {
  const grid = testGrid({ width: 300, depth: 220, detail: 120, height: 14, scale: 130 });
  const options = { ...VILLAGE_DEFAULTS, count: 4, houses: 12, seed: 4 };
  const villages = planVillages(grid, options, () => false, 4, 3);

  it('is the same for the same seed', () => {
    expect(planVillages(grid, options, () => false, 4, 3)).toEqual(villages);
  });

  it('finds the villages and gives them houses that keep apart', () => {
    expect(villages.length).toBe(4);
    for (const village of villages) {
      expect(village.houses.length).toBeGreaterThan(3);
      expect(village.streets.every((street) => street.length >= 3)).toBe(true);
      const { houses } = village;
      for (let first = 0; first < houses.length; first++) {
        for (let second = first + 1; second < houses.length; second++) {
          const distance = Math.hypot(houses[first].x - houses[second].x, houses[first].y - houses[second].y);
          const reaches =
            (Math.hypot(houses[first].width, houses[first].depth) + Math.hypot(houses[second].width, houses[second].depth)) / 2;
          expect(distance).toBeGreaterThanOrEqual(reaches * 0.8 - 1e-6);
        }
      }
    }
  });

  it('keeps out of blocked ground', () => {
    const blocked = (x: number) => x < 150;
    for (const village of planVillages(grid, options, blocked, 4, 3)) {
      expect(village.centre[0]).toBeGreaterThanOrEqual(150);
    }
  });
});

describe('villageLinks', () => {
  it('connects every village with one road fewer than there are villages', () => {
    const grid = testGrid({ width: 300, depth: 220, detail: 120, height: 14, scale: 130 });
    const villages = planVillages(grid, { ...VILLAGE_DEFAULTS, count: 4, seed: 4 }, () => false, 4, 3);
    const links = villageLinks(villages);
    expect(links).toHaveLength(villages.length - 1);
    const reached = new Set([0]);
    for (let round = 0; round < links.length; round++) {
      for (const [from, to] of links) {
        if (reached.has(from)) {
          reached.add(to);
        }
        if (reached.has(to)) {
          reached.add(from);
        }
      }
    }
    expect(reached.size).toBe(villages.length);
  });
});

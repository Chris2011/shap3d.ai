import { describe, expect, it } from 'vitest';
import { erode, gridFrom, gridIndex, gridMesh, gridRange, makeGrid, normaliseSettings, sampleGrid } from '../src';
import { expectValidMesh, testGrid } from './helpers';

describe('makeGrid', () => {
  it('has one height per grid point and is the same for the same settings', () => {
    const grid = testGrid();
    expect(grid.heights).toHaveLength((grid.columns + 1) * (grid.rows + 1));
    expect(testGrid().heights).toEqual(grid.heights);
    expect(testGrid({ seed: 4 }).heights).not.toEqual(grid.heights);
  });

  it('keeps at most 120 cells along each side', () => {
    const grid = makeGrid(normaliseSettings({ width: 1000, depth: 900, detail: 500 }));
    expect(grid.columns).toBeLessThanOrEqual(120);
    expect(grid.rows).toBeLessThanOrEqual(120);
  });
});

describe('gridFrom', () => {
  it('takes a grid of the terrain plugin and refuses a broken one', () => {
    const grid = testGrid();
    expect(gridFrom(JSON.parse(JSON.stringify(grid)))).toEqual(grid);
    expect(gridFrom({ ...grid, heights: grid.heights.slice(1) })).toBeUndefined();
    expect(gridFrom(undefined)).toBeUndefined();
  });
});

describe('sampleGrid', () => {
  it('gives the stored height on a grid point', () => {
    const grid = testGrid();
    const cellX = grid.width / grid.columns,
      cellY = grid.depth / grid.rows;
    for (const [column, row] of [
      [0, 0],
      [10, 7],
      [grid.columns, grid.rows],
    ]) {
      expect(sampleGrid(grid, column * cellX, row * cellY).height).toBeCloseTo(grid.heights[gridIndex(grid, column, row)], 6);
    }
  });
});

describe('gridMesh', () => {
  it('makes two triangles per cell, plus walls, floor and water', () => {
    const grid = testGrid();
    expect(gridMesh(grid).faces).toHaveLength(grid.columns * grid.rows * 2);
    const closed = gridMesh({ ...grid, skirt: true, water: 1 });
    expect(closed.faces).toHaveLength(grid.columns * grid.rows * 2 + 4 + 1 + 1);
    expectValidMesh(closed);
  });
});

describe('erode', () => {
  it('changes the heights, the same way for the same seed, within the old range', () => {
    const grid = testGrid({ height: 14 });
    const eroded = erode(grid, { amount: 1, strength: 0.6, seed: 2 });
    expect(eroded.heights).toHaveLength(grid.heights.length);
    expect(eroded.heights).not.toEqual(grid.heights);
    expect(erode(grid, { amount: 1, strength: 0.6, seed: 2 }).heights).toEqual(eroded.heights);
    const before = gridRange(grid),
      after = gridRange(eroded);
    expect(after.low).toBeGreaterThanOrEqual(before.low - 1);
    expect(after.high).toBeLessThanOrEqual(before.high + 0.5);
  });
});

import { randomGenerator } from './noise';
import type { TerrainGrid } from './terrain';

/**
 * Hydraulic erosion on a height grid: raindrops run downhill, pick up earth where they speed up and drop it
 * where they slow down – gullies form on the slopes, valleys fill with sediment. After it a thermal pass lets
 * slopes steeper than the angle of repose slide down a little. The same seed always erodes the same way.
 */

export interface ErosionOptions {
  /** 0 … 3: raindrops per grid point */
  amount: number;
  /** 0 … 1: how much earth a drop can carry and dig */
  strength: number;
  seed: number;
}

export const EROSION_DEFAULTS: ErosionOptions = { amount: 1, strength: 0.5, seed: 1 };

const LIFETIME = 40;
const INERTIA = 0.06;
const EVAPORATION = 0.02;
const DEPOSITION = 0.3;
const GRAVITY = 4;
const MIN_SLOPE = 0.01;

/** the grid eroded – a new grid; the one given stays as it is (it may be a terrain's stored data) */
export const erode = (grid: TerrainGrid, options: ErosionOptions) => {
  const columns = grid.columns,
    rows = grid.rows;
  const heights = [...grid.heights];
  const cellX = grid.width / columns,
    cellY = grid.depth / rows;
  const cell = (cellX + cellY) / 2;
  const random = randomGenerator(options.seed + 0.37);
  const gridIndex = (_grid: TerrainGrid, column: number, row: number) => row * (columns + 1) + column;
  const strength = Math.min(1, Math.max(0, options.strength));
  const capacityFactor = 2 + strength * 6;
  const erosionRate = 0.1 + strength * 0.4;
  const drops = Math.round(Math.max(0, options.amount) * (columns + 1) * (rows + 1));

  /** height and slope (per grid step) at a point in grid units */
  const sample = (x: number, y: number) => {
    const column = Math.min(columns - 1, Math.floor(x)),
      row = Math.min(rows - 1, Math.floor(y));
    const u = x - column,
      v = y - row;
    const h00 = heights[gridIndex(grid, column, row)],
      h10 = heights[gridIndex(grid, column + 1, row)],
      h01 = heights[gridIndex(grid, column, row + 1)],
      h11 = heights[gridIndex(grid, column + 1, row + 1)];
    return {
      height: h00 * (1 - u) * (1 - v) + h10 * u * (1 - v) + h01 * (1 - u) * v + h11 * u * v,
      gradientX: (h10 - h00) * (1 - v) + (h11 - h01) * v,
      gradientY: (h01 - h00) * (1 - u) + (h11 - h10) * u,
    };
  };
  /** adds (or with a negative amount removes) earth at a point, shared out to the four grid points round it */
  const change = (x: number, y: number, amount: number) => {
    const column = Math.min(columns - 1, Math.floor(x)),
      row = Math.min(rows - 1, Math.floor(y));
    const u = x - column,
      v = y - row;
    heights[gridIndex(grid, column, row)] += amount * (1 - u) * (1 - v);
    heights[gridIndex(grid, column + 1, row)] += amount * u * (1 - v);
    heights[gridIndex(grid, column, row + 1)] += amount * (1 - u) * v;
    heights[gridIndex(grid, column + 1, row + 1)] += amount * u * v;
  };

  for (let drop = 0; drop < drops; drop++) {
    let x = random() * columns,
      y = random() * rows;
    let directionX = 0,
      directionY = 0,
      speed = 1,
      water = 1,
      sediment = 0;
    for (let step = 0; step < LIFETIME; step++) {
      const here = sample(x, y);
      // downhill, with a little of the old heading
      directionX = directionX * INERTIA - here.gradientX * (1 - INERTIA);
      directionY = directionY * INERTIA - here.gradientY * (1 - INERTIA);
      const length = Math.hypot(directionX, directionY);
      if (length < 1e-9) {
        break;
      }
      directionX /= length;
      directionY /= length;
      const nextX = x + directionX,
        nextY = y + directionY;
      if (nextX < 0 || nextY < 0 || nextX >= columns || nextY >= rows) {
        break;
      }
      const fall = sample(nextX, nextY).height - here.height;
      // what the drop can carry grows with its speed, its water and how steep it runs (in metres per cell)
      const capacity = Math.max((-fall / cell) * speed * water * capacityFactor, MIN_SLOPE) * cell * 0.1;
      if (sediment > capacity || fall > 0) {
        // uphill or full: drop earth (uphill at most enough to fill the hole)
        const amount = fall > 0 ? Math.min(fall, sediment) : (sediment - capacity) * DEPOSITION;
        sediment -= amount;
        change(x, y, amount);
      } else {
        const amount = Math.min((capacity - sediment) * erosionRate, -fall);
        sediment += amount;
        change(x, y, -amount);
      }
      speed = Math.sqrt(Math.max(0, speed * speed + (-fall / cell) * GRAVITY));
      water *= 1 - EVAPORATION;
      x = nextX;
      y = nextY;
    }
  }

  // thermal: slopes steeper than ~40° shed a little to their lower neighbours
  const talus = Math.tan((40 * Math.PI) / 180) * cell;
  for (let pass = 0; pass < 3; pass++) {
    for (let row = 1; row < rows; row++) {
      for (let column = 1; column < columns; column++) {
        const index = gridIndex(grid, column, row);
        for (const [neighbourColumn, neighbourRow] of [
          [column + 1, row],
          [column, row + 1],
        ]) {
          const neighbour = gridIndex(grid, neighbourColumn, neighbourRow);
          const difference = heights[index] - heights[neighbour];
          if (Math.abs(difference) > talus) {
            const move = (Math.abs(difference) - talus) * 0.25 * Math.sign(difference);
            heights[index] -= move;
            heights[neighbour] += move;
          }
        }
      }
    }
  }
  for (let index = 0; index < heights.length; index++) {
    heights[index] = Math.round(heights[index] * 1000) / 1000;
  }
  return { ...grid, heights };
};

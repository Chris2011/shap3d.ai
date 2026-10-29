import type { Block } from './city';
import { sampleGrid, type TerrainGrid } from './terrain';

type Point3 = [number, number, number];

/**
 * The ground a city stands on. Flat, it is the plane z = 0. On a terrain the city's area is smoothed (its slopes
 * eased by `flatten`, fading out beyond the city), every block becomes a level terrace at the mean height of its
 * ground and the streets follow the smoothed ground between them. Retaining walls take up the difference: a
 * block's own walls where it stands above the street, walls inside the block where the street runs above it.
 * The terrain itself sinks a little under the whole city, so it never shows through. Coordinates are the city's
 * (origin = its corner); `offset` places the city on the terrain grid.
 */
export interface CityGround {
  /** the height of a block's terrace (its pavement lies a kerb above) */
  terrace: (block: number) => number;
  /** how deep a block's walls reach – below the lowest street around it */
  footing: (block: number) => number;
  /** the street's height at a spot */
  streetAt: (x: number, y: number) => number;
  /** the street surface as triangles – empty on flat ground, where one rectangle does */
  streets: Point3[][];
  /** retaining walls (and the city's edge) as faces */
  walls: Point3[][];
}

export const FLAT_GROUND: CityGround = { terrace: () => 0, footing: () => 0, streetAt: () => 0, streets: [], walls: [] };

/** how far the terrain sinks below the city's surfaces (m) */
const SUNK = 0.4;

/** a box blur over the grid's heights (`reach` grid points each way), done twice for a softer result */
const blurred = (grid: TerrainGrid, reach: number) => {
  const columns = grid.columns + 1,
    rows = grid.rows + 1;
  let heights = [...grid.heights];
  for (let round = 0; round < 2; round++) {
    const along = heights.map((_, index) => {
      const column = index % columns,
        row = Math.floor(index / columns);
      let sum = 0,
        count = 0;
      for (let at = Math.max(0, column - reach); at <= Math.min(columns - 1, column + reach); at++) {
        sum += heights[row * columns + at];
        count++;
      }
      return sum / count;
    });
    heights = along.map((_, index) => {
      const column = index % columns,
        row = Math.floor(index / columns);
      let sum = 0,
        count = 0;
      for (let at = Math.max(0, row - reach); at <= Math.min(rows - 1, row + reach); at++) {
        sum += along[at * columns + column];
        count++;
      }
      return sum / count;
    });
  }
  return heights;
};

/** the coordinates from 0 to `length` that every edge in `edges` lies on, with no gap wider than `step` */
const stations = (length: number, edges: number[], step: number) => {
  const fixed = [...new Set([0, length, ...edges.filter((edge) => edge > 0 && edge < length)])].sort((a, b) => a - b);
  const result: number[] = [];
  for (let index = 0; index < fixed.length - 1; index++) {
    const from = fixed[index],
      to = fixed[index + 1];
    const parts = Math.max(1, Math.ceil((to - from) / step));
    for (let part = 0; part < parts; part++) {
      result.push(from + ((to - from) * part) / parts);
    }
  }
  result.push(length);
  return result;
};

/**
 * Levels a terrain for a city of `width` × `depth` at `offset` on its grid. Returns the changed grid (to store on
 * the terrain) and the city's ground.
 */
export const terrainGround = (
  grid: TerrainGrid,
  blocks: Block[],
  offset: [number, number],
  width: number,
  depth: number,
  flatten: number,
  kerb: number,
): { grid: TerrainGrid; ground: CityGround } => {
  const cellX = grid.width / grid.columns,
    cellY = grid.depth / grid.rows;
  const [offsetX, offsetY] = offset;
  const positionOf = (index: number): [number, number] => [
    (index % (grid.columns + 1)) * cellX - offsetX,
    Math.floor(index / (grid.columns + 1)) * cellY - offsetY,
  ];

  // slopes eased under the city, fading out over a few blocks' width around it
  const fade = Math.max(10, Math.min(width, depth) * 0.15);
  const soft = blurred(grid, Math.max(1, Math.round(12 / Math.min(cellX, cellY))));
  const heights = grid.heights.map((height, index) => {
    const [x, y] = positionOf(index);
    const outside = Math.hypot(Math.max(0, -x, x - width), Math.max(0, -y, y - depth));
    const unit = Math.min(1, outside / fade);
    return height + flatten * (1 - unit * unit * (3 - 2 * unit)) * (soft[index] - height);
  });
  const smooth = { ...grid, heights };
  const streetAt = (x: number, y: number) => sampleGrid(smooth, x + offsetX, y + offsetY).height;

  // every block a terrace at the mean height of the ground under it
  const blockOf = (x: number, y: number) =>
    blocks.findIndex((block) => x >= block.x && x <= block.x + block.width && y >= block.y && y <= block.y + block.depth);
  const owner = heights.map((_, index) => blockOf(...positionOf(index)));
  const sums = blocks.map(() => ({ sum: 0, count: 0 }));
  owner.forEach((block, index) => {
    if (block >= 0) {
      sums[block].sum += heights[index];
      sums[block].count++;
    }
  });
  const terraces = blocks.map((block, index) =>
    sums[index].count ? sums[index].sum / sums[index].count : streetAt(block.x + block.width / 2, block.y + block.depth / 2),
  );

  // the terrain sinks under the city: below the lowest surface around each grid point
  const columns = grid.columns + 1;
  const surfaceOf = heights.map((height, index) => (owner[index] >= 0 ? Math.min(height, terraces[owner[index]]) : height));
  const finalHeights = heights.map((height, index) => {
    const [x, y] = positionOf(index);
    if (x < -cellX || x > width + cellX || y < -cellY || y > depth + cellY) {
      return Math.round(height * 1000) / 1000;
    }
    const column = index % columns,
      row = Math.floor(index / columns);
    let lowest = surfaceOf[index];
    for (let stepY = -1; stepY <= 1; stepY++) {
      for (let stepX = -1; stepX <= 1; stepX++) {
        const nextColumn = column + stepX,
          nextRow = row + stepY;
        if (nextColumn >= 0 && nextColumn < columns && nextRow >= 0 && nextRow <= grid.rows) {
          lowest = Math.min(lowest, surfaceOf[nextRow * columns + nextColumn]);
        }
      }
    }
    // rounded down, so the rounding never lifts it closer to the surface
    return Math.floor((lowest - SUNK) * 1000) / 1000;
  });

  // the street surface: a mesh whose lines run along every block edge, so it ends exactly at the blocks
  const step = Math.max(1, Math.min(cellX, cellY));
  const xs = stations(
    width,
    blocks.flatMap((block) => [block.x, block.x + block.width]),
    step,
  );
  const ys = stations(
    depth,
    blocks.flatMap((block) => [block.y, block.y + block.depth]),
    step,
  );
  const point = (x: number, y: number): Point3 => [x, y, streetAt(x, y)];
  const streets: Point3[][] = [];
  for (let row = 0; row < ys.length - 1; row++) {
    for (let column = 0; column < xs.length - 1; column++) {
      const [x0, x1, y0, y1] = [xs[column], xs[column + 1], ys[row], ys[row + 1]];
      if (blockOf((x0 + x1) / 2, (y0 + y1) / 2) >= 0) {
        continue;
      }
      streets.push([point(x0, y0), point(x1, y0), point(x1, y1)], [point(x0, y0), point(x1, y1), point(x0, y1)]);
    }
  }

  // walls along a line from a to b (counter-clockwise round what they hold): `inward` faces the block's side
  const walls: Point3[][] = [];
  const along = (from: [number, number], to: [number, number]) => {
    const vertical = from[0] === to[0];
    const fixed = vertical ? from[0] : from[1];
    const low = Math.min(vertical ? from[1] : from[0], vertical ? to[1] : to[0]),
      high = Math.max(vertical ? from[1] : from[0], vertical ? to[1] : to[0]);
    const cuts = (vertical ? ys : xs).filter((at) => at >= low - 1e-6 && at <= high + 1e-6);
    const forward = vertical ? to[1] > from[1] : to[0] > from[0];
    const ordered = forward ? cuts : [...cuts].reverse();
    return ordered.map((at): [number, number] => (vertical ? [fixed, at] : [at, fixed]));
  };
  const footings = blocks.map((block, index) => {
    const x0 = block.x,
      y0 = block.y,
      x1 = block.x + block.width,
      y1 = block.y + block.depth;
    const top = terraces[index] + kerb;
    let lowest = terraces[index];
    // round the block counter-clockwise; where the street runs above the pavement a wall holds it, facing in
    for (const [from, to] of [
      [
        [x0, y0],
        [x1, y0],
      ],
      [
        [x1, y0],
        [x1, y1],
      ],
      [
        [x1, y1],
        [x0, y1],
      ],
      [
        [x0, y1],
        [x0, y0],
      ],
    ] as [[number, number], [number, number]][]) {
      const points = along(from, to);
      for (let at = 0; at < points.length - 1; at++) {
        const [ax, ay] = points[at],
          [bx, by] = points[at + 1];
        const streetA = streetAt(ax, ay),
          streetB = streetAt(bx, by);
        lowest = Math.min(lowest, streetA, streetB);
        if (streetA > top + 0.02 || streetB > top + 0.02) {
          walls.push([
            [bx, by, top],
            [ax, ay, top],
            [ax, ay, Math.max(top, streetA)],
            [bx, by, Math.max(top, streetB)],
          ]);
        }
      }
    }
    return lowest - 0.5;
  });

  // the city's edge where a street ends there: a wall down into the sunk terrain, facing out
  for (const [from, to] of [
    [
      [0, 0],
      [width, 0],
    ],
    [
      [width, 0],
      [width, depth],
    ],
    [
      [width, depth],
      [0, depth],
    ],
    [
      [0, depth],
      [0, 0],
    ],
  ] as [[number, number], [number, number]][]) {
    const points = along(from, to);
    for (let at = 0; at < points.length - 1; at++) {
      const [ax, ay] = points[at],
        [bx, by] = points[at + 1];
      if (blockOf((ax + bx) / 2, (ay + by) / 2) >= 0) {
        continue;
      }
      const streetA = streetAt(ax, ay),
        streetB = streetAt(bx, by);
      walls.push([
        [ax, ay, Math.min(streetA, streetB) - SUNK - 1],
        [bx, by, Math.min(streetA, streetB) - SUNK - 1],
        [bx, by, streetB],
        [ax, ay, streetA],
      ]);
    }
  }

  return {
    grid: { ...grid, heights: finalHeights },
    ground: { terrace: (block) => terraces[block], footing: (block) => footings[block], streetAt, streets, walls },
  };
};

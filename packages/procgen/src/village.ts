import { fractal, randomGenerator } from './noise';
import { lineLength, type Point2 } from './routes';
import { gridRange, sampleGrid, type TerrainGrid } from './terrain';

/**
 * Villages on a terrain: sites where the ground is gentle (spread apart, away from water and from what is built
 * already), a main street along the slope's contour through each with side streets up and down it, and houses
 * beside the streets – turned to face them, with gable or hip roofs. Plain data in the grid's coordinates; the
 * actions dig the streets, connect the villages by roads and build the houses on plinths.
 */

export interface VillageOptions {
  /** how many villages */
  count: number;
  /** houses per village (on average – each varies a little) */
  houses: number;
  /** width of the village streets and the roads between the villages (m) */
  roadWidth: number;
  /** steepest ground a village is put on (degrees) */
  maxSlope: number;
  seed: number;
}

export const VILLAGE_DEFAULTS: VillageOptions = { count: 4, houses: 14, roadWidth: 3.5, maxSlope: 14, seed: 1 };

export interface House {
  x: number;
  y: number;
  /** the direction its long side runs (radians) – along the street */
  angle: number;
  width: number;
  depth: number;
  floors: number;
  roof: 'gable' | 'hip';
  style: number;
  roofStyle: number;
}

export interface Village {
  centre: Point2;
  /** how far the village reaches (m) */
  radius: number;
  /** its streets: first the main street through the centre, then the side streets from the centre outwards */
  streets: Point2[][];
  houses: House[];
}

/** the point `along` metres along a polyline and the direction it runs there (radians) */
const pointOn = (line: Point2[], along: number): [number, number, number] => {
  let rest = along;
  for (let index = 1; index < line.length; index++) {
    const [ax, ay] = line[index - 1],
      [bx, by] = line[index];
    const length = Math.hypot(bx - ax, by - ay);
    if (rest <= length || index === line.length - 1) {
      const unit = Math.min(1, rest / (length || 1));
      return [ax + (bx - ax) * unit, ay + (by - ay) * unit, Math.atan2(by - ay, bx - ax)];
    }
    rest -= length;
  }
  return [line[0][0], line[0][1], 0];
};

/** distance from a point to a polyline */
const distanceToLine = (line: Point2[], x: number, y: number) => {
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

/**
 * Plans the villages. `blocked` tells spots that are taken already (cities, rivers, roads); `styles` and
 * `roofStyles` how many facade and roof materials there are to choose from.
 */
export const planVillages = (
  grid: TerrainGrid,
  options: VillageOptions,
  blocked: (x: number, y: number, margin: number) => boolean,
  styles: number,
  roofStyles: number,
): Village[] => {
  const random = randomGenerator(options.seed + 0.125);
  const radius = Math.max(14, 6 * Math.sqrt(Math.max(2, options.houses)));
  const margin = radius + 4;
  const wet = (height: number) => grid.water != null && height < grid.water + 0.5;
  const inside = (x: number, y: number, edge = 3) => x > edge && y > edge && x < grid.width - edge && y < grid.depth - edge;

  // candidate sites: gentle, dry, free ground, a little jittered so the seed decides between equals; where the
  // terrain has too few gentle places, a little steeper ground is allowed (up to twice the limit)
  let candidates: { x: number; y: number; score: number }[] = [];
  const { low, high } = gridRange(grid);
  const step = Math.max(radius * 0.5, 4);
  for (const steeper of [1, 1.4, 2]) {
    candidates = [];
    const limit = options.maxSlope * steeper;
    for (let y = margin; y <= grid.depth - margin; y += step) {
      for (let x = margin; x <= grid.width - margin; x += step) {
        const ring: Point2[] = [[x, y]];
        for (let around = 0; around < 8; around++) {
          const angle = (around / 8) * Math.PI * 2;
          ring.push([x + Math.cos(angle) * radius * 0.7, y + Math.sin(angle) * radius * 0.7]);
        }
        const samples = ring.map(([sampleX, sampleY]) => sampleGrid(grid, sampleX, sampleY));
        const slope = samples.reduce((sum, sample) => sum + sample.slope, 0) / samples.length;
        const heights = samples.map((sample) => sample.height);
        const spread = Math.max(...heights) - Math.min(...heights);
        if (slope > limit || samples.some((sample) => wet(sample.height)) || blocked(x, y, radius)) {
          continue;
        }
        // a little preference for the middle heights: neither the valley floor nor the summits
        const middle = Math.abs((samples[0].height - low) / Math.max(0.01, high - low) - 0.4);
        candidates.push({ x, y, score: -slope - spread * 0.8 - middle * 6 + random() * 4 });
      }
    }
    if (candidates.length >= options.count * 3) {
      break;
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const apart = Math.max(radius * 2.6, Math.hypot(grid.width, grid.depth) / (options.count + 2));
  const sites: Point2[] = [];
  for (const candidate of candidates) {
    if (sites.length >= options.count) {
      break;
    }
    if (sites.every(([x, y]) => Math.hypot(x - candidate.x, y - candidate.y) >= apart)) {
      sites.push([candidate.x, candidate.y]);
    }
  }

  return sites.map(([centreX, centreY], villageIndex) => {
    // the main street runs along the contour, side streets up and down the slope
    const gradientX = sampleGrid(grid, centreX + 1, centreY).height - sampleGrid(grid, centreX - 1, centreY).height,
      gradientY = sampleGrid(grid, centreX, centreY + 1).height - sampleGrid(grid, centreX, centreY - 1).height;
    const contour = Math.hypot(gradientX, gradientY) > 0.01 ? Math.atan2(gradientX, -gradientY) : random() * Math.PI;
    const target = Math.max(3, Math.round(options.houses * (0.75 + random() * 0.5)));
    const headings = [contour, contour + Math.PI];
    if (target > 8) {
      headings.push(contour + Math.PI / 2 + (random() - 0.5) * 0.5);
    }
    if (target > 16) {
      headings.push(contour - Math.PI / 2 + (random() - 0.5) * 0.5);
    }
    const streets = headings.map((heading, armIndex) => {
      const length = radius * (armIndex < 2 ? 1.4 : 1) * (0.8 + random() * 0.4);
      const line: Point2[] = [[centreX, centreY]];
      let direction = heading;
      for (let along = 6; along <= length; along += 6) {
        const [lastX, lastY] = line[line.length - 1];
        // a street wanders a little, as old village streets do
        direction += fractal(lastX / 40, lastY / 40, undefined, { seed: options.seed + villageIndex * 7 + armIndex, octaves: 2 }) * 0.35;
        const next: Point2 = [lastX + Math.cos(direction) * 6, lastY + Math.sin(direction) * 6];
        if (!inside(next[0], next[1], 4) || wet(sampleGrid(grid, next[0], next[1]).height)) {
          break;
        }
        line.push(next);
      }
      return line;
    });
    const arms = streets.filter((line) => line.length >= 3);
    // the main street runs through the centre in one piece, the side streets branch off it there
    const [forward, backward, ...branches] = streets;
    const usable = [[...forward].reverse().concat(backward.slice(1)), ...branches].filter((line) => line.length >= 3);

    // houses beside the streets, both sides, turned along them – a row along each side, a second row behind it
    // where the first did not take them all; from the centre outwards along each arm, so no arm stays empty
    const houses: House[] = [];
    const half = options.roadWidth / 2;
    const tryHouse = (x: number, y: number, angle: number, width: number, depth: number) => {
      const reach = Math.hypot(width, depth) / 2;
      const sample = sampleGrid(grid, x, y);
      if (
        !inside(x, y, reach + 1) ||
        sample.slope > 26 ||
        wet(sample.height) ||
        blocked(x, y, reach) ||
        usable.some((other) => distanceToLine(other, x, y) < half + depth / 2 + 0.8) ||
        houses.some((house) => Math.hypot(house.x - x, house.y - y) < (reach + Math.hypot(house.width, house.depth) / 2) * 0.8)
      ) {
        return false;
      }
      houses.push({
        x,
        y,
        angle,
        width,
        depth,
        floors: random() < 0.25 ? 1 : random() < 0.85 ? 2 : 3,
        roof: random() < 0.75 ? 'gable' : 'hip',
        style: Math.floor(random() * styles),
        roofStyle: Math.floor(random() * roofStyles),
      });
      return true;
    };
    for (const row of [0, 1]) {
      for (const line of arms) {
        const length = lineLength(line);
        for (const side of [1, -1]) {
          // each side walks along the street, a house as wide as it is and a gap after it
          for (let along = 5 + random() * 3; along < length - 3 && houses.length < target;) {
            const width = 7 + random() * 4,
              depth = 6 + random() * 3;
            const [x, y, angle] = pointOn(line, along + width / 2);
            const away = half + 1.5 + depth / 2 + random() * 1.5 + row * (depth + 3);
            if (random() > 0.15) {
              tryHouse(x - Math.sin(angle) * away * side, y + Math.cos(angle) * away * side, angle, width, depth);
            }
            along += width + 2 + random() * 3;
          }
        }
      }
      if (houses.length >= target) {
        break;
      }
    }
    return { centre: [centreX, centreY] as Point2, radius, streets: usable, houses };
  });
};

/** which villages to connect by roads: a minimum spanning tree (every village reached, the shortest roads in all) */
export const villageLinks = (villages: Village[]): [number, number][] => {
  const links: [number, number][] = [];
  const reached = new Set<number>(villages.length ? [0] : []);
  while (reached.size < villages.length) {
    let best: [number, number] | null = null,
      shortest = Infinity;
    for (const from of reached) {
      for (let to = 0; to < villages.length; to++) {
        if (reached.has(to)) {
          continue;
        }
        const distance = Math.hypot(villages[from].centre[0] - villages[to].centre[0], villages[from].centre[1] - villages[to].centre[1]);
        if (distance < shortest) {
          shortest = distance;
          best = [from, to];
        }
      }
    }
    links.push(best!);
    reached.add(best![1]);
  }
  return links;
};

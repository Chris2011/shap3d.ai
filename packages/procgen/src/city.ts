import { fractal, randomGenerator } from './noise';

/**
 * Cities: a grid of streets, blocks split into plots, a building on each plot whose height follows a density map
 * of noise (high in the centre and where the noise is high, low at the edges). Some blocks become perimeter blocks
 * round a courtyard, some parks; low houses get gable or hip roofs, the pavements street trees and the streets
 * markings. Plain data here – the actions build it with the mesh builder and give the facades the facade shader.
 */

export interface CityOptions {
  width: number;
  depth: number;
  /** block size between the streets (m) */
  block: number;
  street: number;
  /** largest plot side (m) – blocks are split until their plots are smaller */
  plot: number;
  /** gap between neighbouring buildings and to the street (m) */
  gap: number;
  minFloors: number;
  maxFloors: number;
  floorHeight: number;
  /** metres per feature of the density map */
  scale: number;
  /** 0 … 1: how much higher the centre is than the edges */
  centre: number;
  /** 0 … 1: share of plots left empty (yards, squares) */
  empty: number;
  /** pavement between the street and the buildings (m) */
  sidewalk: number;
  /** 0 … 1: share of low buildings with a gable or hip roof */
  roofs: number;
  /** buildings up to this many floors may get a pitched roof */
  pitchedFloors: number;
  /** 0 … 1: share of blocks built as one perimeter block round a courtyard (where the city is not too tall) */
  courts: number;
  /** 0 … 1: share of blocks turned into parks (more often where the city is low) */
  parks: number;
  /** distance between street trees (m, 0 = none) */
  treeSpacing: number;
  /** centre lines and zebra crossings on the streets */
  markings: boolean;
  seed: number;
}

export const CITY_DEFAULTS: CityOptions = {
  width: 160,
  depth: 120,
  block: 36,
  street: 10,
  plot: 16,
  gap: 1.5,
  minFloors: 2,
  maxFloors: 18,
  floorHeight: 3.2,
  scale: 70,
  centre: 0.7,
  empty: 0.08,
  sidewalk: 3,
  roofs: 0.7,
  pitchedFloors: 5,
  courts: 0.3,
  parks: 0.08,
  treeSpacing: 12,
  markings: true,
  seed: 1,
};

export type RoofKind = 'flat' | 'gable' | 'hip';

export interface Building {
  /** footprint corner and size (m, from the city's corner) */
  x: number;
  y: number;
  width: number;
  depth: number;
  floors: number;
  /** floors from which the building steps back (0 = none) */
  setback: number;
  /** a small box on the roof (stairs, machinery) */
  roofBox: boolean;
  /** which facade style – an index into the city's facade materials */
  style: number;
  roof: RoofKind;
  /** the ridge of a pitched roof runs along x (otherwise along y) */
  ridgeAlongX: boolean;
  /** which roof material – an index into the city's roof materials */
  roofStyle: number;
}

export interface Block {
  x: number;
  y: number;
  width: number;
  depth: number;
  park?: boolean;
}

export interface CityTree {
  x: number;
  y: number;
  /** street trees stand in rows, park trees anywhere on the lawn */
  kind: 'street' | 'park';
  size: number;
  rotation: number;
}

/** a flat rectangle (x0, y0, x1, y1) – road markings */
export type Rect = [number, number, number, number];

/** the width of a perimeter block's wings (m) */
const WING = 10;
/** a hair's breadth between touching buildings, so their walls do not flicker */
const TOUCH = 0.05;

/**
 * The middle lines of a city's streets – the same grid as `planCity` lays its blocks on: between the columns from the
 * city's front edge to its back, between the rows from side to side. Each runs from edge to edge, so a road built
 * later can go on from a street's end or cross it (city coordinates, metres).
 */
export const cityStreetLines = (options: Pick<CityOptions, 'width' | 'depth' | 'block' | 'street'>): [number, number][][] => {
  const pitch = options.block + options.street;
  const columns = Math.max(1, Math.floor((options.width + options.street) / pitch)),
    rows = Math.max(1, Math.floor((options.depth + options.street) / pitch));
  const blockWidth = (options.width - (columns - 1) * options.street) / columns,
    blockDepth = (options.depth - (rows - 1) * options.street) / rows;
  const lines: [number, number][][] = [];
  for (let column = 1; column < columns; column++) {
    const x = column * (blockWidth + options.street) - options.street / 2;
    lines.push([
      [x, 0],
      [x, options.depth],
    ]);
  }
  for (let row = 1; row < rows; row++) {
    const y = row * (blockDepth + options.street) - options.street / 2;
    lines.push([
      [0, y],
      [options.width, y],
    ]);
  }
  return lines;
};

/** the streets' blocks, the buildings, parks and trees on them and the road markings */
export const planCity = (options: CityOptions, styles: number, roofStyles = 1) => {
  const random = randomGenerator(options.seed + 0.25);
  const blocks: Block[] = [];
  const pitch = options.block + options.street;
  const columns = Math.max(1, Math.floor((options.width + options.street) / pitch)),
    rows = Math.max(1, Math.floor((options.depth + options.street) / pitch));
  // the blocks share the area evenly; the streets keep their width
  const blockWidth = (options.width - (columns - 1) * options.street) / columns,
    blockDepth = (options.depth - (rows - 1) * options.street) / rows;
  for (let row = 0; row < rows; row++) {
    for (let column = 0; column < columns; column++) {
      blocks.push({
        x: column * (blockWidth + options.street),
        y: row * (blockDepth + options.street),
        width: blockWidth,
        depth: blockDepth,
      });
    }
  }

  /** 0 … 1: how tall the buildings are here */
  const density = (x: number, y: number) => {
    const noise = Math.min(
      1,
      Math.max(0, fractal(x / options.scale, y / options.scale, undefined, { seed: options.seed, octaves: 3 }) * 0.8 + 0.5),
    );
    const edgeX = Math.abs((x / options.width) * 2 - 1),
      edgeY = Math.abs((y / options.depth) * 2 - 1);
    const middle = 1 - Math.min(1, Math.hypot(edgeX, edgeY) / Math.SQRT2);
    return Math.min(1, Math.max(0, noise * (1 - options.centre) + middle * options.centre * (0.6 + noise * 0.8)));
  };
  const span = options.maxFloors - options.minFloors;
  const floorsAt = (x: number, y: number) =>
    Math.max(1, Math.round(options.minFloors + span * Math.pow(density(x, y), 1.6) * (0.75 + random() * 0.5)));
  const roofFor = (floors: number, width: number, depth: number) => {
    const pitched = floors <= options.pitchedFloors && random() < options.roofs;
    return {
      roof: (pitched ? (random() < 0.7 ? 'gable' : 'hip') : 'flat') as RoofKind,
      ridgeAlongX: width >= depth,
      roofStyle: Math.floor(random() * roofStyles),
    };
  };

  const buildings: Building[] = [];
  const trees: CityTree[] = [];
  const sidewalk = Math.max(0, Math.min(options.sidewalk, Math.min(blockWidth, blockDepth) / 2 - 2));
  /** the part of a block inside its pavement */
  const lotOf = (block: Block): Block => ({
    x: block.x + sidewalk,
    y: block.y + sidewalk,
    width: block.width - 2 * sidewalk,
    depth: block.depth - 2 * sidewalk,
  });

  // each block is split in two along its longer side until the plots are small enough
  const plots: Block[] = [];
  const split = (area: Block, depthLevel: number) => {
    const longer = Math.max(area.width, area.depth);
    if (longer <= options.plot || depthLevel > 8) {
      plots.push(area);
      return;
    }
    const share = 0.35 + random() * 0.3;
    if (area.width >= area.depth) {
      const first = area.width * share;
      split({ ...area, width: first }, depthLevel + 1);
      split({ ...area, x: area.x + first, width: area.width - first }, depthLevel + 1);
    } else {
      const first = area.depth * share;
      split({ ...area, depth: first }, depthLevel + 1);
      split({ ...area, y: area.y + first, depth: area.depth - first }, depthLevel + 1);
    }
  };

  /** a ring of houses round a courtyard: four corner houses (hip roofs) and the wings between them in pieces */
  const perimeterBlock = (lot: Block, base: number) => {
    const wing = Math.min(WING, lot.width / 3, lot.depth / 3);
    const pitched = base <= options.pitchedFloors + 1 && random() < options.roofs;
    const roofStyle = Math.floor(random() * roofStyles);
    const house = (x: number, y: number, width: number, depth: number, roof: RoofKind, ridgeAlongX: boolean) => {
      buildings.push({
        x: x + TOUCH,
        y: y + TOUCH,
        width: width - 2 * TOUCH,
        depth: depth - 2 * TOUCH,
        floors: Math.max(1, base + Math.round(random() * 2 - 1)),
        setback: 0,
        roofBox: false,
        style: Math.floor(random() * styles),
        roof: pitched ? roof : 'flat',
        ridgeAlongX,
        roofStyle,
      });
    };
    /** a wing from `from` to `to` along x or y, cut into houses of different lengths */
    const wingHouses = (from: number, to: number, fixed: number, alongX: boolean) => {
      let at = from;
      while (to - at > 1) {
        const length = to - at < options.plot * 1.4 ? to - at : options.plot * (0.5 + random() * 0.4);
        if (alongX) {
          house(at, fixed, length, wing, 'gable', true);
        } else {
          house(fixed, at, wing, length, 'gable', false);
        }
        at += length;
      }
    };
    const right = lot.x + lot.width - wing,
      top = lot.y + lot.depth - wing;
    for (const [x, y] of [
      [lot.x, lot.y],
      [right, lot.y],
      [right, top],
      [lot.x, top],
    ]) {
      house(x, y, wing, wing, 'hip', true);
    }
    wingHouses(lot.x + wing, right, lot.y, true);
    wingHouses(lot.x + wing, right, top, true);
    wingHouses(lot.y + wing, top, lot.x, false);
    wingHouses(lot.y + wing, top, right, false);
  };

  /** trees on a park's lawn – a jittered grid that leaves the cross of paths free */
  const parkTrees = (lot: Block) => {
    const step = 7;
    const middleX = lot.x + lot.width / 2,
      middleY = lot.y + lot.depth / 2;
    for (let y = lot.y + step / 2; y < lot.y + lot.depth - 1; y += step) {
      for (let x = lot.x + step / 2; x < lot.x + lot.width - 1; x += step) {
        const treeX = x + (random() - 0.5) * step * 0.6,
          treeY = y + (random() - 0.5) * step * 0.6;
        if (Math.abs(treeX - middleX) < 3.5 || Math.abs(treeY - middleY) < 3.5 || random() < 0.25) {
          continue;
        }
        trees.push({ x: treeX, y: treeY, kind: 'park', size: 0.7 + random() * 0.5, rotation: random() * 360 });
      }
    }
  };

  for (const block of blocks) {
    const lot = lotOf(block);
    const centreX = block.x + block.width / 2,
      centreY = block.y + block.depth / 2;
    if (random() < options.parks * 2 * (1 - density(centreX, centreY))) {
      block.park = true;
      parkTrees(lot);
      continue;
    }
    const base = floorsAt(centreX, centreY);
    if (random() < options.courts && base <= 8 && Math.min(lot.width, lot.depth) >= 2 * WING + 6) {
      perimeterBlock(lot, base);
      continue;
    }
    split(lot, 0);
  }

  const half = options.gap / 2;
  for (const plot of plots) {
    if (random() < options.empty) {
      continue;
    }
    const width = plot.width - options.gap,
      depth = plot.depth - options.gap;
    if (width < 3 || depth < 3) {
      continue;
    }
    const floors = floorsAt(plot.x + plot.width / 2, plot.y + plot.depth / 2);
    const setback = floors >= 9 && random() < 0.6 ? Math.round(floors * (0.55 + random() * 0.25)) : 0;
    const roof = setback ? { roof: 'flat' as RoofKind, ridgeAlongX: true, roofStyle: 0 } : roofFor(floors, width, depth);
    buildings.push({
      x: plot.x + half,
      y: plot.y + half,
      width,
      depth,
      floors,
      setback,
      roofBox: roof.roof === 'flat' && random() < 0.55,
      style: Math.floor(random() * styles),
      ...roof,
    });
  }

  // street trees in the middle of the pavements, not too near the corners
  if (options.treeSpacing > 0 && sidewalk >= 1.5) {
    const inset = sidewalk / 2;
    const row = (fromX: number, fromY: number, length: number, alongX: boolean) => {
      const count = Math.floor((length - 8) / options.treeSpacing);
      if (count < 0) {
        return;
      }
      const start = (length - count * options.treeSpacing) / 2;
      for (let index = 0; index <= count; index++) {
        const along = start + index * options.treeSpacing;
        trees.push({
          x: alongX ? fromX + along : fromX,
          y: alongX ? fromY : fromY + along,
          kind: 'street',
          size: 0.9 + random() * 0.25,
          rotation: random() * 360,
        });
      }
    };
    for (const block of blocks) {
      row(block.x, block.y + inset, block.width, true);
      row(block.x, block.y + block.depth - inset, block.width, true);
      row(block.x + inset, block.y, block.depth, false);
      row(block.x + block.width - inset, block.y, block.depth, false);
    }
  }

  // dashed centre lines and zebra crossings at both ends of every street between two crossings
  const markings: Rect[] = [];
  if (options.markings && options.street >= 5) {
    const line = 0.075;
    const street = (from: number, to: number, side0: number, side1: number, alongX: boolean) => {
      const rect = (a0: number, b0: number, a1: number, b1: number) => markings.push(alongX ? [a0, b0, a1, b1] : [b0, a0, b1, a1]);
      const middle = (side0 + side1) / 2;
      for (let at = from + 5; at + 3 <= to - 5; at += 6) {
        rect(at, middle - line, at + 3, middle + line);
      }
      for (let across = side0 + 0.75; across + 0.5 <= side1 - 0.75; across += 1) {
        rect(from + 0.5, across, from + 3.5, across + 0.5);
        rect(to - 3.5, across, to - 0.5, across + 0.5);
      }
    };
    for (let column = 0; column < columns - 1; column++) {
      const x0 = (column + 1) * blockWidth + column * options.street;
      for (let row = 0; row < rows; row++) {
        const y0 = row * (blockDepth + options.street);
        street(y0, y0 + blockDepth, x0, x0 + options.street, false);
      }
    }
    for (let row = 0; row < rows - 1; row++) {
      const y0 = (row + 1) * blockDepth + row * options.street;
      for (let column = 0; column < columns; column++) {
        const x0 = column * (blockWidth + options.street);
        street(x0, x0 + blockWidth, y0, y0 + options.street, true);
      }
    }
  }
  return { blocks, buildings, trees, markings, sidewalk };
};

import {
  archBuilder,
  BASEPLATE_STACK,
  baseplateBuilder,
  blockBuilder,
  BRICK_HEIGHT,
  coneBuilder,
  cornerBuilder,
  frameBuilder,
  invertedSlopeBuilder,
  panelBuilder,
  PLATE_HEIGHT,
  roundBuilder,
  slopeBuilder,
  type Builder,
} from './shapes.ts';

/** The bricks the plugin makes itself: they work without a network. Names are built from a kind and a size. */

export const CATEGORIES = ['bricks', 'plates', 'tiles', 'slopes', 'round', 'special', 'baseplates'] as const;
export type Category = (typeof CATEGORIES)[number];

export const KINDS = [
  'brick',
  'plate',
  'tile',
  'baseplate',
  'slope45',
  'slope33',
  'slopeSmall',
  'slopeInverted',
  'roundBrick',
  'roundPlate',
  'cone',
  'cornerBrick',
  'cornerPlate',
  'arch',
  'window',
  'door',
  'panel',
] as const;
export type Kind = (typeof KINDS)[number];

export interface CatalogPart {
  id: string;
  category: Category;
  kind: Kind;
  /** cells along x and y */
  w: number;
  d: number;
  /** from its underside to where the next brick stands */
  height: number;
  /** cells high, when it is more than one brick – for its name */
  bricksHigh?: number;
  build: Builder;
  /** a smaller picture for what would be too many faces to draw */
  preview?: Builder;
}

const part = (
  category: Category,
  kind: Kind,
  w: number,
  d: number,
  height: number,
  build: Builder,
  extra: Partial<CatalogPart> = {},
): CatalogPart => ({
  id: `${kind}-${w}x${d}${extra.bricksHigh ? `x${extra.bricksHigh}` : ''}`,
  category,
  kind,
  w,
  d,
  height,
  build,
  ...extra,
});

const blocks = (category: Category, kind: Kind, height: number, sizes: [number, number][], withStuds = true) =>
  sizes.map(([w, d]) => part(category, kind, w, d, height, blockBuilder(w, d, height, withStuds)));

export const CATALOG: CatalogPart[] = [
  ...blocks('bricks', 'brick', BRICK_HEIGHT, [
    [1, 1],
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 6],
    [1, 8],
    [2, 2],
    [2, 3],
    [2, 4],
    [2, 6],
    [2, 8],
  ]),
  part('bricks', 'brick', 1, 2, 3 * BRICK_HEIGHT, blockBuilder(1, 2, 3 * BRICK_HEIGHT), { bricksHigh: 3 }),
  part('bricks', 'brick', 2, 2, 3 * BRICK_HEIGHT, blockBuilder(2, 2, 3 * BRICK_HEIGHT), { bricksHigh: 3 }),
  ...blocks('plates', 'plate', PLATE_HEIGHT, [
    [1, 1],
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 6],
    [1, 8],
    [2, 2],
    [2, 3],
    [2, 4],
    [2, 6],
    [2, 8],
    [4, 4],
    [4, 6],
    [4, 8],
    [6, 6],
    [6, 8],
    [8, 8],
  ]),
  ...blocks(
    'tiles',
    'tile',
    PLATE_HEIGHT,
    [
      [1, 1],
      [1, 2],
      [1, 4],
      [2, 2],
      [2, 4],
    ],
    false,
  ),
  part('slopes', 'slope45', 1, 2, BRICK_HEIGHT, slopeBuilder(1, 2, BRICK_HEIGHT, 1)),
  part('slopes', 'slope45', 2, 2, BRICK_HEIGHT, slopeBuilder(2, 2, BRICK_HEIGHT, 1)),
  part('slopes', 'slope45', 4, 2, BRICK_HEIGHT, slopeBuilder(4, 2, BRICK_HEIGHT, 1)),
  part('slopes', 'slope33', 1, 3, BRICK_HEIGHT, slopeBuilder(1, 3, BRICK_HEIGHT, 1)),
  part('slopes', 'slope33', 2, 3, BRICK_HEIGHT, slopeBuilder(2, 3, BRICK_HEIGHT, 1)),
  part('slopes', 'slope33', 4, 3, BRICK_HEIGHT, slopeBuilder(4, 3, BRICK_HEIGHT, 1)),
  part('slopes', 'slopeSmall', 1, 1, 2 * PLATE_HEIGHT, slopeBuilder(1, 1, 2 * PLATE_HEIGHT, 0)),
  part('slopes', 'slopeInverted', 1, 2, BRICK_HEIGHT, invertedSlopeBuilder(1, 2, BRICK_HEIGHT)),
  part('slopes', 'slopeInverted', 2, 2, BRICK_HEIGHT, invertedSlopeBuilder(2, 2, BRICK_HEIGHT)),
  part('round', 'roundBrick', 1, 1, BRICK_HEIGHT, roundBuilder(1, BRICK_HEIGHT)),
  part('round', 'roundBrick', 2, 2, BRICK_HEIGHT, roundBuilder(2, BRICK_HEIGHT)),
  part('round', 'roundPlate', 1, 1, PLATE_HEIGHT, roundBuilder(1, PLATE_HEIGHT)),
  part('round', 'roundPlate', 2, 2, PLATE_HEIGHT, roundBuilder(2, PLATE_HEIGHT)),
  part('round', 'cone', 1, 1, BRICK_HEIGHT, coneBuilder()),
  part('special', 'cornerBrick', 2, 2, BRICK_HEIGHT, cornerBuilder(BRICK_HEIGHT)),
  part('special', 'cornerPlate', 2, 2, PLATE_HEIGHT, cornerBuilder(PLATE_HEIGHT)),
  part('special', 'arch', 4, 1, BRICK_HEIGHT, archBuilder(4, BRICK_HEIGHT)),
  part('special', 'arch', 6, 1, 2 * BRICK_HEIGHT, archBuilder(6, 2 * BRICK_HEIGHT), { bricksHigh: 2 }),
  part('special', 'window', 2, 1, 2 * BRICK_HEIGHT, frameBuilder(2, 2 * BRICK_HEIGHT, true), { bricksHigh: 2 }),
  part('special', 'window', 4, 1, 3 * BRICK_HEIGHT, frameBuilder(4, 3 * BRICK_HEIGHT, true), { bricksHigh: 3 }),
  part('special', 'door', 4, 1, 6 * BRICK_HEIGHT, frameBuilder(4, 6 * BRICK_HEIGHT, false), { bricksHigh: 6 }),
  part('special', 'panel', 2, 1, 2 * BRICK_HEIGHT, panelBuilder(2, 2 * BRICK_HEIGHT), { bricksHigh: 2 }),
  ...[16, 32, 48].map((studs) =>
    part('baseplates', 'baseplate', studs, studs, BASEPLATE_STACK, baseplateBuilder(studs), { preview: baseplateBuilder(8) }),
  ),
];

const byId = new Map(CATALOG.map((entry) => [entry.id, entry]));
export const catalogPart = (id: string) => byId.get(id);

/** "2 × 4", or "1 × 2 × 3" when it is more than one brick high – digits and a sign, the same in every language */
export const sizeLabel = (w: number, d: number, bricksHigh?: number) => [w, d, ...(bricksHigh ? [bricksHigh] : [])].join(' × ');

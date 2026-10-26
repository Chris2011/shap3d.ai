/**
 * The library of 2D symbols for floor plans (like LayOut's architecture scrapbook): doors, windows, stairs,
 * furniture, kitchen and bath, people, trees and cars – drawn in real size (metres), placed at a drawing scale.
 * Each symbol is a list of simple shapes in its own coordinates: x to the right, y down, origin top left.
 */

type Shape =
  | { line: [number, number, number, number] }
  | { rect: [number, number, number, number]; round?: number }
  | { circle: [number, number, number] }
  | { ellipse: [number, number, number, number] }
  /** centre, radius, start and end angle (degrees, clockwise, 0 = right) */
  | { arc: [number, number, number, number, number] };

export interface SymbolDefinition {
  id: string;
  /** message key of the name */
  category: SymbolCategory;
  /** size in metres */
  w: number;
  h: number;
  shapes: Shape[];
}

export type SymbolCategory = 'openings' | 'stairs' | 'living' | 'bedroom' | 'kitchen' | 'bath' | 'outdoor';
export const CATEGORIES: SymbolCategory[] = ['openings', 'stairs', 'living', 'bedroom', 'kitchen', 'bath', 'outdoor'];

/** a door leaf of width w opening by 90° from the hinge at (x, 0) – leaf to the bottom, swing arc to the far jamb */
const leaf = (x: number, w: number, towards: 1 | -1): Shape[] => [
  { line: [x, 0, x, w] },
  { arc: towards === 1 ? [x, 0, w, 0, 90] : [x, 0, w, 90, 180] },
];

const door = (width: number): SymbolDefinition => ({
  id: `door${Math.round(width * 100)}`,
  category: 'openings',
  w: width,
  h: width,
  shapes: [...leaf(0, width, 1), { line: [0, 0, width, 0] }],
});

/** a straight stair: outline, treads and the walking line with its arrow */
const stair = (width: number, length: number, steps: number): SymbolDefinition => ({
  id: 'stair',
  category: 'stairs',
  w: width,
  h: length,
  shapes: [
    { rect: [0, 0, width, length] },
    ...Array.from({ length: steps - 1 }, (_, i): Shape => ({ line: [0, ((i + 1) * length) / steps, width, ((i + 1) * length) / steps] })),
    { line: [width / 2, length - 0.1, width / 2, 0.25] },
    { line: [width / 2, 0.15, width / 2 - 0.1, 0.35] },
    { line: [width / 2, 0.15, width / 2 + 0.1, 0.35] },
    { circle: [width / 2, length - 0.1, 0.04] },
  ],
});

/** a chair seen from above, facing down (y) */
const chair = (x: number, y: number, rotation: 0 | 180): Shape[] =>
  rotation === 0
    ? [{ rect: [x, y, 0.45, 0.45], round: 0.04 }, { line: [x + 0.04, y + 0.08, x + 0.41, y + 0.08] }]
    : [{ rect: [x, y, 0.45, 0.45], round: 0.04 }, { line: [x + 0.04, y + 0.37, x + 0.41, y + 0.37] }];

export const SYMBOLS: SymbolDefinition[] = [
  // ---- doors and windows (the wall line runs along the top edge)
  door(0.8),
  door(0.9),
  door(1.0),
  {
    id: 'doubleDoor',
    category: 'openings',
    w: 1.6,
    h: 0.8,
    shapes: [...leaf(0, 0.8, 1), ...leaf(1.6, 0.8, -1), { line: [0, 0, 1.6, 0] }],
  },
  {
    id: 'slidingDoor',
    category: 'openings',
    w: 1.8,
    h: 0.24,
    shapes: [{ rect: [0, 0, 1.8, 0.24] }, { line: [0.05, 0.09, 1.0, 0.09] }, { line: [0.8, 0.15, 1.75, 0.15] }],
  },
  {
    id: 'window',
    category: 'openings',
    w: 1.2,
    h: 0.24,
    shapes: [{ rect: [0, 0, 1.2, 0.24] }, { line: [0, 0.1, 1.2, 0.1] }, { line: [0, 0.14, 1.2, 0.14] }],
  },
  {
    id: 'windowWide',
    category: 'openings',
    w: 2.0,
    h: 0.24,
    shapes: [{ rect: [0, 0, 2.0, 0.24] }, { line: [0, 0.1, 2.0, 0.1] }, { line: [0, 0.14, 2.0, 0.14] }, { line: [1.0, 0, 1.0, 0.24] }],
  },
  // ---- stairs
  stair(1.0, 3.0, 13),
  {
    id: 'spiralStair',
    category: 'stairs',
    w: 1.6,
    h: 1.6,
    shapes: [
      { circle: [0.8, 0.8, 0.8] },
      { circle: [0.8, 0.8, 0.1] },
      ...Array.from({ length: 12 }, (_, i): Shape => {
        const angle = (i * Math.PI) / 6;
        return {
          line: [0.8 + 0.1 * Math.cos(angle), 0.8 + 0.1 * Math.sin(angle), 0.8 + 0.8 * Math.cos(angle), 0.8 + 0.8 * Math.sin(angle)],
        };
      }),
    ],
  },
  // ---- living
  {
    id: 'sofa',
    category: 'living',
    w: 2.2,
    h: 0.9,
    shapes: [
      { rect: [0, 0, 2.2, 0.9], round: 0.08 },
      { rect: [0.18, 0.22, 1.84, 0.68], round: 0.05 },
      { line: [0.18, 0.22, 0.18, 0.9] },
      { line: [2.02, 0.22, 2.02, 0.9] },
      { line: [0.79, 0.22, 0.79, 0.9] },
      { line: [1.41, 0.22, 1.41, 0.9] },
    ],
  },
  {
    id: 'armchair',
    category: 'living',
    w: 0.9,
    h: 0.9,
    shapes: [
      { rect: [0, 0, 0.9, 0.9], round: 0.08 },
      { rect: [0.16, 0.22, 0.58, 0.68], round: 0.05 },
    ],
  },
  {
    id: 'diningTable',
    category: 'living',
    w: 1.6,
    h: 1.9,
    shapes: [{ rect: [0, 0.5, 1.6, 0.9] }, ...chair(0.2, 0, 0), ...chair(0.95, 0, 0), ...chair(0.2, 1.45, 180), ...chair(0.95, 1.45, 180)],
  },
  {
    id: 'roundTable',
    category: 'living',
    w: 1.9,
    h: 1.9,
    shapes: [
      { circle: [0.95, 0.95, 0.5] },
      { circle: [0.95, 0.12, 0.2] },
      { circle: [0.95, 1.78, 0.2] },
      { circle: [0.12, 0.95, 0.2] },
      { circle: [1.78, 0.95, 0.2] },
    ],
  },
  {
    id: 'desk',
    category: 'living',
    w: 1.4,
    h: 1.2,
    shapes: [{ rect: [0, 0, 1.4, 0.7] }, ...chair(0.48, 0.75, 180)],
  },
  // ---- bedroom
  {
    id: 'bedSingle',
    category: 'bedroom',
    w: 0.9,
    h: 2.0,
    shapes: [
      { rect: [0, 0, 0.9, 2.0] },
      { rect: [0.1, 0.08, 0.7, 0.4], round: 0.06 },
      { line: [0, 0.6, 0.9, 0.6] },
      { line: [0, 0.6, 0.35, 0.95] },
    ],
  },
  {
    id: 'bedDouble',
    category: 'bedroom',
    w: 1.8,
    h: 2.0,
    shapes: [
      { rect: [0, 0, 1.8, 2.0] },
      { rect: [0.1, 0.08, 0.75, 0.4], round: 0.06 },
      { rect: [0.95, 0.08, 0.75, 0.4], round: 0.06 },
      { line: [0, 0.6, 1.8, 0.6] },
    ],
  },
  {
    id: 'wardrobe',
    category: 'bedroom',
    w: 2.0,
    h: 0.6,
    shapes: [
      { rect: [0, 0, 2.0, 0.6] },
      { line: [0.5, 0, 0.5, 0.6] },
      { line: [1.0, 0, 1.0, 0.6] },
      { line: [1.5, 0, 1.5, 0.6] },
      { line: [0, 0, 2.0, 0.6] },
    ],
  },
  // ---- kitchen
  {
    id: 'kitchen',
    category: 'kitchen',
    w: 2.4,
    h: 0.6,
    shapes: [
      { rect: [0, 0, 2.4, 0.6] },
      // sink
      { rect: [0.25, 0.1, 0.5, 0.4], round: 0.05 },
      { circle: [0.5, 0.3, 0.03] },
      // hob
      { circle: [1.55, 0.18, 0.09] },
      { circle: [1.85, 0.18, 0.09] },
      { circle: [1.55, 0.43, 0.11] },
      { circle: [1.85, 0.43, 0.11] },
    ],
  },
  {
    id: 'fridge',
    category: 'kitchen',
    w: 0.6,
    h: 0.65,
    shapes: [{ rect: [0, 0, 0.6, 0.65] }, { line: [0, 0.6, 0.6, 0.6] }, { line: [0.1, 0.1, 0.5, 0.5] }, { line: [0.5, 0.1, 0.1, 0.5] }],
  },
  // ---- bath
  {
    id: 'wc',
    category: 'bath',
    w: 0.4,
    h: 0.65,
    shapes: [{ rect: [0, 0, 0.4, 0.18], round: 0.03 }, { ellipse: [0.2, 0.42, 0.18, 0.23] }, { ellipse: [0.2, 0.43, 0.12, 0.16] }],
  },
  {
    id: 'washbasin',
    category: 'bath',
    w: 0.6,
    h: 0.45,
    shapes: [{ rect: [0, 0, 0.6, 0.45], round: 0.06 }, { ellipse: [0.3, 0.26, 0.22, 0.14] }, { circle: [0.3, 0.07, 0.02] }],
  },
  {
    id: 'shower',
    category: 'bath',
    w: 0.9,
    h: 0.9,
    shapes: [{ rect: [0, 0, 0.9, 0.9] }, { line: [0, 0, 0.9, 0.9] }, { line: [0.9, 0, 0, 0.9] }, { circle: [0.45, 0.45, 0.05] }],
  },
  {
    id: 'bathtub',
    category: 'bath',
    w: 1.7,
    h: 0.75,
    shapes: [{ rect: [0, 0, 1.7, 0.75], round: 0.05 }, { rect: [0.07, 0.07, 1.56, 0.61], round: 0.25 }, { circle: [1.45, 0.375, 0.035] }],
  },
  // ---- outdoor and people
  {
    id: 'person',
    category: 'outdoor',
    w: 0.6,
    h: 0.35,
    shapes: [{ ellipse: [0.3, 0.175, 0.3, 0.15] }, { circle: [0.3, 0.175, 0.11] }],
  },
  {
    id: 'tree',
    category: 'outdoor',
    w: 3.0,
    h: 3.0,
    shapes: [{ circle: [1.5, 1.5, 1.5] }, { circle: [1.5, 1.5, 0.15] }, { line: [1.5, 0.3, 1.5, 2.7] }, { line: [0.3, 1.5, 2.7, 1.5] }],
  },
  {
    id: 'car',
    category: 'outdoor',
    w: 1.8,
    h: 4.5,
    shapes: [
      { rect: [0, 0, 1.8, 4.5], round: 0.35 },
      { rect: [0.2, 1.2, 1.4, 0.7], round: 0.1 },
      { rect: [0.2, 3.1, 1.4, 0.55], round: 0.1 },
      { line: [0.2, 1.9, 0.2, 3.1] },
      { line: [1.6, 1.9, 1.6, 3.1] },
    ],
  },
];

export const symbolById = (id: string) => SYMBOLS.find((symbol) => symbol.id === id);

const round = (value: number) => Number(value.toFixed(3));

/** the shapes of a symbol as SVG markup in its own coordinates, multiplied by `factor` (mm per metre) */
export const symbolMarkup = (symbol: SymbolDefinition, factor: number, strokeWidth: number) => {
  const stroke = `stroke="#000" stroke-width="${strokeWidth}" fill="none"`;
  const value = (number: number) => round(number * factor);
  return symbol.shapes
    .map((shape) => {
      if ('line' in shape) {
        const [x1, y1, x2, y2] = shape.line;
        return `<line x1="${value(x1)}" y1="${value(y1)}" x2="${value(x2)}" y2="${value(y2)}" ${stroke} stroke-linecap="round"/>`;
      }
      if ('rect' in shape) {
        const [x, y, w, h] = shape.rect;
        const corner = shape.round ? ` rx="${value(shape.round)}"` : '';
        return `<rect x="${value(x)}" y="${value(y)}" width="${value(w)}" height="${value(h)}"${corner} ${stroke}/>`;
      }
      if ('circle' in shape) {
        const [cx, cy, r] = shape.circle;
        return `<circle cx="${value(cx)}" cy="${value(cy)}" r="${value(r)}" ${stroke}/>`;
      }
      if ('ellipse' in shape) {
        const [cx, cy, rx, ry] = shape.ellipse;
        return `<ellipse cx="${value(cx)}" cy="${value(cy)}" rx="${value(rx)}" ry="${value(ry)}" ${stroke}/>`;
      }
      const [cx, cy, r, start, end] = shape.arc;
      const radians = (degrees: number) => (degrees * Math.PI) / 180;
      const from = [cx + r * Math.cos(radians(start)), cy + r * Math.sin(radians(start))];
      const to = [cx + r * Math.cos(radians(end)), cy + r * Math.sin(radians(end))];
      const large = (((end - start) % 360) + 360) % 360 > 180 ? 1 : 0;
      return `<path d="M${value(from[0])} ${value(from[1])}A${value(r)} ${value(r)} 0 ${large} 1 ${value(to[0])} ${value(to[1])}" ${stroke} stroke-dasharray="${round(strokeWidth * 4)} ${round(strokeWidth * 3)}"/>`;
    })
    .join('');
};

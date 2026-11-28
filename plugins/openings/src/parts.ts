// The settings of a window or a door, and the closed boxes and frames its pieces are made of – plain numbers only,
// tested in test/parts.test.ts (the pieces themselves: pieces.ts).
// Coordinates of an opening: x along the wall from its left edge (seen from outside), y into the wall from its outer
// face, z up from the opening's bottom. Every piece is its own mesh, so pieces that touch keep all their faces.

export type Point = [number, number, number];
export interface Mesh {
  vertices: Point[];
  faces: number[][];
}

export type OpeningKind = 'window' | 'door';
export type PieceMaterial = 'frame' | 'glass' | 'sill' | 'leaf' | 'handle' | 'shutter';

export interface OpeningParams {
  kind: OpeningKind;
  width: number;
  height: number;
  /** height of the window's bottom above the wall's bottom (doors: 0) */
  sill: number;
  /** window: side by side sashes (1–3); door: its leaves (1–2) */
  sashes: number;
  /** window: glazing bars across and upright in each sash (0–4) */
  barsAcross: number;
  barsUpright: number;
  /** door: the side its hinges are on, seen from outside */
  hinge: 'left' | 'right';
  /** window: how its sashes open (older windows have none: casement) */
  operation?: WindowOperation;
  /** door: a glass pane in the leaf */
  glazed?: boolean;
  /** window: a roller shutter outside – its box above the window, rails beside it */
  shutter?: boolean;
  /** how far the shutter is let down, 0 (open) to 1 (closed) */
  shutterDown?: number;
}

export type WindowOperation = 'fixed' | 'casement' | 'tiltTurn' | 'sliding';
export const WINDOW_OPERATIONS: WindowOperation[] = ['casement', 'tiltTurn', 'sliding', 'fixed'];

export const DEFAULT_WINDOW: OpeningParams = {
  kind: 'window',
  width: 1.2,
  height: 1.3,
  sill: 0.9,
  sashes: 2,
  barsAcross: 0,
  barsUpright: 0,
  hinge: 'left',
  operation: 'tiltTurn',
  glazed: false,
  shutter: false,
  shutterDown: 0,
};
export const DEFAULT_DOOR: OpeningParams = { ...DEFAULT_WINDOW, kind: 'door', width: 0.885, height: 2.01, sill: 0, sashes: 1 };

export interface Piece {
  name: string;
  material: PieceMaterial;
  mesh: Mesh;
}

/** faces of a box from [x0, y0, z0] to [x1, y1, z1], facing out */
export const boxMesh = ([x0, y0, z0]: Point, [x1, y1, z1]: Point): Mesh => ({
  vertices: [
    [x0, y0, z0],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z0],
    [x0, y0, z1],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z1],
  ],
  faces: [
    [0, 3, 2, 1],
    [4, 5, 6, 7],
    [0, 1, 5, 4],
    [1, 2, 6, 5],
    [2, 3, 7, 6],
    [3, 0, 4, 7],
  ],
});

/**
 * A rectangular frame lying in x–z: outer corner (x0, z0) to (x1, z1), its bars `bar` wide, from y0 to y1 deep – one
 * closed ring with mitred corners.
 */
export const frameMesh = (x0: number, z0: number, x1: number, z1: number, bar: number, y0: number, y1: number): Mesh => {
  const outer: [number, number][] = [
    [x0, z0],
    [x1, z0],
    [x1, z1],
    [x0, z1],
  ];
  const inner: [number, number][] = [
    [x0 + bar, z0 + bar],
    [x1 - bar, z0 + bar],
    [x1 - bar, z1 - bar],
    [x0 + bar, z1 - bar],
  ];
  // corners: outer front 0–3, inner front 4–7, outer back 8–11, inner back 12–15
  const vertices: Point[] = [...outer, ...inner].map(([x, z]) => [x, y0, z]);
  vertices.push(...[...outer, ...inner].map(([x, z]): Point => [x, y1, z]));
  const faces: number[][] = [];
  for (let side = 0; side < 4; side++) {
    const next = (side + 1) % 4;
    faces.push([side, next, 4 + next, 4 + side]); // front (y0, facing −y)
    faces.push([8 + side, 12 + side, 12 + next, 8 + next]); // back
    faces.push([side, 8 + side, 8 + next, next]); // outside
    faces.push([4 + side, 4 + next, 12 + next, 12 + side]); // inside of the ring
  }
  return { vertices, faces };
};

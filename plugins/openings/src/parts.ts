// The pieces of a window or a door, as closed boxes and frames – plain numbers only, tested in test/parts.test.ts.
// Coordinates of an opening: x along the wall from its left edge (seen from outside), y into the wall from its outer
// face, z up from the opening's bottom. Every piece is its own mesh, so pieces that touch keep all their faces.

export type Point = [number, number, number];
export interface Mesh {
  vertices: Point[];
  faces: number[][];
}

export type OpeningKind = 'window' | 'door';
export type PieceMaterial = 'frame' | 'glass' | 'sill' | 'leaf' | 'handle';

export interface OpeningParams {
  kind: OpeningKind;
  width: number;
  height: number;
  /** height of the window's bottom above the wall's bottom (doors: 0) */
  sill: number;
  /** window: side by side sashes (1–3) */
  sashes: number;
  /** window: glazing bars across and upright in each sash (0–4) */
  barsAcross: number;
  barsUpright: number;
  /** door: the side its hinges are on, seen from outside */
  hinge: 'left' | 'right';
}

export const DEFAULT_WINDOW: OpeningParams = {
  kind: 'window',
  width: 1.2,
  height: 1.3,
  sill: 0.9,
  sashes: 2,
  barsAcross: 0,
  barsUpright: 0,
  hinge: 'left',
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

/**
 * The pieces of an opening `thickness` deep (the wall): frame (doors: on three sides), sashes with glass and glazing
 * bars, sills inside and out – or a door leaf with a handle.
 */
export const openingPieces = (params: OpeningParams, thickness: number): Piece[] => {
  const { width, height } = params;
  const frameDepth = Math.min(0.07, Math.max(thickness, 0.02));
  const middle = Math.max(thickness, 0) / 2;
  const [front, back] = [middle - frameDepth / 2, middle + frameDepth / 2];
  const pieces: Piece[] = [];
  const add = (name: string, material: PieceMaterial, mesh: Mesh) => pieces.push({ name, material, mesh });

  if (params.kind === 'door') {
    const jamb = 0.045;
    add('frame', 'frame', boxMesh([0, front, 0], [jamb, back, height]));
    add('frame', 'frame', boxMesh([width - jamb, front, 0], [width, back, height]));
    add('frame', 'frame', boxMesh([jamb, front, height - jamb], [width - jamb, back, height]));
    const leafFront = middle - 0.02;
    add('leaf', 'leaf', boxMesh([jamb + 0.003, leafFront, 0.01], [width - jamb - 0.003, leafFront + 0.04, height - jamb - 0.003]));
    // the handle on the side away from the hinges, on both faces of the leaf
    const handleX = params.hinge === 'left' ? width - jamb - 0.1 : jamb + 0.06;
    for (const [y0, y1] of [
      [leafFront - 0.06, leafFront],
      [leafFront + 0.04, leafFront + 0.1],
    ]) {
      add('handle', 'handle', boxMesh([handleX, y0, 1.03], [handleX + 0.04, y1, 1.07]));
    }
    return pieces;
  }

  const bar = 0.06;
  add('frame', 'frame', frameMesh(0, 0, width, height, bar, front, back));
  const sashes = Math.min(3, Math.max(1, Math.round(params.sashes)));
  const sashWidth = (width - 2 * bar) / sashes;
  const sashBar = 0.05;
  const [sashFront, sashBack] = [middle - 0.03, middle + 0.03];
  for (let index = 0; index < sashes; index++) {
    const [x0, x1] = [bar + index * sashWidth, bar + (index + 1) * sashWidth];
    const [z0, z1] = [bar, height - bar];
    add('sash', 'frame', frameMesh(x0, z0, x1, z1, sashBar, sashFront, sashBack));
    const [gx0, gx1, gz0, gz1] = [x0 + sashBar, x1 - sashBar, z0 + sashBar, z1 - sashBar];
    add('glass', 'glass', boxMesh([gx0, middle - 0.006, gz0], [gx1, middle + 0.006, gz1]));
    // glazing bars on the glass, on both faces
    const across = Math.min(4, Math.max(0, Math.round(params.barsAcross)));
    const upright = Math.min(4, Math.max(0, Math.round(params.barsUpright)));
    const barWidth = 0.025;
    for (const [y0, y1] of [
      [middle - 0.018, middle - 0.006],
      [middle + 0.006, middle + 0.018],
    ]) {
      for (let line = 1; line <= across; line++) {
        const z = gz0 + ((gz1 - gz0) * line) / (across + 1);
        add('bar', 'frame', boxMesh([gx0, y0, z - barWidth / 2], [gx1, y1, z + barWidth / 2]));
      }
      for (let line = 1; line <= upright; line++) {
        const x = gx0 + ((gx1 - gx0) * line) / (upright + 1);
        add('bar', 'frame', boxMesh([x - barWidth / 2, y0, gz0], [x + barWidth / 2, y1, gz1]));
      }
    }
  }
  // sills: outside it reaches out over the wall, inside it lies on the parapet
  add('sill', 'sill', boxMesh([-0.03, -0.05, -0.03], [width + 0.03, front, 0]));
  if (thickness > 0.1) {
    add('sill', 'sill', boxMesh([-0.02, back, -0.025], [width + 0.02, thickness + 0.03, 0]));
  }
  return pieces;
};

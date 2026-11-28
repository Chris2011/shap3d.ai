// The pieces of a window or a door in the wall – plain numbers only, tested in test/parts.test.ts.
import { boxMesh, frameMesh, type Mesh, type OpeningParams, type Piece, type PieceMaterial } from './parts.ts';

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, Math.round(value)));

/**
 * The pieces of an opening `thickness` deep (the wall). Windows: frame, sashes with glass and glazing bars (fixed:
 * panes in the frame with mullions between; sliding: sashes overlapping, one behind the other), handles inside, sills
 * inside and out. Doors: frame on three sides, a leaf (glazed: a frame round a glass pane), handles on both faces.
 */
export const openingPieces = (params: OpeningParams, thickness: number): Piece[] => {
  const { width, height } = params;
  const frameDepth = Math.min(0.07, Math.max(thickness, 0.02));
  const middle = Math.max(thickness, 0) / 2;
  const [front, back] = [middle - frameDepth / 2, middle + frameDepth / 2];
  const pieces: Piece[] = [];
  const add = (name: string, material: PieceMaterial, mesh: Mesh) => pieces.push({ name, material, mesh });
  /** a pane of glass at depth y, with glazing bars on both its faces */
  const pane = (x0: number, x1: number, z0: number, z1: number, y: number, bars: boolean) => {
    add('glass', 'glass', boxMesh([x0, y - 0.006, z0], [x1, y + 0.006, z1]));
    const [across, upright] = bars ? [clamp(params.barsAcross, 0, 4), clamp(params.barsUpright, 0, 4)] : [0, 0];
    const barWidth = 0.025;
    for (const [y0, y1] of [
      [y - 0.018, y - 0.006],
      [y + 0.006, y + 0.018],
    ]) {
      for (let line = 1; line <= across; line++) {
        const z = z0 + ((z1 - z0) * line) / (across + 1);
        add('bar', 'frame', boxMesh([x0, y0, z - barWidth / 2], [x1, y1, z + barWidth / 2]));
      }
      for (let line = 1; line <= upright; line++) {
        const x = x0 + ((x1 - x0) * line) / (upright + 1);
        add('bar', 'frame', boxMesh([x - barWidth / 2, y0, z0], [x + barWidth / 2, y1, z1]));
      }
    }
  };
  /** an upright handle on the face at depth y, its bar standing out by `reach` (negative: towards outside) */
  const handle = (x: number, z: number, y: number, reach: number) =>
    add('handle', 'handle', boxMesh([x - 0.015, Math.min(y, y + reach), z - 0.06], [x + 0.015, Math.max(y, y + reach), z + 0.06]));

  if (params.kind === 'door') {
    const jamb = 0.045;
    add('frame', 'frame', boxMesh([0, front, 0], [jamb, back, height]));
    add('frame', 'frame', boxMesh([width - jamb, front, 0], [width, back, height]));
    add('frame', 'frame', boxMesh([jamb, front, height - jamb], [width - jamb, back, height]));
    const [leafFront, leafBack] = [middle - 0.02, middle + 0.02];
    const [left, right, z0, z1] = [jamb + 0.003, width - jamb - 0.003, 0.01, height - jamb - 0.003];
    // a double door: two leaves meeting in the middle, hinged on both sides
    const double = clamp(params.sashes ?? 1, 1, 2) === 2;
    const gap = 0.004;
    const leaves = double
      ? [
          [left, (left + right - gap) / 2],
          [(left + right + gap) / 2, right],
        ]
      : [[left, right]];
    leaves.forEach(([x0, x1], index) => {
      if (params.glazed) {
        const rail = Math.min(0.14, (x1 - x0) / 4);
        add('leaf', 'leaf', frameMesh(x0, z0, x1, z1, rail, leafFront, leafBack));
        pane(x0 + rail, x1 - rail, z0 + rail, z1 - rail, middle, false);
      } else {
        add('leaf', 'leaf', boxMesh([x0, leafFront, z0], [x1, leafBack, z1]));
      }
      // the handle on the side away from the leaf's hinges (a double door: by the middle), on both faces
      const handleRight = double ? index === 0 : params.hinge === 'left';
      const handleX = handleRight ? x1 - 0.08 : x0 + 0.08;
      for (const [y0, y1] of [
        [leafFront - 0.06, leafFront],
        [leafBack, leafBack + 0.06],
      ]) {
        add('handle', 'handle', boxMesh([handleX - 0.02, y0, 1.03], [handleX + 0.02, y1, 1.07]));
      }
    });
    return pieces;
  }

  const bar = 0.06;
  add('frame', 'frame', frameMesh(0, 0, width, height, bar, front, back));
  const count = clamp(params.sashes, 1, 3);
  const [z0, z1] = [bar, height - bar];
  const operation = params.operation ?? 'casement';
  if (operation === 'fixed') {
    // panes straight in the frame, mullions between them
    const paneWidth = (width - 2 * bar - (count - 1) * bar) / count;
    for (let index = 0; index < count; index++) {
      const x0 = bar + index * (paneWidth + bar);
      pane(x0, x0 + paneWidth, z0, z1, middle, true);
      if (index > 0) {
        add('mullion', 'frame', boxMesh([x0 - bar, front, z0], [x0, back, z1]));
      }
    }
  } else {
    const sashBar = 0.05;
    const sliding = operation === 'sliding';
    // sliding sashes overlap by a bar's width and run one behind the other
    const overlap = sliding && count > 1 ? sashBar : 0;
    const sashWidth = (width - 2 * bar + (count - 1) * overlap) / count;
    for (let index = 0; index < count; index++) {
      const x0 = bar + index * (sashWidth - overlap);
      const x1 = x0 + sashWidth;
      const centre = sliding ? middle + (index % 2 ? 0.022 : -0.022) : middle;
      const [sashFront, sashBack] = sliding ? [centre - 0.02, centre + 0.02] : [middle - 0.03, middle + 0.03];
      add('sash', 'frame', frameMesh(x0, z0, x1, z1, sashBar, sashFront, sashBack));
      pane(x0 + sashBar, x1 - sashBar, z0 + sashBar, z1 - sashBar, centre, true);
      // the handle inside, on the edge where the sash opens (the middle of the window)
      const handleX = index > (count - 1) / 2 ? x0 + sashBar / 2 : x1 - sashBar / 2;
      handle(handleX, (z0 + z1) / 2, sashBack, 0.05);
    }
  }
  // sills: outside it reaches out over the wall, inside it lies on the parapet
  add('sill', 'sill', boxMesh([-0.03, -0.05, -0.03], [width + 0.03, front, 0]));
  if (thickness > 0.1) {
    add('sill', 'sill', boxMesh([-0.02, back, -0.025], [width + 0.02, thickness + 0.03, 0]));
  }
  return pieces;
};

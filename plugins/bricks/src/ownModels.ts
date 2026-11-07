import { catalogPart } from './catalog.ts';
import { PITCH } from './shapes.ts';

/**
 * Finished models the plugin brings itself, built from its own bricks, so they work without a network. Each is written
 * like a building instruction: bricks are laid one after the other and come to rest on what is under them.
 */

export interface OwnPlacement {
  part: string;
  /** the brick's middle, in cells */
  x: number;
  y: number;
  /** its underside, in metres */
  z: number;
  /** degrees, in quarter turns */
  rotation: number;
  color: string;
}

type Lay = (part: string, x: number, y: number, color: string, rotation?: number) => void;

const builder = (instructions: (lay: Lay) => void) => (): OwnPlacement[] => {
  const placed: (OwnPlacement & { x0: number; x1: number; y0: number; y1: number; top: number })[] = [];
  instructions((part, x, y, color, rotation = 0) => {
    const brick = catalogPart(part);
    if (!brick) {
      throw new Error(`Unknown part ${part}`); // i18n-ignore – programming error
    }
    const [w, d] = rotation % 180 === 0 ? [brick.w, brick.d] : [brick.d, brick.w];
    const box = { x0: x - w / 2, x1: x + w / 2, y0: y - d / 2, y1: y + d / 2 };
    const z = placed.reduce(
      (height, other) =>
        box.x0 < other.x1 && other.x0 < box.x1 && box.y0 < other.y1 && other.y0 < box.y1 ? Math.max(height, other.top) : height,
      0,
    );
    placed.push({ part, x, y, z, rotation, color, ...box, top: z + brick.height });
  });
  return placed.map(({ part, x, y, z, rotation, color }) => ({ part, x, y, z, rotation, color }));
};

const house = builder((lay) => {
  lay('baseplate-16x16', 0, 0, 'green');
  lay('tile-2x4', -1, -6, 'tan');
  lay('tile-2x4', 1, -6, 'tan');
  lay('door-4x1x6', 0, -3.5, 'blue');
  for (const x of [-5.5, 5.5]) {
    lay('brick-1x6', x, 0, 'white');
    lay('window-2x1x2', x, 0, 'lightBlue', 90);
  }
  for (let row = 0; row < 6; row++) {
    for (const x of [-4, 4]) {
      lay('brick-1x4', x, -3.5, 'white', 90);
    }
    if (row % 2) {
      for (const x of [-3, 3]) {
        lay('brick-1x6', x, 3.5, 'white', 90);
      }
    } else {
      for (const x of [-4, 0, 4]) {
        lay('brick-1x4', x, 3.5, 'white', 90);
      }
    }
    for (const x of [-5.5, 5.5]) {
      if (row >= 3) {
        lay('brick-1x6', x, 0, 'white');
      } else if (row > 0) {
        for (const y of [-2, 2]) {
          lay('brick-1x2', x, y, 'white');
        }
      }
    }
  }
  for (const [y, rotation] of [
    [-3, 0],
    [3, 180],
    [-2, 0],
    [2, 180],
    [-1, 0],
    [1, 180],
  ]) {
    for (const x of [-4, 0, 4]) {
      lay('slope45-4x2', x, y, 'darkRed', rotation);
    }
  }
});

const car = builder((lay) => {
  for (const x of [-1.5, 1.5]) {
    for (const y of [-2.5, 2.5]) {
      lay('roundBrick-1x1', x, y, 'black');
    }
  }
  lay('plate-4x8', 0, 0, 'darkGrey');
  lay('slope45-4x2', 0, -3, 'red');
  lay('brick-2x4', -1, 2, 'red');
  lay('brick-2x4', 1, 2, 'red');
  lay('brick-1x2', -1.5, -1, 'red');
  lay('brick-1x2', 1.5, -1, 'red');
  lay('plate-4x4', 0, 1, 'black');
  lay('tile-2x2', -1, 3, 'yellow');
  lay('tile-2x2', 1, 3, 'yellow');
});

const tree = builder((lay) => {
  lay('plate-6x6', 0, 0, 'green');
  for (let row = 0; row < 3; row++) {
    lay('roundBrick-1x1', 0.5, 0.5, 'brown');
  }
  lay('plate-6x6', 0, 0, 'green');
  lay('brick-2x2', -1, -1, 'lime');
  lay('brick-2x2', 1, -1, 'green');
  lay('brick-2x2', -1, 1, 'green');
  lay('brick-2x2', 1, 1, 'lime');
  lay('plate-4x4', 0, 0, 'green');
  lay('roundBrick-2x2', 0, 0, 'lime');
  lay('cone-1x1', 0.5, 0.5, 'green');
});

const lighthouse = builder((lay) => {
  lay('plate-8x8', 0, 0, 'tan');
  for (let row = 0; row < 8; row++) {
    lay('roundBrick-2x2', 0, 0, row % 2 ? 'white' : 'red');
  }
  lay('plate-4x4', 0, 0, 'darkGrey');
  lay('roundBrick-2x2', 0, 0, 'clear');
  lay('roundPlate-2x2', 0, 0, 'red');
  lay('cone-1x1', 0.5, 0.5, 'yellow');
});

const bridge = builder((lay) => {
  for (const x of [-7, 7]) {
    for (let row = 0; row < 3; row++) {
      lay('brick-2x4', x, 0, 'lightGrey');
    }
  }
  for (const y of [-1.5, 1.5]) {
    lay('arch-6x1x2', -3, y, 'lightGrey');
    lay('arch-6x1x2', 3, y, 'lightGrey');
  }
  for (const x of [-4, 4]) {
    lay('plate-4x8', x, 0, 'darkGrey', 90);
  }
  for (const y of [-1.5, 1.5]) {
    for (const x of [-6, -2, 2, 6]) {
      lay('brick-1x2', x, y, 'brown', 90);
    }
  }
});

const rocket = builder((lay) => {
  lay('plate-8x8', 0, 0, 'darkGrey');
  for (const [x, y, rotation] of [
    [-2.5, 0, 90],
    [2.5, 0, 270],
    [0, -2.5, 180],
    [0, 2.5, 0],
  ]) {
    lay('slope45-1x2', x, y, 'red', rotation);
  }
  for (let row = 0; row < 7; row++) {
    lay('roundBrick-2x2', 0, 0, row === 4 ? 'lightBlue' : 'white');
  }
  lay('roundPlate-2x2', 0, 0, 'red');
  lay('roundBrick-1x1', 0.5, 0.5, 'red');
  lay('cone-1x1', 0.5, 0.5, 'red');
});

export const OWN_MODELS = { house, car, tree, lighthouse, bridge, rocket };
export type OwnModelName = keyof typeof OWN_MODELS;
export const OWN_MODEL_NAMES = Object.keys(OWN_MODELS) as OwnModelName[];

/** the middle of a placement in metres */
export const ownPlacementAt = ({ x, y, z }: OwnPlacement): [number, number, number] => [x * PITCH, y * PITCH, z];

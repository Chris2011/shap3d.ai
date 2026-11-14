import type { PluginContext } from '../../../src/plugins/types';
import { addBrick, boxAt, restingHeight, type PlaceOptions } from './bricks';
import { CATALOG, catalogPart } from './catalog';
import { colorById, COLORS } from './colors';
import { COMMON_PARTS } from './ldrawParts';
import { ONLINE_MODELS } from './ldrawModels';
import { loadModel, OWN_PREFIX, ownModelSpec } from './models';
import { loadPart } from './online';
import { OWN_MODEL_NAMES, type OwnModelName } from './ownModels';
import { LDRAW_PREFIX, partInfo } from './parts';
import { t } from './runtime';
import { BRICK_HEIGHT, PITCH, PLATE_HEIGHT } from './shapes';
import { wallPieces } from './wall';

/** What scripts get: s3d.brick and s3d.brickWall, completion for parts and colours, and examples in the script editor. */

export interface WallOptions {
  /** the corner the wall starts at, in studs */
  from?: [number, number];
  /** studs long */
  length?: number;
  /** bricks high */
  rows?: number;
  along?: 'x' | 'y';
  color?: string;
  /** a door or window frame in the wall: its part, studs from the wall's start, and the row it stands on */
  openings?: { part: string; at: number; from?: number; color?: string }[];
}

/** a part made on first use, or loaded before the script runs (see beforeRun) */
const ensurePart = (part: string) => {
  if (part.startsWith(OWN_PREFIX) && (OWN_MODEL_NAMES as string[]).includes(part.slice(OWN_PREFIX.length))) {
    ownModelSpec(part.slice(OWN_PREFIX.length) as OwnModelName);
  }
  return part;
};

const PIECES = { 4: 'brick-1x4', 2: 'brick-1x2', 1: 'brick-1x1' } as const;

/** a wall resting on what is under it; returns the ids of everything placed */
export const addWall = ({ from = [0, 0], length = 8, rows = 3, along = 'x', color, openings = [] }: WallOptions) => {
  const lengthwise = along === 'x';
  // where a stud along the wall is, and the middle of the one row of studs across it
  const at = (start: number, size: number): [number, number] =>
    lengthwise ? [from[0] + start + size / 2, from[1] + 0.5] : [from[0] + 0.5, from[1] + start + size / 2];
  // the wall's underside: whatever is highest under it, so a row above a door does not fall into the door
  const [x0, y0] = at(0, length);
  const base = restingHeight(boxAt(x0 * PITCH, y0 * PITCH, 0, lengthwise ? length : 1, lengthwise ? 1 : length, 1)) / PLATE_HEIGHT;
  const frames = openings.map((opening) => {
    const part = catalogPart(opening.part);
    if (!part) {
      throw new Error(t('bricks.errors.unknownPart', { part: opening.part }));
    }
    return { ...opening, width: Math.max(part.w, part.d), from: opening.from ?? 0, rows: Math.round(part.height / BRICK_HEIGHT) };
  });
  const ids = wallPieces(length, rows, frames).map(
    ({ start, size, row }) =>
      addBrick(PIECES[size], { at: at(start, size), rotation: lengthwise ? 90 : 0, level: base + row * 3, color }).id,
  );
  for (const frame of frames) {
    ids.push(
      addBrick(frame.part, {
        at: at(frame.at, frame.width),
        rotation: lengthwise ? 0 : 90,
        level: base + frame.from * 3,
        color: frame.color ?? color,
      }).id,
    );
  }
  return ids;
};

/** the ids a script names that have to come from the network first */
const wanted = (code: string) => [...code.matchAll(/['"`](ldraw|model):([\w-]+)['"`]/g)].map(([, kind, name]) => ({ kind, name }));

// i18n-ignore-start – code
const EXAMPLES = [
  {
    id: 'house',
    code: `// A house on a baseplate: walls with a door and windows, and a roof of slopes.
s3d.brick('baseplate-16x16', { at: [0, 0], color: 'green' });
s3d.brick('tile-2x4', { at: [-1, -6], color: 'tan' });
s3d.brick('tile-2x4', { at: [1, -6], color: 'tan' });

// four walls, six bricks high: front and back along x, the sides between them along y
s3d.brickWall({ from: [-6, -4], length: 12, rows: 6, color: 'white', openings: [{ part: 'door-4x1x6', at: 4, color: 'blue' }] });
s3d.brickWall({ from: [-6, 3], length: 12, rows: 6, color: 'white', openings: [{ part: 'window-2x1x2', at: 5, from: 2, color: 'lightBlue' }] });
for (const x of [-6, 5]) {
  s3d.brickWall({ from: [x, -3], length: 6, rows: 6, along: 'y', color: 'white', openings: [{ part: 'window-2x1x2', at: 2, from: 1, color: 'lightBlue' }] });
}

// the roof: three rows of slopes on each side, each resting on the one before
for (const [y, rotation] of [[-3, 0], [3, 180], [-2, 0], [2, 180], [-1, 0], [1, 180]]) {
  for (const x of [-4, 0, 4]) {
    s3d.brick('slope45-4x2', { at: [x, y], rotation, color: 'darkRed' });
  }
}`,
  },
  {
    id: 'models',
    code: `// The plugin's own finished models, side by side. Each is one piece: move, turn or delete it as a whole.
const names = ['house', 'car', 'tree', 'lighthouse', 'bridge', 'rocket'];
names.forEach((name, index) => s3d.brick('model:own-' + name, { at: [index * 20, 0] }));`,
  },
  {
    id: 'online',
    code: `// Parts and whole sets from the LDraw library: they are loaded before the script runs (needs the network).
s3d.brick('model:30023', { at: [0, 0] });
for (let i = 0; i < 4; i++) {
  s3d.brick('ldraw:3039', { at: [12, i * 2], color: 'red' });
}`,
  },
];
// i18n-ignore-end

export const useScripting = (context: PluginContext) => {
  context.script.extend('brick', (_api, part: string, options: PlaceOptions = {}) => addBrick(ensurePart(String(part)), options).id, {
    category: 'Plugins',
    signature: 's3d.brick(part, { at: [x, y], rotation, level, color })',
    description: 'bricks.script.brick',
    example: "s3d.brick('brick-2x4', { at: [0, 0], rotation: 90, color: 'red' });",
  });
  context.script.extend('brickWall', (_api, options: WallOptions = {}) => addWall(options), {
    category: 'Plugins',
    signature: 's3d.brickWall({ from: [x, y], length, rows, along, color, openings })',
    description: 'bricks.script.wall',
    example: "s3d.brickWall({ from: [0, 0], length: 12, rows: 4, color: 'white', openings: [{ part: 'door-4x1x6', at: 4 }] });",
  });

  const partItems = () => [
    ...CATALOG.map((part) => ({ label: part.id, detail: partInfo(part.id)?.name })),
    ...OWN_MODEL_NAMES.map((name) => ({ label: OWN_PREFIX + name, detail: t(`bricks.models.own.${name}`) })),
    ...ONLINE_MODELS.map((model) => ({
      label: model.id,
      detail: model.title,
      description: t('bricks.models.pieces', { count: model.pieces }),
    })),
    ...COMMON_PARTS.map((part) => ({ label: LDRAW_PREFIX + part.number, detail: part.title })),
  ];
  context.script.completeArgument('brick', 0, partItems);
  context.script.completeValues('color', () =>
    COLORS.map((color) => ({ label: color.id, detail: t(`bricks.colors.${color.id}`), color: colorById(color.id).hex })),
  );

  // parts and sets from the library have to be loaded before a script, which cannot wait, uses them
  context.script.beforeRun(async (code) => {
    const signal = new AbortController().signal;
    for (const { kind, name } of wanted(code)) {
      if (kind === 'ldraw') {
        await loadPart(name, signal, () => {});
      } else {
        const online = ONLINE_MODELS.find((model) => model.id === `model:${name}`);
        if (online) {
          await loadModel({ id: online.id, title: online.title, url: online.url }, signal, () => {});
        }
      }
    }
  });

  for (const example of EXAMPLES) {
    context.script.addExample({
      id: example.id,
      name: `bricks.examples.${example.id}.name`,
      description: `bricks.examples.${example.id}.description`,
      code: example.code,
    });
  }
};

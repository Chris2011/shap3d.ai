import type { ScriptApi } from '../../../src/scripting/api';
import { generateFloorplan, randomGenerator, roomCentre, type FloorplanOptions, type FloorplanRoom } from '@shap3d/procgen';
import { blockoutData, rebuildBlockout, storeBlockout, type Block } from './blockout';
import { levelObjects, placeObject } from './objects';
import { pluginContext, t } from './runtime';

/**
 * A level from a seed: a floor plan of rooms and corridors (packages/procgen) as the blockout, and – when wanted – the
 * game objects that make it playable: the player's start in the first room, a light in every room, enemies and health
 * on the way, a save point half way and a trigger in the last room that ends the level.
 */

export interface GenerateCall extends Partial<FloorplanOptions> {
  /** place game objects too (the level's objects are replaced) – default true */
  objects?: boolean;
}

export interface GenerateResult {
  rooms: number;
  corridors: number;
  objects: number;
}

let lastResult: GenerateResult = { rooms: 0, corridors: 0, objects: 0 };
/** what the last s3d.levelGenerate made – the panel tells it */
export const lastGenerated = () => lastResult;

/** s3d.levelGenerate({ seed, rooms, size, minRoom, maxRoom, corridor, height, ceiling, loops, objects }) */
export const generateLevel = (api: ScriptApi, call: GenerateCall = {}): GenerateResult => {
  const { objects = true, ...options } = call;
  const plan = generateFloorplan(options);
  const counters: Record<string, number> = {};
  const pieces: Block[] = plan.pieces.map((piece) => {
    counters[piece.kind] = (counters[piece.kind] ?? 0) + 1;
    return { ...piece, id: `${piece.kind}-${counters[piece.kind]}` } as Block;
  });
  storeBlockout({ ...blockoutData(), pieces });
  let placed = 0;
  if (objects) {
    // the level's objects go – the new plan gets its own
    const model = pluginContext().editor.model;
    for (const object of levelObjects()) {
      model.root.instances.delete(object.instance.id);
    }
    placed = placeObjects(api, plan.rooms, plan.links, plan.start, plan.end, plan.depth, call);
  }
  rebuildBlockout(api);
  lastResult = { rooms: plan.rooms.length, corridors: plan.links.length, objects: placed };
  return lastResult;
};

const centimetres = (value: number) => Math.round(value * 100) / 100;

const placeObjects = (
  api: ScriptApi,
  rooms: FloorplanRoom[],
  links: [number, number][],
  start: number,
  end: number,
  depth: number[],
  call: GenerateCall,
) => {
  const random = randomGenerator((call.seed ?? 1) + 0.91);
  const height = call.height ?? 3;
  let count = 0;
  const place = (kind: string, options: Parameters<typeof placeObject>[2]) => {
    placeObject(api, kind, options);
    count++;
  };
  // the start: facing the first room it leads to
  const [sx, sy] = roomCentre(rooms[start]);
  const next = links.find(([a, b]) => a === start || b === start);
  const [nx, ny] = next ? roomCentre(rooms[next[0] === start ? next[1] : next[0]]) : [sx + 1, sy];
  place('spawn', { at: [sx, sy, 0], rotation: (Math.atan2(ny - sy, nx - sx) * 180) / Math.PI, props: { team: 'player' } });

  const deepest = Math.max(...depth.filter(Number.isFinite));
  const save = depth.findIndex((value, index) => index !== start && index !== end && value === Math.max(1, Math.round(deepest / 2)));
  rooms.forEach((room, index) => {
    const [x, y] = roomCentre(room);
    // a warm light under the ceiling
    place('light', {
      at: [x, y, height - 0.3],
      props: { color: '#ffd8a8', intensity: 1, range: Math.round(Math.max(room.width, room.depth) * 12) / 10, flicker: random() < 0.2 },
    });
    if (index === start) {
      return;
    }
    // a corner of the room, a metre in from its walls
    const corner = (): [number, number, number] => [
      centimetres(room.x + 1 + random() * Math.max(0, room.width - 2)),
      centimetres(room.y + 1 + random() * Math.max(0, room.depth - 2)),
      0,
    ];
    if (index === end) {
      place('trigger', {
        at: [x, y, 0],
        size: [Math.max(1, room.width - 1), Math.max(1, room.depth - 1), Math.min(height, 2.5)],
        props: { on: 'enter', once: true },
        actions: [{ do: 'message', value: t('level.generate.goal') }],
      });
      return;
    }
    if (index === save) {
      place('savepoint', { at: corner(), rotation: Math.round(random() * 360) });
    }
    if (depth[index] >= 2 && random() < 0.5) {
      place('enemy', { at: corner(), rotation: Math.round(random() * 360), props: { type: 'zombie', count: 1 } });
    }
    if (depth[index] % 2 === 1 && random() < 0.7) {
      place('pickup', { at: corner(), props: { item: 'health', amount: 25 } });
    }
  });
  return count;
};

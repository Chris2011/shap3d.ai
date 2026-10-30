import type { Definition, Instance } from '../../../src/core/model';
import type { ScriptApi } from '../../../src/scripting/api';
import { blockoutMesh, type BlockDirection, type BlockPiece, type Doorway } from '@shap3d/procgen';
import { KINDS } from './kinds';
import { levelObjects } from './objects';
import { pluginContext, t, THREE } from './runtime';

/**
 * Blockout: the level's rooms, corridors and stairs, kept as a list of pieces in the model's level data and built into
 * one group – floors, walls and ceilings on a grid of cells (packages/procgen). Level doors standing in a wall cut a
 * doorway into it. Every change builds the group again, in the undo step of the change.
 */

export type BlockKind = BlockPiece['kind'];
export type Block = BlockPiece & { id: string };

export interface BlockoutData {
  /** the grid's cell size (m) */
  cell: number;
  pieces: Block[];
}

/** the plugin's data on the model */
interface ModelData {
  blockout?: BlockoutData;
}

/** on the blockout group's definition – how it is found again */
interface GroupData {
  blockout: true;
}

export const DEFAULT_CELL = 0.5;

/** the pieces as stored with the model */
const storedBlockout = (): BlockoutData => {
  const stored = pluginContext().data.getModel<ModelData>()?.blockout;
  return { cell: stored?.cell ?? DEFAULT_CELL, pieces: stored?.pieces ?? [] };
};

/** the blockout's pieces – none once its group is erased (or the model cleared by a script): new ones start anew */
export const blockoutData = (): BlockoutData => {
  const stored = storedBlockout();
  return blockoutGroup() ? stored : { ...stored, pieces: [] };
};

export const storeBlockout = (blockout: BlockoutData) => {
  const context = pluginContext();
  context.data.setModel({ ...context.data.getModel<ModelData>(), blockout } satisfies ModelData);
};

const isBlockoutGroup = (definition: Definition) => !!pluginContext().data.get<GroupData>(definition)?.blockout;

/** the blockout group at the top of the model, if there is one */
export const blockoutGroup = (): Instance | undefined =>
  [...pluginContext().editor.model.root.instances.values()].find((instance) => isBlockoutGroup(instance.definition));

/** the doorways the level doors cut: a door's leaf lies in its local plane x = 0, so its wall runs along its local y */
const doorways = (): Doorway[] =>
  levelObjects()
    .filter((object) => object.kind === 'door')
    .map((door) => {
      const position = new THREE.Vector3(),
        rotation = new THREE.Quaternion(),
        scale = new THREE.Vector3();
      door.world.decompose(position, rotation, scale);
      const along = new THREE.Vector3(0, 1, 0).applyQuaternion(rotation);
      const [, width, height] = KINDS.door.size;
      return {
        x: position.x,
        y: position.y,
        z: position.z,
        angle: Math.atan2(along.y, along.x),
        // the opening is as wide as the leaf (inside the frame) and as high
        width: (width - 0.12) * scale.y,
        height: (height - 0.06) * scale.z,
      };
    });

/** builds the blockout group again from the pieces (inside a script – one undo step); removes it when there are none */
export const rebuildBlockout = (api: ScriptApi) => {
  const context = pluginContext();
  const model = context.editor.model;
  const old = blockoutGroup();
  const name = old?.name || t('level.blockout.groupName');
  if (old) {
    model.root.instances.delete(old.id);
    model.definitions.delete(old.definition.id);
  }
  const { cell, pieces } = storedBlockout();
  if (!pieces.length) {
    return null;
  }
  const materials = {
    floor: context.materials.ensure(t('level.blockout.materials.floor'), { color: '#a3a19c' }),
    wall: context.materials.ensure(t('level.blockout.materials.wall'), { color: '#d6d3cc' }),
    ceiling: context.materials.ensure(t('level.blockout.materials.ceiling'), { color: '#bdbab3' }),
    stairs: context.materials.ensure(t('level.blockout.materials.stairs'), { color: '#8f8c86' }),
  };
  const mesh = blockoutMesh(pieces, cell, materials, doorways());
  const handle = api.group(name, (inner) => {
    context.meshes.build(inner.ents, mesh, { smooth: 0 });
  });
  context.data.set(handle.inst.definition, { blockout: true } satisfies GroupData);
  return handle.inst.id;
};

const newBlockId = (kind: BlockKind, pieces: Block[]) => {
  for (let number = 1; ; number++) {
    const id = `${kind}-${number}`;
    if (!pieces.some((piece) => piece.id === id)) {
      return id;
    }
  }
};

const number = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);
const point = (value: unknown, fallback: [number, number]): [number, number] =>
  Array.isArray(value) && value.length >= 2 ? [number(value[0], fallback[0]), number(value[1], fallback[1])] : fallback;
const DIRECTIONS: BlockDirection[] = ['+x', '-x', '+y', '-y'];

/** a piece from loose options (a script's, the panel's) – everything checked, sizes at least one cell */
const pieceFrom = (kind: BlockKind, options: Record<string, unknown>, id: string, cell: number): Block => {
  const base = {
    id,
    floor: number(options.floor, 0),
    height: Math.max(cell, number(options.height, 3)),
    ceiling: !!options.ceiling,
  };
  if (kind === 'corridor') {
    return {
      ...base,
      kind,
      from: point(options.from, [0, 0]),
      to: point(options.to, [4, 0]),
      width: Math.max(cell, number(options.width, 2)),
      bend: options.bend === 'y' ? 'y' : 'x',
    };
  }
  const rect = {
    x: number(options.x, 0),
    y: number(options.y, 0),
    width: Math.max(cell, number(options.width, kind === 'stairs' ? 4 : 6)),
    depth: Math.max(cell, number(options.depth, kind === 'stairs' ? 1.5 : 5)),
  };
  if (kind === 'stairs') {
    return {
      ...base,
      ...rect,
      kind,
      rise: number(options.rise, 3),
      direction: DIRECTIONS.includes(options.direction as BlockDirection) ? (options.direction as BlockDirection) : '+x',
    };
  }
  return { ...base, ...rect, kind };
};

let lastBlock: string | null = null;
/** the id of the piece the last s3d.levelBlock added */
export const lastBlockId = () => lastBlock;

/** s3d.levelBlock(kind, options) – adds a room, corridor or stairs to the blockout; returns the piece's id */
export const addBlock = (api: ScriptApi, kind: string, options: Record<string, unknown> = {}) => {
  if (kind !== 'room' && kind !== 'corridor' && kind !== 'stairs') {
    throw new Error(t('level.blockout.errors.unknownKind', { kind }));
  }
  const blockout = blockoutData();
  if (typeof options.cell === 'number' && options.cell > 0) {
    blockout.cell = options.cell;
  }
  const piece = pieceFrom(kind, options, newBlockId(kind, blockout.pieces), blockout.cell);
  storeBlockout({ ...blockout, pieces: [...blockout.pieces, piece] });
  rebuildBlockout(api);
  lastBlock = piece.id;
  return piece.id;
};

/** s3d.levelBlockEdit(id, changes | null) – changes a piece (null removes it) and builds the blockout again */
export const editBlock = (api: ScriptApi, id: string, changes: Record<string, unknown> | null) => {
  const blockout = blockoutData();
  const piece = blockout.pieces.find((candidate) => candidate.id === id);
  if (!piece) {
    throw new Error(t('level.blockout.errors.unknownPiece', { id }));
  }
  const pieces = changes
    ? blockout.pieces.map((candidate) =>
        candidate.id === id ? pieceFrom(piece.kind, { ...piece, ...changes }, id, blockout.cell) : candidate,
      )
    : blockout.pieces.filter((candidate) => candidate.id !== id);
  storeBlockout({ ...blockout, pieces });
  rebuildBlockout(api);
  return pieces.length;
};

/** s3d.levelBlockout({ cell }) – builds the blockout again (after doors moved), optionally on another grid */
export const refreshBlockout = (api: ScriptApi, options: { cell?: number } = {}) => {
  // pieces left over from an erased group are dropped, not built again
  const blockout = blockoutData();
  storeBlockout(typeof options.cell === 'number' && options.cell > 0 ? { ...blockout, cell: options.cell } : blockout);
  rebuildBlockout(api);
  return blockoutData().pieces.length;
};

/** runs a blockout script function as one undo step (a toast on failure) */
export const runBlock = (call: string) => {
  const context = pluginContext();
  const result = context.script.run(call);
  if (!result.ok) {
    context.ui.toast(String(result.error ?? ''));
  }
  return result.ok;
};

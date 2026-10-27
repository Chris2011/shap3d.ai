import type { Definition, Instance } from '../../../src/core/model';
import type { ScriptApi } from '../../../src/scripting/api';
import { itemById, withDefaults, type CatalogItem, type Mount, type Params } from './catalog';
import { usePartsOf } from './parts';
import { ceilingHeight, findRoom, floorToFloor, roomAt } from './room';
import { pluginContext, t, THREE } from './runtime';

/**
 * Placed furniture: a component instance at the top level of the model whose definition carries what it is
 * (catalog item and parameters). Equal pieces share one component, like in the app.
 */

export interface FurnitureData {
  kind: 'furniture';
  item: string;
  /** the parameters as chosen (may hold "auto") */
  params: Params;
  /** the parameters it was built with ("auto" resolved from the room) */
  built?: Params;
  /** width, depth, height in metres */
  size: [number, number, number];
  mount: Mount;
  /** height of the underside above the floor */
  elevation: number;
}

export interface PlaceOptions {
  params?: Params;
  /** where its centre goes on the floor (x, y); z follows from how it is mounted */
  at?: [number, number];
  /** degrees around z */
  rotation?: number;
  /** an instance id: replaced by the new piece (same place, rotation and level) */
  replace?: number;
  /** the floor of a maisonette: 0 = lower, 1 = upper */
  level?: number;
}

export const furnitureOf = (definition: Definition) => {
  const data = pluginContext().data.get<FurnitureData>(definition);
  return data?.kind === 'furniture' ? data : null;
};

/** the placed pieces (top level of the model) */
export const placedFurniture = () =>
  [...pluginContext().editor.model.root.instances.values()].flatMap((instance) => {
    const data = furnitureOf(instance.definition);
    return data ? [{ instance, data }] : [];
  });

/** position (x, y) and rotation (degrees, around z) of an instance */
export const placementOf = (instance: Instance) => {
  const elements = instance.matrix.elements;
  return { x: elements[12], y: elements[13], z: elements[14], rotation: (Math.atan2(elements[1], elements[0]) * 180) / Math.PI };
};

/** the floor (level) a piece stands on: the highest one at or under its underside */
export const levelAt = (z: number, x?: number, y?: number) => {
  const levels = (x !== undefined && y !== undefined ? roomAt(x, y) : findRoom())?.levels ?? [];
  let found = 0;
  levels.forEach((level, index) => {
    if (level.z <= z + 0.01) {
      found = index;
    }
  });
  return found;
};
export const levelOf = (instance: Instance) => {
  const at = placementOf(instance);
  return levelAt(at.z, at.x, at.y);
};

/** the height the underside of a piece sits at in the room – on its level; under the ceiling (or slope) at (x, y) */
export const baseHeight = (data: Pick<FurnitureData, 'mount' | 'elevation' | 'size'>, level = 0, x?: number, y?: number) => {
  const room = x !== undefined && y !== undefined ? roomAt(x, y) : findRoom();
  const levels = room?.levels ?? [];
  const floor = levels[level]?.z ?? room?.z ?? 0;
  if (data.mount === 'ceiling') {
    const ceiling =
      room && x !== undefined && y !== undefined
        ? ceilingHeight(room.data, level, x - room.x0, y - room.y0)
        : (levels[level]?.height ?? 2.5);
    return floor + ceiling - data.size[2];
  }
  return floor + (data.mount === 'wall' ? data.elevation : 0);
};

export const placementMatrix = (x: number, y: number, z: number, rotation: number) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (rotation * Math.PI) / 180),
    new THREE.Vector3(1, 1, 1),
  );

/** what a piece of the catalog will be with these parameters */
export const describe = (item: CatalogItem, params: Params): FurnitureData => {
  const full = withDefaults(item, params);
  // e.g. a stair: "auto" rises from floor to floor of the room
  const built = item.resolve ? item.resolve(full, { floorToFloor: floorToFloor(findRoom()?.data) }) : full;
  return {
    kind: 'furniture',
    item: item.id,
    params: full,
    built,
    size: item.size(built),
    mount: item.mount,
    elevation: item.elevation?.(built) ?? 0,
  };
};

/** what makes two pieces the same component */
const keyOf = (data: FurnitureData) => JSON.stringify([data.item, data.built ?? data.params]);

/** a short name: the item's name and its size in cm, e.g. "Sofa 218 × 92 × 82" */
export const furnitureName = (data: FurnitureData) =>
  `${t(`roomplanner.items.${data.item}`)} ${data.size.map((value) => Math.round(value * 100)).join(' × ')}`;

let lastPlaced: number | null = null;
/** the instance id of the piece the last s3d.furniture call placed */
export const lastPlacedId = () => lastPlaced;

/**
 * s3d.furniture(item, options): places a piece of the catalog – the component is built once per item and
 * parameters and then reused. Runs inside a script (one undo step).
 */
export const placeFurniture = (api: ScriptApi, itemId: string, options: PlaceOptions = {}) => {
  const context = pluginContext();
  const model = context.editor.model;
  const item = itemById(itemId);
  if (!item) {
    throw new Error(t('roomplanner.errors.unknownItem', { item: itemId }));
  }
  const data = describe(item, options.params ?? {});
  const key = keyOf(data);
  let definition = [...model.definitions.values()].find((candidate) => {
    const existing = furnitureOf(candidate);
    return candidate.isComponent && existing && keyOf(existing) === key;
  });
  if (!definition) {
    const built = api.component(furnitureName(data), (s3d) => item.build(usePartsOf(s3d), data.built ?? data.params, data.size));
    definition = built.def;
    context.data.set(definition, data);
  }
  // where: the replaced piece's place, else the given point (default: the middle of the room)
  const replaced = options.replace != null ? model.root.instances.get(options.replace) : undefined;
  const active = findRoom();
  const previous = replaced ? placementOf(replaced) : null;
  const x = options.at?.[0] ?? previous?.x ?? (active ? (active.x0 + active.x1) / 2 : 0);
  const y = options.at?.[1] ?? previous?.y ?? (active ? (active.y0 + active.y1) / 2 : 0);
  // the room it stands in decides its floors
  const room = roomAt(x, y);
  const rotation = options.rotation ?? previous?.rotation ?? 0;
  const level = Math.min(options.level ?? (replaced ? levelOf(replaced) : 0), (room?.levels.length ?? 1) - 1);
  if (replaced) {
    model.root.instances.delete(replaced.id);
  }
  const instance = model.root.addInstance(definition, placementMatrix(x, y, baseHeight(data, level, x, y), rotation), '');
  // pieces upstairs are hidden with the upper floor
  const upperTag = room?.data.tags?.upper;
  if (level > 0 && upperTag) {
    instance.tag = api.ensureTag(upperTag);
  }
  lastPlaced = instance.id;
  return instance;
};

/** runs the s3d.furniture extension as one undo step; returns the new instance id (or null and a toast) */
export const runPlace = (itemId: string, options: PlaceOptions) => {
  const context = pluginContext();
  lastPlaced = null;
  const result = context.script.run(`s3d.furniture(${JSON.stringify(itemId)}, ${JSON.stringify(options)});`);
  if (!result.ok) {
    context.ui.toast(String(result.error ?? ''));
    return null;
  }
  return lastPlaced;
};

// ------------------------------------------------------------ footprints
export interface Footprint {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  z0: number;
  z1: number;
}

/** the box a piece takes in the room (axis aligned; turned pieces by their turned corners) */
export const footprint = (size: [number, number, number], x: number, y: number, z: number, rotation: number): Footprint => {
  const radians = (rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians)),
    sin = Math.abs(Math.sin(radians));
  const halfX = (size[0] * cos + size[1] * sin) / 2,
    halfY = (size[0] * sin + size[1] * cos) / 2;
  return { x0: x - halfX, y0: y - halfY, x1: x + halfX, y1: y + halfY, z0: z, z1: z + size[2] };
};

export const footprintOf = (instance: Instance, data: FurnitureData) => {
  const at = placementOf(instance);
  return footprint(data.size, at.x, at.y, at.z, at.rotation);
};

/** do two pieces take the same space (a little touching does not count)? */
export const overlaps = (a: Footprint, b: Footprint) =>
  a.x0 < b.x1 - 0.005 && b.x0 < a.x1 - 0.005 && a.y0 < b.y1 - 0.005 && b.y0 < a.y1 - 0.005 && a.z0 < b.z1 - 0.005 && b.z0 < a.z1 - 0.005;

// ------------------------------------------------------------ changes (each one undo step)
const commit = (label: string, change: () => void) => pluginContext().editor.commit(label, change);

export const moveFurniture = (instance: Instance, x: number, y: number, rotation: number) => {
  const data = furnitureOf(instance.definition);
  const z = data ? baseHeight(data, levelOf(instance), x, y) : placementOf(instance).z;
  commit('roomplanner.undo.move', () => instance.matrix.copy(placementMatrix(x, y, z, rotation)));
};

export const rotateFurniture = (instance: Instance, degrees: number) => {
  const at = placementOf(instance);
  moveFurniture(instance, at.x, at.y, (((Math.round(at.rotation) + degrees) % 360) + 360) % 360);
};

export const removeFurniture = (instances: Instance[]) =>
  commit('roomplanner.undo.remove', () => instances.forEach((instance) => pluginContext().editor.model.root.instances.delete(instance.id)));

/** a copy next to it (to the right, as far as it is wide) */
export const duplicateFurniture = (instance: Instance) => {
  const data = furnitureOf(instance.definition);
  const at = placementOf(instance);
  const radians = (at.rotation * Math.PI) / 180;
  const step = (data?.size[0] ?? 0.5) + 0.05;
  let copy: Instance | null = null;
  commit('roomplanner.undo.duplicate', () => {
    copy = pluginContext().editor.model.root.addInstance(
      instance.definition,
      placementMatrix(at.x + Math.cos(radians) * step, at.y + Math.sin(radians) * step, at.z, at.rotation),
      instance.name,
    );
    copy.tag = instance.tag;
  });
  return copy as Instance | null;
};

/** selects pieces in the app (by instance id) */
export const selectFurniture = (ids: number[]) =>
  pluginContext().editor.select(
    ids.map((id) => ({ kind: 'instance', id })),
    'set',
  );

/** the selected pieces (top level) */
export const selectedFurniture = () => {
  const editor = pluginContext().editor;
  return [...editor.selection.values()].flatMap((ref) => {
    if (ref.kind !== 'instance') {
      return [];
    }
    const instance = editor.model.root.instances.get(ref.id as number);
    const data = instance && furnitureOf(instance.definition);
    return instance && data ? [{ instance, data }] : [];
  });
};

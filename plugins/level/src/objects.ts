import type { Definition, Instance } from '../../../src/core/model';
import type { ScriptApi } from '../../../src/scripting/api';
import { KINDS, cleanActions, isKind, propsFor, type LevelAction, type ObjectKind, type PropValue } from './kinds';
import { blockoutGroup, rebuildBlockout } from './blockout';
import { pluginContext, t, THREE } from './runtime';

/**
 * Level objects in the model: one component per kind (its definition says which kind, `pluginData.level`), every
 * placed object an instance of it with its own id and properties (`instance.pluginData.level`). The app's tools
 * work on them – move, rotate, scale (a trigger's volume), erase, copy (a copy gets a new id).
 */

/** the data format of level objects – on the kind's component and on each instance */
export const LEVEL_FORMAT = { id: 'level.object', key: 'level', version: 1 };

export interface KindData {
  kind: ObjectKind;
}

export interface ObjectData {
  /** stable id, unique in the level – what a game engine refers to */
  id: string;
  props: Record<string, PropValue>;
  /** what it sets off on other objects (triggers and pickups) */
  actions?: LevelAction[];
}

/** does a value have the shape of the format (on a component or on an instance)? */
export const validLevelData = (value: unknown) => {
  const data = value as Partial<KindData & ObjectData> | undefined;
  return !!data && (isKind(data.kind) || (typeof data.id === 'string' && typeof data.props === 'object' && data.props !== null));
};

export const kindOf = (definition: Definition): ObjectKind | null => {
  const data = pluginContext().data.get<KindData>(definition);
  return isKind(data?.kind) ? data.kind : null;
};

export interface LevelObject {
  instance: Instance;
  kind: ObjectKind;
  id: string;
  props: Record<string, PropValue>;
  actions: LevelAction[];
  /** its place in the model (instances in groups count with their groups' places) */
  world: InstanceType<typeof THREE.Matrix4>;
}

/** every level object in the model, also inside groups – in the order they are found */
export const levelObjects = (): LevelObject[] => {
  const context = pluginContext();
  const found: LevelObject[] = [];
  const walk = (instances: Iterable<Instance>, parent: InstanceType<typeof THREE.Matrix4>) => {
    for (const instance of instances) {
      const world = parent.clone().multiply(instance.matrix);
      const kind = kindOf(instance.definition);
      if (kind) {
        const data = context.data.get<ObjectData>(instance);
        found.push({
          instance,
          kind,
          id: data?.id ?? '',
          props: propsFor(kind, data?.props),
          actions: KINDS[kind].actions ? cleanActions(data?.actions) : [],
          world,
        });
      } else {
        walk(instance.definition.entities.instances.values(), world);
      }
    }
  };
  walk(context.editor.model.root.instances.values(), new THREE.Matrix4());
  return found;
};

/** writes an object's data – what is not given stays as it is */
const writeObject = (object: Pick<LevelObject, 'instance' | 'id' | 'props' | 'actions'>, change: Partial<ObjectData>) => {
  const data: ObjectData = { id: object.id, props: object.props, ...change };
  const actions = change.actions ?? object.actions;
  if (actions.length) {
    data.actions = actions;
  } else {
    delete data.actions;
  }
  pluginContext().data.set(object.instance, data);
};

const newId = (kind: ObjectKind, taken: Set<string>) => {
  for (let number = 1; ; number++) {
    const id = `${kind}-${number}`;
    if (!taken.has(id)) {
      return id;
    }
  }
};

/**
 * Gives every level object an id of its own: copies made with the app's tools carry their original's id, objects
 * without one get one. Call inside an undo step. Returns how many changed.
 */
export const repairIds = () => {
  const taken = new Set<string>();
  let changed = 0;
  for (const object of levelObjects()) {
    if (!object.id || taken.has(object.id)) {
      const id = newId(object.kind, new Set([...taken, ...levelObjects().map((other) => other.id)]));
      writeObject(object, { id });
      object.id = id;
      changed++;
    }
    taken.add(object.id);
  }
  return changed;
};

/** the component of a kind – made the first time it is needed */
const kindComponent = (api: ScriptApi, kind: ObjectKind) => {
  const context = pluginContext();
  const existing = [...context.editor.model.definitions.values()].find(
    (definition) => definition.isComponent && kindOf(definition) === kind,
  );
  if (existing) {
    return existing;
  }
  const spec = KINDS[kind];
  const material = context.materials.ensure(t(`level.materials.${kind}`), { color: spec.colour, opacity: spec.opacity });
  const accent = context.materials.ensure(t('level.materials.accent'), { color: '#fafafa' });
  const handle = api.component(t(`level.kinds.${kind}`), (inner) => {
    context.meshes.build(inner.ents, spec.mesh(material, accent), { smooth: 30 });
  });
  context.data.set(handle.def, { kind } satisfies KindData);
  return handle.def;
};

export interface PlaceCall {
  /** where its origin goes (model coordinates, metres) – default: the origin */
  at?: [number, number, number] | { x: number; y: number; z: number };
  /** degrees around z – the way it faces */
  rotation?: number;
  /** for a trigger: its volume (width, depth, height in metres) */
  size?: [number, number, number];
  props?: Record<string, unknown>;
  /** for triggers and pickups: what they set off – [{ do: 'open', target: 'door-1' }, { do: 'sound', value: 'creak' }] */
  actions?: LevelAction[];
  name?: string;
}

let lastPlaced: number | null = null;
/** the instance id of the object the last s3d.levelObject placed */
export const lastPlacedId = () => lastPlaced;

/** s3d.levelObject(kind, { at, rotation, size, props, name }) – places a level object; returns its instance id */
export const placeObject = (api: ScriptApi, kind: string, call: PlaceCall = {}) => {
  if (!isKind(kind)) {
    throw new Error(t('level.errors.unknownKind', { kind, kinds: Object.keys(KINDS).join(', ') }));
  }
  const context = pluginContext();
  const definition = kindComponent(api, kind);
  const at = Array.isArray(call.at) ? call.at : call.at ? [call.at.x, call.at.y, call.at.z] : [0, 0, 0];
  const spec = KINDS[kind];
  const scale = call.size ? call.size.map((value, axis) => Math.max(0.05, value) / spec.size[axis]) : [1, 1, 1];
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(at[0], at[1], at[2]),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ((call.rotation ?? 0) * Math.PI) / 180),
    new THREE.Vector3(scale[0], scale[1], scale[2]),
  );
  const taken = new Set(levelObjects().map((object) => object.id));
  const id = newId(kind, taken);
  const instance = context.editor.model.root.addInstance(definition, matrix, call.name ?? uniqueName(kind));
  const actions = spec.actions ? cleanActions(call.actions) : [];
  context.data.set(instance, { id, props: propsFor(kind, call.props), ...(actions.length ? { actions } : {}) } satisfies ObjectData);
  // a door in a blockout wall cuts its doorway
  if (kind === 'door' && blockoutGroup()) {
    rebuildBlockout(api);
  }
  lastPlaced = instance.id;
  return instance.id;
};

/** "Spawn 3" – the next free number for the kind */
const uniqueName = (kind: ObjectKind) => {
  const names = new Set(levelObjects().map((object) => object.instance.name));
  for (let number = 1; ; number++) {
    const name = `${t(`level.kinds.${kind}`)} ${number}`;
    if (!names.has(name)) {
      return name;
    }
  }
};

/** runs s3d.levelObject as one undo step; returns the new instance id (or null and a toast) */
export const runPlace = (kind: ObjectKind, call: PlaceCall) => {
  const context = pluginContext();
  lastPlaced = null;
  const result = context.script.run(`s3d.levelObject(${JSON.stringify(kind)}, ${JSON.stringify(call)});`);
  if (!result.ok) {
    context.ui.toast(String(result.error ?? ''));
    return null;
  }
  return lastPlaced;
};

// ------------------------------------------------------------ changes (each one undo step)

export const setProp = (object: LevelObject, name: string, value: PropValue) =>
  pluginContext().editor.commit('level.undo.property', () => writeObject(object, { props: { ...object.props, [name]: value } }));

export const setActions = (object: LevelObject, actions: LevelAction[]) =>
  pluginContext().editor.commit('level.undo.actions', () => writeObject(object, { actions: cleanActions(actions) }));

export const renameObject = (object: LevelObject, name: string) =>
  pluginContext().editor.commit('level.undo.rename', () => {
    object.instance.name = name;
  });

export const setObjectId = (object: LevelObject, id: string) => {
  if (!id || levelObjects().some((other) => other.id === id && other.instance !== object.instance)) {
    pluginContext().ui.toast(t('level.errors.idTaken', { id }));
    return;
  }
  // what pointed at the old id (actions, a teleporter's target) points at the new one
  pluginContext().editor.commit('level.undo.rename', () => {
    for (const other of levelObjects()) {
      const targets = KINDS[other.kind].props.filter((spec) => spec.type === 'target' && other.props[spec.name] === object.id);
      const actions = other.actions.map((action) => (action.target === object.id ? { ...action, target: id } : action));
      if (other.instance === object.instance) {
        continue;
      }
      if (targets.length || actions.some((action, index) => action !== other.actions[index])) {
        writeObject(other, { props: { ...other.props, ...Object.fromEntries(targets.map((spec) => [spec.name, id])) }, actions });
      }
    }
    writeObject(object, { id });
  });
};

/** selects level objects in the app (instances at the top level; inside groups their outermost group) */
export const selectObjects = (instances: Instance[]) => {
  const editor = pluginContext().editor;
  const top = instances.map((instance) => {
    if (editor.model.root.instances.has(instance.id)) {
      return instance.id;
    }
    const outer = [...editor.model.root.instances.values()].find((candidate) => contains(candidate.definition, instance));
    return outer?.id ?? instance.id;
  });
  editor.select(
    top.map((id) => ({ kind: 'instance', id })),
    'set',
  );
};

const contains = (definition: Definition, instance: Instance): boolean =>
  [...definition.entities.instances.values()].some((child) => child === instance || contains(child.definition, instance));

/** the selected level objects */
export const selectedObjects = () => {
  const editor = pluginContext().editor;
  const ids = new Set([...editor.selection.values()].filter((ref) => ref.kind === 'instance').map((ref) => ref.id as number));
  return levelObjects().filter((object) => ids.has(object.instance.id));
};

/** the way a fixed camera looks: along its +x, tilted by its pitch (degrees, negative = down) – in model space */
export const cameraLook = (object: LevelObject) => {
  const pitch = ((Number(object.props.pitch) || 0) * Math.PI) / 180;
  const rotation = new THREE.Quaternion();
  object.world.decompose(new THREE.Vector3(), rotation, new THREE.Vector3());
  return new THREE.Vector3(Math.cos(pitch), 0, Math.sin(pitch)).applyQuaternion(rotation).normalize();
};

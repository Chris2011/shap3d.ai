import { checkLevel } from './checks';
import { buildNav } from './nav';
import { levelAtmosphere, type LevelAtmosphere } from './lights';
import { KINDS, type LevelAction } from './kinds';
import { cameraLook, levelObjects, repairIds } from './objects';
import { pluginContext, THREE } from './runtime';

/**
 * The level file: the level objects with their ids, kinds, properties and places, next to the model exported as
 * glTF. Places are in glTF's space (metres, Y up – the app's glTF export turns Z up into Y up the same way), and
 * `node` is the object's name, which is the name of its node in the glTF.
 */

export const LEVEL_FILE_FORMAT = 'shap3d-level';
export const LEVEL_FILE_VERSION = 1;

export interface LevelFileObject {
  id: string;
  kind: string;
  name: string;
  node: string;
  position: [number, number, number];
  /** quaternion x, y, z, w */
  rotation: [number, number, number, number];
  scale: [number, number, number];
  /** the volume it takes (width, depth, height at its scale) – what a trigger watches */
  size: [number, number, number];
  props: Record<string, unknown>;
  /** what it sets off on other objects, by their ids (triggers and pickups) */
  actions?: LevelAction[];
  /** a fixed camera or a spot light: the way it looks (a unit vector, with its pitch) */
  look?: [number, number, number];
  /**
   * the same place in the model's own space – metres, Z up, right-handed – with the angle it faces around Z
   * (degrees, 0 = along +X, counter-clockwise) and its tilt (degrees, cameras and spots): what engine templates that
   * are Z up (Unreal) or that rebuild the turn themselves read
   */
  model: { position: [number, number, number]; yaw: number; pitch: number; look?: [number, number, number] };
}

export interface LevelFile {
  format: typeof LEVEL_FILE_FORMAT;
  version: number;
  name: string;
  units: 'm';
  up: 'y';
  /** the level's mood: daylight (0 … 1) and fog (colour, from where, up to where) – lights are objects of kind light */
  atmosphere: Omit<LevelAtmosphere, 'preview'>;
  objects: LevelFileObject[];
  /**
   * Where the player can walk from the spawn points: the centres of the walking grid's cells (size `cell`) in glTF's
   * space and the links between them (indices, each pair once) – for an engine's own AI or to check its nav mesh.
   */
  nav: { cell: number; points: [number, number, number][]; links: [number, number][] };
  /** problems found while exporting – the same as the Level panel lists (e.g. two objects with the same name) */
  warnings: string[];
}

const round = (value: number, digits = 4) => Math.round(value * 10 ** digits) / 10 ** digits;

export const levelFile = (): LevelFile => {
  const context = pluginContext();
  // Z up (the app) → Y up (glTF)
  const toGltf = new THREE.Matrix4().makeRotationX(-Math.PI / 2);
  const all = levelObjects();
  const objects = all.map((object): LevelFileObject => {
    const position = new THREE.Vector3(),
      rotation = new THREE.Quaternion(),
      scale = new THREE.Vector3();
    // the rotation takes the turn to Y up along, so the scale stays along the object's own axes
    toGltf.clone().multiply(object.world).decompose(position, rotation, scale);
    const size = KINDS[object.kind].size;
    return {
      id: object.id,
      kind: object.kind,
      name: object.instance.name,
      node: object.instance.name || object.instance.definition.name,
      position: [round(position.x), round(position.y), round(position.z)],
      rotation: [round(rotation.x, 6), round(rotation.y, 6), round(rotation.z, 6), round(rotation.w, 6)],
      scale: [round(scale.x), round(scale.y), round(scale.z)],
      size: [round(size[0] * scale.x), round(size[1] * scale.y), round(size[2] * scale.z)],
      props: { ...object.props },
      ...(object.actions.length ? { actions: object.actions.map((action) => ({ ...action })) } : {}),
      model: (() => {
        const at = new THREE.Vector3().setFromMatrixPosition(object.world);
        const along = new THREE.Vector3(1, 0, 0).transformDirection(object.world);
        const looks = object.kind === 'camera' || (object.kind === 'light' && object.props.type === 'spot');
        return {
          position: [round(at.x), round(at.y), round(at.z)] as [number, number, number],
          yaw: round((Math.atan2(along.y, along.x) * 180) / Math.PI, 3),
          pitch: looks ? Number(object.props.pitch) || 0 : 0,
          ...(looks
            ? {
                look: cameraLook(object)
                  .toArray()
                  .map((value) => round(value, 6)) as [number, number, number],
              }
            : {}),
        };
      })(),
      ...(object.kind === 'camera' || (object.kind === 'light' && object.props.type === 'spot')
        ? {
            look: cameraLook(object)
              .applyMatrix4(toGltf)
              .toArray()
              .map((value) => round(value, 6)) as [number, number, number],
          }
        : {}),
    };
  });
  const grid = buildNav(all);
  const kept = new Map<number, number>();
  grid.nodes.forEach((node, index) => node.reached && kept.set(index, kept.size));
  const nav: LevelFile['nav'] = { cell: round(grid.cell, 3), points: [], links: [] };
  for (const [index, at] of kept) {
    // Z up → Y up: (x, y, z) → (x, z, −y)
    const { x, y, z } = grid.nodes[index].position;
    nav.points[at] = [round(x, 3), round(z, 3), round(-y, 3)];
    for (const other of grid.links[index]) {
      const to = kept.get(other);
      if (to !== undefined && (to > at || !grid.links[other].includes(index))) {
        nav.links.push([at, to]);
      }
    }
  }
  return {
    format: LEVEL_FILE_FORMAT,
    version: LEVEL_FILE_VERSION,
    name: context.editor.model.name,
    units: 'm',
    up: 'y',
    atmosphere: (({ preview: _preview, ...rest }) => rest)(levelAtmosphere()),
    objects,
    nav,
    warnings: [...checkLevel(all), ...grid.problems].map((problem) => problem.text),
  };
};

/** the level file for an export – ids of copied objects are made unique first (one undo step, only if needed) */
export const exportedLevelFile = () => {
  const context = pluginContext();
  if (levelObjects().some((object, index, all) => !object.id || all.findIndex((other) => other.id === object.id) !== index)) {
    context.editor.commit('level.undo.ids', () => repairIds());
  }
  return levelFile();
};

/** the level file as text */
export const levelJson = () => JSON.stringify(exportedLevelFile(), null, 2);

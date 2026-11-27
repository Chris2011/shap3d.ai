// The boards in the model: groups and components marked as boards (data on their definition, so all copies of a
// component are boards), found in every group, with their sizes in their own axes – a turned board keeps its sizes.
import type { Matrix4 } from 'three';
import type { Entities, Instance } from '../../../src/core/model';
import type { PluginContext } from '../../../src/plugins/types';
import type { BoardData, BoardItem } from './boards';
import { THREE } from './runtime';

export const boardOf = (context: PluginContext, instance: Instance | undefined) =>
  instance ? context.data.get<{ board?: BoardData }>(instance.definition)?.board : undefined;

/** marks the groups as boards with these settings, or (null) makes them plain groups again – one undo step */
export const setBoards = (context: PluginContext, instances: Instance[], board: BoardData | null, label: string) => {
  context.editor.commit(label, () => {
    for (const instance of instances) {
      context.data.set(instance.definition, board ? { board: { ...board } } : undefined);
    }
  });
};

/** the material most of the group's faces have – used when the group itself has none */
const facesMaterial = (entities: Entities) => {
  const counts = new Map<string, number>();
  for (const face of entities.faces.values()) {
    if (face.material) {
      counts.set(face.material, (counts.get(face.material) ?? 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/** the group's size in its own axes, stretched by the scale in `world` (its place in the model) */
export const boardSize = (instance: Instance, world: Matrix4): [number, number, number] => {
  const size = instance.definition.entities.bounds().getSize(new THREE.Vector3());
  const scale = new THREE.Vector3();
  world.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
  return [Math.abs(size.x * scale.x), Math.abs(size.y * scale.y), Math.abs(size.z * scale.z)];
};

export const collectBoards = (context: PluginContext): BoardItem[] => {
  const items: BoardItem[] = [];
  const walk = (entities: Entities, matrix: Matrix4, inherited: string | undefined) => {
    for (const instance of entities.instances.values()) {
      if (instance.hidden) {
        continue;
      }
      const world = matrix.clone().multiply(instance.matrix);
      const material = instance.material ?? inherited;
      const board = boardOf(context, instance);
      if (board) {
        items.push({
          name: instance.name || instance.definition.name,
          material: material ?? facesMaterial(instance.definition.entities) ?? '',
          size: boardSize(instance, world),
          board,
        });
        continue; // a board is one piece – what lies inside it is not cut on its own
      }
      walk(instance.definition.entities, world, material);
    }
  };
  walk(context.editor.model.root, new THREE.Matrix4(), undefined);
  return items;
};

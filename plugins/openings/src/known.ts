// Where every opening sat after the last change – so the end of an undo step can tell which ones were deleted, moved
// or copied (see follow.ts). The plugin's own steps note what they did themselves, so they are not handled twice.
import type { Matrix4 } from 'three';
import type { Entities, Instance } from '../../../src/core/model';
import type { OpeningData } from './place';

export interface Known {
  entities: Entities;
  matrix: Matrix4;
  data: OpeningData;
}

export const known = new Map<number, Known>();

/** this opening sits here now, with its hole */
export const noteOpening = (entities: Entities, instance: Instance, data: OpeningData) =>
  known.set(instance.id, { entities, matrix: instance.matrix.clone(), data: { ...data } });

/** this opening is gone, its hole handled */
export const forgetOpening = (id: number) => known.delete(id);

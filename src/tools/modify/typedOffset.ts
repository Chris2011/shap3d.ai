// What a length typed while Move runs means.
import * as THREE from 'three';
import type { Editor } from '../../engine/editor';
import { parseLengthList } from '../../core/units';
import type { GapPicker } from './gaps';

/**
 * The offset to end the move at: the space to the neighbour picked with Tab, three lengths `x; y; z`, or a distance
 * along the way moved so far (red if it has not moved yet). Null when the text is none of these.
 */
export const typedOffset = (
  editor: Editor,
  text: string,
  lengthOf: (text: string) => number | null,
  delta: THREE.Vector3,
  gaps: GapPicker,
): THREE.Vector3 | null => {
  if (gaps.hot) {
    const length = lengthOf(text);
    return length != null && length >= 0 ? gaps.deltaFor(length, delta) : null;
  }
  const lengths = parseLengthList(text, editor.model.settings.units);
  if (lengths.length === 3 && lengths.every((x) => x != null)) {
    return new THREE.Vector3(lengths[0]!, lengths[1]!, lengths[2]!);
  }
  const distance = lengthOf(text);
  if (distance == null) {
    return null;
  }
  const direction = delta.lengthSq() > 1e-12 ? delta.clone().normalize() : new THREE.Vector3(1, 0, 0);
  return direction.multiplyScalar(distance);
};

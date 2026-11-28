// Changing a placed window or door. Sashes, bars and hinges only build its pieces again; a new size first closes the
// old hole in the wall (the hole's sides go, its front and back are filled and healed into the wall faces) and then
// cuts the new one, centred where the old one was.
import type { Vector3 } from 'three';
import type { Entities, Instance } from '../../../src/core/model';
import type { PluginContext } from '../../../src/plugins/types';
import type { OpeningParams } from './parts';
import { buildPieces, cutHole, openingOf, openingPlace, type OpeningData } from './place';
import { fillHole, holeCorners } from './hole';
import { t } from './runtime';

/** the wall face the opening sat in, now whole again: the one facing out at the old hole's middle */
const wallFaceAt = (entities: Entities, point: Vector3, outward: Vector3) =>
  [...entities.faces.values()].find((face) => entities.faceNormal(face).dot(outward) > 0.999 && entities.pointInFace(face, point, false));

/**
 * New settings for a placed opening – one undo step. A new size closes the old hole and cuts the new one; when the new
 * one does not fit or cannot be cut, nothing changes (the app says why) and false is returned.
 */
export const changeOpening = (context: PluginContext, instance: Instance, patch: Partial<OpeningParams>) => {
  const data = openingOf(context, instance);
  if (!data) {
    return true;
  }
  const changed: OpeningData = { ...data, ...patch, kind: data.kind };
  if (changed.kind === 'door') {
    changed.sill = 0;
  }
  const resized = changed.width !== data.width || changed.height !== data.height || changed.sill !== data.sill;
  const entities = context.editor.entities;
  try {
    context.editor.commit('openings.undo.change', () => {
      if (resized && entities.instances.has(instance.id)) {
        const { outer, inner, inward } = holeCorners(instance.matrix, data);
        fillHole(entities, outer, inner);
        const middle = outer[0].clone().lerp(outer[2], 0.5);
        const face = wallFaceAt(entities, middle, inward.clone().negate());
        const place = face && openingPlace(entities, face.id, middle, changed);
        // throwing undoes everything done in this step
        if (!place || 'error' in place || !place.fits) {
          throw new Error(t('openings.errors.tooBig'));
        }
        if (cutHole(entities, place.corners, place.normal) === null) {
          throw new Error(t('openings.errors.cutFailed'));
        }
        instance.matrix.setPosition(place.corners[0]);
      }
      context.data.set(instance.definition, { opening: changed });
      buildPieces(context, instance.definition.entities, changed);
    });
    return true;
  } catch {
    return false;
  }
};

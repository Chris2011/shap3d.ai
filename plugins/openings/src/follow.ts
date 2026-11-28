// The holes follow their openings, however the app's own tools change them: at the end of every undo step the
// openings are compared with where they sat after the last change (known.ts).
// - deleted (Delete key, eraser, cut): the hole is closed – while the model's switch is on
// - moved (Move tool, arrow keys): the old hole is closed and a new one cut where it is now
// - copied or pasted: the copy gets a hole of its own
// All in the same undo step. The "Remove and close hole" button closes it whatever the switch says.
import { watch } from 'vue';
import type { Entities, Instance } from '../../../src/core/model';
import type { PluginContext } from '../../../src/plugins/types';
import { closeHole, holeCorners } from './hole';
import { forgetOpening, known, type Known } from './known';
import { buildPieces, cutHole, openingOf } from './place';
import { t } from './runtime';

/** the model's switch "Close the hole when deleting" – on unless switched off */
export const closesHoles = (context: PluginContext) => context.data.getModel<{ closeOnDelete?: boolean }>()?.closeOnDelete !== false;

export const setClosesHoles = (context: PluginContext, on: boolean) =>
  context.editor.commit('openings.undo.setting', () => {
    context.data.setModel({ ...context.data.getModel<Record<string, unknown>>(), closeOnDelete: on });
  });

/** every opening in the model with the entities it sits in, and all entities in the model */
const collect = (context: PluginContext) => {
  const found = new Map<number, Known & { instance: Instance }>();
  const reachable = new Set<Entities>();
  const walk = (entities: Entities) => {
    reachable.add(entities);
    for (const instance of entities.instances.values()) {
      const data = openingOf(context, instance);
      if (data) {
        found.set(instance.id, { instance, entities, matrix: instance.matrix.clone(), data: { ...data } });
      } else {
        walk(instance.definition.entities);
      }
    }
  };
  walk(context.editor.model.root);
  return { found, reachable };
};

/**
 * Cuts the hole of an opening where it sits now: it must lie upright and unscaled on one wall face. A new wall's
 * thickness and the new sill height are taken over (the pieces are built again). False when it is not on a wall.
 */
const openWhereItIs = (context: PluginContext, { instance, entities, data }: Known & { instance: Instance }) => {
  const { outer, along, inward } = holeCorners(instance.matrix, data);
  if (Math.abs(along.length() - 1) > 1e-6 || Math.abs(inward.length() - 1) > 1e-6 || Math.abs(inward.z) > 1e-6) {
    return false;
  }
  const normal = inward.clone().negate();
  const checks = outer.flatMap((corner, index) => [corner, corner.clone().lerp(outer[(index + 1) % 4], 0.5)]);
  const face = [...entities.faces.values()].find(
    (candidate) =>
      entities.faceNormal(candidate).dot(normal) > 0.999 && checks.every((point) => entities.pointInFace(candidate, point, false)),
  );
  if (!face) {
    return false;
  }
  const bottom = Math.min(...entities.facePoints(face).map((corner) => corner.z));
  const thickness = cutHole(entities, outer, normal);
  if (thickness === null) {
    return false;
  }
  const changed = { ...data, thickness, sill: data.kind === 'door' ? 0 : Math.max(0, outer[0].z - bottom) };
  context.data.set(instance.definition, { opening: changed });
  if (thickness !== data.thickness) {
    buildPieces(context, instance.definition.entities, changed);
  }
  return true;
};

/** starts following the openings; returns the function that stops it */
export const followOpenings = (context: PluginContext) => {
  const remember = () => {
    known.clear();
    for (const [id, { instance: _instance, ...where }] of collect(context).found) {
      known.set(id, where);
    }
  };
  remember();
  // after every change – also undo, redo and opening a model, which end no undo step
  const stopWatching = watch(() => context.editor.ui.revision, remember);
  const stopListening = context.events.onUndoStep(() => {
    const { found, reachable } = collect(context);
    const toOpen: (Known & { instance: Instance })[] = [];
    // first close every hole that is left behind, so a new one may overlap it
    for (const [id, old] of known) {
      const now = found.get(id);
      const moved = now && (now.entities !== old.entities || !now.matrix.equals(old.matrix));
      // a deleted wall leaves nothing to close
      if (reachable.has(old.entities) && (moved || (!now && closesHoles(context)))) {
        closeHole(old.entities, old.matrix, old.data);
      }
      if (moved) {
        toOpen.push(now);
      }
    }
    toOpen.push(...[...found.values()].filter((now) => !known.has(now.instance.id)));
    if (toOpen.map((now) => openWhereItIs(context, now)).includes(false)) {
      context.ui.toast(t('openings.errors.offWall'));
    }
  });
  return () => {
    stopWatching();
    stopListening();
  };
};

/** removes the opening and closes its hole, whatever the switch says – one undo step */
export const removeOpening = (context: PluginContext, instance: Instance) => {
  const data = openingOf(context, instance);
  const entities = context.editor.entities;
  if (!data || !entities.instances.has(instance.id)) {
    return;
  }
  context.editor.commit('openings.undo.remove', () => {
    closeHole(entities, instance.matrix, data);
    entities.instances.delete(instance.id);
    forgetOpening(instance.id); // closed already
    context.editor.select([]);
  });
};

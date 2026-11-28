// Deleting a window or door: the "Remove and close hole" button, and – while the model's switch is on – every other
// way of deleting one (Delete key, eraser, cut). For those the plugin keeps a list of where each opening sat, made
// again after every change; at the end of an undo step, the openings missing from it close their holes in that step.
import { watch } from 'vue';
import type { Matrix4 } from 'three';
import type { Entities, Instance } from '../../../src/core/model';
import type { PluginContext } from '../../../src/plugins/types';
import { closeHole } from './hole';
import { openingOf, type OpeningData } from './place';

interface Known {
  entities: Entities;
  matrix: Matrix4;
  data: OpeningData;
}

/** the model's switch "Close the hole when deleting" – on unless switched off */
export const closesHoles = (context: PluginContext) => context.data.getModel<{ closeOnDelete?: boolean }>()?.closeOnDelete !== false;

export const setClosesHoles = (context: PluginContext, on: boolean) =>
  context.editor.commit('openings.undo.setting', () => {
    context.data.setModel({ ...context.data.getModel<Record<string, unknown>>(), closeOnDelete: on });
  });

/** every opening in the model with the entities it sits in, and all entities in the model */
const collect = (context: PluginContext) => {
  const found = new Map<number, Known>();
  const reachable = new Set<Entities>();
  const walk = (entities: Entities) => {
    reachable.add(entities);
    for (const instance of entities.instances.values()) {
      const data = openingOf(context, instance);
      if (data) {
        found.set(instance.id, { entities, matrix: instance.matrix.clone(), data: { ...data } });
      } else {
        walk(instance.definition.entities);
      }
    }
  };
  walk(context.editor.model.root);
  return { found, reachable };
};

let known = new Map<number, Known>();

/** starts watching for deleted openings; returns the function that stops it */
export const watchDeletedOpenings = (context: PluginContext) => {
  const remember = () => {
    known = collect(context).found;
  };
  remember();
  // after every change – also undo, redo and opening a model, which end no undo step
  const stopWatching = watch(() => context.editor.ui.revision, remember);
  const stopListening = context.events.onUndoStep(() => {
    if (!closesHoles(context)) {
      return;
    }
    const { found, reachable } = collect(context);
    for (const [id, old] of known) {
      // gone from a wall that is still there (deleting the whole wall leaves nothing to close)
      if (!found.has(id) && reachable.has(old.entities)) {
        closeHole(old.entities, old.matrix, old.data);
      }
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
    known.delete(instance.id); // closed already
    context.editor.select([]);
  });
};

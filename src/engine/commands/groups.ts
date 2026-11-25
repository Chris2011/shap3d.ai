// Groups and components from the selection, and taking them apart again.
import * as THREE from 'three';
import { createSolidProcedure, dropInputs, explodeToInputs } from '../../core/procedures';
import { isSolid } from '../../core/solids';
import type { Editor } from '../editor';
import type { EntityRef } from '../../core/model';
import { t } from '../../i18n';

/**
 * A group of closed bodies and holes (groups marked as a hole) takes the holes away from the bodies – as a procedure, so
 * the holes can still be moved. Returns false when the selection is no such mix.
 */
const groupWithHoles = (editor: Editor, name?: string) => {
  const refs = editor.selected();
  const parts = refs
    .map((entityRef) => (entityRef.kind === 'instance' ? editor.entities.instances.get(entityRef.id) : undefined))
    .filter((instance) => instance !== undefined);
  // loose faces or edges in the selection: a plain group as before
  if (parts.length !== refs.length) {
    return false;
  }
  const holes = parts.filter((part) => part.hole),
    bodies = parts.filter((part) => !part.hole);
  if (!holes.length || !bodies.length) {
    return false;
  }
  if (parts.some((part) => !isSolid(part.definition.entities))) {
    editor.toast(t('toast.holesNeedSolids'));
    return false;
  }
  try {
    editor.commit('commands.makeGroup', () => {
      const groupName = name || editor.model.uniqueDefName(t('names.group'));
      const procedure = createSolidProcedure(editor.model, editor.entities, 'subtract', bodies[0], holes, bodies.slice(1), groupName);
      editor.select([{ kind: 'instance', id: procedure.id }]);
    });
  } catch {
    // commit has put everything back and said so
  }
  return true;
};

export const makeGroup = (editor: Editor, component: boolean, name?: string) => {
  const refs = editor.selected();
  if (!refs.length) {
    editor.toast(t('toast.nothingSelected'));
    return;
  }
  if (!component && groupWithHoles(editor, name)) {
    return;
  }
  editor.commit(component ? 'undo.makeComponent' : 'commands.makeGroup', () => {
    const { entities } = editor.entities.extract(refs);
    // component axes: put origin at the bbox min corner like SketchUp
    const box = entities.bounds();
    const insertOrigin = component && !box.isEmpty() ? box.min.clone() : new THREE.Vector3();
    const matrix = new THREE.Matrix4().makeTranslation(insertOrigin.x, insertOrigin.y, insertOrigin.z);
    if (component) {
      for (const vertex of entities.vertices.values()) {
        vertex.position.sub(insertOrigin);
      }
      for (const instance of entities.instances.values()) {
        instance.matrix.premultiply(new THREE.Matrix4().makeTranslation(-insertOrigin.x, -insertOrigin.y, -insertOrigin.z));
      }
      entities.invalidateHash();
    }
    const def = editor.model.newDefinition(
      name || editor.model.uniqueDefName(component ? t('names.component') : t('names.group')),
      component,
      entities,
    );
    const inst = editor.entities.addInstance(def, component ? matrix : new THREE.Matrix4(), component ? '' : '');
    editor.select([{ kind: 'instance', id: inst.id }]);
  });
};

export const explode = (editor: Editor) => {
  const refs = editor.selected().filter((entityRef) => entityRef.kind === 'instance');
  if (!refs.length) {
    return;
  }
  editor.commit('commands.explode', () => {
    const out: EntityRef[] = [];
    for (const entityRef of refs) {
      const instance = editor.entities.instances.get(entityRef.id);
      if (!instance) {
        continue;
      }
      dropInputs(instance.definition);
      out.push(...editor.entities.merge(instance.definition.entities, instance.matrix, editor.model, instance.material));
      editor.entities.instances.delete(instance.id);
    }
    editor.model.purge();
    editor.select(out);
  });
};

/** the selected procedures go, what they were made from is back as ordinary groups */
export const explodeSelectedToInputs = (editor: Editor) => {
  const procedures = editor
    .selected()
    .map((entityRef) => (entityRef.kind === 'instance' ? editor.entities.instances.get(entityRef.id) : undefined))
    .filter((instance) => !!instance?.definition.procedure);
  if (!procedures.length) {
    return;
  }
  editor.commit('commands.explodeToInputs', () => {
    const out = procedures.flatMap((instance) => explodeToInputs(editor.entities, instance!));
    editor.model.purge();
    editor.select(out.map((input) => ({ kind: 'instance' as const, id: input.id })));
  });
};

/** Lock or unlock the selected groups and components (one undo step). */
export const setLocked = (editor: Editor, locked: boolean) =>
  editor.commit(locked ? 'commands.lock' : 'commands.unlock', () => {
    for (const entityRef of editor.selected()) {
      const instance = entityRef.kind === 'instance' ? editor.entities.instances.get(entityRef.id) : undefined;
      if (instance) {
        instance.locked = locked;
      }
    }
  });

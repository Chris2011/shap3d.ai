import type { Editor } from './editor';
import type { EntityRef } from '../core/model';
import { parseLength } from '../core/units';

type Entities = Editor['entities'];

/** Applies `apply` to every selected element in one undo step called `label`. */
const forEachSelected = (editor: Editor, label: string, apply: (entityRef: EntityRef, entities: Entities) => void) => {
  editor.commit(label, () => {
    for (const entityRef of editor.selected()) {
      apply(entityRef, editor.entities);
    }
  });
};

/** the face, edge or group/component an entity reference points to */
const elementOf = (
  entityRef: EntityRef,
  entities: Entities,
): { tag?: string; hidden?: boolean; soft?: boolean; locked?: boolean } | undefined =>
  entityRef.kind === 'face'
    ? entities.faces.get(entityRef.id)
    : entityRef.kind === 'edge'
      ? entities.edges.get(entityRef.id)
      : entities.instances.get(entityRef.id);

/** Paints the selected faces (front or back) and groups/components (front only) with `material`, or the default. */
export const paintSelection = (editor: Editor, side: 'material' | 'backMaterial', material: string | undefined) =>
  forEachSelected(editor, 'undo.paint', (entityRef, entities) => {
    if (entityRef.kind === 'face') {
      const face = entities.faces.get(entityRef.id);
      if (face) {
        face[side] = material;
      }
    }
    if (entityRef.kind === 'instance' && side === 'material') {
      const instance = entities.instances.get(entityRef.id);
      if (instance) {
        instance.material = material;
      }
    }
  });

/** Puts the selection on the tag `tag` ('Untagged' = none). */
export const tagSelection = (editor: Editor, tag: string) => {
  const value = tag === 'Untagged' ? undefined : tag;
  forEachSelected(editor, 'undo.tag', (entityRef, entities) => {
    const element = elementOf(entityRef, entities);
    if (element) {
      element.tag = value;
    }
  });
};

/** Sets hidden (everything), soft (edges) or locked (groups/components) on the selection. */
export const setSelectionFlag = (editor: Editor, flag: 'hidden' | 'soft' | 'locked', on: boolean) =>
  forEachSelected(
    editor,
    flag === 'hidden' ? 'commands.hide' : flag === 'soft' ? 'commands.soften' : 'commands.lock',
    (entityRef, entities) => {
      if ((flag === 'soft' && entityRef.kind !== 'edge') || (flag === 'locked' && entityRef.kind !== 'instance')) {
        return;
      }
      const element = elementOf(entityRef, entities);
      if (element) {
        element[flag] = entityRef.kind === 'instance' ? on : on || undefined;
      }
    },
  );

/** Names the selected groups/components (the instance, not its definition). */
export const nameSelection = (editor: Editor, name: string) =>
  forEachSelected(editor, 'undo.rename', (entityRef, entities) => {
    const instance = entities.instances.get(entityRef.id);
    if (instance) {
      instance.name = name;
    }
  });

/** Renames the definitions of the selected groups/components – an empty name is ignored. */
export const nameSelectedDefinitions = (editor: Editor, name: string) =>
  forEachSelected(editor, 'undo.renameDefinition', (entityRef, entities) => {
    const instance = entities.instances.get(entityRef.id);
    if (instance && name.trim()) {
      instance.definition.name = name.trim();
    }
  });

/** Sets (or with `null` removes) an attribute on the definitions of the selected groups/components. */
export const setSelectionAttribute = (editor: Editor, key: string, value: string | null) =>
  forEachSelected(editor, 'undo.attribute', (entityRef, entities) => {
    const definition = entities.instances.get(entityRef.id)?.definition;
    if (definition && value === null) {
      delete definition.attributes?.[key];
    } else if (definition) {
      // no prototype on it: a key may be called anything
      (definition.attributes ??= Object.create(null) as Record<string, string>)[key] = value!;
    }
  });

/** Moves the selected groups/components to `text` (a length in the model's units) along axis 0/1/2. */
export const placeSelection = (editor: Editor, axis: number, text: string) => {
  const length = parseLength(text, editor.model.settings.units);
  if (length == null) {
    return;
  }
  forEachSelected(editor, 'entityInfo.position', (entityRef, entities) => {
    const instance = entities.instances.get(entityRef.id);
    if (instance) {
      instance.matrix.elements[12 + axis] = length;
    }
  });
};

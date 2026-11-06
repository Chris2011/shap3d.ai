import * as THREE from 'three';
import { useLocalStorage } from '@vueuse/core';
import type { Editor } from './editor';
import { Entities, type Definition } from '../core/model';
import { PEOPLE, DEFAULT_PERSON, buildPerson } from '../core/people';

/** Face-me component definition for one of the reference people (reused if already in the model). */
export const personDefinition = (editor: Editor, key = DEFAULT_PERSON): Definition => {
  const person = PEOPLE[key] ?? PEOPLE[DEFAULT_PERSON];
  const name = person.label;
  const existing = [...editor.model.definitions.values()].find(
    (definition) => definition.isComponent && definition.faceMe && definition.name === name,
  );
  if (existing) {
    return existing;
  }
  const ents = new Entities();
  buildPerson(ents, person.svg);
  const def = editor.model.newDefinition(name, true, ents);
  def.faceMe = true;
  return def;
};

/** SketchUp's default template contains a reference person next to the origin. */
export const addScaleFigure = (editor: Editor, key = DEFAULT_PERSON) => {
  editor.model.root.addInstance(personDefinition(editor, key), new THREE.Matrix4().makeTranslation(1.1, 0.6, 0), '');
  editor.invalidate();
};

export const installDefaults = (editor: Editor) => {
  editor.onNewModel.push(() => addScaleFigure(editor));
};

/** the switch in the File menu, remembered in the browser */
export const autosaveOn = useLocalStorage('s3d.autosave', true);
let autosaveTooBig = Infinity;

/** Keep unsaved work in the browser; a clean model clears the slot so a fresh start stays fresh. */
export const autosave = (editor: Editor) => {
  if (!autosaveOn.value) {
    return;
  }
  try {
    if (!editor.ui.saved) {
      // a model that did not fit into the browser's storage is not written out again and again
      const faces =
        editor.model.root.faces.size +
        [...editor.model.definitions.values()].reduce((sum, definition) => sum + definition.entities.faces.size, 0);
      if (faces >= autosaveTooBig) {
        return;
      }
      try {
        localStorage.setItem('s3d:autosave', JSON.stringify({ ...editor.model.toJSON(), _dirty: true }));
      } catch {
        autosaveTooBig = faces;
      }
    } else {
      localStorage.removeItem('s3d:autosave');
    }
  } catch {
    /* storage unavailable */
  }
};

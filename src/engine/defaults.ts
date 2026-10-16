import * as THREE from 'three';
import type { Editor } from './editor';
import { Entities, type Definition } from '../core/model';
import { PEOPLE, DEFAULT_PERSON, buildPerson } from '../core/people';

/** Face-me component definition for one of the reference people (reused if already in the model). */
export function personDefinition(ed: Editor, key = DEFAULT_PERSON): Definition {
  const p = PEOPLE[key] ?? PEOPLE[DEFAULT_PERSON];
  const name = p.label;
  const existing = [...ed.model.definitions.values()].find(d => d.isComponent && d.faceMe && d.name === name);
  if (existing) return existing;
  const ents = new Entities();
  buildPerson(ents, p.svg);
  const def = ed.model.newDefinition(name, true, ents);
  def.faceMe = true;
  return def;
}

/** SketchUp's default template contains a reference person next to the origin. */
export function addScaleFigure(ed: Editor, key = DEFAULT_PERSON) {
  ed.model.root.addInstance(personDefinition(ed, key), new THREE.Matrix4().makeTranslation(1.1, 0.6, 0), '');
  ed.invalidate();
}

export function installDefaults(ed: Editor) { ed.onNewModel.push(() => addScaleFigure(ed)); }

/** Keep unsaved work in the browser; a clean model clears the slot so a fresh start stays fresh. */
export function autosave(ed: Editor) {
  try {
    if (!ed.ui.saved) localStorage.setItem('s3d:autosave', JSON.stringify({ ...ed.model.toJSON(), _dirty: true }));
    else localStorage.removeItem('s3d:autosave');
  } catch { /* storage unavailable */ }
}

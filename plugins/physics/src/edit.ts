import type { Instance } from '../../../src/core/model';
import { bodyData, writeBodyData, writeSettings, type BodyData, type JointData, type PhysicsSettings } from './data';
import { applySettings, resetSim } from './sim';
import { findInstance } from './scene';
import { pluginContext, t } from './runtime';
import { usePhysicsState } from './state';

/**
 * Changes from the panel and the tools – each one undo step. Changing a body while the simulation runs puts it back
 * to the start (the bodies are built from the model); changing the settings goes on with the new ones.
 */

export const changeBody = (instance: Instance, change: Partial<BodyData> | null) => {
  const editor = pluginContext().editor;
  editor.commit('physics.undo.body', () => {
    if (change === null) {
      writeBodyData(instance, undefined);
      return;
    }
    const next = { ...(bodyData(instance) ?? { type: 'dynamic' as const }), ...change };
    // a value set to undefined is removed
    for (const key of Object.keys(next) as (keyof BodyData)[]) {
      if (next[key] === undefined) {
        delete next[key];
      }
    }
    writeBodyData(instance, next);
  });
  usePhysicsState().revision++;
};

export const changeJoint = (instance: Instance, index: number, change: Partial<JointData> | null) => {
  const data = bodyData(instance);
  if (!data) {
    return;
  }
  const joints = [...(data.joints ?? [])];
  if (change === null) {
    joints.splice(index, 1);
  } else {
    const next = { ...joints[index], ...change } as JointData;
    for (const key of Object.keys(next) as (keyof JointData)[]) {
      if (next[key] === undefined) {
        delete next[key];
      }
    }
    joints[index] = next;
  }
  changeBody(instance, { joints: joints.length ? joints : undefined });
};

export const changeSettings = (change: Partial<PhysicsSettings>) => {
  const editor = pluginContext().editor;
  let settings: PhysicsSettings | null = null;
  editor.commit('physics.undo.settings', () => {
    settings = writeSettings(change);
  });
  if (settings) {
    applySettings(settings);
  }
};

/** the selected instance – one group or component, in the context being edited */
export const selectedInstance = () => {
  const editor = pluginContext().editor;
  const refs = [...editor.selection.values()].filter((ref) => ref.kind === 'instance');
  if (refs.length !== 1) {
    return null;
  }
  return findInstance(refs[0].id as number)?.instance ?? null;
};

/** the selected instances (groups and components) */
export const selectedInstances = () => {
  const editor = pluginContext().editor;
  return [...editor.selection.values()]
    .filter((ref) => ref.kind === 'instance')
    .map((ref) => findInstance(ref.id as number)?.instance)
    .filter((instance): instance is Instance => !!instance);
};

/** makes the selected groups bodies of a type (or plain again with null) – one undo step */
export const markSelected = (type: BodyData['type'] | null) => {
  const instances = selectedInstances();
  const context = pluginContext();
  if (!instances.length) {
    context.ui.toast(t('physics.errors.nothingSelected'));
    return;
  }
  resetSim();
  context.editor.commit('physics.undo.body', () => {
    for (const instance of instances) {
      writeBodyData(instance, type ? { ...bodyData(instance), type } : undefined);
    }
  });
  usePhysicsState().revision++;
};

/** changes the physics data of all selected bodies at once (the simple view's material) – one undo step */
export const changeSelected = (change: Partial<BodyData>) => {
  const instances = selectedInstances().filter((instance) => bodyData(instance));
  if (!instances.length) {
    return;
  }
  resetSim();
  pluginContext().editor.commit('physics.undo.body', () => {
    for (const instance of instances) {
      writeBodyData(instance, { ...bodyData(instance)!, ...change });
    }
  });
  usePhysicsState().revision++;
};

import { KINDS, actionSpec } from './kinds';
import type { LevelObject } from './objects';
import { t } from './runtime';

/**
 * What a game engine would trip over: no spawn point, names or ids used twice, actions and teleporters pointing at
 * objects that are not there (or of the wrong kind), locked doors whose key nothing gives, fixed cameras without a
 * first one. Each problem names the object it is about, so the panel can select it.
 */

export interface LevelProblem {
  text: string;
  /** the object it is about – the panel selects it on a click */
  object?: LevelObject;
}

export const checkLevel = (objects: LevelObject[]): LevelProblem[] => {
  const problems: LevelProblem[] = [];
  if (objects.length && !objects.some((object) => object.kind === 'spawn')) {
    problems.push({ text: t('level.warnings.noSpawn') });
  }
  const byName = new Map<string, LevelObject[]>();
  objects.forEach((object) => byName.set(object.instance.name, [...(byName.get(object.instance.name) ?? []), object]));
  for (const [name, same] of byName) {
    if (same.length > 1) {
      problems.push({ text: t('level.warnings.sameName', { name, count: same.length }), object: same[1] });
    }
  }
  const byId = new Map<string, LevelObject>();
  for (const object of objects) {
    if (byId.has(object.id)) {
      problems.push({ text: t('level.warnings.sameId', { id: object.id }), object });
    }
    byId.set(object.id, object);
  }
  const nameOf = (object: LevelObject) => object.instance.name || object.id;

  for (const object of objects) {
    // targets of properties (a teleporter's destination)
    for (const spec of KINDS[object.kind].props) {
      const target = object.props[spec.name];
      if (spec.type !== 'target' || !target) {
        continue;
      }
      const found = byId.get(String(target));
      if (!found || (spec.targets && !spec.targets.includes(found.kind))) {
        problems.push({ text: t('level.warnings.missingTarget', { name: nameOf(object), id: String(target) }), object });
      }
    }
    // targets of actions
    for (const action of object.actions) {
      const spec = actionSpec(action.do);
      if (!spec.targets) {
        continue;
      }
      const found = action.target ? byId.get(action.target) : undefined;
      if (!found || (spec.targets !== 'any' && !spec.targets.includes(found.kind))) {
        problems.push({
          text: t('level.warnings.actionTarget', {
            name: nameOf(object),
            action: t(`level.actions.${action.do}`),
            id: action.target || '–',
          }),
          object,
        });
      }
    }
  }

  // a locked door needs a key that a pickup gives – or an action that unlocks it
  const items = new Set(objects.filter((object) => object.kind === 'pickup').map((object) => String(object.props.item)));
  const unlocked = new Set(
    objects.flatMap((object) => object.actions.filter((action) => action.do === 'unlock').map((action) => action.target)),
  );
  for (const door of objects.filter((object) => object.kind === 'door' && object.props.locked)) {
    const key = String(door.props.key);
    if (!unlocked.has(door.id) && (!key || !items.has(key))) {
      problems.push({ text: t(key ? 'level.warnings.keyMissing' : 'level.warnings.noKey', { name: nameOf(door), key }), object: door });
    }
  }

  // fixed cameras: one of them is the first (or the game starts without a view)
  const cameras = objects.filter((object) => object.kind === 'camera');
  if (cameras.length && !cameras.some((camera) => camera.props.start)) {
    problems.push({ text: t('level.warnings.noStartCamera'), object: cameras[0] });
  }
  // enemies that wait for an action nothing sets off
  const spawned = new Set(
    objects.flatMap((object) => object.actions.filter((action) => action.do === 'spawn').map((action) => action.target)),
  );
  for (const enemy of objects.filter((object) => object.kind === 'enemy' && object.props.when === 'action' && !spawned.has(object.id))) {
    problems.push({ text: t('level.warnings.enemyNeverComes', { name: nameOf(enemy) }), object: enemy });
  }
  return problems;
};

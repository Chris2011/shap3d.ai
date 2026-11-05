import * as THREE from 'three';
import {
  copyInstanceDetails,
  Definition,
  Entities,
  isProcedureInput,
  type DefinitionRegistry,
  type Instance,
  type ProcedureRole,
} from './model';
import { cutKeepingGroups, isSolid, solidOp, type SolidOp } from './solids';

/**
 * Procedures: non-destructive modelling. A procedural group keeps what it was made from – its inputs, as child groups
 * marked with their role – and how (`Definition.procedure`). Its own geometry is the result, built again whenever an
 * input or a parameter changes. Inputs lie in the definition like any child, so saving, undo, purge and copying need
 * nothing special; they are hidden until the group is opened, then they are what can be edited.
 *
 * Messages are keys (`procedures.errors.…`) – the core knows no language.
 */

type V3 = THREE.Vector3;

interface ProcedureModel extends DefinitionRegistry {
  newDefinition(name: string, isComponent: boolean, entities?: Entities): Definition;
}

export type ProcedureSolidOp = Extract<SolidOp, 'union' | 'subtract' | 'intersect' | 'outershell'>;
export const PROCEDURE_SOLID_OPS: ProcedureSolidOp[] = ['union', 'subtract', 'intersect', 'outershell'];

/** the most copies Copy Along makes */
const MAX_COPIES = 2000;

export interface PathLine {
  points: V3[];
  closed: boolean;
}

/** edges joined end to end into one line – null if they branch or do not hang together */
export const edgeChain = (ents: Entities, edgeIds: Iterable<number>): PathLine | null => {
  const neighbours = new Map<number, number[]>();
  let size = 0;
  for (const id of edgeIds) {
    const edge = ents.edges.get(id);
    if (edge) {
      size++;
      neighbours.set(edge.start, [...(neighbours.get(edge.start) ?? []), edge.end]);
      neighbours.set(edge.end, [...(neighbours.get(edge.end) ?? []), edge.start]);
    }
  }
  if (!size || [...neighbours.values()].some((next) => next.length > 2)) {
    return null;
  }
  const loose = [...neighbours.keys()].find((vertex) => neighbours.get(vertex)!.length === 1);
  const first = loose ?? neighbours.keys().next().value!;
  const order = [first];
  const seen = new Set(order);
  let current = first;
  for (;;) {
    const next = neighbours.get(current)!.find((vertex) => !seen.has(vertex));
    if (next === undefined) {
      break;
    }
    order.push(next);
    seen.add(next);
    current = next;
  }
  if (order.length !== neighbours.size) {
    return null;
  }
  return { points: order.map((vertex) => ents.positionOf(vertex).clone()), closed: loose === undefined };
};

/** the edges hanging together with an edge in a single line: on from both ends while exactly one edge goes on */
export const connectedEdges = (ents: Entities, edgeId: number): number[] => {
  const edge = ents.edges.get(edgeId);
  if (!edge) {
    return [];
  }
  const found = new Set([edgeId]);
  const walk = (start: number) => {
    let at = start;
    for (;;) {
      const next = ents.edgesOfVertex(at).filter((other) => !found.has(other.id));
      if (next.length !== 1 || ents.edgesOfVertex(at).length !== 2) {
        return;
      }
      found.add(next[0].id);
      at = next[0].start === at ? next[0].end : next[0].start;
    }
  };
  walk(edge.start);
  walk(edge.end);
  return [...found];
};

/** a path made ready for a profile: an open one starts at the end nearest it, a closed one at the corner nearest it */
export const orientPath = (path: PathLine, near: V3): V3[] => {
  const { points, closed } = path;
  if (!closed) {
    return points[points.length - 1].distanceTo(near) < points[0].distanceTo(near) ? [...points].reverse() : points;
  }
  let best = 0;
  points.forEach((point, index) => {
    if (point.distanceTo(near) < points[best].distanceTo(near)) {
      best = index;
    }
  });
  return [...points.slice(best), ...points.slice(0, best)];
};

const inputsOf = (definition: Definition, role: ProcedureRole) =>
  [...definition.entities.instances.values()].filter((instance) => instance.procedureRole === role);

/** the line a path input's edges make, in the coordinates of the procedure */
const pathOf = (input: Instance | undefined): PathLine | null => {
  if (!input) {
    return null;
  }
  const line = edgeChain(input.definition.entities, input.definition.entities.edges.keys());
  return line && { closed: line.closed, points: line.points.map((point) => point.clone().applyMatrix4(input.matrix)) };
};

/** a result that holds on to nothing – for chaining solid operations */
const scratch = (entities: Entities): Instance => ({
  id: -1,
  definition: new Definition('', false, entities),
  matrix: new THREE.Matrix4(),
  name: '',
});

const buildSolid = (definition: Definition, fresh: { entities: Entities }, defs: ProcedureModel): string | null => {
  const operation = definition.procedure!.params.operation as ProcedureSolidOp;
  const [target] = inputsOf(definition, 'target');
  const tools = inputsOf(definition, 'tool');
  if (!target || !tools.length) {
    return 'procedures.errors.missingInput';
  }
  if ([target, ...tools].some((input) => !isSolid(input.definition.entities))) {
    return 'procedures.errors.notSolid';
  }
  let result: Entities;
  if (operation === 'subtract' || operation === 'intersect') {
    // these two keep the groups inside the target: each is cut on its own. The target lies at the procedure's origin
    const toTarget = target.matrix.clone().invert();
    result = target.definition.entities;
    for (const tool of tools) {
      result = cutKeepingGroups(operation, result, tool, toTarget.clone().multiply(tool.matrix), { defs, role: 'result' });
    }
  } else {
    let accumulated = target;
    for (const tool of tools) {
      accumulated = scratch(solidOp('union', accumulated, tool)[0]);
    }
    result = accumulated.definition.entities;
  }
  if (!result.faces.size && !result.instances.size) {
    return 'procedures.errors.empty';
  }
  fresh.entities = result;
  return null;
};

const buildFollowMe = (definition: Definition, fresh: { entities: Entities }, defs: DefinitionRegistry): string | null => {
  const profiles = inputsOf(definition, 'profile');
  const path = pathOf(inputsOf(definition, 'path')[0]);
  if (!profiles.length) {
    return 'procedures.errors.missingInput';
  }
  if (!path || path.points.length < 2) {
    return 'procedures.errors.noPath';
  }
  const entities = new Entities();
  for (const profile of profiles) {
    const refs = entities.merge(profile.definition.entities, profile.matrix, defs, profile.material);
    for (const ref of refs.filter((entry) => entry.kind === 'face')) {
      const face = entities.faces.get(ref.id);
      if (face && !entities.followMe(ref.id, orientPath(path, entities.faceCenter(face)), path.closed)) {
        return 'procedures.errors.followMe';
      }
    }
  }
  if (!entities.faces.size) {
    return 'procedures.errors.empty';
  }
  fresh.entities = entities;
  return null;
};

const buildCopyAlong = (definition: Definition, fresh: { entities: Entities }): string | null => {
  const { mode, count, spacing, align } = definition.procedure!.params as { mode: string; count: number; spacing: number; align: boolean };
  const sources = inputsOf(definition, 'source');
  const path = pathOf(inputsOf(definition, 'path')[0]);
  if (!sources.length) {
    return 'procedures.errors.missingInput';
  }
  if (!path || path.points.length < 2) {
    return 'procedures.errors.noPath';
  }
  const points = path.closed ? [...path.points, path.points[0]] : path.points;
  const lengths = [0];
  for (let index = 1; index < points.length; index++) {
    lengths.push(lengths[index - 1] + points[index].distanceTo(points[index - 1]));
  }
  const total = lengths[lengths.length - 1];
  if (total < 1e-9) {
    return 'procedures.errors.noPath';
  }
  // how many copies, how far apart – a closed path does not put one on its start twice
  const copies =
    mode === 'spacing'
      ? spacing > 1e-9
        ? Math.floor(total / spacing + 1e-9) + (path.closed ? 0 : 1)
        : Infinity
      : Math.max(1, Math.round(count));
  if (copies > MAX_COPIES) {
    return 'procedures.errors.tooMany';
  }
  const step = mode === 'spacing' ? spacing : copies > 1 ? total / (path.closed ? copies : copies - 1) : 0;
  const at = (distance: number) => {
    let index = 1;
    while (index < points.length - 1 && lengths[index] < distance - 1e-9) {
      index++;
    }
    const length = lengths[index] - lengths[index - 1];
    const share = length > 0 ? (distance - lengths[index - 1]) / length : 0;
    return {
      point: points[index - 1].clone().lerp(points[index], share),
      direction: points[index]
        .clone()
        .sub(points[index - 1])
        .normalize(),
    };
  };
  const start = at(0);
  const entities = new Entities();
  for (let number = 0; number < copies; number++) {
    const { point, direction } = at(number * step);
    const turn = align ? new THREE.Quaternion().setFromUnitVectors(start.direction, direction) : new THREE.Quaternion();
    // from the start of the path to here: the sources keep where they lie to the path
    const place = new THREE.Matrix4()
      .makeTranslation(point.x, point.y, point.z)
      .multiply(new THREE.Matrix4().makeRotationFromQuaternion(turn))
      .multiply(new THREE.Matrix4().makeTranslation(-start.point.x, -start.point.y, -start.point.z));
    for (const source of sources) {
      const copy = copyInstanceDetails(
        source,
        entities.addInstance(source.definition, source.matrix.clone().premultiply(place), source.name),
      );
      copy.procedureRole = 'result';
      copy.hidden = false;
    }
  }
  fresh.entities = entities;
  return null;
};

/** a number for what the result is made from – its parameters are compared by whoever changes them */
const inputsHash = (definition: Definition) => {
  let hash = 7;
  const add = (value: number) => {
    hash = (hash * 31 + Math.round(value * 1e5)) % 2147483647;
  };
  const addText = (text?: string) => {
    for (const character of text ?? '') {
      add(character.charCodeAt(0));
    }
  };
  const walk = (entities: Entities) => {
    add(entities.edges.size);
    add(entities.faces.size);
    for (const vertex of entities.vertices.values()) {
      add(vertex.position.x);
      add(vertex.position.y);
      add(vertex.position.z);
    }
    for (const face of entities.faces.values()) {
      addText(face.material);
    }
    for (const instance of entities.instances.values()) {
      instance.matrix.elements.forEach(add);
      addText(instance.material);
      walk(instance.definition.entities);
    }
  };
  for (const instance of definition.entities.instances.values()) {
    if (isProcedureInput(instance)) {
      addText(instance.procedureRole);
      addText(instance.material);
      instance.matrix.elements.forEach(add);
      walk(instance.definition.entities);
    }
  }
  return hash;
};

/**
 * Builds a procedure's result anew: the geometry and the copies go, the inputs stay. On a problem the last result stays
 * and the message's key is returned (and kept on the procedure until it works again).
 */
export const rebuildProcedure = (definition: Definition, defs: ProcedureModel): string | null => {
  const procedure = definition.procedure;
  if (!procedure) {
    return null;
  }
  const fresh = { entities: new Entities() };
  let error: string | null;
  try {
    error =
      procedure.kind === 'solid'
        ? buildSolid(definition, fresh, defs)
        : procedure.kind === 'followme'
          ? buildFollowMe(definition, fresh, defs)
          : buildCopyAlong(definition, fresh);
  } catch (failure) {
    console.error(failure);
    error = 'procedures.errors.failed';
  }
  procedure.hash = inputsHash(definition);
  procedure.error = error ?? undefined;
  if (error) {
    return error;
  }
  for (const instance of definition.entities.instances.values()) {
    if (isProcedureInput(instance)) {
      fresh.entities.instances.set(instance.id, instance);
    }
  }
  definition.entities = fresh.entities;
  return null;
};

/**
 * At the end of an undo step: every procedure whose inputs changed is built again, the inner ones first, so a procedure
 * made from another one follows it. Returns the message keys of what failed.
 */
export const rebuildChangedProcedures = (definitions: Iterable<Definition>, defs: ProcedureModel): string[] => {
  const all = [...definitions];
  if (!all.some((definition) => definition.procedure)) {
    return [];
  }
  const errors: string[] = [];
  const seen = new Set<Definition>();
  const visit = (definition: Definition) => {
    if (seen.has(definition)) {
      return;
    }
    seen.add(definition);
    for (const instance of definition.entities.instances.values()) {
      visit(instance.definition);
    }
    if (definition.procedure && definition.procedure.hash !== inputsHash(definition)) {
      const error = rebuildProcedure(definition, defs);
      if (error) {
        errors.push(error);
      }
    }
  };
  all.forEach(visit);
  return errors;
};

/** moves a group into a procedure as one of its inputs: hidden, in the procedure's coordinates */
const takeInput = (from: Entities, into: Definition, input: Instance, role: ProcedureRole, toProcedure?: THREE.Matrix4) => {
  from.instances.delete(input.id);
  if (toProcedure) {
    input.matrix.premultiply(toProcedure);
  }
  input.procedureRole = role;
  input.hidden = true;
  into.entities.instances.set(input.id, input);
};

/**
 * Solid tool as a procedure: it takes the target's place, name, tag and data, its inputs go inside. Throws the message's
 * key when there is no result, so the undo step is dropped.
 */
export const createSolidProcedure = (
  model: ProcedureModel,
  ents: Entities,
  operation: ProcedureSolidOp,
  target: Instance,
  tools: Instance[],
) => {
  const definition = model.newDefinition(target.definition.name, false);
  definition.procedure = { kind: 'solid', params: { operation } };
  if (target.definition.pluginData) {
    definition.pluginData = JSON.parse(JSON.stringify(target.definition.pluginData));
  }
  const procedure = copyInstanceDetails(target, ents.addInstance(definition, target.matrix.clone(), target.name));
  // its data lives on the procedure now and goes back when it is exploded to its inputs
  target.pluginData = undefined;
  const toProcedure = target.matrix.clone().invert();
  takeInput(ents, definition, target, 'target', toProcedure);
  tools.forEach((tool) => takeInput(ents, definition, tool, 'tool', toProcedure));
  const error = rebuildProcedure(definition, model);
  if (error) {
    throw new Error(error);
  }
  return procedure;
};

/** the loose path and the profile as inputs of a Follow Me procedure, in place */
export const createFollowMeProcedure = (
  model: ProcedureModel,
  ents: Entities,
  faceId: number,
  pathEdges: number[],
  names: { group: string; profile: string; path: string },
) => {
  const definition = model.newDefinition(names.group, false);
  definition.procedure = { kind: 'followme', params: {} };
  const take = (refs: Parameters<Entities['extract']>[0], name: string, role: ProcedureRole) => {
    const input = definition.entities.addInstance(model.newDefinition(name, false, ents.extract(refs).entities), new THREE.Matrix4(), name);
    input.procedureRole = role;
    input.hidden = true;
  };
  take([{ kind: 'face', id: faceId }], names.profile, 'profile');
  take(
    pathEdges.map((id) => ({ kind: 'edge' as const, id })),
    names.path,
    'path',
  );
  const error = rebuildProcedure(definition, model);
  if (error) {
    throw new Error(error);
  }
  return ents.addInstance(definition, new THREE.Matrix4(), '');
};

/** Copy Along: the sources and the path (a group, or a line of its own) go inside the new procedure */
export const createCopyAlongProcedure = (
  model: ProcedureModel,
  ents: Entities,
  sources: Instance[],
  path: Instance | Entities,
  names: { group: string; path: string },
) => {
  const definition = model.newDefinition(names.group, false);
  definition.procedure = { kind: 'copyalong', params: { mode: 'count', count: 5, spacing: 1, align: true } };
  sources.forEach((source) => takeInput(ents, definition, source, 'source'));
  if (path instanceof Entities) {
    const input = definition.entities.addInstance(model.newDefinition(names.path, false, path), new THREE.Matrix4(), names.path);
    input.procedureRole = 'path';
    input.hidden = true;
  } else {
    takeInput(ents, definition, path, 'path');
  }
  const error = rebuildProcedure(definition, model);
  if (error) {
    throw new Error(error);
  }
  return ents.addInstance(definition, new THREE.Matrix4(), '');
};

/** Explode to inputs: the procedure goes, its inputs are ordinary groups again where they were; returns them */
export const explodeToInputs = (ents: Entities, instance: Instance): Instance[] => {
  const inputs = [...instance.definition.entities.instances.values()].filter(isProcedureInput);
  for (const input of inputs) {
    instance.definition.entities.instances.delete(input.id);
    input.matrix.premultiply(instance.matrix);
    if (input.procedureRole === 'target' && instance.pluginData) {
      input.pluginData = instance.pluginData;
    }
    input.procedureRole = undefined;
    input.hidden = false;
    ents.instances.set(input.id, input);
  }
  ents.instances.delete(instance.id);
  return inputs;
};

/** before a procedure is exploded into its result: the inputs go, the copies become ordinary groups */
export const dropInputs = (definition: Definition) => {
  for (const instance of [...definition.entities.instances.values()]) {
    if (isProcedureInput(instance)) {
      definition.entities.instances.delete(instance.id);
    } else {
      instance.procedureRole = undefined;
    }
  }
  definition.procedure = undefined;
};

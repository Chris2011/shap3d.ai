// A part from lines: the line it follows (taken from the selection), its kind and sizes – kept on its group, so it can be
// changed later and built again; and building it as one undo step.
import type { Editor } from '../../../engine/editor';
import { Entities, type Instance } from '../../../core/model';
import type { PluginContext } from '../../types';
import { spiralMesh, stairMesh, wallMesh, type Point, type SpiralParams, type StairParams, type WallParams } from './geometry';

export type PartKind = 'wall' | 'stairs' | 'spiral';
export type PartParams = WallParams | StairParams | SpiralParams;
export interface PartData {
  kind: PartKind;
  params: PartParams;
  /** the line, in the coordinates of the group's own space */
  path: Point[];
  closed: boolean;
}

export const DEFAULTS: { wall: WallParams; stairs: StairParams; spiral: SpiralParams } = {
  wall: { thickness: 0.24, height: 2.5, align: 'center' },
  stairs: { width: 1, height: 2.8, steps: 16 },
  spiral: { height: 2.8, steps: 14, turn: 360, inner: 0.1, thickness: 0.05 },
};

/** the selected line: a chain of edges (or the outline of one face), in order; null when the selection is no single line */
export const pathFromSelection = (editor: Editor) => {
  const entities = editor.entities;
  const selection = editor.selected();
  const faces = selection.filter((ref) => ref.kind === 'face');
  if (faces.length === 1 && selection.every((ref) => ref.kind !== 'instance')) {
    const face = entities.faces.get(faces[0].id)!;
    return {
      points: face.outer.map((vertex) => entities.positionOf(vertex).toArray() as Point),
      closed: true,
      edges: entities.faceEdges(face).map((edge) => edge.id),
    };
  }
  const edges = selection.filter((ref) => ref.kind === 'edge').map((ref) => entities.edges.get(ref.id)!);
  if (!edges.length || faces.length || selection.some((ref) => ref.kind === 'instance')) {
    return null;
  }
  const neighbours = new Map<number, number[]>();
  for (const edge of edges) {
    neighbours.set(edge.start, [...(neighbours.get(edge.start) ?? []), edge.end]);
    neighbours.set(edge.end, [...(neighbours.get(edge.end) ?? []), edge.start]);
  }
  if ([...neighbours.values()].some((list) => list.length > 2)) {
    return null; // a fork: more than one way to go
  }
  const ends = [...neighbours.keys()].filter((vertex) => neighbours.get(vertex)!.length === 1);
  const closed = ends.length === 0;
  const order = [closed ? edges[0].start : ends[0]];
  while (order.length <= edges.length) {
    const next = neighbours.get(order[order.length - 1])!.find((vertex) => vertex !== order[order.length - 2]);
    if (next === undefined || (closed && next === order[0])) {
      break;
    }
    order.push(next);
  }
  // several separate lines selected: the walk stops early
  if (order.length !== (closed ? edges.length : edges.length + 1)) {
    return null;
  }
  return { points: order.map((vertex) => entities.positionOf(vertex).toArray() as Point), closed, edges: edges.map((edge) => edge.id) };
};

export const partMesh = (part: PartData) => {
  const [first, last] = [part.path[0], part.path[part.path.length - 1]];
  if (part.kind === 'wall') {
    return wallMesh(part.path, part.closed, part.params as WallParams);
  }
  if (part.kind === 'stairs') {
    return stairMesh(first, last, part.params as StairParams);
  }
  return spiralMesh(
    first,
    Math.hypot(last[0] - first[0], last[1] - first[1]),
    Math.atan2(last[1] - first[1], last[0] - first[0]),
    part.params as SpiralParams,
  );
};

export const partOf = (context: PluginContext, instance: Instance | undefined) =>
  instance ? context.data.get<{ part?: PartData }>(instance.definition)?.part : undefined;

/** builds the part as a new group where the line was; the line goes (it lives on in the part) – one undo step */
export const createPart = (context: PluginContext, kind: PartKind, params: PartParams, name: string) => {
  const editor = context.editor;
  const line = pathFromSelection(editor);
  if (!line || line.points.length < 2) {
    return false;
  }
  const part: PartData = { kind, params: { ...params }, path: line.points, closed: line.closed };
  editor.commit('linework.undo.create', () => {
    const definition = editor.model.newDefinition(editor.model.uniqueDefName(name), false);
    context.meshes.build(definition.entities, partMesh(part));
    context.data.set(definition, { part });
    for (const id of line.edges) {
      editor.entities.eraseEdge(id, true);
    }
    editor.entities.removeOrphanVertices();
    const instance = editor.entities.addInstance(definition);
    editor.select([{ kind: 'instance', id: instance.id }]);
  });
  return true;
};

/**
 * new sizes for a part: its group is built again (all its copies follow) – one undo step. Groups put into it (a
 * window, a lamp) stay; a windows plugin then cuts their holes into the new wall.
 */
export const changePart = (context: PluginContext, instance: Instance, params: PartParams) => {
  const part = partOf(context, instance);
  if (!part) {
    return;
  }
  const changed: PartData = { ...part, params: { ...params } };
  context.editor.commit('linework.undo.change', () => {
    const definition = instance.definition;
    const kept = [...definition.entities.instances.values()];
    definition.entities = new Entities();
    for (const child of kept) {
      definition.entities.instances.set(child.id, child);
    }
    context.meshes.build(definition.entities, partMesh(changed));
    context.data.set(definition, { part: changed });
  });
};

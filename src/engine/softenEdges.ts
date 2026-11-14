import type { Editor } from './editor';

type Entities = Editor['entities'];

/** Edge ids of the selection – edges inside selected groups/components get a negative id. */
const selectedEdgeIds = (editor: Editor): number[] => {
  const entities = editor.entities;
  const selection = editor.selected();
  const ids = new Set<number>();
  for (const item of selection) {
    if (item.kind === 'edge') {
      ids.add(item.id);
    }
    if (item.kind === 'face') {
      const face = entities.faces.get(item.id);
      if (face) {
        entities.faceEdges(face).forEach((edge) => ids.add(edge.id));
      }
    }
  }
  if (selection.some((item) => item.kind === 'instance')) {
    for (const item of selection) {
      const instance = entities.instances.get(item.id);
      if (instance) {
        instance.definition.entities.edges.forEach((edge) => ids.add(-edge.id));
      }
    }
  }
  return [...ids];
};

/**
 * Softens the selected edges whose two faces meet flatter than `angleDegrees` – and all such edges inside
 * selected groups/components. `coplanar` also softens edges between faces in one plane. One undo step.
 */
export const softenSelectionByAngle = (editor: Editor, angleDegrees: number, coplanar: boolean) => {
  const minCosine = Math.cos((angleDegrees * Math.PI) / 180);
  editor.commit('undo.soften', () => {
    const entities = editor.entities;
    const soften = (container: Entities, ids: number[]) => {
      for (const id of ids) {
        const edge = container.edges.get(id);
        if (!edge) {
          continue;
        }
        const faces = container.facesOfEdge(id);
        if (faces.length !== 2) {
          continue;
        }
        const cosine = container.faceNormal(faces[0]).dot(container.faceNormal(faces[1]));
        edge.soft = (cosine >= minCosine && (coplanar || cosine < 1 - 1e-6)) || undefined;
      }
    };
    soften(
      entities,
      selectedEdgeIds(editor).filter((id) => id > 0),
    );
    for (const item of editor.selected()) {
      if (item.kind !== 'instance') {
        continue;
      }
      const instance = entities.instances.get(item.id);
      if (instance) {
        soften(instance.definition.entities, [...instance.definition.entities.edges.keys()]);
      }
    }
  });
};

/** Makes every selected edge – and every edge inside selected groups/components – hard again. One undo step. */
export const unsoftenSelection = (editor: Editor) => {
  editor.commit('undo.unsoften', () => {
    const entities = editor.entities;
    for (const id of selectedEdgeIds(editor)) {
      const edge = id > 0 ? entities.edges.get(id) : undefined;
      if (edge) {
        edge.soft = undefined;
      }
    }
    for (const item of editor.selected()) {
      if (item.kind !== 'instance') {
        continue;
      }
      const instance = entities.instances.get(item.id);
      if (instance) {
        instance.definition.entities.edges.forEach((edge) => (edge.soft = undefined));
      }
    }
  });
};

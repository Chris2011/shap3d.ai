// Delete, copy, cut, paste, hide – and emptying the whole model.
import * as THREE from 'three';
import type { Editor } from '../editor';
import type { Entities } from '../../core/model';
import { Entities as EntitiesClass, copyInstanceDetails, isProcedureInput } from '../../core/model';
import { t } from '../../i18n';

export const deleteSelection = (editor: Editor) => {
  if (editor.selectedAnnotation !== null) {
    editor.removeAnnotation(editor.selectedAnnotation);
    return;
  }
  const refs = editor.selected();
  if (!refs.length) {
    return;
  }
  editor.commit('commands.delete', () => {
    editor.entities.erase(refs);
    editor.clearSelection();
  });
};

export const copySelection = (editor: Editor, cut = false) => {
  const refs = editor.selected();
  if (!refs.length) {
    return;
  }
  const tmp = new EntitiesClass();
  const ents = editor.entities;
  // copy geometry without removing it from the model
  const faceIds = new Set(refs.filter((entityRef) => entityRef.kind === 'face').map((entityRef) => entityRef.id));
  const edgeIds = new Set(refs.filter((entityRef) => entityRef.kind === 'edge').map((entityRef) => entityRef.id));
  for (const id of faceIds) {
    const face = ents.faces.get(id);
    if (face) {
      ents.faceEdges(face).forEach((edge) => edgeIds.add(edge.id));
    }
  }
  const vmap = new Map<number, number>();
  const mapVertex = (vertex: number) => {
    if (!vmap.has(vertex)) {
      vmap.set(vertex, tmp.rawVertex(editor.toWorld(ents.positionOf(vertex))));
    }
    return vmap.get(vertex)!;
  };
  for (const id of edgeIds) {
    const edge = ents.edges.get(id);
    if (edge) {
      tmp.createEdgeRaw(mapVertex(edge.start), mapVertex(edge.end), { soft: edge.soft, hidden: edge.hidden });
    }
  }
  for (const id of faceIds) {
    const face = ents.faces.get(id);
    if (face) {
      tmp.createFaceRaw(
        face.outer.map(mapVertex),
        face.holes.map((hole) => hole.map(mapVertex)),
        { material: face.material, backMaterial: face.backMaterial },
      );
    }
  }
  for (const entityRef of refs) {
    if (entityRef.kind === 'instance') {
      const instance = ents.instances.get(entityRef.id);
      if (instance) {
        copyInstanceDetails(instance, tmp.addInstance(instance.definition, editor.contextMatrix.multiply(instance.matrix), instance.name));
      }
    }
  }
  editor.clipboard = tmp;
  if (cut) {
    deleteSelection(editor);
  }
  editor.toast(cut ? t('toast.cut') : t('toast.copied'));
};

export const paste = (editor: Editor, inPlace = false) => {
  const clip = editor.clipboard as Entities | null;
  if (!clip) {
    return;
  }
  editor.commit(inPlace ? 'commands.pasteInPlace' : 'commands.paste', () => {
    const refs = editor.entities.merge(clip, editor.contextInverse, editor.model, undefined, true);
    editor.select(refs);
  });
  if (!inPlace) {
    // attach to the cursor like SketchUp: start a move from the selection's bbox corner
    const box = editor.entities.refBounds(editor.selected());
    if (box.isEmpty()) {
      return;
    }
    const moveTool: any = editor.tools.get('move');
    editor.setTool('move');
    const start = editor.toWorld(new THREE.Vector3(box.min.x, box.min.y, box.min.z));
    moveTool.copy = false;
    moveTool.begin(start);
    // the paste and the following move become separate steps; moving starts immediately
  }
};

export const hideSelection = (editor: Editor) => {
  const refs = editor.selected();
  if (!refs.length) {
    return;
  }
  editor.commit('commands.hide', () => {
    for (const entityRef of refs) {
      if (entityRef.kind === 'face') {
        const face = editor.entities.faces.get(entityRef.id);
        if (face) {
          face.hidden = true;
        }
      }
      if (entityRef.kind === 'edge') {
        const edge = editor.entities.edges.get(entityRef.id);
        if (edge) {
          edge.hidden = true;
        }
      }
      if (entityRef.kind === 'instance') {
        const instance = editor.entities.instances.get(entityRef.id);
        if (instance) {
          instance.hidden = true;
        }
      }
    }
    editor.clearSelection();
  });
};
export const unhideAll = (editor: Editor) => {
  editor.commit('commands.unhideAll', () => {
    const entities = editor.entities;
    entities.faces.forEach((face) => (face.hidden = undefined));
    entities.edges.forEach((x) => (x.hidden = undefined));
    entities.instances.forEach((instance) => (instance.hidden = isProcedureInput(instance)));
  });
};

/** Empties the whole workspace (geometry, groups, guides, dimensions, labels, sections) as one undo step. */
export const clearAll = (editor: Editor) => {
  const model = editor.model;
  if (
    !model.root.faces.size &&
    !model.root.edges.size &&
    !model.root.instances.size &&
    !model.guides.length &&
    !model.dimensions.length &&
    !model.labels.length &&
    !model.sections.length
  ) {
    editor.toast(t('toast.alreadyEmpty'));
    return;
  }
  editor.setContext([]);
  editor.commit('undo.clearAll', () => {
    const entities = model.root;
    for (const id of [...entities.instances.keys()]) {
      entities.instances.delete(id);
    }
    for (const id of [...entities.faces.keys()]) {
      entities.removeFace(id);
    }
    for (const edge of [...entities.edges.values()]) {
      entities.eraseEdge(edge.id, false);
    }
    entities.removeOrphanVertices();
    model.guides = [];
    model.dimensions = [];
    model.labels = [];
    model.sections = [];
  });
  editor.toast(t('toast.cleared'));
};

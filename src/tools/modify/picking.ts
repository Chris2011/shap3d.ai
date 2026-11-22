// What the modify tools pick under the cursor and which geometry they snap to while something moves.
import type * as THREE from 'three';
import type { VertRec, EdgeRec, FaceHit } from '../../engine/viewer';
import type { Editor } from '../../engine/editor';
import type { EntityRef } from '../../core/model';
import type { LiveTransform } from './transform';

type Pointer = { x: number; y: number };

/** Shared selection-or-hover behaviour of Move/Rotate/Scale: the edge or face under the cursor. */
export const hoverPick = (editor: Editor, pointer: Pointer): EntityRef | null => {
  const edgeHit = editor.viewer.pickEdge(pointer.x, pointer.y, 6);
  if (edgeHit) {
    const entityRef = editor.refFromPick(edgeHit.rec.context.path, 'edge', edgeHit.rec.edgeId);
    if (entityRef) {
      return entityRef;
    }
  }
  const faceHit = editor.viewer.pickFace(pointer.x, pointer.y);
  if (faceHit) {
    return editor.refFromPick(faceHit.context.path, 'face', faceHit.faceId);
  }
  return null;
};

/** With nothing selected, the hovered element becomes the selection; false when there is still nothing. */
export const selectHoverIfNone = (editor: Editor) => {
  if (!editor.selected().length && editor.hover) {
    editor.select([editor.hover]);
  }
  return editor.selected().length > 0;
};

/** A face of the open group or component under the cursor (Push/Pull, Offset). */
export const pickContextFace = (editor: Editor, pointer: Pointer) =>
  editor.viewer.pickFace(
    pointer.x,
    pointer.y,
    (context) => context.path.length === editor.activePath.length && editor.inContext(context.path),
  );

/** The item nearest to the cursor on screen, within `radius` pixels. */
export const nearestOnScreen = <T>(editor: Editor, pointer: Pointer, items: T[], at: (item: T) => THREE.Vector3, radius = 8) => {
  let best: T | null = null;
  let bestDistance = radius;
  for (const item of items) {
    const screenPos = editor.viewer.project(at(item));
    if (!screenPos.visible) {
      continue;
    }
    const distance = Math.hypot(screenPos.x - pointer.x, screenPos.y - pointer.y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = item;
    }
  }
  return best;
};

/** Inference filters that ignore what is moving, so it does not snap to itself. */
export const contextFilters = (editor: Editor, live: LiveTransform | null) => {
  const ents = editor.entities;
  const ids = new Set(live ? [...live.insts.keys()] : []);
  const pathHit = (path: any[]) => path.some((step) => ids.has(step.id));
  return {
    filterVert: (vertex: VertRec) =>
      !(live && ((vertex.context.entities === ents && live.has(vertex.vertexId)) || pathHit(vertex.context.path))),
    filterEdge: (edgeRec: EdgeRec) => {
      if (!live) {
        return true;
      }
      if (pathHit(edgeRec.context.path)) {
        return false;
      }
      if (edgeRec.context.entities !== ents) {
        return true;
      }
      const edge = ents.edges.get(edgeRec.edgeId);
      return !(edge && live.has(edge.start) && live.has(edge.end));
    },
    filterFace: (context: FaceHit['context'], faceId: number) => {
      if (!live) {
        return true;
      }
      if (pathHit(context.path)) {
        return false;
      }
      if (context.entities !== ents) {
        return true;
      }
      const face = ents.faces.get(faceId);
      return !(face && ents.faceVertices(face).every((vertex) => live.has(vertex)));
    },
  };
};

// Commands on faces and edges: reverse, orient, soften, intersect.
import * as THREE from 'three';
import type { Editor } from '../editor';
import type { Entities } from '../../core/model';
import { t } from '../../i18n';

export const reverseFaces = (editor: Editor) => {
  const refs = editor.selected().filter((entityRef) => entityRef.kind === 'face');
  if (!refs.length) {
    return;
  }
  editor.commit('commands.reverseFaces', () => {
    for (const entityRef of refs) {
      const face = editor.entities.faces.get(entityRef.id);
      if (face) {
        editor.entities.reverseFace(face);
      }
    }
  });
};
/** Orient all connected faces consistently with the selected one. */
export const orientFaces = (editor: Editor) => {
  const entityRef = editor.selected().find((x) => x.kind === 'face');
  if (!entityRef) {
    return;
  }
  editor.commit('commands.orientFaces', () => {
    const entities = editor.entities;
    const seen = new Set([entityRef.id]);
    const queue = [entityRef.id];
    while (queue.length) {
      const current = entities.faces.get(queue.shift()!)!;
      for (const loop of entities.loops(current)) {
        for (let i = 0; i < loop.length; i++) {
          const vertexA = loop[i],
            vertexB = loop[(i + 1) % loop.length];
          const edge = entities.edgeBetween(vertexA, vertexB);
          if (!edge) {
            continue;
          }
          const faces = entities.facesOfEdge(edge.id);
          if (faces.length !== 2) {
            continue;
          }
          for (const face of faces) {
            if (seen.has(face.id)) {
              continue;
            }
            seen.add(face.id);
            // neighbour must traverse a→b in opposite direction
            let same = false;
            for (const gl of entities.loops(face)) {
              for (let j = 0; j < gl.length; j++) {
                if (gl[j] === vertexA && gl[(j + 1) % gl.length] === vertexB) {
                  same = true;
                }
              }
            }
            if (same) {
              entities.reverseFace(face);
            }
            queue.push(face.id);
          }
        }
      }
    }
  });
};
export const softenSelection = (editor: Editor, soft: boolean) => {
  const refs = editor.selected();
  editor.commit(soft ? 'commands.soften' : 'commands.unsoften', () => {
    const entities = editor.entities;
    const ids = new Set<number>();
    for (const entityRef of refs) {
      if (entityRef.kind === 'edge') {
        ids.add(entityRef.id);
      }
      if (entityRef.kind === 'face') {
        const face = entities.faces.get(entityRef.id);
        if (face) {
          entities.faceEdges(face).forEach((edge) => ids.add(edge.id));
        }
      }
    }
    for (const id of ids) {
      const edge = entities.edges.get(id);
      if (edge && (!soft || entities.facesOfEdge(id).length === 2)) {
        edge.soft = soft || undefined;
      }
    }
  });
};

export const intersectSelection = (editor: Editor) => {
  // intersect selected faces with each other: add lines where coplanar-crossing edges meet faces
  const refs = editor.selected().filter((entityRef) => entityRef.kind === 'face');
  if (refs.length < 2) {
    editor.toast(t('toast.selectTwoFaces'));
    return;
  }
  editor.commit('undo.intersect', () => {
    const entities = editor.entities;
    const faces = refs.map((entityRef) => entities.faces.get(entityRef.id)!).filter(Boolean);
    const segs: [THREE.Vector3, THREE.Vector3][] = [];
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        const segment = faceFaceIntersection(entities, faces[i], faces[j]);
        if (segment) {
          segs.push(segment);
        }
      }
    }
    for (const [start, end] of segs) {
      entities.addLine(start, end);
    }
  });
};
const faceFaceIntersection = (entities: Entities, faceA: any, faceB: any): [THREE.Vector3, THREE.Vector3] | null => {
  const normalA = entities.faceNormal(faceA),
    normalB = entities.faceNormal(faceB);
  const dir = normalA.clone().cross(normalB);
  if (dir.length() < 1e-6) {
    return null;
  }
  // clip the intersection line of both planes against both polygons
  const pointA = entities.positionOf(faceA.outer[0]),
    pointB = entities.positionOf(faceB.outer[0]);
  const params: number[][] = [];
  const pl2 = new THREE.Plane().setFromNormalAndCoplanarPoint(normalB, pointB),
    pl1 = new THREE.Plane().setFromNormalAndCoplanarPoint(normalA, pointA);
  const crossings = (face: any, plane: THREE.Plane) => {
    const pts: THREE.Vector3[] = [];
    const loop = face.outer.map((vertex: number) => entities.positionOf(vertex));
    for (let i = 0; i < loop.length; i++) {
      const current = loop[i],
        next = loop[(i + 1) % loop.length];
      const distCurrent = plane.distanceToPoint(current),
        distNext = plane.distanceToPoint(next);
      if ((distCurrent <= 0 && distNext > 0) || (distCurrent > 0 && distNext <= 0)) {
        pts.push(current.clone().lerp(next, distCurrent / (distCurrent - distNext)));
      }
    }
    return pts;
  };
  const crossingsA = crossings(faceA, pl2),
    crossingsB = crossings(faceB, pl1);
  if (crossingsA.length < 2 || crossingsB.length < 2) {
    return null;
  }
  const direction = dir.normalize();
  const base = crossingsA[0];
  const paramsA = crossingsA.map((point) => point.clone().sub(base).dot(direction)).sort((x, y) => x - y),
    paramsB = crossingsB.map((point) => point.clone().sub(base).dot(direction)).sort((x, y) => x - y);
  params.push(paramsA, paramsB);
  const overlapStart = Math.max(paramsA[0], paramsB[0]),
    overlapEnd = Math.min(paramsA[paramsA.length - 1], paramsB[paramsB.length - 1]);
  if (overlapEnd - overlapStart < 1e-6) {
    return null;
  }
  return [base.clone().addScaledVector(direction, overlapStart), base.clone().addScaledVector(direction, overlapEnd)];
};

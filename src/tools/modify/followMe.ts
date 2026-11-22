import type * as THREE from 'three';
import type { PEvt } from '../../engine/editor';
import { PointTool } from '../base';
import { createFollowMeProcedure } from '../../core/procedures';
import { t } from '../../i18n';

type V3 = THREE.Vector3;

export class FollowMeTool extends PointTool {
  id = 'followme';
  name = 'tools.followme';
  cursor = 'crosshair';
  status() {
    return this.path() ? t('tools.status.followmeProfile') : t('tools.status.followmePath');
  }
  path(): { points: V3[]; closed: boolean } | null {
    const editor = this.editor;
    const ents = editor.entities;
    let edges = this.selectedEdges();
    // a selected face (without edges) means "its boundary"
    if (!edges.length) {
      const entityRef = editor.selected().find((selectedRef) => selectedRef.kind === 'face');
      if (entityRef) {
        const face = ents.faces.get(entityRef.id);
        if (face) {
          edges = ents.loopEdges(face.outer);
        }
      }
    }
    if (!edges.length) {
      return null;
    }
    const adj = new Map<number, number[]>();
    for (const edge of edges) {
      (adj.get(edge.start) ?? adj.set(edge.start, []).get(edge.start)!).push(edge.end);
      (adj.get(edge.end) ?? adj.set(edge.end, []).get(edge.end)!).push(edge.start);
    }
    if ([...adj.values()].some((neighbours) => neighbours.length > 2)) {
      return null;
    }
    let start = [...adj.keys()].find((k) => adj.get(k)!.length === 1);
    const closed = start == null;
    if (start == null) {
      start = edges[0].start;
    }
    const order = [start];
    const seen = new Set([start]);
    let cur = start;
    while (true) {
      const next = adj.get(cur)!.find((vertex) => !seen.has(vertex));
      if (next == null) {
        break;
      }
      order.push(next);
      seen.add(next);
      cur = next;
    }
    if (order.length !== adj.size) {
      return null;
    }
    return { points: order.map((vertex) => ents.positionOf(vertex).clone()), closed };
  }
  selectedEdges() {
    const ents = this.editor.entities;
    return this.editor
      .selected()
      .filter((entityRef) => entityRef.kind === 'edge')
      .map((entityRef) => ents.edges.get(entityRef.id)!)
      .filter(Boolean);
  }
  /** a loose path and a profile on its own lose nothing when they become inputs – edges of a solid must stay where they are */
  canBeProcedure(faceId: number) {
    const ents = this.editor.entities;
    const face = ents.faces.get(faceId);
    const path = this.selectedEdges();
    return (
      !!face &&
      path.length > 0 &&
      path.every((edge) => !ents.facesOfEdge(edge.id).length) &&
      ents.faceEdges(face).every((edge) => ents.facesOfEdge(edge.id).length === 1)
    );
  }
  onMove(pointer: PEvt) {
    const editor = this.editor;
    const faceHit = editor.viewer.pickFace(
      pointer.x,
      pointer.y,
      (context) => context.path.length === editor.activePath.length && editor.inContext(context.path),
    );
    editor.setHover(faceHit ? { kind: 'face', id: faceHit.faceId } : null);
  }
  onDown(pointer: PEvt) {
    const editor = this.editor;
    const path = this.path();
    if (!path) {
      editor.toast(t('toast.noValidPath'));
      return;
    }
    const faceHit = editor.viewer.pickFace(
      pointer.x,
      pointer.y,
      (context) => context.path.length === editor.activePath.length && editor.inContext(context.path),
    );
    if (!faceHit) {
      return;
    }
    if (this.canBeProcedure(faceHit.faceId)) {
      const pathEdges = this.selectedEdges().map((edge) => edge.id);
      const names = {
        group: editor.model.uniqueDefName(t('procedures.names.followMe')),
        profile: t('procedures.names.profile'),
        path: t('procedures.names.path'),
      };
      try {
        editor.commit('tools.followme', () => {
          const procedure = createFollowMeProcedure(editor.model, editor.entities, faceHit.faceId, pathEdges, names);
          editor.select([{ kind: 'instance', id: procedure.id }]);
        });
      } catch {
        // commit has put everything back and said so
      }
      editor.setHover(null);
      return;
    }
    // start the path at the end closest to the profile
    const faceCenter = editor.entities.faceCenter(editor.entities.faces.get(faceHit.faceId)!);
    if (!path.closed && path.points[path.points.length - 1].distanceTo(faceCenter) < path.points[0].distanceTo(faceCenter)) {
      path.points.reverse();
    }
    if (path.closed) {
      let bestIndex = 0,
        bestDistance = Infinity;
      path.points.forEach((point, i) => {
        const distance = point.distanceTo(faceCenter);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestIndex = i;
        }
      });
      path.points = [...path.points.slice(bestIndex), ...path.points.slice(0, bestIndex)];
    }
    editor.commit('tools.followme', () => editor.entities.followMe(faceHit.faceId, path.points, path.closed));
    editor.clearSelection();
    editor.setHover(null);
  }
}

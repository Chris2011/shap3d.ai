import type { PEvt } from '../engine/editor';
import type { Overlay } from '../engine/overlay';
import { PointTool } from './base';
import { Entities, type EntityRef, type Instance } from '../core/model';
import { connectedEdges, createCopyAlongProcedure, edgeChain, rebuildProcedure } from '../core/procedures';
import { parseArray } from '../core/units';
import { t } from '../i18n';

const PATH_COLOUR = '#e000e0';

/**
 * Copy Along: select groups or components, then click the path – a line of edges or a group of edges. The result is a
 * procedure: count, spacing and turning along the path stay editable in Entity Info, sources and path by opening it.
 */
export class CopyAlongTool extends PointTool {
  id = 'copyalong';
  name = 'tools.copyalong';
  vcbLabel = 'vcb.copyAlong';
  cursor = 'crosshair';
  /** what a click would take as the path: the edge's line in this context, or the group the edge lies in */
  private hoverLine: number[] = [];
  private hoverGroup: Instance | null = null;
  /** the procedure made last – typing changes its count or spacing */
  private last: Instance | null = null;

  status() {
    return t(this.sources().length ? 'tools.status.copyAlongPath' : 'tools.status.copyAlongSource');
  }
  activate() {
    this.last = null;
  }
  deactivate() {
    this.hoverLine = [];
    this.hoverGroup = null;
  }
  private sources() {
    const ents = this.editor.entities;
    return this.editor
      .selected()
      .filter((entityRef) => entityRef.kind === 'instance')
      .map((entityRef) => ents.instances.get(entityRef.id))
      .filter((instance): instance is Instance => !!instance);
  }
  private readHover(pointer: PEvt) {
    const editor = this.editor;
    this.hoverLine = [];
    this.hoverGroup = null;
    const hit = editor.viewer.pickEdge(pointer.x, pointer.y, 7);
    if (!hit) {
      return;
    }
    const entityRef: EntityRef | null = editor.refFromPick(hit.rec.context.path, 'edge', hit.rec.edgeId);
    if (entityRef?.kind === 'edge') {
      this.hoverLine = connectedEdges(editor.entities, entityRef.id);
    } else if (entityRef?.kind === 'instance') {
      const group = editor.entities.instances.get(entityRef.id) ?? null;
      if (group && !this.sources().includes(group) && group.definition.entities.edges.size) {
        this.hoverGroup = group;
      }
    }
  }
  onMove(pointer: PEvt) {
    this.readHover(pointer);
    this.editor.refreshStatus();
  }
  onDown(pointer: PEvt) {
    const editor = this.editor;
    const sources = this.sources();
    if (!sources.length) {
      editor.toast(t('tools.status.copyAlongSource'));
      return;
    }
    this.readHover(pointer);
    const ents = editor.entities;
    const line = this.hoverLine;
    const group = this.hoverGroup;
    if (!group && !(line.length && edgeChain(ents, line))) {
      editor.toast(t('toast.noValidPath'));
      return;
    }
    const names = { group: editor.model.uniqueDefName(t('procedures.names.copyAlong')), path: t('procedures.names.path') };
    try {
      editor.commit('tools.copyalong', () => {
        const instance = createCopyAlongProcedure(editor.model, ents, sources, group ?? this.linePath(ents, line), names);
        this.last = instance;
        editor.select([{ kind: 'instance', id: instance.id }]);
      });
    } catch {
      // commit has said what went wrong and put everything back
      return;
    }
    this.hoverLine = [];
    editor.setVcb(String(this.last!.definition.procedure!.params.count));
    editor.refreshStatus();
  }
  /** the edges as a path: loose ones move in, edges that bound faces stay and are copied */
  private linePath(ents: Entities, line: number[]) {
    if (line.every((id) => !ents.facesOfEdge(id).length)) {
      return ents.extract(line.map((id) => ({ kind: 'edge' as const, id }))).entities;
    }
    const path = new Entities();
    for (const id of line) {
      const edge = ents.edges.get(id)!;
      path.addLine(ents.positionOf(edge.start).clone(), ents.positionOf(edge.end).clone(), { detectFaces: false });
    }
    return path;
  }
  /** after making one: "7x" is the number of copies, a length the spacing */
  onVcb(text: string) {
    const editor = this.editor;
    const last = this.last;
    const procedure = last?.definition.procedure;
    if (!last || !procedure) {
      return false;
    }
    const array = parseArray(text);
    const plain = /^\d+$/.test(text.trim()) ? Number(text.trim()) : null;
    const spacing = array || plain !== null ? null : this.lengthOf(text);
    if (!array && plain === null && spacing == null) {
      return false;
    }
    editor.commit('procedures.undoParams', () => {
      Object.assign(procedure.params, spacing != null ? { mode: 'spacing', spacing } : { mode: 'count', count: array?.count ?? plain });
      const error = rebuildProcedure(last.definition, editor.model);
      if (error) {
        editor.toast(t(error));
      }
    });
    return true;
  }
  draw(overlay: Overlay) {
    const editor = this.editor;
    const ents = editor.entities;
    for (const id of this.hoverLine) {
      const edge = ents.edges.get(id);
      if (edge) {
        overlay.line(editor.toWorld(ents.positionOf(edge.start)), editor.toWorld(ents.positionOf(edge.end)), PATH_COLOUR, 3);
      }
    }
    if (this.hoverGroup) {
      const inner = this.hoverGroup.definition.entities;
      const world = editor.contextMatrix.multiply(this.hoverGroup.matrix);
      for (const edge of inner.edges.values()) {
        overlay.line(
          inner.positionOf(edge.start).clone().applyMatrix4(world),
          inner.positionOf(edge.end).clone().applyMatrix4(world),
          PATH_COLOUR,
          3,
        );
      }
    }
    if (this.hoverLine.length || this.hoverGroup) {
      overlay.tooltip(editor.mouse.x, editor.mouse.y, t('tools.hints.copyAlongPath'));
    }
  }
}

import * as THREE from 'three';
import type { Label } from '../../core/document';
import { guideAt } from '../guidePick';
import { EditorHistory } from './editorHistory';

export const ANNOTATION_FONT = '12px "Open Sans", "Segoe UI", sans-serif';

/** Texts, dimensions and guides: picking, selecting and deleting them, and a text's measured value. */
export abstract class EditorAnnotations extends EditorHistory {
  /** the id of the text, dimension or guide under a screen point: a text box or one of the lines (drawn last, so looked at first) */
  pickAnnotation(x: number, y: number) {
    const pointer = new THREE.Vector3(x, y);
    const nearLine = (start: THREE.Vector3, end: THREE.Vector3) => {
      const [from, to] = [this.viewer.project(start), this.viewer.project(end)];
      if (!from.visible || !to.visible) {
        return false;
      }
      const line = new THREE.Line3(new THREE.Vector3(from.x, from.y), new THREE.Vector3(to.x, to.y));
      return line.closestPointToPoint(pointer, true, new THREE.Vector3()).distanceTo(pointer) <= 5;
    };
    const context = this.viewer.overlay.context;
    context.font = ANNOTATION_FONT;
    for (const label of [...this.model.labels].reverse()) {
      const anchor = label.point.clone().add(label.offset);
      const box = this.viewer.project(anchor);
      const width = context.measureText(this.labelText(label)).width + 8;
      if ((box.visible && x >= box.x && x <= box.x + width && Math.abs(y - box.y) <= 9) || nearLine(label.point, anchor)) {
        return label.id;
      }
    }
    for (const dimension of [...this.model.dimensions].reverse()) {
      const [start, end] = [dimension.start.clone().add(dimension.offset), dimension.end.clone().add(dimension.offset)];
      const box = this.viewer.project(start.clone().add(end).multiplyScalar(0.5));
      const width = context.measureText(this.fmt(dimension.start.distanceTo(dimension.end))).width + 8;
      if (
        (box.visible && Math.abs(x - box.x) <= width / 2 && Math.abs(y - box.y) <= 9) ||
        nearLine(start, end) ||
        nearLine(dimension.start, start) ||
        nearLine(dimension.end, end)
      ) {
        return dimension.id;
      }
    }
    // the Tape Measure's guide lines and points last: they lie under everything else
    return this.model.settings.guides ? guideAt(this.viewer, this.model.guides, x, y) : null;
  }
  /** a text, dimension or guide is not geometry, so it is selected on its own: clicking anything else ends it */
  selectAnnotation(id: number | null) {
    if (id !== null) {
      this.clearSelection();
    }
    this.selectedAnnotation = id;
    this.redraw();
  }
  removeAnnotation(id: number) {
    this.commit('commands.delete', () => {
      this.model.labels = this.model.labels.filter((label) => label.id !== id);
      this.model.dimensions = this.model.dimensions.filter((dimension) => dimension.id !== id);
      this.model.guides = this.model.guides.filter((guide) => guide.id !== id);
    });
    this.selectedAnnotation = null;
  }
  /** the text of a label, with the length or area of what it points at where it says `<>` */
  protected labelText(label: Label) {
    if (!label.source || !label.text.includes('<>')) {
      return label.text;
    }
    label.lastValue = this.measuredValue(label.source) ?? label.lastValue;
    return label.text.split('<>').join(label.lastValue ?? '?');
  }
  private measuredValue({ kind, path, id }: NonNullable<Label['source']>) {
    let entities = this.model.root;
    const world = new THREE.Matrix4();
    for (const instanceId of path) {
      const instance = entities.instances.get(instanceId);
      if (!instance) {
        return undefined;
      }
      world.multiply(instance.matrix);
      entities = instance.definition.entities;
    }
    if (kind === 'edge') {
      const edge = entities.edges.get(id);
      return edge
        ? this.fmt(
            entities
              .positionOf(edge.start)
              .clone()
              .applyMatrix4(world)
              .distanceTo(entities.positionOf(edge.end).clone().applyMatrix4(world)),
          )
        : undefined;
    }
    const face = entities.faces.get(id);
    if (!face) {
      return undefined;
    }
    // how much the groups above stretch this plane
    const normal = entities.faceNormal(face);
    const along = new THREE.Vector3(1, 0, 0).cross(normal);
    if (along.lengthSq() < 1e-6) {
      along.set(0, 1, 0).cross(normal);
    }
    along.normalize();
    const across = normal.clone().cross(along);
    const linear = new THREE.Matrix3().setFromMatrix4(world);
    const factor = along.applyMatrix3(linear).cross(across.applyMatrix3(linear)).length();
    return this.fmtArea(entities.faceArea(face) * factor);
  }
}

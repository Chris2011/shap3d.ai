import * as THREE from 'three';
import { markRaw } from 'vue';
import { useVariableSource } from '../core/variables';
import { valueLabel } from '../tools/drawLabels';
import { drawSelectedGuide } from './guidePick';
import { InferenceEngine } from './inference';
import { drawMeasure } from './measureView';
import type { Overlay } from './overlay';
import { Viewer } from './viewer';
import { ANNOTATION_FONT } from './editor/editorAnnotations';
import { EditorView } from './editor/editorView';

export { MAIN_TOOLS, Tool, type DialogOption, type PEvt, type UiState } from './editor/tool';

/**
 * The editor: the model, the 3D view and the tools working on it. Its parts live in ./editor/ as a chain of classes
 * (see EditorBase); this last one attaches the view and draws what lies over it.
 */
export class Editor extends EditorView {
  attach(canvas: HTMLCanvasElement, overlay: HTMLCanvasElement) {
    this.viewer = markRaw(new Viewer(canvas, overlay));
    this.viewer.model = this.model;
    // `#name` in typed lengths reads this model's variables
    useVariableSource(() => this.model.variables);
    this.infer = markRaw(
      new InferenceEngine(
        this.viewer,
        () => this.model.guides,
        () => this.entities,
      ),
    );
    this.viewer.overlay.drawers.push((canvasOverlay) => drawMeasure(canvasOverlay, this)); // below tool feedback
    this.viewer.overlay.drawers.push((canvasOverlay) => this.drawOverlay(canvasOverlay));
    this.viewer.onFrame = () => this.frame();
    this.setTool('select');
    this.dirty = true;
  }

  // ------------------------------------------------------------ overlay
  private drawOverlay(overlay: Overlay) {
    // open-group bounding box (dashed) – where the view shows the group (a plugin's display place)
    if (this.activePath.length) {
      const inst = this.activePath[this.activePath.length - 1];
      const parent = new THREE.Matrix4();
      for (const instance of this.activePath.slice(0, -1)) {
        parent.multiply(this.viewer.shownMatrix(instance));
      }
      const box = inst.definition.entities.bounds(new THREE.Box3());
      if (!box.isEmpty()) {
        const matrix = parent.clone().multiply(this.viewer.shownMatrix(inst));
        const corners = [0, 1, 2, 3, 4, 5, 6, 7].map((i) =>
          new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(
            matrix,
          ),
        );
        const boxEdges = [
          [0, 1],
          [1, 3],
          [3, 2],
          [2, 0],
          [4, 5],
          [5, 7],
          [7, 6],
          [6, 4],
          [0, 4],
          [1, 5],
          [2, 6],
          [3, 7],
        ];
        for (const [fromIndex, toIndex] of boxEdges) {
          overlay.line(corners[fromIndex], corners[toIndex], '#555', 1, [4, 3]);
        }
      }
    }
    // guide points
    if (this.model.settings.guides) {
      for (const guide of this.model.guides) {
        if (guide.kind === 'point') {
          overlay.marker(guide.point, 'guide');
        }
      }
      drawSelectedGuide(overlay, this.model.guides, this.selectedAnnotation);
    }
    if (this.tool.id === 'move' || this.tool.id === 'snappoint') {
      for (const { position } of this.viewer.snapRecords()) {
        overlay.marker(position, 'guide');
      }
    }
    // dimensions & labels
    for (const dimension of this.model.dimensions) {
      this.drawDimension(overlay, dimension.start, dimension.end, dimension.offset, dimension.id === this.selectedAnnotation);
    }
    for (const label of this.model.labels) {
      const tip = label.point,
        anchor = label.point.clone().add(label.offset);
      const color = label.id === this.selectedAnnotation ? '#1d4ed8' : '#000';
      overlay.line(tip, anchor, color, label.id === this.selectedAnnotation ? 2 : 1);
      const tipScreen = overlay.screen(tip);
      if (tipScreen) {
        overlay.context.fillStyle = color;
        overlay.context.beginPath();
        overlay.context.arc(tipScreen.x, tipScreen.y, 2, 0, 7);
        overlay.context.fill();
      }
      overlay.text(anchor, this.labelText(label), { color, background: '#ffffffd9', align: 'left', offsetX: 4, font: ANNOTATION_FONT });
    }
    // section planes
    if (this.model.settings.sectionPlanes) {
      for (const section of this.model.sections) {
        this.drawSection(overlay, section.point, section.normal, section.active);
      }
    }
    this.tool.draw(overlay);
    // every tool in the middle of something measurable (Push/Pull, Move, Rotate, Scale, Offset, plugins …) shows its value
    if (this.tool.busy() && !this.tool.showsSizes) {
      valueLabel(this, overlay);
    }
  }
}

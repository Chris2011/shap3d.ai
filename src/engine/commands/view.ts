// Zooming to the selection, face styles and the standard views.
import * as THREE from 'three';
import type { Editor } from '../editor';
import type { FaceStyle } from '../../core/document';

export const zoomSelection = (editor: Editor) => {
  const refs = editor.selected();
  if (!refs.length) {
    editor.zoomExtents();
    return;
  }
  const box = editor.entities.refBounds(refs).applyMatrix4(editor.contextMatrix);
  editor.viewer.rig.zoomExtents(box);
};

export const setFaceStyle = (editor: Editor, style: FaceStyle) => {
  editor.model.settings.style.faceStyle = style;
  editor.invalidate();
};

/** Viewing directions (camera minus target) of the standard views, as CameraRig.standardView sets them. */
const STANDARD_VIEW_DIRECTIONS = {
  iso: [-1, -1, 0.8],
  top: [0, 0, 1],
  bottom: [0, 0, -1],
  front: [0, -1, 0],
  back: [0, 1, 0],
  left: [-1, 0, 0],
  right: [1, 0, 0],
} as const;
/** The camera still looks along the standard view (any zoom or pan, no orbit since). */
export const isStandardView = (editor: Editor, view: keyof typeof STANDARD_VIEW_DIRECTIONS): boolean => {
  const rig = editor.viewer?.rig;
  if (!rig) {
    return false;
  }
  const direction = rig.position.clone().sub(rig.target).normalize();
  return direction.dot(new THREE.Vector3(...STANDARD_VIEW_DIRECTIONS[view]).normalize()) > 0.9999;
};

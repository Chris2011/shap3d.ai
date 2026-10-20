import * as THREE from 'three';
import type { Editor } from '../../../engine/editor';
import { Entities } from '../../../core/model';
import type { PlaceTool } from '../../../tools/place';
import { loadFont, loadedFont, DEFAULT_FONT } from './fonts';
import { t } from '../../../i18n';

export interface TextOptions {
  size: number;
  depth: number;
  font?: string;
  filled?: boolean;
  upright?: boolean;
}

const dedupe = (points: THREE.Vector2[]): THREE.Vector2[] => {
  const out: THREE.Vector2[] = [];
  for (const point of points) {
    if (!out.length || out[out.length - 1].distanceTo(point) > 1e-6) {
      out.push(point);
    }
  }
  while (out.length > 1 && out[0].distanceTo(out[out.length - 1]) < 1e-6) {
    out.pop();
  }
  return out;
};

/**
 * Builds faces (and optionally extrusions) for text in the XY plane (or XZ when upright).
 * The font must be loaded already (see loadFont) – scripts run synchronously.
 */
export const buildText = (entities: Entities, text: string, options: TextOptions) => {
  const fontId = options.font ?? DEFAULT_FONT;
  const font = loadedFont(fontId);
  if (!font) {
    loadFont(fontId).catch(() => {});
    throw new Error(t('text3d.errors.stillLoading', { id: fontId }));
  }
  const map = (point: THREE.Vector2) => (options.upright ? new THREE.Vector3(point.x, 0, point.y) : new THREE.Vector3(point.x, point.y, 0));
  const faces: number[] = [];
  for (const shape of font.shapes(text, options.size)) {
    const extracted = shape.extractPoints(6);
    let outer = dedupe(extracted.shape);
    let holes = extracted.holes.map(dedupe).filter((hole) => hole.length >= 3);
    if (outer.length < 3) {
      continue;
    }
    if (THREE.ShapeUtils.isClockWise(outer)) {
      outer = outer.reverse();
    }
    holes = holes.map((hole) => (THREE.ShapeUtils.isClockWise(hole) ? hole : hole.reverse()));
    const outerIds = outer.map((point) => entities.rawVertex(map(point)));
    const holeIds = holes.map((hole) => hole.map((point) => entities.rawVertex(map(point))));
    if (options.filled === false) {
      for (const loop of [outerIds, ...holeIds]) {
        for (let i = 0; i < loop.length; i++) {
          entities.createEdgeRaw(loop[i], loop[(i + 1) % loop.length]);
        }
      }
      continue;
    }
    const face = entities.createFaceRaw(outerIds, holeIds);
    if (face) {
      faces.push(face.id);
    }
  }
  // CCW outlines face +Z (flat) or -Y (upright, readable from the front view)
  if (options.depth > 0 && options.filled !== false) {
    for (const faceId of faces) {
      entities.pushPull(faceId, options.depth);
    }
  }
  return faces;
};

export interface PlaceTextOptions extends TextOptions {
  text: string;
  material?: string;
}

/** Builds the text as a component and lets the user place it with a click (like SketchUp's 3D text). */
export const start3DText = async (editor: Editor, options: PlaceTextOptions) => {
  await loadFont(options.font ?? DEFAULT_FONT);
  const entities = new Entities();
  buildText(entities, options.text, { ...options, depth: options.filled === false ? 0 : options.depth });
  if (options.material) {
    for (const face of entities.faces.values()) {
      face.material = options.material;
    }
  }
  const definition = editor.model.newDefinition(t('text3d.componentName', { text: options.text.slice(0, 20) }), true, entities);
  (editor.tools.get('place') as PlaceTool).start(definition);
};

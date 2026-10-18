import * as THREE from 'three';
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js';
import { Entities } from './model';
import anna from '../assets/people/anna.svg?raw';
import ben from '../assets/people/ben.svg?raw';
import chris from '../assets/people/chris.svg?raw';
import dana from '../assets/people/dana.svg?raw';
import emre from '../assets/people/emre.svg?raw';
import fatima from '../assets/people/fatima.svg?raw';
import gina from '../assets/people/gina.svg?raw';
import hugo from '../assets/people/hugo.svg?raw';

/** Reference people (Humaaans by Pablo Stanley, CC0) – see assets/people/LICENSE.md. */
export const PEOPLE: Record<string, { label: string; svg: string }> = {
  anna: { label: 'Anna', svg: anna }, ben: { label: 'Ben', svg: ben }, chris: { label: 'Chris', svg: chris }, dana: { label: 'Dana', svg: dana },
  emre: { label: 'Emre', svg: emre }, fatima: { label: 'Fatima', svg: fatima }, gina: { label: 'Gina', svg: gina }, hugo: { label: 'Hugo', svg: hugo },
};
export const DEFAULT_PERSON = 'chris';

/**
 * Converts a flat SVG illustration into upright faces (x → X, y → Z) standing on the ground,
 * `height` meters tall and centred on the origin. Each colour becomes a face colour ("#rrggbb"),
 * later layers sit a fraction of a millimetre in front (−Y) so they never z-fight.
 */
export const buildPerson = (ents: Entities, svgText: string, height = 1.75) => {
  const data = new SVGLoader().parse(svgText);
  const layers: { shapes: THREE.Shape[]; color: string }[] = [];
  const box = new THREE.Box2();
  for (const path of data.paths) {
    const fill = String((path.userData as { style?: { fill?: string } } | undefined)?.style?.fill ?? '');
    if (!fill || fill === 'none') continue;
    const shapes = SVGLoader.createShapes(path);
    for (const shape of shapes) for (const point of shape.getPoints()) box.expandByPoint(point);
    layers.push({ shapes, color: '#' + new THREE.Color().setStyle(fill, THREE.LinearSRGBColorSpace).getHexString(THREE.LinearSRGBColorSpace) });
  }
  if (box.isEmpty()) return;
  const k = height / (box.max.y - box.min.y);
  const centerX = (box.min.x + box.max.x) / 2;
  const map = (point2d: THREE.Vector2, layer: number) => new THREE.Vector3((point2d.x - centerX) * k, -layer * 0.0006, (box.max.y - point2d.y) * k);
  layers.forEach((layerData, i) => {
    for (const shape of layerData.shapes) {
      const extracted = shape.extractPoints(5);
      const clean = (pts: THREE.Vector2[]) => { const cleaned: THREE.Vector2[] = []; for (const point of pts) if (!cleaned.length || cleaned[cleaned.length - 1].distanceTo(point) > 1e-3) cleaned.push(point); while (cleaned.length > 2 && cleaned[0].distanceTo(cleaned[cleaned.length - 1]) < 1e-3) cleaned.pop(); return cleaned; };
      let outer = clean(extracted.shape); if (outer.length < 3) continue;
      // SVG y points down: counter-clockwise in SVG becomes clockwise in X/Z → face normal −Y (front)
      if (!THREE.ShapeUtils.isClockWise(outer)) outer = outer.reverse();
      const holes = extracted.holes.map(clean).filter(hole => hole.length >= 3).map(hole => (THREE.ShapeUtils.isClockWise(hole) ? hole.reverse() : hole));
      const outerIds = outer.map(point => ents.rawVertex(map(point, i)));
      const holeIds = holes.map(hole => hole.map(point => ents.rawVertex(map(point, i))));
      const face = ents.createFaceRaw(outerIds, holeIds, { material: layerData.color, backMaterial: layerData.color });
      if (face && ents.faceNormal(face).y > 0) ents.reverseFace(face);
    }
  });
  // flat illustration look: no visible edges
  for (const edge of ents.edges.values()) edge.soft = true;
};

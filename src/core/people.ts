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
export function buildPerson(ents: Entities, svgText: string, height = 1.75) {
  const data = new SVGLoader().parse(svgText);
  const layers: { shapes: THREE.Shape[]; color: string }[] = [];
  const box = new THREE.Box2();
  for (const p of data.paths) {
    const fill = String((p.userData as { style?: { fill?: string } } | undefined)?.style?.fill ?? '');
    if (!fill || fill === 'none') continue;
    const shapes = SVGLoader.createShapes(p);
    for (const s of shapes) for (const pt of s.getPoints()) box.expandByPoint(pt);
    layers.push({ shapes, color: '#' + new THREE.Color().setStyle(fill, THREE.LinearSRGBColorSpace).getHexString(THREE.LinearSRGBColorSpace) });
  }
  if (box.isEmpty()) return;
  const k = height / (box.max.y - box.min.y);
  const cx = (box.min.x + box.max.x) / 2;
  const map = (v: THREE.Vector2, layer: number) => new THREE.Vector3((v.x - cx) * k, -layer * 0.0006, (box.max.y - v.y) * k);
  layers.forEach((l, i) => {
    for (const s of l.shapes) {
      const ex = s.extractPoints(5);
      const clean = (pts: THREE.Vector2[]) => { const o: THREE.Vector2[] = []; for (const q of pts) if (!o.length || o[o.length - 1].distanceTo(q) > 1e-3) o.push(q); while (o.length > 2 && o[0].distanceTo(o[o.length - 1]) < 1e-3) o.pop(); return o; };
      let outer = clean(ex.shape); if (outer.length < 3) continue;
      // SVG y points down: counter-clockwise in SVG becomes clockwise in X/Z → face normal −Y (front)
      if (!THREE.ShapeUtils.isClockWise(outer)) outer = outer.reverse();
      const holes = ex.holes.map(clean).filter(h => h.length >= 3).map(h => (THREE.ShapeUtils.isClockWise(h) ? h.reverse() : h));
      const ov = outer.map(p => ents.rawVertex(map(p, i)));
      const hv = holes.map(h => h.map(p => ents.rawVertex(map(p, i))));
      const f = ents.createFaceRaw(ov, hv, { material: l.color, backMaterial: l.color });
      if (f && ents.faceNormal(f).y > 0) ents.reverseFace(f);
    }
  });
  // flat illustration look: no visible edges
  for (const e of ents.edges.values()) e.soft = true;
}

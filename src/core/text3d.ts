import * as THREE from 'three';
import { FontLoader, type Font } from 'three/examples/jsm/loaders/FontLoader.js';
// three ≥ 0.180 no longer ships examples/fonts on npm – the typefaces live in src/assets/fonts (see LICENSE there)
import regular from '../assets/fonts/helvetiker_regular.typeface.json';
import bold from '../assets/fonts/helvetiker_bold.typeface.json';
import optimer from '../assets/fonts/optimer_regular.typeface.json';
import { Entities } from './model';

const loader = new FontLoader();
const fonts: Record<string, Font> = {};
export const FONT_NAMES = { helvetiker: 'Helvetiker', helvetiker_bold: 'Helvetiker Fett', optimer: 'Optimer' } as const;
export type FontName = keyof typeof FONT_NAMES;

export function getFont(name: FontName = 'helvetiker'): Font {
  if (!fonts[name]) fonts[name] = loader.parse((name === 'helvetiker_bold' ? bold : name === 'optimer' ? optimer : regular) as any);
  return fonts[name];
}

/** Builds faces (and optionally extrusions) for text in the XY plane (or XZ when upright). */
export function buildText(ents: Entities, text: string, opts: { size: number; depth: number; font?: FontName; filled?: boolean; upright?: boolean }) {
  const font = getFont(opts.font);
  const shapes = font.generateShapes(text, opts.size);
  const map = (p: THREE.Vector2) => (opts.upright ? new THREE.Vector3(p.x, 0, p.y) : new THREE.Vector3(p.x, p.y, 0));
  const faces: number[] = [];
  for (const s of shapes) {
    const ex = s.extractPoints(6);
    let outer = dedupe(ex.shape); let holes = ex.holes.map(dedupe).filter(h => h.length >= 3);
    if (outer.length < 3) continue;
    if (THREE.ShapeUtils.isClockWise(outer)) outer = outer.reverse();
    holes = holes.map(h => (THREE.ShapeUtils.isClockWise(h) ? h : h.reverse()));
    const ov = outer.map(p => ents.rawVertex(map(p)));
    const hv = holes.map(h => h.map(p => ents.rawVertex(map(p))));
    if (opts.filled === false) {
      for (const loop of [ov, ...hv]) for (let i = 0; i < loop.length; i++) ents.createEdgeRaw(loop[i], loop[(i + 1) % loop.length]);
      continue;
    }
    const f = ents.createFaceRaw(ov, hv);
    if (f) faces.push(f.id);
  }
  // CCW outlines face +Z (flat) or -Y (upright, readable from the front view)
  if (opts.depth > 0 && opts.filled !== false) for (const fid of faces) ents.pushPull(fid, opts.depth);
  return faces;
}

function dedupe(pts: THREE.Vector2[]): THREE.Vector2[] {
  const out: THREE.Vector2[] = [];
  for (const p of pts) if (!out.length || out[out.length - 1].distanceTo(p) > 1e-6) out.push(p);
  while (out.length > 1 && out[0].distanceTo(out[out.length - 1]) < 1e-6) out.pop();
  return out;
}

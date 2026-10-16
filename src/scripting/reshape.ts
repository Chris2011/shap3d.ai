import type { Editor } from '../engine/editor';
import { Entities, type Instance, type Face } from '../core/model';
import { ScriptApi, PARAMETRIC } from './api';
import { toTriMesh, fromTriMesh, loopSubdivide, simplify, resampleCircle } from '../core/meshops';

/** Current segment / side count of a parametric shape. */
export function resolutionOf(inst: Instance): { value: number; min: number; label: string; res: string } | null {
  const s = inst.def.shape; const p = s && PARAMETRIC[s.kind]; if (!s || !p) return null;
  const v = Number(s.opts[p.res] ?? p.def);
  return { value: Number.isFinite(v) ? v : p.def, min: p.min, label: p.label, res: p.res === 'sides' ? 'Seiten' : 'Segmente' };
}

/** Rebuilds a parametric shape with a new segment count (exact geometry, one undo step). */
export function setResolution(ed: Editor, inst: Instance, value: number): boolean {
  const s = inst.def.shape; const p = s && PARAMETRIC[s.kind]; if (!s || !p) return false;
  const n = Math.max(p.min, Math.min(256, Math.round(value)));
  ed.commit(`${p.label}: ${n} ${p.res === 'sides' ? 'Seiten' : 'Segmente'}`, () => {
    const opts: Record<string, unknown> = { ...s.opts, [p.res]: n };
    if (s.kind === 'torus') opts.sides = Math.max(3, Math.round(n / 2));
    // build it again in a scratch area, then move the new geometry into the existing definition
    const api = new ScriptApi(ed, new Entities());
    const g = (api as any)[s.kind](...s.args, opts);
    const fresh = g.inst.def;
    inst.def.entities = fresh.entities;
    inst.def.shape = { kind: s.kind, args: s.args, opts };
    ed.model.definitions.delete(fresh.id);
  });
  return true;
}

/** Circle drawn with the circle/polygon tool (not extruded yet): redraw it with a new segment count. */
export function setCircleSegments(ed: Editor, ents: Entities, face: Face, value: number): number | null {
  let id: number | null = null;
  ed.commit(`Kreis: ${Math.round(value)} Segmente`, () => { id = resampleCircle(ents, face, value); });
  if (id != null) ed.select([{ kind: 'face', id }]);
  return id;
}

const MAX_TRIANGLES = 250_000;

/**
 * More polygons for any group/component: every triangle becomes four.
 * round = Loop subdivision (corners and curves get softer), otherwise the shape stays exactly the same.
 */
export function subdivideInstance(ed: Editor, inst: Instance, round = true): string | null {
  const m = toTriMesh(inst.def.entities);
  if (!m.tris.length) return 'Das Objekt hat keine Flächen auf seiner obersten Ebene.';
  if ((m.tris.length / 3) * 4 > MAX_TRIANGLES) return `Zu viele Polygone (${Math.round(m.tris.length / 3 * 4).toLocaleString('de-DE')} Dreiecke) – das würde den Browser ausbremsen.`;
  ed.commit(round ? 'Mehr Polygone (abrunden)' : 'Mehr Polygone', () => {
    inst.def.entities = fromTriMesh(loopSubdivide(m, round), 40, round);
    inst.def.shape = undefined; inst.def.terrain = undefined; // no longer parametric / grid based
  });
  return null;
}

/** Fewer polygons for any group/component: edge-collapse simplification down to `keep` of the points. */
export async function simplifyInstance(ed: Editor, inst: Instance, keep: number): Promise<string | null> {
  const m = toTriMesh(inst.def.entities);
  if (m.tris.length < 12) return 'Das Objekt hat schon sehr wenige Polygone.';
  const out = await simplify(m, keep);
  if (out.tris.length < 3) return 'So stark lässt sich das Objekt nicht vereinfachen.';
  ed.commit('Weniger Polygone', () => {
    inst.def.entities = fromTriMesh(out);
    inst.def.shape = undefined; inst.def.terrain = undefined;
  });
  return null;
}

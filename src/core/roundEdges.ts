import * as THREE from 'three';
import { Entities, type Face } from './model';
import { subtractAll } from './solids';

/**
 * Rounding and chamfering edges of a closed body: each edge is cut away by a prism along it – a triangle for a chamfer,
 * the space between the corner and a quarter circle for a rounding. The edges are kept as plain geometry (points and
 * the directions into both faces), so the result can be built again from the unchanged body with another size.
 *
 * shortcut: where three rounded edges meet, the corner is not blended into a sphere, and a size larger than the faces
 * beside an edge cuts into the next faces – both like a simple CAD fillet; upgrade with a B-rep kernel (STEP package).
 */

type V3 = THREE.Vector3;

export type EdgeTreatment = 'round' | 'chamfer';

/** an edge to treat, in the coordinates of its body: its ends and the directions from it into the two faces */
export interface EdgeSpec {
  start: number[];
  end: number[];
  intoA: number[];
  intoB: number[];
}

/** segments of a rounding's quarter circle */
const ARC_SEGMENTS = 8;
/** how far the cutter reaches past the body – 1 mm leaves slivers the boolean library cuts wrongly, 1 cm does not */
const OVERLAP = 0.01;
/** how far it reaches past the edge's ends – not the same as OVERLAP, or its end would lie in the plane of a neighbouring cutter's side */
const END_OVERLAP = 0.017;

/** the direction from the edge into the face: in the face's plane, across the edge, towards the face's middle */
const intoFace = (ents: Entities, face: Face, start: V3, along: V3) => {
  const across = ents.faceNormal(face).clone().cross(along).normalize();
  return across.dot(ents.faceCenter(face).clone().sub(start)) < 0 ? across.negate() : across;
};

/** An outer edge between two faces as an EdgeSpec – null for a border, an inner (concave) or a flat edge. */
export const edgeSpecOf = (ents: Entities, edgeId: number): EdgeSpec | null => {
  const edge = ents.edges.get(edgeId);
  const faces = ents.facesOfEdge(edgeId);
  if (!edge || faces.length !== 2) {
    return null;
  }
  const start = ents.positionOf(edge.start).clone(),
    end = ents.positionOf(edge.end).clone();
  const along = end.clone().sub(start).normalize();
  const [normalA, normalB] = faces.map((face) => ents.faceNormal(face));
  const intoA = intoFace(ents, faces[0], start, along),
    intoB = intoFace(ents, faces[1], start, along);
  // outer edge: going into one face leads away from where the other one faces
  const convex = intoA.dot(normalB) < -1e-6 && intoB.dot(normalA) < -1e-6;
  if (!convex || Math.abs(normalA.dot(normalB)) > 1 - 1e-6) {
    return null;
  }
  return { start: start.toArray(), end: end.toArray(), intoA: intoA.toArray(), intoB: intoB.toArray() };
};

/**
 * The cross-section of the cutter around the edge point (origin): the cut from face A to face B, closed by a point well
 * outside the body. Its sides cross the faces at a slant – sides lying on the faces would leave slivers where the
 * cutters of two edges meet at a corner.
 */
const section = (intoA: V3, intoB: V3, treatment: EdgeTreatment, size: number): V3[] => {
  const angle = intoA.angleTo(intoB);
  // a chamfer goes `size` along each face; a rounding of radius `size` touches the faces this far from the edge
  const reach = treatment === 'chamfer' ? size : size / Math.tan(angle / 2);
  const onA = intoA.clone().multiplyScalar(reach),
    onB = intoB.clone().multiplyScalar(reach);
  const inward = intoA.clone().add(intoB).normalize();
  const cut: V3[] = [onA];
  if (treatment === 'round') {
    const center = inward.clone().multiplyScalar(size / Math.sin(angle / 2));
    const fromCenterA = onA.clone().sub(center),
      fromCenterB = onB.clone().sub(center);
    const turn = new THREE.Quaternion().setFromUnitVectors(fromCenterA.clone().normalize(), fromCenterB.clone().normalize());
    for (let i = 1; i < ARC_SEGMENTS; i++) {
      cut.push(center.clone().add(fromCenterA.clone().applyQuaternion(new THREE.Quaternion().slerp(turn, i / ARC_SEGMENTS))));
    }
  }
  cut.push(onB);
  return [...cut, inward.multiplyScalar(-(reach + OVERLAP))];
};

/** A closed prism: `outline` at its start, moved by `extrude` to its end; faces turned outward. */
const prism = (outline: V3[], extrude: V3, material: string | undefined): Entities => {
  const ents = new Entities();
  // the start cap faces against the extrusion
  const normal = new THREE.Vector3();
  for (let i = 0; i < outline.length; i++) {
    normal.add(outline[i].clone().cross(outline[(i + 1) % outline.length]));
  }
  const ordered = normal.dot(extrude) > 0 ? [...outline].reverse() : outline;
  const startIds = ordered.map((point) => ents.addVertex(point));
  const endIds = ordered.map((point) => ents.addVertex(point.clone().add(extrude)));
  ents.createFaceRaw(startIds, [], { material });
  ents.createFaceRaw([...endIds].reverse(), [], { material });
  for (let i = 0; i < ordered.length; i++) {
    const next = (i + 1) % ordered.length;
    ents.createFaceRaw([startIds[i], endIds[i], endIds[next], startIds[next]], [], { material });
  }
  return ents;
};

/** the solid that is cut away along one edge – its faces become the rounding, so they carry `material` */
export const edgeCutter = (spec: EdgeSpec, treatment: EdgeTreatment, size: number, material?: string): Entities => {
  const start = new THREE.Vector3().fromArray(spec.start),
    end = new THREE.Vector3().fromArray(spec.end);
  const along = end.clone().sub(start).normalize();
  const from = start.clone().addScaledVector(along, -END_OVERLAP);
  const outline = section(new THREE.Vector3().fromArray(spec.intoA), new THREE.Vector3().fromArray(spec.intoB), treatment, size);
  return prism(
    outline.map((point) => point.add(from)),
    end.clone().addScaledVector(along, END_OVERLAP).sub(from),
    material,
  );
};

/** the material of the body's face beside the edge (face A) – the rounding looks like it */
const materialBeside = (body: Entities, spec: EdgeSpec) => {
  const intoA = new THREE.Vector3().fromArray(spec.intoA),
    intoB = new THREE.Vector3().fromArray(spec.intoB);
  const normal = intoB.clone().addScaledVector(intoA, -intoA.dot(intoB)).normalize().negate();
  const middle = new THREE.Vector3().fromArray(spec.start).lerp(new THREE.Vector3().fromArray(spec.end), 0.5);
  const point = middle.addScaledVector(intoA, 1e-3);
  return body.facesInPlane(point, normal).find((face) => body.pointInFace(face, point, false))?.material;
};

/** The body with its edges rounded or chamfered; groups inside it stay as they are. */
export const treatEdges = (
  body: Entities,
  specs: EdgeSpec[],
  treatment: EdgeTreatment,
  size: number,
  defs: Parameters<typeof subtractAll>[2]['defs'],
): Entities =>
  subtractAll(
    body,
    specs.map((spec) => edgeCutter(spec, treatment, size, materialBeside(body, spec))),
    { defs, role: 'result' },
  );

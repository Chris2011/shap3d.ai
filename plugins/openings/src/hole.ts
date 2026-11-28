// Closing an opening's hole in its wall again – when its size changes, and when it is deleted.
import type { Matrix4, Vector3 } from 'three';
import type { Entities } from '../../../src/core/model';
import type { OpeningData } from './place';
import { THREE } from './runtime';

/** the eight corners of an opening's hole in its wall's coordinates: outer face first (bottom left, counter-clockwise), then inner */
export const holeCorners = (matrix: Matrix4, data: OpeningData) => {
  const origin = new THREE.Vector3().setFromMatrixPosition(matrix);
  const [along, inward, up] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  matrix.extractBasis(along, inward, up);
  const outer = [
    [0, 0],
    [data.width, 0],
    [data.width, data.height],
    [0, data.height],
  ].map(([x, z]) => origin.clone().addScaledVector(along, x).addScaledVector(up, z));
  return { outer, inner: outer.map((corner) => corner.clone().addScaledVector(inward, data.thickness)), along, inward };
};

/**
 * Closes the hole: each side of its box that is a face of its own goes (the reveals); each side that has a coplanar
 * neighbour in the wall is filled with that neighbour's material and healed into it (front, back, a door's floor).
 */
export const fillHole = (entities: Entities, outer: Vector3[], inner: Vector3[]) => {
  const sides = [
    outer,
    [...inner].reverse(),
    ...outer.map((corner, index) => [corner, outer[(index + 1) % 4], inner[(index + 1) % 4], inner[index]]),
  ];
  const healEdges = new Set<number>();
  for (const side of sides) {
    const ids = side.map((corner) => entities.findVertex(corner));
    if (ids.some((id) => id === undefined) || new Set(ids).size < 3) {
      continue; // a single sheet: the hole has no sides
    }
    const area = side[1].distanceTo(side[0]) * side[3].distanceTo(side[0]);
    const middle = side[0].clone().lerp(side[2], 0.5);
    const own = [...entities.faces.values()].find(
      (face) => !face.holes.length && ids.every((id) => face.outer.includes(id!)) && Math.abs(entities.faceArea(face) - area) < 1e-6,
    );
    if (own) {
      entities.removeFace(own.id);
      continue;
    }
    const edges = ids.map((id, index) => entities.edgeBetween(id!, ids[(index + 1) % ids.length]!)).filter((edge) => !!edge);
    const normal = side[1].clone().sub(side[0]).cross(side[3].clone().sub(side[0])).normalize();
    const neighbour = edges
      .flatMap((edge) => entities.facesOfEdge(edge.id))
      .find((face) => Math.abs(entities.faceNormal(face).dot(normal)) > 0.999);
    // no neighbour, or the side is closed already (closing twice does nothing)
    if (!neighbour || [...entities.faces.values()].some((face) => entities.pointInFace(face, middle, false))) {
      continue;
    }
    const facing = entities.faceNormal(neighbour).dot(normal) > 0 ? ids : [...ids].reverse();
    entities.createFaceRaw(facing as number[], [], {
      material: neighbour.material,
      backMaterial: neighbour.backMaterial,
      tag: neighbour.tag,
    });
    edges.forEach((edge) => healEdges.add(edge.id));
  }
  entities.mergeCoplanar(healEdges);
  // edges of the hole that no face needs any more (its rims and the four edges through the wall), and its corners
  // left in the middle of a wall's edge
  const corners = [...outer, ...inner].map((corner) => entities.findVertex(corner)).filter((id) => id !== undefined);
  const holeEdges = corners.flatMap((id) => entities.edgesOfVertex(id).map((edge) => edge.id));
  for (const id of new Set([...healEdges, ...holeEdges])) {
    if (entities.edges.has(id) && !entities.facesOfEdge(id).length) {
      entities.eraseEdge(id, false);
    }
  }
  entities.healCollinear(corners);
  entities.removeOrphanVertices(corners);
};

/** closes the hole of an opening that sat in `entities` at `matrix` */
export const closeHole = (entities: Entities, matrix: Matrix4, data: OpeningData) => {
  const { outer, inner } = holeCorners(matrix, data);
  fillHole(entities, outer, inner);
};

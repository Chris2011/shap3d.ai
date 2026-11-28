// Changing a placed window or door. Sashes, bars and hinges only build its pieces again; a new size first closes the
// old hole in the wall (the hole's sides go, its front and back are filled and healed into the wall faces) and then
// cuts the new one, centred where the old one was.
import type { Vector3 } from 'three';
import type { Entities, Instance } from '../../../src/core/model';
import type { PluginContext } from '../../../src/plugins/types';
import type { OpeningParams } from './parts';
import { buildPieces, cutHole, openingOf, openingPlace, type OpeningData } from './place';
import { THREE, t } from './runtime';

/** the eight corners of an opening's hole in its wall's coordinates: outer face first (bottom left, counter-clockwise), then inner */
const holeCorners = (instance: Instance, data: OpeningData) => {
  const origin = new THREE.Vector3().setFromMatrixPosition(instance.matrix);
  const [along, inward, up] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  instance.matrix.extractBasis(along, inward, up);
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
const fillHole = (entities: Entities, outer: Vector3[], inner: Vector3[]) => {
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
    if (!neighbour) {
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
  // edges of the hole that no face needs any more, and its corners left in the middle of a wall's edge
  for (const id of healEdges) {
    if (entities.edges.has(id) && !entities.facesOfEdge(id).length) {
      entities.eraseEdge(id, false);
    }
  }
  const corners = [...outer, ...inner].map((corner) => entities.findVertex(corner)).filter((id) => id !== undefined);
  entities.healCollinear(corners);
  entities.removeOrphanVertices(corners);
};

/** the wall face the opening sat in, now whole again: the one facing out at the old hole's middle */
const wallFaceAt = (entities: Entities, point: Vector3, outward: Vector3) =>
  [...entities.faces.values()].find((face) => entities.faceNormal(face).dot(outward) > 0.999 && entities.pointInFace(face, point, false));

/**
 * New settings for a placed opening – one undo step. A new size closes the old hole and cuts the new one; when the new
 * one does not fit or cannot be cut, nothing changes (the app says why) and false is returned.
 */
export const changeOpening = (context: PluginContext, instance: Instance, patch: Partial<OpeningParams>) => {
  const data = openingOf(context, instance);
  if (!data) {
    return true;
  }
  const changed: OpeningData = { ...data, ...patch, kind: data.kind };
  if (changed.kind === 'door') {
    changed.sill = 0;
  }
  const resized = changed.width !== data.width || changed.height !== data.height || changed.sill !== data.sill;
  const entities = context.editor.entities;
  try {
    context.editor.commit('openings.undo.change', () => {
      if (resized && entities.instances.has(instance.id)) {
        const { outer, inner, inward } = holeCorners(instance, data);
        fillHole(entities, outer, inner);
        const middle = outer[0].clone().lerp(outer[2], 0.5);
        const face = wallFaceAt(entities, middle, inward.clone().negate());
        const place = face && openingPlace(entities, face.id, middle, changed);
        // throwing undoes everything done in this step
        if (!place || 'error' in place || !place.fits) {
          throw new Error(t('openings.errors.tooBig'));
        }
        if (cutHole(entities, place.corners, place.normal) === null) {
          throw new Error(t('openings.errors.cutFailed'));
        }
        instance.matrix.setPosition(place.corners[0]);
      }
      context.data.set(instance.definition, { opening: changed });
      buildPieces(context, instance.definition.entities, changed);
    });
    return true;
  } catch {
    return false;
  }
};

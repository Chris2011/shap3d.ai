// Setting a window or door into a wall: where it goes on the face, the hole through the wall (the opening's rectangle
// drawn on the face and pushed onto the wall's back, as in SketchUp), and the group of pieces in it.
import type { Vector3 } from 'three';
import type { Entities, Instance } from '../../../src/core/model';
import type { PluginContext } from '../../../src/plugins/types';
import { openingPieces, type OpeningParams, type PieceMaterial } from './parts';
import { THREE, t } from './runtime';

/** what is kept on an opening's group: its settings and the wall's thickness it was made for */
export interface OpeningData extends OpeningParams {
  thickness: number;
}

const COLOURS: Record<PieceMaterial, { color: string; opacity?: number }> = {
  frame: { color: '#f4f4f2' },
  glass: { color: '#9fc3dd', opacity: 0.35 },
  sill: { color: '#d6d2ca' },
  leaf: { color: '#e8e2d6' },
  handle: { color: '#8a8f96' },
};

export const openingOf = (context: PluginContext, instance: Instance | undefined) =>
  instance ? context.data.get<{ opening?: OpeningData }>(instance.definition)?.opening : undefined;

/**
 * The opening's place on a wall face, around `point` (in the face's own coordinates): its corners (bottom left first,
 * seen from the face's front), the direction along the wall, and whether it fits on the face.
 */
export const openingPlace = (entities: Entities, faceId: number, point: Vector3, params: OpeningParams) => {
  const face = entities.faces.get(faceId);
  if (!face) {
    return null;
  }
  const normal = entities.faceNormal(face);
  if (Math.abs(normal.z) > 0.05) {
    return { error: 'notVertical' as const };
  }
  const up = new THREE.Vector3(0, 0, 1);
  // x along the wall, y into it (−normal), z up – a right-handed frame
  const along = new THREE.Vector3().crossVectors(normal.clone().negate(), up).normalize();
  const bottom = Math.min(...entities.facePoints(face).map((corner) => corner.z));
  const origin = point.clone().addScaledVector(along, -params.width / 2);
  origin.z = bottom + (params.kind === 'door' ? 0 : params.sill);
  const corners = [
    origin,
    origin.clone().addScaledVector(along, params.width),
    origin.clone().addScaledVector(along, params.width).addScaledVector(up, params.height),
    origin.clone().addScaledVector(up, params.height),
  ];
  // corners and the middles of the sides on the face (its edge counts): the opening lies on the wall
  const checks = corners.flatMap((corner, index) => [corner, corner.clone().lerp(corners[(index + 1) % 4], 0.5)]);
  const fits = checks.every((check) => entities.pointInFace(face, check, false));
  return { face, normal, along, corners, fits };
};

/** the wall's thickness behind the rectangle: the nearest face facing the other way that lies behind its middle (null: a single sheet) */
const thicknessBehind = (entities: Entities, corners: Vector3[], normal: Vector3) => {
  const middle = corners[0].clone().lerp(corners[2], 0.5);
  const inward = normal.clone().negate();
  let nearest = Infinity;
  for (const face of entities.faces.values()) {
    if (entities.faceNormal(face).dot(normal) > -0.999) {
      continue;
    }
    const distance = entities.positionOf(face.outer[0]).clone().sub(middle).dot(inward);
    if (distance > 1e-4 && distance < nearest && entities.pointInFace(face, middle.clone().addScaledVector(inward, distance), false)) {
      nearest = distance;
    }
  }
  return Number.isFinite(nearest) ? nearest : null;
};

/** cuts the rectangle through the wall; returns the wall's thickness (0: it was a single face, now with a hole) */
export const cutHole = (entities: Entities, corners: Vector3[], normal: Vector3) => {
  const thickness = thicknessBehind(entities, corners, normal);
  entities.addLoop(corners);
  const ids = corners.map((corner) => entities.findVertex(corner));
  const area = corners[1].distanceTo(corners[0]) * corners[3].distanceTo(corners[0]);
  // the face inside the rectangle: all four corners (points left on its sides may add more), its size, facing the same way
  const inside = [...entities.faces.values()].find(
    (face) =>
      !face.holes.length &&
      ids.every((id) => id !== undefined && face.outer.includes(id)) &&
      Math.abs(entities.faceArea(face) - area) < 1e-6 &&
      entities.faceNormal(face).dot(normal) > 0.999,
  );
  if (!inside) {
    return null;
  }
  if (thickness === null) {
    entities.removeFace(inside.id);
    return 0;
  }
  entities.pushPull(inside.id, -thickness);
  return thickness;
};

/** builds the pieces into the opening's group (again) */
export const buildPieces = (context: PluginContext, group: Entities, data: OpeningData) => {
  const model = context.editor.model;
  for (const id of [...group.instances.keys()]) {
    group.instances.delete(id);
  }
  for (const piece of openingPieces(data, data.thickness)) {
    const material = context.materials.ensure(t(`openings.materials.${piece.material}`), COLOURS[piece.material]);
    const definition = model.newDefinition(model.uniqueDefName(t(`openings.pieces.${piece.name}`)), false);
    context.meshes.build(definition.entities, { ...piece.mesh, faceMaterials: piece.mesh.faces.map(() => material) });
    group.addInstance(definition);
  }
};

/**
 * Sets an opening into the wall face `faceId` of `entities` around `point` (the face's own coordinates) – one undo
 * step. Returns the new group, or the reason it could not be set.
 */
export const placeOpening = (context: PluginContext, entities: Entities, faceId: number, point: Vector3, params: OpeningParams) => {
  const place = openingPlace(entities, faceId, point, params);
  if (!place || 'error' in place) {
    return { error: place?.error ?? 'noFace' };
  }
  if (!place.fits) {
    return { error: 'tooBig' as const };
  }
  const editor = context.editor;
  let made: Instance | null = null;
  editor.commit('openings.undo.place', () => {
    const thickness = cutHole(entities, place.corners, place.normal);
    if (thickness === null) {
      return;
    }
    const name = t(`openings.kinds.${params.kind}`);
    const definition = editor.model.newDefinition(editor.model.uniqueDefName(name), false);
    const data: OpeningData = { ...params, sill: params.kind === 'door' ? 0 : params.sill, thickness };
    context.data.set(definition, { opening: data });
    buildPieces(context, definition.entities, data);
    const inward = place.normal.clone().negate();
    const matrix = new THREE.Matrix4().makeBasis(place.along, inward, new THREE.Vector3(0, 0, 1)).setPosition(place.corners[0]);
    made = entities.addInstance(definition, matrix);
  });
  return made ? { instance: made as Instance } : { error: 'cutFailed' as const };
};

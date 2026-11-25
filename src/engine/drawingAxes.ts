/**
 * The drawing axes (SketchUp's "Axes", Rhino's CPlane): red, green and blue can be turned onto a face, so drawing in
 * empty space, the arrow-key locks and rectangles follow it. They are kept in the model (`settings.drawingAxes`) and set
 * into the shared `AXES` before every rebuild – every tool reads them from there.
 */
import * as THREE from 'three';
import type { DrawingAxes, ModelSettings } from '../core/document';
import type { Entities, Face } from '../core/model';
import { AXES, AXES_ORIGIN } from './inference';

const WORLD = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

/** sets the model's drawing axes (or the model axes) into the shared AXES */
export const applyDrawingAxes = (settings: ModelSettings) => {
  const axes = settings.drawingAxes;
  if (!axes) {
    AXES.x.copy(WORLD.x);
    AXES.y.copy(WORLD.y);
    AXES.z.copy(WORLD.z);
    AXES_ORIGIN.set(0, 0, 0);
    return;
  }
  AXES.x.fromArray(axes.x).normalize();
  AXES.y.fromArray(axes.y).normalize();
  AXES.z.crossVectors(AXES.x, AXES.y).normalize();
  AXES_ORIGIN.fromArray(axes.origin);
};

/** the matrix from the model axes to the drawing axes – where the axis lines are drawn */
export const drawingAxesMatrix = () => new THREE.Matrix4().makeBasis(AXES.x, AXES.y, AXES.z).setPosition(AXES_ORIGIN);

/**
 * Axes lying on a face: origin at its first corner, red along its first edge, blue out of its front.
 * `toWorld` maps the face's coordinates (an open group) to the model's.
 */
export const axesOnFace = (entities: Entities, face: Face, toWorld: THREE.Matrix4): DrawingAxes => {
  const [first, second] = face.outer.map((vertex) => entities.positionOf(vertex).clone().applyMatrix4(toWorld));
  const normal = entities.faceNormal(face).clone().transformDirection(toWorld);
  const red = second.clone().sub(first).normalize();
  const green = normal.clone().cross(red).normalize();
  return { origin: first.toArray(), x: red.toArray(), y: green.toArray() };
};

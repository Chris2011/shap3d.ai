import type { Overlay } from '../../../src/engine/overlay';
import { KINDS } from './kinds';
import type { NavGrid } from './nav';
import { cameraLook, type LevelObject } from './objects';
import { THREE } from './runtime';

/**
 * What the viewport shows of the level besides the objects themselves: their names, the links from triggers and
 * pickups to what they set off and from a teleporter to its destination (dashed, an arrow at the end), and the view
 * of each fixed camera (its pitch and field of view). All of it while the level mode is on, the selected objects'
 * always.
 */

type Vector = InstanceType<typeof THREE.Vector3>;

/** the middle of an object's shape – where links start and end */
const centreOf = (object: LevelObject) => new THREE.Vector3(0, 0, KINDS[object.kind].size[2] / 2).applyMatrix4(object.world);

const link = (overlay: Overlay, from: Vector, to: Vector, colour: string) => {
  overlay.line(from, to, colour, 2, [6, 4]);
  // a small arrow head at the end, lying in the plane of the line and the vertical
  const direction = to.clone().sub(from).normalize();
  const side = new THREE.Vector3().crossVectors(direction, new THREE.Vector3(0, 0, 1));
  if (side.lengthSq() < 1e-6) {
    side.set(1, 0, 0);
  }
  side.normalize().multiplyScalar(0.18);
  const back = to.clone().addScaledVector(direction, -0.4);
  overlay.line(to, back.clone().add(side), colour, 2);
  overlay.line(to, back.clone().sub(side), colour, 2);
};

/** a fixed camera's view: four lines along the edges of what it sees, as far as `reach` metres */
const cameraView = (overlay: Overlay, camera: LevelObject, reach = 6) => {
  const eye = new THREE.Vector3().setFromMatrixPosition(camera.world);
  const look = cameraLook(camera);
  const up0 = new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3().crossVectors(look, up0).normalize();
  const up = new THREE.Vector3().crossVectors(right, look).normalize();
  const half = (((Number(camera.props.fov) || 50) / 2) * Math.PI) / 180;
  const height = Math.tan(half) * reach,
    width = height * (16 / 9);
  const centre = eye.clone().addScaledVector(look, reach);
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([u, v]) =>
    centre
      .clone()
      .addScaledVector(right, u * width)
      .addScaledVector(up, v * height),
  );
  const colour = camera.props.start ? '#1971c2' : KINDS.camera.colour;
  corners.forEach((corner) => overlay.line(eye, corner, colour, 1.5));
  overlay.polyline(corners, colour, 1.5, true);
};

/** the walking grid: where the player gets to in green, the floors nothing leads to in orange */
export const drawNav = (overlay: Overlay, grid: NavGrid) => {
  const half = grid.cell * 0.36;
  grid.nodes.slice(0, 40_000).forEach((node, index) => {
    // single cells on wall tops and ledges are left out – only floors people could stand on
    if (!node.reached && grid.links[index].length < 3) {
      return;
    }
    const { x, y, z } = node.position;
    overlay.fillPolygon(
      [
        new THREE.Vector3(x - half, y - half, z + 0.02),
        new THREE.Vector3(x + half, y - half, z + 0.02),
        new THREE.Vector3(x + half, y + half, z + 0.02),
        new THREE.Vector3(x - half, y + half, z + 0.02),
      ],
      node.reached ? 'rgba(47, 158, 68, 0.45)' : 'rgba(240, 140, 0, 0.5)',
    );
  });
};

export const drawLevel = (overlay: Overlay, objects: LevelObject[], everything: boolean, selected: Set<unknown>) => {
  const byId = new Map(objects.map((object) => [object.id, object]));
  for (const object of objects) {
    const shown = everything || selected.has(object.instance);
    if (!shown) {
      continue;
    }
    const colour = KINDS[object.kind].colour;
    for (const action of object.actions) {
      const target = action.target ? byId.get(action.target) : undefined;
      if (target) {
        link(overlay, centreOf(object), centreOf(target), colour);
      }
    }
    for (const spec of KINDS[object.kind].props) {
      const target = spec.type === 'target' ? byId.get(String(object.props[spec.name])) : undefined;
      if (target) {
        link(overlay, centreOf(object), centreOf(target), colour);
      }
    }
    if (object.kind === 'camera') {
      cameraView(overlay, object);
    }
    const top = new THREE.Vector3(0, 0, KINDS[object.kind].size[2] + 0.25).applyMatrix4(object.world);
    overlay.text(top, object.instance.name || object.id, { color: '#fff', background: colour });
  }
};

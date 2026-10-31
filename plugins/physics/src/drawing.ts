import type { Instance } from '../../../src/core/model';
import type { Overlay } from '../../../src/engine/overlay';
import type { BodyData, JointData } from './data';
import { currentSim, jointEnds, timelineTrail, type SimJoint } from './sim';
import { noteOverlayCanvas } from './recorder';
import { physicsInstances, findInstance } from './scene';
import { pluginContext, t, THREE } from './runtime';
import { usePhysicsState } from './state';

/**
 * What the 3D view shows besides the bodies: joints (hinge rings with their axis, slider rails, ropes and springs),
 * forces and start speeds as arrows, the regions' names – and while it runs the liquid's drops and the tunnel's smoke.
 */

type Vector = InstanceType<typeof THREE.Vector3>;
type Matrix = InstanceType<typeof THREE.Matrix4>;

const JOINT_COLOUR = '#f08c00';
const ROPE_COLOUR = '#495057';
const FORCE_COLOUR = '#e03131';
const SPEED_COLOUR = '#1c7ed6';
const REGION_COLOURS: Record<string, string> = { water: '#1971c2', liquid: '#1098ad', tunnel: '#7048e8' };

const vector = (value: number[] | undefined) => new THREE.Vector3(value?.[0] ?? 0, value?.[1] ?? 0, value?.[2] ?? 0);

/** an arrow from a point along a vector */
const arrow = (overlay: Overlay, from: Vector, along: Vector, colour: string, width = 2) => {
  const length = along.length();
  if (length < 1e-6) {
    return;
  }
  const to = from.clone().add(along);
  overlay.line(from, to, colour, width);
  const start = overlay.screen(from),
    end = overlay.screen(to);
  if (!start || !end) {
    return;
  }
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  const context = overlay.context;
  context.fillStyle = colour;
  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(end.x - 10 * Math.cos(angle - 0.4), end.y - 10 * Math.sin(angle - 0.4));
  context.lineTo(end.x - 10 * Math.cos(angle + 0.4), end.y - 10 * Math.sin(angle + 0.4));
  context.closePath();
  context.fill();
};

/** a spring as a zigzag between two points */
const zigzag = (overlay: Overlay, from: Vector, to: Vector, colour: string) => {
  const along = to.clone().sub(from);
  const side = new THREE.Vector3(0, 0, 1).cross(along);
  if (side.lengthSq() < 1e-9) {
    side.set(1, 0, 0);
  }
  side.setLength(Math.min(0.08, along.length() * 0.1));
  const points = [from.clone()];
  for (let index = 1; index < 12; index++) {
    points.push(
      from
        .clone()
        .addScaledVector(along, index / 12)
        .addScaledVector(side, index % 2 ? 1 : -1),
    );
  }
  points.push(to.clone());
  overlay.polyline(points, colour, 2);
};

/** a joint where it is: its anchor, axis and – for ropes and springs – the line to the other end */
const drawJoint = (overlay: Overlay, kind: JointData['kind'], at: Vector, other: Vector, axis: Vector, size: number) => {
  if (kind === 'rope') {
    overlay.line(at, other, ROPE_COLOUR, 2);
    return;
  }
  if (kind === 'spring') {
    zigzag(overlay, at, other, JOINT_COLOUR);
    return;
  }
  if (kind === 'hinge') {
    overlay.circle3D(at, axis, size * 0.6, JOINT_COLOUR, 2, 24);
    overlay.line(at.clone().addScaledVector(axis, -size), at.clone().addScaledVector(axis, size), JOINT_COLOUR, 2, [5, 3]);
    return;
  }
  if (kind === 'slider') {
    overlay.line(at.clone().addScaledVector(axis, -size * 1.5), at.clone().addScaledVector(axis, size * 1.5), JOINT_COLOUR, 3);
  }
  overlay.circle3D(at, new THREE.Vector3(0, 0, 1), size * 0.25, JOINT_COLOUR, 2, 16);
};

/** a size for joint marks that looks the same from near and far: a share of the distance to the camera */
const markSize = (point: Vector) => {
  const camera = pluginContext().editor.viewer.rig.camera.position;
  return Math.max(0.05, Math.min(1, point.distanceTo(camera) * 0.03));
};

/** joints, forces and regions of the model as it is (not running) */
const drawModel = (overlay: Overlay) => {
  const show = usePhysicsState().show;
  for (const { instance, data, world } of physicsInstances()) {
    if (show.joints) {
      for (const joint of data.joints ?? []) {
        const at = vector(joint.at).applyMatrix4(world);
        const axis = vector(joint.axis ?? [0, 0, 1])
          .transformDirection(world)
          .normalize();
        drawJoint(overlay, joint.kind, at, otherEnd(joint, at, world), axis, markSize(at));
      }
    }
    if (show.forces) {
      drawForces(overlay, data, world, instance);
    }
    if (REGION_COLOURS[data.type]) {
      drawRegion(overlay, instance.definition.entities.bounds(new THREE.Box3(), world), data);
    }
  }
};

/** the other end of a rope or spring before the start */
const otherEnd = (joint: JointData, at: Vector, world: Matrix) => {
  if (joint.kind !== 'rope' && joint.kind !== 'spring') {
    return at;
  }
  const to = joint.to ?? 'parent';
  if (typeof to === 'number') {
    const other = findInstance(to);
    return other
      ? joint.toAt
        ? vector(joint.toAt).applyMatrix4(other.world)
        : new THREE.Vector3().setFromMatrixPosition(other.world)
      : at;
  }
  return joint.toAt ? vector(joint.toAt) : new THREE.Vector3().setFromMatrixPosition(world).add(new THREE.Vector3(0, 0, 1));
};

/** forces and the start speed as arrows from the middle of the object (not its group's origin, which may be far off) */
const drawForces = (overlay: Overlay, data: BodyData, world: Matrix, instance: Instance) => {
  const centre = instance.definition.entities.bounds(new THREE.Box3(), world).getCenter(new THREE.Vector3());
  const size = markSize(centre) * 2;
  const scaled = (value: Vector, unit: number) =>
    value.clone().setLength(Math.min(4, size * (0.5 + Math.log10(1 + value.length() / unit))));
  if (data.force) {
    arrow(overlay, centre, scaled(vector(data.force), 10), FORCE_COLOUR);
  }
  if (data.thrust) {
    const turn = new THREE.Quaternion();
    world.decompose(new THREE.Vector3(), turn, new THREE.Vector3());
    arrow(overlay, centre, scaled(vector(data.thrust).applyQuaternion(turn), 10), FORCE_COLOUR, 3);
  }
  if (data.velocity && data.type === 'dynamic') {
    arrow(overlay, centre, scaled(vector(data.velocity), 1), SPEED_COLOUR);
  }
};

const drawRegion = (overlay: Overlay, box: InstanceType<typeof THREE.Box3>, data: BodyData) => {
  const colour = REGION_COLOURS[data.type];
  const top = new THREE.Vector3((box.min.x + box.max.x) / 2, (box.min.y + box.max.y) / 2, box.max.z);
  overlay.text(top, t(`physics.types.${data.type}`), { color: '#fff', background: colour, offsetY: -12 });
  if (data.type === 'tunnel' || (data.type === 'water' && data.velocity)) {
    const wind = vector(data.velocity ?? [5, 0, 0]);
    const centre = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    arrow(
      overlay,
      centre.clone().addScaledVector(wind.clone().normalize(), -size.length() / 4),
      wind.clone().setLength(size.length() / 4),
      colour,
      3,
    );
  }
};

// ------------------------------------------------------------ while it runs

const drawRunningJoint = (overlay: Overlay, joint: SimJoint) => {
  const [at, other] = jointEnds(joint);
  const rotation = (joint.other ?? null)?.rb.rotation();
  const axis = joint.axis.clone();
  if (rotation) {
    axis.applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w));
  }
  drawJoint(overlay, joint.data.kind, at, other, axis, markSize(at));
};

/** where the moving bodies have been: lines that fade towards their end */
const drawTrails = (overlay: Overlay) => {
  const sim = currentSim();
  const scrub = usePhysicsState().scrub;
  (sim?.bodies ?? []).forEach((body, bodyIndex) => {
    // only those that moved on – not crates that only settle; while the timeline is dragged: up to the moment shown
    const trail = scrub === null ? body.trail : timelineTrail(bodyIndex, scrub);
    if (trail.length < 2 || trail[0].distanceTo(trail[trail.length - 1]) < 0.5) {
      return;
    }
    for (let index = 1; index < trail.length; index++) {
      const alpha = (index / trail.length) * 0.8;
      overlay.line(trail[index - 1], trail[index], `rgba(28, 126, 214, ${alpha.toFixed(2)})`, 2);
    }
  });
};

/** the drops: discs from far to near, lighter where they move fast (foam) */
const drawLiquids = (overlay: Overlay) => {
  const sim = currentSim();
  if (!sim) {
    return;
  }
  const camera = pluginContext().editor.viewer.rig.camera;
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const context = overlay.context;
  const point = new THREE.Vector3();
  for (const liquid of sim.liquids) {
    const order = Array.from({ length: liquid.count }, (_, index) => index);
    const distance = order.map((index) => point.fromArray(liquid.positions, index * 3).distanceToSquared(camera.position));
    order.sort((a, b) => distance[b] - distance[a]);
    for (const index of order) {
      point.fromArray(liquid.positions, index * 3);
      const centre = overlay.screen(point);
      const edge = overlay.screen(point.clone().addScaledVector(right, liquid.radius * 1.15));
      if (!centre || !edge) {
        continue;
      }
      const radius = Math.max(1.5, Math.hypot(edge.x - centre.x, edge.y - centre.y) * 0.9);
      const foam = Math.min(1, liquid.speeds[index] / 4);
      context.fillStyle = `rgb(${Math.round(30 + 190 * foam)}, ${Math.round(120 + 115 * foam)}, ${Math.round(220 + 35 * foam)})`;
      context.beginPath();
      context.arc(centre.x, centre.y, radius, 0, Math.PI * 2);
      context.fill();
    }
  }
};

/** the tunnel's smoke lines, coloured by speed: blue slow, green as fast as the wind, red faster */
const drawFlow = (overlay: Overlay) => {
  const sim = currentSim();
  if (!sim) {
    return;
  }
  for (const tunnel of sim.tunnels) {
    const wind = Math.max(0.1, tunnel.wind.length());
    for (const smoke of tunnel.smoke) {
      for (let index = 1; index < smoke.points.length; index++) {
        const from = smoke.points[index - 1],
          to = smoke.points[index];
        // blue (0.4 × the wind or slower) … green (the wind's speed) … red (1.6 × or faster)
        const speed = smoke.speeds[index] / wind;
        const hue = Math.round(Math.min(240, Math.max(0, 120 - (speed - 1) * 200)));
        const alpha = (index / smoke.points.length) * 0.9;
        overlay.line(from, to, `hsla(${hue}, 85%, 50%, ${alpha.toFixed(2)})`, 2);
      }
    }
  }
};

export const drawPhysics = (overlay: Overlay) => {
  noteOverlayCanvas(overlay.canvas);
  const sim = currentSim();
  const show = usePhysicsState().show;
  if (!sim) {
    drawModel(overlay);
    return;
  }
  if (show.trails) {
    drawTrails(overlay);
  }
  drawLiquids(overlay);
  // a moment of the timeline: the joints, the flow and the pull are the simulation's now, not that moment's
  if (usePhysicsState().scrub !== null) {
    return;
  }
  if (show.flow) {
    drawFlow(overlay);
  }
  if (show.joints) {
    for (const joint of sim.joints) {
      drawRunningJoint(overlay, joint);
    }
  }
  if (sim.grab) {
    const { body, point, target } = sim.grab;
    const rotation = body.rb.rotation();
    const position = body.rb.translation();
    const from = point
      .clone()
      .applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w))
      .add(new THREE.Vector3(position.x, position.y, position.z));
    overlay.line(from, target, '#2f9e44', 2, [6, 4]);
    overlay.circle3D(target, new THREE.Vector3(0, 0, 1), markSize(target) * 0.3, '#2f9e44', 2, 16);
  }
};

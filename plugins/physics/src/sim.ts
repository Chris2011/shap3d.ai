import type { Collider, ImpulseJoint, RigidBody, UnitImpulseJoint, World } from '@dimforge/rapier3d-compat';
import { loadRapier, type Rapier } from './rapier';
import { collectScene, modelFingerprint, type BodyNode, type Part } from './scene';
import type { Instance } from '../../../src/core/model';
import { settingsOf, surfaceOf, type JointData, type PhysicsSettings } from './data';
import { createLiquid, stepLiquid, type Liquid } from './liquid';
import { createTunnel, flowAt, stepTunnel, type Tunnel } from './flow';
import { pluginContext, t, THREE } from './runtime';
import { learn, usePhysicsState } from './state';

/**
 * The simulation: the model's bodies in a Rapier world, stepped in small fixed steps, shown where they are with
 * `display.place` – the model itself is not changed until the positions are kept on purpose. Every body starts
 * turned like the world (its instance's own turn and scale are kept aside), so joints can be given in model axes.
 */

type Vector = InstanceType<typeof THREE.Vector3>;
type Quaternion = InstanceType<typeof THREE.Quaternion>;
type Matrix = InstanceType<typeof THREE.Matrix4>;

/** seconds per step – small, so fast bodies and stiff joints stay stable */
const STEP = 1 / 120;
const MAX_STEPS_PER_FRAME = 10;
/** the trails behind moving bodies: a point every … seconds, at most … points */
const TRAIL_STEP = 0.04;
const TRAIL_POINTS = 60;

export interface SimBody {
  node: BodyNode;
  rb: RigidBody;
  colliders: Collider[];
  /** where it started, and its instance's own turn and scale (the body itself starts turned like the world) */
  start: Vector;
  turn: Quaternion;
  scale: Vector;
  /** where it is shown now, in model coordinates */
  shown: Matrix;
  /** shown with display.place (its place differs from the model's) */
  placed: boolean;
  /** what the body holds: m³ and its box around the centre (body coordinates, at the start) */
  volume: number;
  box: InstanceType<typeof THREE.Box3>;
  /** where its centre was – a point every TRAIL_STEP seconds, the last TRAIL_POINTS */
  trail: Vector[];
  /** air drag N/(m/s)² from its size – used when the air is on or it is in a tunnel (its own drag wins) */
  autoDrag: number;
}

export interface SimJoint {
  data: JointData;
  /** the body the joint is on, and the one (or the world: null) it holds on to */
  owner: SimBody;
  other: SimBody | null;
  joint: ImpulseJoint;
  /** anchors in the bodies' coordinates (the world's for null) */
  anchorOwner: Vector;
  anchorOther: Vector;
  /** hinge and slider: the axis in model coordinates at the start */
  axis: Vector;
  /** "<instance id>:<index>" – what the panel's live controls refer to */
  key: string;
  /** the motor target last given (to skip giving it again) */
  target: number | null;
}

export interface Water {
  node: BodyNode;
  box: InstanceType<typeof THREE.Box3>;
  density: number;
  current: Vector;
}

export interface Simulation {
  rapier: Rapier;
  world: World;
  settings: PhysicsSettings;
  bodies: SimBody[];
  joints: SimJoint[];
  waters: Water[];
  liquids: Liquid[];
  tunnels: Tunnel[];
  /** the static world (loose faces, plain groups, the ground) and its geometry */
  fixed: RigidBody;
  worldPart: Part;
  /** liquids and tunnels hide their own group while it runs: whether each was hidden before */
  hidden: Map<Instance, boolean | undefined>;
  byInstance: Map<number, SimBody>;
  /** a body pulled with the pull tool: the point on it (body coordinates) and where it is pulled to */
  grab: { body: SimBody; point: Vector; target: Vector } | null;
  time: number;
  frame: number;
  last: number;
  /** the model's fingerprint when it was built – another one means the model changed */
  fingerprint: number;
}

let sim: Simulation | null = null;
export const currentSim = () => sim;

// ------------------------------------------------------------ helpers

const vec = (value: { x: number; y: number; z: number }) => new THREE.Vector3(value.x, value.y, value.z);
const rapierVec = (value: Vector) => ({ x: value.x, y: value.y, z: value.z });
const fromArray = (value: number[] | undefined, fallback = 0) =>
  new THREE.Vector3(value?.[0] ?? fallback, value?.[1] ?? fallback, value?.[2] ?? fallback);
const DEG = Math.PI / 180;

/** points of a part relative to a point, as Rapier wants them */
const relativePoints = (points: number[], origin: Vector) => {
  const result = new Float32Array(points.length);
  for (let index = 0; index < points.length; index += 3) {
    result[index] = points[index] - origin.x;
    result[index + 1] = points[index + 1] - origin.y;
    result[index + 2] = points[index + 2] - origin.z;
  }
  return result;
};

/** a box around points (model coordinates) seen in an instance's own coordinates */
const localBox = (points: number[], inverse: Matrix) => {
  const box = new THREE.Box3();
  const point = new THREE.Vector3();
  for (let index = 0; index < points.length; index += 3) {
    box.expandByPoint(point.set(points[index], points[index + 1], points[index + 2]).applyMatrix4(inverse));
  }
  return box;
};

/** a trimesh of triangles (model coordinates) around a point – welded, so Rapier sees a closed surface */
const trimesh = (rapier: Rapier, part: Part, origin: Vector) => {
  const vertices: number[] = [];
  const indices: number[] = [];
  const seen = new Map<string, number>();
  for (let index = 0; index < part.triangles.length; index += 3) {
    const x = part.triangles[index] - origin.x,
      y = part.triangles[index + 1] - origin.y,
      z = part.triangles[index + 2] - origin.z;
    const name = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let vertex = seen.get(name);
    if (vertex === undefined) {
      vertex = vertices.length / 3;
      vertices.push(x, y, z);
      seen.set(name, vertex);
    }
    indices.push(vertex);
  }
  return indices.length >= 3 ? rapier.ColliderDesc.trimesh(new Float32Array(vertices), new Uint32Array(indices)) : null;
};

/** the shapes of a body, placed relative to its start point */
const colliderShapes = (rapier: Rapier, node: BodyNode, start: Vector, turn: Quaternion, scale: Vector) => {
  const data = node.data;
  const all: Part = { points: node.parts.flatMap((part) => part.points), triangles: node.parts.flatMap((part) => part.triangles) };
  const shape = data.shape ?? 'auto';
  const moving = data.type === 'dynamic';
  const fixedTurn = { x: turn.x, y: turn.y, z: turn.z, w: turn.w };
  // box, sphere and cylinder follow the instance's own axes
  const inOwnAxes = () => {
    const box = localBox(all.points, node.world.clone().invert());
    const half = box.getSize(new THREE.Vector3()).multiply(scale).multiplyScalar(0.5);
    half.set(Math.max(Math.abs(half.x), 0.005), Math.max(Math.abs(half.y), 0.005), Math.max(Math.abs(half.z), 0.005));
    const centre = box.getCenter(new THREE.Vector3()).applyMatrix4(node.world).sub(start);
    return { half, centre };
  };
  if (shape === 'box' || shape === 'sphere' || shape === 'cylinder') {
    const { half, centre } = inOwnAxes();
    if (shape === 'sphere') {
      return [rapier.ColliderDesc.ball(Math.max(half.x, half.y, half.z)).setTranslation(centre.x, centre.y, centre.z)];
    }
    if (shape === 'cylinder') {
      // Rapier's cylinder stands along y – turned onto the instance's z
      const upright = turn.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
      return [
        rapier.ColliderDesc.cylinder(half.z, Math.max(half.x, half.y))
          .setTranslation(centre.x, centre.y, centre.z)
          .setRotation({ x: upright.x, y: upright.y, z: upright.z, w: upright.w }),
      ];
    }
    return [rapier.ColliderDesc.cuboid(half.x, half.y, half.z).setTranslation(centre.x, centre.y, centre.z).setRotation(fixedTurn)];
  }
  // static and kinematic bodies keep their exact surface; a dynamic body is made of convex hulls
  if (!moving && (shape === 'auto' || shape === 'mesh')) {
    const mesh = trimesh(rapier, all, start);
    return mesh ? [mesh] : [];
  }
  const parts = shape === 'hull' ? [all] : node.parts;
  return parts.flatMap((part) => {
    const hull = rapier.ColliderDesc.convexHull(relativePoints(part.points, start));
    if (hull) {
      return [hull];
    }
    // flat: a thin box around it
    const box = new THREE.Box3().setFromArray(part.points);
    const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
    const centre = box.getCenter(new THREE.Vector3()).sub(start);
    return [
      rapier.ColliderDesc.cuboid(Math.max(half.x, 0.005), Math.max(half.y, 0.005), Math.max(half.z, 0.005)).setTranslation(
        centre.x,
        centre.y,
        centre.z,
      ),
    ];
  });
};

/** the body a joint holds on to: the parent body, another instance's body, or the world (null) */
const jointPartner = (state: Simulation, owner: SimBody, joint: JointData): SimBody | null | undefined => {
  const to = joint.to ?? 'parent';
  if (to === 'world') {
    return null;
  }
  if (to === 'parent') {
    return owner.node.parent ? state.byInstance.get(owner.node.parent.instance.id) : null;
  }
  return state.byInstance.get(to);
};

/** where a body is now: its matrix in model coordinates with the instance's own turn and scale */
const shownMatrix = (body: SimBody) => {
  const rotation = body.rb.rotation();
  const turn = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).multiply(body.turn);
  return new THREE.Matrix4().compose(vec(body.rb.translation()), turn, body.scale);
};

/** a point of a body (body coordinates) in model coordinates now */
export const bodyPoint = (body: SimBody, point: Vector) => {
  const rotation = body.rb.rotation();
  return point
    .clone()
    .applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w))
    .add(vec(body.rb.translation()));
};

/** a joint's anchors in model coordinates now: on the owner, on the other body (or the world) */
export const jointEnds = (joint: SimJoint) => [
  bodyPoint(joint.owner, joint.anchorOwner),
  joint.other ? bodyPoint(joint.other, joint.anchorOther) : joint.anchorOther.clone(),
];

/** a hinge's angle (degrees) or a slider's way (metres) from where it started */
export const jointValue = (joint: SimJoint) => {
  const turnOf = (body: SimBody | null) => {
    if (!body) {
      return new THREE.Quaternion();
    }
    const rotation = body.rb.rotation();
    return new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  };
  const otherTurn = turnOf(joint.other);
  if (joint.data.kind === 'hinge') {
    // the twist of the owner against the other body around the axis
    const relative = otherTurn.clone().invert().multiply(turnOf(joint.owner));
    const twist = relative.x * joint.axis.x + relative.y * joint.axis.y + relative.z * joint.axis.z;
    let angle = (2 * Math.atan2(twist, relative.w)) / DEG;
    angle = ((((angle + 180) % 360) + 360) % 360) - 180;
    return angle;
  }
  if (joint.data.kind === 'slider') {
    const [onOwner, onOther] = jointEnds(joint);
    return onOwner.sub(onOther).dot(joint.axis.clone().applyQuaternion(otherTurn));
  }
  return 0;
};

/** a program's value at a time: straight between its points, eased, repeated */
const programValue = (program: [number, number][], time: number) => {
  const points = [...program].sort((a, b) => a[0] - b[0]);
  const length = points[points.length - 1][0];
  if (points.length === 1 || length <= 0) {
    return points[0][1];
  }
  const at = time % length;
  for (let index = 1; index < points.length; index++) {
    const [endTime, endValue] = points[index];
    if (at <= endTime) {
      const [startTime, startValue] = points[index - 1];
      const share = endTime > startTime ? (at - startTime) / (endTime - startTime) : 1;
      const eased = share * share * (3 - 2 * share);
      return startValue + (endValue - startValue) * eased;
    }
  }
  return points[points.length - 1][1];
};

// ------------------------------------------------------------ building

const buildBody = (state: Simulation, node: BodyNode) => {
  const { rapier, world } = state;
  const data = node.data;
  const start = new THREE.Vector3(),
    turn = new THREE.Quaternion(),
    scale = new THREE.Vector3();
  node.world.decompose(start, turn, scale);
  const desc =
    data.type === 'dynamic'
      ? rapier.RigidBodyDesc.dynamic()
      : data.type === 'kinematic'
        ? rapier.RigidBodyDesc.kinematicPositionBased()
        : rapier.RigidBodyDesc.fixed();
  desc.setTranslation(start.x, start.y, start.z);
  if (data.type === 'dynamic') {
    const velocity = fromArray(data.velocity);
    const spin = fromArray(data.spin).multiplyScalar(DEG);
    desc.setLinvel(velocity.x, velocity.y, velocity.z).setAngvel(rapierVec(spin)).setCcdEnabled(true).setAngularDamping(0.05);
  }
  const rb = world.createRigidBody(desc);
  const surface = surfaceOf(data);
  const colliders = colliderShapes(rapier, node, start, turn, scale).map((shape) =>
    world.createCollider(shape.setDensity(surface.density).setFriction(surface.friction).setRestitution(surface.bounce), rb),
  );
  const volume = colliders.reduce((sum, collider) => sum + collider.volume(), 0);
  if (data.type === 'dynamic' && data.mass && volume > 0) {
    for (const collider of colliders) {
      collider.setDensity(data.mass / volume);
    }
  }
  // the box around it (body coordinates) – for water, air and drawing
  const box = new THREE.Box3();
  for (const part of node.parts) {
    for (let index = 0; index < part.points.length; index += 3) {
      box.expandByPoint(
        new THREE.Vector3(part.points[index] - start.x, part.points[index + 1] - start.y, part.points[index + 2] - start.z),
      );
    }
  }
  const size = box.getSize(new THREE.Vector3());
  // air drag from the size: ½ · air density · drag coefficient 1 · the area it shows (mean of its sides)
  const area = (size.x * size.y + size.y * size.z + size.x * size.z) / 3;
  const body: SimBody = {
    node,
    rb,
    colliders,
    start,
    turn,
    scale,
    shown: node.world.clone(),
    placed: false,
    volume,
    box,
    autoDrag: 0.6 * area,
    trail: [],
  };
  state.bodies.push(body);
  state.byInstance.set(node.instance.id, body);
  return body;
};

const buildJoint = (state: Simulation, owner: SimBody, data: JointData, index: number) => {
  const { rapier, world } = state;
  const other = jointPartner(state, owner, data);
  if (other === undefined || other === owner) {
    return;
  }
  const at = fromArray(data.at).applyMatrix4(owner.node.world);
  const otherAt =
    data.kind === 'rope' || data.kind === 'spring'
      ? data.toAt
        ? other
          ? fromArray(data.toAt).applyMatrix4(other.node.world)
          : fromArray(data.toAt)
        : (other?.start.clone() ?? at.clone().add(new THREE.Vector3(0, 0, 1)))
      : at.clone();
  const anchorOwner = at.clone().sub(owner.start);
  const anchorOther = other ? otherAt.clone().sub(other.start) : otherAt.clone();
  const axis = fromArray(data.axis ?? [0, 0, 1])
    .transformDirection(owner.node.world)
    .normalize();
  let params;
  switch (data.kind) {
    case 'hinge':
      params = rapier.JointData.revolute(rapierVec(anchorOther), rapierVec(anchorOwner), rapierVec(axis));
      break;
    case 'slider':
      params = rapier.JointData.prismatic(rapierVec(anchorOther), rapierVec(anchorOwner), rapierVec(axis));
      break;
    case 'ball':
      params = rapier.JointData.spherical(rapierVec(anchorOther), rapierVec(anchorOwner));
      break;
    case 'fixed':
      params = rapier.JointData.fixed(rapierVec(anchorOther), { x: 0, y: 0, z: 0, w: 1 }, rapierVec(anchorOwner), {
        x: 0,
        y: 0,
        z: 0,
        w: 1,
      });
      break;
    case 'rope':
      params = rapier.JointData.rope(data.length ?? at.distanceTo(otherAt), rapierVec(anchorOther), rapierVec(anchorOwner));
      break;
    case 'spring':
      params = rapier.JointData.spring(
        data.length ?? at.distanceTo(otherAt),
        data.stiffness ?? 200,
        data.damping ?? 5,
        rapierVec(anchorOther),
        rapierVec(anchorOwner),
      );
      break;
  }
  if ((data.kind === 'hinge' || data.kind === 'slider') && (data.min !== undefined || data.max !== undefined)) {
    const unit = data.kind === 'hinge' ? DEG : 1;
    params.limitsEnabled = true;
    params.limits = [(data.min ?? -1e6) * unit, (data.max ?? 1e6) * unit];
  }
  const joint = world.createImpulseJoint(params, other?.rb ?? state.fixed, owner.rb, true);
  joint.setContactsEnabled(false);
  const simJoint: SimJoint = {
    data,
    owner,
    other,
    joint,
    anchorOwner,
    anchorOther,
    axis,
    key: `${owner.node.instance.id}:${index}`,
    target: null,
  };
  state.joints.push(simJoint);
};

/** gives the motors their targets: the panel's live value, else the program's at this time, else the motor's own */
const driveMotors = (state: Simulation) => {
  const drive = usePhysicsState().drive;
  for (const joint of state.joints) {
    const { motor, program, kind } = joint.data;
    if ((kind !== 'hinge' && kind !== 'slider') || (!motor && !program?.length && !(joint.key in drive))) {
      continue;
    }
    const unit = kind === 'hinge' ? DEG : 1;
    const mode = joint.key in drive || program?.length ? 'position' : (motor?.mode ?? 'position');
    const value = joint.key in drive ? drive[joint.key] : program?.length ? programValue(program, state.time) : (motor?.value ?? 0);
    if (value === joint.target) {
      continue;
    }
    joint.target = value;
    const strength = Math.max(0.01, motor?.strength ?? 1);
    const unitJoint = joint.joint as UnitImpulseJoint;
    unitJoint.configureMotorModel(state.rapier.MotorModel.AccelerationBased);
    if (mode === 'speed') {
      unitJoint.configureMotorVelocity(value * unit, 20 * strength);
    } else {
      const stiffness = 600 * strength;
      unitJoint.configureMotorPosition(value * unit, stiffness, 2 * Math.sqrt(stiffness));
    }
    joint.owner.rb.wakeUp();
  }
};

/** kinematic bodies: where they are at a time – moving and turning on and on, or back and forth */
const moveKinematic = (body: SimBody, time: number) => {
  const data = body.node.data;
  const period = data.period ?? 0;
  // back and forth: the time it has gone forwards, as a triangle wave
  let along = time;
  if (period > 0) {
    const half = period / 2;
    const phase = time % period;
    along = phase < half ? phase : period - phase;
  }
  const velocity = fromArray(data.velocity);
  const spin = fromArray(data.spin).multiplyScalar(DEG);
  const position = body.start.clone().addScaledVector(velocity, along);
  const angle = spin.length() * along;
  const rotation = angle > 0 ? new THREE.Quaternion().setFromAxisAngle(spin.clone().normalize(), angle) : new THREE.Quaternion();
  body.rb.setNextKinematicTranslation(rapierVec(position));
  body.rb.setNextKinematicRotation({ x: rotation.x, y: rotation.y, z: rotation.z, w: rotation.w });
};

/**
 * The air of a tunnel that blows at a body – null outside every tunnel. A body is solid in the tunnel's grid, so the
 * air is taken just upstream of it (its reach and a cell against the wind).
 */
const airInTunnel = (state: Simulation, point: Vector, reach: number) => {
  for (const tunnel of state.tunnels) {
    if (!tunnel.box.containsPoint(point)) {
      continue;
    }
    const upstream = point.clone().addScaledVector(tunnel.wind.clone().normalize(), -(reach + tunnel.cell));
    return flowAt(tunnel, upstream.clamp(tunnel.box.min, tunnel.box.max));
  }
  return null;
};

/** constant forces, thrust, lift, air and water on a dynamic body */
const pushBody = (state: Simulation, body: SimBody) => {
  const { rb, node } = body;
  const data = node.data;
  rb.resetForces(false);
  rb.resetTorques(false);
  const rotation = rb.rotation();
  const turnNow = new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w);
  const ownAxes = turnNow.clone().multiply(body.turn);
  const centre = vec(rb.worldCom());
  const velocity = vec(rb.linvel());
  const force = fromArray(data.force);
  if (data.thrust) {
    force.add(fromArray(data.thrust).applyQuaternion(ownAxes));
  }
  const tunnelAir = airInTunnel(state, centre, body.box.getSize(new THREE.Vector3()).length() / 2);
  const air = tunnelAir ?? fromArray(state.settings.wind);
  const throughAir = velocity.clone().sub(air);
  const drag = data.drag ?? (state.settings.air || tunnelAir ? body.autoDrag : 0);
  if (data.lift) {
    // a wing: lift upwards (its own z) from the speed along its own x
    const forward = new THREE.Vector3(1, 0, 0).applyQuaternion(ownAxes);
    const up = new THREE.Vector3(0, 0, 1).applyQuaternion(ownAxes);
    const speed = Math.max(0, throughAir.dot(forward));
    force.addScaledVector(up, data.lift * speed * speed);
  }
  if (drag > 0) {
    force.addScaledVector(throughAir, -drag * throughAir.length());
  }
  if (force.lengthSq() > 0) {
    rb.addForce(rapierVec(force), true);
  }
  floatBody(state, body, turnNow);
};

/**
 * Water: buoyancy and drag where the body is under the surface – its box in 27 cells, each pushed up at its middle by
 * the share of it under water (so the push grows smoothly as it sinks, and a tilted body is turned upright again).
 */
const floatBody = (state: Simulation, body: SimBody, turnNow: Quaternion) => {
  if (!state.waters.length || body.volume <= 0) {
    return;
  }
  const { rb, box } = body;
  const mass = rb.mass();
  const position = vec(rb.translation());
  const share = body.volume / 27;
  const point = new THREE.Vector3();
  // how high one cell reaches along z, turned as the body is now
  const size = box.getSize(new THREE.Vector3());
  const axes = new THREE.Matrix4().makeRotationFromQuaternion(turnNow).elements;
  const height = Math.max(1e-3, (Math.abs(axes[2]) * size.x + Math.abs(axes[6]) * size.y + Math.abs(axes[10]) * size.z) / 3);
  for (let ix = 0; ix < 3; ix++) {
    for (let iy = 0; iy < 3; iy++) {
      for (let iz = 0; iz < 3; iz++) {
        point
          .set(
            box.min.x + ((ix + 0.5) / 3) * (box.max.x - box.min.x),
            box.min.y + ((iy + 0.5) / 3) * (box.max.y - box.min.y),
            box.min.z + ((iz + 0.5) / 3) * (box.max.z - box.min.z),
          )
          .applyQuaternion(turnNow)
          .add(position);
        const water = state.waters.find(
          (candidate) =>
            point.x >= candidate.box.min.x &&
            point.x <= candidate.box.max.x &&
            point.y >= candidate.box.min.y &&
            point.y <= candidate.box.max.y &&
            point.z + height / 2 > candidate.box.min.z &&
            point.z - height / 2 < candidate.box.max.z,
        );
        if (!water) {
          continue;
        }
        const under = Math.min(1, Math.max(0, (water.box.max.z - (point.z - height / 2)) / height));
        const pointVelocity = vec(rb.velocityAtPoint(rapierVec(point)));
        const force = new THREE.Vector3(0, 0, water.density * state.settings.gravity * share * under);
        force.addScaledVector(pointVelocity.sub(water.current), ((-2 * mass) / 27) * under);
        rb.addForceAtPoint(rapierVec(force), rapierVec(point), true);
      }
    }
  }
};

/** the pull tool: a spring from the grabbed point to the pointer */
const pullBody = (state: Simulation) => {
  const grab = state.grab;
  if (!grab) {
    return;
  }
  const { rb } = grab.body;
  const point = bodyPoint(grab.body, grab.point);
  const velocity = vec(rb.velocityAtPoint(rapierVec(point)));
  const mass = rb.mass();
  const force = grab.target
    .clone()
    .sub(point)
    .multiplyScalar(80 * mass)
    .addScaledVector(velocity, -10 * mass);
  const limit = 400 * mass;
  if (force.length() > limit) {
    force.setLength(limit);
  }
  rb.addForceAtPoint(rapierVec(force), rapierVec(point), true);
};

const build = (rapier: Rapier): Simulation => {
  const settings = settingsOf();
  const scene = collectScene();
  const world = new rapier.World({ x: 0, y: 0, z: -settings.gravity });
  world.timestep = STEP;
  world.numSolverIterations = 8;
  const fixed = world.createRigidBody(rapier.RigidBodyDesc.fixed());
  const mesh = trimesh(rapier, scene.world, new THREE.Vector3());
  if (mesh) {
    world.createCollider(mesh.setFriction(0.6).setRestitution(0.2), fixed);
  }
  if (settings.ground) {
    world.createCollider(rapier.ColliderDesc.cuboid(1000, 1000, 1).setTranslation(0, 0, -1).setFriction(0.7).setRestitution(0.2), fixed);
  }
  const state: Simulation = {
    rapier,
    world,
    settings,
    bodies: [],
    joints: [],
    waters: [],
    liquids: [],
    tunnels: [],
    fixed,
    worldPart: scene.world,
    hidden: new Map(),
    byInstance: new Map(),
    grab: null,
    time: 0,
    frame: 0,
    last: performance.now(),
    fingerprint: 0,
  };
  for (const node of scene.bodies) {
    buildBody(state, node);
  }
  for (const body of state.bodies) {
    (body.node.data.joints ?? []).forEach((joint, index) => buildJoint(state, body, joint, index));
  }
  for (const node of scene.regions) {
    const box = node.instance.definition.entities.bounds(new THREE.Box3(), node.world);
    if (node.data.type === 'water') {
      state.waters.push({ node, box, density: node.data.density ?? 1000, current: fromArray(node.data.velocity) });
    } else if (node.data.type === 'liquid') {
      state.liquids.push(createLiquid(state, node, box));
      state.hidden.set(node.instance, node.instance.hidden);
    } else if (node.data.type === 'tunnel') {
      state.tunnels.push(createTunnel(state, node, box));
      state.hidden.set(node.instance, node.instance.hidden);
    }
  }
  // the drops and the smoke take the place of the groups that mark them
  if (state.hidden.size) {
    for (const instance of state.hidden.keys()) {
      instance.hidden = true;
    }
    pluginContext().editor.invalidate();
  }
  state.fingerprint = modelFingerprint();
  return state;
};

// ------------------------------------------------------------ stepping and showing

const stepOnce = (state: Simulation) => {
  driveMotors(state);
  for (const body of state.bodies) {
    if (body.node.data.type === 'kinematic') {
      moveKinematic(body, state.time + STEP);
    } else if (body.node.data.type === 'dynamic') {
      pushBody(state, body);
    }
  }
  pullBody(state);
  for (const tunnel of state.tunnels) {
    stepTunnel(state, tunnel, STEP);
  }
  for (const liquid of state.liquids) {
    stepLiquid(state, liquid, STEP);
  }
  state.world.step();
  state.time += STEP;
  if (Math.floor(state.time / TRAIL_STEP) !== Math.floor((state.time - STEP) / TRAIL_STEP)) {
    for (const body of state.bodies) {
      if (body.node.data.type === 'dynamic') {
        body.trail.push(vec(body.rb.worldCom()));
        if (body.trail.length > TRAIL_POINTS) {
          body.trail.shift();
        }
      }
    }
  }
};

/** moves the simulation on by `seconds` (at most what a frame may take) */
export const advance = (state: Simulation, seconds: number) => {
  const steps = Math.round(seconds / STEP);
  for (let index = 0; index < steps; index++) {
    stepOnce(state);
  }
};

/** shows the bodies where they are now: each instance's matrix in the coordinates it lies in */
const showBodies = (state: Simulation) => {
  const context = pluginContext();
  // each body's place in the coordinates it lies in (16 numbers, NaN when it stays where the model has it) – for the timeline
  const places = new Float32Array(state.bodies.length * 16).fill(Number.NaN);
  state.bodies.forEach((body, index) => {
    if (body.node.data.type !== 'static') {
      body.shown = shownMatrix(body);
    }
    const parent = body.node.parent ? state.byInstance.get(body.node.parent.instance.id) : undefined;
    // a static body shows where the model has it – unless the body it lies in moves
    if (body.node.data.type === 'static' && !parent?.placed) {
      return;
    }
    const frame = parent ? parent.shown.clone().multiply(body.node.between) : body.node.between.clone();
    const place = frame.invert().multiply(body.shown);
    context.display.place(body.node.instance, place);
    places.set(place.elements, index * 16);
    body.placed = true;
  });
  record(state, places);
  const status = usePhysicsState();
  status.time = state.time;
  status.scrub = null;
  status.counts = {
    bodies: state.bodies.length,
    joints: state.joints.length,
    particles: state.liquids.reduce((sum, liquid) => sum + liquid.count, 0),
  };
  context.editor.redraw();
};

const loop = (now: number) => {
  const state = sim;
  if (!state || usePhysicsState().status !== 'running') {
    return;
  }
  const elapsed = Math.min(0.1, (now - state.last) / 1000) * Math.max(0.05, state.settings.speed);
  state.last = now;
  const steps = Math.min(MAX_STEPS_PER_FRAME, Math.round(elapsed / STEP) || 1);
  for (let index = 0; index < steps; index++) {
    stepOnce(state);
  }
  showBodies(state);
  state.frame = requestAnimationFrame(loop);
};

// ------------------------------------------------------------ the timeline

/**
 * What the simulation showed, 30 times a second for up to two minutes: every body's place, its centre (for trails)
 * and the drops of the liquids. Dragging the timeline shows a moment again without simulating; going on from an
 * earlier moment simulates up to it again from the start (Rapier gives the same result each time – only pulling
 * with the tool and driving joints by hand are not repeated).
 */
interface TimelineFrame {
  time: number;
  places: Float32Array;
  centres: Float32Array;
  drops: Float32Array[];
}

const FRAME_STEP = 1 / 30;
const TIMELINE_SECONDS = 120;
/** liquids fill memory fast: recording stops here, the simulation goes on */
const TIMELINE_BYTES = 256 * 1024 * 1024;
let timeline: TimelineFrame[] = [];
const frameBytes = (frame: TimelineFrame) =>
  frame.places.byteLength + frame.centres.byteLength + frame.drops.reduce((sum, drops) => sum + drops.byteLength, 0);
let timelineBytes = 0;

const record = (state: Simulation, places: Float32Array) => {
  const last = timeline[timeline.length - 1];
  if ((last && state.time < last.time + FRAME_STEP * 0.9) || state.time > TIMELINE_SECONDS || timelineBytes > TIMELINE_BYTES) {
    return;
  }
  const centres = new Float32Array(state.bodies.length * 3);
  state.bodies.forEach((body, index) => centres.set(new THREE.Vector3().setFromMatrixPosition(body.shown).toArray(), index * 3));
  const frame = { time: state.time, places, centres, drops: state.liquids.map((liquid) => liquid.positions.slice()) };
  timeline.push(frame);
  timelineBytes += frameBytes(frame);
  usePhysicsState().recorded = state.time;
};

/** the frame at a time (the last one at or before it) */
const frameAt = (time: number) => {
  let found = timeline[0];
  for (const frame of timeline) {
    if (frame.time > time + 1e-6) {
      break;
    }
    found = frame;
  }
  return found;
};

/** shows a moment of the timeline again (it pauses the simulation; the bodies are not moved) */
export const scrubTo = (time: number) => {
  const state = sim;
  const frame = state && frameAt(time);
  if (!state || !frame) {
    return;
  }
  pauseSim();
  const context = pluginContext();
  state.bodies.forEach((body, index) => {
    const place = frame.places.subarray(index * 16, index * 16 + 16);
    if (!Number.isNaN(place[0])) {
      context.display.place(body.node.instance, new THREE.Matrix4().fromArray(place));
    }
  });
  state.liquids.forEach((liquid, index) => frame.drops[index] && liquid.positions.set(frame.drops[index]));
  const status = usePhysicsState();
  status.scrub = frame.time;
  status.time = frame.time;
  context.editor.redraw();
};

/** where a body was up to the shown moment – its trail while the timeline is dragged */
export const timelineTrail = (bodyIndex: number, until: number) => {
  const points: Vector[] = [];
  for (const frame of timeline) {
    if (frame.time > until + 1e-6) {
      break;
    }
    points.push(new THREE.Vector3().fromArray(frame.centres, bodyIndex * 3));
  }
  // every other frame of the last four seconds – as long as the live trails
  return points.slice(-120).filter((_, index, all) => (all.length - index) % 2 === 1);
};

/**
 * Leaves the shown moment so the simulation can go on from there: at the end of the timeline it simply goes on,
 * from an earlier moment it simulates up to it again (the timeline after it is dropped).
 */
const leaveScrub = async () => {
  const status = usePhysicsState();
  const at = status.scrub;
  status.scrub = null;
  if (at === null || !sim || at >= status.recorded - FRAME_STEP) {
    return;
  }
  timeline = timeline.filter((frame) => frame.time <= at + 1e-6);
  timelineBytes = timeline.reduce((sum, frame) => sum + frameBytes(frame), 0);
  resetSim({ keepTimeline: true });
  status.status = 'loading';
  // let the panel show it is working – going far back can take a moment
  await new Promise((resolve) => setTimeout(resolve, 30));
  status.status = 'stopped';
  await startSim({ at, pause: true });
};

// ------------------------------------------------------------ start, pause, reset

/** simulates many seconds at once without stopping the app: a slice of a frame's length, then the app's turn */
const advanceInSlices = async (state: Simulation, seconds: number) => {
  usePhysicsState().status = 'loading';
  let left = seconds;
  while (left > 0 && sim === state) {
    const started = performance.now();
    while (left > 0 && performance.now() - started < 12) {
      const slice = Math.min(left, STEP);
      advance(state, slice);
      left -= slice;
    }
    await new Promise((resolve) => setTimeout(resolve));
  }
};

/**
 * Starts the simulation (or goes on after a pause). `at`: seconds simulated at once before it is shown – e.g. to
 * show a moment of it; `pause`: stays paused there.
 */
export const startSim = async (options: { at?: number; pause?: boolean } = {}) => {
  const status = usePhysicsState();
  if (status.status === 'loading') {
    return;
  }
  await leaveScrub();
  if (!sim) {
    status.status = 'loading';
    status.error = '';
    try {
      const rapier = await loadRapier();
      sim = build(rapier);
      // it would run with nothing to see: say what is missing
      if (!sim.bodies.some((body) => body.rb.isDynamic())) {
        pluginContext().ui.toast(t('physics.panel.nothingFalls'));
      }
    } catch (error) {
      status.status = 'stopped';
      status.error = t('physics.errors.load', { error: String((error as Error)?.message ?? error) });
      pluginContext().ui.toast(status.error);
      return;
    }
  }
  if (options.at && options.at > sim.time) {
    const running = sim;
    await advanceInSlices(running, options.at - running.time);
    // reset meanwhile
    if (sim !== running) {
      return;
    }
  }
  showBodies(sim);
  sim.last = performance.now();
  status.status = options.pause ? 'paused' : 'running';
  if (!options.pause) {
    learn('started');
    sim.frame = requestAnimationFrame(loop);
  }
};

export const pauseSim = () => {
  const status = usePhysicsState();
  if (status.status === 'running' && sim) {
    cancelAnimationFrame(sim.frame);
    status.status = 'paused';
  }
};

/** a tenth of a second further – it pauses first when it runs, so each step can be watched */
export const stepSim = async () => {
  pauseSim();
  await leaveScrub();
  if (!sim) {
    await startSim({ pause: true });
  }
  if (sim) {
    advance(sim, 0.1);
    showBodies(sim);
    learn('stepped');
  }
};

/** back to the start: the bodies show where the model has them */
export const resetSim = (options: { keepTimeline?: boolean } = {}) => {
  const state = sim;
  const status = usePhysicsState();
  if (!options.keepTimeline) {
    timeline = [];
    timelineBytes = 0;
    Object.assign(status, { recorded: 0, scrub: null });
  }
  if (!state) {
    status.status = 'stopped';
    return;
  }
  sim = null;
  cancelAnimationFrame(state.frame);
  const context = pluginContext();
  for (const body of state.bodies) {
    if (body.placed) {
      context.display.place(body.node.instance, null);
    }
  }
  for (const [instance, hidden] of state.hidden) {
    instance.hidden = hidden;
  }
  state.world.free();
  Object.assign(status, { status: 'stopped', time: 0, counts: { bodies: 0, joints: 0, particles: 0 }, drive: {} });
  context.editor.invalidate();
  context.editor.redraw();
};

/** the bodies' places now are written into the model (one undo step), and the simulation starts over from there */
export const keepPositions = () => {
  const state = sim;
  if (!state) {
    return;
  }
  // the moment shown: the timeline's while it is dragged, else the simulation's now
  const scrub = usePhysicsState().scrub;
  const shown = scrub !== null ? frameAt(scrub) : null;
  const frames = new Map<SimBody, Matrix>();
  state.bodies.forEach((body, index) => {
    if (!body.placed || body.node.data.type === 'static') {
      return;
    }
    if (shown) {
      const place = shown.places.subarray(index * 16, index * 16 + 16);
      if (!Number.isNaN(place[0])) {
        frames.set(body, new THREE.Matrix4().fromArray(place));
      }
      return;
    }
    const parent = body.node.parent ? state.byInstance.get(body.node.parent.instance.id) : undefined;
    const frame = parent ? parent.shown.clone().multiply(body.node.between) : body.node.between.clone();
    frames.set(body, frame.invert().multiply(body.shown));
  });
  resetSim();
  learn('kept');
  pluginContext().editor.commit('physics.undo.keep', () => {
    for (const [body, matrix] of frames) {
      body.node.instance.matrix.copy(matrix);
    }
  });
};

/** while it runs: changed settings (gravity, wind, speed, air) take effect at once */
export const applySettings = (settings: PhysicsSettings) => {
  if (!sim) {
    return;
  }
  sim.settings = settings;
  sim.world.gravity = { x: 0, y: 0, z: -settings.gravity };
  for (const body of sim.bodies) {
    body.rb.wakeUp();
  }
};

/** the body of an instance in the running simulation */
export const simBodyOf = (instanceId: number) => sim?.byInstance.get(instanceId) ?? null;

/** the dynamic body hit by a ray (model coordinates), with the point */
export const bodyOnRay = (origin: Vector, direction: Vector) => {
  const state = sim;
  if (!state) {
    return null;
  }
  const ray = new state.rapier.Ray(rapierVec(origin), rapierVec(direction));
  const hit = state.world.castRay(ray, 1000, true, undefined, undefined, undefined, undefined, (collider) => {
    const parent = collider.parent();
    return !!parent && parent.isDynamic();
  });
  if (!hit) {
    return null;
  }
  const parent = hit.collider.parent();
  const body = state.bodies.find((candidate) => candidate.rb === parent);
  return body ? { body, point: origin.clone().addScaledVector(direction, hit.timeOfImpact) } : null;
};

/** grabs a body at a point (model coordinates) for the pull tool */
export const grab = (body: SimBody, point: Vector) => {
  if (!sim) {
    return;
  }
  const rotation = body.rb.rotation();
  const local = point
    .clone()
    .sub(vec(body.rb.translation()))
    .applyQuaternion(new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w).invert());
  sim.grab = { body, point: local, target: point.clone() };
  learn('pulled');
};

export const moveGrab = (target: Vector) => {
  if (sim?.grab) {
    sim.grab.target.copy(target);
  }
};

export const release = () => {
  if (sim) {
    sim.grab = null;
  }
};

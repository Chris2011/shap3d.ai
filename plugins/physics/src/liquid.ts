import type { RigidBody } from '@dimforge/rapier3d-compat';
import type { BodyNode } from './scene';
import type { Simulation } from './sim';
import { THREE } from './runtime';

/**
 * A liquid: the volume of a group marked as liquid is filled with drops at the start. Each drop is a small ball in
 * the Rapier world without friction – so it flows around and over everything and pushes bodies – and the drops near
 * each other share their speed a little each step (viscosity), so it moves as one: water splashes, honey creeps.
 */

type Box = InstanceType<typeof THREE.Box3>;

export interface Liquid {
  node: BodyNode;
  drops: RigidBody[];
  radius: number;
  viscosity: number;
  count: number;
  /** drop positions (x, y, z …) and speeds after the last step – for the drawing */
  positions: Float32Array;
  speeds: Float32Array;
}

/** at most this many drops per liquid – more makes the view slow */
const MAX_DROPS = 1500;

export const createLiquid = (state: Simulation, node: BodyNode, box: Box): Liquid => {
  const { rapier, world } = state;
  const size = box.getSize(new THREE.Vector3());
  const volume = Math.max(1e-6, size.x * size.y * size.z);
  const spacing = Math.max(node.data.spacing ?? 0, Math.cbrt(volume / MAX_DROPS), 0.02);
  const radius = spacing / 2;
  const density = node.data.density ?? 1000;
  const drops: RigidBody[] = [];
  for (let x = box.min.x + radius; x <= box.max.x - radius + 1e-9; x += spacing) {
    for (let y = box.min.y + radius; y <= box.max.y - radius + 1e-9; y += spacing) {
      for (let z = box.min.z + radius; z <= box.max.z - radius + 1e-9; z += spacing) {
        // a little jitter, so the drops do not stand in perfect columns
        const jitter = () => (Math.random() - 0.5) * radius * 0.1;
        const body = world.createRigidBody(
          rapier.RigidBodyDesc.dynamic()
            .setTranslation(x + jitter(), y + jitter(), z)
            .lockRotations()
            .setLinearDamping(0.05),
        );
        // no friction, also against what has some (the smaller of the two counts)
        world.createCollider(
          rapier.ColliderDesc.ball(radius * 0.95)
            .setFriction(0)
            .setFrictionCombineRule(rapier.CoefficientCombineRule.Min)
            .setRestitution(0)
            .setDensity(density),
          body,
        );
        drops.push(body);
      }
    }
  }
  return {
    node,
    drops,
    radius,
    viscosity: Math.min(1, Math.max(0, node.data.viscosity ?? 0.1)),
    count: drops.length,
    positions: new Float32Array(drops.length * 3),
    speeds: new Float32Array(drops.length),
  };
};

/** viscosity: drops close to each other move towards their common speed (a grid of cells finds the neighbours) */
export const stepLiquid = (_state: Simulation, liquid: Liquid, step: number) => {
  const { drops, radius, positions, speeds } = liquid;
  const cell = radius * 3;
  const grid = new Map<string, number[]>();
  const velocities = new Float32Array(drops.length * 3);
  drops.forEach((drop, index) => {
    const position = drop.translation();
    const velocity = drop.linvel();
    positions.set([position.x, position.y, position.z], index * 3);
    velocities.set([velocity.x, velocity.y, velocity.z], index * 3);
    speeds[index] = Math.hypot(velocity.x, velocity.y, velocity.z);
    const name = `${Math.floor(position.x / cell)},${Math.floor(position.y / cell)},${Math.floor(position.z / cell)}`;
    const list = grid.get(name);
    if (list) {
      list.push(index);
    } else {
      grid.set(name, [index]);
    }
  });
  if (liquid.viscosity <= 0) {
    return;
  }
  // even thin water shares a little, honey a lot – per second, so the step size does not matter
  const share = 1 - Math.exp(-(0.3 + liquid.viscosity * 25) * step);
  const reach = cell * cell;
  drops.forEach((drop, index) => {
    const x = positions[index * 3],
      y = positions[index * 3 + 1],
      z = positions[index * 3 + 2];
    const cx = Math.floor(x / cell),
      cy = Math.floor(y / cell),
      cz = Math.floor(z / cell);
    let sumX = 0,
      sumY = 0,
      sumZ = 0,
      weights = 0;
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dz = -1; dz <= 1; dz++) {
          for (const other of grid.get(`${cx + dx},${cy + dy},${cz + dz}`) ?? []) {
            if (other === index) {
              continue;
            }
            const distanceSq = (positions[other * 3] - x) ** 2 + (positions[other * 3 + 1] - y) ** 2 + (positions[other * 3 + 2] - z) ** 2;
            if (distanceSq >= reach) {
              continue;
            }
            const weight = 1 - Math.sqrt(distanceSq / reach);
            sumX += (velocities[other * 3] - velocities[index * 3]) * weight;
            sumY += (velocities[other * 3 + 1] - velocities[index * 3 + 1]) * weight;
            sumZ += (velocities[other * 3 + 2] - velocities[index * 3 + 2]) * weight;
            weights += weight;
          }
        }
      }
    }
    if (weights > 0) {
      const factor = share / Math.max(1, weights);
      drop.setLinvel(
        {
          x: velocities[index * 3] + sumX * factor,
          y: velocities[index * 3 + 1] + sumY * factor,
          z: velocities[index * 3 + 2] + sumZ * factor,
        },
        false,
      );
    }
  });
};

import type { BodyNode, Part } from './scene';
import type { Simulation } from './sim';
import { THREE } from './runtime';

/**
 * A wind tunnel: the box of a group marked as tunnel holds a grid of air cells. The wind blows in through the side
 * it comes from (along its strongest axis) and leaves through the opposite one; the air goes around everything solid
 * in the box – the model's faces and the bodies where they are now. Each step the air is carried along with itself
 * and made free of divergence (stable fluids on a staggered grid: semi-Lagrangian advection, a pressure solve with
 * successive over-relaxation). Smoke lines carried by it show the flow, coloured by speed, and the air pushes the
 * bodies in it with their drag.
 */

type Vector = InstanceType<typeof THREE.Vector3>;
type Box = InstanceType<typeof THREE.Box3>;

/** the air is stepped this often (seconds) – slower than the bodies, it is enough for the view */
const FLOW_STEP = 1 / 40;
const PRESSURE_ITERATIONS = 50;
const OVER_RELAXATION = 1.7;
const LINES = 280;
const TRAIL = 16;

interface Smoke {
  points: Vector[];
  /** the air's speed at each point, for its colour */
  speeds: number[];
  age: number;
}

export interface Tunnel {
  node: BodyNode;
  box: Box;
  /** the wind blowing in (along the axis it comes in by) */
  wind: Vector;
  cell: number;
  nx: number;
  ny: number;
  nz: number;
  /** the air's speed on the faces between cells: u across x faces, v across y faces, w across z faces */
  u: Float32Array;
  v: Float32Array;
  w: Float32Array;
  pressure: Float32Array;
  /** cells the model fills and never leaves (1), and those the bodies fill now as well */
  fixedSolid: Uint8Array;
  solid: Uint8Array;
  /** time not yet stepped */
  pending: number;
  smoke: Smoke[];
  /** the side the wind comes in through: axis 0–2, and whether it is the low (-1) or high (+1) side */
  inflow: { axis: number; side: number };
}

const cellIndex = (tunnel: Tunnel, i: number, j: number, k: number) => i + tunnel.nx * (j + tunnel.ny * k);
const uIndex = (tunnel: Tunnel, i: number, j: number, k: number) => i + (tunnel.nx + 1) * (j + tunnel.ny * k);
const vIndex = (tunnel: Tunnel, i: number, j: number, k: number) => i + tunnel.nx * (j + (tunnel.ny + 1) * k);
const wIndex = (tunnel: Tunnel, i: number, j: number, k: number) => i + tunnel.nx * (j + tunnel.ny * k);

const isSolid = (tunnel: Tunnel, i: number, j: number, k: number) =>
  i >= 0 && j >= 0 && k >= 0 && i < tunnel.nx && j < tunnel.ny && k < tunnel.nz && tunnel.solid[cellIndex(tunnel, i, j, k)] === 1;

// ------------------------------------------------------------ what is solid

/** marks the cells of a part's surface and – where it is closed – of its inside (a vertical line counts crossings) */
const voxelize = (tunnel: Tunnel, part: Part, target: Uint8Array) => {
  const { box, cell, nx, ny, nz } = tunnel;
  const mark = (x: number, y: number, z: number) => {
    const i = Math.floor((x - box.min.x) / cell),
      j = Math.floor((y - box.min.y) / cell),
      k = Math.floor((z - box.min.z) / cell);
    if (i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz) {
      target[cellIndex(tunnel, i, j, k)] = 1;
    }
  };
  const triangles = part.triangles;
  const crossings = new Map<number, number[]>();
  for (let index = 0; index < triangles.length; index += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = triangles.slice(index, index + 9);
    // the surface: points over the triangle closer than half a cell
    const longest = Math.max(
      Math.hypot(bx - ax, by - ay, bz - az),
      Math.hypot(cx - ax, cy - ay, cz - az),
      Math.hypot(cx - bx, cy - by, cz - bz),
    );
    const steps = Math.min(200, Math.ceil(longest / (cell * 0.5)) + 1);
    for (let s = 0; s <= steps; s++) {
      for (let r = 0; r <= steps - s; r++) {
        const fs = s / steps,
          fr = r / steps;
        mark(ax + (bx - ax) * fs + (cx - ax) * fr, ay + (by - ay) * fs + (cy - ay) * fr, az + (bz - az) * fs + (cz - az) * fr);
      }
    }
    // the inside: where the vertical line through each column's centre crosses the triangle
    const area = (bx - ax) * (cy - ay) - (cx - ax) * (by - ay);
    if (Math.abs(area) < 1e-12) {
      continue;
    }
    const minI = Math.max(0, Math.floor((Math.min(ax, bx, cx) - box.min.x) / cell));
    const maxI = Math.min(nx - 1, Math.floor((Math.max(ax, bx, cx) - box.min.x) / cell));
    const minJ = Math.max(0, Math.floor((Math.min(ay, by, cy) - box.min.y) / cell));
    const maxJ = Math.min(ny - 1, Math.floor((Math.max(ay, by, cy) - box.min.y) / cell));
    for (let i = minI; i <= maxI; i++) {
      for (let j = minJ; j <= maxJ; j++) {
        const px = box.min.x + (i + 0.5) * cell,
          py = box.min.y + (j + 0.5) * cell;
        const s = ((px - ax) * (cy - ay) - (cx - ax) * (py - ay)) / area;
        const r = ((bx - ax) * (py - ay) - (px - ax) * (by - ay)) / area;
        if (s < 0 || r < 0 || s + r > 1) {
          continue;
        }
        const column = i + nx * j;
        const list = crossings.get(column) ?? [];
        list.push(az + (bz - az) * s + (cz - az) * r);
        crossings.set(column, list);
      }
    }
  }
  for (const [column, list] of crossings) {
    const i = column % nx,
      j = Math.floor(column / nx);
    list.sort((a, b) => a - b);
    for (let pair = 0; pair + 1 < list.length; pair += 2) {
      for (let k = 0; k < nz; k++) {
        const z = box.min.z + (k + 0.5) * cell;
        if (z >= list[pair] && z <= list[pair + 1]) {
          target[cellIndex(tunnel, i, j, k)] = 1;
        }
      }
    }
  }
};

/** the cells the dynamic and kinematic bodies fill where they are now */
const markBodies = (state: Simulation, tunnel: Tunnel) => {
  tunnel.solid.set(tunnel.fixedSolid);
  const { box, cell, nx, ny, nz } = tunnel;
  const point = { x: 0, y: 0, z: 0 };
  for (const body of state.bodies) {
    if (body.node.data.type === 'static') {
      continue;
    }
    // the cells around the body (its box turned any way fits in a sphere of its diagonal)
    const centre = body.rb.translation();
    const reach = body.box.getSize(new THREE.Vector3()).length() / 2 + body.box.getCenter(new THREE.Vector3()).length();
    const bounds = new THREE.Box3().setFromCenterAndSize(
      new THREE.Vector3(centre.x, centre.y, centre.z),
      new THREE.Vector3(2, 2, 2).multiplyScalar(reach),
    );
    if (!bounds.intersectsBox(box)) {
      continue;
    }
    const from = bounds.min.clone().sub(box.min).divideScalar(cell).floor().max(new THREE.Vector3());
    const to = bounds.max
      .clone()
      .sub(box.min)
      .divideScalar(cell)
      .floor()
      .min(new THREE.Vector3(nx - 1, ny - 1, nz - 1));
    for (let i = from.x; i <= to.x; i++) {
      for (let j = from.y; j <= to.y; j++) {
        for (let k = from.z; k <= to.z; k++) {
          point.x = box.min.x + (i + 0.5) * cell;
          point.y = box.min.y + (j + 0.5) * cell;
          point.z = box.min.z + (k + 0.5) * cell;
          if (body.colliders.some((collider) => collider.containsPoint(point))) {
            tunnel.solid[cellIndex(tunnel, i, j, k)] = 1;
          }
        }
      }
    }
  }
};

// ------------------------------------------------------------ sampling

/** a field on a grid offset by (ox, oy, oz) cells with (sx, sy, sz) samples, at a point given in cells */
const trilinear = (field: Float32Array, sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
  x = Math.min(sx - 1.0001, Math.max(0, x));
  y = Math.min(sy - 1.0001, Math.max(0, y));
  z = Math.min(sz - 1.0001, Math.max(0, z));
  const x0 = Math.floor(x),
    y0 = Math.floor(y),
    z0 = Math.floor(z);
  const fx = x - x0,
    fy = y - y0,
    fz = z - z0;
  const x1 = Math.min(sx - 1, x0 + 1),
    y1 = Math.min(sy - 1, y0 + 1),
    z1 = Math.min(sz - 1, z0 + 1);
  const at = (i: number, j: number, k: number) => field[i + sx * (j + sy * k)];
  const near = (at(x0, y0, z0) * (1 - fx) + at(x1, y0, z0) * fx) * (1 - fy) + (at(x0, y1, z0) * (1 - fx) + at(x1, y1, z0) * fx) * fy;
  const far = (at(x0, y0, z1) * (1 - fx) + at(x1, y0, z1) * fx) * (1 - fy) + (at(x0, y1, z1) * (1 - fx) + at(x1, y1, z1) * fx) * fy;
  return near * (1 - fz) + far * fz;
};

/** the air at a point given in cells (0 … n along each axis) */
const velocityInCells = (tunnel: Tunnel, x: number, y: number, z: number, into: Vector) => {
  const { nx, ny, nz } = tunnel;
  return into.set(
    trilinear(tunnel.u, nx + 1, ny, nz, x, y - 0.5, z - 0.5),
    trilinear(tunnel.v, nx, ny + 1, nz, x - 0.5, y, z - 0.5),
    trilinear(tunnel.w, nx, ny, nz + 1, x - 0.5, y - 0.5, z),
  );
};

// ------------------------------------------------------------ solving

/** the open sides: the wind comes in on one, the others hold their speed across them, the far side lets it out */
const boundaries = (tunnel: Tunnel) => {
  const { nx, ny, nz, u, v, w, wind, inflow } = tunnel;
  const outflow = (axis: number, side: number) => axis === inflow.axis && side === -inflow.side;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (const [i, side, inner] of [
        [0, -1, 1],
        [nx, 1, nx - 1],
      ]) {
        u[uIndex(tunnel, i, j, k)] = outflow(0, side) ? u[uIndex(tunnel, inner, j, k)] : wind.x;
      }
    }
  }
  for (let k = 0; k < nz; k++) {
    for (let i = 0; i < nx; i++) {
      for (const [j, side, inner] of [
        [0, -1, 1],
        [ny, 1, ny - 1],
      ]) {
        v[vIndex(tunnel, i, j, k)] = outflow(1, side) ? v[vIndex(tunnel, i, inner, k)] : wind.y;
      }
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      for (const [k, side, inner] of [
        [0, -1, 1],
        [nz, 1, nz - 1],
      ]) {
        w[wIndex(tunnel, i, j, k)] = outflow(2, side) ? w[wIndex(tunnel, i, j, inner)] : wind.z;
      }
    }
  }
};

/** no air through solid cells: the faces of a solid cell stand still */
const stopAtSolids = (tunnel: Tunnel) => {
  const { nx, ny, nz, u, v, w } = tunnel;
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (!tunnel.solid[cellIndex(tunnel, i, j, k)]) {
          continue;
        }
        u[uIndex(tunnel, i, j, k)] = 0;
        u[uIndex(tunnel, i + 1, j, k)] = 0;
        v[vIndex(tunnel, i, j, k)] = 0;
        v[vIndex(tunnel, i, j + 1, k)] = 0;
        w[wIndex(tunnel, i, j, k)] = 0;
        w[wIndex(tunnel, i, j, k + 1)] = 0;
      }
    }
  }
};

/** carries the air along with itself: each face takes what was upstream a step ago */
const advect = (tunnel: Tunnel, dt: number) => {
  const { nx, ny, nz, cell } = tunnel;
  const back = dt / cell;
  const velocity = new THREE.Vector3();
  const nu = new Float32Array(tunnel.u.length),
    nv = new Float32Array(tunnel.v.length),
    nw = new Float32Array(tunnel.w.length);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i <= nx; i++) {
        velocityInCells(tunnel, i, j + 0.5, k + 0.5, velocity);
        nu[uIndex(tunnel, i, j, k)] = trilinear(
          tunnel.u,
          nx + 1,
          ny,
          nz,
          i - velocity.x * back,
          j - velocity.y * back,
          k - velocity.z * back,
        );
      }
    }
  }
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i < nx; i++) {
        velocityInCells(tunnel, i + 0.5, j, k + 0.5, velocity);
        nv[vIndex(tunnel, i, j, k)] = trilinear(
          tunnel.v,
          nx,
          ny + 1,
          nz,
          i - velocity.x * back,
          j - velocity.y * back,
          k - velocity.z * back,
        );
      }
    }
  }
  for (let k = 0; k <= nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        velocityInCells(tunnel, i + 0.5, j + 0.5, k, velocity);
        nw[wIndex(tunnel, i, j, k)] = trilinear(
          tunnel.w,
          nx,
          ny,
          nz + 1,
          i - velocity.x * back,
          j - velocity.y * back,
          k - velocity.z * back,
        );
      }
    }
  }
  tunnel.u = nu;
  tunnel.v = nv;
  tunnel.w = nw;
};

/**
 * Makes the air free of divergence: a pressure per cell (successive over-relaxation) whose differences are taken off
 * the faces between air cells. Solid cells and the closed sides let nothing through; behind the outflow side the
 * pressure is 0.
 */
const project = (tunnel: Tunnel) => {
  const { nx, ny, nz, u, v, w, pressure, inflow } = tunnel;
  const counts = [nx, ny, nz];
  const divergence = new Float32Array(nx * ny * nz);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        divergence[cellIndex(tunnel, i, j, k)] =
          u[uIndex(tunnel, i + 1, j, k)] -
          u[uIndex(tunnel, i, j, k)] +
          v[vIndex(tunnel, i, j + 1, k)] -
          v[vIndex(tunnel, i, j, k)] +
          w[wIndex(tunnel, i, j, k + 1)] -
          w[wIndex(tunnel, i, j, k)];
      }
    }
  }
  const outSide = -inflow.side;
  // each cell's six neighbours, once: a cell index, OPEN (pressure 0 outside the outflow side) or CLOSED (nothing flows)
  const OPEN = -1,
    CLOSED = -2;
  const links = new Int32Array(nx * ny * nz * 6);
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const base = cellIndex(tunnel, i, j, k) * 6;
        [
          [i + 1, j, k, 0, 1],
          [i - 1, j, k, 0, -1],
          [i, j + 1, k, 1, 1],
          [i, j - 1, k, 1, -1],
          [i, j, k + 1, 2, 1],
          [i, j, k - 1, 2, -1],
        ].forEach(([ni, nj, nk, axis, step], slot) => {
          const at = [ni, nj, nk];
          if (at[axis] < 0 || at[axis] >= counts[axis]) {
            links[base + slot] = axis === inflow.axis && step === outSide ? OPEN : CLOSED;
          } else {
            links[base + slot] = isSolid(tunnel, ni, nj, nk) ? CLOSED : cellIndex(tunnel, ni, nj, nk);
          }
        });
      }
    }
  }
  const total = nx * ny * nz;
  for (let iteration = 0; iteration < PRESSURE_ITERATIONS; iteration++) {
    for (let index = 0; index < total; index++) {
      if (tunnel.solid[index]) {
        continue;
      }
      let sum = 0,
        count = 0;
      for (let slot = index * 6; slot < index * 6 + 6; slot++) {
        const link = links[slot];
        if (link >= 0) {
          sum += pressure[link];
          count++;
        } else if (link === OPEN) {
          count++;
        }
      }
      if (count) {
        pressure[index] += OVER_RELAXATION * ((sum - divergence[index]) / count - pressure[index]);
      }
    }
  }
  // the faces between two air cells (or an air cell and the open outflow side) take the pressure's difference
  const pressureAt = (i: number, j: number, k: number) => {
    if (i < 0 || j < 0 || k < 0 || i >= nx || j >= ny || k >= nz) {
      return 0;
    }
    return pressure[cellIndex(tunnel, i, j, k)];
  };
  const open = (axis: number, at: number, count: number, low: number[], high: number[]) => {
    const lowOutside = at === 0,
      highOutside = at === count;
    if (lowOutside || highOutside) {
      const side = lowOutside ? -1 : 1;
      const inside = lowOutside ? high : low;
      return axis === inflow.axis && side === outSide && !isSolid(tunnel, inside[0], inside[1], inside[2]);
    }
    return !isSolid(tunnel, low[0], low[1], low[2]) && !isSolid(tunnel, high[0], high[1], high[2]);
  };
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i <= nx; i++) {
        if (open(0, i, nx, [i - 1, j, k], [i, j, k])) {
          u[uIndex(tunnel, i, j, k)] -= pressureAt(i, j, k) - pressureAt(i - 1, j, k);
        }
      }
    }
  }
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (open(1, j, ny, [i, j - 1, k], [i, j, k])) {
          v[vIndex(tunnel, i, j, k)] -= pressureAt(i, j, k) - pressureAt(i, j - 1, k);
        }
      }
    }
  }
  for (let k = 0; k <= nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        if (open(2, k, nz, [i, j, k - 1], [i, j, k])) {
          w[wIndex(tunnel, i, j, k)] -= pressureAt(i, j, k) - pressureAt(i, j, k - 1);
        }
      }
    }
  }
};

// ------------------------------------------------------------ smoke

/** a new smoke line on the inflow side */
const newSmoke = (tunnel: Tunnel): Smoke => {
  const { box, inflow, cell } = tunnel;
  const point = new THREE.Vector3(
    box.min.x + Math.random() * (box.max.x - box.min.x),
    box.min.y + Math.random() * (box.max.y - box.min.y),
    box.min.z + Math.random() * (box.max.z - box.min.z),
  );
  const axis = (['x', 'y', 'z'] as const)[inflow.axis];
  point[axis] = inflow.side < 0 ? box.min[axis] + cell * 0.5 : box.max[axis] - cell * 0.5;
  return { points: [point], speeds: [tunnel.wind.length()], age: 0 };
};

const moveSmoke = (tunnel: Tunnel, dt: number) => {
  const size = tunnel.box.getSize(new THREE.Vector3());
  const limit = (3 * Math.max(size.x, size.y, size.z)) / Math.max(0.5, tunnel.wind.length());
  tunnel.smoke = tunnel.smoke.map((smoke) => {
    const head = smoke.points[smoke.points.length - 1];
    const air = flowAt(tunnel, head);
    smoke.age += dt;
    if (!air || smoke.age > limit) {
      return newSmoke(tunnel);
    }
    // a half step first (midpoint) – smoother around bodies
    const airMiddle = flowAt(tunnel, head.clone().addScaledVector(air, dt / 2)) ?? air;
    const next = head.clone().addScaledVector(airMiddle, dt);
    if (!tunnel.box.containsPoint(next)) {
      return newSmoke(tunnel);
    }
    smoke.points.push(next);
    smoke.speeds.push(airMiddle.length());
    if (smoke.points.length > TRAIL) {
      smoke.points.shift();
      smoke.speeds.shift();
    }
    return smoke;
  });
};

// ------------------------------------------------------------ the tunnel

export const createTunnel = (state: Simulation, node: BodyNode, region: Box): Tunnel => {
  const size = region.getSize(new THREE.Vector3());
  const resolution = Math.min(64, Math.max(12, Math.round(node.data.resolution ?? 40)));
  const cell = Math.max(size.x, size.y, size.z) / resolution;
  const nx = Math.max(4, Math.round(size.x / cell)),
    ny = Math.max(4, Math.round(size.y / cell)),
    nz = Math.max(4, Math.round(size.z / cell));
  // whole cells: the box grows or shrinks a little to fit them
  const box = region.clone();
  box.max.copy(box.min).add(new THREE.Vector3(nx, ny, nz).multiplyScalar(cell));
  // the wind along its strongest axis – that is the way through the tunnel
  const velocity = node.data.velocity ?? [5, 0, 0];
  const parts = velocity.map(Math.abs);
  const axis = parts.indexOf(Math.max(...parts));
  const wind = new THREE.Vector3();
  wind.setComponent(axis, velocity[axis]);
  const count = nx * ny * nz;
  const tunnel: Tunnel = {
    node,
    box,
    wind,
    cell,
    nx,
    ny,
    nz,
    u: new Float32Array((nx + 1) * ny * nz).fill(wind.x),
    v: new Float32Array(nx * (ny + 1) * nz).fill(wind.y),
    w: new Float32Array(nx * ny * (nz + 1)).fill(wind.z),
    pressure: new Float32Array(count),
    fixedSolid: new Uint8Array(count),
    solid: new Uint8Array(count),
    pending: 0,
    smoke: [],
    inflow: { axis, side: velocity[axis] >= 0 ? -1 : 1 },
  };
  // the model's still geometry: the static world and the static bodies
  voxelize(tunnel, state.worldPart, tunnel.fixedSolid);
  for (const body of state.bodies.filter((candidate) => candidate.node.data.type === 'static')) {
    for (const part of body.node.parts) {
      voxelize(tunnel, part, tunnel.fixedSolid);
    }
  }
  // the ground below z = 0
  if (state.settings.ground) {
    for (let k = 0; k < nz && box.min.z + (k + 0.5) * cell < 0; k++) {
      tunnel.fixedSolid.fill(1, k * nx * ny, (k + 1) * nx * ny);
    }
  }
  markBodies(state, tunnel);
  // the air settles around everything before the first view
  for (let round = 0; round < 6; round++) {
    boundaries(tunnel);
    stopAtSolids(tunnel);
    project(tunnel);
  }
  tunnel.smoke = Array.from({ length: LINES }, () => {
    const smoke = newSmoke(tunnel);
    // spread along the tunnel at the start, so it is full at once
    const name = (['x', 'y', 'z'] as const)[axis];
    smoke.points[0][name] = box.min[name] + Math.random() * (box.max[name] - box.min[name]);
    smoke.age = Math.random() * 2;
    return smoke;
  });
  return tunnel;
};

export const stepTunnel = (state: Simulation, tunnel: Tunnel, dt: number) => {
  tunnel.pending += dt;
  if (tunnel.pending < FLOW_STEP) {
    return;
  }
  const step = tunnel.pending;
  tunnel.pending = 0;
  markBodies(state, tunnel);
  advect(tunnel, step);
  boundaries(tunnel);
  stopAtSolids(tunnel);
  project(tunnel);
  moveSmoke(tunnel, step);
};

/** the air's speed at a point in the tunnel, or null outside it */
export const flowAt = (tunnel: Tunnel, point: Vector) => {
  if (!tunnel.box.containsPoint(point)) {
    return null;
  }
  return velocityInCells(
    tunnel,
    (point.x - tunnel.box.min.x) / tunnel.cell,
    (point.y - tunnel.box.min.y) / tunnel.cell,
    (point.z - tunnel.box.min.z) / tunnel.cell,
    new THREE.Vector3(),
  );
};

import type { Instance } from '../../../src/core/model';
import type { Editor, PEvt } from '../../../src/engine/editor';
import type { Overlay } from '../../../src/engine/overlay';
import { reactive } from 'vue';
import { KINDS, type LevelAction } from './kinds';
import { PLAY_TOOL_ID } from './names';
import { cameraLook, levelObjects, type LevelObject } from './objects';
import { pluginContext, t, THREE } from './runtime';
import { buildWorld, raycast, type Polygon, type World } from './world';
import { levelAtmosphere, refreshPreview, resetPreview, viewAtmosphere, viewLight } from './lights';
import { playSound, setZoneSounds, startSounds, stopSounds, type Reverb } from './sounds';

/**
 * The test run: walk through the level as the player – with collision against the model, steps up stairs, gravity and
 * jumps – in first person, from behind or through the level's fixed cameras, and see the level's logic work: triggers
 * set off their actions, doors open (locked ones with their key), pickups are collected, teleporters and jump pads
 * move the player, hazards and enemies hurt. The model is not changed; only what is shown changes while it runs and
 * comes back when it stops.
 */

type Vector = InstanceType<typeof THREE.Vector3>;
export type PlayView = 'first' | 'third' | 'fixed';

const RADIUS = 0.3;
const STEP = 0.45;
const EYE = 1.6;
const GRAVITY = 20;
const WALK = 4;
const RUN = 7;
const JUMP = 5.5;

/** what the HUD shows */
interface PlayHud {
  active: boolean;
  health: number;
  items: Record<string, number>;
  messages: { text: string; until: number }[];
  view: PlayView;
  camera: string;
  sound: string;
  locked: boolean;
  /** the player's torch is on */
  torch: boolean;
}

let hud: PlayHud | null = null;
// made on first use – the app's Vue is only there once the plugin is active
export const usePlayHud = () =>
  (hud ??= reactive<PlayHud>({
    active: false,
    health: 100,
    items: {},
    messages: [],
    view: 'first',
    camera: '',
    sound: '',
    locked: false,
    torch: false,
  }) as PlayHud);

interface Sim {
  world: World;
  objects: LevelObject[];
  byId: Map<string, LevelObject>;
  position: Vector;
  yaw: number;
  pitch: number;
  vz: number;
  /** horizontal speed a jump pad gave, kept until landing */
  drift: Vector;
  onGround: boolean;
  keys: Set<string>;
  doors: Map<string, { open: boolean; locked: boolean }>;
  enabled: Map<string, boolean>;
  /** pickups taken: when they come back (Infinity: never) */
  taken: Map<string, number>;
  spawned: Set<string>;
  inside: Set<string>;
  fired: Set<string>;
  camera: string | null;
  cooldown: number;
  time: number;
  start: { position: Vector; yaw: number };
  hidden: Map<Instance, boolean | undefined>;
  savedCamera: ReturnType<Editor['viewer']['rig']['getState']>;
  /** the enemies that walk – one per enemy object and count */
  enemies: Enemy[];
  /** the echo of the sound zone the player is in */
  reverb: Reverb;
  frame: number;
  last: number;
  look: (event: MouseEvent) => void;
  lockChange: () => void;
}

let sim: Sim | null = null;
export const isPlaying = () => !!sim;

/** the view the next test run starts in – null: through the fixed cameras when the level has some, else first person */
let firstView: PlayView | null = null;
export const startIn = (view: PlayView | null) => {
  firstView = view;
};

/** an enemy in the test run: it walks its patrol path, follows the player it sees and hurts on contact */
interface Enemy {
  object: LevelObject;
  position: Vector;
  yaw: number;
  /** its patrol: the waypoints of its path in order, and the one it walks to */
  path: Vector[];
  next: number;
  /** seconds it still waits at a waypoint */
  wait: number;
  chasing: boolean;
  /** seconds since it last saw the player */
  lost: number;
  /** its own place in the model (the instance it is drawn with – only the first of a count) */
  shown: boolean;
}

const PATROL = 1.4;
const CHASE = 2.6;
const SIGHT = 12;

// ------------------------------------------------------------ helpers

const positionOf = (object: LevelObject) => new THREE.Vector3().setFromMatrixPosition(object.world);
/** the way an object faces (its +x) as an angle around z */
const facingOf = (object: LevelObject) => {
  const along = new THREE.Vector3(1, 0, 0).transformDirection(object.world);
  return Math.atan2(along.y, along.x);
};

const message = (text: string) => {
  const state = usePlayHud();
  state.messages = [...state.messages.filter((entry) => entry.until > performance.now()), { text, until: performance.now() + 4000 }].slice(
    -4,
  );
};

/** is a point inside a volume object (its box, scaled and turned with it)? */
const inVolume = (object: LevelObject, point: Vector) => {
  const local = point.clone().applyMatrix4(object.world.clone().invert());
  const [width, depth, height] = KINDS[object.kind].size;
  return Math.abs(local.x) <= width / 2 && Math.abs(local.y) <= depth / 2 && local.z >= 0 && local.z <= height;
};

const walls = (state: Sim) => (polygon: Polygon) =>
  Math.abs(polygon.normal.z) < 0.7 && (!polygon.door || !state.doors.get(polygon.door)?.open);
const floors = (state: Sim) => (polygon: Polygon) =>
  Math.abs(polygon.normal.z) >= 0.5 && (!polygon.door || !state.doors.get(polygon.door)?.open);

/** the floor under a point, searched from a step above it */
const groundAt = (state: Sim, position: Vector) =>
  raycast(state.world, position.clone().add(new THREE.Vector3(0, 0, STEP)), new THREE.Vector3(0, 0, -1), 200, floors(state));

// ------------------------------------------------------------ what is shown

/** markers that only help to edit the level – hidden while it runs */
const EDITOR_ONLY = new Set(['spawn', 'waypoint', 'trigger', 'hazard', 'soundzone', 'camera']);

const shownInPlay = (state: Sim, object: LevelObject) => {
  if (EDITOR_ONLY.has(object.kind) || state.enabled.get(object.id) === false) {
    return false;
  }
  if (object.kind === 'door') {
    return !state.doors.get(object.id)?.open;
  }
  if (object.kind === 'pickup') {
    return !state.taken.has(object.id);
  }
  if (object.kind === 'enemy') {
    return isActive(state, object);
  }
  return true;
};

/** has an enemy come (at the start, or called by an action)? */
const isActive = (state: Sim, object: LevelObject) =>
  state.enabled.get(object.id) !== false && (object.props.when !== 'action' || state.spawned.has(object.id));

/** the enemies of the level: each object as many as its count, around its place, facing its way */
const makeEnemies = (objects: LevelObject[]): Enemy[] =>
  objects
    .filter((object) => object.kind === 'enemy')
    .flatMap((object) => {
      const count = Math.max(1, Math.min(12, Math.round(Number(object.props.count) || 1)));
      const at = positionOf(object);
      const name = String(object.props.path);
      const path = name
        ? objects
            .filter((candidate) => candidate.kind === 'waypoint' && String(candidate.props.path) === name)
            .sort((a, b) => Number(a.props.order) - Number(b.props.order))
            .map(positionOf)
        : [];
      return Array.from({ length: count }, (_, index) => {
        const angle = (index / count) * Math.PI * 2;
        const spread = index ? 0.9 : 0;
        return {
          object,
          position: at.clone().add(new THREE.Vector3(Math.cos(angle) * spread, Math.sin(angle) * spread, 0)),
          yaw: facingOf(object),
          path,
          next: 0,
          wait: 0,
          chasing: false,
          lost: 0,
          shown: index === 0,
        };
      });
    });

/** the enemies walk: along their path, after the player they see (not through walls), waiting at waypoints */
const walkEnemies = (state: Sim, dt: number) => {
  const playerHud = usePlayHud();
  const playerEye = state.position.clone().add(new THREE.Vector3(0, 0, EYE));
  for (const enemy of state.enemies) {
    if (!isActive(state, enemy.object)) {
      continue;
    }
    const eye = enemy.position.clone().add(new THREE.Vector3(0, 0, EYE));
    const toPlayer = playerEye.clone().sub(eye);
    const distance = toPlayer.length();
    // it sees ahead (±70°) as far as SIGHT, and notices the player right next to it from any side – not through walls
    const ahead = new THREE.Vector3(Math.cos(enemy.yaw), Math.sin(enemy.yaw), 0);
    const flatToPlayer = new THREE.Vector3(toPlayer.x, toPlayer.y, 0).normalize();
    const inView = distance < 2.5 || ahead.dot(flatToPlayer) > Math.cos((70 * Math.PI) / 180);
    const sees =
      inView &&
      distance < SIGHT &&
      !raycast(state.world, eye, toPlayer.clone().normalize(), Math.max(0, distance - 0.4), (polygon) => walls(state)(polygon));
    if (sees) {
      enemy.chasing = true;
      enemy.lost = 0;
    } else if (enemy.chasing) {
      enemy.lost += dt;
      enemy.chasing = enemy.lost < 4;
    }
    let target: Vector | null = null;
    let speed = PATROL;
    if (enemy.chasing) {
      target = state.position;
      speed = CHASE;
    } else if (enemy.path.length) {
      if (enemy.wait > 0) {
        enemy.wait -= dt;
      } else {
        target = enemy.path[enemy.next % enemy.path.length];
      }
    }
    if (target) {
      const flat = new THREE.Vector3(target.x - enemy.position.x, target.y - enemy.position.y, 0);
      const left = flat.length();
      if (!enemy.chasing && left < 0.3) {
        // at the waypoint: wait as it says, then on to the next
        const waypoint = state.objects.find(
          (object) => object.kind === 'waypoint' && positionOf(object).distanceTo(enemy.path[enemy.next % enemy.path.length]) < 1e-6,
        );
        enemy.wait = Number(waypoint?.props.wait) || 0;
        enemy.next = (enemy.next + 1) % enemy.path.length;
      } else if (left > (enemy.chasing ? 0.7 : 0.01)) {
        flat.normalize();
        enemy.yaw = Math.atan2(flat.y, flat.x);
        moveFlat(state, enemy.position, flat.multiplyScalar(Math.min(left, speed * dt)));
      }
    }
    const ground = groundAt(state, enemy.position);
    if (ground && Math.abs(ground.point.z - enemy.position.z) < 1.5) {
      enemy.position.z = ground.point.z;
    }
    // on contact it hurts
    if (
      Math.hypot(enemy.position.x - state.position.x, enemy.position.y - state.position.y) < 0.8 &&
      Math.abs(enemy.position.z - state.position.z) < 1.6
    ) {
      playerHud.health -= 20 * dt;
    }
  }
};

/** the enemies' instances where they walk – the model is not changed, the view shows them there */
const showEnemies = (state: Sim) => {
  const context = pluginContext();
  for (const enemy of state.enemies) {
    if (!enemy.shown || !isActive(state, enemy.object)) {
      continue;
    }
    // the object's matrix with its place and turn swapped – in its parent's coordinates (top level: the model's)
    const scale = new THREE.Vector3();
    enemy.object.world.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
    const world = new THREE.Matrix4().compose(
      enemy.position,
      new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), enemy.yaw),
      scale,
    );
    const parent = enemy.object.world.clone().multiply(enemy.object.instance.matrix.clone().invert());
    context.display.place(enemy.object.instance, parent.invert().multiply(world));
  }
};

const syncShown = (state: Sim) => {
  let changed = false;
  for (const object of state.objects) {
    const hidden = !shownInPlay(state, object);
    if (!!object.instance.hidden !== hidden) {
      object.instance.hidden = hidden;
      changed = true;
    }
  }
  if (changed) {
    pluginContext().editor.invalidate();
  }
};

// ------------------------------------------------------------ actions

const runActions = (state: Sim, actions: LevelAction[]) => {
  for (const action of actions) {
    const target = action.target ? state.byId.get(action.target) : undefined;
    const door = target ? state.doors.get(target.id) : undefined;
    switch (action.do) {
      case 'open':
      case 'close':
        if (door) {
          door.open = action.do === 'open';
        }
        break;
      case 'unlock':
      case 'lock':
        if (door) {
          door.locked = action.do === 'lock';
        }
        break;
      case 'enable':
      case 'disable':
        if (target) {
          state.enabled.set(target.id, action.do === 'enable');
        }
        break;
      case 'spawn':
        if (target) {
          state.spawned.add(target.id);
          message(t('level.play.enemyComes', { name: target.instance.name || target.id }));
        }
        break;
      case 'camera':
        if (target) {
          state.camera = target.id;
          usePlayHud().camera = target.instance.name || target.id;
        }
        break;
      case 'teleport':
        if (target) {
          teleport(state, target);
        }
        break;
      case 'sound':
        playSound(action.value ?? '', 1, state.reverb);
        message(`♪ ${action.value ?? ''}`);
        break;
      case 'message':
        message(action.value ?? '');
        break;
    }
  }
};

const teleport = (state: Sim, target: LevelObject) => {
  const yaw = facingOf(target);
  state.position.copy(positionOf(target)).add(new THREE.Vector3(Math.cos(yaw) * 1.2, Math.sin(yaw) * 1.2, 0));
  state.yaw = yaw;
  state.vz = 0;
  state.drift.set(0, 0, 0);
  state.cooldown = 1.5;
};

const respawn = (state: Sim) => {
  state.position.copy(state.start.position);
  state.yaw = state.start.yaw;
  state.vz = 0;
  state.drift.set(0, 0, 0);
  usePlayHud().health = 100;
};

// ------------------------------------------------------------ moving

/** horizontal movement of a body (the player, an enemy) with collision: stops at walls keeping its radius, slides */
const moveFlat = (state: Sim, body: Vector, wanted: Vector) => {
  let delta = wanted.clone();
  for (let attempt = 0; attempt < 3 && delta.lengthSq() > 1e-10; attempt++) {
    const length = delta.length();
    const direction = delta.clone().divideScalar(length);
    let hit: ReturnType<typeof raycast> = null;
    for (const height of [STEP + 0.05, 1.0, 1.6]) {
      const found = raycast(state.world, body.clone().add(new THREE.Vector3(0, 0, height)), direction, length + RADIUS, walls(state));
      if (found && (!hit || found.distance < hit.distance)) {
        hit = found;
      }
    }
    if (!hit) {
      body.add(delta);
      return;
    }
    const allowed = Math.max(0, hit.distance - RADIUS);
    body.addScaledVector(direction, allowed);
    const rest = delta.multiplyScalar(1 - allowed / length);
    const normal = new THREE.Vector3(hit.normal.x, hit.normal.y, 0).normalize();
    delta = rest.addScaledVector(normal, -rest.dot(normal));
  }
  // keep the radius to walls on every side (corners)
  for (let side = 0; side < 8; side++) {
    const angle = (side / 8) * Math.PI * 2;
    const direction = new THREE.Vector3(Math.cos(angle), Math.sin(angle), 0);
    const found = raycast(state.world, body.clone().add(new THREE.Vector3(0, 0, 1)), direction, RADIUS, walls(state));
    if (found) {
      body.addScaledVector(direction, found.distance - RADIUS);
    }
  }
};

const step = (state: Sim, dt: number) => {
  const view = usePlayHud().view;
  const keys = state.keys;
  const pressed = (...names: string[]) => names.some((name) => keys.has(name));
  // turning with the arrow keys (the mouse turns too while the pointer is locked)
  if (pressed('arrowleft')) {
    state.yaw += 2.2 * dt;
  }
  if (pressed('arrowright')) {
    state.yaw -= 2.2 * dt;
  }
  const forward = (pressed('w', 'arrowup') ? 1 : 0) - (pressed('s', 'arrowdown') ? 1 : 0);
  const sideways = (pressed('d') ? 1 : 0) - (pressed('a') ? 1 : 0);
  const speed = keys.has('shift') ? RUN : WALK;
  const move = new THREE.Vector3();
  if (forward || sideways) {
    // through a fixed camera the keys follow the camera's view, the player turns the way it walks
    const heading = view === 'fixed' ? fixedCameraYaw(state) : state.yaw;
    move.set(Math.cos(heading) * forward + Math.sin(heading) * sideways, Math.sin(heading) * forward - Math.cos(heading) * sideways, 0);
    move.normalize().multiplyScalar(speed * dt);
    if (view === 'fixed') {
      state.yaw = Math.atan2(move.y, move.x);
    }
  }
  if (!state.onGround) {
    move.addScaledVector(state.drift, dt);
  }
  moveFlat(state, state.position, move);

  // up and down: gravity, jumps, steps, ceilings
  if (keys.has(' ') && state.onGround) {
    state.vz = JUMP;
    state.onGround = false;
  }
  state.vz -= GRAVITY * dt;
  const ground = groundAt(state, state.position);
  const floor = ground ? ground.point.z : -Infinity;
  const next = state.position.z + state.vz * dt;
  if (state.vz > 0) {
    const ceiling = raycast(
      state.world,
      state.position.clone().add(new THREE.Vector3(0, 0, 1.7)),
      new THREE.Vector3(0, 0, 1),
      state.vz * dt + 0.05,
      floors(state),
    );
    if (ceiling) {
      state.vz = 0;
    }
  }
  if (next <= floor || (state.onGround && state.vz <= 0 && state.position.z - floor < STEP)) {
    // on the ground – also down a step while walking
    state.position.z = floor;
    state.vz = 0;
    state.onGround = true;
    state.drift.set(0, 0, 0);
  } else {
    state.position.z = next;
    state.onGround = false;
  }
  if (state.position.z < -50) {
    message(t('level.play.fell'));
    respawn(state);
  }
};

/** the fixed camera's heading on the ground – what "forward" means through it */
const fixedCameraYaw = (state: Sim) => {
  const camera = state.camera ? state.byId.get(state.camera) : undefined;
  if (!camera) {
    return state.yaw;
  }
  const look = cameraLook(camera);
  return Math.atan2(look.y, look.x);
};

// ------------------------------------------------------------ the level's logic

const logic = (state: Sim, dt: number, use: boolean) => {
  const body = state.position.clone().add(new THREE.Vector3(0, 0, 0.9));
  const near = (object: LevelObject, reach: number, height = 1.6) => {
    const at = positionOf(object);
    return Math.hypot(at.x - body.x, at.y - body.y) < reach && Math.abs(at.z - state.position.z) < height;
  };
  const playerHud = usePlayHud();
  let sound = '';
  const zones: { name: string; volume: number; reverb: Reverb }[] = [];
  state.cooldown = Math.max(0, state.cooldown - dt);
  for (const object of state.objects) {
    if (state.enabled.get(object.id) === false) {
      continue;
    }
    switch (object.kind) {
      case 'trigger': {
        const now = inVolume(object, body);
        const was = state.inside.has(object.id);
        const on = object.props.on;
        if ((now && !was && on === 'enter') || (!now && was && on === 'leave') || (now && use && on === 'use')) {
          if (!(object.props.once && state.fired.has(object.id))) {
            state.fired.add(object.id);
            runActions(state, object.actions);
          }
        }
        if (now) {
          state.inside.add(object.id);
        } else {
          state.inside.delete(object.id);
        }
        break;
      }
      case 'hazard':
        if (inVolume(object, body)) {
          playerHud.health = object.props.kill ? 0 : playerHud.health - Number(object.props.damage) * dt;
        }
        break;
      case 'soundzone':
        if (inVolume(object, body)) {
          sound = `${object.props.sound}${object.props.reverb !== 'none' ? ` · ${t(`level.options.${object.props.reverb}`)}` : ''}`;
          zones.push({ name: String(object.props.sound), volume: Number(object.props.volume) || 0, reverb: object.props.reverb as Reverb });
        }
        break;
      case 'pickup': {
        const back = state.taken.get(object.id);
        if (back !== undefined && back <= state.time) {
          state.taken.delete(object.id);
        }
        if (!state.taken.has(object.id) && near(object, 0.9)) {
          const item = String(object.props.item);
          const amount = Number(object.props.amount) || 1;
          playerHud.items = { ...playerHud.items, [item]: (playerHud.items[item] ?? 0) + amount };
          const respawnAfter = Number(object.props.respawn) || 0;
          state.taken.set(object.id, respawnAfter > 0 ? state.time + respawnAfter : Infinity);
          message(t('level.play.picked', { item, amount }));
          runActions(state, object.actions);
        }
        break;
      }
      case 'teleporter': {
        const target = state.byId.get(String(object.props.target));
        if (target && state.cooldown <= 0 && near(object, 0.6, 0.5)) {
          teleport(state, target);
        }
        break;
      }
      case 'jumppad':
        if (state.onGround && near(object, 0.7, 0.3)) {
          const up = Math.sqrt(2 * GRAVITY * Math.max(0.5, Number(object.props.height)));
          const yaw = facingOf(object);
          const flight = (2 * up) / GRAVITY;
          state.vz = up;
          state.onGround = false;
          state.drift.set(Math.cos(yaw), Math.sin(yaw), 0).multiplyScalar(Number(object.props.distance) / flight);
        }
        break;
    }
  }
  playerHud.sound = sound;
  setZoneSounds(zones);
  // single sounds ring with the echo of the zone the player is in
  state.reverb = zones.find((zone) => zone.reverb !== 'none')?.reverb ?? 'none';

  // using: the nearest door or save point within reach
  if (use) {
    const reachable = state.objects
      .filter(
        (object) => (object.kind === 'door' || object.kind === 'savepoint') && state.enabled.get(object.id) !== false && near(object, 1.6),
      )
      .sort((a, b) => positionOf(a).distanceTo(body) - positionOf(b).distanceTo(body))[0];
    if (reachable?.kind === 'savepoint') {
      message(t('level.play.saved', { name: String(reachable.props.label || reachable.instance.name) }));
    } else if (reachable) {
      const door = state.doors.get(reachable.id)!;
      const key = String(reachable.props.key);
      if (door.locked && key && (playerHud.items[key] ?? 0) > 0) {
        door.locked = false;
        door.open = true;
        message(t('level.play.unlocked', { key }));
      } else if (door.locked) {
        message(key ? t('level.play.lockedKey', { key }) : t('level.play.locked'));
      } else {
        door.open = !door.open;
      }
    }
  }
  if (playerHud.health <= 0) {
    message(t('level.play.died'));
    respawn(state);
  }
};

// ------------------------------------------------------------ the view

const placeCamera = (state: Sim) => {
  const editor = pluginContext().editor;
  const playerHud = usePlayHud();
  const camera = state.camera ? state.byId.get(state.camera) : undefined;
  if (playerHud.view === 'fixed' && camera) {
    const eye = positionOf(camera);
    editor.viewer.rig.applyState(
      { position: eye.toArray(), target: eye.clone().add(cameraLook(camera)).toArray(), fov: Number(camera.props.fov) || 50, ortho: false },
      false,
    );
    return;
  }
  const look = new THREE.Vector3(
    Math.cos(state.pitch) * Math.cos(state.yaw),
    Math.cos(state.pitch) * Math.sin(state.yaw),
    Math.sin(state.pitch),
  );
  if (playerHud.view === 'third') {
    const target = state.position.clone().add(new THREE.Vector3(0, 0, 1.5));
    const back = look.clone().negate();
    // pulled in where a wall stands behind the player
    const blocked = raycast(state.world, target, back, 4, walls(state));
    const distance = blocked ? Math.max(0.5, blocked.distance - 0.2) : 4;
    const eye = target
      .clone()
      .addScaledVector(back, distance)
      .add(new THREE.Vector3(0, 0, 0.6));
    editor.viewer.rig.applyState({ position: eye.toArray(), target: target.toArray(), fov: 70, ortho: false }, false);
    return;
  }
  const eye = state.position.clone().add(new THREE.Vector3(0, 0, EYE));
  editor.viewer.rig.applyState({ position: eye.toArray(), target: eye.clone().add(look).toArray(), fov: 75, ortho: false }, false);
};

/** a body as lines: rings at feet, waist and head, four posts and a nose the way it faces */
const drawBody = (overlay: Overlay, feet: Vector, yaw: number, colour: string) => {
  const up = new THREE.Vector3(0, 0, 1);
  for (const height of [0.05, 0.9, 1.7]) {
    overlay.circle3D(feet.clone().add(new THREE.Vector3(0, 0, height)), up, RADIUS, colour, 2, 16);
  }
  for (let side = 0; side < 4; side++) {
    const angle = (side / 4) * Math.PI * 2 + yaw;
    const bottom = feet.clone().add(new THREE.Vector3(Math.cos(angle) * RADIUS, Math.sin(angle) * RADIUS, 0));
    overlay.line(bottom, bottom.clone().add(new THREE.Vector3(0, 0, 1.7)), colour, 2);
  }
  const nose = feet.clone().add(new THREE.Vector3(0, 0, 1.5));
  overlay.line(nose, nose.clone().add(new THREE.Vector3(Math.cos(yaw) * 0.6, Math.sin(yaw) * 0.6, 0)), colour, 3);
};

/** the player (seen from behind or through a fixed camera) and the enemies a count adds to an enemy object */
export const drawPlayer = (overlay: Overlay) => {
  if (!sim) {
    return;
  }
  for (const enemy of sim.enemies) {
    if (!enemy.shown && isActive(sim, enemy.object)) {
      drawBody(overlay, enemy.position, enemy.yaw, '#e03131');
    }
  }
  if (usePlayHud().view !== 'first') {
    drawBody(overlay, sim.position, sim.yaw, '#ffd43b');
  }
};

// ------------------------------------------------------------ light

/** the level's lights that are on (triggers switch them), flickering ones changing, and the player's torch */
const shine = (state: Sim) => {
  const playerHud = usePlayHud();
  const lights = state.objects
    .filter((object) => object.kind === 'light' && state.enabled.get(object.id) !== false)
    .map((object) => viewLight(object, state.time));
  if (playerHud.torch) {
    // from the eyes along the view – through a fixed camera from the player's chest the way it faces
    const pitch = playerHud.view === 'fixed' ? -0.15 : state.pitch;
    const look = new THREE.Vector3(Math.cos(pitch) * Math.cos(state.yaw), Math.cos(pitch) * Math.sin(state.yaw), Math.sin(pitch));
    const from = state.position.clone().add(new THREE.Vector3(0, 0, playerHud.view === 'fixed' ? 1.3 : EYE - 0.15));
    // first, so it keeps its shadow when many lamps want one too
    lights.unshift({
      kind: 'spot',
      position: from.toArray(),
      direction: look.toArray(),
      color: '#fff4d6',
      intensity: 3,
      range: 18,
      angle: 24,
      penumbra: 0.5,
      shadow: true,
    });
  }
  pluginContext().lighting.set(lights);
};

// ------------------------------------------------------------ start and stop

const startPlay = (editor: Editor) => {
  const objects = levelObjects();
  const byId = new Map(objects.map((object) => [object.id, object]));
  const spawns = objects.filter((object) => object.kind === 'spawn');
  const spawn = spawns.find((object) => object.props.team === 'player') ?? spawns[0];
  const rig = editor.viewer.rig;
  const savedCamera = rig.getState();
  // without a spawn point: where the camera looks, on the ground
  const startPosition = spawn ? positionOf(spawn) : new THREE.Vector3().fromArray(savedCamera.target);
  const startCamera =
    objects.find((object) => object.kind === 'camera' && object.props.start) ?? objects.find((object) => object.kind === 'camera');
  const state: Sim = {
    world: buildWorld(objects),
    objects,
    byId,
    position: startPosition.clone(),
    yaw: spawn ? facingOf(spawn) : 0,
    pitch: 0,
    vz: 0,
    drift: new THREE.Vector3(),
    onGround: false,
    keys: new Set(),
    doors: new Map(
      objects
        .filter((object) => object.kind === 'door')
        .map((door) => [door.id, { open: !!door.props.startsOpen, locked: !!door.props.locked }]),
    ),
    // lights start as they are set: on or off
    enabled: new Map(objects.filter((object) => object.kind === 'light').map((light) => [light.id, !!light.props.on])),
    taken: new Map(),
    spawned: new Set(),
    inside: new Set(),
    fired: new Set(),
    camera: startCamera?.id ?? null,
    cooldown: 0,
    time: 0,
    start: { position: startPosition.clone(), yaw: spawn ? facingOf(spawn) : 0 },
    hidden: new Map(objects.map((object) => [object.instance, object.instance.hidden])),
    savedCamera,
    enemies: makeEnemies(objects),
    reverb: 'none',
    frame: 0,
    last: performance.now(),
    look: () => undefined,
    lockChange: () => undefined,
  };
  const ground = groundAt(state, state.position);
  if (ground) {
    state.position.z = ground.point.z;
  }
  // the mouse turns the view while the pointer is locked (a click in the view locks it, Esc frees it)
  state.look = (event: MouseEvent) => {
    if (document.pointerLockElement !== editor.viewer.canvas) {
      return;
    }
    state.yaw -= event.movementX * 0.0025;
    state.pitch = Math.max(-1.4, Math.min(1.4, state.pitch - event.movementY * 0.0025));
  };
  state.lockChange = () => {
    usePlayHud().locked = document.pointerLockElement === editor.viewer.canvas;
  };
  document.addEventListener('mousemove', state.look);
  void startSounds();
  document.addEventListener('pointerlockchange', state.lockChange);
  sim = state;

  // the whole view for the level
  pluginContext().panels.close();
  const playerHud = usePlayHud();
  Object.assign(playerHud, {
    active: true,
    health: 100,
    items: {},
    messages: [],
    view: firstView === 'fixed' && !startCamera ? 'first' : (firstView ?? (startCamera ? 'fixed' : 'first')),
    camera: startCamera ? startCamera.instance.name || startCamera.id : '',
    sound: '',
    locked: false,
    // in the dark the torch is on
    torch: levelAtmosphere().daylight < 0.5,
  });
  pluginContext().lighting.atmosphere(viewAtmosphere(levelAtmosphere()));
  syncShown(state);
  const loop = (now: number) => {
    if (sim !== state) {
      return;
    }
    // in small steps, so a slow frame (a busy or hidden window) moves as far as it should without passing walls
    let remaining = Math.min(0.25, (now - state.last) / 1000);
    state.last = now;
    let use = state.keys.has('use');
    state.keys.delete('use');
    while (remaining > 1e-4) {
      const dt = Math.min(0.02, remaining);
      remaining -= dt;
      state.time += dt;
      step(state, dt);
      walkEnemies(state, dt);
      logic(state, dt, use);
      use = false;
    }
    syncShown(state);
    placeCamera(state);
    showEnemies(state);
    shine(state);
    playerHud.messages = playerHud.messages.filter((entry) => entry.until > now);
    editor.redraw();
    state.frame = requestAnimationFrame(loop);
  };
  state.frame = requestAnimationFrame(loop);
};

export const stopPlay = () => {
  const state = sim;
  if (!state) {
    return;
  }
  sim = null;
  stopSounds();
  cancelAnimationFrame(state.frame);
  document.removeEventListener('mousemove', state.look);
  document.removeEventListener('pointerlockchange', state.lockChange);
  const editor = pluginContext().editor;
  if (document.pointerLockElement === editor.viewer.canvas) {
    document.exitPointerLock();
  }
  for (const enemy of state.enemies) {
    if (enemy.shown) {
      pluginContext().display.place(enemy.object.instance, null);
    }
  }
  for (const [instance, hidden] of state.hidden) {
    instance.hidden = hidden;
  }
  editor.invalidate();
  editor.viewer.rig.applyState(state.savedCamera, false);
  usePlayHud().active = false;
  // the view's light as it is while editing
  const context = pluginContext();
  context.lighting.set([]);
  context.lighting.atmosphere(null);
  resetPreview();
  refreshPreview();
};

/** the keys the test run takes – all others stay with the app (Ctrl shortcuts, …) */
const KEYS: Record<string, string> = {
  w: 'w',
  a: 'a',
  s: 's',
  d: 'd',
  arrowup: 'arrowup',
  arrowdown: 'arrowdown',
  arrowleft: 'arrowleft',
  arrowright: 'arrowright',
  ' ': ' ',
  shift: 'shift',
};

export const createPlayTool = (editor: Editor) => {
  const context = pluginContext();
  const Base = context.classes.Tool;
  return new (class PlayTool extends Base {
    id = PLAY_TOOL_ID;
    name = 'level.play.tool';
    cursor = 'crosshair';

    status() {
      return t('level.play.status');
    }

    activate() {
      startPlay(editor);
    }

    deactivate() {
      stopPlay();
    }

    onDown(event: PEvt) {
      if (event.button === 0 && usePlayHud().view !== 'fixed' && document.pointerLockElement !== editor.viewer.canvas) {
        editor.viewer.canvas.requestPointerLock?.();
      }
    }

    onKey(event: KeyboardEvent, down: boolean) {
      if (!sim || event.ctrlKey || event.metaKey) {
        return false;
      }
      const key = event.key.toLowerCase();
      if (key === 'escape') {
        if (down) {
          editor.setTool('select');
        }
        return true;
      }
      if (down && key === 'e') {
        sim.keys.add('use');
        return true;
      }
      if (down && key === 'f') {
        const playerHud = usePlayHud();
        playerHud.torch = !playerHud.torch;
        return true;
      }
      if (down && key === 'v') {
        // first person → from behind → through the fixed cameras (when the level has some)
        const playerHud = usePlayHud();
        const views: PlayView[] = sim.camera ? ['first', 'third', 'fixed'] : ['first', 'third'];
        playerHud.view = views[(views.indexOf(playerHud.view) + 1) % views.length];
        if (playerHud.view === 'fixed' && document.pointerLockElement === editor.viewer.canvas) {
          document.exitPointerLock();
        }
        return true;
      }
      const name = KEYS[key];
      if (name) {
        if (down) {
          sim.keys.add(name);
        } else {
          sim.keys.delete(name);
        }
        return true;
      }
      // no tool shortcuts while playing
      return /^[a-z0-9]$/.test(key);
    }

    // the app calls cancel when it switches tools – stopping is enough (Esc switches to Select in onKey)
    cancel() {
      stopPlay();
    }

    busy() {
      return false;
    }

    draw(overlay: Overlay) {
      drawPlayer(overlay);
    }
  })(editor);
};

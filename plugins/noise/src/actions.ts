import type { Entities, Face, Instance } from '../../../src/core/model';
import type { PluginMesh } from '../../../src/plugins/types';
import type * as THREE from 'three';
import type { FaceHandle, GroupHandle, Pt, ScriptApi } from '../../../src/scripting/api';
import {
  ProcgenError,
  meshBuilder,
  wallPlane,
  CITY_DEFAULTS,
  planCity,
  type CityOptions,
  FLAT_GROUND,
  terrainGround,
  type CityGround,
  FACADE_DEFAULTS,
  facadeMesh,
  type FacadeMaterials,
  type FacadeOptions,
  bendMesh,
  displace,
  refine,
  toPluginMesh,
  weld,
  type TriangleMesh,
  type Vector,
  fractal,
  randomGenerator,
  type NoiseMode,
  EROSION_DEFAULTS,
  erode,
  type ErosionOptions,
  PAVING_DEFAULTS,
  inside,
  pavingMesh,
  pavingStones,
  type Plane,
  type PavingOptions,
  ROAD_DEFAULTS,
  RIVER_DEFAULTS,
  riverOn,
  roadOn,
  type Point2,
  onCourse,
  type Course,
  type RiverOptions,
  type RoadOptions,
  type RoadSurface,
  VILLAGE_DEFAULTS,
  planVillages,
  villageLinks,
  type VillageOptions,
  TREE_DEFAULTS,
  TREE_SPECIES,
  treeMesh,
  type TreeOptions,
  MATERIALS,
  gridIndex,
  gridMesh,
  makeGrid,
  normaliseSettings,
  sampleGrid,
  type TerrainGrid,
  type TerrainSettings,
} from '@shap3d/procgen';
import { OBJECT_KINDS, ensureObjectMaterials, objectDefinitions, type ObjectKind } from './objects';
import { beginStep, readGrid, remember, tagOutput, writeGrid, type NoiseTerrainData } from './recipes';
import { pluginContext, t } from './runtime';

export type { NoiseTerrainData } from './recipes';

/**
 * What the script functions do – s3d.noiseTerrain, s3d.scatter and s3d.noiseDeform. The panel runs them as
 * scripts too (context.script.run), so every action is one undo step and does exactly what the script would.
 */

/** runs a generator of the library; its errors (codes without text) become messages in the user's language */
const translated = <T>(generate: () => T): T => {
  try {
    return generate();
  } catch (error) {
    if (error instanceof ProcgenError) {
      throw new Error(t(`noise.${error.code}`, error.params));
    }
    throw error;
  }
};

/** a call's options as a recipe keeps them: plain values only – no handles, no target */
const stepParams = (call: object, ...without: string[]) =>
  Object.fromEntries(
    Object.entries(call).filter(([key, value]) => value != null && !without.includes(key) && typeof value !== 'object'),
  ) as Record<string, unknown>;

let created: Instance | null = null;
/** the group the last s3d.noiseTerrain or s3d.scatter made – the panel selects it */
export const lastCreated = () => created;
/** marks a group as the one made last (the panel selects it) */
export const markCreated = (instance: Instance) => {
  created = instance;
};

/** a group the functions work on: a handle from a script, an instance id or the selection */
export type Target = GroupHandle | number | 'selection' | undefined;

const instancesOf = (api: ScriptApi, target: Target): Instance[] => {
  const entities = api.editor.entities;
  if (typeof target === 'number') {
    const instance = entities.instances.get(target);
    return instance ? [instance] : [];
  }
  if (target && typeof target === 'object' && 'inst' in target) {
    return [target.inst];
  }
  return api.editor
    .selected()
    .filter((entityRef) => entityRef.kind === 'instance')
    .map((entityRef) => entities.instances.get(entityRef.id))
    .filter((instance): instance is Instance => !!instance);
};

/** the height grid of a terrain group (made here or with the Terrain tool), or undefined */
export const terrainGridOf = (instance: Instance) => readGrid(instance);

/** soften every gentle fold – the terrain plugin does the same after baking, so lines don't zigzag over the grass */
const softenFolds = (entities: Entities, maxDegrees: number) => {
  const limit = Math.cos((maxDegrees * Math.PI) / 180);
  for (const edge of entities.edges.values()) {
    const faces = entities.facesOfEdge(edge.id);
    if (faces.length === 2 && entities.faceNormal(faces[0]).dot(entities.faceNormal(faces[1])) > limit) {
      edge.soft = true;
    }
  }
};

/** removes every face and edge of a group (its nested groups stay) */
export const clearGeometry = (entities: Entities) => {
  for (const id of [...entities.faces.keys()]) {
    entities.removeFace(id);
  }
  for (const id of [...entities.edges.keys()]) {
    entities.eraseEdge(id, false);
  }
  entities.removeOrphanVertices();
};

/** the grid's faces into a group's entities, with the terrain plugin's materials from the app's library */
export const buildGrid = (api: ScriptApi, entities: Entities, grid: TerrainGrid) => {
  for (const name of Object.values(MATERIALS)) {
    api.ensureMaterial(name);
  }
  pluginContext().meshes.build(entities, gridMesh(grid), { smooth: 0 });
  // level stretches (a dug bed, a levelled road) become one face – the lines between their triangles go
  for (const edge of [...entities.edges.values()]) {
    if (!entities.facesOfEdge(edge.id).length) {
      entities.eraseEdge(edge.id, false);
    }
  }
  entities.removeOrphanVertices();
  softenFolds(entities, 60);
};

/** keeps the grid on the group in the terrain plugin's format, so the Terrain tool can sculpt it */
export const storeGrid = (instance: Instance, grid: TerrainGrid) => writeGrid(instance, grid);

type Length = number | string;
export interface TerrainCall extends Partial<Omit<TerrainSettings, 'width' | 'depth' | 'height' | 'scale' | 'water' | 'snow' | 'rock'>> {
  width?: Length;
  depth?: Length;
  height?: Length;
  scale?: Length;
  water?: Length | null;
  snow?: Length | null;
  rock?: Length | null;
  /** corner of the terrain (lowest x and y) */
  at?: Pt;
  name?: string;
  /** instance id of a noise terrain to replace (keeps its place and name) */
  replace?: number;
}

const optionalLength = (api: ScriptApi, value: Length | null | undefined) => (value == null ? value : api.length(value));

/** the settings of a noise terrain from a call (lengths may be strings with units) */
export const terrainSettingsOf = (api: ScriptApi, call: TerrainCall) =>
  normaliseSettings({
    ...call,
    width: optionalLength(api, call.width) ?? undefined,
    depth: optionalLength(api, call.depth) ?? undefined,
    height: optionalLength(api, call.height) ?? undefined,
    scale: optionalLength(api, call.scale) ?? undefined,
    water: optionalLength(api, call.water) ?? null,
    snow: optionalLength(api, call.snow) ?? null,
    rock: optionalLength(api, call.rock) ?? null,
  });

/** s3d.noiseTerrain – a terrain from noise; returns the group */
export const noiseTerrain = (api: ScriptApi, call: TerrainCall = {}): GroupHandle => {
  const settings = terrainSettingsOf(api, call);
  const grid = makeGrid(settings);
  const replaced = call.replace != null ? api.editor.entities.instances.get(call.replace) : undefined;
  const name = call.name ?? replaced?.name ?? t('noise.terrain.name');
  const group = api.group(name, (inner) => buildGrid(inner, inner.ents, grid));
  storeGrid(group.inst, grid);
  pluginContext().data.set(group.inst.definition, { settings } satisfies NoiseTerrainData);
  if (replaced) {
    group.inst.matrix.copy(replaced.matrix);
    group.inst.tag = replaced.tag;
    api.editor.entities.instances.delete(replaced.id);
  } else if (call.at) {
    group.moveTo(call.at);
  }
  created = group.inst;
  return group;
};

export interface ScatterCall {
  /**
   * where to scatter – default: the selection (edges = along a path, faces = on them, a terrain group),
   * else the newest terrain in the model
   */
  on?: Target;
  /** without a terrain: the area on the ground [x0, y0, x1, y1] (m) */
  area?: [number, number, number, number];
  /** 'conifer', 'tree', 'bush', 'rock' or names of the model's components */
  objects?: string[];
  /** average distance between two objects (m) */
  spacing?: Length;
  /** 0 … 1: how much of the area gets objects */
  density?: number;
  /** 0 … 1: how much the objects gather in clumps (woods, scree) instead of spreading evenly */
  clumping?: number;
  /** size of the clumps (m) */
  clumpSize?: Length;
  seed?: number;
  /** no objects on slopes steeper than this (degrees) */
  maxSlope?: number;
  minHeight?: Length;
  maxHeight?: Length;
  /** random size between these factors */
  sizeMin?: number;
  sizeMax?: number;
  /** at most this many objects */
  limit?: number;
  /** along selected edges: distance beside the path, on alternating sides (m) – e.g. an avenue */
  offset?: Length;
  /** along selected edges: objects face along the path instead of a random turn */
  alongPath?: boolean;
  /** on selected faces: objects stand along the face normal (walls, roofs) instead of upright */
  align?: boolean;
  name?: string;
}

const smoothstep = (low: number, high: number, value: number) => {
  const unit = Math.min(1, Math.max(0, (value - low) / (high - low)));
  return unit * unit * (3 - 2 * unit);
};

/** the newest terrain group in the current context */
const newestTerrain = (api: ScriptApi) => [...api.editor.entities.instances.values()].reverse().find((instance) => terrainGridOf(instance));

interface Placement {
  /** where the object stands (context coordinates) */
  position: THREE.Vector3;
  /** its up direction */
  up: THREE.Vector3;
  /** a direction to face (along a path) – random when missing */
  facing?: THREE.Vector3;
}

/** s3d.scatter – trees, bushes, rocks or components spread by a noise mask; returns the group holding them */
export const scatter = (api: ScriptApi, call: ScatterCall = {}): GroupHandle => {
  const { THREE } = pluginContext();
  const random = randomGenerator((call.seed ?? 1) + 0.5);
  const entities = api.editor.entities;
  const selection = call.on == null || call.on === 'selection' ? api.editor.selected() : [];
  const edges = selection
    .filter((entityRef) => entityRef.kind === 'edge')
    .map((entityRef) => entities.edges.get(entityRef.id)!)
    .filter(Boolean);
  const faces = selection
    .filter((entityRef) => entityRef.kind === 'face')
    .map((entityRef) => entities.faces.get(entityRef.id)!)
    .filter(Boolean);
  const terrain =
    call.area || edges.length || faces.length
      ? undefined
      : (instancesOf(api, call.on).find((instance) => terrainGridOf(instance)) ?? newestTerrain(api));
  const grid = terrain && terrainGridOf(terrain);
  if (!grid && !call.area && !edges.length && !faces.length) {
    throw new Error(t('noise.scatter.noTarget'));
  }
  const choices = (call.objects?.length ? call.objects : ['conifer', 'tree']).map((object) => {
    if ((OBJECT_KINDS as readonly string[]).includes(object)) {
      return objectDefinitions(api, object as ObjectKind);
    }
    const component = [...api.editor.model.definitions.values()].find((definition) => definition.name === object);
    if (!component) {
      throw new Error(t('noise.scatter.unknownObject', { name: object, allowed: OBJECT_KINDS.join(', ') }));
    }
    return [component];
  });
  const spacing = Math.max(0.05, api.length(call.spacing ?? 3));
  const density = Math.min(1, Math.max(0, call.density ?? 0.7));
  const clumping = Math.min(1, Math.max(0, call.clumping ?? 0.6));
  const clumpSize = Math.max(0.5, api.length(call.clumpSize ?? spacing * 6));
  const maxSlope = call.maxSlope ?? 32;
  const minHeight = call.minHeight != null ? api.length(call.minHeight) : -Infinity;
  const maxHeight = call.maxHeight != null ? api.length(call.maxHeight) : Infinity;
  const sizeMin = call.sizeMin ?? 0.8,
    sizeMax = Math.max(sizeMin, call.sizeMax ?? 1.25);
  const limit = Math.max(1, Math.min(5000, call.limit ?? 2000));
  const maskSeed = (call.seed ?? 1) + 5;
  const offset = api.length(call.offset ?? 0);
  const zUp = new THREE.Vector3(0, 0, 1);

  /** does a spot get an object? the density, thinned out by the clump mask (coordinates in metres) */
  const chosen = (u: number, v: number) => {
    const mask = fractal(u / clumpSize, v / clumpSize, undefined, { seed: maskSeed, octaves: 3 }) * 0.8 + 0.5;
    return random() < density * (1 - clumping + clumping * smoothstep(0.42, 0.62, mask));
  };
  const placements: Placement[] = [];
  const keep = (placement: Placement) => {
    const height = placement.position.z;
    if (height >= minHeight && height <= maxHeight && placements.length < limit) {
      placements.push(placement);
    }
  };

  if (edges.length) {
    // along a path: one spot every `spacing` metres (a little jittered), optionally beside it on alternating sides
    let side = 1;
    for (const edge of edges) {
      const start = entities.positionOf(edge.start),
        end = entities.positionOf(edge.end);
      const length = start.distanceTo(end);
      const along = end.clone().sub(start).normalize();
      const across = new THREE.Vector3(-along.y, along.x, 0);
      if (across.lengthSq() < 1e-9) {
        across.set(1, 0, 0);
      }
      across.normalize();
      for (let distance = spacing / 2; distance < length; distance += spacing) {
        const at = Math.min(length, Math.max(0, distance + (random() - 0.5) * spacing * 0.3 * clumping));
        const position = start.clone().addScaledVector(along, at);
        if (!chosen(position.x, position.y)) {
          continue;
        }
        if (offset) {
          position.addScaledVector(across, offset * side);
          side = -side;
        }
        keep({ position, up: zUp, facing: call.alongPath ? along.clone() : undefined });
      }
    }
  } else if (faces.length) {
    // on faces: a jittered grid in each face's plane, only the spots inside it
    for (const face of faces) {
      const points = entities.facePoints(face);
      const normal = entities.faceNormal(face).clone();
      const slope = (Math.acos(Math.min(1, Math.abs(normal.z))) * 180) / Math.PI;
      if (slope > maxSlope && !call.align) {
        continue;
      }
      const axisU = points[1].clone().sub(points[0]).normalize();
      const axisV = normal.clone().cross(axisU).normalize();
      const local = points.map((point) => [point.clone().sub(points[0]).dot(axisU), point.clone().sub(points[0]).dot(axisV)]);
      const minU = Math.min(...local.map((point) => point[0])),
        maxU = Math.max(...local.map((point) => point[0])),
        minV = Math.min(...local.map((point) => point[1])),
        maxV = Math.max(...local.map((point) => point[1]));
      for (let v = minV; v < maxV && placements.length < limit; v += spacing) {
        for (let u = minU; u < maxU && placements.length < limit; u += spacing) {
          const pointU = u + random() * spacing,
            pointV = v + random() * spacing;
          if (!chosen(pointU, pointV)) {
            continue;
          }
          const position = points[0].clone().addScaledVector(axisU, pointU).addScaledVector(axisV, pointV);
          if (entities.pointInFace(face, position)) {
            keep({ position, up: call.align ? normal.clone() : zUp });
          }
        }
      }
    }
  } else {
    const [x0, y0, x1, y1] = grid ? [0, 0, grid.width, grid.depth] : call.area!;
    const built = terrain ? pluginContext().data.get<NoiseTerrainData>(terrain.definition) : undefined;
    const toContext = terrain ? terrain.matrix : new THREE.Matrix4();
    // a jittered grid: one candidate per cell, so the objects keep their distance without a slow search
    for (let y = y0; y < y1 && placements.length < limit; y += spacing) {
      for (let x = x0; x < x1 && placements.length < limit; x += spacing) {
        const pointX = Math.min(x1, x + random() * spacing),
          pointY = Math.min(y1, y + random() * spacing);
        if (!chosen(pointX, pointY)) {
          continue;
        }
        let height = 0;
        if (grid) {
          const sample = sampleGrid(grid, pointX, pointY);
          if (sample.slope > maxSlope || (grid.water != null && sample.height < grid.water + 0.05)) {
            continue;
          }
          // nothing on cities, rivers and roads built on the terrain
          if (
            built?.cities?.some(
              ([cityX0, cityY0, cityX1, cityY1]) => pointX >= cityX0 && pointX <= cityX1 && pointY >= cityY0 && pointY <= cityY1,
            ) ||
            onCourse([...(built?.rivers ?? []), ...(built?.roads ?? []), ...(built?.villages ?? [])], pointX, pointY)
          ) {
            continue;
          }
          height = sample.height;
        }
        keep({ position: new THREE.Vector3(pointX, pointY, height).applyMatrix4(toContext), up: zUp });
      }
    }
  }

  if (!placements.length) {
    throw new Error(t('noise.scatter.nothing'));
  }
  // on a terrain the scattering is a step of its recipe (built again with it)
  const step = terrain && grid ? beginStep(terrain, 'scatter', { ...stepParams(call, 'on'), objects: call.objects }) : null;
  const group = api.group(call.name ?? t('noise.scatter.name'), (inner) => {
    for (const placement of placements) {
      const variants = choices[Math.floor(random() * choices.length)];
      const definition = variants[Math.floor(random() * variants.length)];
      const size = sizeMin + random() * (sizeMax - sizeMin);
      // stand up along `up`, then turn round it – at random, or to face along the path
      const stand = new THREE.Quaternion().setFromUnitVectors(zUp, placement.up);
      const angle = placement.facing ? Math.atan2(placement.facing.y, placement.facing.x) : random() * Math.PI * 2;
      const rotation = stand.multiply(new THREE.Quaternion().setFromAxisAngle(zUp, angle));
      inner.ents.addInstance(
        definition,
        new THREE.Matrix4().compose(placement.position, rotation, new THREE.Vector3(size, size, size)),
        '',
      );
    }
  });
  if (step) {
    tagOutput(group.inst, step.recipe, step.step);
    step.done();
  }
  created = group.inst;
  return group;
};

export interface DeformCall {
  /** the groups to roughen (default: the selection) */
  target?: Target;
  /** largest movement in and out (m) */
  amount?: Length;
  /** metres per bump */
  scale?: Length;
  /** edges longer than this are split first (m) – smaller = finer bumps, more faces */
  detail?: Length;
  octaves?: number;
  persistence?: number;
  mode?: NoiseMode;
  seed?: number;
  /** turn of the top against the bottom (degrees) */
  twist?: number;
  /** size of the top compared with the bottom (1 = unchanged) */
  taper?: number;
  /** how far the top bends over towards +x (degrees) */
  bend?: number;
}

/** the faces of a group as triangles in its own coordinates */
const trianglesOf = (entities: Entities): TriangleMesh => {
  const vertices: Vector[] = [];
  const triangles: [number, number, number][] = [];
  const materials: (string | null)[] = [];
  for (const face of entities.faces.values()) {
    const loop = [...face.outer, ...face.holes.flat()];
    const start = vertices.length;
    for (const vertex of loop) {
      const position = entities.positionOf(vertex);
      vertices.push([position.x, position.y, position.z]);
    }
    const indices = entities.faceTriangles(face);
    for (let corner = 0; corner + 2 < indices.length; corner += 3) {
      triangles.push([start + indices[corner], start + indices[corner + 1], start + indices[corner + 2]]);
      materials.push(face.material ?? null);
    }
  }
  return { vertices, triangles, materials };
};

/** s3d.noiseDeform – roughens groups by 3D noise and twists, tapers or bends them (terrains: noise on their height grid); returns how many groups changed (nested ones too) */
export const noiseDeform = (api: ScriptApi, call: DeformCall = {}): number => {
  const instances = instancesOf(api, call.target ?? 'selection');
  if (!instances.length) {
    throw new Error(t('noise.deform.noTarget'));
  }
  const amount = api.length(call.amount ?? 0.2);
  const scale = Math.max(0.01, api.length(call.scale ?? 1));
  const noise = { seed: call.seed ?? 1, octaves: call.octaves ?? 4, persistence: call.persistence ?? 0.5, mode: call.mode ?? 'fbm' };
  const detail = Math.max(0.01, api.length(call.detail ?? scale / 3));
  const visited = new Set<unknown>();
  let changed = 0;
  const roughen = (instance: Instance) => {
    const definition = instance.definition;
    // a component placed several times changes everywhere – but only once
    if (visited.has(definition)) {
      return;
    }
    visited.add(definition);
    const entities = definition.entities;
    const grid = terrainGridOf(instance);
    if (grid) {
      // a terrain stays a terrain: the noise goes onto its height grid, the Terrain tool keeps working on it
      const cellX = grid.width / grid.columns,
        cellY = grid.depth / grid.rows;
      for (let row = 0; row <= grid.rows; row++) {
        for (let column = 0; column <= grid.columns; column++) {
          const index = gridIndex(grid, column, row);
          const value = fractal((column * cellX) / scale, (row * cellY) / scale, undefined, noise);
          grid.heights[index] = Math.round((grid.heights[index] + value * amount * 1.6) * 1000) / 1000;
        }
      }
      clearGeometry(entities);
      buildGrid(api, entities, grid);
      storeGrid(instance, grid);
      changed++;
      return;
    }
    // groups inside (s3d.box makes one of its own) are roughened in their own coordinates
    for (const nested of entities.instances.values()) {
      roughen(nested);
    }
    const source = trianglesOf(entities);
    if (!source.triangles.length) {
      return;
    }
    // first bend (on the refined mesh, so straight faces can curve), then the noise
    const bent = bendMesh(refine(weld(source), detail), { twist: call.twist, taper: call.taper, bend: call.bend });
    const roughened = amount ? displace(bent, { ...noise, amount, scale }) : bent;
    clearGeometry(entities);
    pluginContext().meshes.build(entities, toPluginMesh(roughened), { smooth: 0 });
    softenFolds(entities, 60);
    changed++;
  };
  for (const instance of instances) {
    roughen(instance);
  }
  return changed;
};

export interface PavingCall extends Partial<Omit<PavingOptions, 'size' | 'gap' | 'thickness' | 'bevel'>> {
  /** the faces to pave – default: the selected ones */
  on?: 'selection';
  /** without selected faces: a rectangle on the ground [x0, y0, x1, y1] (m) … */
  area?: [number, number, number, number];
  /** … at this height */
  z?: Length;
  size?: Length;
  gap?: Length;
  thickness?: Length;
  bevel?: Length;
  /** the stone colour – the shades vary round it */
  color?: string;
  /** name of the stone materials (numbered per shade) – default: "Stone <colour>" */
  material?: string;
  /** a bed of mortar in the joints */
  joint?: boolean;
  name?: string;
}

/** s3d.paving – flagstones, cobbles or wall stones from cellular noise on faces or an area; returns the group */
export const paving = (api: ScriptApi, call: PavingCall = {}): GroupHandle => {
  const { THREE } = pluginContext();
  const entities = api.editor.entities;
  const options: PavingOptions = {
    ...PAVING_DEFAULTS,
    ...Object.fromEntries(Object.entries(call).filter(([, value]) => value != null)),
    size: api.length(call.size ?? PAVING_DEFAULTS.size),
    gap: api.length(call.gap ?? PAVING_DEFAULTS.gap),
    thickness: api.length(call.thickness ?? PAVING_DEFAULTS.thickness),
    bevel: api.length(call.bevel ?? PAVING_DEFAULTS.bevel),
  };
  const color = call.color ?? '#9a948a';
  const base = call.material ?? `${t('noise.paving.stone')} ${color.toUpperCase()}`;
  const shades = Math.max(1, Math.round(options.shades));
  const materials = Array.from({ length: shades }, (_, shade) => {
    const name = shades > 1 ? `${base} ${shade + 1}` : base;
    if (!api.editor.model.materials.some((material) => material.name === name)) {
      const lightness = shades > 1 ? (shade / (shades - 1) - 0.5) * 0.16 : 0;
      api.ensureMaterial(name, '#' + new THREE.Color(color).offsetHSL(0, 0, lightness).getHexString());
    }
    return name;
  });
  const mortar = t('noise.paving.mortar');
  if (call.joint && !api.editor.model.materials.some((material) => material.name === mortar)) {
    api.ensureMaterial(mortar, '#b9b2a6');
  }

  // the planes to pave: each selected face, or the rectangle on the ground
  const planes: { plane: Plane; outline: [number, number][] }[] = [];
  const faces =
    call.area || (call.on != null && call.on !== 'selection')
      ? []
      : api.editor
          .selected()
          .filter((entityRef) => entityRef.kind === 'face')
          .map((entityRef) => entities.faces.get(entityRef.id)!)
          .filter(Boolean);
  for (const face of faces) {
    const points = face.outer.map((vertex) => entities.positionOf(vertex));
    const normal = entities.faceNormal(face);
    const axisU = points[1].clone().sub(points[0]).normalize();
    const axisV = normal.clone().cross(axisU).normalize();
    const origin = points[0];
    planes.push({
      plane: { origin: origin.toArray(), u: axisU.toArray(), v: axisV.toArray(), normal: normal.toArray() },
      outline: points.map((point) => [point.clone().sub(origin).dot(axisU), point.clone().sub(origin).dot(axisV)]),
    });
  }
  if (!faces.length) {
    if (!call.area) {
      throw new Error(t('noise.paving.noTarget'));
    }
    const [x0, y0, x1, y1] = call.area;
    planes.push({
      plane: { origin: [Math.min(x0, x1), Math.min(y0, y1), api.length(call.z ?? 0)], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] },
      outline: [
        [0, 0],
        [Math.abs(x1 - x0), 0],
        [Math.abs(x1 - x0), Math.abs(y1 - y0)],
        [0, Math.abs(y1 - y0)],
      ],
    });
  }

  const group = api.group(call.name ?? t('noise.paving.name'), (inner) => {
    for (const { plane, outline } of planes) {
      const stones = translated(() => pavingStones(outline, options));
      const mesh = pavingMesh(
        stones,
        plane,
        options.bevel,
        (shade) => materials[shade % materials.length],
        call.joint ? { outline, material: mortar } : null,
      );
      pluginContext().meshes.build(inner.ents, mesh, { smooth: 0 });
    }
    softenFolds(inner.ents, 50);
  });
  if (!group.entities.faces.size) {
    throw new Error(t('noise.paving.nothing'));
  }
  created = group.inst;
  return group;
};

// ------------------------------------------------------------ facades and cities

/** the facade materials – created with their colours when the model does not have them yet */
const facadeMaterials = (): FacadeMaterials => {
  const context = pluginContext();
  const material = (key: string, color: string) => context.materials.ensure(t(`noise.facade.materials.${key}`), { color });
  return {
    frame: material('frame', '#f1efe9'),
    glass: material('glass', '#34444f'),
    litGlass: material('litGlass', '#e9d39a'),
    shutter: material('shutter', '#5b7a62'),
    balcony: material('balcony', '#d3cec5'),
    railing: material('railing', '#3b3f45'),
    door: material('door', '#6b4a33'),
  };
};

export interface FacadeCall extends Partial<FacadeOptions> {
  /** the walls: a face or a group (all its walls) from a script, a group's instance id – default: the selected faces */
  on?: FaceHandle | GroupHandle | number | 'selection';
  name?: string;
}

/** a wall in context coordinates: its plane (u along, v up, h out), size and outline in the plane */
interface Wall {
  plane: Plane;
  width: number;
  height: number;
  outline: [number, number][];
}

/** the vertical faces of `entities` as walls, placed by `matrix` into the context */
const wallsOf = (entities: Entities, faces: Face[], matrix: THREE.Matrix4): Wall[] => {
  const { THREE } = pluginContext();
  const walls: Wall[] = [];
  for (const face of faces) {
    const normal = entities.faceNormal(face).clone().transformDirection(matrix);
    if (Math.abs(normal.z) > 0.3) {
      continue;
    }
    const points = face.outer.map((vertex) => entities.positionOf(vertex).clone().applyMatrix4(matrix));
    const flat = wallPlane([0, 0, 0], [normal.x, normal.y, 0]);
    const axis = new THREE.Vector3(...flat.u);
    const along = points.map((point) => point.dot(axis));
    const minU = Math.min(...along),
      maxU = Math.max(...along);
    const minZ = Math.min(...points.map((point) => point.z)),
      maxZ = Math.max(...points.map((point) => point.z));
    // the plane's origin: the wall's lower left corner, a hair in front of it (so nothing flickers)
    const origin = points[0]
      .clone()
      .addScaledVector(axis, minU - points[0].dot(axis))
      .setZ(minZ)
      .addScaledVector(new THREE.Vector3(...flat.normal), 0.003);
    walls.push({
      plane: { ...flat, origin: origin.toArray() },
      width: maxU - minU,
      height: maxZ - minZ,
      outline: points.map((point, index) => [along[index] - minU, point.z - minZ]),
    });
  }
  return walls;
};

/** s3d.facade – windows, balconies, shutters and a ground floor on walls; returns the group */
export const facade = (api: ScriptApi, call: FacadeCall = {}): GroupHandle => {
  const { THREE } = pluginContext();
  const entities = api.editor.entities;
  const options: FacadeOptions = { ...FACADE_DEFAULTS, ...Object.fromEntries(Object.entries(call).filter(([, value]) => value != null)) };
  const walls: Wall[] = [];
  const target = call.on;
  const instance =
    typeof target === 'number'
      ? entities.instances.get(target)
      : target && typeof target === 'object' && 'inst' in target
        ? target.inst
        : undefined;
  if (instance) {
    // every wall of a group (a building made with s3d.box …)
    walls.push(...wallsOf(instance.definition.entities, [...instance.definition.entities.faces.values()], instance.matrix));
  } else if (target && typeof target === 'object' && !('inst' in target)) {
    const face = target.ents.faces.get(target.id);
    if (face) {
      walls.push(...wallsOf(target.ents, [face], new THREE.Matrix4()));
    }
  } else {
    const faces = api.editor
      .selected()
      .filter((entityRef) => entityRef.kind === 'face')
      .map((entityRef) => entities.faces.get(entityRef.id)!)
      .filter(Boolean);
    walls.push(...wallsOf(entities, faces, new THREE.Matrix4()));
  }
  if (!walls.length) {
    throw new Error(t('noise.facade.noTarget'));
  }
  const materials = facadeMaterials();
  const group = api.group(call.name ?? t('noise.facade.name'), (inner) => {
    for (const [index, wall] of walls.entries()) {
      // every wall its own variation of the same rules
      const fits = (u0: number, v0: number, u1: number, v1: number) =>
        (
          [
            [u0, v0],
            [u1, v0],
            [u1, v1],
            [u0, v1],
          ] as [number, number][]
        ).every((corner) => inside(wall.outline, corner));
      const builder = facadeMesh(wall.plane, wall.width, wall.height, { ...options, seed: options.seed + index * 13 }, materials, fits);
      if (!builder.isEmpty()) {
        pluginContext().meshes.build(inner.ents, builder.mesh(), { smooth: 0 });
      }
    }
  });
  if (!group.entities.faces.size) {
    throw new Error(t('noise.facade.nothing'));
  }
  created = group.inst;
  return group;
};

export interface CityCall extends Partial<CityOptions> {
  /** the corner of the city (lowest x and y) */
  at?: Pt;
  /** a terrain to build on – the city fits it (unless width and depth are given), its blocks become terraces */
  on?: Target;
  /** 0 … 1: how much the terrain's slopes are eased under the city */
  flatten?: number;
  /** streets and pavements as faces under the buildings */
  ground?: boolean;
  name?: string;
}

/** the facade styles of a city: colour and window pattern, drawn by the facade shader */
const CITY_STYLES = [
  { color: '#d8cdbd', params: { bay: 0.8, windowWidth: 0.55, windowHeight: 0.5 } },
  { color: '#b7c0c7', params: { bay: 0.5, windowWidth: 0.8, windowHeight: 0.62 } },
  { color: '#c58f6c', params: { bay: 0.9, windowWidth: 0.45, windowHeight: 0.48 } },
  { color: '#e6e3dc', params: { bay: 0.65, windowWidth: 0.6, windowHeight: 0.55 } },
  { color: '#8f9aa3', params: { bay: 0.45, windowWidth: 0.9, windowHeight: 0.7 } },
];

/** the roof materials of pitched roofs: tiles and slate */
const ROOF_COLOURS = ['#a4553b', '#545a61', '#8a4a36'];

let cityBuildings = 0;
/** how many buildings the last s3d.city put up – the panel tells the user */
export const lastCityBuildings = () => cityBuildings;

/** s3d.city – streets, blocks and buildings whose heights follow a noise density map; returns the group */
export const city = (api: ScriptApi, call: CityCall = {}): GroupHandle => {
  const context = pluginContext();
  const options: CityOptions = { ...CITY_DEFAULTS, ...Object.fromEntries(Object.entries(call).filter(([, value]) => value != null)) };
  options.maxFloors = Math.max(options.minFloors, options.maxFloors);
  // on a terrain the city takes its size (a street's width from the border), or at most it
  const terrain = call.on != null ? terrainFor(api, call.on) : null;
  const terrainGrid = terrain ? terrainGridOf(terrain)! : null;
  if (terrainGrid) {
    const margin = Math.max(4, options.street);
    options.width = Math.max(10, Math.min(call.width ?? Infinity, terrainGrid.width - 2 * margin));
    options.depth = Math.max(10, Math.min(call.depth ?? Infinity, terrainGrid.depth - 2 * margin));
  }
  const { blocks, buildings, trees, markings, sidewalk } = planCity(options, CITY_STYLES.length, ROOF_COLOURS.length);
  if (!buildings.length) {
    throw new Error(t('noise.city.nothing'));
  }
  const styles = CITY_STYLES.map((style, index) =>
    context.materials.ensure(t('noise.city.materials.facade', { number: index + 1 }), {
      color: style.color,
      shader: 'noise.facade',
      params: style.params,
      size: options.floorHeight,
    }),
  );
  const roof = context.materials.ensure(t('noise.city.materials.roof'), { color: '#77787a' });
  const tiles = ROOF_COLOURS.map((color, index) =>
    context.materials.ensure(t('noise.city.materials.tiles', { number: index + 1 }), { color }),
  );
  const asphalt = context.materials.ensure(t('noise.city.materials.asphalt'), { color: '#4b4e53' });
  const pavement = context.materials.ensure(t('noise.city.materials.pavement'), { color: '#bcb8b0' });
  const lawn = context.materials.ensure(t('noise.city.materials.lawn'), { color: '#6f9e4f' });
  const marking = context.materials.ensure(t('noise.city.materials.marking'), { color: '#efefea' });
  const kerb = call.ground === false && !terrain ? 0 : 0.15;
  const offset: [number, number] = terrainGrid
    ? [(terrainGrid.width - options.width) / 2, (terrainGrid.depth - options.depth) / 2]
    : [0, 0];
  let land: CityGround = FLAT_GROUND;
  const step = terrain ? beginStep(terrain, 'city', { ...stepParams(call, 'on', 'at'), flatten: call.flatten }) : null;
  if (terrain && terrainGrid) {
    const levelled = terrainGround(
      terrainGrid,
      blocks,
      offset,
      options.width,
      options.depth,
      Math.min(1, Math.max(0, call.flatten ?? 0.7)),
      kerb,
    );
    rebuildTerrain(api, terrain, levelled.grid);
    land = levelled.ground;
    const area: [number, number, number, number] = [
      offset[0] - 1,
      offset[1] - 1,
      offset[0] + options.width + 1,
      offset[1] + options.depth + 1,
    ];
    remember(terrain, (data) => ({ ...data, cities: [...(data.cities ?? []), area] }));
  }
  const blockAt = (x: number, y: number) =>
    blocks.findIndex((block) => x >= block.x && x <= block.x + block.width && y >= block.y && y <= block.y + block.depth);
  /** the height things stand on: a block's terrace, else the street */
  const standAt = (x: number, y: number) => {
    const block = blockAt(x, y);
    return block >= 0 ? land.terrace(block) : land.streetAt(x, y);
  };
  const wall = context.materials.ensure(t('noise.city.materials.wall'), { color: '#9b9284' });
  const ground: Plane = { origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] };
  // the trees are components – built once per model, placed as often as needed
  const treeKinds = trees.length
    ? { street: objectDefinitions(api, 'tree'), park: [...objectDefinitions(api, 'tree'), ...objectDefinitions(api, 'conifer')] }
    : null;
  const { THREE } = context;

  const group = api.group(call.name ?? t('noise.city.name'), (inner) => {
    if (call.ground !== false || terrain) {
      const streets = meshBuilder(ground);
      if (land.streets.length) {
        for (const triangle of land.streets) {
          streets.facet(triangle, asphalt);
        }
        for (const face of land.walls) {
          streets.facet(face, wall);
        }
      } else {
        streets.quad(0, 0, options.width, options.depth, 0, asphalt);
      }
      // markings follow the street's slope at each corner
      for (const [x0, y0, x1, y1] of markings) {
        const corners: [number, number][] = [
          [x0, y0],
          [x1, y0],
          [x1, y1],
          [x0, y1],
        ];
        streets.facet(
          corners.map(([x, y]) => [x, y, land.streetAt(x, y) + (terrain ? 0.04 : 0.02)]),
          marking,
        );
      }
      for (const [index, block] of blocks.entries()) {
        const top = land.terrace(index) + kerb;
        // on a terrain the block's sides are retaining walls down below the streets around it
        streets.box(
          block.x,
          block.y,
          land.footing(index),
          block.x + block.width,
          block.y + block.depth,
          top,
          terrain ? wall : pavement,
          pavement,
          false,
        );
        if (!block.park) {
          continue;
        }
        // a park: the pavement round it, four lawns and a cross of paths between them
        const x0 = block.x + sidewalk,
          y0 = block.y + sidewalk,
          x1 = block.x + block.width - sidewalk,
          y1 = block.y + block.depth - sidewalk;
        const middleX = (x0 + x1) / 2,
          middleY = (y0 + y1) / 2,
          path = 1.5;
        for (const [u0, v0, u1, v1] of [
          [x0, y0, middleX - path, middleY - path],
          [middleX + path, y0, x1, middleY - path],
          [x0, middleY + path, middleX - path, y1],
          [middleX + path, middleY + path, x1, y1],
        ]) {
          streets.box(u0, v0, top, u1, v1, top + 0.08, lawn, lawn, false);
        }
      }
      // on a terrain the street's triangles fold gently – soft there, walls and kerbs stay hard
      context.meshes.build(inner.ents, streets.mesh(), { smooth: terrain ? 25 : 0 });
    }
    for (const building of buildings) {
      const height = building.floors * options.floorHeight;
      const base = standAt(building.x + building.width / 2, building.y + building.depth / 2) + kerb;
      // built round its own corner and moved there – the facade shader draws the storeys from the group's origin
      const house = inner.group(t('noise.city.building', { floors: building.floors }), (houseApi) => {
        const parts = meshBuilder(ground);
        const facadeMaterial = styles[building.style];
        if (building.setback) {
          const lower = building.setback * options.floorHeight;
          const insetX = building.width * 0.15,
            insetY = building.depth * 0.15;
          parts.box(0, 0, 0, building.width, building.depth, lower, facadeMaterial, roof, false);
          parts.box(insetX, insetY, lower, building.width - insetX, building.depth - insetY, height, facadeMaterial, roof, false);
        } else if (building.roof === 'flat') {
          parts.box(0, 0, 0, building.width, building.depth, height, facadeMaterial, roof, false);
        } else {
          // the gable triangles get the facade's material, so the shader draws on in the attic
          const halfSpan = (building.ridgeAlongX ? building.depth : building.width) / 2;
          const rise = Math.min(7, halfSpan * Math.tan(((building.roof === 'hip' ? 32 : 38) * Math.PI) / 180));
          parts.box(0, 0, 0, building.width, building.depth, height, facadeMaterial, roof, false);
          parts.pitched(
            0,
            0,
            building.width,
            building.depth,
            height,
            rise,
            building.ridgeAlongX,
            building.roof,
            facadeMaterial,
            tiles[building.roofStyle],
          );
        }
        if (building.roofBox) {
          const size = Math.min(building.width, building.depth) * 0.3;
          const centreX = building.width / 2,
            centreY = building.depth / 2;
          parts.box(
            centreX - size / 2,
            centreY - size / 2,
            height,
            centreX + size / 2,
            centreY + size / 2,
            height + 2.6,
            roof,
            roof,
            false,
          );
        }
        context.meshes.build(houseApi.ents, parts.mesh(), { smooth: 0 });
      });
      house.inst.matrix.makeTranslation(building.x, building.y, base);
    }
    if (treeKinds) {
      const random = randomGenerator(options.seed + 0.75);
      inner.group(t('noise.city.trees'), (planted) => {
        for (const spot of trees) {
          const variants = treeKinds[spot.kind];
          const definition = variants[Math.floor(random() * variants.length)];
          // the small trees are about 4 m tall
          const scale = spot.size * 1.5;
          planted.ents.addInstance(
            definition,
            new THREE.Matrix4().compose(
              new THREE.Vector3(spot.x, spot.y, standAt(spot.x, spot.y) + kerb + (spot.kind === 'park' ? 0.08 : 0)),
              new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (spot.rotation * Math.PI) / 180),
              new THREE.Vector3(scale, scale, scale),
            ),
            '',
          );
        }
      });
    }
  });
  if (terrain) {
    group.inst.matrix.copy(terrain.matrix.clone().multiply(new THREE.Matrix4().makeTranslation(offset[0], offset[1], 0)));
  } else if (call.at) {
    group.moveTo(call.at);
  }
  if (step) {
    tagOutput(group.inst, step.recipe, step.step);
    step.done();
  }
  cityBuildings = buildings.length;
  created = group.inst;
  return group;
};

// ------------------------------------------------------------ rivers and roads

/** the terrain a river or road goes on: the given one, a selected one or the newest */
export const terrainFor = (api: ScriptApi, target: Target): Instance => {
  const terrain = instancesOf(api, target ?? 'selection').find((instance) => terrainGridOf(instance)) ?? newestTerrain(api);
  if (!terrain) {
    throw new Error(t('noise.routes.noTarget'));
  }
  return terrain;
};

const vectorOf = (point: Pt) => {
  const { THREE } = pluginContext();
  return Array.isArray(point) ? new THREE.Vector3(point[0], point[1], point[2] ?? 0) : new THREE.Vector3(point.x, point.y, point.z ?? 0);
};

/** a point of the current context in the terrain grid's coordinates */
const gridPoint = (terrain: Instance, point: Pt | THREE.Vector3): Point2 => {
  const local = ('isVector3' in point ? point.clone() : vectorOf(point)).applyMatrix4(terrain.matrix.clone().invert());
  return [local.x, local.y];
};

/** while a recipe is built again, the terrains' faces wait for the last step – only the grid changes on the way */
let geometryWaits = false;
export const holdTerrainGeometry = (hold: boolean) => {
  geometryWaits = hold;
};

/** the terrain's faces built anew from a changed grid, which is stored for the Terrain tool */
const rebuildTerrain = (api: ScriptApi, terrain: Instance, grid: TerrainGrid) => {
  storeGrid(terrain, grid);
  if (!geometryWaits) {
    clearGeometry(terrain.definition.entities);
    buildGrid(api, terrain.definition.entities, grid);
  }
};

/** a group with a mesh in the grid's coordinates, placed where the terrain is */
let routeLength = 0;
/** how long the last river or road was (m) – the panel tells the user */
export const lastRouteLength = () => routeLength;

const besideTerrain = (api: ScriptApi, terrain: Instance, name: string, mesh: PluginMesh) => {
  const group = api.group(name, (inner) => pluginContext().meshes.build(inner.ents, mesh, { smooth: 80 }));
  group.inst.matrix.copy(terrain.matrix);
  created = group.inst;
  return group;
};

export interface RiverCall extends Partial<Omit<RiverOptions, 'width' | 'depth'>> {
  /** the terrain (default: the selected one, else the newest) */
  target?: Target;
  width?: Length;
  depth?: Length;
  /** where the river starts and ends (default: high on the border to the lowest spot of it) */
  from?: Pt;
  to?: Pt;
  name?: string;
  /** `from` and `to` are in the terrain grid's coordinates (as a recipe keeps them) */
  local?: boolean;
}

/** s3d.river – a river over a terrain: digs its bed into the terrain and fills it with water; returns the water group */
export const river = (api: ScriptApi, call: RiverCall = {}): GroupHandle => {
  const terrain = terrainFor(api, call.target);
  const options: RiverOptions = {
    ...RIVER_DEFAULTS,
    ...Object.fromEntries(Object.entries(call).filter(([key, value]) => value != null && key in RIVER_DEFAULTS)),
    width: Math.max(0.2, api.length(call.width ?? RIVER_DEFAULTS.width)),
    depth: Math.max(0.1, api.length(call.depth ?? RIVER_DEFAULTS.depth)),
  };
  api.ensureMaterial(MATERIALS.water);
  const local = (point: Pt): Point2 => (call.local && Array.isArray(point) ? [point[0], point[1]] : gridPoint(terrain, point));
  const ends = call.from && call.to ? [local(call.from), local(call.to)] : [];
  const step = beginStep(terrain, 'river', { ...stepParams(call, 'target', 'local'), from: ends[0], to: ends[1], local: true });
  const result = riverOn(terrainGridOf(terrain)!, options, MATERIALS.water, ends[0], ends[1]);
  rebuildTerrain(api, terrain, result.grid);
  remember(terrain, (data) => ({ ...data, rivers: [...(data.rivers ?? []), result.course] }));
  routeLength = result.length;
  const group = besideTerrain(api, terrain, call.name ?? t('noise.river.name'), result.water);
  tagOutput(group.inst, step.recipe, step.step);
  step.done();
  return group;
};

export interface RoadCall extends Partial<Omit<RoadOptions, 'width'>> {
  /** the terrain (default: the selected one, else the newest) */
  target?: Target;
  width?: Length;
  /** the road's ends – it finds its own way between them */
  from?: Pt;
  to?: Pt;
  /** or the points it follows */
  along?: Pt[];
  name?: string;
  /** the lines in the terrain grid's coordinates (as a recipe keeps them) – instead of along, from/to or the selection */
  lines?: Point2[][];
}

/** the selected edges joined into lines (each run of connected edges one line, context coordinates) */
const selectedLines = (api: ScriptApi) => {
  const entities = api.editor.entities;
  const unused = new Set(
    api.editor
      .selected()
      .filter((entityRef) => entityRef.kind === 'edge')
      .map((entityRef) => entities.edges.get(entityRef.id))
      .filter((edge): edge is NonNullable<typeof edge> => !!edge),
  );
  const touching = (vertex: number) => [...unused].filter((edge) => edge.start === vertex || edge.end === vertex);
  const lines: THREE.Vector3[][] = [];
  while (unused.size) {
    // start at a loose end where there is one, so a line is not cut in two
    const ends = [...unused].flatMap((edge) => [edge.start, edge.end]);
    let vertex = ends.find((candidate) => touching(candidate).length === 1) ?? ends[0];
    const line = [entities.positionOf(vertex).clone()];
    for (let edge = touching(vertex)[0]; edge; edge = touching(vertex)[0]) {
      unused.delete(edge);
      vertex = edge.start === vertex ? edge.end : edge.start;
      line.push(entities.positionOf(vertex).clone());
    }
    lines.push(line);
  }
  return lines;
};

/** s3d.road – a road or path over a terrain, cut and filled into it; returns the group with the road surface */
export const road = (api: ScriptApi, call: RoadCall = {}): GroupHandle => {
  const context = pluginContext();
  const terrain = terrainFor(api, call.target);
  const grid = terrainGridOf(terrain)!;
  const options: RoadOptions = {
    ...ROAD_DEFAULTS,
    ...Object.fromEntries(Object.entries(call).filter(([key, value]) => value != null && key in ROAD_DEFAULTS)),
    width: Math.max(0.3, api.length(call.width ?? (call.surface === 'gravel' ? 2.5 : ROAD_DEFAULTS.width))),
  };
  const lines: Point2[][] = call.lines?.length
    ? call.lines.map((line) => [...line])
    : call.along?.length
      ? [call.along.map((point) => gridPoint(terrain, point))]
      : call.from && call.to
        ? [[gridPoint(terrain, call.from), gridPoint(terrain, call.to)]]
        : selectedLines(api).map((line) => line.map((point) => gridPoint(terrain, point)));
  if (!lines.length) {
    // nothing given: across the terrain along its longer side
    lines.push(
      grid.width >= grid.depth
        ? [
            [0, grid.depth / 2],
            [grid.width, grid.depth / 2],
          ]
        : [
            [grid.width / 2, 0],
            [grid.width / 2, grid.depth],
          ],
    );
  }
  const materials = {
    surface:
      options.surface === 'gravel'
        ? context.materials.ensure(t('noise.road.materials.gravel'), { color: '#b8a98a' })
        : context.materials.ensure(t('noise.city.materials.asphalt'), { color: '#4b4e53' }),
    marking: context.materials.ensure(t('noise.city.materials.marking'), { color: '#efefea' }),
  };
  const step = beginStep(terrain, 'road', { ...stepParams(call, 'target'), lines: lines.map((line) => line.map((point) => [...point])) });
  let current = grid;
  routeLength = 0;
  const courses: Course[] = [];
  const surface: PluginMesh = { vertices: [], faces: [], faceMaterials: [] };
  for (const line of lines) {
    if (line.length < 2) {
      continue;
    }
    const built = context.data.get<NoiseTerrainData>(terrain.definition);
    const result = roadOn(current, options, line, materials, built?.rivers, [], [...(built?.roads ?? []), ...courses]);
    current = result.grid;
    routeLength += result.length;
    courses.push(result.course);
    const offset = surface.vertices.length;
    surface.vertices.push(...result.surface.vertices);
    surface.faces.push(...result.surface.faces.map((face) => face.map((index) => index + offset)));
    surface.faceMaterials!.push(...result.surface.faceMaterials!);
  }
  rebuildTerrain(api, terrain, current);
  remember(terrain, (data) => ({ ...data, roads: [...(data.roads ?? []), ...courses] }));
  const name = call.name ?? t(options.surface === 'gravel' ? 'noise.road.pathName' : 'noise.road.name');
  const group = besideTerrain(api, terrain, name, surface);
  tagOutput(group.inst, step.recipe, step.step);
  step.done();
  return group;
};

// ------------------------------------------------------------ villages

export interface VillagesCall extends Partial<Omit<VillageOptions, 'roadWidth'>> {
  /** the terrain (default: the selected one, else the newest) */
  target?: Target;
  roadWidth?: Length;
  /** the roads between the villages: 'gravel' (default), 'asphalt' or 'none' */
  roads?: RoadSurface | 'none';
  name?: string;
}

/** village houses: plaster, sandstone and stone colours with small windows, no shops */
const VILLAGE_STYLES = [
  { color: '#ece6d8', params: { bay: 0.95, windowWidth: 0.42, windowHeight: 0.45, shops: 0, lit: 0.15 } },
  { color: '#dcc7a3', params: { bay: 0.9, windowWidth: 0.45, windowHeight: 0.48, shops: 0, lit: 0.15 } },
  { color: '#c3b8a8', params: { bay: 1, windowWidth: 0.4, windowHeight: 0.42, shops: 0, lit: 0.15 } },
  { color: '#e9d9c4', params: { bay: 0.85, windowWidth: 0.44, windowHeight: 0.46, shops: 0, lit: 0.15 } },
];

let villageHouses = 0;
/** how many houses the last s3d.villages built – the panel tells the user */
export const lastVillageHouses = () => villageHouses;

/** s3d.villages – villages on a terrain, connected by roads; returns the group with the houses */
export const villages = (api: ScriptApi, call: VillagesCall = {}): GroupHandle => {
  const context = pluginContext();
  const { THREE } = context;
  const terrain = terrainFor(api, call.target);
  const grid = terrainGridOf(terrain)!;
  const options: VillageOptions = {
    ...VILLAGE_DEFAULTS,
    ...Object.fromEntries(Object.entries(call).filter(([key, value]) => value != null && key in VILLAGE_DEFAULTS)),
    roadWidth: Math.max(1, api.length(call.roadWidth ?? VILLAGE_DEFAULTS.roadWidth)),
  };
  options.count = Math.max(1, Math.min(30, Math.round(options.count)));
  options.houses = Math.max(2, Math.min(80, Math.round(options.houses)));

  // what is built on the terrain already stays free
  const built = context.data.get<NoiseTerrainData>(terrain.definition) ?? {};
  const courses = [...(built.rivers ?? []), ...(built.roads ?? []), ...(built.villages ?? [])];
  const blocked = (x: number, y: number, margin: number) =>
    !!built.cities?.some(([x0, y0, x1, y1]) => x >= x0 - margin && x <= x1 + margin && y >= y0 - margin && y <= y1 + margin) ||
    onCourse(
      courses.map((course) => ({ ...course, reach: course.reach + margin })),
      x,
      y,
    );
  const planned = planVillages(grid, options, blocked, VILLAGE_STYLES.length, ROOF_COLOURS.length);
  if (!planned.length) {
    throw new Error(t('noise.village.nothing'));
  }
  const step = beginStep(terrain, 'villages', stepParams(call, 'target'));

  const styles = VILLAGE_STYLES.map((style, index) =>
    context.materials.ensure(t('noise.village.materials.house', { number: index + 1 }), {
      color: style.color,
      shader: 'noise.facade',
      params: style.params,
      size: 2.9,
    }),
  );
  const tiles = ROOF_COLOURS.map((color, index) =>
    context.materials.ensure(t('noise.city.materials.tiles', { number: index + 1 }), { color }),
  );
  const ceiling = context.materials.ensure(t('noise.city.materials.roof'), { color: '#77787a' });
  const plinth = context.materials.ensure(t('noise.city.materials.wall'), { color: '#9b9284' });
  const surface = call.roads === 'asphalt' ? 'asphalt' : 'gravel';
  const materials = {
    surface:
      surface === 'gravel'
        ? context.materials.ensure(t('noise.road.materials.gravel'), { color: '#b8a98a' })
        : context.materials.ensure(t('noise.city.materials.asphalt'), { color: '#4b4e53' }),
    marking: context.materials.ensure(t('noise.city.materials.marking'), { color: '#efefea' }),
  };

  // the village streets first, then the roads between the villages – around the other villages where they can
  let current = grid;
  const surfaces: PluginMesh = { vertices: [], faces: [], faceMaterials: [] };
  const newCourses: Course[] = [];
  const lay = (result: ReturnType<typeof roadOn>) => {
    current = result.grid;
    const offset = surfaces.vertices.length;
    surfaces.vertices.push(...result.surface.vertices);
    surfaces.faces.push(...result.surface.faces.map((face) => face.map((index) => index + offset)));
    surfaces.faceMaterials!.push(...result.surface.faceMaterials!);
    newCourses.push(result.course);
  };
  const streetOptions: RoadOptions = {
    ...ROAD_DEFAULTS,
    width: options.roadWidth,
    surface,
    markings: false,
    maxGrade: 14,
    seed: options.seed,
  };
  for (const village of planned) {
    for (const street of village.streets) {
      lay(roadOn(current, streetOptions, street, materials, built.rivers, [], [...(built.roads ?? []), ...newCourses]));
    }
  }
  const circles: Course[] = planned.map((village) => ({ line: [village.centre, village.centre], reach: village.radius * 0.85 }));
  if (call.roads !== 'none') {
    for (const [from, to] of villageLinks(planned)) {
      // from the street end of one village nearest to the other, and back – going on from that street
      const nearest = (village: number, other: number) => {
        const [otherX, otherY] = planned[other].centre;
        const [centreX, centreY] = planned[village].centre;
        return planned[village].streets
          .flatMap((street) => [street[0], street[street.length - 1]])
          .filter(([x, y]) => Math.hypot(x - centreX, y - centreY) > 1)
          .reduce((best, end) =>
            Math.hypot(end[0] - otherX, end[1] - otherY) < Math.hypot(best[0] - otherX, best[1] - otherY) ? end : best,
          );
      };
      lay(
        roadOn(
          current,
          { ...streetOptions, maxGrade: 10, markings: surface === 'asphalt', width: options.roadWidth * (surface === 'asphalt' ? 1.4 : 1) },
          [nearest(from, to), nearest(to, from)],
          materials,
          built.rivers,
          circles.filter((_, index) => index !== from && index !== to),
          [...(built.roads ?? []), ...newCourses],
        ),
      );
    }
  }
  rebuildTerrain(api, terrain, current);
  remember(terrain, (data) => ({
    ...data,
    roads: [...(data.roads ?? []), ...newCourses],
    villages: [...(data.villages ?? []), ...circles],
  }));
  tagOutput(
    besideTerrain(api, terrain, t(surface === 'gravel' ? 'noise.road.pathName' : 'noise.road.name'), surfaces).inst,
    step.recipe,
    step.step,
  );

  // the houses on the dug terrain: each on a plinth down to its lowest corner, built round its own centre
  const group = api.group(call.name ?? t('noise.village.groupName'), (inner) => {
    planned.forEach((village, villageIndex) => {
      inner.group(t('noise.village.name', { number: villageIndex + 1 }), (place) => {
        for (const house of village.houses) {
          const along: [number, number] = [Math.cos(house.angle), Math.sin(house.angle)];
          const corners = [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
          ].map(([u, v]) => {
            const x = house.x + (along[0] * u * house.width - along[1] * v * house.depth) / 2,
              y = house.y + (along[1] * u * house.width + along[0] * v * house.depth) / 2;
            return sampleGrid(current, x, y).height;
          });
          const base = Math.max(...corners) + 0.2;
          const lowest = Math.min(...corners) - 0.3;
          const height = house.floors * 2.9;
          const halfSpan = house.depth / 2;
          const rise = halfSpan * Math.tan(((house.roof === 'hip' ? 34 : 42) * Math.PI) / 180);
          const handle = place.group(t('noise.village.house'), (houseApi) => {
            const parts = meshBuilder({ origin: [0, 0, 0], u: [1, 0, 0], v: [0, 1, 0], normal: [0, 0, 1] });
            const [u0, v0, u1, v1] = [-house.width / 2, -house.depth / 2, house.width / 2, house.depth / 2];
            parts.box(u0, v0, lowest - base, u1, v1, 0, plinth, plinth, true);
            parts.box(u0, v0, 0, u1, v1, height, styles[house.style], ceiling, false);
            parts.pitched(u0, v0, u1, v1, height, rise, true, house.roof, styles[house.style], tiles[house.roofStyle]);
            context.meshes.build(houseApi.ents, parts.mesh(), { smooth: 0 });
          });
          handle.inst.matrix.compose(
            new THREE.Vector3(house.x, house.y, base),
            new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), house.angle),
            new THREE.Vector3(1, 1, 1),
          );
        }
      });
    });
  });
  group.inst.matrix.copy(terrain.matrix);
  tagOutput(group.inst, step.recipe, step.step);
  step.done();
  villageHouses = planned.reduce((sum, village) => sum + village.houses.length, 0);
  created = group.inst;
  return group;
};

// ------------------------------------------------------------ trees and erosion

/**
 * A script handle for an instance placed directly. The script API only hands out handles for what it makes
 * itself, so the class is taken from an empty group that is removed again at once.
 */
export const handleFor = (api: ScriptApi, instance: Instance): GroupHandle => {
  const probe = api.group('', () => undefined);
  api.ents.instances.delete(probe.inst.id);
  api.editor.model.definitions.delete(probe.inst.definition.id);
  const Handle = probe.constructor as new (scriptApi: ScriptApi, parent: Entities, inst: Instance) => GroupHandle;
  return new Handle(api, api.ents, instance);
};

export interface TreeCall extends Partial<Omit<TreeOptions, 'height'>> {
  height?: Length;
  /** where the tree stands */
  at?: Pt;
  /** turn round the vertical axis (degrees) */
  rotation?: number;
}

interface TreeData {
  tree: TreeOptions;
}

/** s3d.tree – grows a tree as a component (the same settings reuse the same component); returns the placed tree */
export const tree = (api: ScriptApi, call: TreeCall = {}): GroupHandle => {
  const context = pluginContext();
  const options: TreeOptions = {
    ...TREE_DEFAULTS,
    ...Object.fromEntries(Object.entries(call).filter(([key, value]) => value != null && key in TREE_DEFAULTS)),
    height: Math.max(0.5, api.length(call.height ?? TREE_DEFAULTS.height)),
  };
  if (!(TREE_SPECIES as readonly string[]).includes(options.species)) {
    throw new Error(t('noise.tree.unknownSpecies', { name: options.species, allowed: TREE_SPECIES.join(', ') }));
  }
  const key = JSON.stringify(options);
  let definition = [...api.editor.model.definitions.values()].find(
    (candidate) => JSON.stringify(context.data.get<TreeData>(candidate)?.tree) === key,
  );
  if (!definition) {
    ensureObjectMaterials(api);
    const name = api.editor.model.uniqueDefName(t(`noise.objects.${options.species}`));
    definition = api.component(name, (inner) => {
      context.meshes.build(inner.ents, toPluginMesh(treeMesh(options)), { smooth: 50 });
    }).def;
    context.data.set(definition, { tree: options } satisfies TreeData);
  }
  const { THREE } = context;
  const at = call.at ? (Array.isArray(call.at) ? call.at : [call.at.x, call.at.y, call.at.z]) : [0, 0, 0];
  const matrix = new THREE.Matrix4().compose(
    new THREE.Vector3(at[0], at[1], at[2] ?? 0),
    new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ((call.rotation ?? 0) * Math.PI) / 180),
    new THREE.Vector3(1, 1, 1),
  );
  const instance = api.ents.addInstance(definition, matrix, '');
  created = instance;
  return handleFor(api, instance);
};

export interface ErodeCall extends Partial<ErosionOptions> {
  /** the terrains (default: the selection) */
  target?: Target;
}

/** s3d.erode – hydraulic erosion on terrains (noise terrains or ones from the Terrain tool); returns how many changed */
export const erodeTerrain = (api: ScriptApi, call: ErodeCall = {}): number => {
  const terrains = instancesOf(api, call.target ?? 'selection').filter((instance) => terrainGridOf(instance));
  if (!terrains.length) {
    throw new Error(t('noise.erosion.noTarget'));
  }
  const options: ErosionOptions = {
    ...EROSION_DEFAULTS,
    ...Object.fromEntries(Object.entries(call).filter(([key, value]) => value != null && key in EROSION_DEFAULTS)),
  };
  for (const instance of terrains) {
    const step = beginStep(instance, 'erode', { ...options });
    rebuildTerrain(api, instance, erode(terrainGridOf(instance)!, options));
    step.done();
  }
  return terrains.length;
};

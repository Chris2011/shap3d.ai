import type { Entities, Instance } from '../../../src/core/model';
import type * as THREE from 'three';
import type { GroupHandle, Pt, ScriptApi } from '../../../src/scripting/api';
import { bendMesh, displace, refine, toPluginMesh, weld, type TriangleMesh, type Vector } from './mesh';
import { fractal, randomGenerator, type NoiseMode } from './noise';
import { OBJECT_KINDS, objectDefinitions, type ObjectKind } from './objects';
import { PAVING_DEFAULTS, pavingMesh, pavingStones, type Plane, type PavingOptions } from './paving';
import { pluginContext, t } from './runtime';
import {
  MATERIALS,
  TERRAIN_PLUGIN,
  gridFrom,
  gridIndex,
  gridMesh,
  makeGrid,
  normaliseSettings,
  sampleGrid,
  type TerrainGrid,
  type TerrainSettings,
} from './terrain';

/**
 * What the script functions do – s3d.noiseTerrain, s3d.scatter and s3d.noiseDeform. The panel runs them as
 * scripts too (context.script.run), so every action is one undo step and does exactly what the script would.
 */

/** the plugin's data on a noise terrain group (`pluginData.noise`) – the settings it was made with */
export interface NoiseTerrainData {
  settings: TerrainSettings;
}

let created: Instance | null = null;
/** the group the last s3d.noiseTerrain or s3d.scatter made – the panel selects it */
export const lastCreated = () => created;

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
export const terrainGridOf = (instance: Instance) => gridFrom(instance.definition.pluginData?.[TERRAIN_PLUGIN]);

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
const clearGeometry = (entities: Entities) => {
  for (const id of [...entities.faces.keys()]) {
    entities.removeFace(id);
  }
  for (const id of [...entities.edges.keys()]) {
    entities.eraseEdge(id, false);
  }
  entities.removeOrphanVertices();
};

/** the grid's faces into a group's entities, with the terrain plugin's materials from the app's library */
const buildGrid = (api: ScriptApi, entities: Entities, grid: TerrainGrid) => {
  for (const name of Object.values(MATERIALS)) {
    api.ensureMaterial(name);
  }
  pluginContext().meshes.build(entities, gridMesh(grid), { smooth: 0 });
  softenFolds(entities, 60);
};

/** keeps the grid on the group in the terrain plugin's format, so the Terrain tool can sculpt it */
const storeGrid = (instance: Instance, grid: TerrainGrid) => {
  instance.definition.pluginData = { ...instance.definition.pluginData, [TERRAIN_PLUGIN]: grid };
};

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

/** s3d.noiseTerrain – a terrain from noise; returns the group */
export const noiseTerrain = (api: ScriptApi, call: TerrainCall = {}): GroupHandle => {
  const settings = normaliseSettings({
    ...call,
    width: optionalLength(api, call.width) ?? undefined,
    depth: optionalLength(api, call.depth) ?? undefined,
    height: optionalLength(api, call.height) ?? undefined,
    scale: optionalLength(api, call.scale) ?? undefined,
    water: optionalLength(api, call.water) ?? null,
    snow: optionalLength(api, call.snow) ?? null,
    rock: optionalLength(api, call.rock) ?? null,
  });
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
          height = sample.height;
        }
        keep({ position: new THREE.Vector3(pointX, pointY, height).applyMatrix4(toContext), up: zUp });
      }
    }
  }

  if (!placements.length) {
    throw new Error(t('noise.scatter.nothing'));
  }
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
      const stones = pavingStones(outline, options);
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

import type { Definition, Entities, Instance } from '../../../src/core/model';
import { TERRAIN_FORMAT, gridFrom, type Course, type RiverCourse, type TerrainSettings, type TerrainGrid } from '@shap3d/procgen';
import { pluginContext } from './runtime';

/**
 * Recipes: what was built on a terrain, step by step, so it can be built again – after the noise terrain's
 * settings changed, after a step was switched off or given another seed. Every step keeps the options of its call
 * in the terrain's own coordinates; everything a step makes (water, road surfaces, cities, villages, scattered
 * objects) carries the recipe's and the step's id, so building again first removes it.
 */

export type StepKind = 'erode' | 'river' | 'road' | 'city' | 'villages' | 'scatter' | 'sculpt';

export interface RecipeStep {
  id: string;
  kind: StepKind;
  /** the call's options – points in the terrain grid's coordinates */
  params: Record<string, unknown>;
  enabled: boolean;
}

/**
 * The plugin's data on a terrain group (`pluginData.noise`): the settings a noise terrain was made with, what is
 * built on it (rivers, roads, cities, villages – others keep away from them) and the recipe that built it.
 */
export interface NoiseTerrainData {
  settings?: TerrainSettings;
  rivers?: RiverCourse[];
  roads?: Course[];
  /** the areas cities were built on (grid coordinates x0, y0, x1, y1) */
  cities?: [number, number, number, number][];
  /** the villages built on it (a centre and a reach) */
  villages?: Course[];
  /** the recipe's id – the things it made carry it */
  recipe?: string;
  steps?: RecipeStep[];
  /** the heights before the first step – only for terrains that are not made from settings (Terrain tool) */
  base?: number[];
  /** the heights the recipe gave last – a difference to them is sculpting with the Terrain tool */
  result?: number[];
}

/** on something a step made: which recipe and step */
interface OutputData {
  output: { recipe: string; step: string };
}

/** a terrain group – or just its definition, where the grid and the recipe live */
type TerrainRef = Pick<Instance, 'definition'>;

export const terrainData = (terrain: TerrainRef) => pluginContext().data.get<NoiseTerrainData>(terrain.definition) ?? {};

/** keeps something on a terrain's data */
export const remember = (terrain: TerrainRef, change: (data: NoiseTerrainData) => NoiseTerrainData) => {
  pluginContext().data.set(terrain.definition, change(terrainData(terrain)));
};

/** the definitions whose height grid this plugin wrote – their change events are its own, not sculpting */
const ownGridWrites = new Set<Definition>();

/** the height grid of a terrain (the terrain plugin's data format), or undefined */
export const readGrid = (terrain: TerrainRef) => gridFrom(pluginContext().data.read(TERRAIN_FORMAT.id, terrain.definition));

/** keeps the grid on the group in the terrain plugin's format, so the Terrain tool can sculpt it */
export const writeGrid = (terrain: TerrainRef, grid: TerrainGrid) => {
  ownGridWrites.add(terrain.definition);
  pluginContext().data.write(TERRAIN_FORMAT.id, terrain.definition, grid);
};

/** was this change of a definition's grid made by this plugin? (asks once per change) */
export const ownGridWrite = (definition: Definition) => ownGridWrites.delete(definition);

const newId = () => Math.random().toString(36).slice(2, 10);

/** while a recipe is built again: the step that runs (its outputs get its id, nothing is recorded) */
let replaying: { recipe: string; step: string } | null = null;
export const isReplaying = () => replaying !== null;

/** runs `build` as the given step of a recipe – for building again */
export const asStep = <T>(recipe: string, step: string, build: () => T): T => {
  replaying = { recipe, step };
  try {
    return build();
  } finally {
    replaying = null;
  }
};

/**
 * A step begins on a terrain: returns the ids its outputs get, and `done` to call when it worked – it records the
 * step (unless the recipe is being built again) and the heights it left.
 */
export const beginStep = (terrain: Instance, kind: StepKind, params: Record<string, unknown>) => {
  if (replaying) {
    const { recipe, step } = replaying;
    return { recipe, step, done: () => undefined };
  }
  const data = terrainData(terrain);
  const recipe = data.recipe ?? newId();
  const step = newId();
  // a terrain from the Terrain tool keeps its heights from before the first step
  const grid = readGrid(terrain);
  const base = data.base ?? (data.settings || data.steps?.length ? undefined : grid ? [...grid.heights] : undefined);
  const done = () => {
    const after = readGrid(terrain);
    remember(terrain, (current) => ({
      ...current,
      recipe,
      base: current.base ?? base,
      steps: [...(current.steps ?? []), { id: step, kind, params: JSON.parse(JSON.stringify(params)), enabled: true }],
      result: after ? [...after.heights] : current.result,
    }));
  };
  return { recipe, step, done };
};

/** marks a group as made by a step */
export const tagOutput = (instance: Instance, recipe: string, step: string) => {
  pluginContext().data.set(instance.definition, { output: { recipe, step } } satisfies OutputData);
};

/** the groups in `entities` a recipe made */
export const outputsOf = (entities: Entities, recipe: string) =>
  [...entities.instances.values()].filter(
    (instance) => pluginContext().data.get<OutputData>(instance.definition)?.output?.recipe === recipe,
  );

/** is a definition something a step made (not a terrain)? */
export const isOutput = (definition: Definition) => !!pluginContext().data.get<OutputData>(definition)?.output;

/**
 * Sculpting with the Terrain tool since the recipe last ran: the difference between the heights now and the ones the
 * recipe gave, as a step of its own (kept sparse – only the grid points that moved). Returns whether there was any.
 */
export const takeSculpting = (terrain: TerrainRef) => {
  const data = terrainData(terrain);
  const grid = readGrid(terrain);
  if (!grid || !data.result || !data.steps?.length || data.result.length !== grid.heights.length) {
    return false;
  }
  const indices: number[] = [],
    deltas: number[] = [];
  grid.heights.forEach((height, index) => {
    const delta = height - data.result![index];
    if (Math.abs(delta) > 0.002) {
      indices.push(index);
      deltas.push(Math.round(delta * 1000) / 1000);
    }
  });
  if (!indices.length) {
    return false;
  }
  remember(terrain, (current) => ({
    ...current,
    steps: [...(current.steps ?? []), { id: newId(), kind: 'sculpt', params: { indices, deltas }, enabled: true }],
    result: [...grid.heights],
  }));
  return true;
};

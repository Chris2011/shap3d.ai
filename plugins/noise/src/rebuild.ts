import type { Instance } from '../../../src/core/model';
import type { GroupHandle, ScriptApi } from '../../../src/scripting/api';
import { makeGrid, normaliseSettings, type TerrainGrid } from '@shap3d/procgen';
import {
  buildGrid,
  city,
  clearGeometry,
  erodeTerrain,
  handleFor,
  markCreated,
  holdTerrainGeometry,
  noiseTerrain,
  river,
  road,
  scatter,
  storeGrid,
  terrainFor,
  terrainGridOf,
  terrainSettingsOf,
  villages,
  type CityCall,
  type ErodeCall,
  type RiverCall,
  type RoadCall,
  type ScatterCall,
  type Target,
  type TerrainCall,
  type VillagesCall,
} from './actions';
import { asStep, outputsOf, takeSculpting, terrainData, type NoiseTerrainData, type RecipeStep } from './recipes';
import { pluginContext, t } from './runtime';

/**
 * Building a terrain's recipe again: the heights from the start (the noise terrain's settings, or the heights a
 * Terrain-tool terrain had before its first step), everything the recipe made removed, then every step that is
 * switched on, in order – the terrain's faces only once at the end. All in the one undo step of the script.
 */

/** one step of a recipe, run on its terrain */
const runStep = (api: ScriptApi, terrain: Instance, step: RecipeStep) => {
  const params = step.params;
  const target = terrain.id;
  switch (step.kind) {
    case 'erode':
      erodeTerrain(api, { ...params, target } as ErodeCall);
      break;
    case 'river':
      river(api, { ...params, target } as RiverCall);
      break;
    case 'road':
      road(api, { ...params, target } as RoadCall);
      break;
    case 'city':
      city(api, { ...params, on: target } as CityCall);
      break;
    case 'villages':
      villages(api, { ...params, target } as VillagesCall);
      break;
    case 'scatter':
      scatter(api, { ...params, on: target } as ScatterCall);
      break;
    case 'sculpt': {
      // the Terrain tool's changes, added onto the heights as they are now
      const grid = terrainGridOf(terrain)!;
      const heights = [...grid.heights];
      const { indices, deltas } = params as { indices: number[]; deltas: number[] };
      indices.forEach((index, at) => {
        if (index < heights.length) {
          heights[index] = Math.round((heights[index] + deltas[at]) * 1000) / 1000;
        }
      });
      storeGrid(terrain, { ...grid, heights });
      break;
    }
  }
};

export interface RebuildResult {
  /** steps that ran */
  ran: number;
  /** steps that could not run any more (e.g. no place left for the villages) – their kinds */
  failed: string[];
}

let lastRebuild: RebuildResult = { ran: 0, failed: [] };
/** what the last building again did – the panel tells the user */
export const lastRebuildResult = () => lastRebuild;

/** builds the recipe of a terrain again */
export const rebuildRecipe = (api: ScriptApi, terrain: Instance): RebuildResult => {
  if (!terrainData(terrain).steps?.length) {
    lastRebuild = { ran: 0, failed: [] };
    return lastRebuild;
  }
  // sculpting since the recipe last ran becomes a step of its own, so it is not lost
  takeSculpting(terrain);
  const { recipe, steps, settings, base } = terrainData(terrain);
  const current = terrainGridOf(terrain)!;
  let start: TerrainGrid;
  if (settings) {
    start = makeGrid(normaliseSettings(settings));
  } else {
    if (!base || base.length !== current.heights.length) {
      throw new Error(t('noise.steps.baseChanged'));
    }
    start = { ...current, heights: [...base] };
  }

  // what the recipe made goes; what is built on the terrain is built anew by the steps
  const entities = api.editor.entities;
  for (const output of outputsOf(entities, recipe!)) {
    entities.instances.delete(output.id);
    api.editor.model.definitions.delete(output.definition.id);
  }
  pluginContext().data.set(terrain.definition, { settings, recipe, steps, base } satisfies NoiseTerrainData);
  storeGrid(terrain, start);

  const result: RebuildResult = { ran: 0, failed: [] };
  holdTerrainGeometry(true);
  try {
    for (const step of steps!) {
      if (!step.enabled) {
        continue;
      }
      try {
        asStep(recipe!, step.id, () => runStep(api, terrain, step));
        result.ran++;
      } catch {
        // a step that no longer fits the terrain is skipped, the others still run
        result.failed.push(t(`noise.steps.kinds.${step.kind}`));
      }
    }
  } finally {
    holdTerrainGeometry(false);
  }
  const grid = terrainGridOf(terrain)!;
  clearGeometry(terrain.definition.entities);
  buildGrid(api, terrain.definition.entities, grid);
  pluginContext().data.set(terrain.definition, { ...terrainData(terrain), result: [...grid.heights] } satisfies NoiseTerrainData);
  lastRebuild = result;
  return result;
};

/** a terrain with a recipe: the given one, else the selected one (else the newest terrain) */
const recipeTerrain = (api: ScriptApi, target: Target) => {
  const terrain = terrainFor(api, target);
  if (!terrainData(terrain).steps?.length) {
    throw new Error(t('noise.steps.none'));
  }
  return terrain;
};

/** s3d.rebuildTerrain – builds a terrain's recipe again; returns how many steps ran */
export const rebuildTerrain = (api: ScriptApi, call: { target?: Target } = {}): number =>
  rebuildRecipe(api, recipeTerrain(api, call.target)).ran;

export interface StepInfo {
  index: number;
  kind: string;
  enabled: boolean;
  seed?: number;
}

/** s3d.terrainSteps – the steps of a terrain's recipe */
export const terrainSteps = (api: ScriptApi, call: { target?: Target } = {}): StepInfo[] => {
  const terrain = terrainFor(api, call.target);
  return (terrainData(terrain).steps ?? []).map((step, index) => ({
    index,
    kind: step.kind,
    enabled: step.enabled,
    ...(typeof step.params.seed === 'number' ? { seed: step.params.seed } : {}),
  }));
};

export interface EditStepCall {
  target?: Target;
  /** which step (from 0, as s3d.terrainSteps lists them) */
  index: number;
  enabled?: boolean;
  /** another seed for the step */
  seed?: number;
  /** removes the step */
  remove?: boolean;
}

/** s3d.editTerrainStep – switches a step on or off, gives it another seed or removes it, then builds again */
export const editTerrainStep = (api: ScriptApi, call: EditStepCall): number => {
  const terrain = recipeTerrain(api, call.target);
  const data = terrainData(terrain);
  const steps = [...data.steps!];
  const step = steps[call.index];
  if (!step) {
    throw new Error(t('noise.steps.unknown', { index: call.index, count: steps.length }));
  }
  // what was sculpted until now stays where it is in the list
  takeSculpting(terrain);
  const current = terrainData(terrain).steps!;
  const changed = current.map((candidate) =>
    candidate.id !== step.id
      ? candidate
      : {
          ...candidate,
          enabled: call.enabled ?? candidate.enabled,
          params: call.seed != null ? { ...candidate.params, seed: call.seed } : candidate.params,
        },
  );
  pluginContext().data.set(terrain.definition, {
    ...terrainData(terrain),
    steps: call.remove ? changed.filter((candidate) => candidate.id !== step.id) : changed,
  } satisfies NoiseTerrainData);
  return rebuildRecipe(api, terrain).ran;
};

/**
 * s3d.noiseTerrain with its recipe: when a noise terrain that has steps gets new settings, it keeps its group and
 * its recipe, and everything built on it is built again on the new heights.
 */
export const noiseTerrainWithRecipe = (api: ScriptApi, call: TerrainCall = {}): GroupHandle => {
  const replaced = call.replace != null ? api.editor.entities.instances.get(call.replace) : undefined;
  if (!replaced || !terrainData(replaced).steps?.length) {
    return noiseTerrain(api, call);
  }
  takeSculpting(replaced);
  pluginContext().data.set(replaced.definition, {
    ...terrainData(replaced),
    settings: terrainSettingsOf(api, call),
  } satisfies NoiseTerrainData);
  if (call.name) {
    replaced.name = call.name;
  }
  rebuildRecipe(api, replaced);
  markCreated(replaced);
  return handleFor(api, replaced);
};

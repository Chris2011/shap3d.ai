import type * as RapierModule from '@dimforge/rapier3d-compat';
import { pluginContext } from './runtime';

/**
 * Rapier, the physics engine (rigid bodies, colliders, joints), as WebAssembly. It ships next to plugin.js as
 * rapier.js (the WebAssembly embedded) and is loaded the first time a simulation starts – the plugin itself stays small.
 */

export type Rapier = typeof RapierModule;

let loaded: Rapier | null = null;
let loading: Promise<Rapier> | null = null;

/** loads Rapier once; later calls get the same promise */
export const loadRapier = () =>
  (loading ??= (async () => {
    const engine = (await import(/* @vite-ignore */ pluginContext().assets.url('rapier.js'))) as Rapier;
    await engine.init();
    loaded = engine;
    return engine;
  })().catch((error: unknown) => {
    loading = null;
    throw error;
  }));

/** Rapier once it is loaded, else null */
export const rapierIfLoaded = () => loaded;

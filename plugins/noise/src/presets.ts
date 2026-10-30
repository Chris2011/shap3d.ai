import { type TerrainSettings } from '@shap3d/procgen';

/** ready-made landscapes – they change the noise and keep size, detail and seed */
export const PRESETS = {
  hills: { mode: 'fbm', scale: 28, height: 5, octaves: 5, persistence: 0.45, exponent: 1.2 },
  mountains: { mode: 'ridged', scale: 55, height: 14, octaves: 6, persistence: 0.45, exponent: 1.6, warp: 0.3, snow: 9 },
  island: { mode: 'fbm', scale: 22, height: 8, octaves: 6, persistence: 0.5, falloff: 1, water: 1.2, exponent: 1.1 },
  canyon: {
    mode: 'ridged',
    scale: 40,
    height: 12,
    octaves: 4,
    persistence: 0.4,
    warp: 0.8,
    terraces: 1.6,
    terraceSharpness: 0.7,
    exponent: 0.6,
  },
  dunes: { mode: 'billow', scale: 12, height: 2.5, octaves: 3, persistence: 0.35, warp: 0.5, exponent: 1 },
} satisfies Record<string, Partial<TerrainSettings>>;

export type PresetName = keyof typeof PRESETS;
export const PRESET_NAMES = Object.keys(PRESETS) as PresetName[];

/** ready-made stones for the paving tab – they keep colour and seed */
export const PAVING_PRESETS = {
  flagstones: { size: 0.55, gap: 0.02, jitter: 1, stretch: 1, thickness: 0.05, variation: 0.25, bevel: 0.008, joint: true },
  cobbles: { size: 0.13, gap: 0.012, jitter: 0.55, stretch: 1, thickness: 0.08, variation: 0.35, bevel: 0.025, joint: true },
  slabs: { size: 0.9, gap: 0.008, jitter: 0.35, stretch: 1.4, thickness: 0.04, variation: 0.08, bevel: 0.003, joint: true },
  wall: { size: 0.28, gap: 0.015, jitter: 0.8, stretch: 2.2, thickness: 0.12, variation: 0.5, bevel: 0.03, joint: true },
};

export type PavingPresetName = keyof typeof PAVING_PRESETS;
export const PAVING_PRESET_NAMES = Object.keys(PAVING_PRESETS) as PavingPresetName[];

import type { PluginAtmosphere, PluginLight } from '../../../src/plugins/types';
import { cameraLook, levelObjects, type LevelObject } from './objects';
import { pluginContext, THREE } from './runtime';

/**
 * Light and atmosphere of the level: its light objects (point lights and spots, on or off, flickering) and the mood –
 * how much daylight is left, fog with its colour and reach. Kept in the model's level data; shown in the 3D view while
 * editing when wanted, and always in the test run (with the player's torch).
 */

export interface LevelAtmosphere {
  /** 0 … 1 – 0 is a dark night or a house without windows: only the level's lights and the torch */
  daylight: number;
  fog: boolean;
  fogColor: string;
  /** where the fog begins and where nothing is seen any more (m) */
  fogNear: number;
  fogFar: number;
  /** show light and atmosphere while editing too (the test run always shows them) */
  preview: boolean;
}

export const DEFAULT_ATMOSPHERE: LevelAtmosphere = { daylight: 1, fog: false, fogColor: '#9aa3ab', fogNear: 4, fogFar: 30, preview: false };

interface ModelData {
  atmosphere?: Partial<LevelAtmosphere>;
}

export const levelAtmosphere = (): LevelAtmosphere => ({
  ...DEFAULT_ATMOSPHERE,
  ...pluginContext().data.getModel<ModelData>()?.atmosphere,
});

/** changes the atmosphere (one undo step) */
export const setAtmosphere = (change: Partial<LevelAtmosphere>) => {
  const context = pluginContext();
  context.editor.commit('level.undo.atmosphere', () => {
    const data = context.data.getModel<ModelData>() ?? {};
    context.data.setModel({ ...data, atmosphere: { ...levelAtmosphere(), ...change } });
  });
};

/** s3d.levelAtmosphere({ daylight, fog, fogColor, fogNear, fogFar, preview }) – sets the level's mood (inside a script) */
export const scriptAtmosphere = (change: Partial<LevelAtmosphere> = {}) => {
  const context = pluginContext();
  const known = Object.fromEntries(
    Object.entries(change).filter(
      ([name, value]) => name in DEFAULT_ATMOSPHERE && typeof value === typeof DEFAULT_ATMOSPHERE[name as keyof LevelAtmosphere],
    ),
  );
  const data = context.data.getModel<ModelData>() ?? {};
  const atmosphere = { ...levelAtmosphere(), ...known };
  context.data.setModel({ ...data, atmosphere });
  return atmosphere;
};

/** the atmosphere as the view takes it */
export const viewAtmosphere = (atmosphere: LevelAtmosphere): PluginAtmosphere => ({
  daylight: atmosphere.daylight,
  ...(atmosphere.fog ? { fog: { color: atmosphere.fogColor, near: atmosphere.fogNear, far: atmosphere.fogFar } } : {}),
  ...(atmosphere.daylight < 0.25 && !atmosphere.fog ? { background: '#05070a' } : {}),
});

/** a light object as a light in the view – `on` tells whether it shines (the test run switches lights) */
export const viewLight = (object: LevelObject, time = 0): PluginLight => {
  const position = new THREE.Vector3().setFromMatrixPosition(object.world);
  const look = cameraLook(object);
  // a flickering light: an uneven, quick change of brightness
  const flicker = object.props.flicker ? 0.55 + 0.45 * Math.abs(Math.sin(time * 13.7) * Math.sin(time * 5.3 + 1.7)) : 1;
  return {
    kind: object.props.type === 'spot' ? 'spot' : 'point',
    position: position.toArray(),
    direction: look.toArray(),
    color: String(object.props.color),
    intensity: Math.max(0, Number(object.props.intensity) || 0) * flicker,
    range: Math.max(0.5, Number(object.props.range) || 8),
    angle: Number(object.props.angle) || 35,
    shadow: !!object.props.shadows,
  };
};

/** the lights of the level that shine while editing */
export const editorLights = () =>
  levelObjects()
    .filter((object) => object.kind === 'light' && object.props.on)
    .map((object) => viewLight(object));

let shown = '';
/** shows (or takes away) light and atmosphere in the view while editing – after the model or the setting changed */
export const refreshPreview = () => {
  const context = pluginContext();
  const atmosphere = levelAtmosphere();
  const lights = atmosphere.preview ? editorLights() : [];
  const wanted = atmosphere.preview ? JSON.stringify(viewAtmosphere(atmosphere)) : '';
  context.lighting.set(lights);
  if (wanted !== shown) {
    shown = wanted;
    context.lighting.atmosphere(atmosphere.preview ? viewAtmosphere(atmosphere) : null);
  }
};

/** forget what was shown (the test run sets its own and gives the view back afterwards) */
export const resetPreview = () => {
  shown = '';
};

import { PRESETS, type Preset } from './library';
import { pluginContext, t } from './runtime';

/** the full shader id a material stores, e.g. "shaders.wood" */
export const shaderId = (shader: string) => `${pluginContext().plugin.id}.${shader}`;

/** the material name of a preset in the current language, e.g. "Oak (shader)" */
export const presetName = (preset: Preset) => t('shaders.material', { name: t(`shaders.preset.${preset.id}`) });

export const presetMaterial = (preset: Preset) => ({
  color: preset.color,
  shader: shaderId(preset.shader),
  params: preset.params,
  size: preset.size,
});

/** CSS background with the preset's picture */
export const presetPreview = (preset: Preset) => pluginContext().materials.preview(presetMaterial(preset));

/** puts the preset's material into the model if it isn't there yet – inside a script or commit; returns its name */
export const ensurePreset = (preset: Preset) => pluginContext().materials.ensure(presetName(preset), presetMaterial(preset));

/** the same as one undo step of its own */
export const addPreset = (preset: Preset) => {
  const { editor } = pluginContext();
  const name = presetName(preset);
  if (!editor.model.materials.some((material) => material.name === name)) {
    editor.commit(name, () => ensurePreset(preset));
  }
  return name;
};

/** picks the preset's material for the paint bucket – like a click in the Materials panel */
export const paintWith = (preset: Preset) => {
  const { editor } = pluginContext();
  editor.ui.currentMaterial = addPreset(preset);
  if (editor.ui.tool !== 'paint') {
    editor.setTool('paint');
  } else {
    editor.refreshStatus();
  }
};

/** a preset by id – for scripts */
export const findPreset = (id: string) => PRESETS.find((preset) => preset.id === id);

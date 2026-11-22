import { DEFAULT_STYLE, type StyleSettings } from './document';

/** A look for the whole model; its name is the message `styles.preset.<id>`. */
export interface StylePreset {
  id: string;
  style: StyleSettings;
}

export const STYLE_PRESETS: readonly StylePreset[] = [
  { id: 'standard', style: { ...DEFAULT_STYLE } },
  {
    id: 'architecture',
    style: { ...DEFAULT_STYLE, skyColor: '#ffffff', groundColor: '#ffffff', sky: false, ground: false, backColor: '#d9d9d9' },
  },
  {
    id: 'blueprint',
    style: {
      ...DEFAULT_STYLE,
      skyColor: '#1d3f78',
      groundColor: '#1d3f78',
      sky: false,
      ground: false,
      frontColor: '#2b5394',
      backColor: '#2b5394',
      edgeColor: '#ffffff',
      faceStyle: 'monochrome',
    },
  },
  {
    id: 'sketch',
    style: {
      ...DEFAULT_STYLE,
      skyColor: '#f6f1e3',
      groundColor: '#efe8d4',
      frontColor: '#fffaf0',
      backColor: '#e8e0cc',
      edgeColor: '#3b3326',
      faceStyle: 'hiddenline',
    },
  },
  { id: 'night', style: { ...DEFAULT_STYLE, skyColor: '#1f2a44', groundColor: '#2c2f33', edgeColor: '#111111' } },
  { id: 'white', style: { ...DEFAULT_STYLE, sky: false, ground: false, skyColor: '#ffffff', groundColor: '#ffffff' } },
  // like a white study model: no material colours, light grey back faces and soft grey edges – with shadows and AO a presentation look
  {
    id: 'monochrome',
    style: {
      ...DEFAULT_STYLE,
      faceStyle: 'monochrome',
      frontColor: '#ffffff',
      backColor: '#e6e6e6',
      edgeColor: '#4d4d4d',
      sky: false,
      ground: false,
      skyColor: '#ffffff',
      groundColor: '#ffffff',
    },
  },
];

/** presets leave the ambient occlusion as it is */
const OCCLUSION_KEYS: readonly (keyof StyleSettings)[] = ['ao', 'aoDistance', 'aoIntensity', 'aoColor'];

/** What a preset sets: everything but the ambient occlusion. */
export const presetValues = (preset: StylePreset): Partial<StyleSettings> =>
  Object.fromEntries(Object.entries(preset.style).filter(([key]) => !OCCLUSION_KEYS.includes(key as keyof StyleSettings)));

/** The id of the preset `style` matches, if any. */
export const matchingPreset = (style: StyleSettings) =>
  STYLE_PRESETS.find((preset) => Object.entries(presetValues(preset)).every(([key, value]) => style[key as keyof StyleSettings] === value))
    ?.id;

import { reactive } from 'vue';

/** Icons added at runtime (plugins): name → inner SVG markup for a 24×24 viewBox. */
export const extraIcons = reactive<Record<string, string>>({});

export const registerIcon = (name: string, svgContent: string) => {
  extraIcons[name] = svgContent;
  return () => {
    delete extraIcons[name];
  };
};

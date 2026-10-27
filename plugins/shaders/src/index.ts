// Shader materials for Shap3D.ai – surfaces drawn by GLSL shaders instead of pictures.
// - shaders for wood, marble, granite, terrazzo, rust and patina, brick walls, checker and exposed concrete:
//   solid patterns in the object's own coordinates, so they run round edges without seams and move with the object
// - every shader is listed with the textures in the Materials panel; its parameters (colours, sizes, amounts)
//   are sliders and colour pickers there
// - a panel with ready-made materials (oak, walnut, Carrara …) – a click picks it for the paint bucket
// Without the plugin, materials with a shader show their colour – models stay usable.
// Scripts: s3d.shaderMaterial('oak') or s3d.material(name, colour, { shader: 'shaders.wood', params }).
import type { S3dPlugin } from '../../../src/plugins/types';
import S3dShaderLibrary from './S3dShaderLibrary.vue';
import { PRESETS, SHADERS } from './library';
import { ensurePreset, findPreset } from './presets';
import { MESSAGES, t, useRuntime } from './runtime';
import { injectStyles } from './styles';

const PANEL = 'library';

const plugin: S3dPlugin = {
  id: 'shaders',
  name: 'shaders.plugin.name',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'shaders.plugin.description',
  messages: MESSAGES,

  activate(context) {
    useRuntime(context);
    context.onDispose(injectStyles());

    for (const shader of SHADERS) {
      context.materials.registerShader(shader);
    }

    context.icons.register(
      'shaders',
      '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M5.5 9.5c3 1.6 5.6-1.8 8.4-.4s3.4 3.6 5.6 2.6M4.8 14.4c2.6.9 4.4-1.2 6.8-.2s3.7 3 6.6 2.2" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>',
    );
    context.panels.register({
      id: PANEL,
      label: 'shaders.panel.title',
      icon: 'shaders',
      width: 320,
      component: S3dShaderLibrary,
      tile: 'last',
    });
    context.commands.register({
      id: 'open',
      label: 'shaders.commands.open',
      icon: 'shaders',
      keywords: 'shader material texture glsl wood marble granite terrazzo rust brick concrete holz marmor ziegel beton rost', // i18n-ignore – search words
      run: () => context.panels.open(PANEL),
    });

    context.script.extend(
      'shaderMaterial',
      (_api, id: string) => {
        const preset = findPreset(id);
        if (!preset) {
          throw new Error(t('shaders.script.unknown', { id, allowed: PRESETS.map((entry) => entry.id).join(', ') }));
        }
        return ensurePreset(preset);
      },
      {
        category: 'Materialien', // i18n-ignore – API category id
        returns: 'shaders.script.returns',
        signature: 's3d.shaderMaterial(preset)',
        description: 'shaders.script.description',
        example: "const oak = s3d.shaderMaterial('oak');\ns3d.box([0, 0, 0], 2, 0.8, 0.04, { material: oak });",
      },
    );
  },
};

export default plugin;

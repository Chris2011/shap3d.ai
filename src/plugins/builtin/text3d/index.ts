import { Tool } from '../../../engine/editor';
import type { Pt } from '../../../scripting/api';
import type { S3dPlugin } from '../../types';
import S3dText3dDialog from './S3dText3dDialog.vue';
import { BUILTIN_FONTS, DEFAULT_FONT, FONTS, categoryLabel, fontLabel, loadFont } from './fonts';
import german from './i18n/de.json';
import english from './i18n/en.json';
import spanish from './i18n/es.json';
import french from './i18n/fr.json';
import arabic from './i18n/ar.json';
import { buildText } from './text';
import { textDialog, initCustomFonts, dropCustomFonts, TEXT_TOOL } from './state';
import { t } from '../../../i18n';

/** The 3D-text tool: shows the dialog while active (like SketchUp's 3D Text). */
class TextTool extends Tool {
  id = TEXT_TOOL;
  name = 'text3d.plugin.name';
  status() {
    return t('text3d.plugin.status');
  }
  activate() {
    textDialog.open = true;
  }
  deactivate() {
    textDialog.open = false;
  }
}

/**
 * Built-in plugin: 3D letters and numbers in free fonts – a dialog with live preview, Helvetiker/Optimer
 * plus 13 fonts under the SIL Open Font License (sans, serif, poster, script, pixel, monospace) and your
 * own TTF/OTF/WOFF files, and s3d.text3d() for scripts. Fonts load only when they are used.
 */
const text3dPlugin: S3dPlugin = {
  id: 'text3d',
  name: 'text3d.plugin.name',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: 'text3d.plugin.description',
  messages: { de: german.messages, en: english.messages, fr: french.messages, es: spanish.messages, ar: arabic.messages },

  async activate(context) {
    context.tools.register({ id: 'text', name: 'text3d.plugin.name', icon: 'text3d', create: (editor) => new TextTool(editor) });
    context.ui.addWindow(S3dText3dDialog);
    await initCustomFonts(context.storage.files);
    context.onDispose(dropCustomFonts);
    // the default font is small – load it now so JSON scripts and the first text need no second run
    loadFont(DEFAULT_FONT).catch(() => {});

    // scripts run synchronously: load the fonts a script names before it starts
    context.script.beforeRun(async (code) => {
      if (!/text3d/.test(code)) {
        return;
      }
      const wanted = FONTS.filter((font) => code.includes(`'${font.id}'`) || code.includes(`"${font.id}"`)).map((font) => font.id);
      await Promise.all([DEFAULT_FONT, ...wanted].map((id) => loadFont(id).catch(() => {})));
    });

    // code completion for { font: '…' } and "font": "…"
    context.script.completeValues('font', () =>
      FONTS.map((font) => ({ label: font.id, detail: categoryLabel(font.category), description: fontLabel(font) })),
    );

    context.script.extend(
      'text3d',
      (
        api,
        text: string,
        opts: {
          at?: Pt;
          size?: number | string;
          depth?: number | string;
          font?: string;
          upright?: boolean;
          filled?: boolean;
          material?: string;
        } = {},
      ) => {
        const group = api.group(`Text „${text}“`, (inner) => {
          // i18n-ignore – default name (s3d API)
          buildText(inner.ents, String(text), {
            size: api.length(opts.size ?? 1),
            depth: api.length(opts.depth ?? 0.2),
            font: opts.font,
            upright: opts.upright ?? true,
            filled: opts.filled,
          });
          if (opts.material) {
            const material = api.ensureMaterial(opts.material);
            for (const face of inner.ents.faces.values()) {
              face.material = material;
            }
          }
        });
        if (opts.at) {
          group.move(opts.at);
        }
        return group;
      },
      {
        category: 'Körper', // i18n-ignore – API category
        title: 'text3d.plugin.name',
        signature: 's3d.text3d(text, { at, size, depth, upright, filled, font, material })',
        returns: 'api.returns.gruppe',
        get description() {
          return t('text3d.plugin.apiDescription', { fonts: BUILTIN_FONTS.map((font) => `'${font.id}'`).join(', ') });
        },
        example: "s3d.text3d('Hallo 2025', { at: [0, 0, 0], size: 0.5, depth: 0.1, font: 'bebas', material: 'Gold' });",
      },
    );
  },
};

export default text3dPlugin;

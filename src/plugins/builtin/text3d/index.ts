import { Tool } from '../../../engine/editor';
import type { Pt } from '../../../scripting/api';
import type { S3dPlugin } from '../../types';
import S3dText3dDialog from './S3dText3dDialog.vue';
import { BUILTIN_FONTS, DEFAULT_FONT, FONTS, loadFont } from './fonts';
import { buildText } from './text';
import { textDialog, initCustomFonts, dropCustomFonts, TEXT_TOOL } from './state';

/** The 3D-text tool: shows the dialog while active (like SketchUp's 3D Text). */
class TextTool extends Tool {
  id = TEXT_TOOL; name = '3D-Text';
  status() { return '3D-Text: Text und Schrift wählen, dann „Platzieren“ und in das Modell klicken.'; }
  activate() { textDialog.open = true; }
  deactivate() { textDialog.open = false; }
}

/**
 * Built-in plugin: 3D letters and numbers in free fonts – a dialog with live preview, Helvetiker/Optimer
 * plus 13 fonts under the SIL Open Font License (sans, serif, poster, script, pixel, monospace) and your
 * own TTF/OTF/WOFF files, and s3d.text3d() for scripts. Fonts load only when they are used.
 */
const text3dPlugin: S3dPlugin = {
  id: 'text3d',
  name: '3D-Text',
  version: '1.0.0',
  author: 'Shap3D.ai',
  description: '3D-Buchstaben und -Zahlen in vielen freien Schriften (Serifenlos, Serif, Plakat, Schreibschrift, Pixel …) oder eigenen TTF/OTF/WOFF-Dateien, flach oder aufrecht, gefüllt, extrudiert oder als Umriss. Bringt s3d.text3d() für Skripte mit.',

  async activate(context) {
    context.tools.register({ id: 'text', name: '3D-Text', icon: 'text3d', create: editor => new TextTool(editor) });
    context.ui.addWindow(S3dText3dDialog);
    await initCustomFonts(context.storage.files);
    context.onDispose(dropCustomFonts);
    // the default font is small – load it now so JSON scripts and the first text need no second run
    loadFont(DEFAULT_FONT).catch(() => {});

    // scripts run synchronously: load the fonts a script names before it starts
    context.script.beforeRun(async code => {
      if (!/text3d/.test(code)) return;
      const wanted = FONTS.filter(font => code.includes(`'${font.id}'`) || code.includes(`"${font.id}"`)).map(font => font.id);
      await Promise.all([DEFAULT_FONT, ...wanted].map(id => loadFont(id).catch(() => {})));
    });

    // code completion for { font: '…' } and "font": "…"
    context.script.completeValues('font', () => FONTS.map(font => ({ label: font.id, detail: font.category, description: font.label })));

    context.script.extend('text3d', (api, text: string, opts: { at?: Pt; size?: number | string; depth?: number | string; font?: string; upright?: boolean; filled?: boolean; material?: string } = {}) => {
      const group = api.group(`Text „${text}“`, inner => {
        buildText(inner.ents, String(text), { size: api.length(opts.size ?? 1), depth: api.length(opts.depth ?? 0.2), font: opts.font, upright: opts.upright ?? true, filled: opts.filled });
        if (opts.material) { const material = api.ensureMaterial(opts.material); for (const face of inner.ents.faces.values()) face.material = material; }
      });
      if (opts.at) group.move(opts.at);
      return group;
    }, {
      category: 'Körper',
      title: '3D-Text',
      signature: "s3d.text3d(text, { at, size, depth, upright, filled, font, material })",
      returns: 'Gruppe',
      description: `3D-Buchstaben und -Zahlen. size = Schrifthöhe, depth = Extrusion (0 = flach), upright = aufrecht stehend (Standard), filled: false = nur Umriss, "\\n" = neue Zeile. Schriften (font): ${BUILTIN_FONTS.map(font => `'${font.id}'`).join(', ')} oder eigene („eigene:name“).`,
      example: "s3d.text3d('Hallo 2025', { at: [0, 0, 0], size: 0.5, depth: 0.1, font: 'bebas', material: 'Gold' });",
    });
  },
};

export default text3dPlugin;

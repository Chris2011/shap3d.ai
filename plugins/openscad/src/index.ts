// OpenSCAD for Shap3D.ai – runs the official OpenSCAD (WebAssembly build "openscad-wasm") in the browser.
// - opens .scad files (Import… / drag & drop)
// - "OpenSCAD" as a language in the script editor
// - s3d.scad(code) inside JavaScript scripts
// - exports the model as an OpenSCAD polyhedron (.scad)
// - a file library in the browser for include/use/import() and fonts for text()
// The WebAssembly build is not part of this module: it ships next to it in the package (openscad.js).
// All texts are message keys (i18n/<language>.json) – the app registers them from `messages`.
import type { S3dPlugin } from '../../../src/plugins/types';
import { createEngine } from './engine';
import { registerFiles } from './files';
import { MESSAGES, useI18n } from './i18n';
import { registerPanel } from './panel';
import { registerScripting } from './scripting';
import { loadSettings } from './settings';

const plugin: S3dPlugin = {
  id: 'openscad',
  name: 'openscad.plugin.name',
  version: '1.4.2',
  author: 'Shap3D.ai (OpenSCAD: openscad.org)',
  description: 'openscad.plugin.description',
  messages: MESSAGES,

  activate(context) {
    useI18n(context);
    const settings = loadSettings(context);
    const engine = createEngine(context, settings);
    registerScripting(context, engine, settings);
    const { openFromLibrary } = registerFiles(context, engine, settings);
    registerPanel(context, engine, settings, openFromLibrary);
  },
};

export default plugin;

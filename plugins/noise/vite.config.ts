import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import * as vueRuntime from 'vue';
import { defineConfig, type Plugin } from 'vite';

// Builds the installable plugin folder dist/: plugin.js (src/ as one ES module, components and texts included),
// README and a package.json that tells Shap3D.ai which file to start. Install it in Shap3D.ai via
// Plugins › Load plugin folder… › dist.

const manifest = JSON.parse(readFileSync('package.json', 'utf8'));

/**
 * A plugin must not bring its own Vue: the app's reactive state (editor.ui …) only tracks with the app's Vue.
 * So every `import … from 'vue'` (also in the compiled .vue files) goes to this module, whose exports are
 * filled with the app's Vue (`context.vue`) when the plugin activates – before any component renders.
 * defineComponent runs while the modules load, so it is a plain pass-through here (as in Vue for objects).
 */
const VUE_SHIM = '\0s3d-vue-shim';
const appVue = (): Plugin => ({
  name: 'shap3d-app-vue',
  enforce: 'pre',
  resolveId: (id) => (id === 'vue' ? VUE_SHIM : null),
  load(id) {
    if (id !== VUE_SHIM) {
      return null;
    }
    const names = Object.keys(vueRuntime).filter((name) => /^[A-Za-z_$][\w$]*$/.test(name) && name !== 'defineComponent' && name !== 'default');
    return [
      `export let ${names.join(', ')};`,
      'export const defineComponent = (options) => options;',
      `export const useAppVue = (vue) => { ({ ${names.join(', ')} } = vue); };`,
    ].join('\n');
  },
});

/** files that ship next to plugin.js: docs and the package manifest */
const packageFiles = (): Plugin => ({
  name: 'shap3d-plugin-package',
  generateBundle() {
    // every file of the package, listed in its package.json – so it can also be installed without the folder dialog
    const files = ['plugin.js'];
    const emit = (fileName: string, source: string | Uint8Array) => {
      files.push(fileName);
      this.emitFile({ type: 'asset', fileName, source });
    };
    emit('README.md', readFileSync('README.md'));
    const { name, version, description, license } = manifest;
    const shap3d = { id: manifest.shap3d.id, main: 'plugin.js' };
    emit('package.json', JSON.stringify({ name, version, description, license, shap3d, files: [...files, 'package.json'] }, null, 2) + '\n');
  },
});

export default defineConfig({
  publicDir: false,
  plugins: [appVue(), vue(), packageFiles()],
  // the generators live in packages/procgen and are bundled into plugin.js – no other plugin is needed at runtime
  resolve: { alias: { '@shap3d/procgen': fileURLToPath(new URL('../../packages/procgen/src/index.ts', import.meta.url)) } },
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'plugin.js' },
  },
});

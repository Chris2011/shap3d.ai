import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Builds the installable plugin folder dist/: plugin.js (src/ as one ES module, texts included),
// web-ifc (its ES module and the WebAssembly, loaded on the first IFC import) and a package.json
// that tells Shap3D.ai which file to start. Install it in Shap3D.ai via Plugins › Load plugin folder… › dist.

const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
// web-ifc exports no package.json – its folder is found through the main entry
const webIfcDir = dirname(require.resolve('web-ifc'));
const webIfcVersion = JSON.parse(readFileSync(join(webIfcDir, 'package.json'), 'utf8')).version;

/** files that ship next to plugin.js: web-ifc itself, docs and the package manifest */
const packageFiles = (): Plugin => ({
  name: 'shap3d-plugin-package',
  generateBundle() {
    // every file of the package, listed in its package.json – so it can also be installed without the folder dialog
    const files = ['plugin.js'];
    const emit = (fileName: string, source: string | Uint8Array) => {
      files.push(fileName);
      this.emitFile({ type: 'asset', fileName, source });
    };
    emit('web-ifc-api.js', readFileSync(join(webIfcDir, 'web-ifc-api.js')));
    emit('web-ifc.wasm', readFileSync(join(webIfcDir, 'web-ifc.wasm')));
    emit('README.md', readFileSync('README.md'));
    emit('THIRD-PARTY-NOTICES.md', readFileSync('THIRD-PARTY-NOTICES.md'));
    const { name, version, description, license } = manifest;
    const shap3d = { id: manifest.shap3d.id, main: 'plugin.js' };
    emit(
      'package.json',
      JSON.stringify(
        { name, version, description, license, shap3d, bundled: { 'web-ifc': webIfcVersion }, files: [...files, 'package.json'] },
        null,
        2,
      ) + '\n',
    );
  },
});

export default defineConfig({
  publicDir: false,
  plugins: [packageFiles()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'plugin.js' },
  },
});

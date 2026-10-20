import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Builds the installable plugin folder dist/: plugin.js (src/ as one ES module, texts included),
// the OpenSCAD WebAssembly build, the Liberation fonts for text() and a package.json that tells
// Shap3D.ai which file to start. Install it in Shap3D.ai via Plugins › Load plugin folder… › dist.

const require = createRequire(import.meta.url);
const manifest = JSON.parse(readFileSync('package.json', 'utf8'));
const packageDir = (name: string) => dirname(require.resolve(`${name}/package.json`));
const versionOf = (name: string) => JSON.parse(readFileSync(join(packageDir(name), 'package.json'), 'utf8')).version;

/** files that ship next to plugin.js: OpenSCAD itself, the fonts, docs and the package manifest */
const packageFiles = (): Plugin => ({
  name: 'shap3d-plugin-package',
  generateBundle() {
    const emit = (fileName: string, source: string | Uint8Array) => this.emitFile({ type: 'asset', fileName, source });
    emit('openscad.js', readFileSync(join(packageDir('openscad-wasm'), 'openscad.js')));
    const fontDir = packageDir('@typopro/dtp-liberation');
    for (const name of readdirSync(fontDir).filter((file) => file.endsWith('.ttf'))) {
      emit(`fonts/${name}`, readFileSync(join(fontDir, name)));
    }
    emit('README.md', readFileSync('README.md'));
    emit('THIRD-PARTY-NOTICES.md', readFileSync('THIRD-PARTY-NOTICES.md'));
    const bundled = { 'openscad-wasm': versionOf('openscad-wasm'), '@typopro/dtp-liberation': versionOf('@typopro/dtp-liberation') };
    const { name, version, description, license } = manifest;
    const shap3d = { id: manifest.shap3d.id, main: 'plugin.js' };
    emit('package.json', JSON.stringify({ name, version, description, license, shap3d, bundled }, null, 2) + '\n');
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

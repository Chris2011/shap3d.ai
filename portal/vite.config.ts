import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The plugin portal: a page of its own, built into dist/ (index.html and its assets) – the plugin release
// workflow puts it on GitHub Pages next to the catalog (plugins/index.json) it reads. `base: './'` keeps every path
// relative, so it works at https://<owner>.github.io/<repo>/ as well as anywhere else.
// A package of its own, like the plugins – in this folder:
//   npm install, npm run dev (with ?catalog=<url of an index.json> to show a catalog), npm run build
export default defineConfig({
  base: './',
  plugins: [vue()],
  build: { outDir: 'dist', emptyOutDir: true },
});

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

/** Only what the components need to build – no AI proxy, remote API or security policy of the app's `vite.config.ts`. */
export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(JSON.parse(readFileSync('package.json', 'utf8')).version) },
  plugins: [vue(), tailwindcss()],
  // the Noise and Level editor packages bundle the generators of packages/procgen (like their own vite.config.ts)
  resolve: { alias: { '@shap3d/procgen': fileURLToPath(new URL('../packages/procgen/src/index.ts', import.meta.url)) } },
});

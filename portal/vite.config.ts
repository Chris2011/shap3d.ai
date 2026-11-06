import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// The plugin portal: a page of its own, built into dist/ (index.html and its assets) – the plugin release
// workflow puts it on GitHub Pages next to the catalog (plugins/index.json) it reads. `base: './'` keeps every path
// relative, so it works at https://<owner>.github.io/<repo>/ as well as anywhere else.
// A package of its own, like the plugins – in this folder:
//   npm install, npm run dev (with ?catalog=<url of an index.json> to show a catalog), npm run build
// what the built portal may load and run: READMEs of community plugins are shown in it, so no inline scripts
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  'img-src https: data:',
  'connect-src https:',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join('; ');

export default defineConfig({
  base: './',
  plugins: [
    vue(),
    {
      name: 'security-policy',
      apply: 'build',
      transformIndexHtml: () => [
        { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CONTENT_SECURITY_POLICY }, injectTo: 'head-prepend' },
      ],
    },
  ],
  build: { outDir: 'dist', emptyOutDir: true },
});

/**
 * What the built app may load and run. `script-src` has no 'unsafe-inline': markup smuggled into a page (an `onerror`
 * attribute, a `<script>`) does not run. 'unsafe-eval' and blob: stay because scripts and installed plugins are the point of the
 * app; connect-src stays open because AI providers and plugin catalogs are at any address the user chooses.
 * The same policy is in src-tauri/tauri.conf.json and tools/nginx-security.conf.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' blob: 'unsafe-eval' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: blob:",
  "media-src 'self' blob: data:",
  "connect-src 'self' https: http: ws: wss: data: blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  "frame-src 'none'",
].join('; ');

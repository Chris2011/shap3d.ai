/** Can this browser create a WebGL context? Checked before the editor bundle is loaded (main.ts). */

export function webglAvailable(): boolean {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('nowebgl')) return false; // test the error screen
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext(); // free the probe context right away
    return true;
  } catch { return false; }
}

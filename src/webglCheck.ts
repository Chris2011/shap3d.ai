/** Can this browser create a WebGL context? Checked before the editor bundle is loaded (main.ts). */

export const webglAvailable = (): boolean => {
  if (import.meta.env.DEV && new URLSearchParams(location.search).has('nowebgl')) {
    return false;
  } // test the error screen
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!context) {
      return false;
    }
    context.getExtension('WEBGL_lose_context')?.loseContext(); // free the probe context right away
    return true;
  } catch {
    return false;
  }
};

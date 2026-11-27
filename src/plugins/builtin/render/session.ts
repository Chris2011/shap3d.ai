// One renderer and path tracer for the whole session: its big shader takes long to compile the first time (up to a
// minute with Direct3D under Windows), so it is kept while the plugin runs instead of being built anew for every picture.
import * as THREE from 'three';
import { WebGLPathTracer } from 'three-gpu-pathtracer';

interface Session {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  tracer: WebGLPathTracer;
}
let session: Session | null = null;

/** the session, made the first time it is needed */
export const traceSession = () => {
  if (!session) {
    const canvas = document.createElement('canvas');
    canvas.className = 'block bg-black';
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    const tracer = new WebGLPathTracer(renderer);
    tracer.multipleImportanceSampling = true; // the sun only counts with it
    tracer.minSamples = 1;
    tracer.fadeDuration = 0;
    session = { canvas, renderer, tracer };
  }
  return session;
};

/**
 * whether the path-tracing shader is still being compiled.
 * shortcut: reads the tracer's private `_pathTracer.isCompiling` – there is no public flag in 0.0.27; check it on updates.
 */
export const isCompiling = (tracer: WebGLPathTracer) =>
  !!(tracer as unknown as { _pathTracer?: { isCompiling?: boolean } })._pathTracer?.isCompiling;

/** frees the graphics memory when the plugin stops */
export const disposeTraceSession = () => {
  session?.tracer.dispose();
  session?.renderer.dispose();
  session = null;
};

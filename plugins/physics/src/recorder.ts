import { pluginContext, t } from './runtime';
import { usePhysicsState } from './state';

/**
 * A video of the 3D view: each frame the view and the drawing over it (drops, smoke, joints) are put together on a
 * canvas of their own, which the browser records (MediaRecorder) – MP4 where the browser can, else WebM. Stopping
 * saves the file.
 */

/** the canvas the plugin's drawing goes onto – noted by the overlay drawer */
let overlayCanvas: HTMLCanvasElement | null = null;
export const noteOverlayCanvas = (canvas: HTMLCanvasElement) => {
  overlayCanvas = canvas;
};

const FORMATS = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];

let recorder: MediaRecorder | null = null;
let frame = 0;

export const isRecording = () => !!recorder;

export const startRecording = () => {
  if (recorder) {
    return;
  }
  const context = pluginContext();
  const view = context.editor.viewer.renderer.domElement;
  const type = typeof MediaRecorder === 'undefined' ? undefined : FORMATS.find((format) => MediaRecorder.isTypeSupported(format));
  if (!type) {
    context.ui.toast(t('physics.record.unsupported'));
    return;
  }
  // even sizes – video encoders want them
  const out = document.createElement('canvas');
  out.width = view.width - (view.width % 2);
  out.height = view.height - (view.height % 2);
  const paint = out.getContext('2d')!;
  const chunks: Blob[] = [];
  const started = performance.now();
  recorder = new MediaRecorder(out.captureStream(30), { mimeType: type, videoBitsPerSecond: 8_000_000 });
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: type.split(';')[0] });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${context.editor.model.name || 'physics'}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
    context.ui.toast(t('physics.record.saved', { file: link.download }));
  };
  const state = usePhysicsState();
  state.recording = { seconds: 0 };
  const draw = () => {
    paint.drawImage(view, 0, 0, out.width, out.height);
    if (overlayCanvas) {
      paint.drawImage(overlayCanvas, 0, 0, out.width, out.height);
    }
    if (state.recording) {
      state.recording.seconds = Math.floor((performance.now() - started) / 1000);
    }
    frame = requestAnimationFrame(draw);
  };
  draw();
  recorder.start(500);
};

export const stopRecording = () => {
  if (!recorder) {
    return;
  }
  cancelAnimationFrame(frame);
  recorder.stop();
  recorder = null;
  usePhysicsState().recording = null;
};

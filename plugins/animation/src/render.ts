import { currentScene, showFrame } from './apply';
import { pluginContext, t } from './runtime';
import { pause, refresh } from './player';
import { learn, useAnimationState } from './state';
import { makeZip } from './zip';

/**
 * Rendering the animation – frame by frame at a fixed frame rate, however long each frame takes to draw: every frame
 * is set, drawn at the chosen size through the shot's camera and kept as an image (the 3D view and the drawing over
 * it put together). Then either the images go into a ZIP (a PNG sequence), or they are played into the browser's
 * video recorder (MediaRecorder) exactly at the frame rate – MP4 where the browser can, else WebM.
 */

export interface RenderOptions {
  kind: 'video' | 'png';
  width: number;
  height: number;
  /** the frames to render (the scene's range by default) */
  from?: number;
  to?: number;
  /** the drawing over the 3D view (labels, other plugins' drawings) goes into the images too */
  overlay?: boolean;
}

const VIDEO_TYPES = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];

export const videoType = () =>
  typeof MediaRecorder === 'undefined' ? undefined : VIDEO_TYPES.find((type) => MediaRecorder.isTypeSupported(type));

/** set by the Stop button – checked between frames */
const stop = { requested: false };
export const cancelRender = () => {
  stop.requested = true;
};

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

const save = (blob: Blob, name: string) => {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
};

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error(type))), type, quality));

/** draws every frame and keeps it as an image */
const renderFrames = async (options: RenderOptions, type: string) => {
  const context = pluginContext();
  const editor = context.editor;
  const viewer = editor.viewer;
  const state = useAnimationState();
  const scene = currentScene();
  const from = Math.round(options.from ?? scene.start);
  const to = Math.round(options.to ?? scene.end);
  const width = Math.round(options.width) - (Math.round(options.width) % 2);
  const height = Math.round(options.height) - (Math.round(options.height) % 2);
  // what is put back afterwards
  const saved = {
    width: viewer.width,
    height: viewer.height,
    pixelRatio: viewer.renderer.getPixelRatio(),
    camera: viewer.rig.getState(),
    ortho: viewer.rig.isOrtho,
    axes: editor.model.settings.axes,
    selection: [...editor.selection.values()],
    overlayStyle: { width: viewer.overlay.canvas.style.width, height: viewer.overlay.canvas.style.height },
    frame: state.frame,
  };
  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const paint = out.getContext('2d')!;
  const frames: Blob[] = [];
  try {
    editor.clearSelection();
    editor.model.settings.axes = false;
    editor.invalidate();
    viewer.renderer.setPixelRatio(1);
    viewer.resize(width, height);
    // the overlay keeps its place on the page – only its pixels follow the size
    Object.assign(viewer.overlay.canvas.style, saved.overlayStyle);
    const withCamera = scene.cameras.length > 0;
    for (let frame = from; frame <= to && !stop.requested; frame++) {
      state.frame = frame;
      showFrame(frame, { camera: withCamera });
      // the editor builds the view if it must (a material's opacity changed), with the places and looks shown
      viewer.onFrame?.();
      viewer.render();
      paint.clearRect(0, 0, width, height);
      paint.drawImage(viewer.canvas, 0, 0, width, height);
      if (options.overlay) {
        paint.drawImage(viewer.overlay.canvas, 0, 0, width, height);
      }
      frames.push(await toBlob(out, type, type === 'image/png' ? undefined : 0.95));
      state.rendering = { phase: 'frames', progress: (frame - from + 1) / (to - from + 1) };
      // the page stays responsive (and the progress shows) every few frames
      if (frame % 4 === 0) {
        await nextFrame();
        // the app may have drawn the view in between at its own size
        if (viewer.width !== width || viewer.height !== height) {
          viewer.resize(width, height);
          Object.assign(viewer.overlay.canvas.style, saved.overlayStyle);
        }
      }
    }
  } finally {
    editor.model.settings.axes = saved.axes;
    viewer.renderer.setPixelRatio(saved.pixelRatio);
    viewer.resize(saved.width, saved.height);
    viewer.rig.applyState(saved.camera, false);
    viewer.rig.isOrtho = saved.ortho;
    viewer.rig.syncOrtho();
    editor.select(saved.selection);
    editor.invalidate();
    state.frame = saved.frame;
    refresh();
  }
  return { frames, from, width, height };
};

/** plays the images into the video recorder at the frame rate – each one shown for exactly its time */
const encodeVideo = async (frames: Blob[], width: number, height: number, fps: number, mimeType: string) => {
  const state = useAnimationState();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const paint = canvas.getContext('2d')!;
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as MediaStreamTrack & { requestFrame?: () => void };
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: Math.round(width * height * fps * 0.15) });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => event.data.size && chunks.push(event.data);
  const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
  // the first image is there before the recorder starts
  let next = createImageBitmap(frames[0]);
  paint.drawImage(await next, 0, 0);
  recorder.start();
  const started = performance.now();
  const duration = 1000 / fps;
  for (let index = 0; index < frames.length && !stop.requested; index++) {
    const image = await next;
    next = index + 1 < frames.length ? createImageBitmap(frames[index + 1]) : next;
    // wait for this frame's moment
    const due = started + index * duration;
    const wait = due - performance.now();
    if (wait > 1) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    paint.drawImage(image, 0, 0);
    track.requestFrame?.();
    image.close();
    state.rendering = { phase: 'video', progress: (index + 1) / frames.length };
  }
  // the last image stays for its time too
  await new Promise((resolve) => setTimeout(resolve, duration));
  recorder.stop();
  await stopped;
  return new Blob(chunks, { type: mimeType.split(';')[0] });
};

const pad = (frame: number) => String(frame).padStart(4, '0');

/** renders the animation and saves it – a video or a ZIP of PNG images; resolves when it is saved */
export const renderAnimation = async (options: RenderOptions) => {
  const context = pluginContext();
  const state = useAnimationState();
  if (state.rendering) {
    return;
  }
  const mimeType = videoType();
  if (options.kind === 'video' && !mimeType) {
    context.ui.toast(t('animation.render.unsupported'));
    return;
  }
  pause();
  stop.requested = false;
  state.rendering = { phase: 'frames', progress: 0 };
  const name = context.editor.model.name || 'animation';
  try {
    const imageType = options.kind === 'png' ? 'image/png' : 'image/jpeg';
    const { frames, from, width, height } = await renderFrames(options, imageType);
    if (stop.requested || !frames.length) {
      context.ui.toast(t('animation.render.cancelled'));
      return;
    }
    if (options.kind === 'png') {
      state.rendering = { phase: 'zip', progress: 0 };
      const zip = await makeZip(
        frames.map((blob, index) => ({ name: `${name}-${pad(from + index)}.png`, blob })),
        (progress) => (state.rendering = { phase: 'zip', progress }),
      );
      save(zip, `${name}-png.zip`);
      context.ui.toast(t('animation.render.savedImages', { count: frames.length, file: `${name}-png.zip` }));
    } else {
      const video = await encodeVideo(frames, width, height, currentScene().fps, mimeType!);
      if (stop.requested) {
        context.ui.toast(t('animation.render.cancelled'));
        return;
      }
      const file = `${name}.${mimeType!.startsWith('video/mp4') ? 'mp4' : 'webm'}`;
      save(video, file);
      context.ui.toast(t('animation.render.saved', { file }));
    }
    learn('rendered');
  } catch (error) {
    console.error(error);
    context.ui.toast(t('animation.render.failed', { message: (error as Error).message }));
  } finally {
    state.rendering = null;
  }
};

/** one frame as a PNG (data URL) – for scripts and the shot list's pictures */
export const renderStill = async (frame: number, width: number, height: number) => {
  const { frames } = await renderFrames({ kind: 'png', width, height, from: frame, to: frame, overlay: false }, 'image/png');
  const blob = frames[0];
  return await new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(blob);
  });
};

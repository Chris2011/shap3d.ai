import type { PluginContext } from '../../../src/plugins/types';
import workerSource from './compileWorker.js?raw';
import { FONTS_CONF, FONT_DIR, LIBRARY_DIR, isFont } from './fonts';
import { t } from './i18n';
import { consoleLines, materialsFromColors, meshFromArrays, type ConsoleLine, type OffArrays, type ScadMesh } from './off';
import type { Settings } from './settings';

/** the worker with OpenSCAD in it (about 14 MB) stays this long after a compile, then its memory is free again */
const IDLE_MS = 60_000;

/** what the worker answers to a compile */
interface WorkerAnswer {
  id: number;
  log: string[];
  exitCode: number;
  aborted: string | null;
  hasOutput: boolean;
  mesh: OffArrays | null;
  /** the worker itself failed */
  failed?: string;
}

export type Status = 'idle' | 'loading' | 'ready' | 'failed';

/** an error for the script console – without the stack trace of the plugin code */
export const scriptError = (message: string, lines?: ConsoleLine[]) => {
  const error = new Error(message) as Error & { lines?: ConsoleLine[] };
  error.stack = message;
  error.lines = lines;
  return error;
};

/**
 * OpenSCAD itself: a worker that runs the WebAssembly module, so nothing stops the app however long a
 * model takes, the file library (include/use/import(), fonts) it gets, and compile().
 */
export const createEngine = (context: PluginContext, settings: Settings) => {
  /** called when status or library change (the panel re-renders) */
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) {
      listener();
    }
  };
  const libraryListeners = new Set<() => void>();

  // ---------------------------------------------------------------- file library
  /** path → bytes, copied to the worker */
  const library = new Map<string, Uint8Array>();
  const loadLibrary = async () => {
    library.clear();
    for (const { path } of await context.storage.files.list()) {
      const blob = await context.storage.files.get(path);
      if (blob) {
        library.set(path, new Uint8Array(await blob.arrayBuffer()));
      }
    }
    changed();
  };
  // read from IndexedDB right away – the worker waits for it, so no compile misses library files
  const libraryReady = loadLibrary().catch((error) => console.error('OpenSCAD library:', error));

  /** fonts shipped in the plugin package (fonts/*.ttf) – only read for the worker */
  const bundledFonts = () =>
    Promise.all(
      context.assets
        .list()
        .filter((path) => /^fonts\/.+\.(ttf|otf)$/i.test(path))
        .map(async (path) => ({
          name: path.split('/').pop()!,
          data: new Uint8Array((await context.assets.blob(path)?.arrayBuffer()) ?? new ArrayBuffer(0)),
        })),
    );

  // ---------------------------------------------------------------- the worker
  const status = { state: 'idle' as Status, error: '' };
  const setStatus = (state: Status, error = '') => {
    status.state = state;
    status.error = error;
    changed();
  };

  const sendLibrary = async (target: Worker) => {
    target.postMessage({
      type: 'setup',
      setup: {
        libraryDir: LIBRARY_DIR,
        fontDir: FONT_DIR,
        fontsConf: FONTS_CONF,
        fonts: await bundledFonts(),
        library: [...library].map(([path, data]) => ({ path, data, font: isFont(path) })),
      },
    });
  };

  let worker: Worker | null = null;
  let workerUrl = '';
  let starting: Promise<Worker> | null = null;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  const pending = new Map<number, { resolve: (answer: WorkerAnswer) => void; reject: (error: Error) => void }>();

  const stopWorker = () => {
    clearTimeout(idleTimer);
    worker?.terminate();
    worker = null;
    starting = null;
    if (workerUrl) {
      URL.revokeObjectURL(workerUrl);
      workerUrl = '';
    }
  };

  const startWorker = () =>
    (starting ??= (async () => {
      await libraryReady;
      setStatus('loading');
      workerUrl = URL.createObjectURL(new Blob([workerSource], { type: 'text/javascript' }));
      const created = new Worker(workerUrl, { type: 'module' });
      await sendLibrary(created);
      await new Promise<void>((resolve, reject) => {
        created.onerror = (event) => reject(new Error(event.message || 'worker'));
        created.onmessage = ({ data }) => (data.loaded ? resolve() : reject(new Error(data.error)));
        created.postMessage({ type: 'load', url: context.assets.url('openscad.js') });
      });
      created.onerror = (event) => {
        // the worker is gone (out of memory …): what waited for it has failed, the next compile starts a new one
        stopWorker();
        setStatus('idle');
        for (const job of pending.values()) {
          job.reject(new Error(event.message || 'worker'));
        }
        pending.clear();
      };
      created.onmessage = ({ data }: MessageEvent<WorkerAnswer>) => {
        pending.get(data.id)?.resolve(data);
        pending.delete(data.id);
      };
      worker = created;
      setStatus('ready');
      return created;
    })().catch((error) => {
      stopWorker();
      setStatus('failed', (error as Error)?.message ?? String(error));
      throw error;
    }));

  const scheduleStop = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!pending.size) {
        stopWorker();
        setStatus('idle');
      }
    }, IDLE_MS);
  };

  /** loads OpenSCAD ahead of the first compile */
  const warm = async () => {
    await startWorker();
    scheduleStop();
  };

  let nextJob = 1;
  /** one compile after the other – each needs a whole OpenSCAD in memory */
  let queue: Promise<unknown> = Promise.resolve();
  const runInWorker = (code: string, fileName: string) => {
    const job = queue.then(async () => {
      const target = await startWorker();
      clearTimeout(idleTimer);
      const id = nextJob++;
      try {
        return await new Promise<WorkerAnswer>((resolve, reject) => {
          pending.set(id, { resolve, reject });
          target.postMessage({ id, code, fileName, backend: settings.backend });
        });
      } finally {
        scheduleStop();
      }
    });
    queue = job.catch(() => {});
    return job;
  };

  const libraryChanged = () => {
    changed();
    for (const listener of libraryListeners) {
      listener();
    }
    if (worker) {
      void sendLibrary(worker);
    }
  };
  const addToLibrary = async (files: File[]) => {
    for (const file of files) {
      const path = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
      await context.storage.files.put(path, file);
      library.set(path, new Uint8Array(await file.arrayBuffer()));
    }
    libraryChanged();
  };
  const removeFromLibrary = async (paths: string[]) => {
    for (const path of paths) {
      await context.storage.files.remove(path);
      library.delete(path);
    }
    libraryChanged();
  };

  /** Runs OpenSCAD in the worker; returns the mesh and the console lines, throws with OpenSCAD's error message. */
  const compile = async (code: string, fileName = '.input.scad') => {
    let answer: WorkerAnswer;
    try {
      answer = await runInWorker(code, fileName);
    } catch (error) {
      throw scriptError(t('openscad.errors.loadFailed', { error: (error as Error)?.message ?? String(error) }));
    }
    if (answer.failed) {
      throw scriptError(t('openscad.errors.loadFailed', { error: answer.failed }));
    }
    const log = answer.log;
    if (answer.aborted) {
      log.push(`ERROR: ${t('openscad.errors.aborted', { error: answer.aborted })}`);
    }
    const lines = consoleLines(log);
    if (answer.exitCode !== 0 || !answer.hasOutput) {
      const firstError =
        lines.find((line) => line.kind === 'error')?.text ??
        (log.some((line) => /top level object is not a 3D/i.test(line)) ? t('openscad.errors.topLevel2d') : null) ??
        (log.some((line) => /top level object is empty/i.test(line)) ? t('openscad.errors.empty') : null) ??
        t('openscad.errors.no3d', { code: answer.exitCode });
      throw scriptError(firstError, lines);
    }
    if (!answer.mesh) {
      throw scriptError(t('openscad.errors.noOff'), lines);
    }
    const { vertices, faces, colors } = meshFromArrays(answer.mesh);
    const { faceMaterials, materials } = materialsFromColors(colors, context.THREE);
    const mesh: ScadMesh = { vertices, faces, faceMaterials, materials };
    if (!mesh.faces.length) {
      throw scriptError(t('openscad.errors.emptyMaybe2d'), lines);
    }
    return { mesh, lines };
  };

  context.onDispose(() => {
    stopWorker();
    listeners.clear();
    libraryListeners.clear();
  });

  return {
    library,
    status,
    warm,
    compile,
    addToLibrary,
    removeFromLibrary,
    /** listener for status and library changes; returns its removal */
    onChange: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    /** listener for changes of the library only (what was computed with the old files is out of date) */
    onLibraryChange: (listener: () => void) => {
      libraryListeners.add(listener);
    },
  };
};

export type Engine = ReturnType<typeof createEngine>;

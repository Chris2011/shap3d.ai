import type { PluginContext } from '../../../src/plugins/types';
import { FONTS_CONF, FONT_DIR, LIBRARY_DIR, isFont } from './fonts';
import { t } from './i18n';
import { consoleLines, materialsFromColors, parseOff, type ConsoleLine, type ScadMesh } from './off';
import type { Settings } from './settings';

/**
 * One OpenSCAD instance can only run once, and s3d.scad() needs one synchronously – so instances
 * are prepared ahead: at least POOL_MIN, more when a script needs more (learned per run, up to POOL_MAX).
 */
export const POOL_MIN = 2;
export const POOL_MAX = 24;

/** the parts of Emscripten's file system the plugin uses */
interface EmscriptenFS {
  mkdir: (path: string) => void;
  writeFile: (path: string, data: string | Uint8Array) => void;
  readFile: (path: string, options: { encoding: 'utf8' }) => string;
}
interface OpenScadInstance {
  FS: EmscriptenFS;
  callMain: (args: string[]) => number;
}
/** openscad.js from the npm package openscad-wasm (shipped next to plugin.js) */
interface OpenScadModule {
  createOpenSCAD: (options: {
    noInitialRun: boolean;
    print: (line: string) => void;
    printErr: (line: string) => void;
    preRun: ((module: { ENV: Record<string, string> }) => void)[];
  }) => Promise<{ getInstance: () => OpenScadInstance }>;
}

/** a prepared instance with its console output */
interface Ready {
  instance: OpenScadInstance;
  log: string[];
  generation: number;
}

export type Status = 'idle' | 'loading' | 'ready' | 'failed';

/** an error for the script console – without the stack trace of the plugin code */
export const scriptError = (message: string, lines?: ConsoleLine[]) => {
  const error = new Error(message) as Error & { lines?: ConsoleLine[] };
  error.stack = message;
  error.lines = lines;
  return error;
};

/** mkdir -p inside the instance's file system */
const makeDirectories = (fs: EmscriptenFS, path: string) => {
  let current = '';
  for (const part of path.split('/').filter(Boolean)) {
    current += '/' + part;
    try {
      fs.mkdir(current);
    } catch {
      /* exists */
    }
  }
};
const writeFile = (fs: EmscriptenFS, path: string, data: string | Uint8Array) => {
  makeDirectories(fs, path.slice(0, path.lastIndexOf('/')));
  fs.writeFile(path, data);
};

/**
 * OpenSCAD itself: the WebAssembly module, a pool of prepared instances, the file library
 * (include/use/import(), fonts) that every instance gets, and compile().
 */
export const createEngine = (context: PluginContext, settings: Settings) => {
  /** called when status or library change (the panel re-renders) */
  const listeners = new Set<() => void>();
  const changed = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  // ---------------------------------------------------------------- file library
  /** path → bytes, mirrored into every OpenSCAD instance */
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
  // read from IndexedDB right away – every instance waits for it, so none misses library files
  const libraryReady = loadLibrary().catch((error) => console.error('OpenSCAD library:', error));
  /** fonts shipped in the plugin package (fonts/*.ttf): name → bytes */
  const bundledFonts = new Map<string, Uint8Array>();
  const fontsReady = Promise.all(
    context.assets
      .list()
      .filter((path) => /^fonts\/.+\.(ttf|otf)$/i.test(path))
      .map(async (path) => {
        const blob = context.assets.blob(path);
        if (blob) {
          bundledFonts.set(path.split('/').pop()!, new Uint8Array(await blob.arrayBuffer()));
        }
      }),
  ).catch((error) => console.error('OpenSCAD fonts:', error));

  // ---------------------------------------------------------------- instances
  let modulePromise: Promise<OpenScadModule> | null = null;
  const loadModule = () => (modulePromise ??= import(/* @vite-ignore */ context.assets.url('openscad.js')) as Promise<OpenScadModule>);
  const status = { state: 'idle' as Status, error: '' };
  const setStatus = (state: Status, error = '') => {
    status.state = state;
    status.error = error;
    changed();
  };

  let generation = 0; // bumped when the library changes – older instances lack the new files
  const createInstance = async (): Promise<Ready> => {
    await Promise.all([libraryReady, fontsReady]);
    const module = await loadModule();
    const log: string[] = [];
    const openscad = await module.createOpenSCAD({
      noInitialRun: true,
      print: (line) => log.push(line),
      printErr: (line) => log.push(line),
      preRun: [
        (instanceModule) => {
          instanceModule.ENV.OPENSCADPATH = LIBRARY_DIR;
          instanceModule.ENV.FONTCONFIG_FILE = `${FONT_DIR}/fonts.conf`;
        },
      ],
    });
    const instance = openscad.getInstance();
    makeDirectories(instance.FS, LIBRARY_DIR);
    makeDirectories(instance.FS, FONT_DIR);
    instance.FS.writeFile(`${FONT_DIR}/fonts.conf`, FONTS_CONF);
    for (const [name, data] of bundledFonts) {
      instance.FS.writeFile(`${FONT_DIR}/${name}`, data);
    }
    for (const [path, data] of library) {
      writeFile(instance.FS, `${LIBRARY_DIR}/${path}`, data);
      if (isFont(path)) {
        instance.FS.writeFile(`${FONT_DIR}/${path.split('/').pop()}`, data);
      }
    }
    return { instance, log, generation };
  };

  // spare instances, prepared in the background; the target grows with what scripts need
  const spares: Ready[] = [];
  let poolTarget = Math.min(POOL_MAX, Math.max(POOL_MIN, context.storage.get('poolTarget', POOL_MIN)));
  let warming: Promise<void> | null = null;
  const warm = (target = poolTarget): Promise<void> => {
    if (spares.length >= target) {
      return warming ?? Promise.resolve();
    }
    if (warming) {
      return warming.then(() => warm(target));
    }
    if (status.state !== 'ready') {
      setStatus('loading');
    } // refilling after a run keeps "ready"
    warming = (async () => {
      try {
        while (spares.length < target) {
          const ready = await createInstance();
          if (ready.generation === generation) {
            spares.push(ready);
          }
        }
        setStatus('ready');
      } catch (error) {
        modulePromise = null;
        setStatus('failed', (error as Error)?.message ?? String(error));
        throw error;
      } finally {
        warming = null;
      }
    })();
    return warming;
  };
  const takeSpare = () => {
    const ready = spares.shift() ?? null;
    warm().catch(() => {});
    return ready;
  };
  const instanceAsync = async () => takeSpare() ?? (await warm(), takeSpare()) ?? createInstance();

  /** grows the pool after a script needed more instances than prepared; returns the new target */
  const growPool = (calls: number, loopGuess: number) => {
    poolTarget = Math.min(POOL_MAX, Math.max(poolTarget * 2, calls * 3, loopGuess));
    context.storage.set('poolTarget', poolTarget);
    warm().catch(() => {});
    return poolTarget;
  };

  const libraryChanged = () => {
    generation++;
    spares.length = 0;
    changed();
    if (status.state !== 'idle') {
      warm().catch(() => {});
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

  /** Runs OpenSCAD once; returns the mesh and the console lines, throws with OpenSCAD's error message. */
  const compile = ({ instance, log }: Ready, code: string, fileName = '.input.scad') => {
    // the input sits in the library folder, so include/use/import() find the library files next to it
    const inputPath = `${LIBRARY_DIR}/${fileName}`;
    writeFile(instance.FS, inputPath, code);
    let exitCode: number;
    try {
      exitCode = instance.callMain([inputPath, '-o', '/output.off', `--backend=${settings.backend}`]);
    } catch (error) {
      exitCode = -1;
      log.push(`ERROR: ${t('openscad.errors.aborted', { error: (error as Error)?.message ?? error })}`);
    }
    let off: string | null = null;
    try {
      off = instance.FS.readFile('/output.off', { encoding: 'utf8' });
    } catch {
      /* no output */
    }
    const lines = consoleLines(log);
    if (exitCode !== 0 || !off) {
      const firstError =
        lines.find((line) => line.kind === 'error')?.text ??
        (log.some((line) => /top level object is not a 3D/i.test(line)) ? t('openscad.errors.topLevel2d') : null) ??
        (log.some((line) => /top level object is empty/i.test(line)) ? t('openscad.errors.empty') : null) ??
        t('openscad.errors.no3d', { code: exitCode });
      throw scriptError(firstError, lines);
    }
    const { vertices, faces, colors } = parseOff(off);
    const { faceMaterials, materials } = materialsFromColors(colors, context.THREE);
    const mesh: ScadMesh = { vertices, faces, faceMaterials, materials };
    if (!mesh.faces.length) {
      throw scriptError(t('openscad.errors.emptyMaybe2d'), lines);
    }
    return { mesh, lines };
  };

  // load in the background shortly after start – the WebAssembly file is about 14 MB
  const preload = setTimeout(() => warm().catch(() => {}), 1500);
  context.onDispose(() => {
    clearTimeout(preload);
    spares.length = 0;
    listeners.clear();
  });

  return {
    library,
    status,
    warm,
    takeSpare,
    instanceAsync,
    growPool,
    get poolTarget() {
      return poolTarget;
    },
    compile,
    addToLibrary,
    removeFromLibrary,
    /** listener for status and library changes; returns its removal */
    onChange: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

export type Engine = ReturnType<typeof createEngine>;

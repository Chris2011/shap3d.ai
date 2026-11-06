import type { PluginContext } from '../../../src/plugins/types';
import { scadCompletions } from './completions';
import { scriptError, type Engine } from './engine';
import { EXAMPLES } from './examples';
import { t } from './i18n';
import type { ConsoleLine, ScadMesh } from './off';
import { scaleOf, unitLabel, type Settings } from './settings';

/** computed parts of a script are kept this long after its last run */
const PARTS_KEPT_MS = 120_000;
/** s3d.scad('…') with a plain string in a script – these can be computed before it runs */
const SCAD_LITERAL = /\b(?:s3d|su|fw)\s*\.\s*scad\s*\(\s*(`(?:[^`\\$]|\\.|\$(?!\{))*`|'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g;

/**
 * OpenSCAD shows no edges at all, and details like gear teeth turned into a thicket of lines. Only what is close to a
 * right angle or sharper stays a line: the edges of a cube, the rims of parts. The faces still show the corners by their shade.
 */
const LINE_FROM_DEGREES = 87.5;

export const meshOptions = (settings: Settings) => ({ scale: scaleOf(settings), smooth: LINE_FROM_DEGREES });

/** the faces, made in a worker (versions of the app without `prepare` make them in `add`) */
const prepared = async (context: PluginContext, settings: Settings, mesh: ScadMesh) =>
  (await context.meshes.prepare?.(mesh, meshOptions(settings))) ?? mesh;

/** adds a mesh as a group to the model – one undo step, materials included */
export const addToModel = async (context: PluginContext, settings: Settings, mesh: ScadMesh, name: string) => {
  context.meshes.add(await prepared(context, settings, mesh), { ...meshOptions(settings), name, materials: mesh.materials });
};

/** a part of a script: what OpenSCAD and the mesh worker made of one s3d.scad() call */
type Part =
  | { lines: ConsoleLine[]; materials: ScadMesh['materials']; faces: Awaited<ReturnType<typeof prepared>> }
  | { error: Error & { lines?: ConsoleLine[] } };

/** OpenSCAD in the script editor (language, examples, help, completion) and s3d.scad() for JavaScript scripts */
export const registerScripting = (context: PluginContext, engine: Engine, settings: Settings) => {
  context.script.registerLanguage({
    id: 'openscad',
    label: 'OpenSCAD',
    highlight: 'js',
    help: 'openscad.help',
    examples: EXAMPLES,
    run: async (code) => {
      const startedAt = performance.now();
      try {
        const { mesh, lines } = await engine.compile(code);
        await addToModel(context, settings, mesh, 'OpenSCAD');
        const result = t('openscad.result', { count: mesh.faces.length, unit: unitLabel(settings.unit) });
        return { ok: true, logs: [...lines, { kind: 'result', text: result }], durationMs: performance.now() - startedAt };
      } catch (error) {
        const message = (error as Error)?.message ?? String(error);
        const lines = (error as { lines?: { kind: 'log' | 'warn' | 'error'; text: string }[] }).lines ?? [];
        return {
          ok: false,
          logs: lines.filter((line) => line.text !== message),
          error: message,
          durationMs: performance.now() - startedAt,
        };
      }
    },
  });
  // code completion in the script editor (Shap3D.ai versions without it simply skip this)
  context.script.registerCompletions?.('openscad', scadCompletions);

  // s3d.scad() is called in the middle of a script, which cannot wait: what is not computed yet is
  // computed in the worker, the script stops and the app runs it again. Parts are remembered by their code.
  const parts = new Map<string, Part>();
  const computing = new Map<string, Promise<void>>();
  const partKey = (code: string) => `${settings.backend}|${scaleOf(settings)}|${code}`;
  let forgetTimer: ReturnType<typeof setTimeout> | undefined;
  const forgetLater = () => {
    clearTimeout(forgetTimer);
    forgetTimer = setTimeout(() => parts.clear(), PARTS_KEPT_MS);
  };
  engine.onLibraryChange(() => parts.clear());
  context.onDispose(() => {
    clearTimeout(forgetTimer);
    parts.clear();
  });

  const computePart = (code: string) => {
    const key = partKey(code);
    let running = computing.get(key);
    if (!running) {
      running = (async () => {
        try {
          const { mesh, lines } = await engine.compile(code);
          parts.set(key, { lines, materials: mesh.materials, faces: await prepared(context, settings, mesh) });
        } catch (error) {
          parts.set(key, { error: error as Error });
        } finally {
          computing.delete(key);
          forgetLater();
        }
      })();
      computing.set(key, running);
    }
    return running;
  };

  context.script.beforeRun(async (code) => {
    const written = [...code.matchAll(SCAD_LITERAL)].map((match) => new Function(`return ${match[1]}`)() as string);
    await Promise.all(written.filter((scad) => !parts.has(partKey(scad))).map(computePart));
    forgetLater();
  });

  context.script.extend(
    'scad',
    (api, code: unknown, options: { at?: [number, number, number]; name?: string } = {}) => {
      const part = parts.get(partKey(String(code)));
      if (!part) {
        // only built here while the script runs: its text was not a plain string
        throw Object.assign(scriptError(t('openscad.errors.computing')), { retryAfter: computePart(String(code)) });
      }
      if ('error' in part) {
        for (const line of part.error.lines ?? []) {
          api.warn(line.text);
        }
        throw part.error;
      }
      for (const line of part.lines) {
        if (line.kind === 'log') {
          api.log(line.text);
        } else {
          api.warn(line.text);
        }
      }
      // the script run is one undo step – materials created here are part of it
      for (const [name, material] of Object.entries(part.materials)) {
        api.ensureMaterial(name, material.color, material.opacity);
      }
      const group = api.group(options.name ?? 'OpenSCAD', (inner) => {
        context.meshes.build(inner.ents, part.faces, meshOptions(settings));
      });
      if (options.at) {
        group.move(options.at);
      }
      return group;
    },
    {
      signature: 's3d.scad(openscadCode, { at, name })',
      description: 'openscad.extension',
      example: "s3d.scad('difference() { cube(30, center = true); sphere(20, $fn = 48); }', { at: [0, 0, 0.015] });",
    },
  );
};

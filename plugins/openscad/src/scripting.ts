import type { PluginContext } from '../../../src/plugins/types';
import { scadCompletions } from './completions';
import { POOL_MAX, scriptError, type Engine } from './engine';
import { EXAMPLES } from './examples';
import { formatNumber, t } from './i18n';
import type { ScadMesh } from './off';
import { scaleOf, unitLabel, type Settings } from './settings';

/** instances prepared when s3d.scad() sits in a loop (the count is only known after running) */
const LOOP_GUESS = 12;
/** for/while/forEach/map/times-style repetition in a script */
const LOOP = /\b(for|while)\s*\(|\.(forEach|map|flatMap|reduce)\s*\(|Array\.from\s*\(/;
/** s3d.scad( / su.scad( / fw.scad( in a script */
const SCAD_CALL = /\b(?:s3d|su|fw)\s*\.\s*scad\s*\(/g;

/** adds a mesh as a group to the model – one undo step, materials included */
export const addToModel = (context: PluginContext, settings: Settings, mesh: ScadMesh, name: string) => {
  context.meshes.add(mesh, { name, scale: scaleOf(settings), smooth: 25, materials: mesh.materials });
};

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
        const { mesh, lines } = engine.compile(await engine.instanceAsync(), code);
        addToModel(context, settings, mesh, 'OpenSCAD');
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

  /** s3d.scad() calls since the last script started (to learn how many instances a script needs) */
  let callsThisRun = 0;
  context.script.beforeRun(async (code) => {
    callsThisRun = 0;
    const written = (code.match(SCAD_CALL) ?? []).length;
    if (!written) {
      return;
    }
    // calls in loops are only known after running: guess generously, the learned target covers the rest
    const target = Math.min(POOL_MAX, Math.max(written, engine.poolTarget, LOOP.test(code) ? LOOP_GUESS : 0));
    await engine.warm(target).catch(() => {});
  });

  context.script.extend(
    'scad',
    (api, code: unknown, options: { at?: [number, number, number]; name?: string } = {}) => {
      callsThisRun++;
      const ready = engine.takeSpare();
      if (!ready) {
        if (engine.status.state === 'failed') {
          throw scriptError(t('openscad.errors.loadFailed', { error: engine.status.error }));
        }
        if (engine.status.state !== 'ready') {
          throw scriptError(t('openscad.errors.stillLoading'));
        }
        // more calls than prepared: the script stopped at this call, so the real need is unknown – grow generously
        const target = engine.growPool(callsThisRun, LOOP_GUESS);
        throw scriptError(
          callsThisRun > POOL_MAX
            ? t('openscad.errors.tooManyCalls', { max: formatNumber(POOL_MAX) })
            : t('openscad.errors.morePrepared', { count: target }),
        );
      }
      let result;
      try {
        result = engine.compile(ready, String(code));
      } catch (error) {
        for (const line of (error as { lines?: { text: string }[] }).lines ?? []) {
          api.warn(line.text);
        }
        throw error;
      }
      for (const line of result.lines) {
        if (line.kind === 'log') {
          api.log(line.text);
        } else {
          api.warn(line.text);
        }
      }
      // the script run is one undo step – materials created here are part of it
      for (const [name, material] of Object.entries(result.mesh.materials)) {
        api.ensureMaterial(name, material.color, material.opacity);
      }
      const group = api.group(options.name ?? 'OpenSCAD', (inner) => {
        context.meshes.build(inner.ents, result.mesh, { scale: scaleOf(settings), smooth: 25 });
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

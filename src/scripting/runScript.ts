import * as THREE from 'three';
import type { Editor } from '../engine/editor';
import { ScriptApi } from './scriptApi/scriptApi';
import { scriptErrorText } from './scriptErrors';
import { PLUGIN_EXTENSIONS } from './pluginExtensions';
import type { RunResult } from './scriptTypes';
import type { ScriptWorkerRequest, ScriptWorkerResponse } from './scriptWorker';
import { t } from '../i18n';

/** Run a JavaScript snippet with the `s3d` API as one undoable step. */
export const runScript = (editor: Editor, code: string, label = 'undo.script'): RunResult => {
  const api = new ScriptApi(editor);
  const startedAt = performance.now();
  try {
    editor.commit(label, () => {
      // scripts only get s3d (old names: fw, su)/THREE/console – common browser globals are shadowed
      const compiled = new Function(
        's3d',
        'fw',
        'su',
        'THREE',
        'console',
        'window',
        'document',
        'fetch',
        'localStorage',
        'sessionStorage',
        'indexedDB',
        'XMLHttpRequest',
        'WebSocket',
        'globalThis',
        'self',
        '"use strict";\n' + code,
      );
      const consoleProxy = {
        log: (...args: any[]) => api.log(...args),
        warn: (...args: any[]) => api.warn(...args),
        error: (...args: any[]) => api.warn(...args),
        info: (...args: any[]) => api.log(...args),
      };
      const result = compiled(api, api, api, THREE, consoleProxy);
      if (result instanceof Promise) {
        api.warn(t('script.errors.async'));
      } else if (result !== undefined) {
        api.logs.push({ kind: 'result', text: typeof result === 'string' ? result : JSON.stringify(result) });
      }
    });
    api.afterRun();
    return { ok: true, logs: api.logs, durationMs: performance.now() - startedAt };
  } catch (error: any) {
    return {
      ok: false,
      logs: api.logs,
      error: scriptErrorText(error),
      durationMs: performance.now() - startedAt,
      retryAfter: error?.retryAfter,
    };
  }
};

/** does the code call an s3d function a plugin brought? Those exist only on the main thread. */
const usesPluginExtension = (code: string) =>
  [...code.matchAll(/\.\s*([A-Za-z_$][\w$]*)\s*\(/g)].some(([, name]) => PLUGIN_EXTENSIONS.has(name));

/** so many runs may wait for a script's parts – each one waits for one part, and parts are remembered */
const MAX_SCRIPT_RERUNS = 200;

/** `runScript`, again whenever the script waits for something a plugin makes off the main thread (e.g. `s3d.scad()`). */
const runScriptRerunning = async (editor: Editor, code: string, label: string): Promise<RunResult> => {
  let result = runScript(editor, code, label);
  for (let reruns = 0; result.retryAfter && reruns < MAX_SCRIPT_RERUNS; reruns++) {
    await result.retryAfter.catch(() => {});
    result = runScript(editor, code, label);
  }
  return result;
};

/**
 * Runs a script in a Web Worker (`scriptWorker.ts`), so even huge scripts can't
 * freeze the browser: the heavy geometry building happens off the main thread and
 * only the finished model travels back as one undo step. Meanwhile the status bar
 * shows `statusbar.building`, so the user knows something is being built.
 *
 * Falls back to the synchronous `runScript` when the script needs something only
 * the main thread has (e.g. a plugin's s3d extension) or when no worker is
 * available; inside an open group context the script has to build into the live
 * model anyway.
 */
export const runScriptAsync = async (editor: Editor, code: string, label = 'undo.script'): Promise<RunResult> => {
  if (editor.activePath.length) {
    return runScriptRerunning(editor, code, label);
  }
  // visible while the worker builds – nothing else happens on the main thread, so the run would look "dead"
  const statusBefore = editor.ui.status;
  editor.ui.status = t('statusbar.building');
  try {
    return await runScriptInWorker(editor, code, label);
  } finally {
    editor.ui.status = statusBefore;
  }
};

/** Worker part of `runScriptAsync` (its own function so the status handling around it stays short). */
const runScriptInWorker = async (editor: Editor, code: string, label: string): Promise<RunResult> => {
  const seed = editor.model.toJSON();
  try {
    const worker = new Worker(new URL('./scriptWorker.ts', import.meta.url), { type: 'module' });
    try {
      const response = await new Promise<ScriptWorkerResponse>((resolve, reject) => {
        worker.onerror = (event) => reject(new Error(event.message));
        worker.onmessage = (event) => resolve(event.data as ScriptWorkerResponse);
        // oxlint-disable-next-line unicorn/require-post-message-target-origin -- Worker.postMessage has no targetOrigin
        worker.postMessage({ seed, code } satisfies ScriptWorkerRequest);
      });
      if (!response.ok) {
        // plugin-only s3d extension or similar → retry once on the main thread (same result, just blocking)
        // only for scripts that call an extension of a plugin: on the main thread a script can reach everything
        if (response.retriable && usesPluginExtension(code)) {
          return await runScriptRerunning(editor, code, label);
        }
        return { ok: false, logs: response.logs ?? [], error: response.error, durationMs: response.durationMs };
      }
      // the built model lands as one undo step – commit() snapshots the old model first
      editor.commit(label, () => editor.restoreModel(response.model!));
      // camera commands of the script (recorded in the worker) apply to the restored model
      const view = response.view;
      if (view?.kind === 'view') {
        editor.viewer.rig.standardView(view.name, editor.model.bounds());
      } else if (view?.kind === 'state') {
        editor.viewer.rig.applyState(view.state);
      } else if (view?.kind === 'zoom') {
        editor.zoomExtents(false);
      }
      return { ok: true, logs: response.logs ?? [], durationMs: response.durationMs };
    } finally {
      worker.terminate();
    }
  } catch {
    // worker unavailable (CSP, old webview …) → the classic synchronous path
    return runScriptRerunning(editor, code, label);
  }
};

import * as THREE from 'three';
import { ScriptApi, type ScriptLog } from './api';
import { Model } from '../core/document';
import type { Editor } from '../engine/editor';
import { t } from '../i18n';

/**
 * Script runner for the Web Worker side (`runScriptAsync` in api.ts spawns this).
 *
 * The script builds into its own Model – seeded with the model the main thread
 * had (`seed`) – and the finished state travels back as JSON, which the main
 * thread restores as one undo step (exactly like an undo snapshot). Nothing
 * blocks the UI no matter how big the script is: heavy loops with thousands of
 * s3d calls run off the main thread and the tab stays responsive.
 */
export interface ScriptWorkerRequest {
  /** snapshot of the current model on the main thread – keeps existing content (and plugin data) so scripts can build on it */
  seed: any;
  /** the script code, as typed in the editor/chat */
  code: string;
}
/** s3d.view / s3d.camera / s3d.zoomExtents are called in the script – recorded here, applied on the main thread after the model arrives. */
export type RecordedView =
  | { kind: 'view'; name: 'top' | 'front' | 'back' | 'left' | 'right' | 'iso' | 'bottom' }
  | { kind: 'state'; state: any }
  | { kind: 'zoom' };
export interface ScriptWorkerResponse {
  ok: boolean;
  logs: ScriptLog[];
  durationMs: number;
  error?: string;
  /** the built model as a plain snapshot (same format as `Model.toJSON()`) */
  model?: any;
  view?: RecordedView;
  /** plausible plugin-only s3d extension (only registered on the main thread) → the caller reruns synchronously there */
  retriable?: boolean;
}

/**
 * Runs one script request and answers with the model it built.
 * (Exported so the worker logic can be exercised outside a real worker, e.g. in quick checks.)
 */
export const run = (request: ScriptWorkerRequest): ScriptWorkerResponse => {
  const startedAt = performance.now();
  const model = new Model();
  if (request.seed) {
    model.load(request.seed);
  }
  let view: RecordedView | undefined;
  /**
   * A minimal stand-in for the real Editor: only what ScriptApi touches.
   * The real viewer with its camera rig doesn't exist in a worker – the stock
   * rig records the camera commands above, they are replayed on the main thread.
   */
  const editor = {
    model,
    get entities() {
      return model.root;
    },
    activePath: [],
    zoomExtents() {
      view = { kind: 'zoom' };
    },
    viewer: {
      rig: {
        persp: { fov: 35 },
        isOrtho: false,
        applyState(state: any) {
          view = { kind: 'state', state };
        },
        standardView(name: 'top' | 'front' | 'back' | 'left' | 'right' | 'iso' | 'bottom') {
          view = { kind: 'view', name };
        },
      },
    },
  } as unknown as Editor;
  const api = new ScriptApi(editor, model.root);
  try {
    // scripts only get s3d (old names: fw, su)/THREE/console – common browser globals are shadowed,
    // exactly like in the synchronous runner (kept in sync with runScript in api.ts)
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
      '"use strict";\n' + request.code,
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
    api.afterRun(); // harmless here: routes the camera command through the stub rig above
    return { ok: true, logs: api.logs.slice(), durationMs: performance.now() - startedAt, model: model.toJSON(), view };
  } catch (error: any) {
    const message = error?.message ?? String(error);
    return {
      ok: false,
      logs: api.logs.slice(),
      error: message + (error?.stack ? '\n' + String(error.stack).split('\n').slice(1, 3).join('\n') : ''),
      durationMs: performance.now() - startedAt,
      // "s3d.xyz is not a function / is not defined" usually means a plugin-only extension
      retriable: /is not a function|is not defined/i.test(message),
    };
  }
};

/** Answer to the owner of the worker – `Worker.postMessage` without the Window overload's targetOrigin */
const postToOwner = (response: ScriptWorkerResponse) => {
  (self as unknown as { postMessage: (data: ScriptWorkerResponse) => void }).postMessage(response);
};

addEventListener('message', (event: MessageEvent<ScriptWorkerRequest>) => postToOwner(run(event.data)));

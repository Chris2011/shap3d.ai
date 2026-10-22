import { reactive } from 'vue';
import type { PluginContext } from '../../types';
import { handleRemoteAction, RemoteFailure } from './handlers';

interface RemoteRequest {
  requestId: number;
  action: string;
  input: Record<string, unknown>;
  source?: 'rest' | 'mcp';
}

export interface RemoteLogEntry {
  id: number;
  time: Date;
  action: string;
  source: 'rest' | 'mcp';
  /** the parameters, shortened to one line */
  summary: string;
  ok: boolean;
  error?: string;
  durationMs: number;
}

const MAX_LOG_ENTRIES = 100;
const MAX_SUMMARY_LENGTH = 90;

/** what the Remote API panel shows – filled while the plugin runs */
export const remoteState = reactive({
  /** the WebSocket to the dev server is open */
  connected: false,
  /** this tab receives the requests (the dev server sends them to the tab that announced itself last) */
  active: false,
  /** open tabs of the app */
  tabs: 0,
  log: [] as RemoteLogEntry[],
});

let claimThisTab = () => {};
/** makes this tab the one that receives the requests */
export const useThisTab = () => claimThisTab();

export const clearLog = () => {
  remoteState.log.splice(0);
};

/** the parameters in one short line – a script by its first line */
const summarize = (input: Record<string, unknown>) => {
  const { code, ...rest } = input ?? {};
  const parts = Object.keys(rest).length ? [JSON.stringify(rest)] : [];
  if (typeof code === 'string') {
    parts.push(code.trim().split('\n')[0]);
  }
  const text = parts.join(' ');
  return text.length > MAX_SUMMARY_LENGTH ? text.slice(0, MAX_SUMMARY_LENGTH - 1) + '…' : text;
};

/** file content as base64 (the WebSocket carries JSON) */
const toBase64 = (data: Blob | string) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(typeof data === 'string' ? new Blob([data]) : data);
  });

/**
 * Connects this tab to the dev server's remote API over Vite's WebSocket: announces the tab, answers
 * requests against the editor and records them in the activity log. Returns the clean-up.
 */
export const startRemoteConnection = (context: PluginContext) => {
  const hot = import.meta.hot;
  if (!hot) {
    return () => {}; // a production build has no dev server to talk to
  }
  const tabId = Math.random().toString(36).slice(2, 10);
  let nextLogId = 1;
  let announced = false;

  // the dev server sends requests to the tab that announced itself last: on start, and whenever a tab comes to the front
  const hello = () => hot.send('s3d:remote-hello', { id: tabId, url: location.href });
  const helloWhenVisible = () => {
    if (document.visibilityState === 'visible') {
      hello();
    }
  };
  claimThisTab = hello;

  const onStatus = (status: { activeTabId: string | null; tabs: number }) => {
    remoteState.active = status.activeTabId === tabId;
    remoteState.tabs = status.tabs;
  };
  const onConnect = () => {
    remoteState.connected = true;
    hello();
  };
  const onDisconnect = () => {
    remoteState.connected = false;
    remoteState.active = false;
  };

  const onRequest = async (request: RemoteRequest) => {
    if (!announced) {
      announced = true;
      context.ui.toast(context.i18n.t('remote.plugin.connected'));
    }
    const startedAt = performance.now();
    let answer: Record<string, unknown>;
    try {
      const result = await handleRemoteAction(context.editor, request.action, request.input);
      answer =
        result.kind === 'file'
          ? { ok: true, file: { name: result.name, mimeType: result.mimeType, base64: await toBase64(result.data) } }
          : { ok: true, result: result.value };
    } catch (error) {
      answer = {
        ok: false,
        error: (error as Error)?.message ?? String(error),
        status: error instanceof RemoteFailure ? error.status : 400,
      };
    }
    hot.send('s3d:remote-response', { requestId: request.requestId, ...answer });
    remoteState.log.unshift({
      id: nextLogId++,
      time: new Date(),
      action: request.action,
      source: request.source ?? 'rest',
      summary: summarize(request.input),
      ok: answer.ok === true,
      error: answer.error as string | undefined,
      durationMs: Math.round(performance.now() - startedAt),
    });
    remoteState.log.splice(MAX_LOG_ENTRIES);
  };

  hot.on('s3d:remote-request', onRequest);
  hot.on('s3d:remote-status', onStatus);
  hot.on('vite:ws:connect', onConnect); // also after the dev server restarted
  hot.on('vite:ws:disconnect', onDisconnect);
  window.addEventListener('focus', helloWhenVisible);
  document.addEventListener('visibilitychange', helloWhenVisible);
  remoteState.connected = true; // the app was just served by the dev server; a lost connection reports itself
  hello();

  return () => {
    hot.off('s3d:remote-request', onRequest);
    hot.off('s3d:remote-status', onStatus);
    hot.off('vite:ws:connect', onConnect);
    hot.off('vite:ws:disconnect', onDisconnect);
    window.removeEventListener('focus', helloWhenVisible);
    document.removeEventListener('visibilitychange', helloWhenVisible);
    hot.send('s3d:remote-bye', { id: tabId });
    claimThisTab = () => {};
    Object.assign(remoteState, { connected: false, active: false, tabs: 0 });
  };
};

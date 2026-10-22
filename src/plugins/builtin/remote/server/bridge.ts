/**
 * The bridge between the dev server and the open app: requests go over Vite's HMR WebSocket
 * (`s3d:remote-request`) to the tab that was active last, the app answers with `s3d:remote-response`.
 * Tabs announce themselves with `s3d:remote-hello` (on start and whenever they get focus) and leave with `s3d:remote-bye`;
 * after each change every tab hears with `s3d:remote-status` which tab receives the requests now.
 */
import type { ViteDevServer, WebSocketClient } from 'vite';

export interface AppAnswer {
  ok: boolean;
  result?: unknown;
  error?: string;
  /** 400 (default) or 404 for unknown objects/commands */
  status?: number;
  /** a file: base64 content */
  file?: { name: string; mimeType: string; base64: string };
}

export class RemoteError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const TIMEOUT_MS = 60_000;

export const createBridge = (server: ViteDevServer) => {
  const tabs = new Map<WebSocketClient, { id: string; activeAt: number; url?: string }>();
  const pending = new Map<number, { resolve: (answer: AppAnswer) => void; timer: ReturnType<typeof setTimeout> }>();
  let nextRequestId = 1;

  /** the tab that had focus last */
  const activeTab = () => [...tabs.entries()].sort((a, b) => b[1].activeAt - a[1].activeAt)[0];

  /** tells every tab which one receives the requests (shown in the app's Remote API panel) */
  const broadcastStatus = () => {
    const activeTabId = activeTab()?.[1].id ?? null;
    for (const client of tabs.keys()) {
      client.send('s3d:remote-status', { activeTabId, tabs: tabs.size });
    }
  };
  const removeTab = (client: WebSocketClient) => {
    if (tabs.delete(client)) {
      broadcastStatus();
    }
  };

  server.ws.on('s3d:remote-hello', (data: { id: string; url?: string }, client: WebSocketClient) => {
    if (!tabs.has(client)) {
      client.socket.once('close', () => removeTab(client));
    }
    tabs.set(client, { id: data?.id ?? '?', url: data?.url, activeAt: Date.now() });
    broadcastStatus();
  });
  server.ws.on('s3d:remote-bye', (_data: unknown, client: WebSocketClient) => removeTab(client));
  server.ws.on('s3d:remote-response', (data: { requestId: number } & AppAnswer) => {
    const waiting = pending.get(data?.requestId);
    if (!waiting) {
      return;
    }
    clearTimeout(waiting.timer);
    pending.delete(data.requestId);
    waiting.resolve(data);
  });

  const status = () => ({
    connected: tabs.size > 0,
    tabs: [...tabs.values()].map((tab) => ({ id: tab.id, url: tab.url, lastActive: new Date(tab.activeAt).toISOString() })),
    hint: tabs.size
      ? undefined
      : 'Open the app (npm run dev, e.g. http://localhost:5173) in a browser – the "Remote API" plugin must be switched on.',
  });

  /** sends an action to the app and waits for its answer; `source` only shows up in the app's activity log */
  const call = (action: string, input: Record<string, unknown>, source: 'rest' | 'mcp'): Promise<AppAnswer> => {
    const tab = activeTab();
    if (!tab) {
      return Promise.reject(
        new RemoteError(503, 'No Shap3D.ai tab is connected. Open the app in a browser (npm run dev) and keep the tab open.'),
      );
    }
    const requestId = nextRequestId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(requestId);
        reject(new RemoteError(504, `The app did not answer within ${TIMEOUT_MS / 1000} s.`));
      }, TIMEOUT_MS);
      pending.set(requestId, { resolve, timer });
      tab[0].send('s3d:remote-request', { requestId, action, input, source });
    });
  };

  return { call, status };
};

export type Bridge = ReturnType<typeof createBridge>;

import { LoadError, prepareModel } from './archive';
import type { Download } from './source';

export interface LoadRequest {
  download: Download;
  limit: number;
}
export type LoadAnswer =
  | { kind: 'progress'; received: number; total?: number }
  | { kind: 'done'; extension: string; bytes: Uint8Array }
  | { kind: 'error'; code: string };

/** `Worker.postMessage` without the Window overload's targetOrigin */
const answer = (self as unknown as { postMessage: (data: LoadAnswer, transfer?: Transferable[]) => void }).postMessage.bind(self);

addEventListener('message', async (event: MessageEvent<LoadRequest>) => {
  const { download, limit } = event.data;
  let received = 0;
  /** one file, counted as it arrives – a Content-Length is only a hint */
  const fetchPart = async (path: string) => {
    const url = download.files[path];
    if (!url) {
      throw new LoadError('missingPart', path);
    }
    if (new URL(url).protocol !== 'https:') {
      throw new LoadError('remote', url);
    }
    // the file host needs neither cookies nor to know the page
    const response = await fetch(url, { headers: download.headers, credentials: 'omit', referrerPolicy: 'no-referrer' }).catch(() => {
      throw new Error('network');
    });
    if (!response.ok || !response.body) {
      throw new Error(response.status === 401 || response.status === 403 ? 'auth' : 'network');
    }
    const chunks: Uint8Array[] = [];
    let length = 0;
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      received += value.length;
      if (received > limit) {
        await reader.cancel();
        throw new LoadError('tooLarge');
      }
      chunks.push(value);
      length += value.length;
      answer({ kind: 'progress', received, total: download.size });
    }
    const out = new Uint8Array(length);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, at);
      at += chunk.length;
    }
    return out;
  };
  try {
    if ((download.size ?? 0) > limit) {
      throw new LoadError('tooLarge');
    }
    const { extension, bytes } = await prepareModel(download.main, fetchPart, limit);
    answer({ kind: 'done', extension, bytes }, [bytes.buffer as ArrayBuffer]);
  } catch (error) {
    answer({ kind: 'error', code: error instanceof LoadError ? error.code : (error as Error).message === 'auth' ? 'auth' : 'network' });
  }
});

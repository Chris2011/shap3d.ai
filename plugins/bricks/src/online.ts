import { isPartNumber, neutralTitle } from './ldraw';
import type { LdrawAnswer, LdrawRequest } from './ldrawWorker';
// oxlint-disable-next-line import/default -- made by the build
import LdrawWorker from './ldrawWorker.ts?worker&inline';
import { addLoadedPart, LDRAW_PREFIX, loadedPart, type LoadedPart } from './parts';
import { pluginContext } from './runtime';

/**
 * More parts from the LDraw library. library.ldraw.org sends no CORS header, so a page cannot read it; this copy of it
 * can. The commit is pinned: its files never change and the CDN lets the browser keep them, so a part loaded once
 * comes without asking again. The copy's own web site is second: the CDN refuses repositories above a size limit at
 * times, and a page must not stop working because of that.
 */

// i18n-ignore-start – addresses and proper names
const LIBRARY_COMMIT = 'ddf19df14b52729201c6777a84f2835518224786';
const LIBRARIES = [`https://cdn.jsdelivr.net/gh/erik-larsen/ldraw@${LIBRARY_COMMIT}/`, 'https://erik-larsen.github.io/ldraw/'];
export const LIBRARY_LABEL = 'LDraw';
export const LIBRARY_URL = 'https://www.ldraw.org/';
const REBRICKABLE_SEARCH = 'https://rebrickable.com/api/v3/lego/parts/';
export const REBRICKABLE_LABEL = 'Rebrickable';
export const REBRICKABLE_HELP = 'https://rebrickable.com/api/';
// i18n-ignore-end

export type OnlineErrorCode = 'network' | 'notFound' | 'tooLarge' | 'noGeometry' | 'auth' | 'rate' | 'server' | 'badNumber';

export class OnlineError extends Error {
  code: OnlineErrorCode;
  constructor(code: OnlineErrorCode) {
    super(code);
    this.code = code;
  }
}

/** what the worker is asked, without where the library is */
type WorkerJob = { kind: 'part'; number: string } | { kind: 'model'; url?: string; text?: string };

export const runLdrawWorker = (job: WorkerJob, signal: AbortSignal, onProgress: (progress: { files: number; parts?: number }) => void) =>
  new Promise<Exclude<LdrawAnswer, { kind: 'progress' | 'error' }>>((resolve, reject) => {
    const worker = new LdrawWorker();
    const stop = () => {
      worker.terminate();
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      stop();
      reject(new DOMException('cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', cancel);
    worker.onerror = () => {
      stop();
      reject(new OnlineError('network'));
    };
    worker.onmessage = ({ data }: MessageEvent<LdrawAnswer>) => {
      if (data.kind === 'progress') {
        onProgress(data);
        return;
      }
      stop();
      if (data.kind === 'error') {
        reject(new OnlineError(data.code as OnlineErrorCode));
      } else {
        resolve(data);
      }
    };
    const request: LdrawRequest = { ...job, bases: LIBRARIES };
    worker.postMessage(request, []);
  });

const storedPath = (number: string) => `ldraw/${number}.json`;

/** a stored file is the user's own browser's, but it is read like anything else: only a part of the right shape counts */
const isPart = (value: unknown): value is LoadedPart => {
  const part = value as LoadedPart | null;
  return (
    !!part &&
    typeof part.id === 'string' &&
    typeof part.title === 'string' &&
    typeof part.w === 'number' &&
    typeof part.d === 'number' &&
    typeof part.height === 'number' &&
    Array.isArray(part.mesh?.vertices) &&
    Array.isArray(part.mesh?.faces)
  );
};

/** the parts loaded earlier, from the browser's storage: they work without the network */
export const restoreStoredParts = async () => {
  const files = pluginContext().storage.files;
  for (const { path } of await files.list()) {
    const blob = path.startsWith('ldraw/') ? await files.get(path) : undefined;
    try {
      const part: unknown = blob && JSON.parse(await blob.text());
      if (isPart(part)) {
        addLoadedPart(part);
      }
    } catch {
      // a broken file is no part: it is loaded again when it is asked for
    }
  }
};

/** a part by its number: from what is loaded, else from the library, kept for the next time */
export const loadPart = async (number: string, signal: AbortSignal, onProgress: (files: number) => void) => {
  if (!isPartNumber(number)) {
    throw new OnlineError('badNumber');
  }
  const id = LDRAW_PREFIX + number.toLowerCase();
  const known = loadedPart(id);
  if (known) {
    return known;
  }
  const answer = await runLdrawWorker({ kind: 'part', number: number.toLowerCase() }, signal, ({ files }) => onProgress(files));
  if (answer.kind !== 'done') {
    throw new OnlineError('network');
  }
  const { header, part } = answer;
  const loaded: LoadedPart = {
    id,
    title: header.title || number,
    credit: { number, author: header.author, license: header.license },
    w: part.w,
    d: part.d,
    height: part.height,
    origin: part.origin,
    mesh: { vertices: part.vertices, faces: part.faces },
  };
  addLoadedPart(loaded);
  await pluginContext().storage.files.put(storedPath(number.toLowerCase()), new Blob([JSON.stringify(loaded)]));
  return loaded;
};

export interface FoundPart {
  number: string;
  title: string;
}

interface RebrickablePart {
  part_num?: unknown;
  name?: unknown;
  external_ids?: { LDraw?: unknown };
}

/**
 * Rebrickable's search with the user's own key. It knows every part by name, but has no geometry: the part number it
 * gives leads to the library. Written from its documentation – nobody has run it with a real key yet, the panel says so.
 */
export const searchRebrickable = async (query: string, key: string, signal: AbortSignal): Promise<FoundPart[]> => {
  const url = new URL(REBRICKABLE_SEARCH);
  url.searchParams.set('search', query);
  url.searchParams.set('page_size', '40');
  let response: Response;
  try {
    // the key goes into the header, never into the address
    response = await fetch(url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', headers: { Authorization: `key ${key}` } });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw error;
    }
    throw new OnlineError('network');
  }
  if (response.status === 401 || response.status === 403) {
    throw new OnlineError('auth');
  }
  if (response.status === 429) {
    throw new OnlineError('rate');
  }
  if (!response.ok) {
    throw new OnlineError('server');
  }
  const { results } = (await response.json()) as { results?: RebrickablePart[] };
  return (Array.isArray(results) ? results : []).flatMap((part) => {
    const ldraw = part.external_ids?.LDraw;
    const number = Array.isArray(ldraw) && typeof ldraw[0] === 'string' ? ldraw[0] : part.part_num;
    return typeof number === 'string' && isPartNumber(number)
      ? [{ number, title: neutralTitle(typeof part.name === 'string' ? part.name : number) }]
      : [];
  });
};

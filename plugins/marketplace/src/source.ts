/** What every source offers. A source is a small adapter: search, optional details, and where the model's bytes are. */

export interface ModelItem {
  sourceId: string;
  id: string;
  title: string;
  author: string;
  authorUrl?: string;
  /** undefined: only known after `details` */
  license?: string;
  licenseUrl?: string;
  thumbnail?: string;
  /** the model's page at the source */
  webUrl: string;
  triangles?: number;
  /** data only the adapter reads */
  extra?: Record<string, unknown>;
}

export interface SearchPage {
  items: ModelItem[];
  /** handed back to `search` for the next page */
  next?: string;
}

/** the files of a model: `main` is a key of `files`, the others are found by their relative path */
export interface Download {
  main: string;
  files: Record<string, string>;
  /** only when the file host itself needs the key – most hand out signed addresses */
  headers?: Record<string, string>;
  /** bytes in all, when the source says */
  size?: number;
  /** STL has no unit and these files come from 3D printing, where it means millimetres – the import looks at the size */
  stlMayBeMillimetres?: boolean;
}

export const CATEGORIES = ['furniture', 'buildings', 'plants', 'animals', 'people', 'vehicles', 'objects'] as const;
export type Category = (typeof CATEGORIES)[number];

export interface SearchRequest {
  query: string;
  category?: Category;
  next?: string;
  key: string;
  signal: AbortSignal;
}

export interface ModelSource {
  id: string;
  /** a proper name, shown as it is – sources ask to be named */
  label: string;
  /** the user may enter a key; `needed` says for what */
  key?: { needed: 'search' | 'download'; helpUrl: string };
  /** searches places instead of things: no categories */
  places?: boolean;
  /** true while nobody could test it with a real key – the panel says so */
  untested?: boolean;
  search: (request: SearchRequest) => Promise<SearchPage>;
  details?: (item: ModelItem, key: string, signal: AbortSignal) => Promise<ModelItem>;
  /** a Download for the worker, or a finished File (made from data). Without it the model only opens at the source */
  download?: (item: ModelItem, key: string, signal: AbortSignal) => Promise<Download | File>;
}

export type SourceErrorCode = 'network' | 'auth' | 'rate' | 'server' | 'noBuildings' | 'noFile';

export class SourceError extends Error {
  code: SourceErrorCode;
  constructor(code: SourceErrorCode) {
    super(code);
    this.code = code;
  }
}

/** JSON from a service; what goes wrong becomes a code the panel can say in the user's language */
export const fetchJson = async <T>(url: string, signal: AbortSignal, init: RequestInit = {}): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal, credentials: 'omit' });
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw error;
    }
    // the browser hides why: offline, or the service does not allow calls from a web page (CORS)
    throw new SourceError('network');
  }
  if (response.status === 401 || response.status === 403) {
    throw new SourceError('auth');
  }
  if (response.status === 429) {
    throw new SourceError('rate');
  }
  if (!response.ok) {
    throw new SourceError('server');
  }
  return response.json();
};

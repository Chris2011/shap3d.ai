import { extensionOf } from '../archive';
import { fetchJson, SourceError, type ModelItem, type ModelSource } from '../source';

/** Thingiverse REST API: every call needs an App Token. The search does not name the licence, the thing itself does. */
const API = 'https://api.thingiverse.com';
const PAGE = 24;

interface Thing {
  id: number;
  name: string;
  thumbnail?: string;
  public_url: string;
  license?: string;
  creator?: { name?: string; public_url?: string };
}
interface ThingFile {
  name: string;
  size?: number;
  direct_url?: string;
  download_url?: string;
}

const bearer = (key: string) => {
  if (!key) {
    throw new SourceError('auth');
  }
  return { Authorization: `Bearer ${key}` };
};

export const thingiverse: ModelSource = {
  id: 'thingiverse',
  label: 'Thingiverse', // i18n-ignore – a name
  key: { needed: 'search', helpUrl: 'https://www.thingiverse.com/apps/create' },
  untested: true,
  search: async ({ query, category, next, key, signal }) => {
    const page = Number(next ?? 1);
    const params = new URLSearchParams({ type: 'things', per_page: String(PAGE), page: String(page) });
    const words = encodeURIComponent([query, category].filter(Boolean).join(' '));
    const answer = await fetchJson<{ hits?: Thing[] }>(`${API}/search/${words}?${params}`, signal, { headers: bearer(key) });
    const hits = answer.hits ?? [];
    return {
      items: hits.map((thing): ModelItem => ({
        sourceId: 'thingiverse',
        id: String(thing.id),
        title: thing.name,
        author: thing.creator?.name ?? '',
        authorUrl: thing.creator?.public_url,
        thumbnail: thing.thumbnail,
        webUrl: thing.public_url,
      })),
      next: hits.length === PAGE ? String(page + 1) : undefined,
    };
  },
  details: async (item, key, signal) => ({
    ...item,
    license: (await fetchJson<Thing>(`${API}/things/${encodeURIComponent(item.id)}`, signal, { headers: bearer(key) })).license,
  }),
  download: async (item, key, signal) => {
    const headers = bearer(key);
    const files = await fetchJson<ThingFile[]>(`${API}/things/${encodeURIComponent(item.id)}/files`, signal, { headers });
    // shortcut: a thing of several parts loads its biggest STL only; the others are on its page
    const models = files.filter((file) => ['stl', 'obj'].includes(extensionOf(file.name)));
    const [file] = models.sort((a, b) => (b.size ?? 0) - (a.size ?? 0));
    const url = file?.direct_url ?? file?.download_url;
    if (!url) {
      throw new SourceError('noFile');
    }
    const main = `model.${extensionOf(file.name)}`;
    // a direct address is signed; only the API's own address gets the token
    const toApi = new URL(url).hostname === new URL(API).hostname;
    return { main, files: { [main]: url }, size: file.size, stlMayBeMillimetres: true, headers: toApi ? headers : undefined };
  },
};

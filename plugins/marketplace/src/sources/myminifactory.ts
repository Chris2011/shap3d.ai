import { fetchJson, SourceError, type ModelItem, type ModelSource } from '../source';

/**
 * MyMiniFactory API v2: search with a key. Its guidelines require the end user to be logged in for downloads, and an app
 * cannot log the user in without its own registration – so a model opens on its page (no `download`).
 */
const API = 'https://www.myminifactory.com/api/v2';
const PAGE = 24;

interface Thing {
  id: number;
  name: string;
  url: string;
  license?: string;
  licenses?: { type?: string; value?: boolean }[];
  designer?: { name?: string; username?: string; profile_url?: string };
  images?: { thumbnail?: { url?: string } }[];
}

export const myMiniFactory: ModelSource = {
  id: 'myminifactory',
  label: 'MyMiniFactory',
  key: { needed: 'search', helpUrl: 'https://www.myminifactory.com/settings/developer' },
  untested: true,
  search: async ({ query, category, next, key, signal }) => {
    if (!key) {
      throw new SourceError('auth');
    }
    const page = Number(next ?? 1);
    const params = new URLSearchParams({ q: [query, category].filter(Boolean).join(' '), per_page: String(PAGE), page: String(page) });
    const answer = await fetchJson<{ items?: Thing[]; total_count?: number }>(`${API}/search?${params}`, signal, {
      headers: { 'X-Api-Key': key },
    });
    const items = answer.items ?? [];
    return {
      items: items.map((thing): ModelItem => ({
        sourceId: 'myminifactory',
        id: String(thing.id),
        title: thing.name,
        author: thing.designer?.name ?? thing.designer?.username ?? '',
        authorUrl: thing.designer?.profile_url,
        license: thing.license ?? thing.licenses?.find((license) => license.value)?.type,
        thumbnail: thing.images?.[0]?.thumbnail?.url,
        webUrl: thing.url,
      })),
      next: page * PAGE < (answer.total_count ?? 0) ? String(page + 1) : undefined,
    };
  },
};

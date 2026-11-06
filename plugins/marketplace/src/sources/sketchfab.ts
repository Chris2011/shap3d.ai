import { fetchJson, SourceError, type Category, type Download, type ModelItem, type ModelSource } from '../source';

/**
 * https://sketchfab.com/developers/download-api – search is public, a download needs the user's account. Sketchfab asks
 * apps to name it, and to show the licence and the author. Only models the author made downloadable are listed.
 */
const API = 'https://api.sketchfab.com/v3';
const PAGE = 24;

interface Model {
  uid: string;
  name: string;
  viewerUrl: string;
  faceCount?: number;
  user?: { displayName?: string; profileUrl?: string };
  license?: { label?: string; url?: string };
  thumbnails?: { images?: { width: number; url: string }[] };
}

const SLUGS: Partial<Record<Category, string>> = {
  furniture: 'furniture-home',
  buildings: 'architecture',
  plants: 'nature-plants',
  animals: 'animals-pets',
  people: 'people',
  vehicles: 'cars-vehicles',
};

/** the smallest picture that still fills a card */
const thumbnailOf = (model: Model) => {
  const images = [...(model.thumbnails?.images ?? [])].sort((a, b) => a.width - b.width);
  return (images.find((image) => image.width >= 256) ?? images[images.length - 1])?.url;
};

const toItem = (model: Model): ModelItem => ({
  sourceId: 'sketchfab',
  id: model.uid,
  title: model.name,
  author: model.user?.displayName ?? '',
  authorUrl: model.user?.profileUrl,
  license: model.license?.label,
  licenseUrl: model.license?.url,
  thumbnail: thumbnailOf(model),
  webUrl: model.viewerUrl,
  triangles: model.faceCount,
});

export const sketchfab: ModelSource = {
  id: 'sketchfab',
  label: 'Sketchfab', // i18n-ignore – a name
  key: { needed: 'download', helpUrl: 'https://sketchfab.com/settings/password' },
  untested: true,
  search: async ({ query, category, next, signal }) => {
    const params = new URLSearchParams({ type: 'models', downloadable: 'true', count: String(PAGE) });
    if (query) {
      params.set('q', query);
    }
    const slug = category && SLUGS[category];
    if (slug) {
      params.set('categories', slug);
    }
    if (next) {
      params.set('cursor', next);
    }
    const answer = await fetchJson<{ results: Model[]; cursors?: { next?: string | null } }>(`${API}/search?${params}`, signal);
    return { items: answer.results.map(toItem), next: answer.cursors?.next ?? undefined };
  },
  // the search only names the licence; the model itself also has its address
  details: async (item, _key, signal) => ({
    ...item,
    licenseUrl: (await fetchJson<Model>(`${API}/models/${encodeURIComponent(item.id)}`, signal)).license?.url,
  }),
  download: async (item, key, signal): Promise<Download> => {
    if (!key) {
      throw new SourceError('auth');
    }
    const answer = await fetchJson<{ glb?: { url: string; size?: number }; gltf?: { url: string; size?: number } }>(
      `${API}/models/${encodeURIComponent(item.id)}/download`,
      signal,
      { headers: { Authorization: `Token ${key}` } }, // i18n-ignore – a header
    );
    // the address is signed and short-lived, the key stays here. A glb is one file, the glTF comes as a zip
    if (answer.glb) {
      return { main: 'model.glb', files: { 'model.glb': answer.glb.url }, size: answer.glb.size };
    }
    if (answer.gltf) {
      return { main: 'model.zip', files: { 'model.zip': answer.gltf.url }, size: answer.gltf.size };
    }
    throw new SourceError('noFile');
  },
};

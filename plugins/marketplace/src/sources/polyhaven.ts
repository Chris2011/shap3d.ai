import { fetchJson, SourceError, type Category, type ModelItem, type ModelSource } from '../source';

/** https://polyhaven.com/our-api – no key, free also for commercial use, the app must name Poly Haven; assets are CC0 */
const API = 'https://api.polyhaven.com';
const PAGE = 24;

interface Asset {
  name: string;
  authors?: Record<string, string>;
  categories?: string[];
  tags?: string[];
  download_count?: number;
  polycount?: number;
}
interface FileEntry {
  url: string;
  size: number;
  include?: Record<string, { url: string; size: number }>;
}

/** the words of our categories in Poly Haven's categories and tags */
const TERMS: Record<Category, string> = {
  furniture: 'furniture',
  buildings: 'structures',
  plants: 'plants',
  animals: 'animal',
  people: 'people',
  vehicles: 'vehicle',
  objects: 'props',
};

// the service has no search: it hands out its whole list (some hundred entries), which is searched here, once per session
let listing: Promise<Record<string, Asset>> | undefined;

export const polyHaven: ModelSource = {
  id: 'polyhaven',
  label: 'Poly Haven',
  search: async ({ query, category, next, signal }) => {
    listing ??= fetchJson<Record<string, Asset>>(`${API}/assets?t=models`, signal).catch((error) => {
      listing = undefined;
      throw error;
    });
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const found = Object.entries(await listing)
      .filter(([, asset]) => {
        const text = [asset.name, ...(asset.tags ?? []), ...(asset.categories ?? [])].join(' ').toLowerCase();
        return words.every((word) => text.includes(word)) && (!category || text.includes(TERMS[category]));
      })
      .sort(([, a], [, b]) => (b.download_count ?? 0) - (a.download_count ?? 0));
    const start = Number(next ?? 0);
    return {
      items: found.slice(start, start + PAGE).map(([id, asset]): ModelItem => ({
        sourceId: 'polyhaven',
        id,
        title: asset.name,
        author: Object.keys(asset.authors ?? {}).join(', '),
        license: 'CC0',
        licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
        thumbnail: `https://cdn.polyhaven.com/asset_img/thumbs/${encodeURIComponent(id)}.png?width=256`,
        webUrl: `https://polyhaven.com/a/${encodeURIComponent(id)}`,
        triangles: asset.polycount,
      })),
      next: start + PAGE < found.length ? String(start + PAGE) : undefined,
    };
  },
  download: async (item, _key, signal) => {
    const files = await fetchJson<{ gltf?: Record<string, { gltf?: FileEntry }> }>(`${API}/files/${encodeURIComponent(item.id)}`, signal);
    // the smallest pictures: the app's import only takes a mean colour from them
    const entry = files.gltf?.['1k']?.gltf ?? Object.values(files.gltf ?? {})[0]?.gltf;
    if (!entry) {
      throw new SourceError('noFile');
    }
    const include = Object.entries(entry.include ?? {});
    const main = `${item.id}.gltf`;
    return {
      main,
      files: { [main]: entry.url, ...Object.fromEntries(include.map(([path, part]) => [path, part.url])) },
      size: include.reduce((sum, [, part]) => sum + part.size, entry.size),
    };
  },
};

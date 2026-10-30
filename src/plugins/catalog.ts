import { useStorage } from '@vueuse/core';

/**
 * Plugin catalogs: lists of plugins to install with one click (Plugins › Discover). A catalog is a JSON file –
 * `{ plugins: [{ id, name, version, description, url, … }] }` – whose `url`s point at plugin folders (with their
 * package.json), relative to the catalog. The official one is built by the plugin release workflow on the project's
 * GitHub Pages: the plugins of this repository and the community plugins listed in plugins/community.json. Users may
 * add catalogs of their own (a company's plugins, say).
 */

export const OFFICIAL_CATALOG = 'https://chris2011.github.io/shap3d.ai/plugins/index.json';

export interface CatalogEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  license?: string;
  author?: string;
  homepage?: string;
  minAppVersion?: string | null;
  /** 'official': built and released from the Shap3D.ai repository; 'community': listed there, built elsewhere */
  source?: 'official' | 'community';
  /** not released yet – built from the repository's main branch, a preview of its next version */
  preview?: boolean;
  /** the plugin folder to install from – absolute, resolved against the catalog */
  installUrl: string;
  /** the catalog it is listed in */
  catalog: string;
  /** listed in a catalog the user added (not the official one) */
  ownCatalog: boolean;
}

/** catalogs the user added (URLs of their index.json) */
export const ownCatalogs = useStorage<string[]>('s3d:plugin-catalogs', []);

/** the plugins of one catalog */
const readCatalog = async (catalog: string): Promise<CatalogEntry[]> => {
  const response = await fetch(catalog, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json()) as { plugins?: Record<string, unknown>[] };
  return (data.plugins ?? [])
    .filter((plugin) => typeof plugin.id === 'string' && typeof plugin.url === 'string')
    .map((plugin) => ({
      id: String(plugin.id),
      name: String(plugin.name ?? plugin.id),
      version: String(plugin.version ?? ''),
      description: String(plugin.description ?? ''),
      license: plugin.license ? String(plugin.license) : undefined,
      author: plugin.author ? String(plugin.author) : undefined,
      homepage: plugin.homepage ? String(plugin.homepage) : undefined,
      minAppVersion: plugin.minAppVersion ? String(plugin.minAppVersion) : null,
      source: plugin.source === 'community' ? 'community' : 'official',
      preview: plugin.preview === true,
      // the newest version stays at latest/ – installing from there lets "Update" find the next one
      installUrl: new URL(String(plugin.latest ?? plugin.url), catalog).href,
      catalog,
      ownCatalog: catalog !== OFFICIAL_CATALOG,
    }));
};

/**
 * The plugins of all catalogs (the official one first; a plugin listed twice keeps its first entry), and the
 * catalogs that could not be read.
 */
export const loadCatalogs = async () => {
  const catalogs = [OFFICIAL_CATALOG, ...ownCatalogs.value.filter((url) => url !== OFFICIAL_CATALOG)];
  const results = await Promise.allSettled(catalogs.map(readCatalog));
  const entries: CatalogEntry[] = [];
  const failed: { catalog: string; error: string }[] = [];
  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      entries.push(...result.value.filter((entry) => !entries.some((other) => other.id === entry.id)));
    } else {
      failed.push({ catalog: catalogs[index], error: String(result.reason?.message ?? result.reason) });
    }
  });
  return { entries, failed };
};

/**
 * What the portal shows: the plugin catalog (plugins/index.json next to the page, written by the plugin release
 * workflow – or another one with ?catalog=<url>) and the app's address for the install links (config.json next to the
 * page, from the repository variable APP_URL – without one the buttons copy the plugin's address instead).
 */

export interface PortalPlugin {
  id: string;
  name: string;
  version: string;
  description: string;
  license?: string;
  author?: string;
  homepage?: string;
  minAppVersion?: string | null;
  source: 'official' | 'community';
  /** not released yet – built from the repository's main branch, a preview of its next version */
  preview: boolean;
  /** the plugin folder to install from, absolute */
  installUrl: string;
  /** the release's zip (official plugins) */
  zip?: string;
}

export const catalogUrl = () => new URL(new URLSearchParams(location.search).get('catalog') ?? 'plugins/index.json', location.href).href;

export const loadCatalog = async (): Promise<{ plugins: PortalPlugin[]; updated?: string }> => {
  const url = catalogUrl();
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json()) as { updated?: string; plugins?: Record<string, unknown>[] };
  return {
    updated: data.updated,
    plugins: (data.plugins ?? []).map((plugin) => ({
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
      // folders in the catalog are relative to it; the newest version stays at latest/, so the app can update from there
      installUrl: new URL(String(plugin.latest ?? plugin.url), url).href,
      zip: plugin.zip ? String(plugin.zip) : undefined,
    })),
  };
};

/** the app's address – empty when the portal does not know it */
export const loadAppUrl = async (): Promise<string> => {
  try {
    const response = await fetch(new URL('config.json', location.href), { cache: 'no-cache' });
    return response.ok ? String(((await response.json()) as { appUrl?: string }).appUrl ?? '') : '';
  } catch {
    return '';
  }
};

/** the link that opens the app and installs a plugin there (it asks first) */
export const installLink = (appUrl: string, plugin: PortalPlugin) =>
  `${appUrl}${appUrl.includes('?') ? '&' : '?'}install=${encodeURIComponent(plugin.installUrl)}`;

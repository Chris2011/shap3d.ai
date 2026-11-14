import { plugins, type InstalledPlugin } from './registry';
import { t, localize } from '../i18n';

/** What installing did to one plugin, in a sentence – a new build of an installed plugin says "updated". */
export const describeInstall = (plugin: InstalledPlugin) => {
  const name = localize(plugin.name);
  const entry = plugins.find((candidate) => candidate.id === plugin.id);
  const version = entry?.version ?? plugin.version ?? '';
  if (plugin.kept) {
    return `${name} (${t('pluginManager.keptNewer')})`;
  }
  if (entry?.error) {
    return t('pluginManager.installedButFailed', { name, error: entry.error });
  }
  if (plugin.status === 'unchanged') {
    return t('plugins.folders.upToDate', { name, version });
  }
  if (plugin.status === 'updated') {
    return plugin.previousVersion && version && plugin.previousVersion !== version
      ? t('plugins.folders.updated', { name, from: plugin.previousVersion, to: version })
      : t('plugins.folders.updatedSameVersion', { name, version });
  }
  return t('pluginManager.installedActive', { name });
};

/** Whether the installed plugin `id` failed to start. */
export const pluginFailed = (id: string) => !!plugins.find((candidate) => candidate.id === id)?.error;

/** The last of the plugins an install returned (a bundle installs several), or null. */
export const lastInstalled = (installed: InstalledPlugin[]) => installed[installed.length - 1] ?? null;

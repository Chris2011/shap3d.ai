import { reactive, ref } from 'vue';
import { plugins, installPluginPackage, installedPackage, readPluginPackage, type PluginPackage } from '../plugins/registry';
import { saveFolderHandle, loadFolderHandle, listFolderHandles } from '../plugins/assetStore';
import { supportsFolderHandles, pickPackageFolder, queryReadPermission, requestReadPermission, readFolderFiles } from '../plugins/packageFolder';

export interface FolderResult { text: string; error: boolean }

/** true when the folder holds something other than the installed copy */
const differs = (id: string, candidate: PluginPackage) => {
  const installed = installedPackage(id);
  if (!installed) return true;
  return installed.code !== candidate.code || installed.info.version !== candidate.info.version
    || installed.info.files !== candidate.info.files || installed.info.bytes !== candidate.info.bytes;
};

const nameOf = (id: string) => plugins.find(entry => entry.id === id)?.name ?? id;

/**
 * Plugin packages installed from a folder: remembers the folder (Chromium) and updates the
 * installed copy from it with one click, like "Reload" for an extension in development.
 */
export const usePluginFolders = () => {
  /** plugin ids with a remembered folder */
  const folderIds = ref(new Set<string>());
  /** plugin id → hint about a newer package in its folder (silent check) */
  const updateHints = reactive<Record<string, string>>({});
  /** plugin id currently being updated */
  const updating = ref<string | null>(null);

  const refreshFolderIds = async () => {
    if (!supportsFolderHandles) return;
    try { folderIds.value = new Set(await listFolderHandles()); } catch (error) { console.error(error); }
  };

  /** Installs (or replaces) a package from a folder handle and remembers the folder. */
  const installFromHandle = async (handle: FileSystemDirectoryHandle, pluginPackage?: PluginPackage) => {
    const plugin = await installPluginPackage(pluginPackage ?? await readFolderFiles(handle));
    await saveFolderHandle(plugin.id, handle);
    delete updateHints[plugin.id];
    await refreshFolderIds();
    return plugin;
  };

  /** "Plugin-Ordner laden…" in Chromium: folder picker instead of the file input; null if cancelled */
  const installFromPicker = async () => {
    const handle = await pickPackageFolder(); if (!handle) return null;
    return installFromHandle(handle);
  };

  /** Reads the plugin's folder again and installs it when something changed (call from a click). */
  const updateFromFolder = async (id: string): Promise<FolderResult | null> => {
    const name = nameOf(id);
    const oldVersion = installedPackage(id)?.info.version ?? '';
    updating.value = id;
    try {
      let handle = await loadFolderHandle(id);
      let pluginPackage: PluginPackage | null = null;
      if (handle && await requestReadPermission(handle)) {
        try { pluginPackage = await readPluginPackage(await readFolderFiles(handle)); }
        catch (error: any) { if (error?.name !== 'NotFoundError') throw error; } // folder moved or deleted
      }
      if (!pluginPackage) {
        // no access to the remembered folder: let the user pick it again, starting next to the old one
        handle = await pickPackageFolder(handle) ?? undefined;
        if (!handle) return null;
        pluginPackage = await readPluginPackage(await readFolderFiles(handle));
      }
      const newVersion = pluginPackage.info.version;
      if (!differs(id, pluginPackage)) {
        await saveFolderHandle(id, handle!); // the user may have picked a new place for the same package
        delete updateHints[id];
        return { text: `„${name}“ ${newVersion} ist schon aktuell.`, error: false };
      }
      const plugin = await installFromHandle(handle!, pluginPackage);
      const failed = plugins.find(entry => entry.id === plugin.id)?.error;
      if (failed) return { text: `„${plugin.name}“ aktualisiert, aber beim Start fehlgeschlagen: ${failed}`, error: true };
      return {
        text: oldVersion && newVersion && oldVersion !== newVersion
          ? `${plugin.name} ${oldVersion} → ${newVersion} aktualisiert.`
          : `${plugin.name} ${newVersion} aktualisiert (neue Fassung aus dem Ordner).`,
        error: false,
      };
    } catch (error: any) {
      return { text: `„${name}“ konnte nicht aktualisiert werden: ${error?.message ?? error}`, error: true };
    } finally { updating.value = null; }
  };

  /** Updates every plugin with a remembered folder; returns one line per plugin. */
  const updateAll = async () => {
    const results: FolderResult[] = [];
    for (const id of folderIds.value) {
      if (!plugins.some(entry => entry.id === id)) continue;
      const result = await updateFromFolder(id); if (result) results.push(result);
    }
    return results;
  };

  /** Looks for newer packages in folders that are already readable – never asks for permission. */
  const checkSilently = async () => {
    await refreshFolderIds();
    for (const id of folderIds.value) {
      try {
        const handle = await loadFolderHandle(id);
        if (!handle || (await queryReadPermission(handle)) !== 'granted') continue;
        const pluginPackage = await readPluginPackage(await readFolderFiles(handle));
        if (!differs(id, pluginPackage)) { delete updateHints[id]; continue; }
        const version = pluginPackage.info.version;
        updateHints[id] = version && version !== installedPackage(id)?.info.version ? `Neue Version ${version} im Ordner` : 'Neue Fassung im Ordner';
      } catch (error) { console.warn(`Plugin-Ordner von „${id}“ nicht lesbar:`, error); }
    }
  };

  return { supported: supportsFolderHandles, folderIds, updateHints, updating, installFromPicker, updateFromFolder, updateAll, checkSilently, refreshFolderIds };
};

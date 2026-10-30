import { reactive, ref, shallowRef } from 'vue';
import { plugins, installPluginPackages, installedPackage, readPluginPackages, type PluginPackage } from '../plugins/registry';
import { saveFolderHandle, loadFolderHandle, listFolderHandles } from '../plugins/assetStore';
import {
  supportsFolderHandles,
  pickPackageFolder,
  queryReadPermission,
  requestReadPermission,
  readFolderFiles,
} from '../plugins/packageFolder';
import { t, localize } from '../i18n';

export interface FolderResult {
  text: string;
  error: boolean;
}

/** true when the folder holds something other than the installed copy */
const differs = (id: string, candidate: PluginPackage) => {
  const installed = installedPackage(id);
  if (!installed) {
    return true;
  }
  return (
    installed.code !== candidate.code ||
    installed.info.version !== candidate.info.version ||
    installed.info.files !== candidate.info.files ||
    installed.info.bytes !== candidate.info.bytes
  );
};

const nameOf = (id: string) => plugins.find((entry) => entry.id === id)?.name ?? id;

/** the package of a plugin in its folder – the folder may hold a bundle of several (matched by `shap3d.id`) */
const packageFor = async (id: string, handle: FileSystemDirectoryHandle) => {
  const packages = await readPluginPackages(await readFolderFiles(handle));
  const found = packages.length === 1 ? packages[0] : packages.find((candidate) => candidate.info.id === id);
  if (!found) {
    throw new Error(t('plugins.errors.bundlePartMissing', { id }));
  }
  return found;
};

/**
 * Plugin packages installed from a folder: remembers the folder (Chromium) and updates the
 * installed copy from it with one click, like "Reload" for an extension in development.
 */
export const usePluginFolders = () => {
  /** plugin ids with a remembered folder */
  const folderIds = shallowRef(new Set<string>());
  /** plugin id → hint about a newer package in its folder (silent check) */
  const updateHints = reactive<Record<string, string>>({});
  /** plugin id → true when its folder was read and holds the installed copy (nothing to update) */
  const upToDate = reactive<Record<string, boolean>>({});
  /** plugin id currently being updated */
  const updating = ref<string | null>(null);

  const refreshFolderIds = async () => {
    if (!supportsFolderHandles) {
      return;
    }
    try {
      folderIds.value = new Set(await listFolderHandles());
    } catch (error) {
      console.error(error);
    }
  };

  /** Drops the remembered folder of a removed plugin from the list. */
  const forgetFolder = (id: string) => {
    folderIds.value = new Set([...folderIds.value].filter((folderId) => folderId !== id));
    delete upToDate[id];
  };

  /** Installs (or replaces) the package(s) of a folder handle and remembers the folder for each plugin. */
  const installFromHandle = async (handle: FileSystemDirectoryHandle, pluginPackage?: PluginPackage) => {
    const installed = await installPluginPackages(pluginPackage ? [pluginPackage] : await readFolderFiles(handle));
    for (const plugin of installed) {
      if (!plugin.kept) {
        await saveFolderHandle(plugin.id, handle);
        delete updateHints[plugin.id];
        upToDate[plugin.id] = true;
      }
    }
    await refreshFolderIds();
    return installed[installed.length - 1];
  };

  /** "Plugin-Ordner laden…" in Chromium: folder picker instead of the file input; null if cancelled */
  const installFromPicker = async () => {
    const handle = await pickPackageFolder();
    if (!handle) {
      return null;
    }
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
      if (handle && (await requestReadPermission(handle))) {
        try {
          pluginPackage = await packageFor(id, handle);
        } catch (error: any) {
          if (error?.name !== 'NotFoundError') {
            throw error;
          }
        } // folder moved or deleted
      }
      if (!pluginPackage) {
        // no access to the remembered folder: let the user pick it again, starting next to the old one
        handle = (await pickPackageFolder(handle)) ?? undefined;
        if (!handle) {
          return null;
        }
        pluginPackage = await packageFor(id, handle);
      }
      const newVersion = pluginPackage.info.version;
      if (!differs(id, pluginPackage)) {
        await saveFolderHandle(id, handle!); // the user may have picked a new place for the same package
        delete updateHints[id];
        upToDate[id] = true;
        return { text: t('plugins.folders.upToDate', { name: localize(name), version: newVersion }), error: false };
      }
      const plugin = await installFromHandle(handle!, pluginPackage);
      const failed = plugins.find((entry) => entry.id === plugin.id)?.error;
      if (failed) {
        return { text: t('plugins.folders.updatedButFailed', { name: localize(plugin.name), error: failed }), error: true };
      }
      return {
        text:
          oldVersion && newVersion && oldVersion !== newVersion
            ? t('plugins.folders.updated', { name: localize(plugin.name), from: oldVersion, to: newVersion })
            : t('plugins.folders.updatedSameVersion', { name: localize(plugin.name), version: newVersion }),
        error: false,
      };
    } catch (error: any) {
      return { text: t('plugins.folders.updateFailed', { name: localize(name), error: error?.message ?? error }), error: true };
    } finally {
      updating.value = null;
    }
  };

  /** Updates every plugin with a remembered folder; returns one line per plugin. */
  const updateAll = async () => {
    const results: FolderResult[] = [];
    for (const id of folderIds.value) {
      if (!plugins.some((entry) => entry.id === id)) {
        continue;
      }
      const result = await updateFromFolder(id);
      if (result) {
        results.push(result);
      }
    }
    return results;
  };

  /** Looks for newer packages in folders that are already readable – never asks for permission. */
  const checkSilently = async () => {
    await refreshFolderIds();
    for (const id of folderIds.value) {
      try {
        const handle = await loadFolderHandle(id);
        if (!handle || (await queryReadPermission(handle)) !== 'granted') {
          delete upToDate[id]; // unknown – the button stays
          continue;
        }
        const pluginPackage = await packageFor(id, handle);
        if (!differs(id, pluginPackage)) {
          delete updateHints[id];
          upToDate[id] = true;
          continue;
        }
        delete upToDate[id];
        const version = pluginPackage.info.version;
        updateHints[id] =
          version && version !== installedPackage(id)?.info.version
            ? t('plugins.folders.newVersion', { version })
            : t('plugins.folders.newBuild');
      } catch (error) {
        delete upToDate[id];
        console.warn(`Plugin-Ordner von „${id}“ nicht lesbar:`, error);
      }
    }
  };

  return {
    supported: supportsFolderHandles,
    folderIds,
    updateHints,
    upToDate,
    updating,
    installFromPicker,
    updateFromFolder,
    updateAll,
    checkSilently,
    refreshFolderIds,
    forgetFolder,
  };
};

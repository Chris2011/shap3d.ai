import { inject, provide, reactive, ref, shallowRef, type InjectionKey } from 'vue';
import {
  plugins,
  installPlugin,
  installPluginPackages,
  installPluginFromUrl,
  newerAtSource,
  type InstalledPlugin,
} from '../plugins/registry';
import { describeInstall, lastInstalled, pluginFailed } from '../plugins/installResult';
import { usePluginFolders } from './usePluginFolders';
import { t } from '../i18n';

/** The line above the plugin list after an action. */
export interface PluginMessage {
  text: string;
  error: boolean;
}

const createState = () => {
  const search = ref('');
  /** does the search text occur in one of these texts? */
  const matches = (...texts: (string | undefined)[]) => {
    const wanted = search.value.trim().toLowerCase();
    return !wanted || texts.some((text) => text?.toLowerCase().includes(wanted));
  };
  const busy = ref(false);
  const message = shallowRef<PluginMessage | null>(null);
  const folders = usePluginFolders();

  /** runs one job at a time: buttons are disabled meanwhile, its result becomes the message */
  const runBusy = async (job: () => Promise<PluginMessage | null | undefined>) => {
    busy.value = true;
    message.value = null;
    try {
      message.value = (await job()) ?? null;
    } catch (error: any) {
      message.value = { text: t('pluginManager.loadFailed', { error: error?.message ?? error }), error: true };
    } finally {
      busy.value = false;
    }
  };

  /** installs from source code, a folder's files (maybe a bundle of several) or an installer function */
  const install = (code: string | File[] | (() => Promise<InstalledPlugin | null>)) =>
    runBusy(async () => {
      if (Array.isArray(code)) {
        const installed = await installPluginPackages(code);
        if (installed.length > 1) {
          return {
            text: installed.every((plugin) => plugin.kept || plugin.status === 'installed')
              ? t('pluginManager.installedBundle', { names: installed.map(describeInstall).join(', ') })
              : installed.map(describeInstall).join(' '),
            error: installed.some((plugin) => pluginFailed(plugin.id)),
          };
        }
        code = async () => installed[0];
      }
      const plugin = typeof code === 'string' ? await installPlugin(code) : await code();
      // null: the folder picker was cancelled
      return plugin ? { text: describeInstall(plugin), error: pluginFailed(plugin.id) } : null;
    });

  /** plugins installed from a URL: the newer version waiting there (looked up when the panel opens) */
  const urlUpdates = reactive<Record<string, string>>({});
  const checkUrlUpdates = async () => {
    for (const plugin of plugins.filter((entry) => entry.package?.source)) {
      const version = await newerAtSource(plugin.id);
      if (version) {
        urlUpdates[plugin.id] = version;
      } else {
        delete urlUpdates[plugin.id];
      }
    }
  };
  const installFromUrl = async (url: string) => {
    await install(() => installPluginFromUrl(url).then(lastInstalled));
  };

  return { search, matches, busy, message, folders, runBusy, install, installFromUrl, urlUpdates, checkUrlUpdates };
};
export type PluginManagerState = ReturnType<typeof createState>;

const PLUGIN_MANAGER: InjectionKey<PluginManagerState> = Symbol('pluginManager');

/** Creates the plugin manager's shared state (search, busy, message, installing) for its sections. */
export const providePluginManagerState = () => {
  const state = createState();
  provide(PLUGIN_MANAGER, state);
  return state;
};

/** The state of the plugin manager this section is part of. */
export const usePluginManagerState = () => {
  const state = inject(PLUGIN_MANAGER);
  if (!state) {
    throw new Error('usePluginManagerState() outside S3dPluginManager');
  }
  return state;
};

import { onMounted, ref, shallowRef } from 'vue';
import { useEditor } from '../components/keys';
import { loadCatalogs, ownCatalogs } from '../plugins/catalog';
import { t } from '../i18n';

/** The plugin catalogs: read when the panel opens, again on "Reload"; the user can add and remove own ones. */
export const usePluginCatalogs = () => {
  const editor = useEditor();
  const catalog = shallowRef<Awaited<ReturnType<typeof loadCatalogs>>>({ entries: [], failed: [] });
  const loading = ref(false);
  const refresh = async () => {
    loading.value = true;
    try {
      catalog.value = await loadCatalogs();
    } finally {
      loading.value = false;
    }
  };
  onMounted(refresh);
  const add = async () => {
    const url = (await editor.prompt(t('pluginManager.catalogPrompt'), 'https://'))?.trim();
    if (url && url !== 'https://' && !ownCatalogs.value.includes(url)) {
      ownCatalogs.value = [...ownCatalogs.value, url];
      await refresh();
    }
  };
  const remove = async (url: string) => {
    ownCatalogs.value = ownCatalogs.value.filter((other) => other !== url);
    await refresh();
  };
  return { catalog, loading, ownCatalogs, refresh, add, remove };
};

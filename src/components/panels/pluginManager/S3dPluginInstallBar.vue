<template>
  <div class="mb-2 flex flex-wrap gap-1.5 [&_.s3d-btn]:flex [&_.s3d-btn]:items-center [&_.s3d-btn]:gap-1">
    <S3dButton small :disabled="busy" @click="installFromFile">
      <S3dIcon name="import" :size="14" /> {{ t('pluginManager.loadFile') }}
    </S3dButton>
    <S3dButton small :disabled="busy" :title="t('pluginManager.loadFolderTitle')" @click="installFromFolderButton">
      <S3dIcon name="folder" :size="14" /> {{ t('pluginManager.loadFolder') }}
    </S3dButton>
    <S3dButton small :disabled="busy" :title="t('pluginManager.loadZipTitle')" @click="installFromZip">
      <S3dIcon name="import" :size="14" /> {{ t('pluginManager.loadZip') }}
    </S3dButton>
    <S3dButton small :disabled="busy" :title="t('pluginManager.loadUrlTitle')" @click="askUrl">
      <S3dIcon name="download" :size="14" /> {{ t('pluginManager.loadUrl') }}
    </S3dButton>
    <S3dButton v-if="updatable" small :disabled="busy" :title="t('pluginManager.updateAllTitle')" @click="updateAllFolders">
      <S3dIcon name="refresh" :size="14" /> {{ t('pluginManager.updateAll') }}
    </S3dButton>
    <input ref="folderInput" type="file" webkitdirectory multiple class="hidden" @change="installFromFolder" />
  </div>
  <p v-if="busy" class="mb-2 text-xs text-ink-2">
    {{ folders.updating.value ? t('pluginManager.updating') : t('pluginManager.installing') }}
  </p>
  <p class="mb-2 text-xs text-ink-2">{{ t('pluginManager.warning') }}</p>
  <S3dStatusMessage v-if="message" class="mb-2 text-xs" :text="message.text" :error="message.error" />
</template>

<script setup lang="ts">
import { useTemplateRef } from 'vue';
import S3dIcon from '../../S3dIcon.vue';
import S3dButton from '../../ui/S3dButton.vue';
import S3dStatusMessage from '../../ui/S3dStatusMessage.vue';
import { useEditor } from '../../keys';
import { pickFile } from '../../../engine/commands';
import { installPluginZip } from '../../../plugins/registry';
import { lastInstalled } from '../../../plugins/installResult';
import { usePluginManagerState } from '../../../composables/usePluginManagerState';
import { t } from '../../../i18n';

/** Install from a file, folder, ZIP or URL; update every folder plugin; what happened. */
defineProps<{ updatable: boolean }>();
const editor = useEditor();
const { busy, message, folders, install, installFromUrl, runBusy, checkUrlUpdates } = usePluginManagerState();
const folderInput = useTemplateRef<HTMLInputElement>('folderInput');

const installFromFile = async () => {
  const file = await pickFile('.js,.mjs,text/javascript');
  if (file) {
    await install(await file.text());
  }
};
const installFromZip = async () => {
  const file = await pickFile('.zip,application/zip');
  if (file) {
    await install(() => installPluginZip(file).then(lastInstalled));
  }
};
const askUrl = async () => {
  const url = (await editor.prompt(t('pluginManager.urlPrompt'), 'https://'))?.trim();
  if (url && url !== 'https://') {
    await installFromUrl(url);
    void checkUrlUpdates();
  }
};
/** Chromium remembers the folder (for "Update"); other browsers use the folder input */
const installFromFolderButton = () => {
  if (folders.supported) {
    void install(folders.installFromPicker);
  } else {
    folderInput.value?.click();
  }
};
const installFromFolder = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])];
  input.value = '';
  if (files.length) {
    await install(files);
  }
};
const updateAllFolders = () =>
  runBusy(async () => {
    const results = await folders.updateAll();
    return results.length ? { text: results.map((result) => result.text).join(' '), error: results.some((result) => result.error) } : null;
  });
</script>

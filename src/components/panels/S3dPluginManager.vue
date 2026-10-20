<template>
  <div class="mb-2 flex flex-wrap gap-1.5 [&_.s3d-btn]:flex [&_.s3d-btn]:items-center [&_.s3d-btn]:gap-1">
    <button class="s3d-btn small" :disabled="busy" @click="installFromFile"><S3dIcon name="import" :size="14" /> Plugin-Datei laden…</button>
    <button class="s3d-btn small" :disabled="busy" title="Ordner mit package.json – z. B. der gebaute dist-Ordner eines Plugin-Pakets" @click="installFromFolderButton"><S3dIcon name="folder" :size="14" /> Plugin-Ordner laden…</button>
    <button v-if="folderPlugins.length" class="s3d-btn small" :disabled="busy" title="Alle aus einem Ordner installierten Pakete neu einlesen – z. B. nach npm run build" @click="updateAllFolders"><S3dIcon name="refresh" :size="14" /> Alle aktualisieren</button>
    <input ref="folderInput" type="file" webkitdirectory multiple class="hidden" @change="installFromFolder" />
  </div>
  <p v-if="busy" class="mb-2 text-xs text-ink-2">{{ updating ? 'Plugin wird aktualisiert …' : 'Plugin wird installiert …' }}</p>
  <p class="mb-2 text-xs text-ink-2">Plugins sind JavaScript-Module und laufen mit vollem Zugriff auf die Anwendung. Installiere nur Plugins, deren Quelle du vertraust. Sie werden nur in diesem Browser gespeichert.</p>
  <p v-if="message" class="mb-2 rounded-[3px] border px-2 py-1.5 text-xs" :class="message.error ? 'border-danger/40 bg-danger/8 text-danger' : 'border-line bg-surface text-ink-2'">{{ message.text }}</p>

  <div class="s3d-caption mt-3 mb-1 text-navy">Installiert</div>
  <div v-for="plugin in plugins" :key="plugin.id" class="mb-1.5 border border-line bg-surface px-2.25 py-1.75">
    <div class="flex items-center gap-2">
      <S3dIcon name="plugin" :size="18" />
      <span class="flex-1 font-semibold text-navy">{{ plugin.name }} <span v-if="plugin.version" class="font-normal text-ink-2">{{ plugin.version }}</span></span>
      <S3dToggleSwitch :model-value="plugin.enabled" :label="plugin.enabled ? 'Ausschalten' : 'Einschalten'" @update:model-value="value => toggle(plugin.id, value)" />
    </div>
    <p v-if="plugin.description" class="mt-1 text-xs text-ink-2">{{ plugin.description }}</p>
    <p v-if="plugin.error" class="mt-1 text-xs text-danger">Fehler: {{ plugin.error }}</p>
    <p class="mt-1 text-[0.6875rem] text-ink-2"><template v-if="plugin.builtin">Eingebaut · </template>{{ plugin.author ? `von ${plugin.author} · ` : '' }}<code>{{ plugin.id }}</code></p>
    <p v-if="updateHints[plugin.id]" class="mt-1 text-xs font-semibold text-navy">{{ updateHints[plugin.id] }}</p>
    <p v-if="plugin.package" class="mt-0.5 text-[0.6875rem] text-ink-2">Paket {{ plugin.package.name }} · {{ plugin.package.files }} {{ plugin.package.files === 1 ? 'Datei' : 'Dateien' }}, {{ megabytes(plugin.package.bytes) }}<template v-if="plugin.package.license"> · Lizenz {{ plugin.package.license }}</template></p>
    <div class="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
      <button v-if="hasFolder(plugin.id)" class="s3d-btn small flex items-center gap-1" :disabled="busy" title="Paket neu aus seinem Ordner einlesen – z. B. nach npm run build" @click="update(plugin.id)"><S3dIcon name="refresh" :size="13" /> Aktualisieren</button>
      <button v-for="panel in panelsOf(plugin.id)" :key="panel.id" class="s3d-link" @click="showPanel(panel.id)">{{ panel.label }} öffnen</button>
      <button v-if="!plugin.builtin" class="s3d-link" @click="downloadSource(plugin.id)">Quelltext</button>
      <button v-if="!plugin.builtin" class="s3d-link" @click="remove(plugin.id, plugin.name)">Entfernen</button>
    </div>
  </div>
  <div v-if="!plugins.length" class="px-0.5 py-2 text-xs text-ink-2">Noch keine Plugins installiert.</div>

  <template v-if="examples.length">
    <div class="s3d-caption mt-4 mb-1 text-navy">Beispiel-Plugins</div>
    <div v-for="example in examples" :key="example.file" class="mb-1.5 flex items-start gap-2 border border-dashed border-line px-2.25 py-1.75">
      <div class="flex-1">
        <div class="font-semibold text-navy">{{ example.name }}</div>
        <p class="mt-0.5 text-xs text-ink-2">{{ example.description }}</p>
      </div>
      <button class="s3d-btn small" :disabled="busy" @click="install(example.code)">{{ example.installed ? 'Aktualisieren' : 'Installieren' }}</button>
    </div>
  </template>
  <p class="mt-3 text-xs text-ink-2">Wie man eigene Plugins schreibt, steht in der README unter „Plugins“. Die Beispiele liegen in <code>src/plugins/examples/</code>.</p>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import S3dIcon from '../S3dIcon.vue';
import S3dToggleSwitch from '../ui/S3dToggleSwitch.vue';
import { useEditor } from '../keys';
import { PANEL_INFO, showPanel } from '../panelState';
import { pickFile, download } from '../../engine/commands';
import { usePluginFolders } from '../../composables/usePluginFolders';
import { plugins, installPlugin, installPluginPackage, setPluginEnabled, removePlugin, pluginSource, EXAMPLE_PLUGINS } from '../../plugins/registry';

const editor = useEditor();
const busy = ref(false);
const folderInput = ref<HTMLInputElement | null>(null);
const megabytes = (bytes: number) => `${(bytes / 1024 / 1024).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
const message = ref<{ text: string; error: boolean } | null>(null);

/** reads a metadata string field from source without running it */
const field = (code: string, name: string) => new RegExp(`\\b${name}:\\s*'([^']*)'`).exec(code)?.[1] ?? '';
const examples = computed(() => EXAMPLE_PLUGINS
  .map(example => ({ ...example, id: field(example.code, 'id'), name: field(example.code, 'name'), description: field(example.code, 'description') }))
  .map(example => ({ ...example, installed: plugins.some(plugin => plugin.id === example.id) }))
  // new examples, or bundled ones that changed since they were installed
  .filter(example => !example.installed || pluginSource(example.id) !== example.code));

const folders = usePluginFolders();
const { updateHints, updating } = folders;
const hasFolder = (id: string) => folders.folderIds.value.has(id) && !!plugins.find(entry => entry.id === id)?.package;
const folderPlugins = computed(() => plugins.filter(plugin => hasFolder(plugin.id)));
// silent check: only folders that are already readable, never a permission prompt
onMounted(() => { folders.checkSilently(); });

const install = async (code: string | File[] | (() => Promise<{ id: string; name: string } | null>)) => {
  busy.value = true; message.value = null;
  try {
    const plugin = typeof code === 'string' ? await installPlugin(code) : typeof code === 'function' ? await code() : await installPluginPackage(code);
    if (!plugin) return; // folder picker cancelled
    const entry = plugins.find(candidate => candidate.id === plugin.id);
    message.value = entry?.error ? { text: `„${plugin.name}“ installiert, aber beim Start fehlgeschlagen: ${entry.error}`, error: true } : { text: `„${plugin.name}“ ist installiert und aktiv.`, error: false };
  } catch (error: any) { message.value = { text: `Plugin konnte nicht geladen werden: ${error?.message ?? error}`, error: true }; }
  finally { busy.value = false; }
};

const installFromFile = async () => {
  const file = await pickFile('.js,.mjs,text/javascript'); if (!file) return;
  await install(await file.text());
};

const panelsOf = (id: string) => PANEL_INFO.filter(panel => panel.id.startsWith(id + '.'));
/** Chromium remembers the folder (for "Aktualisieren"); other browsers use the folder input */
const installFromFolderButton = () => {
  if (folders.supported) install(folders.installFromPicker); else folderInput.value?.click();
};

const update = async (id: string) => {
  busy.value = true; message.value = null;
  try { message.value = await folders.updateFromFolder(id); } finally { busy.value = false; }
};

const updateAllFolders = async () => {
  busy.value = true; message.value = null;
  try {
    const results = await folders.updateAll();
    if (results.length) message.value = { text: results.map(result => result.text).join(' '), error: results.some(result => result.error) };
  } finally { busy.value = false; }
};

const installFromFolder = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = [...(input.files ?? [])]; input.value = '';
  if (files.length) await install(files);
};

const toggle = (id: string, enabled: boolean) => { setPluginEnabled(id, enabled); };

const remove = async (id: string, name: string) => {
  if (!(await editor.confirm(`Plugin „${name}“ entfernen?`))) return;
  removePlugin(id); delete updateHints[id]; folders.folderIds.value.delete(id); message.value = { text: `„${name}“ wurde entfernt.`, error: false };
};

const downloadSource = (id: string) => download(`${id}.js`, pluginSource(id), 'text/javascript');
</script>

import { reactive } from 'vue';
import { useStorage } from '@vueuse/core';
import type { Editor } from '../engine/editor';
import { createPluginContext } from './context';
import type { Disposer, S3dPlugin } from './types';
import gridExample from './examples/grid-generator.js?raw';
import coordinatesExample from './examples/cursor-coordinates.js?raw';
import partsListExample from './examples/parts-list.js?raw';

/** Bundled example plugins – offered in the plugin manager, installed like any user plugin. */
export const EXAMPLE_PLUGINS: { file: string; code: string }[] = [
  { file: 'grid-generator.js', code: gridExample },
  { file: 'cursor-coordinates.js', code: coordinatesExample },
  { file: 'parts-list.js', code: partsListExample },
];

interface StoredPlugin { id: string; code: string; enabled: boolean }

export interface PluginEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  active: boolean;
  error: string | null;
}

/** installed plugins (source code kept in the browser, never sent anywhere) */
const stored = useStorage<StoredPlugin[]>('s3d:plugins', []);
/** what the plugin manager shows */
export const plugins = reactive<PluginEntry[]>([]);

const loaded = new Map<string, { plugin: S3dPlugin; disposers: Disposer[] }>();
let editorRef: Editor | null = null;

/** Evaluates plugin source as an ES module and returns its default export. */
const evaluate = async (code: string): Promise<S3dPlugin> => {
  const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
  try {
    const module = await import(/* @vite-ignore */ url);
    const plugin = (module.default ?? module.plugin) as S3dPlugin | undefined;
    if (!plugin || typeof plugin !== 'object') throw new Error('Das Modul exportiert kein Plugin (export default { … })');
    if (!plugin.id || !/^[a-z0-9][a-z0-9-]*$/.test(plugin.id)) throw new Error('Plugin-id fehlt oder ist ungültig (nur a–z, 0–9 und -)');
    if (!plugin.name) throw new Error('Plugin-name fehlt');
    if (typeof plugin.activate !== 'function') throw new Error('activate(context) fehlt');
    return plugin;
  } finally { URL.revokeObjectURL(url); }
};

const entryOf = (id: string) => plugins.find(entry => entry.id === id);

const describe = (plugin: S3dPlugin, enabled: boolean): PluginEntry => ({
  id: plugin.id, name: plugin.name, version: plugin.version ?? '', description: plugin.description ?? '', author: plugin.author ?? '',
  enabled, active: false, error: null,
});

const runDisposers = (disposers: Disposer[]) => {
  for (const disposer of disposers.reverse()) { try { disposer(); } catch (error) { console.error(error); } }
  disposers.length = 0;
};

const activate = async (plugin: S3dPlugin) => {
  const entry = entryOf(plugin.id)!;
  const disposers: Disposer[] = [];
  try {
    await plugin.activate(createPluginContext(editorRef!, plugin, disposers));
    loaded.set(plugin.id, { plugin, disposers });
    entry.active = true; entry.error = null;
  } catch (error: any) {
    runDisposers(disposers); // undo what was registered before the failure
    entry.active = false; entry.error = error?.message ?? String(error);
    console.error(`Plugin „${plugin.id}“:`, error);
  }
  editorRef?.invalidate();
};

const deactivate = (id: string) => {
  const running = loaded.get(id); if (!running) return;
  try { running.plugin.deactivate?.(); } catch (error) { console.error(error); }
  runDisposers(running.disposers);
  loaded.delete(id);
  const entry = entryOf(id); if (entry) entry.active = false;
  editorRef?.invalidate();
};

/** Loads all installed plugins (call once after the editor exists). */
export const initPlugins = async (editor: Editor) => {
  editorRef = editor;
  for (const item of stored.value) {
    try {
      const plugin = await evaluate(item.code);
      plugins.push(describe(plugin, item.enabled));
      if (item.enabled) await activate(plugin);
    } catch (error: any) {
      plugins.push({ id: item.id, name: item.id, version: '', description: '', author: '', enabled: item.enabled, active: false, error: error?.message ?? String(error) });
    }
  }
};

/** Installs (or updates) a plugin from its source code and switches it on. */
export const installPlugin = async (code: string) => {
  const plugin = await evaluate(code);
  const existing = stored.value.find(item => item.id === plugin.id);
  if (existing) { deactivate(plugin.id); existing.code = code; existing.enabled = true; stored.value = [...stored.value]; }
  else stored.value = [...stored.value, { id: plugin.id, code, enabled: true }];
  const entry = entryOf(plugin.id);
  if (entry) Object.assign(entry, describe(plugin, true)); else plugins.push(describe(plugin, true));
  await activate(plugin);
  return plugin;
};

export const setPluginEnabled = async (id: string, enabled: boolean) => {
  const item = stored.value.find(candidate => candidate.id === id); if (!item) return;
  item.enabled = enabled; stored.value = [...stored.value];
  const entry = entryOf(id); if (entry) entry.enabled = enabled;
  if (!enabled) { deactivate(id); return; }
  try { await activate(await evaluate(item.code)); } catch (error: any) { if (entry) entry.error = error?.message ?? String(error); }
};

export const removePlugin = (id: string) => {
  deactivate(id);
  stored.value = stored.value.filter(item => item.id !== id);
  const index = plugins.findIndex(entry => entry.id === id); if (index >= 0) plugins.splice(index, 1);
  for (const key of Object.keys(localStorage)) if (key.startsWith(`s3d:plugin:${id}:`)) localStorage.removeItem(key);
};

/** Source of an installed plugin (for download / inspection). */
export const pluginSource = (id: string) => stored.value.find(item => item.id === id)?.code ?? '';

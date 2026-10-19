import { reactive } from 'vue';
import { useStorage } from '@vueuse/core';
import type { Editor } from '../engine/editor';
import { createPluginContext } from './context';
import type { Disposer, S3dPlugin } from './types';
import { saveAssets, loadAssets, deleteAssets, clearPluginFiles, type PluginAssets } from './assetStore';
import gridExample from './examples/grid-generator.js?raw';
import coordinatesExample from './examples/cursor-coordinates.js?raw';
import partsListExample from './examples/parts-list.js?raw';

/** Bundled example plugins – offered in the plugin manager, installed like any user plugin. */
export const EXAMPLE_PLUGINS: { file: string; code: string }[] = [
  { file: 'grid-generator.js', code: gridExample },
  { file: 'cursor-coordinates.js', code: coordinatesExample },
  { file: 'parts-list.js', code: partsListExample },
];

/**
 * Plugins that ship with the app (part of this repository, written against the same plugin API).
 * Loaded on demand as their own chunk; on by default, can be switched off but not removed.
 */
const BUILTIN_PLUGINS: { id: string; load: () => Promise<{ default: S3dPlugin }> }[] = [
  { id: 'ai', load: () => import('./builtin/ai') },
  { id: 'terrain', load: () => import('./builtin/terrain') },
  { id: 'imports', load: () => import('./builtin/imports') },
];

/** what a plugin package's package.json says about itself */
export interface PackageInfo { name: string; version: string; license: string; files: number; bytes: number }

interface StoredPlugin { id: string; code: string; enabled: boolean; package?: PackageInfo }

export interface PluginEntry {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  enabled: boolean;
  active: boolean;
  error: string | null;
  /** set for plugins installed from a package folder */
  package?: PackageInfo;
  /** part of the app – can be switched off, not removed */
  builtin?: boolean;
}

/** installed plugins (source code kept in the browser, never sent anywhere) */
const stored = useStorage<StoredPlugin[]>('s3d:plugins', []);
/** on/off state of the built-in plugins (missing = on) */
const builtinEnabled = useStorage<Record<string, boolean>>('s3d:builtin-plugins', {});
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

const describe = (plugin: S3dPlugin, enabled: boolean, packageInfo?: PackageInfo, builtin = false): PluginEntry => ({
  id: plugin.id, name: plugin.name, version: plugin.version ?? packageInfo?.version ?? '', description: plugin.description ?? '', author: plugin.author ?? '',
  enabled, active: false, error: null, package: packageInfo, builtin,
});

const isBuiltin = (id: string) => BUILTIN_PLUGINS.some(candidate => candidate.id === id);
const loadBuiltin = async (id: string) => (await BUILTIN_PLUGINS.find(candidate => candidate.id === id)!.load()).default;

const runDisposers = (disposers: Disposer[]) => {
  for (const disposer of disposers.reverse()) { try { disposer(); } catch (error) { console.error(error); } }
  disposers.length = 0;
};

const activate = async (plugin: S3dPlugin) => {
  const entry = entryOf(plugin.id)!;
  const disposers: Disposer[] = [];
  try {
    const assets = stored.value.find(item => item.id === plugin.id)?.package ? await loadAssets(plugin.id) : {};
    await plugin.activate(createPluginContext(editorRef!, plugin, disposers, assets));
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

let markReady: () => void = () => {};
/** resolves once the plugins from the last session are running (e.g. for the screenshot mode) */
export const pluginsReady = new Promise<void>(resolve => { markReady = resolve; });

/** Loads all installed plugins (call once after the editor exists). */
export const initPlugins = async (editor: Editor) => {
  if (editorRef) return; // already started (e.g. the app component was hot-reloaded)
  editorRef = editor;
  try { await startPlugins(); } finally { markReady(); }
};

const startPlugins = async () => {
  for (const builtin of BUILTIN_PLUGINS) {
    const enabled = builtinEnabled.value[builtin.id] !== false;
    try {
      const plugin = await builtin.load().then(module => module.default);
      plugins.push(describe(plugin, enabled, undefined, true));
      if (enabled) await activate(plugin);
    } catch (error: any) {
      plugins.push({ id: builtin.id, name: builtin.id, version: '', description: '', author: '', enabled, active: false, error: error?.message ?? String(error), builtin: true });
    }
  }
  for (const item of stored.value) {
    if (isBuiltin(item.id)) continue; // an installed copy never replaces a built-in plugin
    try {
      const plugin = await evaluate(item.code);
      plugins.push(describe(plugin, item.enabled, item.package));
      if (item.enabled) await activate(plugin);
    } catch (error: any) {
      plugins.push({ id: item.id, name: item.id, version: '', description: '', author: '', enabled: item.enabled, active: false, error: error?.message ?? String(error) });
    }
  }
};

/** Installs (or updates) a plugin from its source code and switches it on. */
export const installPlugin = async (code: string, packageFiles?: { info: PackageInfo; assets: PluginAssets }) => {
  const plugin = await evaluate(code);
  if (isBuiltin(plugin.id)) throw new Error(`„${plugin.id}“ ist ein eingebautes Plugin und kann nicht ersetzt werden`);
  const existing = stored.value.find(item => item.id === plugin.id);
  if (existing) deactivate(plugin.id);
  if (packageFiles) await saveAssets(plugin.id, packageFiles.assets);
  else if (existing?.package) await deleteAssets(plugin.id);
  const item: StoredPlugin = { id: plugin.id, code, enabled: true, package: packageFiles?.info };
  stored.value = existing ? stored.value.map(other => (other.id === plugin.id ? item : other)) : [...stored.value, item];
  const entry = entryOf(plugin.id);
  if (entry) Object.assign(entry, describe(plugin, true, item.package)); else plugins.push(describe(plugin, true, item.package));
  await activate(plugin);
  return plugin;
};

/**
 * Installs a plugin package from a folder (input with webkitdirectory). The folder needs a
 * package.json whose "shap3d.main" (or "main") names the plugin module; every other file
 * except node_modules is kept as an asset the plugin reaches through context.assets.
 */
export const installPluginPackage = async (files: File[]) => {
  const pathOf = (file: File) => (file.webkitRelativePath || file.name).replace(/\\/g, '/');
  const manifests = files.filter(file => pathOf(file).split('/').pop() === 'package.json' && !pathOf(file).includes('/node_modules/'));
  const manifestFile = manifests.sort((a, b) => pathOf(a).split('/').length - pathOf(b).split('/').length)[0];
  if (!manifestFile) throw new Error('Im Ordner fehlt eine package.json');
  const manifest = JSON.parse(await manifestFile.text());
  const base = pathOf(manifestFile).slice(0, -'package.json'.length);
  const mainPath = String(manifest.shap3d?.main ?? manifest.main ?? '').replace(/^\.?\//, '');
  if (!mainPath) throw new Error('package.json braucht "shap3d": { "main": "plugin.js" }');
  const assets: PluginAssets = {}; let mainCode: string | null = null; let bytes = 0;
  for (const file of files) {
    const path = pathOf(file);
    if (!path.startsWith(base)) continue;
    const relative = path.slice(base.length);
    if (relative === 'package.json' || relative.startsWith('node_modules/') || relative.includes('/node_modules/')) continue;
    if (relative === mainPath) { mainCode = await file.text(); continue; }
    assets[relative] = file; bytes += file.size;
  }
  if (mainCode == null) throw new Error(`Die Hauptdatei „${mainPath}“ aus package.json fehlt im Ordner`);
  const info: PackageInfo = { name: manifest.name ?? '', version: manifest.version ?? '', license: manifest.license ?? '', files: Object.keys(assets).length, bytes };
  return installPlugin(mainCode, { info, assets });
};

export const setPluginEnabled = async (id: string, enabled: boolean) => {
  if (isBuiltin(id)) {
    builtinEnabled.value = { ...builtinEnabled.value, [id]: enabled };
    const entry = entryOf(id); if (entry) entry.enabled = enabled;
    if (!enabled) { deactivate(id); return; }
    try { await activate(await loadBuiltin(id)); } catch (error: any) { if (entry) entry.error = error?.message ?? String(error); }
    return;
  }
  const item = stored.value.find(candidate => candidate.id === id); if (!item) return;
  item.enabled = enabled; stored.value = [...stored.value];
  const entry = entryOf(id); if (entry) entry.enabled = enabled;
  if (!enabled) { deactivate(id); return; }
  try { await activate(await evaluate(item.code)); } catch (error: any) { if (entry) entry.error = error?.message ?? String(error); }
};

export const removePlugin = (id: string) => {
  if (isBuiltin(id)) return; // built-in plugins can only be switched off
  deactivate(id);
  if (stored.value.find(item => item.id === id)?.package) deleteAssets(id).catch(error => console.error(error));
  clearPluginFiles(id).catch(error => console.error(error));
  stored.value = stored.value.filter(item => item.id !== id);
  const index = plugins.findIndex(entry => entry.id === id); if (index >= 0) plugins.splice(index, 1);
  for (const key of Object.keys(localStorage)) if (key.startsWith(`s3d:plugin:${id}:`)) localStorage.removeItem(key);
};

// development: a hot-reloaded copy of this module first stops the plugins the previous copy started
// (Vite re-runs this module without calling dispose hooks when a dependency changes)
if (import.meta.hot) {
  const runtime = globalThis as { __s3dStopPlugins?: () => void };
  runtime.__s3dStopPlugins?.();
  runtime.__s3dStopPlugins = () => { for (const id of [...loaded.keys()]) deactivate(id); };
}

/** Source of an installed plugin (for download / inspection). */
export const pluginSource = (id: string) => stored.value.find(item => item.id === id)?.code ?? '';

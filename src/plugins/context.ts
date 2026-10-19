import * as THREE from 'three';
import * as Vue from 'vue';
import { defineComponent, h, onMounted, onBeforeUnmount, ref } from 'vue';
import { Tool, type Editor } from '../engine/editor';
import { PointTool } from '../tools/base';
import { COMMANDS, runCommand, download } from '../engine/commands';
import { TOOL_INFO, TOOL_SHORTCUTS, PLUGIN_TOOLS } from '../engine/setup';
import { addPanel, showPanel } from '../components/panelState';
import { registerIcon } from '../components/iconRegistry';
import { ScriptApi, runScript } from '../scripting/api';
import { API_CATALOG } from '../scripting/catalog';
import { registerImporter } from './fileFormats';
import { newId, type Entities } from '../core/model';
import { buildMesh } from '../scripting/mesh';
import { registerScriptLanguage, registerBeforeRun } from '../scripting/languages';
import { useScripts } from '../composables/useScripts';
import { putPluginFile, getPluginFile, removePluginFile, clearPluginFiles, listPluginFiles, type PluginAssets } from './assetStore';
import { addContextMenuEntry, addPluginWindow, addTopBarButton } from './uiExtensions';
import { registerCodeFormat } from '../scripting/codeExport';
import type { Disposer, PluginContext, PluginMesh, PluginMeshOptions, PluginPanel } from './types';

const MIME_TYPES: Record<string, string> = { js: 'text/javascript', mjs: 'text/javascript', wasm: 'application/wasm', json: 'application/json', css: 'text/css', svg: 'image/svg+xml', png: 'image/png' };

/** Removes `item` from `list` (no-op when it is gone already). */
const removeFrom = <T>(list: T[], item: T) => { const index = list.indexOf(item); if (index >= 0) list.splice(index, 1); };

/** Wraps a plain-DOM `mount` function into a Vue component. */
const domPanel = (mount: NonNullable<PluginPanel['mount']>) => defineComponent({
  setup() {
    const element = ref<HTMLElement | null>(null);
    let cleanup: void | Disposer;
    onMounted(() => { if (element.value) cleanup = mount(element.value); });
    onBeforeUnmount(() => { if (typeof cleanup === 'function') cleanup(); });
    return () => h('div', { ref: element, class: 's3d-plugin-panel' });
  },
});

/** Builds a plugin mesh into `entities` in its own coordinates (scaled to metres). */
const buildPluginMesh = (entities: Entities, mesh: PluginMesh, options: PluginMeshOptions = {}) => buildMesh(
  entities,
  { verts: mesh.vertices.map(([x, y, z]) => new THREE.Vector3(x, y, z)), faces: mesh.faces, materials: mesh.faceMaterials },
  { fit: false, yUp: false, scale: options.scale ?? 1, smooth: options.smooth ?? 20 },
);

/**
 * Builds the API object a plugin receives in `activate`. Every registration is recorded in
 * `disposers`, so switching the plugin off removes all of it again (in reverse order).
 */
export const createPluginContext = (editor: Editor, plugin: { id: string; name: string }, disposers: Disposer[], assets: PluginAssets = {}): PluginContext => {
  const track = (disposer: Disposer) => { disposers.push(disposer); return disposer; };
  const qualified = (id: string) => `${plugin.id}.${id}`;
  // object URLs for package files, created on first use and revoked when the plugin stops
  const assetUrls = new Map<string, string>();
  track(() => { for (const url of assetUrls.values()) URL.revokeObjectURL(url); assetUrls.clear(); });
  const normalise = (path: string) => path.replace(/^\.?\//, '');

  return {
    plugin: { id: plugin.id, name: plugin.name },
    editor,
    THREE,
    vue: Vue,
    newId,
    classes: { Tool, PointTool },

    commands: {
      register: command => {
        const id = qualified(command.id);
        if (COMMANDS.some(existing => existing.id === id)) throw new Error(`Befehl „${id}“ gibt es schon`);
        const entry = { ...command, id, group: command.group ?? 'Plugins', run: (target: Editor) => { Promise.resolve(command.run(target)).catch(error => target.toast(`${plugin.name}: ${error?.message ?? error}`)); } };
        COMMANDS.push(entry);
        return track(() => removeFrom(COMMANDS, entry));
      },
      run: id => runCommand(editor, id.includes('.') ? id : qualified(id)),
    },

    tools: {
      register: tool => {
        const id = qualified(tool.id);
        if (editor.tools.has(id)) throw new Error(`Werkzeug „${id}“ gibt es schon`);
        const instance = tool.create(editor);
        instance.id = id;
        editor.register(instance);
        TOOL_INFO[id] = { id, name: tool.name, icon: tool.icon ?? 'plugin', key: tool.key?.toUpperCase() };
        PLUGIN_TOOLS.push(id);
        const key = tool.key?.toLowerCase();
        const ownsKey = !!key && !TOOL_SHORTCUTS[key];
        if (ownsKey) TOOL_SHORTCUTS[key!] = id;
        return track(() => {
          delete TOOL_INFO[id];
          removeFrom(PLUGIN_TOOLS, id);
          editor.unregister(id);
          if (ownsKey) delete TOOL_SHORTCUTS[key!];
        });
      },
    },

    panels: {
      register: panel => {
        const component = panel.component ?? (panel.mount ? domPanel(panel.mount) : null);
        if (!component) throw new Error(`Panel „${panel.id}“ braucht component oder mount`);
        const id = qualified(panel.id);
        track(addPanel({ id, label: panel.label, icon: panel.icon ?? 'plugin', width: panel.width ?? 300, flush: panel.flush, component, tile: !!panel.tile }, panel.tile === 'first'));
        // a tile is found in the palette like the built-in panels; without one a menu/palette entry opens the panel
        if (panel.tile) return () => {};
        const command = { id: `${id}.open`, label: `${panel.label}…`, group: 'Plugins', icon: panel.icon ?? 'plugin', keywords: 'panel', run: () => showPanel(id) };
        COMMANDS.push(command);
        return track(() => removeFrom(COMMANDS, command));
      },
      open: id => showPanel(id.includes('.') ? id : qualified(id)),
    },

    icons: { register: (name, svgContent) => track(registerIcon(name, svgContent)) },

    script: {
      extend: (name, implementation, info = {}) => {
        const prototype = ScriptApi.prototype as unknown as Record<string, unknown>;
        if (name in prototype) throw new Error(`s3d.${name} gibt es schon`);
        prototype[name] = function (this: ScriptApi, ...args: unknown[]) { return implementation(this, ...args); };
        const entry = { id: qualified(name), category: info.category ?? 'Plugins', title: info.title ?? `${name} (${plugin.name})`, returns: info.returns, signature: info.signature ?? `s3d.${name}(…)`, desc: info.description ?? `Bereitgestellt vom Plugin „${plugin.name}“.`, example: info.example ?? '' };
        API_CATALOG.push(entry);
        return track(() => { delete prototype[name]; removeFrom(API_CATALOG, entry); });
      },
      run: code => runScript(editor, code, plugin.name),
      registerLanguage: language => track(registerScriptLanguage(language)),
      openInEditor: (language, code) => { useScripts().open({ lang: language, code }); showPanel('scripts'); },
      beforeRun: prepare => track(registerBeforeRun(prepare)),
    },

    assets: {
      list: () => Object.keys(assets),
      blob: path => assets[normalise(path)],
      url: path => {
        const key = normalise(path);
        const blob = assets[key]; if (!blob) throw new Error(`Datei „${key}“ fehlt im Plugin-Paket`);
        // modules and WebAssembly only load with the right MIME type – don't rely on what the file picker set
        const type = MIME_TYPES[key.split('.').pop()!.toLowerCase()] ?? blob.type;
        if (!assetUrls.has(key)) assetUrls.set(key, URL.createObjectURL(blob.type === type ? blob : new Blob([blob], { type })));
        return assetUrls.get(key)!;
      },
    },

    meshes: {
      build: (entities, mesh, options) => buildPluginMesh(entities, mesh, options),
      add: (mesh, options = {}) => {
        const name = options.name ?? plugin.name;
        editor.commit(name, () => {
          const scriptApi = new ScriptApi(editor, editor.entities);
          for (const [materialName, material] of Object.entries(options.materials ?? {})) scriptApi.ensureMaterial(materialName, material.color, material.opacity ?? 1);
          scriptApi.group(name, api => { buildPluginMesh(api.ents, mesh, options); });
        });
        editor.invalidate();
      },
    },

    materials: {
      ensure: (name, material) => {
        const existing = editor.model.materials.find(candidate => candidate.name === name);
        return existing ? existing.name : new ScriptApi(editor).ensureMaterial(name, material.color, material.opacity ?? 1);
      },
    },

    code: { registerFormat: format => track(registerCodeFormat(format)) },

    files: {
      registerImporter: importer => track(registerImporter(importer.extensions, { label: importer.label, import: importer.import, loadScene: importer.loadScene })),
      registerExporter: exporter => {
        const id = `export-${qualified(exporter.id)}`;
        const entry = {
          id, label: `Exportieren: ${exporter.label}`, group: 'Datei', icon: 'export',
          run: async (target: Editor) => {
            try { download(exporter.fileName(target), await exporter.export(target), exporter.mimeType ?? 'application/octet-stream'); }
            catch (error: any) { target.toast(`${plugin.name}: ${error?.message ?? error}`); }
          },
        };
        COMMANDS.push(entry);
        return track(() => removeFrom(COMMANDS, entry));
      },
    },

    overlay: {
      draw: draw => {
        const drawer = (overlay: Parameters<typeof draw>[0]) => draw(overlay, editor);
        editor.viewer.overlay.drawers.push(drawer); editor.redraw();
        return track(() => { removeFrom(editor.viewer.overlay.drawers, drawer); editor.redraw(); });
      },
    },

    events: {
      onToolChange: listener => { editor.onToolChange.push(listener); return track(() => removeFrom(editor.onToolChange, listener)); },
      onNewModel: listener => { editor.onNewModel.push(listener); return track(() => removeFrom(editor.onNewModel, listener)); },
    },

    storage: {
      get: (key, fallback) => { try { const stored = localStorage.getItem(`s3d:plugin:${plugin.id}:${key}`); return stored == null ? fallback : JSON.parse(stored); } catch { return fallback; } },
      set: (key, value) => { try { localStorage.setItem(`s3d:plugin:${plugin.id}:${key}`, JSON.stringify(value)); } catch { /* storage full or blocked */ } },
      files: {
        list: () => listPluginFiles(plugin.id),
        get: path => getPluginFile(plugin.id, normalise(path)),
        put: async (path, file) => { await putPluginFile(plugin.id, normalise(path), file); },
        remove: async path => { await removePluginFile(plugin.id, normalise(path)); },
        clear: async () => { await clearPluginFiles(plugin.id); },
      },
    },

    ui: {
      toast: message => editor.toast(message),
      prompt: (title, value = '') => editor.prompt(title, value),
      confirm: title => editor.confirm(title),
      addContextMenuEntry: entry => track(addContextMenuEntry(entry)),
      addWindow: component => track(addPluginWindow(component)),
      addTopBarButton: button => track(addTopBarButton(button)),
    },

    data: {
      get: definition => definition.pluginData?.[plugin.id] as any,
      set: (definition, value) => {
        const data = { ...(definition.pluginData ?? {}) };
        if (value === undefined) delete data[plugin.id]; else data[plugin.id] = value;
        definition.pluginData = Object.keys(data).length ? data : undefined;
      },
    },

    onDispose: disposer => { track(disposer); },
  };
};

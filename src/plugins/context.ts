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
import { newId } from '../core/model';
import type { Disposer, PluginContext, PluginPanel } from './types';

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

/**
 * Builds the API object a plugin receives in `activate`. Every registration is recorded in
 * `disposers`, so switching the plugin off removes all of it again (in reverse order).
 */
export const createPluginContext = (editor: Editor, plugin: { id: string; name: string }, disposers: Disposer[]): PluginContext => {
  const track = (disposer: Disposer) => { disposers.push(disposer); return disposer; };
  const qualified = (id: string) => `${plugin.id}.${id}`;

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
          if (editor.ui.tool === id) editor.setTool('select');
          editor.tools.delete(id);
          delete TOOL_INFO[id];
          removeFrom(PLUGIN_TOOLS, id);
          editor.ui.recentTools = editor.ui.recentTools.filter(recent => recent !== id);
          if (ownsKey) delete TOOL_SHORTCUTS[key!];
        });
      },
    },

    panels: {
      register: panel => {
        const component = panel.component ?? (panel.mount ? domPanel(panel.mount) : null);
        if (!component) throw new Error(`Panel „${panel.id}“ braucht component oder mount`);
        const id = qualified(panel.id);
        track(addPanel({ id, label: panel.label, icon: panel.icon ?? 'plugin', width: panel.width ?? 300, component }));
        // plugin panels have no tile – a menu/palette entry opens them
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
        const entry = { id: qualified(name), category: 'Plugins' as const, title: `${name} (${plugin.name})`, signature: info.signature ?? `s3d.${name}(…)`, desc: info.description ?? `Bereitgestellt vom Plugin „${plugin.name}“.`, example: info.example ?? '' };
        API_CATALOG.push(entry);
        return track(() => { delete prototype[name]; removeFrom(API_CATALOG, entry); });
      },
      run: code => runScript(editor, code, plugin.name),
    },

    files: {
      registerImporter: importer => track(registerImporter(importer.extensions, { label: importer.label, import: importer.import })),
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
    },

    ui: {
      toast: message => editor.toast(message),
      prompt: (title, value = '') => editor.prompt(title, value),
      confirm: title => editor.confirm(title),
    },

    onDispose: disposer => { track(disposer); },
  };
};

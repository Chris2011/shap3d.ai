import { markRaw, shallowReactive, type Component } from 'vue';
import type { Editor } from '../engine/editor';

/** Context-menu entries contributed by plugins (shown for the current selection). */
export interface ContextMenuEntry {
  label: string;
  /** show the entry only when this is true (default: always) */
  when?: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

export const CONTEXT_MENU_ENTRIES = shallowReactive<ContextMenuEntry[]>([]);

/** Floating windows contributed by plugins – rendered once in App.vue, the component decides when it is visible. */
export const PLUGIN_WINDOWS = shallowReactive<Component[]>([]);

const addTo = <T>(list: T[], item: T) => {
  list.push(item);
  return () => { const index = list.indexOf(item); if (index >= 0) list.splice(index, 1); };
};

export const addContextMenuEntry = (entry: ContextMenuEntry) => addTo(CONTEXT_MENU_ENTRIES, entry);
export const addPluginWindow = (component: Component) => addTo(PLUGIN_WINDOWS, markRaw(component) as Component);

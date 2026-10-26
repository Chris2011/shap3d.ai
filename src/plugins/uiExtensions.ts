import { markRaw, reactive, shallowReactive, type Component } from 'vue';
import type { Editor } from '../engine/editor';

/** Context-menu entries contributed by plugins (shown for the current selection). */
export interface ContextMenuEntry {
  /** text or message key */
  label: string;
  /** show the entry only when this is true (default: always) */
  when?: (editor: Editor) => boolean;
  run: (editor: Editor) => void;
}

export const CONTEXT_MENU_ENTRIES = shallowReactive<ContextMenuEntry[]>([]);

/** A button in the top bar (next to the model name), e.g. the AI assistant's sparkle. */
export interface TopBarButton {
  icon: string;
  /** tooltip: text or message key */
  title: string;
  /** highlighted while true (e.g. its panel is open) */
  active?: () => boolean;
  /** short text next to the icon, e.g. the language code "DE" */
  badge?: () => string;
  /** 'name' (default): next to the model name · 'theme': right of the light/dark switch */
  position?: 'name' | 'theme';
  /** the click event lets the button open a popover at its position */
  run: (editor: Editor, event: MouseEvent) => void;
}

export const TOP_BAR_BUTTONS = shallowReactive<TopBarButton[]>([]);

/** Floating windows contributed by plugins – rendered once in App.vue, the component decides when it is visible. */
export const PLUGIN_WINDOWS = shallowReactive<Component[]>([]);

const addTo = <T>(list: T[], item: T) => {
  list.push(item);
  return () => {
    const index = list.indexOf(item);
    if (index >= 0) {
      list.splice(index, 1);
    }
  };
};

/**
 * A workspace of its own next to the 3D model (e.g. the layout plugin's sheets): while it is active, its
 * component fills the window below the top bar instead of the viewport, the tools and the panels.
 */
export interface Workspace {
  id: string;
  /** text or message key – shown in the switch in the top bar */
  label: string;
  icon?: string;
  component: Component;
}

export const WORKSPACES = shallowReactive<Workspace[]>([]);
/** the active workspace's id – null is the 3D model */
export const workspaceState = reactive({ active: null as string | null });

export const addWorkspace = (workspace: Workspace) => {
  const remove = addTo(WORKSPACES, { ...workspace, component: markRaw(workspace.component) as Component });
  return () => {
    remove();
    if (workspaceState.active === workspace.id) {
      workspaceState.active = null;
    }
  };
};

export const addContextMenuEntry = (entry: ContextMenuEntry) => addTo(CONTEXT_MENU_ENTRIES, entry);
export const addTopBarButton = (button: TopBarButton) => addTo(TOP_BAR_BUTTONS, button);
export const addPluginWindow = (component: Component) => addTo(PLUGIN_WINDOWS, markRaw(component) as Component);

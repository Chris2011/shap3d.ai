import { markRaw, reactive, shallowReactive, type Component } from 'vue';
import type { Editor } from '../engine/editor';
import { openPanel, PANEL_INFO } from '../components/panelState';

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

/**
 * A mode of a plugin (e.g. a level editor's): the 3D view stays, but the toolbar shows the mode's tools and the
 * right-hand bar only its panels – switched like a workspace in the top bar.
 */
export interface Mode {
  id: string;
  /** text or message key – shown in the switch in the top bar */
  label: string;
  icon?: string;
  /** the tools in the toolbar while the mode is on (full tool ids) – the first one is chosen on entering */
  tools: string[];
  /** the panels in the right-hand bar while the mode is on (full panel ids); without it all stay */
  panels?: string[];
  enter?: (editor: Editor) => void;
  leave?: (editor: Editor) => void;
}

export const MODES = shallowReactive<Mode[]>([]);
/** the active mode's id – null is the usual 3D model */
export const modeState = reactive({ active: null as string | null });

export const activeMode = () => MODES.find((mode) => mode.id === modeState.active);

/**
 * Shows the 3D model, a workspace or a mode (by id; null = the 3D model with its usual tools) – leaving the mode
 * that was on.
 */
export const switchView = (editor: Editor, id: string | null) => {
  const mode = MODES.find((candidate) => candidate.id === id);
  const previous = activeMode();
  if (previous && previous !== mode) {
    modeState.active = null;
    previous.leave?.(editor);
    editor.setTool('select');
    // a panel that only belongs to that mode closes with it
    if (PANEL_INFO.some((panel) => panel.id === openPanel.value && panel.inMode)) {
      openPanel.value = null;
    }
  }
  workspaceState.active = mode || !id ? null : id;
  if (mode && previous !== mode) {
    modeState.active = mode.id;
    const first = mode.tools.find((tool) => editor.hasTool(tool));
    if (first) {
      editor.setTool(first);
    }
    // an open panel the mode does not show closes
    if (mode.panels && openPanel.value && !mode.panels.includes(openPanel.value)) {
      openPanel.value = null;
    }
    mode.enter?.(editor);
  }
  editor.invalidate();
};

export const addMode = (editor: Editor, mode: Mode) => {
  const remove = addTo(MODES, mode);
  return () => {
    if (modeState.active === mode.id) {
      switchView(editor, null);
    }
    remove();
  };
};

export const addContextMenuEntry = (entry: ContextMenuEntry) => addTo(CONTEXT_MENU_ENTRIES, entry);
export const addTopBarButton = (button: TopBarButton) => addTo(TOP_BAR_BUTTONS, button);
export const addPluginWindow = (component: Component) => addTo(PLUGIN_WINDOWS, markRaw(component) as Component);

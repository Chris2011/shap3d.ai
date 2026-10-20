import { ref, shallowReactive, markRaw, type Component } from 'vue';
import { localized, t } from '../i18n';

export const openPanel = ref<string | null>(null);
export const showPanel = (id: string) => {
  openPanel.value = id;
};
export const togglePanel = (id: string) => {
  openPanel.value = openPanel.value === id ? null : id;
};

export interface PanelInfo {
  id: string;
  label: string;
  icon: string;
  width: number;
  flush?: boolean;
  /** set for panels added at runtime (plugins); built-in components are attached in S3dRightPanels.vue */
  component?: Component;
  /** false = no tile in the right-hand bar (plugin panels open via menu, palette or plugin manager) */
  tile?: boolean;
}

/** Right-hand panels (order = order of the tiles); reactive so plugins can add and remove panels. */
/** label = message `panels.<id>` */
const panelInfo = (id: string, icon: string, width = 300, flush?: boolean): PanelInfo =>
  localized({ id, icon, width, flush } as PanelInfo, 'label', `panels.${id}`);

export const PANEL_INFO = shallowReactive<PanelInfo[]>([
  panelInfo('entityinfo', 'entityinfo'),
  panelInfo('components', 'component'),
  panelInfo('instructor', 'instructor'),
  panelInfo('materials', 'materials'),
  panelInfo('styles', 'styles'),
  panelInfo('tags', 'tags'),
  panelInfo('shadows', 'shadows'),
  panelInfo('scenes', 'scenes'),
  panelInfo('display', 'display'),
  panelInfo('soften', 'soften'),
  panelInfo('mesh', 'mesh'),
  panelInfo('modelinfo', 'modelinfo'),
  panelInfo('outliner', 'outliner'),
  panelInfo('scripts', 'script', 520, true),
  panelInfo('plugins', 'plugin', 340),
]);

/** Adds a panel at runtime (plugins, no tile by default; `first` puts its tile on top); returns a function that removes it again. */
export const addPanel = (panel: PanelInfo, first = false) => {
  if (PANEL_INFO.some((existing) => existing.id === panel.id)) {
    throw new Error(t('panels.errors.exists', { id: panel.id }));
  }
  // keep the object (its label may be a getter that follows the language)
  const entry = Object.assign(panel, { tile: panel.tile ?? false, component: panel.component && markRaw(panel.component) });
  if (first) {
    PANEL_INFO.unshift(entry);
  } else {
    PANEL_INFO.push(entry);
  }
  return () => {
    const index = PANEL_INFO.indexOf(entry);
    if (index >= 0) {
      PANEL_INFO.splice(index, 1);
    }
    if (openPanel.value === panel.id) {
      openPanel.value = null;
    }
  };
};

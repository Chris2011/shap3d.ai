import { ref, shallowReactive, markRaw, type Component } from 'vue';

export const openPanel = ref<string | null>(null);
export const showPanel = (id: string) => { openPanel.value = id; };
export const togglePanel = (id: string) => { openPanel.value = openPanel.value === id ? null : id; };

export interface PanelInfo {
  id: string; label: string; icon: string; width: number; flush?: boolean;
  /** set for panels added at runtime (plugins); built-in components are attached in S3dRightPanels.vue */
  component?: Component;
  /** false = no tile in the right-hand bar (plugin panels open via menu, palette or plugin manager) */
  tile?: boolean;
}

/** Right-hand panels (order = order of the tiles); reactive so plugins can add and remove panels. */
export const PANEL_INFO = shallowReactive<PanelInfo[]>([
  { id: 'ai', label: 'KI-Assistent', icon: 'sparkle', width: 400, flush: true },
  { id: 'entityinfo', label: 'Elementinformationen', icon: 'entityinfo', width: 300 },
  { id: 'components', label: 'Komponenten', icon: 'component', width: 300 },
  { id: 'instructor', label: 'Mentor', icon: 'instructor', width: 300 },
  { id: 'materials', label: 'Materialien', icon: 'materials', width: 300 },
  { id: 'styles', label: 'Stile', icon: 'styles', width: 300 },
  { id: 'tags', label: 'Tags', icon: 'tags', width: 300 },
  { id: 'shadows', label: 'Schatten', icon: 'shadows', width: 300 },
  { id: 'scenes', label: 'Szenen', icon: 'scenes', width: 300 },
  { id: 'display', label: 'Anzeige', icon: 'display', width: 300 },
  { id: 'soften', label: 'Abmildern / Glätten', icon: 'soften', width: 300 },
  { id: 'mesh', label: 'Polygone & Punkte', icon: 'mesh', width: 300 },
  { id: 'modelinfo', label: 'Modellinformationen', icon: 'modelinfo', width: 300 },
  { id: 'outliner', label: 'Gliederung', icon: 'outliner', width: 300 },
  { id: 'scripts', label: 'Skript-Editor', icon: 'script', width: 520, flush: true },
  { id: 'plugins', label: 'Plugins', icon: 'plugin', width: 340 },
]);

/** Adds a panel at runtime (plugins, no tile by default); returns a function that removes it again. */
export const addPanel = (panel: PanelInfo) => {
  if (PANEL_INFO.some(existing => existing.id === panel.id)) throw new Error(`Panel „${panel.id}“ gibt es schon`);
  const entry = { tile: false, ...panel, component: panel.component && markRaw(panel.component) };
  PANEL_INFO.push(entry);
  return () => {
    const index = PANEL_INFO.indexOf(entry); if (index >= 0) PANEL_INFO.splice(index, 1);
    if (openPanel.value === panel.id) openPanel.value = null;
  };
};

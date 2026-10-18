import { ref } from 'vue';

export const openPanel = ref<string | null>(null);
export function showPanel(id: string) { openPanel.value = id; }
export function togglePanel(id: string) { openPanel.value = openPanel.value === id ? null : id; }

/** Right-hand panels (order = order of the tiles). The components are attached in S3dRightPanels.vue. */
export const PANEL_INFO: { id: string; label: string; icon: string; width: number; flush?: boolean }[] = [
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
];

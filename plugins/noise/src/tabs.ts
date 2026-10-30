import { pluginContext } from './runtime';

/** the panel's tabs – the context menu opens the panel on one of them */
export const TABS = ['terrain', 'scatter', 'paving', 'city', 'deform', 'script'] as const;
export type PanelTab = (typeof TABS)[number];

export const PANEL = 'noise';

let listener: ((tab: PanelTab) => void) | null = null;

/** the open panel follows tab requests (one panel at a time) */
export const onTabRequest = (follow: (tab: PanelTab) => void) => {
  listener = follow;
};

/** opens the panel on a tab */
export const openPanel = (tab: PanelTab) => {
  const context = pluginContext();
  context.storage.set('tab', tab);
  listener?.(tab);
  context.panels.open(PANEL);
};

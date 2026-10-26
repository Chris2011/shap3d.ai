/**
 * The workspace's styles. A plugin package brings no CSS file the app would load, and the app's Tailwind only
 * knows its own classes – so the rules come as a <style> element while the plugin is on. Colours are the app's
 * design tokens (--s3d-…), so light and dark mode follow by themselves.
 */
const CSS = `
.s3d-lo { position: absolute; inset: 0; display: flex; padding-top: 3rem; outline: none; color: var(--s3d-text); font-size: 0.8125rem; }
.s3d-lo-side { width: 13.5rem; flex: none; display: flex; flex-direction: column; gap: 0.375rem; padding: 0.75rem; background: var(--s3d-panel); border-inline-end: 1px solid var(--s3d-line); overflow-y: auto; }
.s3d-lo-inspector { border-inline-end: 0; border-inline-start: 1px solid var(--s3d-line); width: 15rem; }
.s3d-lo-title { font-weight: 700; margin: 0 0 0.25rem; }
.s3d-lo-page { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.5rem; border: 0; border-radius: 3px; background: transparent; color: inherit; text-align: start; cursor: pointer; }
.s3d-lo-page:hover { background: var(--s3d-hover); }
.s3d-lo-page.active { background: var(--s3d-sel); font-weight: 700; }
.s3d-lo-page-number { width: 1.25rem; height: 1.25rem; flex: none; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--s3d-line-2); border-radius: 2px; font-size: 0.6875rem; }
.s3d-lo-page-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s3d-lo-side-actions { display: flex; flex-wrap: wrap; gap: 0.375rem; margin-top: 0.375rem; }
.s3d-lo-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.s3d-lo-toolbar { display: flex; align-items: center; gap: 0.25rem; padding: 0.375rem 0.5rem; background: var(--s3d-panel); border-bottom: 1px solid var(--s3d-line); flex-wrap: wrap; }
.s3d-lo-tool { height: 1.875rem; padding: 0 0.625rem; border: 1px solid transparent; border-radius: 3px; background: transparent; color: inherit; cursor: pointer; white-space: nowrap; }
.s3d-lo-tool:hover:enabled { background: var(--s3d-hover); }
.s3d-lo-tool.active { background: var(--s3d-sel); border-color: var(--s3d-line-2); font-weight: 700; }
.s3d-lo-tool.primary { background: var(--s3d-navy-bg); color: #fff; font-weight: 700; }
.s3d-lo-tool:disabled { opacity: 0.4; cursor: default; }
.s3d-lo-gap { width: 0.75rem; }
.s3d-lo-canvas { flex: 1; min-height: 0; overflow: auto; display: grid; place-items: safe center; padding: 1.5rem; background: var(--s3d-bg-2); }
.s3d-lo-paper { position: relative; box-shadow: 0 2px 10px rgba(0, 0, 0, 0.25); background: #fff; touch-action: none; }
.s3d-lo-paper.tool-select { cursor: default; }
.s3d-lo-paper:not(.tool-select) { cursor: crosshair; }
.s3d-lo-paper.tool-text { cursor: text; }
.s3d-lo-svg, .s3d-lo-svg svg, .s3d-lo-overlay { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.s3d-lo-svg [data-id] { cursor: move; }
.s3d-lo-paper:not(.tool-select) .s3d-lo-svg [data-id] { cursor: inherit; }
.s3d-lo-overlay { pointer-events: none; overflow: visible; }
.s3d-lo-selection { fill: none; stroke: #1d4ed8; stroke-width: 0.35; stroke-dasharray: 1.2 0.8; }
.s3d-lo-handle { fill: #fff; stroke: #1d4ed8; stroke-width: 0.4; pointer-events: all; cursor: nwse-resize; }
.s3d-lo-draft { fill: rgba(29, 78, 216, 0.06); stroke: #1d4ed8; stroke-width: 0.35; stroke-dasharray: 1.2 0.8; }
.s3d-lo-empty { text-align: center; color: var(--s3d-text-2); }
.s3d-lo-empty .s3d-lo-side-actions { justify-content: center; }
.s3d-lo-status { padding: 0.25rem 0.75rem; font-size: 0.75rem; color: var(--s3d-text-2); background: var(--s3d-panel); border-top: 1px solid var(--s3d-line); }
.s3d-lo-field { display: flex; align-items: center; gap: 0.5rem; margin: 0.125rem 0; }
.s3d-lo-field > span { width: 5.5rem; flex: none; color: var(--s3d-text-2); font-size: 0.75rem; }
.s3d-lo-field.column { flex-direction: column; align-items: stretch; gap: 0.25rem; }
.s3d-lo-field.column > span { width: auto; }
.s3d-lo-field .s3d-input { flex: 1; min-width: 0; }
.s3d-lo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 0.5rem; }
.s3d-lo-grid .s3d-lo-field > span { width: 1rem; }
.s3d-lo-hint { font-size: 0.75rem; color: var(--s3d-text-2); margin: 0.5rem 0 0; }
.s3d-lo-danger { margin-top: 0.5rem; }
.s3d-lo-tool-group { position: relative; display: inline-flex; }
.s3d-lo-more { padding: 0 0.25rem; margin-inline-start: -0.125rem; font-size: 0.625rem; }
.s3d-lo-menu { position: absolute; top: 100%; inset-inline-start: 0; z-index: 5; display: flex; flex-direction: column; min-width: 10rem; padding: 0.25rem; background: var(--s3d-panel); border: 1px solid var(--s3d-line-2); border-radius: 3px; box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2); }
.s3d-lo-menu button { padding: 0.375rem 0.5rem; border: 0; border-radius: 2px; background: transparent; color: inherit; text-align: start; cursor: pointer; white-space: nowrap; }
.s3d-lo-menu button:hover { background: var(--s3d-hover); }
.s3d-lo-menu button.active { background: var(--s3d-sel); font-weight: 700; }
.s3d-lo-amount { display: inline-flex; align-items: center; gap: 0.375rem; margin-inline-start: 0.5rem; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-lo-amount .s3d-input { width: 4.5rem; }
.s3d-lo-pending { fill: rgba(234, 88, 12, 0.08); stroke: #ea580c; stroke-width: 0.35; stroke-dasharray: 1.2 0.8; }
.s3d-lo-draft.open { fill: none; }
.s3d-lo-color { width: 2.25rem; height: 1.625rem; padding: 0; border: 1px solid var(--s3d-line-2); border-radius: 3px; background: transparent; cursor: pointer; }
.s3d-lo-library-title { margin-top: 0.75rem; }
.s3d-lo-library { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem; }
.s3d-lo-symbol { display: flex; flex-direction: column; align-items: center; gap: 0.125rem; padding: 0.25rem; border: 1px solid transparent; border-radius: 3px; background: transparent; color: inherit; cursor: pointer; }
.s3d-lo-symbol:hover { background: var(--s3d-hover); }
.s3d-lo-symbol.active { background: var(--s3d-sel); border-color: var(--s3d-line-2); }
.s3d-lo-symbol-preview { width: 100%; height: 3rem; background: #fff; border-radius: 2px; }
.s3d-lo-symbol-name { font-size: 0.6875rem; text-align: center; line-height: 1.2; }
.s3d-lo-presentation { position: fixed; inset: 0; z-index: 100; display: grid; place-items: center; background: #111; outline: none; cursor: pointer; }
.s3d-lo-presentation-page { width: 100vw; height: 100vh; }
.s3d-lo-presentation-page svg { width: 100%; height: 100%; display: block; }
.s3d-lo-canvas.panning, .s3d-lo-canvas.panning * { cursor: grabbing !important; }
.s3d-lo-page.drop-target { box-shadow: inset 0 2px 0 #1d4ed8; }
.s3d-lo-add { position: relative; }
.s3d-lo-template-menu { top: calc(100% + 0.25rem); min-width: 12rem; }
.s3d-lo-menu-row { display: flex; align-items: center; gap: 0.125rem; }
.s3d-lo-menu-row > button:first-child { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.s3d-lo-icon-button { width: 1.375rem; height: 1.375rem; flex: none; padding: 0; border: 0; border-radius: 2px; background: transparent; color: inherit; cursor: pointer; font-size: 0.75rem; line-height: 1; }
.s3d-lo-icon-button:hover:enabled { background: var(--s3d-hover); }
.s3d-lo-icon-button.off { opacity: 0.4; }
.s3d-lo-icon-button:disabled { opacity: 0.25; cursor: default; }
.s3d-lo-layers-title { display: flex; align-items: center; justify-content: space-between; margin-top: 0.75rem; }
.s3d-lo-layers { display: flex; flex-direction: column; gap: 0.125rem; }
.s3d-lo-layer { display: flex; align-items: center; gap: 0.125rem; padding: 0.125rem 0.25rem; border-radius: 3px; cursor: pointer; }
.s3d-lo-layer:hover { background: var(--s3d-hover); }
.s3d-lo-layer.active { background: var(--s3d-sel); font-weight: 700; }
.s3d-lo-layer:not(:hover) .s3d-lo-layer-extra { display: none; }
.s3d-lo-layer-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s3d-lo-grid-lines { fill: none; stroke: rgba(29, 78, 216, 0.16); stroke-width: 0.15; }
.s3d-lo-handle[data-handle='n'], .s3d-lo-handle[data-handle='s'] { cursor: ns-resize; }
.s3d-lo-handle[data-handle='e'], .s3d-lo-handle[data-handle='w'] { cursor: ew-resize; }
.s3d-lo-handle[data-handle='ne'], .s3d-lo-handle[data-handle='sw'] { cursor: nesw-resize; }
.s3d-lo-handle[data-handle='start'], .s3d-lo-handle[data-handle='end'], .s3d-lo-handle[data-handle='vertex'], .s3d-lo-handle[data-handle='radius'] { cursor: move; }
.s3d-lo-context { position: absolute; inset-inline-start: auto; z-index: 40; min-width: 13rem; gap: 0.125rem; }
.s3d-lo-context hr { border: 0; border-top: 1px solid var(--s3d-line); margin: 0.25rem 0; }
.s3d-lo-context .s3d-lo-field > span { width: 4rem; }
.s3d-lo-tags { display: flex; flex-direction: column; gap: 0.125rem; padding-inline-start: 1.25rem; max-height: 10rem; overflow-y: auto; }
`;

/** adds the styles; returns a function that removes them again */
export const injectStyles = () => {
  const style = document.createElement('style');
  style.dataset.plugin = 'layout';
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
};

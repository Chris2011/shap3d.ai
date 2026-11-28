/**
 * The panel's styles. A plugin package brings no CSS file the app would load, and the app's Tailwind only
 * knows its own classes – so the rules come as a <style> element while the plugin is on. Colours are the app's
 * design tokens (--s3d-…), so light and dark mode follow by themselves.
 */
const CSS = `
.s3d-ws { display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.8125rem; color: var(--s3d-text); }
.s3d-ws-heading { font-weight: 700; margin-top: 0.5rem; }
.s3d-ws-hint { margin: 0; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-ws-sides { margin: 0; font-weight: 600; }
.s3d-ws-field { display: grid; grid-template-columns: 7.5rem 1fr; align-items: center; gap: 0.375rem; }
.s3d-ws-field > span { font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-ws-field .s3d-input { min-width: 0; }
.s3d-ws-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
.s3d-ws-table td { padding: 0.2rem 0.25rem 0.2rem 0; vertical-align: top; }
.s3d-ws-table .count, .s3d-ws-table .size { text-align: end; white-space: nowrap; }
.s3d-ws-table .material { color: var(--s3d-text-2); }
.s3d-ws-tabs { display: flex; margin-top: 0.5rem; border: 1px solid var(--s3d-line-2); border-radius: 4px; overflow: hidden; }
.s3d-ws-tabs button { flex: 1; padding: 0.3rem 0.2rem; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 0.75rem; }
.s3d-ws-tabs button.active { background: var(--s3d-navy-bg); color: #fff; font-weight: 600; }
.s3d-ws-nest { display: flex; flex-direction: column; gap: 0.375rem; margin-top: 0.25rem; }
.s3d-ws-nest-title { display: flex; justify-content: space-between; gap: 0.5rem; font-weight: 600; font-size: 0.75rem; }
.s3d-ws-nest-title > span { font-weight: 400; color: var(--s3d-text-2); white-space: nowrap; }
.s3d-ws-warning { margin: 0; font-size: 0.75rem; color: var(--s3d-danger, #c0392b); }
.s3d-ws-sheet { width: 100%; height: auto; display: block; }
.s3d-ws-sheet .board { fill: var(--s3d-hover); stroke: var(--s3d-line-2); stroke-width: 0.006; }
.s3d-ws-sheet .piece { fill: #d9b98a; stroke: #8a6a3c; stroke-width: 0.004; }
.s3d-ws-sheet text { fill: #3d2b14; text-anchor: middle; dominant-baseline: central; pointer-events: none; }
`;

/** adds the styles; returns a function that removes them again */
export const injectStyles = () => {
  const style = document.createElement('style');
  style.dataset.plugin = 'woodshop';
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
};

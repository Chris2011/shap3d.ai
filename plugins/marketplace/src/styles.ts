/**
 * The panel's styles. A plugin package brings no CSS file the app would load, and the app's Tailwind only
 * knows its own classes – so the rules come as a <style> element while the plugin is on. Colours are the app's
 * design tokens (--s3d-…), so light and dark mode follow by themselves.
 */
const CSS = `
.s3d-mk { display: flex; flex-direction: column; gap: 0.625rem; font-size: 0.8125rem; color: var(--s3d-text); }
.s3d-mk-hint { margin: 0; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-mk-warn { margin: 0; padding: 0.375rem 0.5rem; border: 1px solid var(--s3d-line); border-radius: 4px; font-size: 0.75rem; }
.s3d-mk-row { display: flex; gap: 0.375rem; align-items: center; }
.s3d-mk-input { flex: 1; min-width: 0; padding: 0.25rem 0.375rem; border: 1px solid var(--s3d-line); border-radius: 4px; background: transparent; color: inherit; font: inherit; }
.s3d-mk-chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.s3d-mk-chip { padding: 0.125rem 0.5rem; border: 1px solid var(--s3d-line); border-radius: 999px; background: transparent; color: inherit; font-size: 0.75rem; cursor: pointer; }
.s3d-mk-chip:hover { background: var(--s3d-hover); }
.s3d-mk-chip.active { border-color: var(--s3d-navy-bg); box-shadow: 0 0 0 1px var(--s3d-navy-bg); }
.s3d-mk-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.375rem; }
.s3d-mk-card { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; padding: 0.25rem; border: 1px solid var(--s3d-line); border-radius: 4px; background: transparent; color: inherit; text-align: start; cursor: pointer; }
.s3d-mk-card:hover { background: var(--s3d-hover); }
.s3d-mk-thumb { display: block; width: 100%; aspect-ratio: 4 / 3; object-fit: contain; border-radius: 3px; background: var(--s3d-hover); }
.s3d-mk-title { font-weight: 700; overflow-wrap: anywhere; }
.s3d-mk-card .s3d-mk-title { font-size: 0.75rem; line-height: 1.2; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; overflow: hidden; }
.s3d-mk-meta { font-size: 0.6875rem; color: var(--s3d-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s3d-mk-facts { display: grid; grid-template-columns: auto 1fr; gap: 0.125rem 0.5rem; margin: 0; }
.s3d-mk-facts dt { color: var(--s3d-text-2); }
.s3d-mk-facts dd { margin: 0; overflow-wrap: anywhere; }
.s3d-mk-bar { height: 6px; border-radius: 3px; background: var(--s3d-hover); overflow: hidden; }
.s3d-mk-bar span { display: block; height: 100%; background: var(--s3d-navy-bg); }
.s3d-mk-credit { display: flex; flex-direction: column; gap: 0.125rem; padding: 0.25rem 0; border-top: 1px solid var(--s3d-line); }
`;

/** adds the styles; returns a function that removes them again */
export const injectStyles = () => {
  const style = document.createElement('style');
  style.dataset.plugin = 'marketplace';
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
};

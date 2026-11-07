/**
 * The panel's styles. A plugin package brings no CSS file the app would load, and the app's Tailwind only
 * knows its own classes – so the rules come as a <style> element while the plugin is on. Colours are the app's
 * design tokens (--s3d-…), so light and dark mode follow by themselves.
 */
const CSS = `
.s3d-bk { display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.8125rem; color: var(--s3d-text); }
.s3d-bk-section { display: flex; flex-direction: column; gap: 0.375rem; }
.s3d-bk-section + .s3d-bk-section { padding-top: 0.625rem; border-top: 1px solid var(--s3d-line); }
.s3d-bk-heading { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; font-weight: 700; }
.s3d-bk-hint { margin: 0; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-bk-hint.strong { color: var(--s3d-text); font-weight: 600; }
.s3d-bk-warn { margin: 0; padding: 0.375rem 0.5rem; border: 1px solid var(--s3d-line); border-radius: 4px; font-size: 0.75rem; }
.s3d-bk-row { display: flex; flex-wrap: wrap; gap: 0.375rem; align-items: center; }
.s3d-bk-steps { margin: 0; padding-inline-start: 1.125rem; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-bk-input { flex: 1; min-width: 0; padding: 0.25rem 0.375rem; border: 1px solid var(--s3d-line); border-radius: 4px; background: transparent; color: inherit; font: inherit; }
.s3d-bk-chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.s3d-bk-chip { padding: 0.125rem 0.5rem; border: 1px solid var(--s3d-line); border-radius: 999px; background: transparent; color: inherit; font-size: 0.75rem; cursor: pointer; }
.s3d-bk-chip:hover { background: var(--s3d-hover); }
.s3d-bk-chip.active { border-color: var(--s3d-navy-bg); box-shadow: 0 0 0 1px var(--s3d-navy-bg); }
.s3d-bk-colors { display: grid; grid-template-columns: repeat(9, 1fr); gap: 0.25rem; }
.s3d-bk-color { aspect-ratio: 1; border: 1px solid var(--s3d-line); border-radius: 4px; cursor: pointer; padding: 0; }
.s3d-bk-color.active { outline: 2px solid var(--s3d-navy-bg); outline-offset: 1px; }
.s3d-bk-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.375rem; }
.s3d-bk-card { display: flex; flex-direction: column; gap: 0.125rem; align-items: center; min-width: 0; padding: 0.25rem; border: 1px solid var(--s3d-line); border-radius: 4px; background: transparent; color: inherit; text-align: center; cursor: pointer; }
.s3d-bk-card:hover { background: var(--s3d-hover); }
.s3d-bk-card.active { border-color: var(--s3d-navy-bg); box-shadow: 0 0 0 1px var(--s3d-navy-bg); }
.s3d-bk-thumb { display: block; width: 100%; aspect-ratio: 1; }
.s3d-bk-thumb svg { display: block; width: 100%; height: 100%; }
.s3d-bk-name { font-size: 0.6875rem; line-height: 1.2; overflow-wrap: anywhere; }
.s3d-bk-results { display: flex; flex-direction: column; max-height: 13rem; overflow-y: auto; border: 1px solid var(--s3d-line); border-radius: 4px; }
.s3d-bk-result { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.25rem 0.375rem; border: none; border-bottom: 1px solid var(--s3d-line); background: transparent; color: inherit; font: inherit; font-size: 0.75rem; text-align: start; cursor: pointer; }
.s3d-bk-result:last-child { border-bottom: none; }
.s3d-bk-result:hover { background: var(--s3d-hover); }
.s3d-bk-number { color: var(--s3d-text-2); white-space: nowrap; }
.s3d-bk-entry { display: flex; align-items: center; gap: 0.375rem; width: 100%; padding: 0.125rem 0.25rem; border: none; border-radius: 3px; background: transparent; color: inherit; font: inherit; font-size: 0.75rem; text-align: start; cursor: pointer; }
.s3d-bk-entry:hover { background: var(--s3d-hover); }
.s3d-bk-count { min-width: 2rem; font-weight: 700; }
.s3d-bk-dot { flex: none; width: 0.75rem; height: 0.75rem; border: 1px solid var(--s3d-line); border-radius: 3px; }
.s3d-bk-file { align-self: flex-start; cursor: pointer; }
.s3d-bk-file input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.s3d-bk-credit { margin: 0; font-size: 0.6875rem; color: var(--s3d-text-2); overflow-wrap: anywhere; }
`;

/** adds the styles; returns a function that removes them again */
export const injectStyles = () => {
  const style = document.createElement('style');
  style.dataset.plugin = 'bricks';
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
};

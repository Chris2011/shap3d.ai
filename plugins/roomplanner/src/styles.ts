/**
 * The panel's styles. A plugin package brings no CSS file the app would load, and the app's Tailwind only
 * knows its own classes – so the rules come as a <style> element while the plugin is on. Colours are the app's
 * design tokens (--s3d-…), so light and dark mode follow by themselves.
 */
const CSS = `
.s3d-rp { display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.8125rem; color: var(--s3d-text); }
.s3d-rp-section { display: flex; flex-direction: column; gap: 0.375rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--s3d-line); }
.s3d-rp-section:last-child { border-bottom: 0; }
.s3d-rp-heading { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; font-weight: 700; }
.s3d-rp-subheading { font-weight: 600; margin-top: 0.25rem; color: var(--s3d-text-2); }
.s3d-rp-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem; }
.s3d-rp-row .s3d-input { flex: 1; min-width: 0; }
.s3d-rp-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 0.5rem; }
.s3d-rp-grid.four { grid-template-columns: repeat(4, 1fr); }
.s3d-rp-field { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; }
.s3d-rp-field > span { font-size: 0.6875rem; color: var(--s3d-text-2); }
.s3d-rp-field .s3d-input { width: 100%; min-width: 0; }
.s3d-rp-params { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 0.5rem; }
.s3d-rp-figures { display: grid; grid-template-columns: 1fr 1fr; gap: 0.125rem 0.5rem; font-size: 0.75rem; }
.s3d-rp-figures span:first-child { grid-column: 1 / -1; font-weight: 600; }
.s3d-rp-opening { display: flex; flex-direction: column; gap: 0.25rem; padding: 0.375rem; border: 1px solid var(--s3d-line); border-radius: 4px; }
.s3d-rp-icon { width: 1.5rem; height: 1.5rem; flex: none; border: 0; border-radius: 3px; background: transparent; color: inherit; cursor: pointer; }
.s3d-rp-icon:hover { background: var(--s3d-hover); }
.s3d-rp-categories { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.s3d-rp-categories button { padding: 0.2rem 0.55rem; border: 1px solid var(--s3d-line-2); border-radius: 999px; background: transparent; color: inherit; cursor: pointer; font-size: 0.75rem; }
.s3d-rp-categories button:hover { background: var(--s3d-hover); }
.s3d-rp-categories button.active { background: var(--s3d-navy-bg); border-color: var(--s3d-navy-bg); color: #fff; }
.s3d-rp-items { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.375rem; }
.s3d-rp-item { display: flex; flex-direction: column; align-items: stretch; gap: 0.125rem; padding: 0.25rem; border: 1px solid var(--s3d-line); border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }
.s3d-rp-item:hover { background: var(--s3d-hover); }
.s3d-rp-item.active { border-color: var(--s3d-navy-bg); box-shadow: 0 0 0 1px var(--s3d-navy-bg); }
.s3d-rp-item-name { font-size: 0.6875rem; line-height: 1.2; text-align: center; }
.s3d-rp-preview { display: block; height: 3.25rem; background: #fff; border-radius: 3px; }
.s3d-rp-preview svg { width: 100%; height: 100%; display: block; }
.s3d-rp-preview.large { width: 6rem; height: 6rem; flex: none; }
.s3d-rp-chosen { display: flex; gap: 0.5rem; padding: 0.5rem; border-radius: 4px; background: var(--s3d-sel); }
.s3d-rp-chosen-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.s3d-rp-chosen-body .s3d-rp-params { grid-template-columns: 1fr; }
.s3d-rp-hint { margin: 0; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-rp-hint.strong { color: var(--s3d-text); font-weight: 600; }
.s3d-rp-selected { padding: 0.5rem; border: 1px solid var(--s3d-navy-bg); border-radius: 4px; }
.s3d-rp-list-entry { display: flex; gap: 0.375rem; padding: 0.2rem 0.25rem; border: 0; border-radius: 3px; background: transparent; color: inherit; text-align: start; cursor: pointer; }
.s3d-rp-list-entry:hover { background: var(--s3d-hover); }
.s3d-rp-count { width: 2rem; flex: none; text-align: end; font-weight: 600; }
.s3d-rp-room-form { display: flex; flex-direction: column; gap: 0.375rem; }
.s3d-rp-points { display: grid; grid-template-columns: 1.5rem 1fr 1fr 1fr 1.5rem; gap: 0.25rem; align-items: center; font-size: 0.6875rem; color: var(--s3d-text-2); }
.s3d-rp-points .s3d-input { width: 100%; min-width: 0; }
.s3d-rp-grid.s3d-rp-slope { grid-template-columns: 1fr 1fr 1fr 1.5rem; align-items: end; }
.s3d-rp-levels { display: flex; border: 1px solid var(--s3d-line-2); border-radius: 4px; overflow: hidden; }
.s3d-rp-levels button { flex: 1; padding: 0.3rem; border: 0; background: transparent; color: inherit; cursor: pointer; }
.s3d-rp-levels button.active { background: var(--s3d-navy-bg); color: #fff; font-weight: 600; }
.s3d-rp-row .s3d-input.s3d-rp-narrow { flex: none; width: 4.5rem; }
.s3d-rp-inline { display: flex; align-items: center; gap: 0.375rem; }
.s3d-btn.primary { background: var(--s3d-navy-bg); color: #fff; }
`;

/** adds the styles; returns a function that removes them again */
export const injectStyles = () => {
  const style = document.createElement('style');
  style.dataset.plugin = 'roomplanner';
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
};

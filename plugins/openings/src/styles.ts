/**
 * The panel's styles. A plugin package brings no CSS file the app would load, and the app's Tailwind only
 * knows its own classes – so the rules come as a <style> element while the plugin is on. Colours are the app's
 * design tokens (--s3d-…), so light and dark mode follow by themselves.
 */
const CSS = `
.s3d-op { display: flex; flex-direction: column; gap: 0.5rem; font-size: 0.8125rem; color: var(--s3d-text); }
.s3d-op-heading { font-weight: 700; margin-top: 0.5rem; }
.s3d-op-sizes { margin: 0; font-weight: 600; }
.s3d-op-hint { margin: 0; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-op-field { display: grid; grid-template-columns: 7.5rem 1fr; align-items: center; gap: 0.375rem; }
.s3d-op-field > span { font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-op-field .s3d-input { min-width: 0; }
.s3d-op-tabs { display: flex; border: 1px solid var(--s3d-line-2); border-radius: 4px; overflow: hidden; }
.s3d-op-tabs button { flex: 1; padding: 0.3rem 0.2rem; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 0.75rem; }
.s3d-op-tabs button.active { background: var(--s3d-navy-bg); color: #fff; font-weight: 600; }
.s3d-op-table { width: 100%; border-collapse: collapse; font-size: 0.75rem; }
.s3d-op-table td { padding: 0.2rem 0.25rem 0.2rem 0; vertical-align: top; }
.s3d-op-table .count { width: 2rem; text-align: end; white-space: nowrap; }
.s3d-op-table .sizes { color: var(--s3d-text-2); }
`;

/** adds the styles; returns a function that removes them again */
export const injectStyles = () => {
  const style = document.createElement('style');
  style.dataset.plugin = 'openings';
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
};

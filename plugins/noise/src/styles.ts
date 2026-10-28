/**
 * The panel's styles. A plugin package brings no CSS file the app would load, and the app's Tailwind only
 * knows its own classes – so the rules come as a <style> element while the plugin is on. Colours are the app's
 * design tokens (--s3d-…), so light and dark mode follow by themselves.
 */
const CSS = `
.s3d-nz { display: flex; flex-direction: column; gap: 0.625rem; font-size: 0.8125rem; color: var(--s3d-text); }
.s3d-nz-tabs { display: flex; border: 1px solid var(--s3d-line-2); border-radius: 4px; overflow: hidden; }
.s3d-nz-tabs button { flex: 1; padding: 0.3rem 0.2rem; border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 0.75rem; }
.s3d-nz-tabs button.active { background: var(--s3d-navy-bg); color: #fff; font-weight: 600; }
.s3d-nz-section { display: flex; flex-direction: column; gap: 0.375rem; }
.s3d-nz-heading { font-weight: 700; margin-top: 0.25rem; }
.s3d-nz-presets { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.s3d-nz-presets button { padding: 0.2rem 0.55rem; border: 1px solid var(--s3d-line-2); border-radius: 999px; background: transparent; color: inherit; cursor: pointer; font-size: 0.75rem; }
.s3d-nz-presets button:hover { background: var(--s3d-hover); }
.s3d-nz-slider { display: grid; grid-template-columns: 6.5rem 1fr 3.75rem; align-items: center; gap: 0.375rem; }
.s3d-nz-slider > span { font-size: 0.75rem; color: var(--s3d-text-2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s3d-nz-slider input[type=range] { width: 100%; min-width: 0; accent-color: var(--s3d-navy-bg); }
.s3d-nz-slider .s3d-input { height: 1.5rem; padding: 0 0.25rem; font-size: 0.75rem; }
.s3d-nz-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem; }
.s3d-nz-row .s3d-input { flex: 1; min-width: 0; }
.s3d-nz-row .s3d-btn { flex: 1; }
.s3d-nz-checks { display: grid; grid-template-columns: 1fr 1fr; gap: 0 0.5rem; }
.s3d-nz-hint { margin: 0; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-nz-status { margin: 0; font-size: 0.75rem; padding: 0.375rem 0.5rem; border-radius: 4px; background: var(--s3d-sel); }
.s3d-nz-code { display: block; padding: 0.25rem 0.375rem; border-radius: 3px; background: var(--s3d-hover); font-size: 0.6875rem; white-space: pre-wrap; overflow-wrap: anywhere; }
.s3d-nz-dice { flex: none !important; width: 2rem; padding: 0 !important; }
`;

/** adds the styles; returns a function that removes them again */
export const injectStyles = () => {
  const style = document.createElement('style');
  style.dataset.plugin = 'noise';
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
};

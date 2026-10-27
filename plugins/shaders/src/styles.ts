/**
 * The panel's styles. A plugin package brings no CSS file the app would load, and the app's Tailwind only
 * knows its own classes – so the rules come as a <style> element while the plugin is on. Colours are the app's
 * design tokens (--s3d-…), so light and dark mode follow by themselves.
 */
const CSS = `
.s3d-sh { display: flex; flex-direction: column; gap: 0.625rem; font-size: 0.8125rem; color: var(--s3d-text); }
.s3d-sh-section { display: flex; flex-direction: column; gap: 0.375rem; }
.s3d-sh-heading { font-weight: 700; }
.s3d-sh-items { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.375rem; }
.s3d-sh-item { display: flex; flex-direction: column; align-items: stretch; gap: 0.25rem; padding: 0.25rem; border: 1px solid var(--s3d-line); border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }
.s3d-sh-item:hover { background: var(--s3d-hover); }
.s3d-sh-item.active { border-color: var(--s3d-navy-bg); box-shadow: 0 0 0 1px var(--s3d-navy-bg); }
.s3d-sh-preview { display: block; aspect-ratio: 1; border-radius: 3px; background-size: cover; }
.s3d-sh-name { font-size: 0.6875rem; line-height: 1.2; text-align: center; }
.s3d-sh-hint { margin: 0; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-sh-code { display: block; padding: 0.25rem 0.375rem; border-radius: 3px; background: var(--s3d-hover); font-size: 0.6875rem; overflow-wrap: anywhere; }
`;

/** adds the styles; returns a function that removes them again */
export const injectStyles = () => {
  const style = document.createElement('style');
  style.dataset.plugin = 'shaders';
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
};

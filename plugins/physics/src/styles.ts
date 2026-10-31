/**
 * The panel's styles. A plugin package brings no CSS file the app would load, and the app's Tailwind only
 * knows its own classes – so the rules come as a <style> element while the plugin is on. Colours are the app's
 * design tokens (--s3d-…), so light and dark mode follow by themselves.
 */
const CSS = `
.s3d-ph { display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.8125rem; color: var(--s3d-text); }
.s3d-ph-section { display: flex; flex-direction: column; gap: 0.375rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--s3d-line); }
.s3d-ph-section:last-child { border-bottom: 0; }
.s3d-ph-heading { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; font-weight: 700; }
.s3d-ph-subheading { margin-top: 0.25rem; font-size: 0.75rem; font-weight: 600; color: var(--s3d-text-2); }
.s3d-ph-time { font-weight: 400; font-size: 0.75rem; font-family: ui-monospace, monospace; color: var(--s3d-text-2); }
.s3d-ph-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s3d-ph-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem; }
.s3d-ph-row.end { justify-content: flex-end; }
.s3d-ph-grow { flex: 1; min-width: 0; }
.s3d-ph-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 0.5rem; align-items: end; }
.s3d-ph-field { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; }
.s3d-ph-field > span:first-child { font-size: 0.6875rem; color: var(--s3d-text-2); }
.s3d-ph-field .s3d-input { width: 100%; min-width: 0; }
.s3d-ph-vec { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.25rem; }
.s3d-ph-check { display: inline-flex; align-items: center; gap: 0.25rem; }
.s3d-ph-small { font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-ph-hint { margin: 0; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-ph-warning { margin: 0; font-size: 0.75rem; color: #c92a2a; }
.s3d-ph-joint { display: flex; flex-direction: column; gap: 0.375rem; padding: 0.375rem; border: 1px solid var(--s3d-line-2); border-radius: 4px; }
.s3d-ph-live { display: flex; flex-direction: column; gap: 0.125rem; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-ph-live input { width: 100%; }
.s3d-ph-entry { display: flex; align-items: center; gap: 0.375rem; padding: 0.2rem 0.25rem; border: 0; border-radius: 3px; background: transparent; color: inherit; text-align: start; cursor: pointer; }
.s3d-ph-entry:hover { background: var(--s3d-hover); }
.s3d-ph-entry.active { background: var(--s3d-sel); }
.s3d-ph-entry-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s3d-ph-entry-type { font-size: 0.6875rem; color: var(--s3d-text-2); }
.s3d-ph-swatch { width: 0.75rem; height: 0.75rem; flex: none; border-radius: 3px; }
.s3d-ph-guide-link { align-self: flex-start; padding: 0; border: 0; background: none; color: var(--s3d-navy-bg); font: inherit; font-size: 0.75rem; text-decoration: underline; cursor: pointer; }
.s3d-ph-guide-bar { height: 0.375rem; border-radius: 3px; background: var(--s3d-line); overflow: hidden; }
.s3d-ph-guide-bar > div { height: 100%; background: #2f9e44; transition: width 0.3s; }
.s3d-ph-guide-step { display: flex; flex-direction: column; border-radius: 4px; }
.s3d-ph-guide-step.open { border: 1px solid var(--s3d-line-2); }
.s3d-ph-guide-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem; border: 0; border-radius: 4px; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; }
.s3d-ph-guide-head:hover { background: var(--s3d-hover); }
.s3d-ph-guide-step.open .s3d-ph-guide-head { font-weight: 700; }
.s3d-ph-guide-mark { display: inline-flex; align-items: center; justify-content: center; width: 1.375rem; height: 1.375rem; flex: none; border-radius: 50%; border: 1px solid var(--s3d-line-2); font-size: 0.75rem; font-weight: 700; color: var(--s3d-text-2); }
.s3d-ph-guide-step.open .s3d-ph-guide-mark { border-color: var(--s3d-navy-bg); color: var(--s3d-navy-bg); }
.s3d-ph-guide-step.done .s3d-ph-guide-mark { border-color: #2f9e44; background: #2f9e44; color: #fff; }
.s3d-ph-guide-body { display: flex; flex-direction: column; gap: 0.5rem; padding: 0 0.5rem 0.5rem 2.25rem; }
.s3d-ph-guide-text { white-space: pre-line; }
.s3d-ph-guide-done { color: #2f9e44; }
.s3d-ph-guide-nav { justify-content: space-between; }
.s3d-ph-guide-checks { margin: 0; padding: 0; list-style: none; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-ph-guide-checks li.done { color: #2f9e44; }
.s3d-ph-top { justify-content: space-between; }
.s3d-ph-switch { display: inline-flex; border: 1px solid var(--s3d-line-2); border-radius: 4px; overflow: hidden; }
.s3d-ph-switch button { padding: 0.25rem 0.625rem; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.s3d-ph-switch button.active { background: var(--s3d-navy-bg); color: #fff; }
.s3d-ph-big { flex: 1; padding-block: 0.5rem; font-weight: 700; }
.s3d-ph-choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.75rem, 1fr)); gap: 0.375rem; }
.s3d-ph-choice { display: flex; flex-direction: column; align-items: flex-start; gap: 0.125rem; padding: 0.5rem; border: 1px solid var(--s3d-line-2); border-radius: 6px; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; }
.s3d-ph-choice:hover { background: var(--s3d-hover); }
.s3d-ph-choice.active { border-color: var(--s3d-navy-bg); box-shadow: inset 0 0 0 1px var(--s3d-navy-bg); background: var(--s3d-sel); }
.s3d-ph-choice > span:last-child { font-size: 0.6875rem; color: var(--s3d-text-2); }
.s3d-ph-choice.small { padding: 0.375rem 0.5rem; }
.s3d-ph-basic-joint { display: flex; align-items: center; gap: 0.5rem; padding: 0.25rem 0; }
.s3d-ph-basic-steps { padding: 0.375rem 0.5rem; border-radius: 4px; background: var(--s3d-sel); color: var(--s3d-text); }
.s3d-ph-timeline { display: flex; flex-direction: column; gap: 0.25rem; padding-top: 0.25rem; }
.s3d-ph-timeline .s3d-ph-row { justify-content: space-between; }
.s3d-ph-timeline input[type='range'] { width: 100%; }
.s3d-ph-rec-dot { display: inline-block; width: 0.625rem; height: 0.625rem; border-radius: 50%; background: #e03131; vertical-align: -1px; }
.s3d-ph .s3d-btn.primary { background: var(--s3d-navy-bg); color: #fff; }
`;

/** adds the styles; returns a function that removes them again */
export const injectStyles = () => {
  const style = document.createElement('style');
  style.dataset.plugin = 'physics';
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
};

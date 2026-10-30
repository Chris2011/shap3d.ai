/**
 * The panel's styles. A plugin package brings no CSS file the app would load, and the app's Tailwind only
 * knows its own classes – so the rules come as a <style> element while the plugin is on. Colours are the app's
 * design tokens (--s3d-…), so light and dark mode follow by themselves.
 */
const CSS = `
.s3d-lv { display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.8125rem; color: var(--s3d-text); }
.s3d-lv-section { display: flex; flex-direction: column; gap: 0.375rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--s3d-line); }
.s3d-lv-section:last-child { border-bottom: 0; }
.s3d-lv-heading { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; font-weight: 700; }
.s3d-lv-subheading { margin-top: 0.25rem; font-size: 0.75rem; font-weight: 600; color: var(--s3d-text-2); }
.s3d-lv-row { display: flex; flex-wrap: wrap; gap: 0.375rem; }
.s3d-lv-inline { display: inline-flex; align-items: center; gap: 0.375rem; }
.s3d-lv-kinds { display: grid; grid-template-columns: 1fr 1fr; gap: 0.375rem; }
.s3d-lv-kinds.three { grid-template-columns: 1fr 1fr 1fr; }
.s3d-lv-kinds.three .s3d-lv-kind { justify-content: center; }
.s3d-lv-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.25rem 0.5rem; align-items: end; }
.s3d-lv-piece { display: flex; flex-direction: column; gap: 0.375rem; border-radius: 4px; }
.s3d-lv-piece.open { padding: 0.25rem; border: 1px solid var(--s3d-line-2); }
.s3d-lv-kind { display: flex; align-items: center; gap: 0.375rem; padding: 0.375rem 0.5rem; border: 1px solid var(--s3d-line-2); border-radius: 4px; background: transparent; color: inherit; cursor: pointer; text-align: start; }
.s3d-lv-kind:hover { background: var(--s3d-hover); }
.s3d-lv-kind.active { border-color: var(--s3d-lv-colour); box-shadow: 0 0 0 1px var(--s3d-lv-colour); font-weight: 600; }
.s3d-lv-swatch { width: 0.75rem; height: 0.75rem; flex: none; border-radius: 3px; background: var(--s3d-lv-colour); }
.s3d-lv-field { display: flex; flex-direction: column; gap: 0.125rem; }
.s3d-lv-field > span { font-size: 0.6875rem; color: var(--s3d-text-2); }
.s3d-lv-field.check { flex-direction: row; align-items: center; gap: 0.375rem; }
.s3d-lv-field.check > span { font-size: 0.8125rem; color: inherit; }
.s3d-lv-field .s3d-input { width: 100%; min-width: 0; }
.s3d-lv-field .s3d-lv-colour { height: 1.75rem; padding: 0.125rem; }
.s3d-lv-hint { margin: 0; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-lv-warning { margin: 0; padding: 0.125rem 0.25rem; border: 0; border-radius: 3px; background: transparent; font: inherit; font-size: 0.75rem; color: #c92a2a; text-align: start; cursor: pointer; }
.s3d-lv-warning:hover:enabled { background: var(--s3d-hover); }
.s3d-lv-warning:disabled { cursor: default; }
.s3d-lv-action { display: grid; grid-template-columns: 1fr 1fr 1.5rem; gap: 0.25rem; align-items: center; }
.s3d-lv-action .s3d-input { width: 100%; min-width: 0; }
.s3d-lv-remove { width: 1.5rem; height: 1.5rem; border: 0; border-radius: 3px; background: transparent; color: inherit; cursor: pointer; }
.s3d-lv-remove:hover { background: var(--s3d-hover); }
.s3d-lv-entry { display: flex; align-items: center; gap: 0.375rem; padding: 0.2rem 0.25rem; border: 0; border-radius: 3px; background: transparent; color: inherit; text-align: start; cursor: pointer; }
.s3d-lv-entry:hover { background: var(--s3d-hover); }
.s3d-lv-entry.active { background: var(--s3d-sel); }
.s3d-lv-entry-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s3d-lv-entry-id { font-size: 0.6875rem; color: var(--s3d-text-2); font-family: ui-monospace, monospace; }
.s3d-lv .s3d-btn.primary { background: var(--s3d-navy-bg); color: #fff; }
.s3d-lv-guide-bar { height: 0.375rem; border-radius: 3px; background: var(--s3d-line); overflow: hidden; }
.s3d-lv-guide-bar > div { height: 100%; background: #2f9e44; transition: width 0.3s; }
.s3d-lv-guide-step { display: flex; flex-direction: column; border-radius: 4px; }
.s3d-lv-guide-step.open { border: 1px solid var(--s3d-line-2); }
.s3d-lv-guide-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.375rem; border: 0; border-radius: 4px; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; }
.s3d-lv-guide-head:hover { background: var(--s3d-hover); }
.s3d-lv-guide-step.open .s3d-lv-guide-head { font-weight: 700; }
.s3d-lv-guide-mark { display: inline-flex; align-items: center; justify-content: center; width: 1.375rem; height: 1.375rem; flex: none; border-radius: 50%; border: 1px solid var(--s3d-line-2); font-size: 0.75rem; font-weight: 700; color: var(--s3d-text-2); }
.s3d-lv-guide-step.open .s3d-lv-guide-mark { border-color: var(--s3d-navy-bg); color: var(--s3d-navy-bg); }
.s3d-lv-guide-step.done .s3d-lv-guide-mark { border-color: #2f9e44; background: #2f9e44; color: #fff; }
.s3d-lv-guide-body { display: flex; flex-direction: column; gap: 0.5rem; padding: 0 0.5rem 0.5rem 2.25rem; }
.s3d-lv-guide-nav { justify-content: space-between; }
.s3d-lv-guide-checks { margin: 0; padding: 0; list-style: none; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-lv-guide-checks li.done { color: #2f9e44; }
.s3d-lv-hud { position: fixed; top: 3.5rem; left: 50%; transform: translateX(-50%); z-index: 40; display: flex; flex-direction: column; align-items: center; gap: 0.375rem; pointer-events: none; font-size: 0.8125rem; color: #fff; }
.s3d-lv-hud-bar { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem 0.5rem; border-radius: 6px; background: rgba(20, 22, 28, 0.82); pointer-events: auto; }
.s3d-lv-hud-health { position: relative; width: 9rem; height: 1.25rem; border-radius: 3px; background: #5c1a1a; overflow: hidden; }
.s3d-lv-hud-fill { position: absolute; inset: 0 auto 0 0; background: #2f9e44; transition: width 0.2s; }
.s3d-lv-hud-health b { position: relative; display: block; text-align: center; line-height: 1.25rem; font-size: 0.75rem; }
.s3d-lv-hud-item { padding: 0.125rem 0.375rem; border-radius: 3px; background: #1c7ed6; font-weight: 600; }
.s3d-lv-hud-view { color: #ced4da; }
.s3d-lv-hud-item.torch { background: #e67700; }
.s3d-lv-hud-stop { padding: 0.2rem 0.6rem; border: 0; border-radius: 3px; background: #c92a2a; color: #fff; font-weight: 600; cursor: pointer; }
.s3d-lv-hud-sound { padding: 0.25rem 0.5rem; border-radius: 4px; background: rgba(12, 133, 153, 0.85); }
.s3d-lv-hud-message { padding: 0.375rem 0.75rem; border-radius: 4px; background: rgba(20, 22, 28, 0.85); font-size: 0.9375rem; }
.s3d-lv-hud-help { padding: 0.2rem 0.5rem; border-radius: 4px; background: rgba(20, 22, 28, 0.6); color: #dee2e6; font-size: 0.75rem; }
`;

/** adds the styles; returns a function that removes them again */
export const injectStyles = () => {
  const style = document.createElement('style');
  style.dataset.plugin = 'level';
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
};

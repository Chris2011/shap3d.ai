/**
 * The panel's and the timeline's styles. A plugin package brings no CSS file the app would load, and the app's
 * Tailwind only knows its own classes – so the rules come as a <style> element while the plugin is on. Colours are
 * the app's design tokens (--s3d-…), so light and dark mode follow by themselves.
 */
const CSS = `
.s3d-an { display: flex; flex-direction: column; gap: 0.75rem; font-size: 0.8125rem; color: var(--s3d-text); }
.s3d-an-section { display: flex; flex-direction: column; gap: 0.375rem; padding-bottom: 0.75rem; border-bottom: 1px solid var(--s3d-line); }
.s3d-an-section:last-child { border-bottom: 0; }
.s3d-an-heading { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; font-weight: 700; }
.s3d-an-subheading { margin-top: 0.25rem; font-size: 0.75rem; font-weight: 600; color: var(--s3d-text-2); }
.s3d-an-row { display: flex; flex-wrap: wrap; align-items: center; gap: 0.375rem; }
.s3d-an-row.between { justify-content: space-between; }
.s3d-an-grow { flex: 1; min-width: 0; }
.s3d-an-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.25rem 0.375rem; align-items: end; }
.s3d-an-grid.two { grid-template-columns: 1fr 1fr; }
.s3d-an-field { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; }
.s3d-an-field > span:first-child { display: flex; align-items: center; gap: 0.25rem; font-size: 0.6875rem; color: var(--s3d-text-2); }
.s3d-an-field .s3d-input { width: 100%; min-width: 0; }
.s3d-an-check { display: inline-flex; align-items: center; gap: 0.25rem; }
.s3d-an-limit { width: 2.5rem; }
.s3d-an-hint { margin: 0; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-an-warning { margin: 0; font-size: 0.75rem; color: #c92a2a; }
.s3d-an-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s3d-an-diamond { display: inline-block; width: 0.5rem; height: 0.5rem; flex: none; transform: rotate(45deg); border: 1px solid var(--s3d-text-2); background: transparent; padding: 0; cursor: pointer; }
.s3d-an-diamond.keyed { background: #f59f00; border-color: #e67700; }
.s3d-an-diamond.animated { background: #b2f2bb; border-color: #2f9e44; }
.s3d-an-entry { display: flex; align-items: center; gap: 0.375rem; padding: 0.2rem 0.25rem; border: 0; border-radius: 3px; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; }
.s3d-an-entry:hover { background: var(--s3d-hover); }
.s3d-an-entry.active { background: var(--s3d-sel); }
.s3d-an-entry-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.s3d-an-entry-side { font-size: 0.6875rem; color: var(--s3d-text-2); }
.s3d-an-top { justify-content: space-between; }
.s3d-an-switch { display: inline-flex; border: 1px solid var(--s3d-line-2); border-radius: 4px; overflow: hidden; }
.s3d-an-switch button { padding: 0.25rem 0.625rem; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; }
.s3d-an-switch button.active { background: var(--s3d-navy-bg); color: #fff; }
.s3d-an-big { flex: 1; padding-block: 0.5rem; font-weight: 700; }
.s3d-an-choices { display: grid; grid-template-columns: repeat(auto-fill, minmax(5.5rem, 1fr)); gap: 0.375rem; }
.s3d-an-choice { display: flex; flex-direction: column; align-items: flex-start; gap: 0.125rem; padding: 0.5rem; border: 1px solid var(--s3d-line-2); border-radius: 6px; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; }
.s3d-an-choice:hover { background: var(--s3d-hover); }
.s3d-an-choice > span:last-child { font-size: 0.6875rem; color: var(--s3d-text-2); }
.s3d-an-steps { padding: 0.375rem 0.5rem; border-radius: 4px; background: var(--s3d-sel); color: var(--s3d-text); }
.s3d-an-progress { height: 0.375rem; border-radius: 3px; background: var(--s3d-line); overflow: hidden; }
.s3d-an-progress > div { height: 100%; background: #2f9e44; transition: width 0.2s; }
.s3d-an .s3d-btn.primary, .s3d-an-tl .s3d-btn.primary { background: var(--s3d-navy-bg); color: #fff; }
.s3d-an-link { align-self: flex-start; padding: 0; border: 0; background: none; color: var(--s3d-navy-bg); font: inherit; font-size: 0.75rem; text-decoration: underline; cursor: pointer; }
.s3d-an-swatch { width: 1.5rem; height: 1.5rem; padding: 0; border: 1px solid var(--s3d-line-2); border-radius: 4px; background: none; }
.s3d-an-guide-step { display: flex; flex-direction: column; border-radius: 4px; }
.s3d-an-guide-step.open { border: 1px solid var(--s3d-line-2); }
.s3d-an-guide-head { display: flex; align-items: center; gap: 0.5rem; padding: 0.375rem; border: 0; border-radius: 4px; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; }
.s3d-an-guide-head:hover { background: var(--s3d-hover); }
.s3d-an-guide-step.open .s3d-an-guide-head { font-weight: 700; }
.s3d-an-guide-mark { display: inline-flex; align-items: center; justify-content: center; width: 1.375rem; height: 1.375rem; flex: none; border-radius: 50%; border: 1px solid var(--s3d-line-2); font-size: 0.75rem; font-weight: 700; color: var(--s3d-text-2); }
.s3d-an-guide-step.open .s3d-an-guide-mark { border-color: var(--s3d-navy-bg); color: var(--s3d-navy-bg); }
.s3d-an-guide-step.done .s3d-an-guide-mark { border-color: #2f9e44; background: #2f9e44; color: #fff; }
.s3d-an-guide-body { display: flex; flex-direction: column; gap: 0.5rem; padding: 0 0.5rem 0.5rem 2.25rem; }
.s3d-an-guide-text { white-space: pre-line; }
.s3d-an-guide-done { color: #2f9e44; }
.s3d-an-guide-checks { margin: 0; padding: 0; list-style: none; font-size: 0.75rem; color: var(--s3d-text-2); }
.s3d-an-guide-checks li.done { color: #2f9e44; }

/* the timeline at the bottom of the 3D view */
.s3d-an-tl { position: fixed; z-index: 55; display: flex; flex-direction: column; background: var(--s3d-panel); color: var(--s3d-text); border-top: 1px solid var(--s3d-line-2); box-shadow: 0 -2px 10px rgba(0,0,0,.12); font-size: 0.75rem; user-select: none; }
.s3d-an-tl-grip { height: 5px; cursor: ns-resize; flex: none; }
.s3d-an-tl-grip:hover { background: var(--s3d-line-2); }
.s3d-an-tl-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem 0.5rem; padding: 0.25rem 0.5rem; border-bottom: 1px solid var(--s3d-line); }
.s3d-an-tl-bar .s3d-input { height: 1.5rem; padding: 0 0.25rem; font-size: 0.75rem; }
.s3d-an-tl-bar label { display: inline-flex; align-items: center; gap: 0.25rem; color: var(--s3d-text-2); }
.s3d-an-tl-transport { display: inline-flex; gap: 2px; }
.s3d-an-tl-transport button, .s3d-an-tl-tool { min-width: 1.75rem; height: 1.625rem; padding: 0 0.375rem; border: 1px solid var(--s3d-line-2); border-radius: 4px; background: var(--s3d-panel); color: inherit; font: inherit; cursor: pointer; }
.s3d-an-tl-transport button:hover, .s3d-an-tl-tool:hover { background: var(--s3d-hover); }
.s3d-an-tl-tool.on { background: var(--s3d-navy-bg); border-color: var(--s3d-navy-bg); color: #fff; }
.s3d-an-tl-tool.rec.on { background: #e03131; border-color: #e03131; }
.s3d-an-tl-frame { width: 3.75rem; font-family: ui-monospace, monospace; }
.s3d-an-tl-time { font-family: ui-monospace, monospace; color: var(--s3d-text-2); }
.s3d-an-tl-body { flex: 1; min-height: 0; display: grid; grid-template-columns: 13rem 1fr; overflow: hidden; }
.s3d-an-tl-names { overflow: hidden; border-inline-end: 1px solid var(--s3d-line); }
.s3d-an-tl-name { display: flex; align-items: center; gap: 0.25rem; height: 1.375rem; padding-inline: 0.375rem; white-space: nowrap; overflow: hidden; cursor: pointer; }
.s3d-an-tl-name:hover { background: var(--s3d-hover); }
.s3d-an-tl-name.channel { padding-inline-start: 1.5rem; color: var(--s3d-text-2); }
.s3d-an-tl-name.picked { background: var(--s3d-sel); }
.s3d-an-tl-name .twisty { width: 0.75rem; flex: none; text-align: center; color: var(--s3d-text-2); }
.s3d-an-tl-name .label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.s3d-an-tl-name input[type='checkbox'] { margin: 0; }
.s3d-an-tl-header { height: 1.375rem; border-bottom: 1px solid var(--s3d-line); display: flex; align-items: center; padding-inline: 0.375rem; color: var(--s3d-text-2); }
.s3d-an-tl-canvas { position: relative; overflow: hidden; cursor: default; }
.s3d-an-tl-canvas canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.s3d-an-tl-scroll { overflow-y: auto; overflow-x: hidden; }
.s3d-an-tl-menu { position: fixed; z-index: 70; display: flex; flex-direction: column; min-width: 11rem; padding: 0.25rem; border: 1px solid var(--s3d-line-2); border-radius: 6px; background: var(--s3d-panel); box-shadow: 0 4px 18px rgba(0,0,0,.18); }
.s3d-an-tl-menu button { padding: 0.3rem 0.5rem; border: 0; border-radius: 3px; background: transparent; color: inherit; font: inherit; text-align: start; cursor: pointer; }
.s3d-an-tl-menu button:hover { background: var(--s3d-hover); }
.s3d-an-tl-menu hr { width: 100%; margin: 0.2rem 0; border: 0; border-top: 1px solid var(--s3d-line); }
.s3d-an-tl-empty { padding: 0.75rem; color: var(--s3d-text-2); }
.s3d-an-rendering { position: fixed; z-index: 80; inset-inline-end: 1rem; bottom: 1rem; display: flex; flex-direction: column; gap: 0.375rem; width: 16rem; padding: 0.75rem; border-radius: 8px; background: var(--s3d-panel); color: var(--s3d-text); box-shadow: 0 4px 18px rgba(0,0,0,.25); font-size: 0.8125rem; }
`;

/** adds the styles; returns a function that removes them again */
export const injectStyles = () => {
  const style = document.createElement('style');
  style.dataset.plugin = 'animation';
  style.textContent = CSS;
  document.head.appendChild(style);
  return () => style.remove();
};

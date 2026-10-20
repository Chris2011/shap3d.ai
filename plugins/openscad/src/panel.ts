import type { PluginContext } from '../../../src/plugins/types';
import type { Engine } from './engine';
import { EXAMPLES } from './examples';
import { isFont, isScad } from './fonts';
import { formatSize, t } from './i18n';
import { UNITS, unitLabel, type Settings } from './settings';

const escapeHtml = (value: string) =>
  value.replace(/[&<>"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]!);
/** a translated text, safe for innerHTML */
const text = (key: string, params?: Record<string, unknown>) => escapeHtml(t(key, params));

/** The "OpenSCAD" panel: status, unit, geometry kernel and the file library. Plain DOM, re-rendered when the language changes. */
export const registerPanel = (context: PluginContext, engine: Engine, settings: Settings, openFromLibrary: (path: string) => void) => {
  const openEditor = () => context.script.openInEditor('openscad', EXAMPLES[0].code);

  context.icons.register(
    'openscad',
    '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 3.5v17M5 8h14M5 16h14" fill="none" stroke="#e8a33d" stroke-width="1.6"/>',
  );

  context.commands.register({
    id: 'editor',
    label: 'openscad.command',
    icon: 'openscad',
    keywords: 'openscad scad cad code script',
    run: openEditor,
  });

  context.panels.register({
    id: 'panel',
    label: 'OpenSCAD',
    icon: 'openscad',
    width: 320,
    mount(element) {
      const render = () => {
        element.innerHTML = `
          <p style="margin:0 0 .5rem;font-size:.75rem;opacity:.8">${text('openscad.panel.intro')}</p>
          <p style="margin:.25rem 0;font-size:.8125rem">${text('openscad.panel.status')} <b data-status></b></p>
          <p data-error style="margin:.25rem 0;font-size:.75rem;color:var(--s3d-danger)"></p>
          <label style="display:flex;align-items:center;gap:.5rem;margin:.5rem 0">
            <span style="flex:1">${text('openscad.panel.unit')}</span>
            <select class="s3d-input" data-setting="unit" style="width:9rem">${UNITS.map((unit) => `<option value="${unit}">${escapeHtml(unitLabel(unit))}</option>`).join('')}</select>
          </label>
          <label style="display:flex;align-items:center;gap:.5rem;margin:.5rem 0">
            <span style="flex:1">${text('openscad.panel.backend')}</span>
            <select class="s3d-input" data-setting="backend" style="width:9rem"><option value="manifold">${text('openscad.panel.manifold')}</option><option value="cgal">${text('openscad.panel.cgal')}</option></select>
          </label>
          <p style="margin:0 0 .5rem;font-size:.6875rem;opacity:.75">${text('openscad.panel.colorsHint')}</p>
          <div style="display:flex;flex-wrap:wrap;gap:.375rem;margin:.75rem 0">
            <button class="s3d-btn small" data-action="load">${text('openscad.panel.load')}</button>
            <button class="s3d-btn small" data-action="editor">${text('openscad.panel.openEditor')}</button>
          </div>
          <div class="s3d-caption" style="margin:1rem 0 .25rem">${text('openscad.panel.files')}</div>
          <p style="margin:0 0 .5rem;font-size:.6875rem;opacity:.75">${text('openscad.panel.filesHint', { example: '\u2066include <BOSL2/std.scad>\u2069' })}</p>
          <div style="display:flex;flex-wrap:wrap;gap:.375rem;margin:.25rem 0 .5rem">
            <button class="s3d-btn small" data-action="add-files">${text('openscad.panel.addFiles')}</button>
            <button class="s3d-btn small" data-action="add-folder">${text('openscad.panel.addFolder')}</button>
          </div>
          <input type="file" multiple data-input="files" style="display:none">
          <input type="file" multiple webkitdirectory data-input="folder" style="display:none">
          <div data-library style="font-size:.75rem"></div>
          <p style="margin:.75rem 0 0;font-size:.6875rem;opacity:.75">${text('openscad.panel.license')}</p>`;

        for (const select of element.querySelectorAll<HTMLSelectElement>('select[data-setting]')) {
          const key = select.dataset.setting as keyof Settings;
          select.value = settings[key];
          select.addEventListener('change', () => {
            (settings as unknown as Record<string, string>)[key] = select.value;
            context.storage.set('settings', settings);
          });
        }
        element.querySelector('[data-action="load"]')!.addEventListener('click', () => engine.warm().catch(() => {}));
        element.querySelector('[data-action="editor"]')!.addEventListener('click', openEditor);
        const filesInput = element.querySelector<HTMLInputElement>('[data-input="files"]')!;
        const folderInput = element.querySelector<HTMLInputElement>('[data-input="folder"]')!;
        element.querySelector('[data-action="add-files"]')!.addEventListener('click', () => filesInput.click());
        element.querySelector('[data-action="add-folder"]')!.addEventListener('click', () => folderInput.click());
        for (const input of [filesInput, folderInput]) {
          input.addEventListener('change', async () => {
            const files = [...(input.files ?? [])].filter((file) => !/(^|\/)(node_modules|\.git)\//.test(file.webkitRelativePath));
            input.value = '';
            if (files.length) {
              await engine.addToLibrary(files);
              context.ui.toast(t('openscad.toast.filesAdded', { count: files.length }));
            }
          });
        }
        element.querySelector('[data-library]')!.addEventListener('click', (event) => {
          const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-do]');
          if (!button) {
            return;
          }
          const path = button.dataset.path ?? '';
          if (button.dataset.do === 'open') {
            openFromLibrary(path);
          } else if (button.dataset.do === 'edit') {
            context.script.openInEditor('openscad', new TextDecoder().decode(engine.library.get(path)));
          } else if (button.dataset.do === 'remove') {
            engine.removeFromLibrary([path]);
          } else if (button.dataset.do === 'clear') {
            context.ui.confirm(t('openscad.panel.confirmClear')).then((yes) => {
              if (yes) {
                engine.removeFromLibrary([...engine.library.keys()]);
              }
            });
          }
        });
        refresh();
      };

      const renderLibrary = () => {
        const list = element.querySelector('[data-library]')!;
        const paths = [...engine.library.keys()].sort();
        if (!paths.length) {
          list.innerHTML = `<p style="opacity:.7;margin:.25rem 0">${text('openscad.panel.noFiles')}</p>`;
          return;
        }
        const total = paths.reduce((sum, path) => sum + engine.library.get(path)!.length, 0);
        const row = (path: string) => {
          const safe = escapeHtml(path);
          const actions = isScad(path)
            ? `<button class="s3d-link" data-do="open" data-path="${safe}">${text('openscad.panel.open')}</button><button class="s3d-link" data-do="edit" data-path="${safe}">${text('openscad.panel.edit')}</button>`
            : '';
          return `
            <div style="display:flex;align-items:center;gap:.375rem;padding:.1875rem 0;border-bottom:1px solid var(--s3d-line)">
              <span class="s3d-ltr" style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${safe}">${isFont(path) ? '🔤 ' : ''}${safe}</span>
              <span style="opacity:.6">${escapeHtml(formatSize(engine.library.get(path)!.length))}</span>
              ${actions}
              <button class="s3d-link" data-do="remove" data-path="${safe}" title="${text('openscad.panel.remove')}">✕</button>
            </div>`;
        };
        list.innerHTML =
          paths.map(row).join('') +
          `<div style="display:flex;align-items:center;margin-top:.375rem"><span style="flex:1;opacity:.7">${text('openscad.panel.summary', { count: paths.length, size: formatSize(total) })}</span><button class="s3d-link" data-do="clear">${text('openscad.panel.clearAll')}</button></div>`;
      };

      const refresh = () => {
        element.querySelector('[data-status]')!.textContent = t(`openscad.state.${engine.status.state}`);
        element.querySelector('[data-error]')!.textContent = engine.status.error;
        (element.querySelector('[data-action="load"]') as HTMLButtonElement).disabled =
          engine.status.state === 'loading' || engine.status.state === 'ready';
        renderLibrary();
      };

      render();
      const stopEngine = engine.onChange(refresh);
      const stopLanguage = context.i18n.onChange(render);
      return () => {
        stopEngine();
        stopLanguage();
      };
    },
  });
};

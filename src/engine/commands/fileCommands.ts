// The commands of the File menu.
import { autosaveOn } from '../defaults';
import { openNewTab } from '../modelTabs';
import { t } from '../../i18n';
import type { CommandDefinition } from './types';
import { pickFile, purgeReminder, saveModel, exportAs } from './files';
import { importFile, IMPORT_EXTS } from './importFile';
import { pluginImporters } from '../../plugins/fileFormats';

/** The commands of the File menu – in menu order */
export const FILE_COMMANDS: CommandDefinition[] = [
  {
    id: 'new',
    shortcut: 'Ctrl+N',
    group: 'file',
    run: async (editor) => {
      if (editor.ui.saved || (await editor.confirm(t('confirm.discardChanges')))) {
        editor.newModel();
      }
    },
  },
  { id: 'newTab', group: 'file', run: (editor) => openNewTab(editor) },
  {
    id: 'open',
    shortcut: 'Ctrl+O',
    group: 'file',
    run: async (editor) => {
      const file = await pickFile('.json,.shap3d.json,application/json');
      if (file) {
        await importFile(editor, file).catch((error) => editor.toast(String(error.message ?? error)));
      }
    },
  },
  { id: 'save', shortcut: 'Ctrl+S', group: 'file', run: (editor) => saveModel(editor) },
  {
    id: 'toggleAutosave',
    group: 'file',
    run: () => {
      autosaveOn.value = !autosaveOn.value;
      if (!autosaveOn.value) {
        // off means nothing comes back after a reload either
        localStorage.removeItem('s3d:autosave');
      }
    },
    checked: () => autosaveOn.value,
  },
  {
    id: 'togglePurgeReminder',
    group: 'file',
    run: () => {
      purgeReminder.value = !purgeReminder.value;
    },
    checked: () => purgeReminder.value,
  },
  {
    id: 'saveLocal',
    group: 'file',
    run: (editor) => {
      try {
        localStorage.setItem('s3d:saved', JSON.stringify(editor.model.toJSON()));
        editor.ui.saved = true;
        editor.toast(t('toast.savedInBrowser'));
      } catch {
        editor.toast(t('toast.saveFailed'));
      }
    },
  },
  {
    id: 'loadLocal',
    group: 'file',
    run: (editor) => {
      try {
        const saved = localStorage.getItem('s3d:saved');
        if (saved) {
          editor.loadJSON(JSON.parse(saved));
        } else {
          editor.toast(t('toast.noSavedModel'));
        }
      } catch {
        editor.toast(t('toast.loadFailed'));
      }
    },
  },
  {
    id: 'import',
    group: 'file',
    run: async (editor) => {
      const file = await pickFile([...IMPORT_EXTS, ...pluginImporters.keys()].map((ext) => '.' + ext).join(','));
      if (file) {
        await importFile(editor, file).catch((error) => editor.toast(String(error.message ?? error)));
      }
    },
  },
  { id: 'export-glb', group: 'file', run: (editor) => exportAs(editor, 'glb') },
  { id: 'export-gltf', group: 'file', run: (editor) => exportAs(editor, 'gltf') },
  { id: 'export-stl', group: 'file', run: (editor) => exportAs(editor, 'stl') },
  { id: 'export-obj', group: 'file', run: (editor) => exportAs(editor, 'obj') },
  { id: 'export-png', group: 'file', run: (editor) => exportAs(editor, 'png') },
  {
    id: 'print',
    group: 'file',
    run: (editor) => {
      const url = editor.viewer.snapshot();
      const printWindow = window.open('');
      if (printWindow) {
        printWindow.document.write(`<img src="${url}" style="max-width:100%">`);
        printWindow.document.close();
        printWindow.onload = () => printWindow.print();
        setTimeout(() => printWindow.print(), 300);
      }
    },
  },
];

// Saving, downloading, picking and exporting files.
import { useLocalStorage } from '@vueuse/core';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { STLExporter } from 'three/examples/jsm/exporters/STLExporter.js';
import { OBJExporter } from 'three/examples/jsm/exporters/OBJExporter.js';
import type { Editor } from '../editor';
import { imageTexturesReady } from '../../core/textures';
import { t } from '../../i18n';
import { modelToThree } from './modelToThree';

export const download = (name: string, data: Blob | string, type = 'application/octet-stream') => {
  const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 4000);
};
export const pickFile = (accept: string): Promise<File | null> => {
  return new Promise((res) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => res(input.files?.[0] ?? null);
    input.click();
  });
};
const safeName = (editor: Editor) => (editor.model.name || t('names.model')).replace(/[^\w\-äöüÄÖÜß ]+/g, '_');

export type ExportKind = 'glb' | 'gltf' | 'stl' | 'obj' | 'png' | 'json';

export interface ExportedFile {
  name: string;
  mimeType: string;
  data: Blob | string;
}

/** The model (or for PNG the current view) as a file, without downloading it – also used by the remote API. */
export const exportFile = async (editor: Editor, kind: ExportKind): Promise<ExportedFile> => {
  const name = safeName(editor);
  if (kind === 'json') {
    return { name: `${name}.shap3d.json`, mimeType: 'application/json', data: JSON.stringify(editor.model.toJSON()) };
  }
  if (kind === 'png') {
    const image = await fetch(editor.viewer.snapshot()).then((response) => response.blob());
    return { name: `${name}.png`, mimeType: 'image/png', data: image };
  }
  const scene = modelToThree(editor);
  if (kind === 'stl') {
    return { name: `${name}.stl`, mimeType: 'model/stl', data: new STLExporter().parse(scene, { binary: false }) as string };
  }
  if (kind === 'obj') {
    return { name: `${name}.obj`, mimeType: 'text/plain', data: new OBJExporter().parse(scene) };
  }
  await imageTexturesReady();
  const res: any = await new GLTFExporter().parseAsync(scene, { binary: kind === 'glb' });
  if (kind === 'glb') {
    return { name: `${name}.glb`, mimeType: 'model/gltf-binary', data: new Blob([res], { type: 'model/gltf-binary' }) };
  }
  return { name: `${name}.gltf`, mimeType: 'model/gltf+json', data: JSON.stringify(res) };
};

/** ask to purge unused groups/components when saving (SketchUp's "Purge Unused" reminder) – off by default, kept in the browser */
export const purgeReminder = useLocalStorage('s3d.purgeReminder', false);

/** Saves the model as .shap3d.json – with the purge reminder first, if it is on and there is something to purge. */
export const saveModel = async (editor: Editor) => {
  const unused = editor.model.unusedDefinitions().length;
  if (purgeReminder.value && unused && (await editor.confirm(t('confirm.purgeOnSave', { count: unused })))) {
    editor.commit('undo.purge', () => editor.model.purge());
  }
  await exportAs(editor, 'json');
};

export const exportAs = async (editor: Editor, kind: ExportKind) => {
  const file = await exportFile(editor, kind);
  download(file.name, file.data, file.mimeType);
  if (kind === 'json') {
    editor.ui.saved = true;
  }
};

import type { Editor } from '../engine/editor';

/** Import handlers contributed by plugins, keyed by lower-case file extension. */
export interface FileImporter { label: string; import: (file: File, editor: Editor) => void | Promise<void> }

export const pluginImporters = new Map<string, FileImporter>();

export const registerImporter = (extensions: string[], importer: FileImporter) => {
  const keys = extensions.map(extension => extension.replace(/^\./, '').toLowerCase());
  const taken = keys.find(key => pluginImporters.has(key));
  if (taken) throw new Error(`Für .${taken} gibt es schon einen Plugin-Import`);
  for (const key of keys) pluginImporters.set(key, importer);
  return () => { for (const key of keys) if (pluginImporters.get(key) === importer) pluginImporters.delete(key); };
};

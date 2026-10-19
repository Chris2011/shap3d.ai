import type * as THREE from 'three';
import type { Editor } from '../engine/editor';

/** What a scene importer hands back: the three.js scene plus how to bring it into our Z-up metre world. */
export interface LoadedScene {
  object: THREE.Object3D;
  /** the scene is Y-up and gets turned to Z-up */
  upY: boolean;
  /** factor from file units to metres; null = unknown (guessed from the size: mm/cm/m) */
  scale: number | null;
}

/**
 * Import handlers contributed by plugins, keyed by lower-case file extension. Either `import`
 * does everything itself, or `loadScene` only reads the file – the app then converts the scene
 * to faces, guesses units, places it on the ground and makes it one undo step (like the built-in formats).
 */
export interface FileImporter {
  label: string;
  import?: (file: File, editor: Editor) => void | Promise<void>;
  loadScene?: (file: File) => Promise<LoadedScene>;
}

export const pluginImporters = new Map<string, FileImporter>();

export const registerImporter = (extensions: string[], importer: FileImporter) => {
  if (!importer.import && !importer.loadScene) throw new Error('Ein Importer braucht import oder loadScene');
  const keys = extensions.map(extension => extension.replace(/^\./, '').toLowerCase());
  const taken = keys.find(key => pluginImporters.has(key));
  if (taken) throw new Error(`Für .${taken} gibt es schon einen Plugin-Import`);
  for (const key of keys) pluginImporters.set(key, importer);
  return () => { for (const key of keys) if (pluginImporters.get(key) === importer) pluginImporters.delete(key); };
};

/**
 * The project overview: the models last saved or opened, kept in the browser (IndexedDB – models are too big for
 * localStorage) with a small preview. Each model knows its entry by `settings.projectId`.
 */
import type { Editor } from './editor';
import { newId } from '../core/model';
import { viewThumbnail } from './scenes';

export interface ProjectEntry {
  id: string;
  name: string;
  /** ms since 1970 */
  updated: number;
  /** a small JPEG of the view (data URL) */
  thumbnail?: string;
}

const DATABASE = 's3d-projects';
const ENTRIES = 'entries';
const MODELS = 'models';
/** older entries are dropped */
const MAX_PROJECTS = 40;

const openDatabase = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(ENTRIES);
      request.result.createObjectStore(MODELS);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

/** runs `work` on both stores in one transaction and resolves when it is written */
const withStores = async <T>(mode: IDBTransactionMode, work: (entries: IDBObjectStore, models: IDBObjectStore) => IDBRequest<T> | void) => {
  const database = await openDatabase();
  try {
    return await new Promise<T | undefined>((resolve, reject) => {
      const transaction = database.transaction([ENTRIES, MODELS], mode);
      const request = work(transaction.objectStore(ENTRIES), transaction.objectStore(MODELS));
      transaction.oncomplete = () => resolve(request ? request.result : undefined);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
};

/** newest first */
export const listProjects = async (): Promise<ProjectEntry[]> =>
  ((await withStores<ProjectEntry[]>('readonly', (entries) => entries.getAll())) ?? []).sort((a, b) => b.updated - a.updated);

/**
 * Puts the model shown into the overview (after saving or opening it): its entry is updated, or made the first time.
 * Storage that is full or blocked only means the overview misses it – saving itself has already worked.
 */
export const rememberProject = async (editor: Editor) => {
  const settings = editor.model.settings;
  settings.projectId ??= String(newId());
  const entry: ProjectEntry = {
    id: settings.projectId,
    name: editor.model.name,
    updated: Date.now(),
    thumbnail: viewThumbnail(editor, 240),
  };
  const json = JSON.stringify(editor.model.toJSON());
  try {
    await withStores('readwrite', (entries, models) => {
      entries.put(entry, entry.id);
      models.put(json, entry.id);
    });
    const old = (await listProjects()).slice(MAX_PROJECTS);
    if (old.length) {
      await withStores('readwrite', (entries, models) => old.forEach(({ id }) => (entries.delete(id), models.delete(id))));
    }
  } catch (error) {
    console.warn('Projekt-Übersicht nicht gespeichert', error);
  }
};

const loadModel = async (id: string) => {
  const json = await withStores<string>('readonly', (_, models) => models.get(id));
  if (!json) {
    throw new Error('missing');
  }
  return JSON.parse(json);
};

/** Opens a model of the overview in the editor. */
export const openProject = async (editor: Editor, id: string) => {
  editor.loadJSON(await loadModel(id));
};

/** A copy as a new entry, named `name`, with its own id. */
export const duplicateProject = async (entry: ProjectEntry, name: string) => {
  const json = await loadModel(entry.id);
  const id = String(newId());
  json.name = name;
  json.settings = { ...json.settings, projectId: id };
  await withStores('readwrite', (entries, models) => {
    entries.put({ ...entry, id, name, updated: Date.now() }, id);
    models.put(JSON.stringify(json), id);
  });
};

/** Takes the entry out of the overview; files saved elsewhere are not touched. */
export const removeProject = (id: string) =>
  withStores('readwrite', (entries, models) => {
    entries.delete(id);
    models.delete(id);
  });

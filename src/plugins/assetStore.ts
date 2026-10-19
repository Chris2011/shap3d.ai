/**
 * Browser storage for plugins (IndexedDB – too big for localStorage):
 * - "assets": files that came with a plugin package, one record per plugin { path → Blob }
 * - "files": files a plugin keeps for the user (e.g. OpenSCAD libraries and fonts), one record per file
 */
const DATABASE = 's3d-plugins';
const ASSETS = 'assets';
const FILES = 'files';

const openDatabase = () => new Promise<IDBDatabase>((resolve, reject) => {
  const request = indexedDB.open(DATABASE, 2);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(ASSETS)) database.createObjectStore(ASSETS);
    if (!database.objectStoreNames.contains(FILES)) database.createObjectStore(FILES);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const transaction = async <T>(storeName: string, mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) => {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const request = work(database.transaction(storeName, mode).objectStore(storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } finally { database.close(); }
};

// ------------------------------------------------------------ package assets
export type PluginAssets = Record<string, Blob>;

export const saveAssets = (pluginId: string, assets: PluginAssets) => transaction(ASSETS, 'readwrite', store => store.put(assets, pluginId));
export const loadAssets = async (pluginId: string): Promise<PluginAssets> => (await transaction<PluginAssets | undefined>(ASSETS, 'readonly', store => store.get(pluginId))) ?? {};
export const deleteAssets = (pluginId: string) => transaction(ASSETS, 'readwrite', store => store.delete(pluginId));

// ------------------------------------------------------------ user files kept by a plugin
const fileKey = (pluginId: string, path: string) => `${pluginId}/${path}`;
/** all keys of one plugin: "id/" … "id/￿" */
const pluginRange = (pluginId: string) => IDBKeyRange.bound(`${pluginId}/`, `${pluginId}/￿`);

export const putPluginFile = (pluginId: string, path: string, blob: Blob) => transaction(FILES, 'readwrite', store => store.put(blob, fileKey(pluginId, path)));
export const getPluginFile = (pluginId: string, path: string) => transaction<Blob | undefined>(FILES, 'readonly', store => store.get(fileKey(pluginId, path)));
export const removePluginFile = (pluginId: string, path: string) => transaction(FILES, 'readwrite', store => store.delete(fileKey(pluginId, path)));
export const clearPluginFiles = (pluginId: string) => transaction(FILES, 'readwrite', store => store.delete(pluginRange(pluginId)));

export const listPluginFiles = async (pluginId: string): Promise<{ path: string; size: number }[]> => {
  const [keys, blobs] = await Promise.all([
    transaction<IDBValidKey[]>(FILES, 'readonly', store => store.getAllKeys(pluginRange(pluginId))),
    transaction<Blob[]>(FILES, 'readonly', store => store.getAll(pluginRange(pluginId))),
  ]);
  return keys.map((key, index) => ({ path: String(key).slice(pluginId.length + 1), size: blobs[index]?.size ?? 0 }));
};

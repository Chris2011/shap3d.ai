/**
 * Package folders through the File System Access API (Chromium only): the folder a plugin
 * package was installed from is remembered, so a rebuilt package can be read again with one click.
 */

/** permission calls and the folder picker are not part of TypeScript's DOM types yet */
type PermissionMode = { mode: 'read' | 'readwrite' };
interface PermissionHandle {
  queryPermission(descriptor: PermissionMode): Promise<PermissionState>;
  requestPermission(descriptor: PermissionMode): Promise<PermissionState>;
}
type DirectoryPicker = (options?: { id?: string; startIn?: FileSystemHandle; mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;

const directoryPicker = () => (window as unknown as { showDirectoryPicker?: DirectoryPicker }).showDirectoryPicker;

/** false in Firefox and Safari – they keep the classic folder input (webkitdirectory) */
export const supportsFolderHandles = typeof window !== 'undefined' && typeof directoryPicker() === 'function';

/** Lets the user pick a package folder; null when the dialog was cancelled. */
export const pickPackageFolder = async (startIn?: FileSystemDirectoryHandle): Promise<FileSystemDirectoryHandle | null> => {
  try {
    return await directoryPicker()!.call(window, { id: 'plugin-folder', mode: 'read', startIn });
  } catch (error: any) {
    if (error?.name === 'AbortError') return null;
    // the remembered folder may be gone – try again without it
    if (startIn && (error?.name === 'NotFoundError' || error instanceof TypeError)) return pickPackageFolder();
    throw error;
  }
};

/** current read permission, without asking */
export const queryReadPermission = (handle: FileSystemDirectoryHandle) =>
  (handle as unknown as PermissionHandle).queryPermission({ mode: 'read' });

/** asks for read permission if needed (only after a click) */
export const requestReadPermission = async (handle: FileSystemDirectoryHandle) =>
  (await queryReadPermission(handle)) === 'granted' || (await (handle as unknown as PermissionHandle).requestPermission({ mode: 'read' })) === 'granted';

/**
 * Reads every file of a folder like an input with webkitdirectory would deliver it:
 * webkitRelativePath starts with the folder's name; node_modules is skipped.
 */
export const readFolderFiles = async (handle: FileSystemDirectoryHandle) => {
  const files: File[] = [];
  const walk = async (directory: FileSystemDirectoryHandle, path: string) => {
    for await (const child of directory.values()) {
      const childPath = `${path}/${child.name}`;
      if (child.kind === 'directory') {
        if (child.name !== 'node_modules') await walk(child as FileSystemDirectoryHandle, childPath);
        continue;
      }
      const file = await (child as FileSystemFileHandle).getFile();
      Object.defineProperty(file, 'webkitRelativePath', { value: childPath });
      files.push(file);
    }
  };
  await walk(handle, handle.name);
  return files;
};

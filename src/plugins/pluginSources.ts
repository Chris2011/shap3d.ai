/**
 * Where plugin packages come from besides a folder on disk: a zip (the file a plugin release ships, or a link to it)
 * and a URL – a folder on a web server with the package's package.json (e.g. plugins/level/latest/ on the
 * project's GitHub Pages, where the plugin release workflow puts every plugin). Both end up as the files of a folder,
 * which readPluginPackages reads like one picked from disk.
 */

/** a file at a path inside a package folder – as the folder picker gives them (`webkitRelativePath`) */
const fileAt = (path: string, content: BlobPart) => {
  const file = new File([content], path.split('/').pop() ?? path);
  Object.defineProperty(file, 'webkitRelativePath', { value: `package/${path}` });
  return file;
};

/**
 * The files of a zip (stored or deflated entries – what zip tools and the release workflow write), unpacked with the
 * browser's own DecompressionStream.
 */
export const unzip = async (zip: Blob): Promise<File[]> => {
  const bytes = new Uint8Array(await zip.arrayBuffer());
  const view = new DataView(bytes.buffer);
  // the end of the central directory: its signature within the last 64 KB (a comment may follow it)
  let end = -1;
  for (let at = bytes.length - 22; at >= Math.max(0, bytes.length - 65557); at--) {
    if (view.getUint32(at, true) === 0x06054b50) {
      end = at;
      break;
    }
  }
  if (end < 0) {
    throw new Error('not a zip file');
  }
  const count = view.getUint16(end + 10, true);
  let entry = view.getUint32(end + 16, true);
  const files: File[] = [];
  const decoder = new TextDecoder();
  for (let index = 0; index < count; index++) {
    if (view.getUint32(entry, true) !== 0x02014b50) {
      throw new Error('broken zip directory');
    }
    const method = view.getUint16(entry + 10, true);
    const compressed = view.getUint32(entry + 20, true);
    const nameLength = view.getUint16(entry + 28, true),
      extraLength = view.getUint16(entry + 30, true),
      commentLength = view.getUint16(entry + 32, true);
    const local = view.getUint32(entry + 42, true);
    const name = decoder.decode(bytes.subarray(entry + 46, entry + 46 + nameLength)).replace(/\\/g, '/');
    entry += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) {
      continue; // a folder
    }
    // the data starts after the local header, whose name and extra field may differ in length from the directory's
    const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    const data = bytes.slice(start, start + compressed);
    if (method === 0) {
      files.push(fileAt(name, data));
    } else if (method === 8) {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      files.push(fileAt(name, await new Response(stream).arrayBuffer()));
    } else {
      throw new Error(`zip method ${method} is not supported`);
    }
  }
  return files;
};

/** a URL that points at a zip (by its name) */
export const isZipUrl = (url: string) => /\.zip(\?|#|$)/i.test(url);

/** the folder of a package URL: …/level/latest/, …/level/latest/package.json → …/level/latest/ */
export const packageBase = (url: string) => url.replace(/package\.json([?#].*)?$/i, '').replace(/\/?$/, '/');

const fetchOk = async (url: string) => {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} – ${url}`);
  }
  return response;
};

/** the package.json of a package at a URL (a folder on a web server) – to see its version before installing */
export const manifestAt = async (url: string): Promise<{ version?: string; files?: string[]; shap3d?: { main?: string } }> =>
  (await fetchOk(packageBase(url) + 'package.json')).json();

/**
 * The files of a plugin package at a URL: a zip, or a folder on a web server – its package.json, then the files it
 * lists in `files` (what `npm run build` writes into dist/package.json), else just its main script.
 */
export const filesFromUrl = async (url: string): Promise<File[]> => {
  if (isZipUrl(url)) {
    return unzip(await (await fetchOk(url)).blob());
  }
  const base = packageBase(url);
  const manifestText = await (await fetchOk(base + 'package.json')).text();
  const manifest = JSON.parse(manifestText) as { files?: string[]; shap3d?: { main?: string }; main?: string };
  const listed = manifest.files?.length ? manifest.files : [manifest.shap3d?.main ?? manifest.main ?? 'plugin.js'];
  const files = await Promise.all(
    listed
      .filter((path) => path !== 'package.json' && !path.endsWith('/'))
      .map(async (path) => fileAt(path, await (await fetchOk(base + path)).arrayBuffer())),
  );
  return [fileAt('package.json', manifestText), ...files];
};

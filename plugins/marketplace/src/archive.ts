/**
 * Turns what a source offers into one file the app can import. Runs in a worker (loadWorker.ts): a glTF with its
 * .bin and textures, or a zip with them, becomes a single .glb, so the import needs nothing from outside.
 * Everything in these files comes from strangers: paths stay inside the archive, nothing is fetched from an address in
 * a file, and sizes are counted as the bytes arrive, not believed from a header.
 */

export type LoadErrorCode = 'tooLarge' | 'noModel' | 'broken' | 'compressed' | 'remote' | 'missingPart' | 'format';

export class LoadError extends Error {
  code: LoadErrorCode;
  constructor(code: LoadErrorCode, detail = '') {
    super(detail ? `${code}: ${detail}` : code);
    this.code = code;
  }
}

/** formats the app reads without files beside them that it would look for by itself */
const MODEL_EXTENSIONS = ['glb', 'gltf', 'stl', 'obj'];
/** glTF extensions whose decoders the app's loader does not have */
const UNSUPPORTED = ['KHR_draco_mesh_compression', 'EXT_meshopt_compression', 'KHR_texture_basisu'];
const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export const extensionOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** resolves a relative path against a folder; undefined when it would leave the root */
export const joinPath = (folder: string, path: string) => {
  const parts: string[] = [];
  for (const part of `${folder}/${path}`.replace(/\\/g, '/').split('/')) {
    if (part === '..') {
      if (!parts.length) {
        return undefined;
      }
      parts.pop();
    } else if (part && part !== '.') {
      parts.push(part);
    }
  }
  return parts.join('/');
};

const inflate = async (raw: Uint8Array, expected: number) => {
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const out = new Uint8Array(expected);
  let length = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    // more than the directory promised: a zip bomb or a broken file
    if (length + value.length > expected) {
      await reader.cancel();
      throw new LoadError('broken', 'entry larger than stated');
    }
    out.set(value, length);
    length += value.length;
  }
  return length === expected ? out : out.subarray(0, length);
};

export interface Zip {
  /** entry paths with their unpacked size */
  entries: Map<string, number>;
  read: (path: string) => Promise<Uint8Array>;
}

/** reads a zip's directory; `read` unpacks an entry when asked, and everything unpacked together stays under `limit` */
export const openZip = (bytes: Uint8Array, limit: number): Zip => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = bytes.length - 22;
  while (end >= 0 && view.getUint32(end, true) !== 0x06054b50) {
    end--;
  }
  if (end < 0) {
    throw new LoadError('broken', 'no zip directory');
  }
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  if (count === 0xffff || at === 0xffffffff) {
    throw new LoadError('format', 'zip64'); // shortcut: no zip64, such archives are far over the size limit anyway
  }
  const names = new TextDecoder();
  const found = new Map<string, { method: number; packed: number; size: number; local: number }>();
  for (let index = 0; index < count; index++) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== 0x02014b50) {
      throw new LoadError('broken', 'bad zip directory');
    }
    const nameLength = view.getUint16(at + 28, true);
    const name = names.decode(bytes.subarray(at + 46, at + 46 + nameLength));
    const path = joinPath('', name);
    if (path && !name.endsWith('/')) {
      found.set(path, {
        method: view.getUint16(at + 10, true),
        packed: view.getUint32(at + 20, true),
        size: view.getUint32(at + 24, true),
        local: view.getUint32(at + 42, true),
      });
    }
    at += 46 + nameLength + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  let unpacked = 0;
  return {
    entries: new Map([...found].map(([path, entry]) => [path, entry.size])),
    read: async (path) => {
      const entry = found.get(path);
      if (!entry) {
        throw new LoadError('missingPart', path);
      }
      unpacked += entry.size;
      if (unpacked > limit) {
        throw new LoadError('tooLarge');
      }
      const local = entry.local;
      if (local + 30 > bytes.length || view.getUint32(local, true) !== 0x04034b50) {
        throw new LoadError('broken', 'bad zip entry');
      }
      const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
      const raw = bytes.subarray(start, start + entry.packed);
      if (entry.method === 0) {
        return raw;
      }
      if (entry.method !== 8) {
        throw new LoadError('format', 'zip method');
      }
      return inflate(raw, entry.size);
    },
  };
};

/** the model in an archive: glb before gltf before stl before obj, the biggest of a kind; system folders do not count */
export const pickModel = (entries: Map<string, number>) => {
  const candidates = [...entries].filter(([path]) => !path.startsWith('__MACOSX/') && MODEL_EXTENSIONS.includes(extensionOf(path)));
  candidates.sort(
    ([a, aSize], [b, bSize]) => MODEL_EXTENSIONS.indexOf(extensionOf(a)) - MODEL_EXTENSIONS.indexOf(extensionOf(b)) || bSize - aSize,
  );
  return candidates[0]?.[0];
};

const imageType = (bytes: Uint8Array) => {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) {
    return 'image/png';
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    return 'image/jpeg';
  }
  if (bytes[0] === 0x52 && bytes[8] === 0x57) {
    return 'image/webp';
  }
  throw new LoadError('format', 'image type');
};

interface GltfJson {
  buffers?: { uri?: string; byteLength?: number }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number }[];
  images?: { uri?: string; bufferView?: number; mimeType?: string }[];
  extensionsRequired?: string[];
}

const checkExtensions = (json: GltfJson) => {
  if (json.extensionsRequired?.some((name) => UNSUPPORTED.includes(name))) {
    throw new LoadError('compressed');
  }
};

/** a data: address is inside the file; any other address with a scheme would call a server when the file is opened */
const readUri = async (uri: string, folder: string, read: (path: string) => Promise<Uint8Array>) => {
  if (uri.startsWith('data:')) {
    return new Uint8Array(await (await fetch(uri)).arrayBuffer());
  }
  if (SCHEME.test(uri)) {
    throw new LoadError('remote', uri);
  }
  const path = joinPath(folder, decodeURIComponent(uri));
  if (!path) {
    throw new LoadError('missingPart', uri);
  }
  return read(path);
};

const align4 = (value: number) => (value + 3) & ~3;

/** a .gltf and what it refers to, as one .glb: all buffers and pictures in the binary chunk */
export const gltfToGlb = async (text: string, folder: string, read: (path: string) => Promise<Uint8Array>) => {
  let json: GltfJson;
  try {
    json = JSON.parse(text);
  } catch {
    throw new LoadError('broken', 'glTF is not JSON');
  }
  checkExtensions(json);
  const chunks: Uint8Array[] = [];
  let length = 0;
  const append = (bytes: Uint8Array) => {
    const offset = length;
    chunks.push(bytes);
    length = align4(length + bytes.length);
    return offset;
  };
  const offsets: number[] = [];
  for (const buffer of json.buffers ?? []) {
    if (!buffer.uri) {
      throw new LoadError('broken', 'buffer without address');
    }
    offsets.push(append(await readUri(buffer.uri, folder, read)));
  }
  const views = (json.bufferViews ??= []);
  for (const view of views) {
    if (offsets[view.buffer] === undefined) {
      throw new LoadError('broken', 'buffer view without buffer');
    }
    view.byteOffset = (view.byteOffset ?? 0) + offsets[view.buffer];
    view.buffer = 0;
  }
  for (const image of json.images ?? []) {
    if (image.uri) {
      const bytes = await readUri(image.uri, folder, read);
      image.mimeType = imageType(bytes);
      image.bufferView = views.push({ buffer: 0, byteOffset: append(bytes), byteLength: bytes.length }) - 1;
      delete image.uri;
    }
  }
  json.buffers = length ? [{ byteLength: length }] : [];
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = align4(jsonBytes.length);
  const total = 12 + 8 + jsonLength + (length ? 8 + length : 0);
  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  view.setUint32(0, 0x46546c67, true);
  view.setUint32(4, 2, true);
  view.setUint32(8, total, true);
  view.setUint32(12, jsonLength, true);
  view.setUint32(16, 0x4e4f534a, true);
  out.fill(0x20, 20, 20 + jsonLength);
  out.set(jsonBytes, 20);
  if (length) {
    const binary = 20 + jsonLength;
    view.setUint32(binary, length, true);
    view.setUint32(binary + 4, 0x004e4942, true);
    let at = 0;
    for (const chunk of chunks) {
      out.set(chunk, binary + 8 + at);
      at = align4(at + chunk.length);
    }
  }
  return out;
};

/** a .glb is one file already, but its JSON may still point elsewhere or need a decoder the app does not have */
export const checkGlb = (bytes: Uint8Array) => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 20 || view.getUint32(0, true) !== 0x46546c67 || view.getUint32(16, true) !== 0x4e4f534a) {
    throw new LoadError('broken', 'not a GLB');
  }
  let json: GltfJson;
  try {
    json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + view.getUint32(12, true))));
  } catch {
    throw new LoadError('broken', 'GLB without JSON');
  }
  checkExtensions(json);
  for (const { uri } of [...(json.buffers ?? []), ...(json.images ?? [])]) {
    if (uri && !uri.startsWith('data:')) {
      throw new LoadError('remote', uri);
    }
  }
};

/**
 * What a source offers, as one importable file. `read` fetches one of the offered paths.
 * The result's extension says the format, which the import goes by.
 */
export const prepareModel = async (main: string, read: (path: string) => Promise<Uint8Array>, limit: number) => {
  let source = read;
  let path = main;
  if (extensionOf(path) === 'zip') {
    const zip = openZip(await read(main), limit);
    const picked = pickModel(zip.entries);
    if (!picked) {
      throw new LoadError('noModel');
    }
    source = zip.read;
    path = picked;
  }
  const extension = extensionOf(path);
  if (!MODEL_EXTENSIONS.includes(extension)) {
    throw new LoadError('noModel', extension);
  }
  const bytes = await source(path);
  if (extension === 'gltf') {
    const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
    return { extension: 'glb', bytes: await gltfToGlb(new TextDecoder().decode(bytes), folder, source) };
  }
  if (extension === 'glb') {
    checkGlb(bytes);
  }
  return { extension, bytes };
};

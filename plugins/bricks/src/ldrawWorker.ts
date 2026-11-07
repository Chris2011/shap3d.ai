import {
  cleanReference,
  collectPlacements,
  flattenPart,
  headerOf,
  LdrawError,
  parseColours,
  referencesOf,
  splitModel,
  type LdrawHeader,
  type PartMesh,
  type Placement,
} from './ldraw';

/** Fetches a part or a whole model with every file it refers to and makes the meshes, away from the main thread. */

export type LdrawRequest = {
  /** the library's folder, ending in "/": the first that answers is used, the next one when it fails */
  bases: string[];
} & ({ kind: 'part'; number: string } | { kind: 'model'; url?: string; text?: string });

export interface ModelPart {
  /** its path below the library */
  path: string;
  header: LdrawHeader;
  part: PartMesh;
}

export type LdrawAnswer =
  | { kind: 'progress'; files: number; parts?: number }
  | { kind: 'done'; header: LdrawHeader; part: PartMesh }
  | { kind: 'model'; header: LdrawHeader; placements: Placement[]; parts: ModelPart[]; missing: number }
  | { kind: 'error'; code: string };

/** more than any set needs; what asks for more is not something to build with */
const MAX_FILES = 12000;
const MAX_BYTES = 384 * 1024 * 1024;
const PARALLEL = 12;

/** `Worker.postMessage` without the Window overload's targetOrigin */
const post = (self as unknown as { postMessage: (data: LdrawAnswer, transfer?: Transferable[]) => void }).postMessage.bind(self);

let bytes = 0;

/** a text from an address; neither cookies nor the page's address are the source's business. null when it is not there */
const readAddress = async (url: string) => {
  const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' }).catch(() => {
    throw new Error('network');
  });
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error('network');
  }
  const text = await response.text();
  bytes += text.length;
  if (bytes > MAX_BYTES) {
    throw new LdrawError('tooLarge');
  }
  return text;
};

/** a file of the library. A copy that does not answer is no reason to give up while another one does */
const readLibrary = async (bases: string[], path: string) => {
  let failure: unknown;
  for (const base of bases) {
    try {
      return await readAddress(new URL(path, base).href);
    } catch (error) {
      if (error instanceof LdrawError) {
        throw error;
      }
      failure = error;
    }
  }
  throw failure;
};

/** the library keeps parts and primitives apart, and a file does not say which one it means */
const readReference = async (bases: string[], reference: string, partFirst: boolean) => {
  const folders = reference.startsWith('s/') ? ['parts/'] : partFirst ? ['parts/', 'p/'] : ['p/', 'parts/'];
  for (const folder of folders) {
    const text = await readLibrary(bases, folder + reference);
    if (text !== null) {
      return text;
    }
  }
  return null;
};

/** reads everything `start` needs into `files`, breadth first. A part without one of its pieces still is that part */
const gather = async (bases: string[], start: Iterable<string>, files: Map<string, string>, wanted: ReadonlySet<string> = new Set()) => {
  const missing = new Set<string>();
  const queued = new Set<string>(files.keys());
  const waiting: string[] = [];
  const queue = (reference: string) => {
    if (!queued.has(reference)) {
      queued.add(reference);
      waiting.push(reference);
    }
  };
  for (const text of files.values()) {
    referencesOf(text).forEach(queue);
  }
  for (const reference of start) {
    queue(reference);
  }
  while (waiting.length) {
    if (queued.size > MAX_FILES) {
      throw new LdrawError('tooLarge');
    }
    const batch = waiting.splice(0, PARALLEL);
    const texts = await Promise.all(batch.map((reference) => readReference(bases, reference, wanted.has(reference))));
    batch.forEach((reference, index) => {
      const text = texts[index];
      if (text === null) {
        missing.add(reference);
      } else {
        files.set(reference, text);
        referencesOf(text).forEach(queue);
      }
    });
    post({ kind: 'progress', files: files.size });
  }
  return missing;
};

const loadPart = async (bases: string[], number: string) => {
  const main = cleanReference(`${number}.dat`);
  const first = main && (await readLibrary(bases, `parts/${main}`));
  if (!main || first === null || first === undefined) {
    throw new LdrawError('notFound');
  }
  const files = new Map([[main, first]]);
  await gather(bases, [], files);
  post({ kind: 'done', header: headerOf(first), part: flattenPart(main, files) });
};

const loadModel = async (bases: string[], url: string | undefined, given: string | undefined) => {
  const text = given ?? (url ? await readAddress(url) : null);
  if (text === null || text === undefined) {
    throw new LdrawError('notFound');
  }
  const split = splitModel(text);
  const table = await readLibrary(bases, 'LDConfig.ldr');
  const colours = new Map([...parseColours(table ?? ''), ...parseColours(text)]);
  const placements = collectPlacements(split, colours);
  const wanted = new Set(placements.map(({ part }) => part));
  const files = new Map(split.parts);
  await gather(bases, wanted, files, wanted);

  const parts: ModelPart[] = [];
  let done = 0;
  for (const path of wanted) {
    const file = files.get(path);
    if (file !== undefined) {
      try {
        parts.push({ path, header: headerOf(file), part: flattenPart(path, files) });
      } catch {
        // one part without faces, or far too many, does not end the whole model: the panel says how many are missing
      }
    }
    if (++done % 16 === 0) {
      post({ kind: 'progress', files: files.size, parts: done });
    }
  }
  const available = new Set(parts.map(({ path }) => path));
  const kept = placements.filter(({ part }) => available.has(part));
  post({
    kind: 'model',
    header: headerOf(split.models.get(split.main) ?? ''),
    placements: kept,
    parts,
    missing: placements.length - kept.length,
  });
};

addEventListener('message', async ({ data }: MessageEvent<LdrawRequest>) => {
  bytes = 0;
  try {
    if (data.kind === 'part') {
      await loadPart(data.bases, data.number);
    } else {
      await loadModel(data.bases, data.url, data.text);
    }
  } catch (error) {
    post({ kind: 'error', code: error instanceof LdrawError ? error.code : 'network' });
  }
});

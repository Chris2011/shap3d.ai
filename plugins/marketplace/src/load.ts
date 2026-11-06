import type { Definition, Instance } from '../../../src/core/model';
import { extensionOf } from './archive';
import type { LoadAnswer, LoadRequest } from './loadWorker';
// oxlint-disable-next-line import/default -- made by the build
import LoadWorker from './loadWorker.ts?worker&inline';
import { pluginContext, t } from './runtime';
import { SourceError, type Download, type ModelItem, type ModelSource } from './source';

/** the most a model may weigh, downloaded or unpacked – more than that does not stay usable as faces anyway */
export const SIZE_LIMIT = 256 * 1024 * 1024;
/** an STL bigger than this is taken for millimetres: a printed part, not a 10 m object */
const LARGEST_IN_METRES = 10;

/** what stays on the imported group, because most licences ask for it */
export interface Attribution {
  source: string;
  title: string;
  author: string;
  authorUrl?: string;
  license?: string;
  licenseUrl?: string;
  webUrl: string;
}

export interface Progress {
  received: number;
  total?: number;
}

/** an error the panel can name, from the worker or a source */
export class LoadFailure extends Error {
  code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}

/** the bytes are fetched, unpacked and packed in a worker; terminating it is how a download is cancelled */
const runWorker = (download: Download, signal: AbortSignal, onProgress: (progress: Progress) => void) =>
  new Promise<{ extension: string; bytes: Uint8Array }>((resolve, reject) => {
    const worker = new LoadWorker();
    const stop = () => {
      worker.terminate();
      signal.removeEventListener('abort', cancel);
    };
    const cancel = () => {
      stop();
      reject(new DOMException('cancelled', 'AbortError'));
    };
    signal.addEventListener('abort', cancel);
    worker.onerror = () => {
      stop();
      reject(new LoadFailure('network'));
    };
    worker.onmessage = ({ data }: MessageEvent<LoadAnswer>) => {
      if (data.kind === 'progress') {
        onProgress({ received: data.received, total: data.total });
        return;
      }
      stop();
      if (data.kind === 'done') {
        resolve(data);
      } else {
        reject(new LoadFailure(data.code));
      }
    };
    const request: LoadRequest = { download, limit: SIZE_LIMIT };
    worker.postMessage(request, []);
  });

/** a name from a stranger, as a file name: the app takes the group's name from it */
const fileBase = (title: string) =>
  title
    .replace(/[\\/:*?"<>|\p{Cc}]+/gu, ' ')
    .trim()
    .slice(0, 80) || 'model'; // i18n-ignore – fallback file name

/** from the click on Load to the group in the model, with its credits on it – one undo step */
export const loadIntoModel = async (
  source: ModelSource,
  item: ModelItem,
  key: string,
  signal: AbortSignal,
  onProgress: (progress: Progress) => void,
) => {
  const context = pluginContext();
  if (!source.download) {
    throw new SourceError('noFile');
  }
  const offered = await source.download(item, key, signal);
  let file: File;
  let maybeMillimetres = false;
  if (offered instanceof File) {
    file = new File([offered], `${fileBase(item.title)}.${extensionOf(offered.name)}`);
  } else {
    const { extension, bytes } = await runWorker(offered, signal, onProgress);
    file = new File([bytes as BlobPart], `${fileBase(item.title)}.${extension}`);
    maybeMillimetres = extension === 'stl' && Boolean(offered.stlMayBeMillimetres);
  }
  signal.throwIfAborted();
  const attribution: Attribution = {
    source: source.label,
    title: item.title,
    author: item.author,
    authorUrl: item.authorUrl,
    license: item.license,
    licenseUrl: item.licenseUrl,
    webUrl: item.webUrl,
  };
  let scaled = false;
  await context.files.importFile(file, (instance: Instance) => {
    context.data.set(instance.definition, attribution);
    const size = instance.definition.entities.bounds().getSize(new context.THREE.Vector3());
    if (maybeMillimetres && Math.max(size.x, size.y, size.z) > LARGEST_IN_METRES) {
      instance.matrix.scale(new context.THREE.Vector3(0.001, 0.001, 0.001));
      scaled = true;
    }
  });
  if (scaled) {
    context.editor.zoomExtents();
    context.ui.toast(t('marketplace.load.millimetres'));
  }
};

/** the credits of everything loaded into this model; the file is from a stranger too, so only what is text counts */
export const creditsInModel = () => {
  const context = pluginContext();
  const credits: { id: number; name: string; credit: Attribution }[] = [];
  const unused = new Set(context.editor.model.unusedDefinitions());
  context.editor.model.definitions.forEach((definition: Definition, id: number) => {
    const credit = context.data.get<Attribution>(definition);
    if (!unused.has(id) && typeof credit?.title === 'string') {
      credits.push({ id, name: definition.name, credit });
    }
  });
  return credits;
};

/** one line per model, to paste under a picture or into a project's notes */
export const creditLine = ({ title, author, source, license, webUrl }: Attribution) =>
  [`„${title}“`, author, source, license, webUrl].filter(Boolean).join(' – ');

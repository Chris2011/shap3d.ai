import type { PreparedMesh } from '../../../src/scripting/preparedMesh';
import { catalogPart, sizeLabel } from './catalog';
import { pluginContext, t } from './runtime';
import { buildMesh, type BrickMesh } from './shapes';

/**
 * Any part the designer can place, whether made here or loaded: its measures, its mesh and who to name.
 * The id of a loaded part is "ldraw:<number>", of a finished model "model:<name>".
 */

export const LDRAW_PREFIX = 'ldraw:';

export interface Credit {
  /** the part number in the library */
  number: string;
  author: string;
  license: string;
}

export interface LoadedPart {
  id: string;
  title: string;
  credit: Credit;
  w: number;
  d: number;
  height: number;
  mesh: BrickMesh;
  /** what was added to its own coordinates to centre it – missing on parts stored by version 1.0 */
  origin?: [number, number, number];
  /** came with a model: not offered on its own in the catalog, and not kept in the browser */
  fromModel?: boolean;
}

export interface ModelPlacement {
  part: string;
  color: string;
  /** a matrix by columns, in metres */
  matrix: number[];
}

/** a finished model: its parts, and the measures of the whole */
export interface ModelSpec {
  id: string;
  name: string;
  /** a message key for a name that follows the language */
  nameKey?: string;
  w: number;
  d: number;
  height: number;
  placements: ModelPlacement[];
  credit?: { author: string; license: string };
  /** parts the library did not have */
  missing?: number;
}

const loaded = new Map<string, LoadedPart>();
const prepared = new Map<string, Promise<PreparedMesh>>();

export const addLoadedPart = (part: LoadedPart) => loaded.set(part.id, part);
export const loadedPart = (id: string) => loaded.get(id);
export const loadedParts = () => [...loaded.values()].filter((part) => !part.fromModel);

const models = new Map<string, ModelSpec>();
export const addModelSpec = (spec: ModelSpec) => models.set(spec.id, spec);
export const modelSpec = (id: string) => models.get(id);

export interface PartInfo {
  id: string;
  name: string;
  w: number;
  d: number;
  height: number;
  title?: string;
  credit?: Credit;
}

/** what a part is, or undefined when it is neither in the catalog nor loaded */
export const partInfo = (id: string): PartInfo | undefined => {
  const own = catalogPart(id);
  if (own) {
    return {
      id,
      name: t(`bricks.kinds.${own.kind}`, { size: sizeLabel(own.w, own.d, own.bricksHigh) }),
      w: own.w,
      d: own.d,
      height: own.height,
    };
  }
  const spec = models.get(id);
  if (spec) {
    return { id, name: spec.nameKey ? t(spec.nameKey) : spec.name, w: spec.w, d: spec.d, height: spec.height };
  }
  const part = loaded.get(id);
  return part && { id, name: part.title, w: part.w, d: part.d, height: part.height, title: part.title, credit: part.credit };
};

export const partMesh = (id: string): BrickMesh | undefined => {
  const own = catalogPart(id);
  return own ? buildMesh(own.build) : loaded.get(id)?.mesh;
};

/** the smallest thing the picture needs */
export const previewMesh = (id: string): BrickMesh | undefined => {
  const own = catalogPart(id);
  return own ? buildMesh(own.preview ?? own.build, { outsideOnly: true }) : loaded.get(id)?.mesh;
};

const SMOOTH = 30;

/**
 * The part's faces made in a worker: merging coplanar faces is what takes long, and a big plate or a loaded part has
 * thousands. The panel asks for this when a part is chosen, so placing it later is immediate.
 */
export const preparePart = (id: string) => {
  let job = prepared.get(id);
  if (!job) {
    const mesh = partMesh(id);
    if (!mesh) {
      return undefined;
    }
    job = pluginContext().meshes.prepare(mesh, { smooth: SMOOTH });
    prepared.set(id, job);
    job.then(
      (done) => finished.set(id, done),
      () => prepared.delete(id),
    );
  }
  return job;
};

const finished = new Map<string, PreparedMesh>();

/** the faces of many parts at once, in one worker */
export const prepareParts = async (ids: string[]) => {
  const open = ids.filter((id) => !finished.has(id) && partMesh(id));
  if (open.length) {
    const done = await pluginContext().meshes.prepareAll(open.map((id) => ({ mesh: partMesh(id)!, options: { smooth: SMOOTH } })));
    done.forEach((mesh, index) => finished.set(open[index], mesh));
  }
};

/** what to build a part from: the worker's result when it is there, else the plain mesh (a script does not wait) */
export const buildablePart = (id: string) => finished.get(id) ?? partMesh(id);
export const buildOptions = { smooth: SMOOTH };

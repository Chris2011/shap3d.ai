import type { Transform } from './ldraw';
import { runLdrawWorker } from './online';
import { OWN_MODELS, ownPlacementAt, type OwnModelName } from './ownModels';
import { addLoadedPart, addModelSpec, LDRAW_PREFIX, modelSpec, partMesh, prepareParts, type ModelPlacement, type ModelSpec } from './parts';
import { pluginContext, THREE } from './runtime';
import { PITCH } from './shapes';

/**
 * Finished models: many parts with their places and colours, placed as one piece. The parts stay one component each,
 * so a castle of a thousand bricks only holds its different parts once.
 */

/** one LDraw unit in metres */
const LDU = 0.0004;

const boxes = new Map<string, InstanceType<typeof THREE.Box3>>();

/** a part's box in its own coordinates */
const boxOfPart = (id: string) => {
  let box = boxes.get(id);
  if (!box) {
    box = new THREE.Box3();
    for (const [x, y, z] of partMesh(id)?.vertices ?? []) {
      box.expandByPoint(new THREE.Vector3(x, y, z));
    }
    boxes.set(id, box);
  }
  return box;
};

/** centres the parts on their common middle, on the ground, and says how many cells they take */
const specOf = (id: string, name: string, placements: ModelPlacement[], extra: Partial<ModelSpec> = {}): ModelSpec => {
  const around = new THREE.Box3();
  const matrix = new THREE.Matrix4();
  for (const placement of placements) {
    around.union(boxOfPart(placement.part).clone().applyMatrix4(matrix.fromArray(placement.matrix)));
  }
  const shift = new THREE.Matrix4().makeTranslation(-(around.min.x + around.max.x) / 2, -(around.min.y + around.max.y) / 2, -around.min.z);
  return {
    id,
    name,
    placements: placements.map((placement) => ({
      ...placement,
      matrix: shift.clone().multiply(matrix.fromArray(placement.matrix)).toArray(),
    })),
    w: Math.max(1, Math.ceil((around.max.x - around.min.x) / PITCH - 1e-6)),
    d: Math.max(1, Math.ceil((around.max.y - around.min.y) / PITCH - 1e-6)),
    height: around.max.z - around.min.z,
    ...extra,
  };
};

export const OWN_PREFIX = 'model:own-';

/** a model of the plugin's own, made when it is first asked for */
export const ownModelSpec = (name: OwnModelName) => {
  const id = OWN_PREFIX + name;
  const known = modelSpec(id);
  if (known) {
    return known;
  }
  const placements = OWN_MODELS[name]().map((placement): ModelPlacement => {
    const at = new THREE.Vector3(...ownPlacementAt(placement));
    const turn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (placement.rotation * Math.PI) / 180);
    return {
      part: placement.part,
      color: placement.color,
      matrix: new THREE.Matrix4().compose(at, turn, new THREE.Vector3(1, 1, 1)).toArray(),
    };
  });
  const spec = specOf(id, name, placements, { nameKey: `bricks.models.own.${name}` });
  addModelSpec(spec);
  return spec;
};

/** where a part goes, from LDraw's coordinates (Y down, in its units) to ours, for a mesh centred by `origin` */
const placementMatrixOf = (transform: Transform, origin: [number, number, number]) => {
  const [x, y, z, a, b, c, d, e, f, g, h, i] = transform;
  const inLdraw = new THREE.Matrix4().set(a, b, c, x, d, e, f, y, g, h, i, z, 0, 0, 0, 1);
  const toOurs = new THREE.Matrix4().set(LDU, 0, 0, 0, 0, 0, LDU, 0, 0, -LDU, 0, 0, 0, 0, 0, 1);
  return toOurs
    .clone()
    .multiply(inLdraw)
    .multiply(toOurs.clone().invert())
    .multiply(new THREE.Matrix4().makeTranslation(-origin[0], -origin[1], -origin[2]));
};

const partId = (path: string) => LDRAW_PREFIX + path.replace(/\.(dat|ldr)$/, '');

export interface ModelRequest {
  id: string;
  title: string;
  url?: string;
  text?: string;
}

export interface ModelProgress {
  files: number;
  parts?: number;
  total?: number;
}

/** a whole model: every part fetched and made in a worker, then the faces of all of them in another */
export const loadModel = async (
  { id, title, url, text }: ModelRequest,
  signal: AbortSignal,
  onProgress: (progress: ModelProgress) => void,
) => {
  const known = modelSpec(id);
  if (known) {
    return known;
  }
  const answer = await runLdrawWorker({ kind: 'model', url, text }, signal, ({ files, parts }) => onProgress({ files, parts }));
  if (answer.kind !== 'model') {
    throw new Error('unexpected answer'); // i18n-ignore – programming error
  }
  const origins = new Map<string, [number, number, number]>();
  for (const { path, header, part } of answer.parts) {
    const number = path.replace(/\.(dat|ldr)$/, '');
    origins.set(path, part.origin);
    addLoadedPart({
      id: partId(path),
      title: header.title || number,
      credit: { number, author: header.author, license: header.license },
      w: part.w,
      d: part.d,
      height: part.height,
      origin: part.origin,
      mesh: { vertices: part.vertices, faces: part.faces },
      fromModel: true,
    });
  }
  await prepareParts(answer.parts.map(({ path }) => partId(path)));
  signal.throwIfAborted();
  const placements = answer.placements.map(({ part, color, transform }): ModelPlacement => ({
    part: partId(part),
    color,
    matrix: placementMatrixOf(transform, origins.get(part)!).toArray(),
  }));
  const spec = specOf(id, title, placements, {
    missing: answer.missing,
    credit: { author: answer.header.author, license: answer.header.license },
  });
  addModelSpec(spec);
  return spec;
};

/** a model file the user chose, from a stranger as far as this code knows */
export const MODEL_FILE_LIMIT = 64 * 1024 * 1024;
export const titleOfFile = (name: string) =>
  name
    .replace(/\.(ldr|mpd|l3b)$/i, '')
    .replace(/\p{Cc}+/gu, ' ')
    .trim()
    .slice(0, 80);

export const openModelFile = async (file: File, signal: AbortSignal, onProgress: (progress: ModelProgress) => void) => {
  if (file.size > MODEL_FILE_LIMIT) {
    throw new Error('tooLarge');
  }
  const title = titleOfFile(file.name) || pluginContext().i18n.t('bricks.models.unnamed');
  return loadModel({ id: `model:file-${file.name}-${file.size}`, title, text: await file.text() }, signal, onProgress);
};

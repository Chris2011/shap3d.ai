/**
 * Undo steps kept as text, which takes a fraction of the memory of the same snapshot as objects. Most steps
 * change little: a group that stayed the same shares one text with the steps before it.
 */
export interface PackedSnapshot {
  rest: string;
  /** materials and environment: can hold big pictures, and most steps leave them alone */
  pictures: string;
  root: string;
  definitions: string[];
  /** what this step added to memory (roughly: the texts it does not share) */
  bytes: number;
}

/** older undo steps go when the history takes more than this */
export const HISTORY_BUDGET_BYTES = 256 * 1024 * 1024;

export const createSnapshotPacker = () => {
  let lastDefinitions = new Map<number, string>();
  let lastRoot = '';
  let lastPictures = '';
  return (snapshot: any): PackedSnapshot => {
    let bytes = 0;
    const definitions = new Map<number, string>();
    for (const definition of snapshot.definitions) {
      const text = JSON.stringify(definition);
      const before = lastDefinitions.get(definition.id);
      definitions.set(definition.id, before === text ? before : text);
      bytes += before === text ? 0 : text.length;
    }
    const rootText = JSON.stringify(snapshot.root);
    const root = rootText === lastRoot ? lastRoot : rootText;
    bytes += rootText === lastRoot ? 0 : rootText.length;
    const picturesText = JSON.stringify({ materials: snapshot.materials, environment: snapshot.environment });
    const pictures = picturesText === lastPictures ? lastPictures : picturesText;
    bytes += picturesText === lastPictures ? 0 : picturesText.length;
    lastPictures = pictures;
    const rest = JSON.stringify({ ...snapshot, definitions: undefined, root: undefined, materials: undefined, environment: undefined });
    lastDefinitions = definitions;
    lastRoot = root;
    return { rest, pictures, root, definitions: [...definitions.values()], bytes: bytes + rest.length };
  };
};

export const unpackSnapshot = (packed: PackedSnapshot) => ({
  ...JSON.parse(packed.rest),
  ...JSON.parse(packed.pictures),
  root: JSON.parse(packed.root),
  definitions: packed.definitions.map((text) => JSON.parse(text)),
});

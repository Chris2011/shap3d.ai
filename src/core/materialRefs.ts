import type { Entities } from './model';

/** What can name a material: faces (front and back) and painted groups/components. */
interface MaterialOwner {
  material?: string;
  backMaterial?: string;
}
type MaterialKey = keyof MaterialOwner;

/**
 * Calls `visit` for every place in the model that can name a material: both sides of each face and each
 * instance – also inside groups and components, each shared definition only once.
 */
const forEachMaterialSlot = (root: Entities, visit: (owner: MaterialOwner, key: MaterialKey) => void) => {
  const seen = new Set<Entities>();
  const walk = (entities: Entities) => {
    if (seen.has(entities)) {
      return;
    }
    seen.add(entities);
    for (const face of entities.faces.values()) {
      visit(face, 'material');
      visit(face, 'backMaterial');
    }
    for (const instance of entities.instances.values()) {
      visit(instance, 'material');
      walk(instance.definition.entities);
    }
  };
  walk(root);
};

/** How often the material `name` is used: face fronts, face backs and painted groups/components. */
export const countMaterialUses = (root: Entities, name: string) => {
  let count = 0;
  forEachMaterialSlot(root, (owner, key) => {
    if (owner[key] === name) {
      count++;
    }
  });
  return count;
};

/** Points every use of the material `from` to `to` – or to the default material when `to` is undefined. */
export const replaceMaterialRefs = (root: Entities, from: string, to: string | undefined) => {
  forEachMaterialSlot(root, (owner, key) => {
    if (owner[key] === from) {
      owner[key] = to;
    }
  });
};

/** `wanted` (or "Material" when empty), with " 2", " 3" … added until no material in `taken` has that name. */
export const uniqueMaterialName = (taken: readonly { name: string }[], wanted: string) => {
  const base = wanted.trim() || 'Material';
  let name = base;
  let counter = 1;
  while (taken.some((other) => other.name === name)) {
    name = `${base} ${++counter}`;
  }
  return name;
};

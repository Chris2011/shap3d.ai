import type { Definition } from '../../../src/core/model';
import type { ScriptApi } from '../../../src/scripting/api';
import { cone, displace, icosphere, joinMeshes, toPluginMesh, transformMesh, type TriangleMesh } from './mesh';
import { pluginContext, t } from './runtime';

/**
 * The plugin's own things to scatter – simple low-poly trees, bushes and rocks, each a component (built once
 * per model and variant, then placed as often as needed). Crowns and rocks are spheres bent by noise.
 */
export const OBJECT_KINDS = ['conifer', 'tree', 'bush', 'rock'] as const;
export type ObjectKind = (typeof OBJECT_KINDS)[number];

/** variants per kind – rocks and crowns differ by their noise seed */
const VARIANTS: Record<ObjectKind, number> = { conifer: 2, tree: 3, bush: 2, rock: 4 };

// i18n-ignore-next-line – material names (model content)
const MATERIALS = { bark: 'Rinde', needles: 'Nadeln', leaves: 'Laub', bush: 'Strauch', rock: 'Fels' };
const COLOURS = { bark: '#6b4a32', needles: '#2e5a35', leaves: '#4c8a3c', bush: '#5f9442' };

const meshOf = (kind: ObjectKind, variant: number): TriangleMesh => {
  const seed = 11 + variant * 17;
  if (kind === 'conifer') {
    const stretch = 1 + variant * 0.15;
    return joinMeshes(
      cone(0.12, 0.08, 0.8, 6, 0, MATERIALS.bark),
      transformMesh(cone(1.2, 0, 2.0, 9, 0.6, MATERIALS.needles), [1, 1, stretch], [0, 0, 0]),
      transformMesh(cone(0.95, 0, 1.8, 9, 1.6, MATERIALS.needles), [1, 1, stretch], [0, 0, 0]),
      transformMesh(cone(0.7, 0, 1.6, 9, 2.6, MATERIALS.needles), [1, 1, stretch], [0, 0, 0]),
    );
  }
  if (kind === 'tree') {
    const crown = displace(icosphere(1.3, 1, MATERIALS.leaves), { amount: 0.28, scale: 0.9, seed, octaves: 2 });
    return joinMeshes(cone(0.15, 0.1, 1.8, 6, 0, MATERIALS.bark), transformMesh(crown, [1, 1, 1.12], [0, 0, 2.7]));
  }
  if (kind === 'bush') {
    const bush = displace(icosphere(0.6, 1, MATERIALS.bush), { amount: 0.14, scale: 0.45, seed, octaves: 2 });
    return transformMesh(bush, [1, 1, 0.75], [0, 0, 0.35]);
  }
  const rock = displace(icosphere(0.5, 2, MATERIALS.rock), { amount: 0.13, scale: 0.55, seed, octaves: 3, mode: 'ridged' });
  // flattened and sunk a little, so it sits in the ground
  return transformMesh(rock, [1.1, 0.9, 0.6], [0, 0, 0.12]);
};

interface ObjectData {
  object: ObjectKind;
  variant: number;
}

/** the components of a kind (all variants) – reused when the model has them, built otherwise */
export const objectDefinitions = (api: ScriptApi, kind: ObjectKind): Definition[] => {
  const context = pluginContext();
  const existing = [...api.editor.model.definitions.values()].filter(
    (definition) => context.data.get<ObjectData>(definition)?.object === kind,
  );
  const definitions: Definition[] = [];
  for (let variant = 0; variant < VARIANTS[kind]; variant++) {
    const found = existing.find((definition) => context.data.get<ObjectData>(definition)?.variant === variant);
    if (found) {
      definitions.push(found);
      continue;
    }
    for (const [key, name] of Object.entries(MATERIALS)) {
      // the rock comes from the app's material library (with its stone texture), the others are plain colours –
      // materials the model already has keep the colour the user gave them
      if (!api.editor.model.materials.some((material) => material.name === name)) {
        api.ensureMaterial(name, COLOURS[key as keyof typeof COLOURS]);
      }
    }
    const name = api.editor.model.uniqueDefName(t(`noise.objects.${kind}`));
    const { def } = api.component(name, (inner) => {
      context.meshes.build(inner.ents, toPluginMesh(meshOf(kind, variant)), { smooth: 50 });
    });
    context.data.set(def, { object: kind, variant } satisfies ObjectData);
    definitions.push(def);
  }
  return definitions;
};

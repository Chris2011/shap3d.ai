import * as THREE from 'three';
import { GroupHandle } from './handles';

// ---------------------------------------------------------------- parametric shapes
/**
 * Round shapes remember how they were made (kind, positional args, options) on their definition,
 * so the polygon panel can rebuild them with more or fewer segments. Number of positional args per kind:
 */
// i18n-ignore-start – default names of what scripts build are part of the s3d API (labels in the UI: shapes.<kind>)
export const PARAMETRIC: Record<string, { args: number; option: 'segments' | 'sides'; defaultValue: number; min: number; label: string }> =
  {
    cylinder: { args: 3, option: 'segments', defaultValue: 24, min: 3, label: 'Zylinder' },
    cylinderBetween: { args: 3, option: 'segments', defaultValue: 12, min: 3, label: 'Stange' },
    cone: { args: 3, option: 'segments', defaultValue: 24, min: 3, label: 'Kegel' },
    sphere: { args: 2, option: 'segments', defaultValue: 24, min: 4, label: 'Kugel' },
    dome: { args: 2, option: 'segments', defaultValue: 24, min: 4, label: 'Kuppel' },
    ellipsoid: { args: 4, option: 'segments', defaultValue: 16, min: 4, label: 'Ellipsoid' },
    tube: { args: 4, option: 'segments', defaultValue: 24, min: 3, label: 'Rohr' },
    torus: { args: 3, option: 'segments', defaultValue: 24, min: 3, label: 'Torus' },
    prism: { args: 3, option: 'sides', defaultValue: 6, min: 3, label: 'Prisma' },
    pyramid: { args: 3, option: 'sides', defaultValue: 4, min: 3, label: 'Pyramide' },
  };
// i18n-ignore-end
const plain = (value: unknown): unknown =>
  value instanceof THREE.Vector3
    ? value.toArray()
    : Array.isArray(value)
      ? value.map(plain)
      : value && typeof value === 'object'
        ? JSON.parse(JSON.stringify(value))
        : value;
/** Wraps the round shapes of the `s3d` class: the group each one builds remembers kind, arguments and options. */
export const recordParametricShapes = (api: { prototype: object }) => {
  for (const [kind, meta] of Object.entries(PARAMETRIC)) {
    const proto = api.prototype as any;
    const orig = proto[kind];
    proto[kind] = function (this: unknown, ...args: unknown[]) {
      const result = orig.apply(this, args);
      if (result instanceof GroupHandle) {
        result.inst.definition.shape = {
          kind,
          args: args.slice(0, meta.args).map(plain),
          opts: plain(args[meta.args] ?? {}) as Record<string, unknown>,
        };
      }
      return result;
    };
  }
};

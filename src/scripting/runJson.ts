import type { Editor } from '../engine/editor';
import type { FaceHandle } from './handles';
import { GroupHandle } from './handles';
import { toVec } from './points';
import { t } from '../i18n';
import { ScriptApi } from './scriptApi/scriptApi';
import type { RunResult } from './scriptTypes';

/** Declarative JSON → API calls. */
export const runJson = (editor: Editor, text: string): RunResult => {
  let doc: any;
  try {
    doc = JSON.parse(text);
  } catch (error: any) {
    return { ok: false, logs: [], error: 'JSON-Fehler: ' + error.message, durationMs: 0 };
  }
  const api = new ScriptApi(editor);
  const startedAt = performance.now();
  const build = (node: any) => {
    const type = node.type;
    let res: GroupHandle | FaceHandle | null = null;
    switch (type) {
      case 'box':
        res = api.box(node.at ?? [0, 0, 0], node.size?.[0] ?? 1, node.size?.[1] ?? 1, node.size?.[2] ?? 1, {
          name: node.name,
          material: node.material,
          group: node.group,
        });
        break;
      case 'cylinder':
        res = api.cylinder(node.at ?? [0, 0, 0], node.radius ?? 0.5, node.height ?? 1, {
          segments: node.segments,
          name: node.name,
          material: node.material,
          group: node.group,
        });
        break;
      case 'sphere':
        res = api.sphere(node.at ?? [0, 0, 0], node.radius ?? 0.5, { segments: node.segments, name: node.name, material: node.material });
        break;
      case 'rect':
        res = api.rect(node.at ?? [0, 0, 0], node.size?.[0] ?? 1, node.size?.[1] ?? 1, node.plane);
        if (node.pushpull) {
          res = (res as FaceHandle).pushpull(node.pushpull);
        }
        if (node.material && res) {
          (res as FaceHandle).material(node.material);
        }
        break;
      case 'circle':
        res = api.circle(node.at ?? [0, 0, 0], node.radius ?? 1, { segments: node.segments, normal: node.normal });
        if (node.pushpull) {
          res = (res as FaceHandle).pushpull(node.pushpull);
        }
        break;
      case 'polygon':
        res = api.polygon(node.at ?? [0, 0, 0], node.radius ?? 1, node.sides ?? 6, node.normal);
        if (node.pushpull) {
          res = (res as FaceHandle).pushpull(node.pushpull);
        }
        break;
      case 'face':
        res = api.face(node.points);
        if (node.material) {
          res.material(node.material);
        }
        if (node.pushpull) {
          res = res.pushpull(node.pushpull);
        }
        break;
      case 'line':
        api.polyline(node.points, !!node.closed);
        break;
      case 'polyhedron':
        api.polyhedron(node.points ?? [], node.faces ?? [], { material: node.material });
        return null;
      case 'text3d': {
        // provided by the built-in 3D-text plugin
        const text3d = (api as unknown as Record<string, unknown>).text3d as ((text: string, opts: object) => GroupHandle) | undefined;
        if (!text3d) {
          throw new Error(t('script.errors.needsText3d'));
        }
        res = text3d.call(api, node.text ?? 'Text', {
          at: node.at,
          size: node.size,
          depth: node.depth,
          material: node.material,
          upright: node.upright,
          filled: node.filled,
          font: node.font,
        });
        break;
      }
      case 'group':
        res = api.group(node.name ?? 'Gruppe', () => {
          for (const child of node.children ?? []) {
            build(child);
          }
        });
        break;
      case 'array': {
        const count = node.count ?? 2;
        const off = toVec(node.offset ?? [1, 0, 0]);
        for (let i = 0; i < count; i++) {
          const result = build(node.object);
          if (result instanceof GroupHandle) {
            result.move(off.clone().multiplyScalar(i));
          }
        }
        return null;
      }
      case 'guide':
        api.guide(node.at ?? [0, 0, 0], node.direction);
        return null;
      case 'label':
        api.label(node.at ?? [0, 0, 0], node.text ?? '');
        return null;
      case 'dimension':
        api.dimension(node.from, node.to, node.offset);
        return null;
      default:
        throw new Error(t('script.errors.unknownType', { type }));
    }
    if (res instanceof GroupHandle) {
      if (node.material) {
        res.material(node.material);
      }
      if (node.rotate) {
        res.rotate(node.rotate.angle ?? 0, node.rotate.axis ?? 'z', node.rotate.center);
      }
      if (node.scale) {
        res.scale(node.scale);
      }
      if (node.move) {
        res.move(node.move);
      }
      if (node.tag) {
        res.tag(node.tag);
      }
    }
    return res;
  };
  try {
    editor.commit('JSON-Skript', () => {
      if (doc.clear) {
        api.clear();
      }
      for (const [materialName, value] of Object.entries(doc.materials ?? {})) {
        api.material(
          materialName,
          typeof value === 'string' ? value : (value as any).color,
          typeof value === 'string' ? 1 : ((value as any).opacity ?? 1),
        );
      }
      for (const node of doc.objects ?? []) {
        build(node);
      }
      if (doc.view) {
        api.view(doc.view);
      } else if (doc.zoomExtents !== false) {
        api.zoomExtents();
      }
    });
    api.afterRun();
    return { ok: true, logs: api.logs, durationMs: performance.now() - startedAt };
  } catch (error: any) {
    return { ok: false, logs: api.logs, error: error?.message ?? String(error), durationMs: performance.now() - startedAt };
  }
};

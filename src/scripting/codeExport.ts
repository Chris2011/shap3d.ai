import * as THREE from 'three';
import { shallowReactive } from 'vue';
import type { Editor } from '../engine/editor';
import type { Entities, EntityRef } from '../core/model';
import { Model } from '../core/document';
import { runScript, runJson } from './api';
import { importObj } from './mesh';
import { t, localize } from '../i18n';

/**
 * Models as code and back: a neutral description of geometry (CodeScene) that every code format
 * can write, and a sandbox that runs code without touching the real model. Used by the context
 * menu ("Als Code öffnen") and by the script editor ("Umwandeln in").
 */

export type CodePoint = [number, number, number];
export interface CodeFace {
  /** point indices of the outline, in the face's winding (front side) */
  outer: number[];
  holes: number[][];
  material?: string;
  /** triangulation (point indices) – for formats without holes */
  triangles: [number, number, number][];
}
export interface CodeGroup {
  name: string;
  material?: string;
  /** world coordinates in metres, Z up */
  points: CodePoint[];
  faces: CodeFace[];
  /** loose edges (no face) */
  lines: [number, number][];
  children: CodeGroup[];
}
export interface CodeScene {
  /** what it was made from, e.g. "Auswahl (2 Objekte)" */
  title: string;
  materials: Record<string, { color: string; opacity: number }>;
  root: CodeGroup;
}

/** A code format: writes a scene, and (optionally) runs code into a sandbox model. */
export interface CodeFormat {
  /** same id as the script editor language (js, json, obj, openscad …) */
  id: string;
  label: string;
  generate: (scene: CodeScene) => string;
  /** builds the code's geometry into `sandbox.entities` (a throw-away model) */
  evaluate?: (code: string, sandbox: Editor, options: CodeOptions) => void | Promise<void>;
}
/** options of the script editor that matter when reading code (OBJ size and axis) */
export interface CodeOptions {
  objSize?: number;
  objYUp?: boolean;
  objSmooth?: number;
}

// ------------------------------------------------------------ model → scene
const round = (value: number) => {
  const rounded = Math.round(value * 1e6) / 1e6;
  return Object.is(rounded, -0) ? 0 : rounded;
};

const emptyGroup = (name: string, material?: string): CodeGroup => ({ name, material, points: [], faces: [], lines: [], children: [] });

/** Adds faces/edges/instances of `entities` (placed with `matrix`) to `group`; `include` limits what is taken. */
const collect = (
  entities: Entities,
  matrix: THREE.Matrix4,
  group: CodeGroup,
  include?: { faces: Set<number>; edges: Set<number>; instances: Set<number> },
) => {
  const pointIndex = new Map<number, number>();
  const indexOf = (vertexId: number) => {
    let index = pointIndex.get(vertexId);
    if (index == null) {
      const point = entities.positionOf(vertexId).clone().applyMatrix4(matrix);
      index = group.points.length;
      group.points.push([round(point.x), round(point.y), round(point.z)]);
      pointIndex.set(vertexId, index);
    }
    return index;
  };
  for (const face of entities.faces.values()) {
    if (face.hidden || (include && !include.faces.has(face.id))) {
      continue;
    }
    const corners = [...face.outer, ...face.holes.flat()];
    const flat = entities.faceTriangles(face);
    const triangles: [number, number, number][] = [];
    for (let i = 0; i + 2 < flat.length; i += 3) {
      triangles.push([indexOf(corners[flat[i]]), indexOf(corners[flat[i + 1]]), indexOf(corners[flat[i + 2]])]);
    }
    group.faces.push({
      outer: face.outer.map(indexOf),
      holes: face.holes.map((hole) => hole.map(indexOf)),
      material: face.material,
      triangles,
    });
  }
  for (const edge of entities.edges.values()) {
    if (edge.hidden || entities.facesOfEdge(edge.id).length || (include && !include.edges.has(edge.id))) {
      continue;
    }
    group.lines.push([indexOf(edge.start), indexOf(edge.end)]);
  }
  for (const instance of entities.instances.values()) {
    if (instance.hidden || (include && !include.instances.has(instance.id))) {
      continue;
    }
    const child = emptyGroup(instance.name || instance.definition.name, instance.material);
    collect(instance.definition.entities, matrix.clone().multiply(instance.matrix), child);
    group.children.push(child);
  }
};

/** the materials a scene uses, with colour and opacity from the model */
const usedMaterials = (root: CodeGroup, model: Model) => {
  const names = new Set<string>();
  const walk = (group: CodeGroup) => {
    if (group.material) {
      names.add(group.material);
    }
    for (const face of group.faces) {
      if (face.material) {
        names.add(face.material);
      }
    }
    group.children.forEach(walk);
  };
  walk(root);
  const materials: CodeScene['materials'] = {};
  for (const name of [...names].sort()) {
    const material = model.material(name); // also plain colours like '#7a4b2a'
    materials[name] = { color: material?.color ?? '#cccccc', opacity: material?.opacity ?? 1 };
  }
  return materials;
};

/** The selection (or, without one, everything in the current context) as a scene in world coordinates. */
export const sceneFromSelection = (editor: Editor): CodeScene => {
  const refs: EntityRef[] = editor.selected();
  const root = emptyGroup(t('mesh.selection'));
  const include = refs.length
    ? {
        faces: new Set(refs.filter((ref) => ref.kind === 'face').map((ref) => ref.id)),
        edges: new Set(refs.filter((ref) => ref.kind === 'edge').map((ref) => ref.id)),
        instances: new Set(refs.filter((ref) => ref.kind === 'instance').map((ref) => ref.id)),
      }
    : undefined;
  collect(editor.entities, editor.contextMatrix, root, include);
  const count = refs.length || root.faces.length + root.children.length;
  const title =
    refs.length === 1 && root.children.length === 1 && !root.faces.length
      ? `„${root.children[0].name}“`
      : refs.length
        ? `Auswahl (${count} ${count === 1 ? 'Element' : 'Elemente'})`
        : `„${editor.model.name || 'Modell'}“`;
  return { title, materials: usedMaterials(root, editor.model), root };
};

/** Largest side of the scene in metres (OBJ files carry no size). */
export const sceneSize = (scene: CodeScene) => {
  const box = new THREE.Box3();
  const walk = (group: CodeGroup) => {
    for (const point of group.points) {
      box.expandByPoint(new THREE.Vector3(...point));
    }
    group.children.forEach(walk);
  };
  walk(scene.root);
  if (box.isEmpty()) {
    return 1;
  }
  const size = box.getSize(new THREE.Vector3());
  return round(Math.max(size.x, size.y, size.z));
};

// ------------------------------------------------------------ generators
const quote = (text: string) => `'${text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'`;
const pointList = (points: CodePoint[], indent: string) => {
  const parts = points.map((point) => `[${point.join(', ')}]`);
  const lines: string[] = [];
  for (let i = 0; i < parts.length; i += 4) {
    lines.push(indent + parts.slice(i, i + 4).join(', '));
  }
  return lines.join(',\n');
};
/** the points the faces use – collect() adds them before the points of loose edges */
const facePoints = (group: CodeGroup) =>
  group.points.slice(
    0,
    1 +
      group.faces.reduce(
        (highest, face) => [...face.outer, ...face.holes.flat()].reduce((max, index) => Math.max(max, index), highest),
        -1,
      ),
  );
const faceSpec = (face: CodeFace) =>
  face.holes.length || face.material
    ? { outer: face.outer, ...(face.holes.length ? { holes: face.holes } : {}), ...(face.material ? { material: face.material } : {}) }
    : face.outer;
/** a face spec as JavaScript: { outer: [0, 1, 2], material: 'Holz' } */
const jsValue = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(jsValue).join(', ')}]`
    : typeof value === 'object' && value
      ? `{ ${Object.entries(value)
          .map(([key, entry]) => `${key}: ${jsValue(entry)}`)
          .join(', ')} }`
      : typeof value === 'string'
        ? quote(value)
        : String(value);
const isEmpty = (group: CodeGroup): boolean => !group.faces.length && !group.lines.length && group.children.every(isEmpty);

const header = (scene: CodeScene, comment: string, extra = '') =>
  `${comment} ${t('codeExport.header', { source: localize(scene.title) })}${extra}\n`;

/** JavaScript for the s3d API */
const generateJs = (scene: CodeScene) => {
  const out: string[] = [header(scene, '//', `, ${t('codeExport.zUp')}.`)];
  // plain colours ('#7a4b2a') need no definition – s3d takes them as they are
  for (const [name, material] of Object.entries(scene.materials)) {
    if (name.toLowerCase() !== material.color.toLowerCase() || material.opacity < 1) {
      out.push(`s3d.material(${quote(name)}, ${quote(material.color)}${material.opacity < 1 ? `, ${material.opacity}` : ''});`);
    }
  }
  if (out.length > 1) {
    out.push('');
  }
  const body = (group: CodeGroup, indent: string) => {
    if (group.faces.length) {
      out.push(`${indent}s3d.polyhedron(`, `${indent}  [`, pointList(facePoints(group), indent + '    '), `${indent}  ],`);
      out.push(
        `${indent}  [`,
        group.faces.map((face) => indent + '    ' + jsValue(faceSpec(face))).join(',\n'),
        `${indent}  ]`,
        `${indent});`,
      );
    }
    for (const [from, to] of group.lines) {
      out.push(`${indent}s3d.line([${group.points[from].join(', ')}], [${group.points[to].join(', ')}]);`);
    }
    for (const child of group.children) {
      if (isEmpty(child)) {
        continue;
      }
      out.push(`${indent}s3d.group(${quote(child.name)}, () => {`);
      body(child, indent + '  ');
      out.push(`${indent}})${child.material ? `.material(${quote(child.material)})` : ''};`);
    }
  };
  body(scene.root, '');
  out.push('s3d.zoomExtents();');
  return out.join('\n') + '\n';
};

/** JSON for the script editor's JSON mode */
const generateJson = (scene: CodeScene) => {
  const node = (group: CodeGroup): unknown[] => [
    ...(group.faces.length ? [{ type: 'polyhedron', points: facePoints(group), faces: group.faces.map(faceSpec) }] : []),
    ...group.lines.map(([from, to]) => ({ type: 'line', points: [group.points[from], group.points[to]] })),
    ...group.children
      .filter((child) => !isEmpty(child))
      .map((child) => ({
        type: 'group',
        name: child.name,
        ...(child.material ? { material: child.material } : {}),
        children: node(child),
      })),
  ];
  const doc = { comment: header(scene, '', `, ${t('codeExport.zUp')}`).trim(), materials: scene.materials, objects: node(scene.root) };
  return prettyJson(doc, '') + '\n';
};

const flatJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(flatJson).join(', ')}]`;
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value) ?? 'null';
  }
  const entries = Object.entries(value);
  return entries.length ? `{ ${entries.map(([key, item]) => `${JSON.stringify(key)}: ${flatJson(item)}`).join(', ')} }` : '{}';
};
/** JSON with short values (points, faces, materials) on one line and only long ones spread out */
const prettyJson = (value: unknown, indent: string): string => {
  const flat = flatJson(value);
  if (indent.length + flat.length <= 100 || value === null || typeof value !== 'object') {
    return flat;
  }
  const inner = indent + '  ';
  if (Array.isArray(value)) {
    return `[\n${value.map((item) => inner + prettyJson(item, inner)).join(',\n')}\n${indent}]`;
  }
  return `{\n${Object.entries(value)
    .map(([key, item]) => `${inner}${JSON.stringify(key)}: ${prettyJson(item, inner)}`)
    .join(',\n')}\n${indent}}`;
};

/** Wavefront OBJ – Y up (OBJ convention, the script editor turns it back), one object per group */
const generateObj = (scene: CodeScene) => {
  const out: string[] = [
    header(scene, '#', ` – ${t('codeExport.yUp')}`).trimEnd(),
    `# ${t('codeExport.objSize', { size: sceneSize(scene) })}`,
  ];
  let offset = 1;
  const write = (group: CodeGroup, path: string) => {
    if (group.faces.length || group.lines.length) {
      out.push(`o ${path || 'Objekt'}`);
      for (const [x, y, z] of group.points) {
        out.push(`v ${x} ${z} ${round(-y)}`);
      }
      for (const face of group.faces) {
        if (face.holes.length) {
          for (const triangle of face.triangles) {
            out.push(`f ${triangle.map((index) => index + offset).join(' ')}`);
          }
        } else {
          out.push(`f ${face.outer.map((index) => index + offset).join(' ')}`);
        }
      }
      for (const [from, to] of group.lines) {
        out.push(`l ${from + offset} ${to + offset}`);
      }
      offset += group.points.length;
    }
    for (const child of group.children) {
      write(child, path ? `${path}/${child.name}` : child.name);
    }
  };
  write(scene.root, '');
  return out.join('\n') + '\n';
};

// ------------------------------------------------------------ sandbox: run code without touching the model
/** A throw-away model with an editor stand-in – enough for the s3d API, JSON and OBJ import. */
const createSandbox = (editor: Editor): Editor => {
  const model = new Model();
  model.materials = editor.model.materials.map((material) => ({ ...material }));
  model.settings.units = editor.model.settings.units;
  const noop = () => {};
  return {
    model,
    activePath: [],
    ui: editor.ui,
    get entities() {
      return model.root;
    },
    get contextMatrix() {
      return new THREE.Matrix4();
    },
    commit: (_label: string, action: () => unknown) => action(),
    select: noop,
    clearSelection: noop,
    zoomExtents: noop,
    toast: noop,
    invalidate: noop,
    redraw: noop,
    viewer: { rig: { applyState: noop, standardView: noop } },
  } as unknown as Editor;
};

const failOn = (result: { ok: boolean; error?: string }) => {
  if (!result.ok) {
    throw new Error(result.error ?? t('codeExport.failed'));
  }
};

export const CODE_FORMATS = shallowReactive<CodeFormat[]>([
  { id: 'js', label: 'JavaScript (s3d)', generate: generateJs, evaluate: (code, sandbox) => failOn(runScript(sandbox, code)) },
  { id: 'json', label: 'JSON', generate: generateJson, evaluate: (code, sandbox) => failOn(runJson(sandbox, code)) },
  {
    id: 'obj',
    label: 'OBJ-Mesh',
    generate: generateObj,
    evaluate: (code, sandbox, options) =>
      failOn(importObj(sandbox, code, { size: options.objSize ?? 1, yUp: options.objYUp ?? true, smooth: options.objSmooth ?? 30 })),
  },
]);

export const findCodeFormat = (id: string) => CODE_FORMATS.find((format) => format.id === id);

export const registerCodeFormat = (format: CodeFormat) => {
  if (findCodeFormat(format.id)) {
    throw new Error(t('codeExport.exists', { id: format.id }));
  }
  CODE_FORMATS.push(format);
  return () => {
    const index = CODE_FORMATS.indexOf(format);
    if (index >= 0) {
      CODE_FORMATS.splice(index, 1);
    }
  };
};

/** Code for the selection in the given format (+ its size, which OBJ needs to come back at the right scale). */
export const codeFromSelection = (editor: Editor, formatId: string) => {
  const format = findCodeFormat(formatId);
  if (!format) {
    throw new Error(t('codeExport.unknown', { id: formatId }));
  }
  const scene = sceneFromSelection(editor);
  if (isEmpty(scene.root)) {
    throw new Error(t('codeExport.nothing'));
  }
  return { code: format.generate(scene), size: sceneSize(scene) };
};

/** Converts code from one format into another by running it in a sandbox (the real model stays untouched). */
export const convertCode = async (editor: Editor, fromId: string, code: string, toId: string, options: CodeOptions = {}) => {
  const from = findCodeFormat(fromId),
    to = findCodeFormat(toId);
  if (!from?.evaluate) {
    throw new Error(t('codeExport.cannotConvert', { format: localize(from?.label ?? fromId) }));
  }
  if (!to) {
    throw new Error(t('codeExport.unknown', { id: toId }));
  }
  const sandbox = createSandbox(editor);
  await from.evaluate(code, sandbox, options);
  const root = emptyGroup('Code');
  collect(sandbox.model.root, new THREE.Matrix4(), root);
  if (isEmpty(root)) {
    throw new Error(t('codeExport.noFaces'));
  }
  const scene: CodeScene = { title: from.label, materials: usedMaterials(root, sandbox.model), root };
  return { code: to.generate(scene), size: sceneSize(scene) };
};

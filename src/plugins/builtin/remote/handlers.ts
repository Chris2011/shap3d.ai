import * as THREE from 'three';
import type { Editor } from '../../../engine/editor';
import { COMMANDS, clearAll, exportFile, findCommand, runCommand, type ExportKind } from '../../../engine/commands';
import { GroupHandle, ScriptApi, runJson, runScript, type Pt } from '../../../scripting/api';
import { catalogText } from '../../../scripting/catalog';
import type { Entities, Instance } from '../../../core/model';
import { localize } from '../../../i18n';
import { EXPORT_FORMATS, SHAPES, VIEWS } from './server/actions';

// i18n-ignore-start – answers of the remote API go to programs and AI agents, not to the user interface

/** an action that failed – `status` becomes the HTTP status of the REST answer */
export class RemoteFailure extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** what an action answers: JSON, or a file that the dev server passes on */
export type RemoteResult = { kind: 'json'; value: unknown } | { kind: 'file'; name: string; mimeType: string; data: Blob | string };

type Input = Record<string, any>;
type Vector = [number, number, number];

const round = (value: number) => Math.round(value * 1e6) / 1e6;
const vector = (point: THREE.Vector3): Vector => [round(point.x), round(point.y), round(point.z)];
const boxInfo = (box: THREE.Box3) =>
  box.isEmpty() ? null : { min: vector(box.min), max: vector(box.max), size: vector(box.getSize(new THREE.Vector3())) };
const json = (value: unknown): RemoteResult => ({ kind: 'json', value });

const isPoint = (value: unknown): value is Vector =>
  Array.isArray(value) && value.length === 3 && value.every((coordinate) => typeof coordinate === 'number' && Number.isFinite(coordinate));
const pointInput = (value: unknown, name: string, fallback?: Vector): Vector => {
  if (value === undefined && fallback) {
    return fallback;
  }
  if (!isPoint(value)) {
    throw new RemoteFailure(`"${name}" must be [x, y, z] (numbers in metres)`);
  }
  return value;
};

/** a group/component, its parent entities and the world matrix of that parent – searched through the whole model */
const findInstance = (editor: Editor, id: number) => {
  const search = (
    entities: Entities,
    parentWorld: THREE.Matrix4,
  ): { instance: Instance; parent: Entities; parentWorld: THREE.Matrix4 } | null => {
    const direct = entities.instances.get(id);
    if (direct) {
      return { instance: direct, parent: entities, parentWorld };
    }
    for (const instance of entities.instances.values()) {
      const found = search(instance.definition.entities, parentWorld.clone().multiply(instance.matrix));
      if (found) {
        return found;
      }
    }
    return null;
  };
  const found = search(editor.model.root, new THREE.Matrix4());
  if (!found) {
    throw new RemoteFailure(`No group or component with id ${id}`, 404);
  }
  return found;
};

/** a group/component as plain JSON; `depth` levels of children are listed, deeper ones only counted */
const describeInstance = (instance: Instance, parentWorld: THREE.Matrix4, depth: number): Record<string, unknown> => {
  const world = parentWorld.clone().multiply(instance.matrix);
  const definition = instance.definition;
  const position = new THREE.Vector3(),
    rotation = new THREE.Quaternion(),
    scale = new THREE.Vector3();
  instance.matrix.decompose(position, rotation, scale);
  const euler = new THREE.Euler().setFromQuaternion(rotation, 'XYZ');
  const children = [...definition.entities.instances.values()];
  return {
    id: instance.id,
    name: instance.name || definition.name,
    type: definition.isComponent ? 'component' : 'group',
    definition: definition.name,
    material: instance.material ?? null,
    tag: instance.tag ?? null,
    hidden: !!instance.hidden,
    position: vector(position),
    rotationDegrees: [euler.x, euler.y, euler.z].map((angle) => round(THREE.MathUtils.radToDeg(angle))),
    scale: vector(scale),
    bounds: boxInfo(definition.entities.bounds(new THREE.Box3(), world)),
    ...definition.entities.stats(),
    ...(definition.shape ? { shape: definition.shape } : {}),
    ...(depth > 0
      ? { children: children.map((child) => describeInstance(child, world, depth - 1)) }
      : children.length
        ? { childCount: children.length }
        : {}),
  };
};

const listObjects = (editor: Editor, depth: number) =>
  [...editor.model.root.instances.values()].map((instance) => describeInstance(instance, new THREE.Matrix4(), depth));

const flatObjects = (editor: Editor) => {
  const result: Record<string, unknown>[] = [];
  const walk = (entities: Entities, parentWorld: THREE.Matrix4, parentId: number | null) => {
    for (const instance of entities.instances.values()) {
      const { children: _children, childCount: _count, ...info } = describeInstance(instance, parentWorld, 0);
      result.push({ ...info, parent: parentId });
      walk(instance.definition.entities, parentWorld.clone().multiply(instance.matrix), instance.id);
    }
  };
  walk(editor.model.root, new THREE.Matrix4(), null);
  return result;
};

const materialList = (editor: Editor) =>
  editor.model.materials.map((material) => ({
    name: material.name,
    color: material.color,
    opacity: material.opacity,
    ...(material.texture ? { texture: material.texture } : {}),
  }));

const historyInfo = (editor: Editor) => ({
  canUndo: editor.ui.canUndo,
  canRedo: editor.ui.canRedo,
  undo: editor.ui.undoLabel ? localize(editor.ui.undoLabel) : null,
  redo: editor.ui.redoLabel ? localize(editor.ui.redoLabel) : null,
});

const cameraInfo = (editor: Editor) => {
  const state = editor.viewer.rig.getState();
  return { position: state.position.map(round), target: state.target.map(round), fov: round(state.fov), ortho: state.ortho };
};

/** runs the frame loop once, so geometry built a moment ago is in the picture even in a background tab */
const renderNow = (editor: Editor) => {
  editor.viewer.onFrame?.();
  editor.viewer.render();
};

// ------------------------------------------------------------ objects

const createObject = (editor: Editor, input: Input) => {
  const shape = String(input.shape ?? '');
  const position = pointInput(input.position, 'position', [0, 0, 0]);
  const radius = input.radius ?? 0.5;
  const height = input.height ?? 1;
  const roundOptions = { segments: input.segments };
  if (!(SHAPES as readonly string[]).includes(shape)) {
    throw new RemoteFailure(`Unknown shape "${shape}" – ${SHAPES.join(', ')}`);
  }
  const handle = editor.commit('remote.undo.create', () => {
    const api = new ScriptApi(editor, editor.model.root);
    const materialName = input.color ? api.material(String(input.material ?? input.color), String(input.color)) : input.material;
    let created: unknown;
    switch (shape) {
      case 'box':
        created = api.box(position, input.width ?? 1, input.depth ?? 1, height);
        break;
      case 'wedge':
        created = api.wedge(position, input.width ?? 1, input.depth ?? 1, height);
        break;
      case 'cylinder':
        created = api.cylinder(position, radius, height, roundOptions);
        break;
      case 'sphere':
        created = api.sphere(position, radius, roundOptions);
        break;
      case 'dome':
        created = api.dome(position, radius, roundOptions);
        break;
      case 'cone':
        created = api.cone(position, radius, height, { ...roundOptions, endRadius: input.topRadius ?? 0 });
        break;
      case 'pyramid':
        created = api.pyramid(position, radius, height, { sides: input.sides ?? 4 });
        break;
      case 'prism':
        created = api.prism(position, radius, height, { sides: input.sides ?? 6 });
        break;
      case 'tube':
        created = api.tube(position, radius, input.innerRadius ?? api.length(radius) * 0.75, height, roundOptions);
        break;
      case 'torus':
        created = api.torus(position, radius, input.innerRadius ?? api.length(radius) / 4, {
          segments: input.segments,
          sides: input.sides,
        });
        break;
      default:
        throw new RemoteFailure(`Unknown shape "${shape}"`);
    }
    if (!(created instanceof GroupHandle)) {
      throw new RemoteFailure(`Could not build the ${shape}`);
    }
    if (input.name) {
      created.inst.name = String(input.name);
    }
    if (materialName) {
      created.material(String(materialName));
    }
    return created;
  });
  return describeInstance(handle.inst, new THREE.Matrix4(), 0);
};

const updateObject = (editor: Editor, input: Input) => {
  const { instance, parent, parentWorld } = findInstance(editor, Number(input.id));
  editor.commit('remote.undo.change', () => {
    const handle = new GroupHandle(new ScriptApi(editor, parent), parent, instance);
    if (input.moveTo !== undefined) {
      handle.moveTo(pointInput(input.moveTo, 'moveTo'));
    }
    if (input.move !== undefined) {
      handle.move(pointInput(input.move, 'move'));
    }
    if (input.rotate !== undefined) {
      const { degrees, axis = 'z', center } = input.rotate ?? {};
      if (typeof degrees !== 'number') {
        throw new RemoteFailure('"rotate.degrees" must be a number');
      }
      handle.rotate(degrees, String(axis), center === undefined ? undefined : (pointInput(center, 'rotate.center') as Pt));
    }
    if (input.scale !== undefined) {
      handle.scale(typeof input.scale === 'number' ? input.scale : pointInput(input.scale, 'scale'));
    }
    if (input.name !== undefined) {
      instance.name = String(input.name);
    }
    if (input.material !== undefined) {
      if (input.material) {
        handle.material(String(input.material));
      } else {
        instance.material = undefined;
      }
    }
    if (input.hidden !== undefined) {
      instance.hidden = !!input.hidden;
    }
  });
  return describeInstance(instance, parentWorld, 0);
};

const deleteObject = (editor: Editor, input: Input) => {
  const { instance, parent } = findInstance(editor, Number(input.id));
  if (editor.activePath.includes(instance)) {
    editor.setContext([]);
  }
  editor.commit('remote.undo.delete', () => {
    parent.instances.delete(instance.id);
  });
  editor.pruneSelection();
  editor.selectionChanged();
  return { deleted: instance.id };
};

/**
 * A PNG of the view. A tab in the background (or a hidden viewport) has a canvas of 1×1 px – then, or when
 * `width`/`height` are given, the view is rendered once at that size and the viewport gets its size back.
 */
const screenshot = async (editor: Editor, input: Input): Promise<RemoteResult> => {
  const viewer = editor.viewer;
  const previous = { width: viewer.width, height: viewer.height };
  const tooSmall = previous.width < 16 || previous.height < 16;
  const size = (value: unknown, fallback: number) => Math.round(Math.min(4096, Math.max(16, Number(value) || fallback)));
  const width = size(input.width, tooSmall ? 1280 : previous.width);
  const height = size(input.height, tooSmall ? 800 : previous.height);
  const resized = width !== previous.width || height !== previous.height;
  if (resized) {
    viewer.resize(width, height);
  }
  try {
    renderNow(editor);
    return { kind: 'file', ...(await exportFile(editor, 'png')) };
  } finally {
    if (resized) {
      viewer.resize(previous.width, previous.height);
    }
  }
};

// ------------------------------------------------------------ the actions
const HANDLERS: Record<string, (editor: Editor, input: Input) => RemoteResult | Promise<RemoteResult>> = {
  scene: (editor, input) => {
    const model = editor.model;
    return json({
      name: model.name,
      units: model.settings.units,
      ...model.root.stats(),
      bounds: boxInfo(model.bounds()),
      looseGeometry: { faces: model.root.faces.size, edges: model.root.edges.size },
      objects: listObjects(editor, Math.max(0, Number(input.depth ?? 2))),
      materials: materialList(editor),
      tags: model.tags.map((tag) => ({ name: tag.name, visible: tag.visible })),
      selection: editor.selected(),
      openGroup: editor.ui.contextName || null,
      history: historyInfo(editor),
      saved: editor.ui.saved,
    });
  },
  'objects.list': (editor, input) => json(input.recursive ? flatObjects(editor) : listObjects(editor, 0)),
  'objects.get': (editor, input) => {
    const { instance, parentWorld } = findInstance(editor, Number(input.id));
    return json(describeInstance(instance, parentWorld, 1));
  },
  'objects.create': (editor, input) => json(createObject(editor, input)),
  'objects.update': (editor, input) => json(updateObject(editor, input)),
  'objects.delete': (editor, input) => json(deleteObject(editor, input)),

  'materials.list': (editor) => json(materialList(editor)),
  'materials.create': (editor, input) => {
    editor.commit('remote.undo.material', () => {
      new ScriptApi(editor).material(String(input.name), String(input.color), {
        opacity: input.opacity ?? 1,
        ...(input.texture !== undefined ? { texture: String(input.texture) } : {}),
      });
    });
    return json(materialList(editor).find((material) => material.name === input.name));
  },

  'script.run': (editor, input) => {
    const code = String(input.code ?? '');
    const result = input.language === 'json' ? runJson(editor, code) : runScript(editor, code, 'remote.undo.script');
    if (!result.ok) {
      throw new RemoteFailure(`Script error: ${result.error}${result.logs.length ? '\nLog: ' + JSON.stringify(result.logs) : ''}`);
    }
    return json({ ok: true, logs: result.logs, durationMs: Math.round(result.durationMs), objects: editor.model.root.instances.size });
  },
  'script.reference': () => json({ reference: catalogText() }),

  undo: (editor) => {
    editor.undo();
    return json(historyInfo(editor));
  },
  redo: (editor) => {
    editor.redo();
    return json(historyInfo(editor));
  },

  'model.clear': (editor) => {
    clearAll(editor);
    return json(historyInfo(editor));
  },
  'model.get': (editor) => json(editor.model.toJSON()),
  'model.load': (editor, input) => {
    if (!input || typeof input !== 'object' || !input.root) {
      throw new RemoteFailure('Expected a .shap3d.json document (with "root")');
    }
    editor.loadJSON(input);
    return json({ name: editor.model.name, ...editor.model.root.stats() });
  },

  export: async (editor, input) => {
    const format = String(input.format) as ExportKind;
    if (!(EXPORT_FORMATS as readonly string[]).includes(format)) {
      throw new RemoteFailure(`Unknown format "${format}" – ${EXPORT_FORMATS.join(', ')}`);
    }
    const file = await exportFile(editor, format);
    return { kind: 'file', ...file };
  },
  screenshot: (editor, input) => screenshot(editor, input),

  'camera.get': (editor) => json(cameraInfo(editor)),
  'camera.set': (editor, input) => {
    const rig = editor.viewer.rig;
    if (input.position !== undefined || input.target !== undefined || input.fov !== undefined || input.ortho !== undefined) {
      const state = rig.getState();
      rig.applyState(
        {
          position: input.position !== undefined ? pointInput(input.position, 'position') : state.position,
          target: input.target !== undefined ? pointInput(input.target, 'target') : state.target,
          fov: typeof input.fov === 'number' ? input.fov : state.fov,
          ortho: input.ortho !== undefined ? !!input.ortho : state.ortho,
        },
        false,
      );
      rig.syncOrtho();
      editor.ui.projection = rig.isOrtho ? 'ortho' : 'persp';
    }
    if (input.view !== undefined) {
      if (!(VIEWS as readonly string[]).includes(input.view)) {
        throw new RemoteFailure(`Unknown view "${input.view}"`);
      }
      rig.standardView(input.view, editor.model.bounds(), false);
    }
    if (input.zoomExtents) {
      editor.zoomExtents(false);
    }
    editor.redraw();
    return json(cameraInfo(editor));
  },
  'camera.zoomExtents': (editor) => {
    editor.zoomExtents(false);
    editor.redraw();
    return json(cameraInfo(editor));
  },

  'commands.list': (editor) =>
    json(
      COMMANDS.map((command) => ({
        id: command.id,
        label: command.label,
        group: command.group,
        ...(command.shortcut ? { shortcut: command.shortcut } : {}),
        enabled: !command.enabled || command.enabled(editor),
        ...(command.checked ? { checked: command.checked(editor) } : {}),
      })),
    ),
  'commands.run': (editor, input) => {
    const command = findCommand(String(input.id));
    if (!command) {
      throw new RemoteFailure(`Unknown command "${input.id}" – see list_commands`, 404);
    }
    if (command.enabled && !command.enabled(editor)) {
      throw new RemoteFailure(`Command "${command.id}" is not available right now`);
    }
    runCommand(editor, command.id);
    return json({ ran: command.id, history: historyInfo(editor) });
  },
};

/** runs one action of the remote API against the editor */
export const handleRemoteAction = async (editor: Editor, action: string, input: Input): Promise<RemoteResult> => {
  const handler = HANDLERS[action];
  if (!handler) {
    throw new RemoteFailure(`Unknown action "${action}" – is the app older than the dev server? Reload the tab.`, 404);
  }
  return handler(editor, input ?? {});
};

// i18n-ignore-end

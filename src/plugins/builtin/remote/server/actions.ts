/**
 * The actions of the remote API – one list for REST (method + path), OpenAPI and the MCP tools.
 * The work itself happens in the open app (../handlers.ts); this file only describes it.
 * It has no Node imports, so the app side uses the same lists (shapes, formats, views).
 */

export type JsonSchema = Record<string, unknown>;

export interface RemoteAction {
  /** id the app handles, e.g. "objects.create" */
  id: string;
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  /** OpenAPI style, e.g. "/objects/{id}" (below /api) */
  path: string;
  /** name of the MCP tool – none: REST only */
  tool?: string;
  summary: string;
  description: string;
  tag: string;
  /** all parameters as one object schema; path parameters are listed in `path`, GET/DELETE take the rest as query */
  input?: JsonSchema;
  /** the answer is a file (export, screenshot) instead of JSON */
  binary?: { mimeTypes: string[] };
  readOnly?: boolean;
  destructive?: boolean;
  /** answered by the dev server itself, without the app */
  local?: boolean;
}

// ------------------------------------------------------------ shared schema pieces
const length = {
  oneOf: [{ type: 'number' }, { type: 'string' }],
  description: 'Length: a number in metres or a string with unit, e.g. "50cm", "1200mm", "3\'6\\""',
};
const point = { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3, description: '[x, y, z] in metres (Z is up)' };
const objectId = { type: 'integer', description: 'Object id (instance id of a group or component, see GET /api/objects)' };

export const SHAPES = ['box', 'cylinder', 'sphere', 'cone', 'pyramid', 'prism', 'tube', 'torus', 'wedge', 'dome'] as const;
export const EXPORT_FORMATS = ['glb', 'gltf', 'obj', 'stl', 'json'] as const;
export const VIEWS = ['top', 'bottom', 'front', 'back', 'left', 'right', 'iso'] as const;

export const EXPORT_MIME_TYPES: Record<(typeof EXPORT_FORMATS)[number] | 'png', string> = {
  glb: 'model/gltf-binary',
  gltf: 'model/gltf+json',
  obj: 'text/plain',
  stl: 'model/stl',
  json: 'application/json',
  png: 'image/png',
};

export const ACTIONS: RemoteAction[] = [
  {
    id: 'status',
    method: 'GET',
    path: '/status',
    tool: 'app_status',
    tag: 'App',
    readOnly: true,
    local: true,
    summary: 'Connection status',
    description: 'Whether a Shap3D.ai tab is connected to the dev server (the API needs one open tab of the app).',
  },
  {
    id: 'scene',
    method: 'GET',
    path: '/scene',
    tool: 'get_scene',
    tag: 'Scene',
    readOnly: true,
    summary: 'Scene overview',
    description:
      'Model name, units, face/edge counts, bounds, materials, tags, the object tree (groups and components), selection and undo state.',
    input: {
      type: 'object',
      properties: { depth: { type: 'integer', minimum: 0, default: 2, description: 'How many levels of nested groups to list' } },
    },
  },
  {
    id: 'objects.list',
    method: 'GET',
    path: '/objects',
    tool: 'list_objects',
    tag: 'Objects',
    readOnly: true,
    summary: 'List objects',
    description: 'Groups and components of the model with id, name, material, position and world bounds.',
    input: { type: 'object', properties: { recursive: { type: 'boolean', default: false, description: 'Include nested groups' } } },
  },
  {
    id: 'objects.get',
    method: 'GET',
    path: '/objects/{id}',
    tool: 'get_object',
    tag: 'Objects',
    readOnly: true,
    summary: 'Get one object',
    description:
      'Details of a group or component: transform, bounds, material, face/edge counts, children and – for shapes made by the API – how it was built.',
    input: { type: 'object', required: ['id'], properties: { id: objectId } },
  },
  {
    id: 'objects.create',
    method: 'POST',
    path: '/objects',
    tool: 'create_object',
    tag: 'Objects',
    summary: 'Create a solid',
    description:
      'Builds a solid as its own group in the model root (one undo step). `position` is the corner for box/wedge and the centre of the base for all other shapes. Lengths in metres or with unit ("50cm").',
    input: {
      type: 'object',
      required: ['shape'],
      properties: {
        shape: { type: 'string', enum: [...SHAPES] },
        position: { ...point, default: [0, 0, 0] },
        width: { ...length, description: 'box, wedge: size along X (default 1)' },
        depth: { ...length, description: 'box, wedge: size along Y (default 1)' },
        height: { ...length, description: 'box, wedge, cylinder, cone, pyramid, prism, tube: height (default 1)' },
        radius: {
          ...length,
          description: 'cylinder, sphere, cone, pyramid, prism, tube (outer), torus (major), dome: radius (default 0.5)',
        },
        innerRadius: { ...length, description: 'tube: inner radius; torus: tube radius (default radius / 4)' },
        topRadius: { ...length, description: 'cone: radius at the top (0 = pointed, default)' },
        sides: { type: 'integer', minimum: 3, description: 'pyramid (4), prism (6): number of sides' },
        segments: { type: 'integer', minimum: 3, description: 'round shapes: segments around (default 24)' },
        name: { type: 'string', description: 'Group name' },
        material: {
          type: 'string',
          description: 'Material name – a library material (e.g. "Holz hell", "Glas") or a new one, see `color`',
        },
        color: {
          type: 'string',
          description: 'CSS colour, e.g. "#e53935" – creates/updates the material (name: `material` or the colour)',
        },
      },
    },
  },
  {
    id: 'objects.update',
    method: 'PATCH',
    path: '/objects/{id}',
    tool: 'transform_object',
    tag: 'Objects',
    summary: 'Move, rotate, scale or restyle an object',
    description:
      "Changes a group or component in one undo step. Steps run in this order: moveTo, move, rotate, scale, then name/material/hidden. Coordinates are in the parent's system (the model for top-level objects).",
    input: {
      type: 'object',
      required: ['id'],
      properties: {
        id: objectId,
        moveTo: { ...point, description: 'New origin of the object' },
        move: { ...point, description: 'Offset to move by' },
        rotate: {
          type: 'object',
          required: ['degrees'],
          description: 'Rotation around the object origin (or `center`)',
          properties: { degrees: { type: 'number' }, axis: { type: 'string', enum: ['x', 'y', 'z'], default: 'z' }, center: point },
        },
        scale: { oneOf: [{ type: 'number' }, point], description: 'Uniform factor or [sx, sy, sz] around the object origin' },
        name: { type: 'string' },
        material: { type: 'string', description: 'Material name ("" removes it)' },
        hidden: { type: 'boolean' },
      },
    },
  },
  {
    id: 'objects.delete',
    method: 'DELETE',
    path: '/objects/{id}',
    tool: 'delete_object',
    tag: 'Objects',
    destructive: true,
    summary: 'Delete an object',
    description: 'Removes a group or component (undoable).',
    input: { type: 'object', required: ['id'], properties: { id: objectId } },
  },
  {
    id: 'materials.list',
    method: 'GET',
    path: '/materials',
    tool: 'list_materials',
    tag: 'Materials',
    readOnly: true,
    summary: 'List materials',
    description: 'Materials of the model with colour, opacity and texture.',
  },
  {
    id: 'materials.create',
    method: 'POST',
    path: '/materials',
    tool: 'create_material',
    tag: 'Materials',
    summary: 'Create or update a material',
    description: 'Creates a material (or changes colour/opacity of an existing one) – one undo step.',
    input: {
      type: 'object',
      required: ['name', 'color'],
      properties: {
        name: { type: 'string' },
        color: { type: 'string', description: 'CSS colour, e.g. "#1e88e5"' },
        opacity: { type: 'number', minimum: 0, maximum: 1, default: 1 },
        texture: {
          type: 'string',
          description:
            'Optional procedural texture: holz, ziegel, stein, gras, fliesen, beton, metall, stoff, wasser, marmor, dach, parkett',
        },
      },
    },
  },
  {
    id: 'script.run',
    method: 'POST',
    path: '/script',
    tool: 'run_script',
    tag: 'Script',
    summary: 'Run an s3d script',
    description:
      'Runs JavaScript with the `s3d` API (or the declarative JSON format) as one undo step and returns logs, errors and the return value. Call `get_script_reference` for the API. Example: `s3d.box([0,0,0], 2, 1, 0.75, { material: "Holz hell" })`.',
    input: {
      type: 'object',
      required: ['code'],
      properties: {
        code: { type: 'string', description: 'Script source' },
        language: { type: 'string', enum: ['javascript', 'json'], default: 'javascript' },
      },
    },
  },
  {
    id: 'script.reference',
    method: 'GET',
    path: '/script/reference',
    tool: 'get_script_reference',
    tag: 'Script',
    readOnly: true,
    summary: 'Script API reference',
    description: 'Every `s3d` call with signature, description and example (plain text) – what `run_script` can use.',
  },
  {
    id: 'undo',
    method: 'POST',
    path: '/undo',
    tool: 'undo',
    tag: 'History',
    summary: 'Undo',
    description: 'Undoes the last step.',
  },
  {
    id: 'redo',
    method: 'POST',
    path: '/redo',
    tool: 'redo',
    tag: 'History',
    summary: 'Redo',
    description: 'Redoes the last undone step.',
  },
  {
    id: 'model.clear',
    method: 'POST',
    path: '/model/clear',
    tool: 'clear_model',
    tag: 'Model',
    destructive: true,
    summary: 'Clear the model',
    description: 'Deletes all geometry, groups, guides, dimensions and labels (undoable).',
  },
  {
    id: 'model.get',
    method: 'GET',
    path: '/model',
    tag: 'Model',
    readOnly: true,
    summary: 'Model as Shap3D JSON',
    description: 'The whole model in the native .shap3d.json format (same as File › Save).',
  },
  {
    id: 'model.load',
    method: 'PUT',
    path: '/model',
    tag: 'Model',
    destructive: true,
    summary: 'Load a model',
    description: 'Replaces the model with a .shap3d.json document (clears the undo history).',
    input: { type: 'object', description: 'A .shap3d.json document as returned by GET /api/model', additionalProperties: true },
  },
  {
    id: 'export',
    method: 'GET',
    path: '/export/{format}',
    tool: 'export_model',
    tag: 'Export',
    readOnly: true,
    summary: 'Export the model',
    description:
      'The model as GLB, glTF, OBJ, STL or Shap3D JSON (Y-up for the mesh formats, like File › Export). The MCP tool writes the file to `path` and returns where it went.',
    input: {
      type: 'object',
      required: ['format'],
      properties: {
        format: { type: 'string', enum: [...EXPORT_FORMATS] },
        path: {
          type: 'string',
          description: 'MCP only: file to write (absolute or relative to the project; default exports/<model>.<format>)',
        },
      },
    },
    binary: { mimeTypes: [...new Set(EXPORT_FORMATS.map((format) => EXPORT_MIME_TYPES[format]))] },
  },
  {
    id: 'screenshot',
    method: 'GET',
    path: '/screenshot',
    tool: 'screenshot',
    tag: 'Export',
    readOnly: true,
    summary: 'Screenshot of the viewport',
    description:
      'A PNG of the current view (as File › Export › PNG). The MCP tool returns it as an image. Without a size the viewport’s own size is used (1280×800 when the tab is in the background).',
    input: {
      type: 'object',
      properties: {
        width: { type: 'integer', minimum: 16, maximum: 4096, description: 'Image width in pixels' },
        height: { type: 'integer', minimum: 16, maximum: 4096, description: 'Image height in pixels' },
      },
    },
    binary: { mimeTypes: ['image/png'] },
  },
  {
    id: 'camera.get',
    method: 'GET',
    path: '/camera',
    tool: 'get_camera',
    tag: 'Camera',
    readOnly: true,
    summary: 'Camera',
    description: 'Camera position, target, field of view and projection.',
  },
  {
    id: 'camera.set',
    method: 'PUT',
    path: '/camera',
    tool: 'set_camera',
    tag: 'Camera',
    summary: 'Set the camera',
    description:
      'Either a standard `view`, `zoomExtents`, or `position` + `target` (and optionally `fov`, `ortho`). Applied without animation.',
    input: {
      type: 'object',
      properties: {
        view: { type: 'string', enum: [...VIEWS] },
        zoomExtents: { type: 'boolean', description: 'Fit the whole model into the view (after `view`)' },
        position: point,
        target: point,
        fov: { type: 'number', minimum: 5, maximum: 120 },
        ortho: { type: 'boolean', description: 'Parallel projection' },
      },
    },
  },
  {
    id: 'camera.zoomExtents',
    method: 'POST',
    path: '/camera/zoom-extents',
    tool: 'zoom_extents',
    tag: 'Camera',
    summary: 'Zoom extents',
    description: 'Fits the whole model into the view.',
  },
  {
    id: 'commands.list',
    method: 'GET',
    path: '/commands',
    tool: 'list_commands',
    tag: 'Commands',
    readOnly: true,
    summary: 'List app commands',
    description: 'All commands of the menu/command palette with id, label, group and whether they are enabled right now.',
  },
  {
    id: 'commands.run',
    method: 'POST',
    path: '/commands/{id}',
    tool: 'run_command',
    tag: 'Commands',
    summary: 'Run an app command',
    description:
      'Runs a menu/palette command by id (e.g. "selectAll", "makeGroup", "solid-union", "view-top"). Commands that open a file dialog or ask something need a person at the app.',
    input: { type: 'object', required: ['id'], properties: { id: { type: 'string', description: 'Command id from list_commands' } } },
  },
];

/** "/objects/{id}" → ["id"] */
export const pathParameters = (action: RemoteAction) => [...action.path.matchAll(/\{(\w+)\}/g)].map((match) => match[1]);

/** properties of the input schema */
export const inputProperties = (action: RemoteAction) => (action.input?.properties ?? {}) as Record<string, JsonSchema>;

/** GET and DELETE carry their parameters in the query, the others in a JSON body */
export const usesQuery = (action: RemoteAction) => action.method === 'GET' || action.method === 'DELETE';

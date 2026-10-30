import type * as THREE from 'three';
import type * as Vue from 'vue';
import type { Component } from 'vue';
import type { Editor, Tool } from '../engine/editor';
import type { PointTool } from '../tools/base';
import type { Overlay } from '../engine/overlay';
import type { RunResult, ScriptApi } from '../scripting/api';
import type { ScriptLanguage, ScriptCompletion, CompletionProvider } from '../scripting/languages';
import type { Definition, Entities, Instance } from '../core/model';
import type { DataChange, DataTarget, PluginDataFormat } from './pluginData';
import type { PluginAtmosphere, PluginLight } from '../engine/pluginLighting';
import type { ApiCategory } from '../scripting/catalog';
import type { ContextMenuEntry, TopBarButton } from './uiExtensions';
import type { ViewRequest, ViewLines } from '../engine/viewRender';
import type { LoadedScene } from './fileFormats';
import type { CodeFormat } from '../scripting/codeExport';
import type { LanguageInfo, MessageTree } from '../i18n';
export type { LanguageInfo, MessageTree, LanguageFile } from '../i18n';
export type { ScriptCompletion, CompletionRequest, CompletionKind, CompletionProvider } from '../scripting/languages';
export type { CodeFormat, CodeScene, CodeGroup, CodeFace, CodeOptions } from '../scripting/codeExport';
export type { ViewRequest, ViewLines, ViewLine } from '../engine/viewRender';
export type { DataChange, DataTarget, PluginDataFormat } from './pluginData';
export type { PluginLight, PluginAtmosphere } from '../engine/pluginLighting';

/**
 * A Shap3D.ai plugin: an ES module whose default export is this object.
 * Everything registered through the context in `activate` is removed again automatically
 * when the plugin is switched off – `deactivate` is only needed for extra clean-up.
 */
export interface S3dPlugin {
  /** unique, stable id, e.g. "my-grid-tools" */
  id: string;
  name: string;
  version?: string;
  description?: string;
  author?: string;
  /**
   * The plugin's texts per language, e.g. { en: { "my-plugin": { hello: "Hello" } }, de: { … } } (English is required, it is the fallback) – registered as soon as
   * the plugin is loaded (also while it is switched off, so name and description can be keys), removed when it is uninstalled.
   */
  messages?: Record<string, MessageTree>;
  activate: (context: PluginContext) => void | Promise<void>;
  deactivate?: () => void;
}

export type Disposer = () => void;

export interface PluginCommand {
  id: string;
  /** text or message key (see i18n) – a getter is read each time */
  label: string;
  /** main-menu group: 'file', 'edit', 'view', 'camera', 'solids' or 'plugins' (default); any other name only groups it in the palette */
  group?: string;
  /** only shown as a hint – plugins bind keys through tools (`key`) */
  shortcut?: string;
  icon?: string;
  keywords?: string;
  run: (editor: Editor) => void | Promise<void>;
  enabled?: (editor: Editor) => boolean;
  checked?: (editor: Editor) => boolean;
}

export interface PluginTool {
  id: string;
  /** text or message key */
  name: string;
  icon?: string;
  /** single key that activates the tool (ignored when another tool already uses it) */
  key?: string;
  create: (editor: Editor) => Tool;
}

export interface PluginPanel {
  id: string;
  /** text or message key */
  label: string;
  icon?: string;
  /** width in px (default 300) */
  width?: number;
  /** a Vue component … */
  component?: Component;
  /** … or plain DOM: fill `element`, optionally return a clean-up function */
  mount?: (element: HTMLElement) => void | Disposer;
  /** a tile in the right-hand bar: 'first' (top) or 'last'; without one, a command "Label…" opens the panel */
  tile?: 'first' | 'last';
  /** no padding and no scrolling – the component lays itself out (chat, editor) */
  flush?: boolean;
}

export interface PluginImporter {
  /** file extensions without dot, e.g. ["xyz", "pts"] */
  extensions: string[];
  label: string;
  /** does the whole import itself … */
  import?: (file: File, editor: Editor) => void | Promise<void>;
  /** … or only reads the file into a three.js scene; the app converts it to faces, guesses units, places it and makes it one undo step */
  loadScene?: (file: File) => Promise<LoadedScene>;
}

/**
 * A mode of the 3D model: the toolbar shows the mode's tools and the right-hand bar only its panels (e.g. a level
 * editor's tools for game objects). Tools and panels by full id ("select", "<plugin>.<id>") or the plugin's short id.
 */
export interface PluginMode {
  id: string;
  /** text or message key – shown in the switch in the top bar */
  label: string;
  icon?: string;
  /** the tools in the toolbar while the mode is on, in order – the first one is chosen on entering */
  tools: string[];
  /** the panels in the right-hand bar while the mode is on; without it all stay */
  panels?: string[];
  /** called after the mode is switched on / before it is switched off */
  enter?: (editor: Editor) => void;
  leave?: (editor: Editor) => void;
}

/** A workspace next to the 3D model: its component fills the window below the top bar while it is active. */
export interface PluginWorkspace {
  id: string;
  /** text or message key – shown in the switch in the top bar */
  label: string;
  icon?: string;
  component: Component;
}

export interface PluginExporter {
  id: string;
  label: string;
  /** file name including extension, e.g. "stueckliste.csv" */
  fileName: (editor: Editor) => string;
  mimeType?: string;
  export: (editor: Editor) => Blob | string | Promise<Blob | string>;
}

/** A polygon mesh: vertex positions and faces as lists of vertex indices (0-based). */
export interface PluginMesh {
  vertices: [number, number, number][];
  faces: number[][];
  /** optional material name per face (same order as `faces`; null = no material) */
  faceMaterials?: (string | null)[];
}

/** colour (CSS, e.g. "#ff0000") and opacity 0–1 of a material – optionally drawn with a shader (materials.registerShader) */
export interface PluginMaterial {
  color: string;
  opacity?: number;
  /** full shader id, e.g. "shaders.wood" */
  shader?: string;
  /** the shader's parameters – missing ones take its defaults */
  params?: Record<string, number | string>;
  /** metres one tile of the texture or shader covers */
  size?: number;
}

/** a parameter of a shader – a slider (number) or a colour picker (colour as "#rrggbb") in the Materials panel */
export interface PluginShaderParam {
  /** letters, digits and _ – the GLSL reads it as uniform `u_<name>` (float, or vec3 for colours) */
  name: string;
  /** text or message key */
  label: string;
  type: 'number' | 'color';
  default: number | string;
  min?: number;
  max?: number;
  step?: number;
}

/**
 * A surface shader for materials. `glsl` defines `vec3 s3dSurface(vec3 p, vec3 n, vec3 base)`: `p` is the point
 * in the object's own coordinates divided by the material's size (1 = one tile), `n` the face normal, `base` the
 * material colour – it returns the colour there. Colours are linear. Light, shadows, clipping and colour space stay
 * with the app; while the plugin is off, materials with the shader show their colour.
 */
export interface PluginShader {
  /** short id – the full id is "<plugin>.<id>" (what materials store) */
  id: string;
  /** text or message key */
  label: string;
  glsl: string;
  params?: PluginShaderParam[];
  /** metres one tile covers (default 1) */
  size?: number;
}

export interface PluginMeshOptions {
  /** name of the group that is created (meshes.add) */
  name?: string;
  /** factor from mesh units to metres, e.g. 0.001 for millimetres – default 1 */
  scale?: number;
  /** soften edges between faces flatter than this angle (deg) – default 20 */
  smooth?: number;
  /** materials used in `faceMaterials` that may not exist yet – created in the same undo step (meshes.add) */
  materials?: Record<string, PluginMaterial>;
}

export interface ScriptExtension {
  /** API reference category – default "Plugins" */
  category?: ApiCategory;
  /** title in the API reference – default "name (plugin)" */
  title?: string;
  /** what it returns, e.g. "Gruppe" */
  returns?: string;
  /** shown in the API reference */
  signature?: string;
  description?: string;
  example?: string;
}

export interface PluginContext {
  /** the running plugin */
  readonly plugin: { id: string; name: string };
  readonly editor: Editor;
  readonly THREE: typeof THREE;
  /** Vue's API (h, ref, computed, defineComponent …) for panels without a build step */
  readonly vue: typeof Vue;
  /** fresh id for guides, dimensions, labels … added directly to the model */
  newId: () => number;
  /** base classes for custom tools */
  readonly classes: { Tool: typeof Tool; PointTool: typeof PointTool };
  commands: {
    register: (command: PluginCommand) => Disposer;
    /** runs a command: the plugin's own by its short id, another plugin's by its full id, the app's by its id ("export-glb") */
    run: (id: string) => void;
  };
  tools: { register: (tool: PluginTool) => Disposer };
  panels: {
    register: (panel: PluginPanel) => Disposer;
    open: (id: string) => void;
    /** closes the open panel – with an id only when that one is open (the plugin's own by its short id) */
    close: (id?: string) => void;
  };
  icons: { register: (name: string, svgContent: string) => Disposer };
  script: {
    /** adds `s3d.<name>(...)`; `implementation` receives the script API as first argument */
    extend: (name: string, implementation: (api: ScriptApi, ...args: any[]) => unknown, info?: ScriptExtension) => Disposer;
    run: (code: string) => RunResult;
    /** an extra language in the script editor (language selector, examples, help) */
    registerLanguage: (language: ScriptLanguage) => Disposer;
    /** opens the script editor with this code */
    openInEditor: (language: string, code: string) => void;
    /** awaited by the script editor before a JavaScript script runs – e.g. to prepare what s3d.<extension>() needs */
    beforeRun: (prepare: (code: string) => void | Promise<void>) => Disposer;
    /**
     * code completion: suggestions for an option value – `{ font: '…' }` in JavaScript and `"font": "…"` in JSON.
     * `values` is asked each time the list opens, so it may change (e.g. fonts the user adds).
     */
    completeValues: (option: string, values: () => (string | ScriptCompletion)[]) => Disposer;
    /**
     * code completion for a script language (your own from registerLanguage, or another plugin's): `provider`
     * returns candidates for the cursor, the editor filters and ranks them by the word before the cursor
     */
    registerCompletions: (language: string, provider: CompletionProvider) => Disposer;
  };
  /** files shipped in the plugin package (folder install), by path relative to its package.json */
  assets: { list: () => string[]; blob: (path: string) => Blob | undefined; url: (path: string) => string };
  meshes: {
    /** builds a mesh into `entities` (e.g. `api.ents` inside a script extension); returns the number of faces */
    build: (entities: Entities, mesh: PluginMesh, options?: PluginMeshOptions) => number;
    /** adds a mesh as a new group to the current context – one undo step */
    add: (mesh: PluginMesh, options?: PluginMeshOptions) => void;
  };
  materials: {
    /** creates the material if the model doesn't have it yet (call inside editor.commit or a script for undo); returns its name */
    ensure: (name: string, material: PluginMaterial) => string;
    /** a shader that materials can use – listed with the textures in the Materials panel; returns its full id */
    registerShader: (shader: PluginShader) => string;
    /** a small picture of a material as the Materials panel shows it (CSS background value) */
    preview: (material: PluginMaterial) => string;
  };
  /**
   * Code formats for "Als Code öffnen ▸" (context menu) and "Umwandeln in…" (script editor).
   * `generate` writes a CodeScene (metres, Z up) as code; the optional `evaluate` builds code
   * into `sandbox.entities` so it can be converted into the other formats. The id should match
   * a script language (script.registerLanguage) so the code runs in the editor.
   */
  code: { registerFormat: (format: CodeFormat) => Disposer };
  files: { registerImporter: (importer: PluginImporter) => Disposer; registerExporter: (exporter: PluginExporter) => Disposer };
  overlay: { draw: (draw: (overlay: Overlay, editor: Editor) => void) => Disposer };
  events: {
    onToolChange: (listener: () => void) => Disposer;
    onNewModel: (listener: () => void) => Disposer;
    /**
     * plugin data changed (any plugin's, through `data` – not by undo, redo or opening a model): called at the end
     * of the undo step the change was made in, still inside it, so what the listener changes is undone with it
     */
    onDataChange: (listener: (change: DataChange) => void) => Disposer;
  };
  /** JSON storage, namespaced per plugin */
  storage: {
    get: <T>(key: string, fallback: T) => T;
    set: (key: string, value: unknown) => void;
    /** files the plugin keeps for the user in the browser (IndexedDB), by path – e.g. libraries or fonts */
    files: {
      list: () => Promise<{ path: string; size: number }[]>;
      get: (path: string) => Promise<Blob | undefined>;
      put: (path: string, file: Blob) => Promise<void>;
      remove: (path: string) => Promise<void>;
      clear: () => Promise<void>;
    };
  };
  ui: {
    toast: (message: string) => void;
    prompt: (title: string, value?: string) => Promise<string | null>;
    confirm: (title: string) => Promise<boolean>;
    /** an entry in the viewport's context menu */
    addContextMenuEntry: (entry: ContextMenuEntry) => Disposer;
    /** a floating window (Vue component, rendered once – it decides itself when it is visible) */
    addWindow: (component: Component) => Disposer;
    /** a button in the top bar next to the model name */
    addTopBarButton: (button: TopBarButton) => Disposer;
  };
  /**
   * Workspaces of their own next to the 3D model (e.g. sheets for plans): a switch in the top bar changes
   * between "Model" and the workspaces. While one is active, only Ctrl+Z/Y/S and the command palette stay global keys.
   */
  workspaces: {
    register: (workspace: PluginWorkspace) => Disposer;
    /** shows a workspace of this plugin (by id), or the 3D model with null */
    open: (id: string | null) => void;
    /** the active workspace's full id ("<plugin>.<id>"), null = the 3D model */
    active: () => string | null;
  };
  /**
   * Modes of the 3D model: a switch in the top bar (with the workspaces) changes the toolbar and the right-hand bar
   * to a plugin's own set of tools and panels, the 3D view stays.
   */
  modes: {
    register: (mode: PluginMode) => Disposer;
    /** switches a mode of this plugin on (by id), or back to the usual 3D model with null */
    open: (id: string | null) => void;
    /** the active mode's full id ("<plugin>.<id>"), null = none */
    active: () => string | null;
  };
  /**
   * Lights and atmosphere in the 3D view (a level's lamps, a torch, fog, a dark night): while any are set, faces are
   * drawn lit so the lights fall on them. They belong to the view, not to the model – they go when the plugin stops.
   */
  lighting: {
    /**
     * the plugin's lights (replaces its earlier ones; the same number and kinds are updated in place, e.g. every frame);
     * `shadow: true` lets one cast shadows – the first four in the view
     */
    set: (lights: PluginLight[]) => void;
    /** fog, daylight (0 … 1) and background – null gives the view back to the model's style */
    atmosphere: (atmosphere: PluginAtmosphere | null) => void;
  };
  /** what the 3D view shows for now, without changing the model */
  display: {
    /** shows an instance at another place (its matrix in its parent) – e.g. moving enemies in a test run; null puts it back */
    place: (instance: Instance, matrix: InstanceType<typeof THREE.Matrix4> | null) => void;
  };
  /**
   * A view of the model rendered on demand – camera, style, hidden tags, size and an optional drawing scale
   * (`orthoHeight`, metres from top to bottom) – without changing the viewport.
   */
  render: {
    /** as a PNG (data URL) */
    image: (request: ViewRequest) => string;
    /** as lines in pixels: visible edges and silhouettes, hidden parts removed (for vector output) */
    lines: (request: ViewRequest) => ViewLines;
  };
  /**
   * JSON data the plugin keeps on a group/component definition (all its copies), on one instance or on the model –
   * saved with the model, kept while the plugin is off (call the setters inside editor.commit or a script for undo)
   */
  data: {
    get: <T>(target: Definition | Instance) => T | undefined;
    set: (target: Definition | Instance, value: unknown) => void;
    /** data on the model itself */
    getModel: <T>() => T | undefined;
    setModel: (value: unknown) => void;
    /**
     * Data formats: data under a key (usually another plugin's) with a version and a check – declared by the plugin
     * it belongs to and by any plugin that reads or writes it, so neither needs the other running.
     */
    formats: {
      register: (format: PluginDataFormat) => Disposer;
      get: (id: string) => Omit<PluginDataFormat, 'validate'> | undefined;
    };
    /** the data of a format at a definition, instance or the model (null) – undefined if missing or not of its shape */
    read: <T>(format: string, target: DataTarget) => T | undefined;
    /** writes the data of a format (undefined removes it) – refused when it does not have the format's shape */
    write: (format: string, target: DataTarget, value: unknown) => void;
  };
  /**
   * Languages: texts as message keys (`t('my-plugin.hello', { name })`). A plugin brings its own texts – at least
   * English (the fallback) – in `messages` or with `addMessages('en', …)`, and may add more languages or whole language packs.
   * Labels, names and titles given to commands, tools, panels, buttons and menu entries may be keys – they follow the language.
   */
  i18n: {
    /** translates a key: current language → English → the key; `{name}` placeholders, "one | many" picks by `{count}` */
    t: (key: string, params?: Record<string, unknown>) => string;
    /** the active language code, e.g. "de" or "en" */
    language: () => string;
    languages: () => LanguageInfo[];
    /** texts for a language, nested ({ "my-plugin": { "hello": "Hallo {name}" } }) or flat ({ "my-plugin.hello": … }) */
    addMessages: (language: string, messages: MessageTree | Record<string, string>) => Disposer;
    /** a new language that can be chosen (optionally with its texts) */
    addLanguage: (info: LanguageInfo, messages?: MessageTree | Record<string, string>) => Disposer;
    /** switches the language (kept in the browser); '' = like the browser */
    setLanguage: (code: string) => void;
    onChange: (listener: (language: string) => void) => Disposer;
  };
  /** register any extra clean-up */
  onDispose: (disposer: Disposer) => void;
}

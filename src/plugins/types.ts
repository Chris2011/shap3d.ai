import type * as THREE from 'three';
import type * as Vue from 'vue';
import type { Component } from 'vue';
import type { Editor, Tool } from '../engine/editor';
import type { PointTool } from '../tools/base';
import type { Overlay } from '../engine/overlay';
import type { RunResult, ScriptApi } from '../scripting/api';
import type { ScriptLanguage, ScriptCompletion, CompletionProvider } from '../scripting/languages';
import type { Definition, Entities } from '../core/model';
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

/** colour (CSS, e.g. "#ff0000") and opacity 0–1 of a material */
export interface PluginMaterial {
  color: string;
  opacity?: number;
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
  commands: { register: (command: PluginCommand) => Disposer; run: (id: string) => void };
  tools: { register: (tool: PluginTool) => Disposer };
  panels: { register: (panel: PluginPanel) => Disposer; open: (id: string) => void };
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
  events: { onToolChange: (listener: () => void) => Disposer; onNewModel: (listener: () => void) => Disposer };
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
   * A view of the model rendered on demand – camera, style, hidden tags, size and an optional drawing scale
   * (`orthoHeight`, metres from top to bottom) – without changing the viewport.
   */
  render: {
    /** as a PNG (data URL) */
    image: (request: ViewRequest) => string;
    /** as lines in pixels: visible edges and silhouettes, hidden parts removed (for vector output) */
    lines: (request: ViewRequest) => ViewLines;
  };
  /** JSON data the plugin keeps on a group/component definition or on the model – saved with the model */
  data: {
    get: <T>(definition: Definition) => T | undefined;
    set: (definition: Definition, value: unknown) => void;
    /** data on the model itself (call setModel inside editor.commit for undo) */
    getModel: <T>() => T | undefined;
    setModel: (value: unknown) => void;
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

import type * as THREE from 'three';
import type * as Vue from 'vue';
import type { Component } from 'vue';
import type { Editor, Tool } from '../engine/editor';
import type { PointTool } from '../tools/base';
import type { Overlay } from '../engine/overlay';
import type { RunResult, ScriptApi } from '../scripting/api';
import type { ScriptLanguage } from '../scripting/languages';
import type { Entities } from '../core/model';

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
  activate: (context: PluginContext) => void | Promise<void>;
  deactivate?: () => void;
}

export type Disposer = () => void;

export interface PluginCommand {
  id: string;
  label: string;
  /** main-menu / palette group, default "Plugins" */
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
  name: string;
  icon?: string;
  /** single key that activates the tool (ignored when another tool already uses it) */
  key?: string;
  create: (editor: Editor) => Tool;
}

export interface PluginPanel {
  id: string;
  label: string;
  icon?: string;
  /** width in px (default 300) */
  width?: number;
  /** a Vue component … */
  component?: Component;
  /** … or plain DOM: fill `element`, optionally return a clean-up function */
  mount?: (element: HTMLElement) => void | Disposer;
}

export interface PluginImporter {
  /** file extensions without dot, e.g. ["xyz", "pts"] */
  extensions: string[];
  label: string;
  import: (file: File, editor: Editor) => void | Promise<void>;
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
export interface PluginMaterial { color: string; opacity?: number }

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
  /** shown in the API reference (category "Plugins") */
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
  ui: { toast: (message: string) => void; prompt: (title: string, value?: string) => Promise<string | null>; confirm: (title: string) => Promise<boolean> };
  /** register any extra clean-up */
  onDispose: (disposer: Disposer) => void;
}

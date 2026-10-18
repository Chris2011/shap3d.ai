import type * as THREE from 'three';
import type * as Vue from 'vue';
import type { Component } from 'vue';
import type { Editor, Tool } from '../engine/editor';
import type { PointTool } from '../tools/base';
import type { Overlay } from '../engine/overlay';
import type { RunResult, ScriptApi } from '../scripting/api';

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
  };
  files: { registerImporter: (importer: PluginImporter) => Disposer; registerExporter: (exporter: PluginExporter) => Disposer };
  overlay: { draw: (draw: (overlay: Overlay, editor: Editor) => void) => Disposer };
  events: { onToolChange: (listener: () => void) => Disposer; onNewModel: (listener: () => void) => Disposer };
  /** JSON storage, namespaced per plugin */
  storage: { get: <T>(key: string, fallback: T) => T; set: (key: string, value: unknown) => void };
  ui: { toast: (message: string) => void; prompt: (title: string, value?: string) => Promise<string | null>; confirm: (title: string) => Promise<boolean> };
  /** register any extra clean-up */
  onDispose: (disposer: Disposer) => void;
}

import { shallowReactive } from 'vue';
import { Editor } from './editor';
import { workspaceState } from '../plugins/uiExtensions';
import { SelectTool, LassoTool, EraserTool, PaintTool, SampleTool } from '../tools/select';
import { LineTool, FreehandTool, RectangleTool, RotatedRectangleTool, CircleTool, Arc2Tool, ArcCenterTool, Arc3Tool } from '../tools/draw';
import { PushPullTool, OffsetTool, MoveTool, RotateTool, ScaleTool, FollowMeTool } from '../tools/modify';
import {
  TapeTool,
  ProtractorTool,
  DimensionTool,
  TextTool,
  SectionTool,
  OrbitTool,
  PanTool,
  ZoomTool,
  ZoomWindowTool,
  LookAroundTool,
  WalkTool,
  PositionCameraTool,
} from '../tools/construct';
import { PlaceTool } from '../tools/place';
import { runCommand } from './commands';
import { installDefaults } from './defaults';
import { onThemeChange } from '../theme';
import { localized, shortcutLabel } from '../i18n';

export interface ToolInfo {
  id: string;
  name: string;
  key?: string;
  icon: string;
}

/** ids of tools contributed by plugins (shown as extra group in the expanded toolset) */
export const PLUGIN_TOOLS = shallowReactive<string[]>([]);

/** name = message `tools.<id>`, key shown in the current language */
const toolInfo = (id: string, icon: string, key?: string): ToolInfo => {
  const info = localized({ id, icon } as ToolInfo, 'name', `tools.${id}`);
  if (key) {
    Object.defineProperty(info, 'key', { get: () => shortcutLabel(key), enumerable: true, configurable: true });
  }
  return info;
};

export const TOOL_INFO: Record<string, ToolInfo> = {
  select: toolInfo('select', 'select', 'Space'),
  lasso: toolInfo('lasso', 'lasso'),
  eraser: toolInfo('eraser', 'eraser', 'E'),
  paint: toolInfo('paint', 'paint', 'B'),
  sample: toolInfo('sample', 'sample'),
  line: toolInfo('line', 'line', 'L'),
  freehand: toolInfo('freehand', 'freehand'),
  rectangle: toolInfo('rectangle', 'rectangle', 'R'),
  rotrect: toolInfo('rotrect', 'rotrect'),
  circle: toolInfo('circle', 'circle', 'C'),
  polygon: toolInfo('polygon', 'polygon'),
  arc: toolInfo('arc', 'arc'),
  arc2: toolInfo('arc2', 'arc2', 'A'),
  arc3: toolInfo('arc3', 'arc3'),
  pie: toolInfo('pie', 'pie'),
  pushpull: toolInfo('pushpull', 'pushpull', 'P'),
  offset: toolInfo('offset', 'offset', 'F'),
  move: toolInfo('move', 'move', 'M'),
  rotate: toolInfo('rotate', 'rotate', 'Q'),
  scale: toolInfo('scale', 'scale', 'S'),
  followme: toolInfo('followme', 'followme'),
  tape: toolInfo('tape', 'tape', 'T'),
  protractor: toolInfo('protractor', 'protractor'),
  dimension: toolInfo('dimension', 'dimension'),
  text: toolInfo('text', 'text'),
  section: toolInfo('section', 'section'),
  orbit: toolInfo('orbit', 'orbit', 'O'),
  pan: toolInfo('pan', 'pan', 'H'),
  zoom: toolInfo('zoom', 'zoom', 'Z'),
  zoomwindow: toolInfo('zoomwindow', 'zoomwindow'),
  poscam: toolInfo('poscam', 'poscam'),
  lookaround: toolInfo('lookaround', 'lookaround'),
  walk: toolInfo('walk', 'walk'),
  place: toolInfo('place', 'component'),
};

export const createEditor = (): Editor => {
  const editor = new Editor();
  const tools = [
    new SelectTool(editor),
    new LassoTool(editor),
    new EraserTool(editor),
    new PaintTool(editor),
    new SampleTool(editor),
    new LineTool(editor),
    new FreehandTool(editor),
    new RectangleTool(editor),
    new RotatedRectangleTool(editor),
    new CircleTool(editor),
    new CircleTool(editor, true),
    new Arc2Tool(editor),
    new ArcCenterTool(editor),
    new ArcCenterTool(editor, true),
    new Arc3Tool(editor),
    new PushPullTool(editor),
    new OffsetTool(editor),
    new MoveTool(editor),
    new RotateTool(editor),
    new ScaleTool(editor),
    new FollowMeTool(editor),
    new TapeTool(editor),
    new ProtractorTool(editor),
    new DimensionTool(editor),
    new TextTool(editor),
    new SectionTool(editor),
    new OrbitTool(editor),
    new PanTool(editor),
    new ZoomTool(editor),
    new ZoomWindowTool(editor),
    new LookAroundTool(editor),
    new WalkTool(editor),
    new PositionCameraTool(editor),
    new PlaceTool(editor),
  ];
  tools.forEach((tool) => editor.register(tool));
  installDefaults(editor);
  // edge colours and lights depend on day/night – rebuild the scene, not just redraw it
  onThemeChange(() => editor.invalidate());
  return editor;
};

/** single-key tool shortcuts (plugins may add free keys) */
export const TOOL_SHORTCUTS: Record<string, string> = {
  ' ': 'select',
  e: 'eraser',
  b: 'paint',
  l: 'line',
  a: 'arc2',
  r: 'rectangle',
  c: 'circle',
  p: 'pushpull',
  f: 'offset',
  m: 'move',
  q: 'rotate',
  s: 'scale',
  t: 'tape',
  o: 'orbit',
  h: 'pan',
  z: 'zoom',
};

/** Global keyboard handling: shortcuts, VCB typing, tool keys. */
export const installKeyboard = (editor: Editor, focusVcb: (initial: string) => void) => {
  const isTyping = (keyEvent: KeyboardEvent) => {
    const target = keyEvent.target as HTMLElement;
    return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
  };
  window.addEventListener('keydown', (keyEvent) => {
    if (editor.ui.dialog) {
      return;
    }
    if (isTyping(keyEvent)) {
      return;
    }
    const key = keyEvent.key;
    const ctrl = keyEvent.ctrlKey || keyEvent.metaKey;
    // a plugin's workspace handles its own keys – only undo/redo, save and the command palette stay global
    if (workspaceState.active && !(ctrl && ['z', 'y', 's', 'p', 'k'].includes(key.toLowerCase())) && key !== 'F1') {
      return;
    }
    // let the active tool react first (arrow locks, ctrl copy toggle, shift lock)
    if (editor.tool.onKey(keyEvent, true)) {
      keyEvent.preventDefault();
      editor.redraw();
      editor.refreshStatus();
      return;
    }
    if (ctrl) {
      const map: Record<string, string> = {
        z: 'undo',
        y: 'redo',
        c: 'copy',
        x: 'cut',
        v: 'paste',
        a: 'selectAll',
        t: 'selectNone',
        s: 'save',
        o: 'open',
        n: 'new',
      };
      const id =
        keyEvent.shiftKey && key.toLowerCase() === 'z'
          ? 'redo'
          : keyEvent.shiftKey && key.toLowerCase() === 'i'
            ? 'invertSel'
            : map[key.toLowerCase()];
      if (id) {
        keyEvent.preventDefault();
        runCommand(editor, id);
      }
      return;
    }
    if (key === 'Escape') {
      if (editor.tool.busy()) {
        editor.tool.cancel();
      } else if (editor.selection.size) {
        editor.clearSelection();
      } else if (editor.activePath.length) {
        editor.exitContext();
      } else if (editor.ui.tool !== 'select') {
        editor.setTool('select');
      }
      editor.refreshStatus();
      editor.redraw();
      keyEvent.preventDefault();
      return;
    }
    if (key === 'Delete' || key === 'Backspace') {
      if (!editor.ui.vcbValue || !editor.ui.vcbEditing) {
        runCommand(editor, 'delete');
        keyEvent.preventDefault();
      }
      return;
    }
    if (key === 'Enter' && editor.ui.vcbValue && editor.ui.vcbEditing) {
      return;
    }
    if (keyEvent.altKey && key.toLowerCase() === 'k') {
      runCommand(editor, 'xray');
      keyEvent.preventDefault();
      return;
    }
    if (keyEvent.shiftKey && key.toLowerCase() === 'z') {
      editor.zoomExtents();
      keyEvent.preventDefault();
      return;
    }
    if (keyEvent.altKey) {
      return;
    }
    // characters that start a measurement go into the VCB (also Arabic-Indic digits and separators)
    if (
      /^[0-9.,;\-+/*<[٠-٩۰-۹٫٬؛]$/.test(key) ||
      (editor.tool.busy() && /^[xs'"°\u0600-\u06ff]$/i.test(key)) ||
      ((key === 'x' || key === 's') && /^(move|rotate|circle|polygon|arc2|arc|pie)$/.test(editor.ui.tool))
    ) {
      keyEvent.preventDefault();
      focusVcb(key);
      return;
    }
    if (key.toLowerCase() === 'g' && !keyEvent.shiftKey) {
      keyEvent.preventDefault();
      runCommand(editor, 'makeComponent');
      return;
    }
    if (key.toLowerCase() === 'k' && !keyEvent.shiftKey) {
      editor.model.settings.style.backEdges = !editor.model.settings.style.backEdges;
      editor.invalidate();
      return;
    }
    const tool = TOOL_SHORTCUTS[key.toLowerCase()];
    if (tool && !keyEvent.shiftKey) {
      keyEvent.preventDefault();
      editor.setTool(tool);
      return;
    }
  });
  window.addEventListener('keyup', (keyEvent) => {
    if (isTyping(keyEvent) || editor.ui.dialog) {
      return;
    }
    if (editor.tool.onKey(keyEvent, false)) {
      editor.redraw();
    }
  });
};

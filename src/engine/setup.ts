import { shallowReactive } from 'vue';
import { Editor } from './editor';
import { SelectTool, LassoTool, EraserTool, PaintTool, SampleTool } from '../tools/select';
import { LineTool, FreehandTool, RectangleTool, RotatedRectangleTool, CircleTool, Arc2Tool, ArcCenterTool, Arc3Tool } from '../tools/draw';
import { PushPullTool, OffsetTool, MoveTool, RotateTool, ScaleTool, FollowMeTool } from '../tools/modify';
import { TapeTool, ProtractorTool, DimensionTool, TextTool, SectionTool, OrbitTool, PanTool, ZoomTool, ZoomWindowTool, LookAroundTool, WalkTool, PositionCameraTool } from '../tools/construct';
import { PlaceTool } from '../tools/place';
import { TerrainTool } from '../tools/terrain';
import { runCommand } from './commands';
import { installDefaults } from './defaults';
import { onThemeChange } from '../theme';

export interface ToolInfo { id: string; name: string; key?: string; icon: string }

/** ids of tools contributed by plugins (shown as extra group in the expanded toolset) */
export const PLUGIN_TOOLS = shallowReactive<string[]>([]);

export const TOOL_INFO: Record<string, ToolInfo> = {
  select: { id: 'select', name: 'Auswählen', key: 'Leertaste', icon: 'select' },
  lasso: { id: 'lasso', name: 'Lasso', icon: 'lasso' },
  eraser: { id: 'eraser', name: 'Radiergummi', key: 'E', icon: 'eraser' },
  paint: { id: 'paint', name: 'Farbeimer', key: 'B', icon: 'paint' },
  sample: { id: 'sample', name: 'Materialprobe entnehmen', icon: 'sample' },
  line: { id: 'line', name: 'Linie', key: 'L', icon: 'line' },
  freehand: { id: 'freehand', name: 'Freihand', icon: 'freehand' },
  rectangle: { id: 'rectangle', name: 'Rechteck', key: 'R', icon: 'rectangle' },
  rotrect: { id: 'rotrect', name: 'Gedrehtes Rechteck', icon: 'rotrect' },
  circle: { id: 'circle', name: 'Kreis', key: 'C', icon: 'circle' },
  polygon: { id: 'polygon', name: 'Vieleck', icon: 'polygon' },
  arc: { id: 'arc', name: 'Bogen', icon: 'arc' },
  arc2: { id: 'arc2', name: 'Zweipunktbogen', key: 'A', icon: 'arc2' },
  arc3: { id: 'arc3', name: 'Dreipunktbogen', icon: 'arc3' },
  pie: { id: 'pie', name: 'Kuchen', icon: 'pie' },
  pushpull: { id: 'pushpull', name: 'Drücken/Ziehen', key: 'P', icon: 'pushpull' },
  offset: { id: 'offset', name: 'Versatz', key: 'F', icon: 'offset' },
  move: { id: 'move', name: 'Verschieben', key: 'M', icon: 'move' },
  rotate: { id: 'rotate', name: 'Drehen', key: 'Q', icon: 'rotate' },
  scale: { id: 'scale', name: 'Skalieren', key: 'S', icon: 'scale' },
  followme: { id: 'followme', name: 'Folge mir', icon: 'followme' },
  tape: { id: 'tape', name: 'Maßband', key: 'T', icon: 'tape' },
  protractor: { id: 'protractor', name: 'Winkelmesser', icon: 'protractor' },
  dimension: { id: 'dimension', name: 'Abmessungen', icon: 'dimension' },
  text: { id: 'text', name: 'Text', icon: 'text' },
  section: { id: 'section', name: 'Schnittebene', icon: 'section' },
  orbit: { id: 'orbit', name: 'Orbit', key: 'O', icon: 'orbit' },
  pan: { id: 'pan', name: 'Schwenken', key: 'H', icon: 'pan' },
  zoom: { id: 'zoom', name: 'Zoomen', key: 'Z', icon: 'zoom' },
  zoomwindow: { id: 'zoomwindow', name: 'Zoombereich', icon: 'zoomwindow' },
  poscam: { id: 'poscam', name: 'Kamera positionieren', icon: 'poscam' },
  lookaround: { id: 'lookaround', name: 'Umsehen', icon: 'lookaround' },
  walk: { id: 'walk', name: 'Gehen', icon: 'walk' },
  place: { id: 'place', name: 'Platzieren', icon: 'component' },
  terrain: { id: 'terrain', name: 'Gelände (Sandkiste)', icon: 'terrain' },
};

export const createEditor = (): Editor => {
  const editor = new Editor();
  const tools = [
    new SelectTool(editor), new LassoTool(editor), new EraserTool(editor), new PaintTool(editor), new SampleTool(editor),
    new LineTool(editor), new FreehandTool(editor), new RectangleTool(editor), new RotatedRectangleTool(editor), new CircleTool(editor), new CircleTool(editor, true),
    new Arc2Tool(editor), new ArcCenterTool(editor), new ArcCenterTool(editor, true), new Arc3Tool(editor),
    new PushPullTool(editor), new OffsetTool(editor), new MoveTool(editor), new RotateTool(editor), new ScaleTool(editor), new FollowMeTool(editor),
    new TapeTool(editor), new ProtractorTool(editor), new DimensionTool(editor), new TextTool(editor), new SectionTool(editor),
    new OrbitTool(editor), new PanTool(editor), new ZoomTool(editor), new ZoomWindowTool(editor), new LookAroundTool(editor), new WalkTool(editor), new PositionCameraTool(editor),
    new PlaceTool(editor), new TerrainTool(editor),
  ];
  tools.forEach(tool => editor.register(tool));
  installDefaults(editor);
  // edge colours and lights depend on day/night – rebuild the scene, not just redraw it
  onThemeChange(() => editor.invalidate());
  return editor;
};

/** single-key tool shortcuts (plugins may add free keys) */
export const TOOL_SHORTCUTS: Record<string, string> = { ' ': 'select', e: 'eraser', b: 'paint', l: 'line', a: 'arc2', r: 'rectangle', c: 'circle', p: 'pushpull', f: 'offset', m: 'move', q: 'rotate', s: 'scale', t: 'tape', o: 'orbit', h: 'pan', z: 'zoom' };

/** Global keyboard handling: shortcuts, VCB typing, tool keys. */
export const installKeyboard = (editor: Editor, focusVcb: (initial: string) => void) => {
  const isTyping = (keyEvent: KeyboardEvent) => { const target = keyEvent.target as HTMLElement; return target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable); };
  window.addEventListener('keydown', keyEvent => {
    if (editor.ui.dialog) return;
    if (isTyping(keyEvent)) return;
    const key = keyEvent.key; const ctrl = keyEvent.ctrlKey || keyEvent.metaKey;
    // let the active tool react first (arrow locks, ctrl copy toggle, shift lock)
    if (editor.tool.onKey(keyEvent, true)) { keyEvent.preventDefault(); editor.redraw(); editor.refreshStatus(); return; }
    if (ctrl) {
      const map: Record<string, string> = { z: 'undo', y: 'redo', c: 'copy', x: 'cut', v: 'paste', a: 'selectAll', t: 'selectNone', s: 'save', o: 'open', n: 'new' };
      const id = keyEvent.shiftKey && key.toLowerCase() === 'z' ? 'redo' : keyEvent.shiftKey && key.toLowerCase() === 'i' ? 'invertSel' : map[key.toLowerCase()];
      if (id) { keyEvent.preventDefault(); runCommand(editor, id); }
      return;
    }
    if (key === 'Escape') { if (editor.tool.busy()) editor.tool.cancel(); else if (editor.selection.size) editor.clearSelection(); else if (editor.activePath.length) editor.exitContext(); else if (editor.ui.tool !== 'select') editor.setTool('select'); editor.refreshStatus(); editor.redraw(); keyEvent.preventDefault(); return; }
    if (key === 'Delete' || key === 'Backspace') { if (!editor.ui.vcbValue || !editor.ui.vcbEditing) { runCommand(editor, 'delete'); keyEvent.preventDefault(); } return; }
    if (key === 'Enter' && editor.ui.vcbValue && editor.ui.vcbEditing) { return; }
    if (keyEvent.altKey && key.toLowerCase() === 'k') { runCommand(editor, 'xray'); keyEvent.preventDefault(); return; }
    if (keyEvent.shiftKey && key.toLowerCase() === 'z') { editor.zoomExtents(); keyEvent.preventDefault(); return; }
    if (keyEvent.altKey) return;
    // characters that start a measurement go into the VCB
    if (/^[0-9.,;\-+\/*<\[]$/.test(key) || (editor.tool.busy() && /^[xs'"°]$/i.test(key)) || ((key === 'x' || key === 's') && /^(move|rotate|circle|polygon|arc2|arc|pie)$/.test(editor.ui.tool))) {
      keyEvent.preventDefault(); focusVcb(key); return;
    }
    if (key.toLowerCase() === 'g' && !keyEvent.shiftKey) { keyEvent.preventDefault(); runCommand(editor, 'makeComponent'); return; }
    if (key.toLowerCase() === 'k' && !keyEvent.shiftKey) { editor.model.settings.style.backEdges = !editor.model.settings.style.backEdges; editor.invalidate(); return; }
    const tool = TOOL_SHORTCUTS[key.toLowerCase()];
    if (tool && !keyEvent.shiftKey) { keyEvent.preventDefault(); editor.setTool(tool); return; }
  });
  window.addEventListener('keyup', keyEvent => { if (isTyping(keyEvent) || editor.ui.dialog) return; if (editor.tool.onKey(keyEvent, false)) { editor.redraw(); } });
};

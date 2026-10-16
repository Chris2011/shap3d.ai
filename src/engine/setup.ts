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

export function createEditor(): Editor {
  const ed = new Editor();
  const tools = [
    new SelectTool(ed), new LassoTool(ed), new EraserTool(ed), new PaintTool(ed), new SampleTool(ed),
    new LineTool(ed), new FreehandTool(ed), new RectangleTool(ed), new RotatedRectangleTool(ed), new CircleTool(ed), new CircleTool(ed, true),
    new Arc2Tool(ed), new ArcCenterTool(ed), new ArcCenterTool(ed, true), new Arc3Tool(ed),
    new PushPullTool(ed), new OffsetTool(ed), new MoveTool(ed), new RotateTool(ed), new ScaleTool(ed), new FollowMeTool(ed),
    new TapeTool(ed), new ProtractorTool(ed), new DimensionTool(ed), new TextTool(ed), new SectionTool(ed),
    new OrbitTool(ed), new PanTool(ed), new ZoomTool(ed), new ZoomWindowTool(ed), new LookAroundTool(ed), new WalkTool(ed), new PositionCameraTool(ed),
    new PlaceTool(ed), new TerrainTool(ed),
  ];
  tools.forEach(t => ed.register(t));
  installDefaults(ed);
  // edge colours and lights depend on day/night – rebuild the scene, not just redraw it
  onThemeChange(() => ed.invalidate());
  return ed;
}

const KEYS: Record<string, string> = { ' ': 'select', e: 'eraser', b: 'paint', l: 'line', a: 'arc2', r: 'rectangle', c: 'circle', p: 'pushpull', f: 'offset', m: 'move', q: 'rotate', s: 'scale', t: 'tape', o: 'orbit', h: 'pan', z: 'zoom' };

/** Global keyboard handling: shortcuts, VCB typing, tool keys. */
export function installKeyboard(ed: Editor, focusVcb: (initial: string) => void) {
  const isTyping = (e: KeyboardEvent) => { const t = e.target as HTMLElement; return t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable); };
  window.addEventListener('keydown', e => {
    if (ed.ui.dialog) return;
    if (isTyping(e)) return;
    const k = e.key; const ctrl = e.ctrlKey || e.metaKey;
    // let the active tool react first (arrow locks, ctrl copy toggle, shift lock)
    if (ed.tool.onKey(e, true)) { e.preventDefault(); ed.redraw(); ed.refreshStatus(); return; }
    if (ctrl) {
      const map: Record<string, string> = { z: 'undo', y: 'redo', c: 'copy', x: 'cut', v: 'paste', a: 'selectAll', t: 'selectNone', s: 'save', o: 'open', n: 'new' };
      const id = e.shiftKey && k.toLowerCase() === 'z' ? 'redo' : e.shiftKey && k.toLowerCase() === 'i' ? 'invertSel' : map[k.toLowerCase()];
      if (id) { e.preventDefault(); runCommand(ed, id); }
      return;
    }
    if (k === 'Escape') { if (ed.tool.busy()) ed.tool.cancel(); else if (ed.selection.size) ed.clearSelection(); else if (ed.activePath.length) ed.exitContext(); else if (ed.ui.tool !== 'select') ed.setTool('select'); ed.refreshStatus(); ed.redraw(); e.preventDefault(); return; }
    if (k === 'Delete' || k === 'Backspace') { if (!ed.ui.vcbValue || !ed.ui.vcbEditing) { runCommand(ed, 'delete'); e.preventDefault(); } return; }
    if (k === 'Enter' && ed.ui.vcbValue && ed.ui.vcbEditing) { return; }
    if (e.altKey && k.toLowerCase() === 'k') { runCommand(ed, 'xray'); e.preventDefault(); return; }
    if (e.shiftKey && k.toLowerCase() === 'z') { ed.zoomExtents(); e.preventDefault(); return; }
    if (e.altKey) return;
    // characters that start a measurement go into the VCB
    if (/^[0-9.,;\-+\/*<\[]$/.test(k) || (ed.tool.busy() && /^[xs'"°]$/i.test(k)) || ((k === 'x' || k === 's') && /^(move|rotate|circle|polygon|arc2|arc|pie)$/.test(ed.ui.tool))) {
      e.preventDefault(); focusVcb(k); return;
    }
    if (k.toLowerCase() === 'g' && !e.shiftKey) { e.preventDefault(); runCommand(ed, 'makeComponent'); return; }
    if (k.toLowerCase() === 'k' && !e.shiftKey) { ed.model.settings.style.backEdges = !ed.model.settings.style.backEdges; ed.invalidate(); return; }
    const tool = KEYS[k.toLowerCase()];
    if (tool && !e.shiftKey) { e.preventDefault(); ed.setTool(tool); return; }
  });
  window.addEventListener('keyup', e => { if (isTyping(e) || ed.ui.dialog) return; if (ed.tool.onKey(e, false)) { ed.redraw(); } });
}

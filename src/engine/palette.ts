import type { Editor } from './editor';
import { TOOL_INFO } from './setup';
import { COMMANDS, runCommand, zoomSelection } from './commands';
import { meshView } from './meshView';
import { applyScene } from './scenes';
import { LIB, insertLibrary } from './library';
import { personDefinition } from './defaults';
import { PEOPLE } from '../core/people';
import { MATERIAL_LIBRARY } from '../core/materialLibrary';
import { ScriptApi } from '../scripting/api';
import { aiConfig } from '../ai/providers';
import { openPanel, PANEL_INFO, togglePanel } from '../components/panelState';
import type { PlaceTool } from '../tools/place';

/**
 * Everything the command palette can find: tools, commands, panels, display switches, components,
 * materials, scenes, tags and the objects of the model. Collected fresh every time the palette opens.
 */
export interface PaletteItem {
  id: string;
  label: string;
  group: string;
  icon?: string;
  /** extra words that should find the item (not shown) */
  keywords?: string;
  shortcut?: string;
  /** on/off state – shown as a switch, Umschalt+Enter toggles without closing */
  checked?: () => boolean;
  enabled?: () => boolean;
  run: () => void;
  /** prefix filter: '>' actions (default), '@' objects, '#' materials */
  kind?: 'action' | 'object' | 'material';
}

/** Extra search words for commands whose label alone is hard to guess (German word forms, English IDE terms). */
const SYNONYMS: Record<string, string> = {
  themeDark: 'dunkel dark mode nachtmodus theme', themeLight: 'hell light mode theme', themeSystem: 'system auto theme',
  sceneNight: 'dunkel nacht night mond', sceneDay: 'hell tag day sonne', sceneAuto: 'auto szene',
  undo: 'undo rückgängig zurück', redo: 'redo wiederholen', delete: 'löschen entfernen delete', clearAll: 'leeren clear alles löschen reset',
  save: 'speichern save download', open: 'öffnen open laden', new: 'neu new leeres modell', import: 'import einlesen datei',
  toggleRulers: 'lineal ruler maße mm cm', togglePeopleSize: 'höhe figur person maß', toggleAxes: 'achsen axes', toggleShadows: 'schatten shadows sonne',
  xray: 'röntgen xray durchsichtig transparent', zoomExtents: 'alles zeigen fit zoom', terrain: 'gelände berge landschaft terrain',
  tour: 'hilfe einführung tour wizard', commandPalette: 'palette befehle suchen',
};

const GROUP_ICON: Record<string, string> ={ Datei: 'file', Bearbeiten: 'select', Ansicht: 'display', Kamera: 'camera', Volumenkörper: 'solid', Zeichnen: 'line', Werkzeuge: 'tape' };

export function paletteItems(ed: Editor): PaletteItem[] {
  const out: PaletteItem[] = [];
  const toggle = (id: string, label: string, group: string, get: () => boolean, set: (v: boolean) => void, icon = 'display', keywords = '') =>
    out.push({ id, label, group, icon, keywords, checked: get, run: () => { set(!get()); ed.invalidate(); ed.redraw(); } });

  // tools
  for (const t of Object.values(TOOL_INFO)) {
    if (t.id === 'place') continue;
    out.push({ id: 't:' + t.id, label: t.name, group: 'Werkzeug', icon: t.icon, shortcut: t.key, keywords: 'werkzeug tool ' + t.id, run: () => ed.setTool(t.id) });
  }
  out.push({ id: 't:text3d', label: '3D-Text', group: 'Werkzeug', icon: 'text3d', keywords: 'schrift text', run: () => { ed.ui.dialog = { kind: 'text3d' }; } });

  // commands (menus)
  for (const c of COMMANDS) {
    out.push({
      id: 'c:' + c.id, label: c.label, group: c.group, icon: GROUP_ICON[c.group] ?? 'chevron', shortcut: c.shortcut, keywords: `${c.id} ${SYNONYMS[c.id] ?? ''}`,
      checked: c.checked ? () => !!c.checked!(ed) : undefined,
      enabled: c.enabled ? () => c.enabled!(ed) : undefined,
      run: () => runCommand(ed, c.id),
    });
  }

  // panels
  for (const p of PANEL_INFO) {
    out.push({ id: 'p:' + p.id, label: p.label, group: 'Panel', icon: p.icon, keywords: 'panel fenster öffnen ' + p.id, checked: () => openPanel.value === p.id, run: () => togglePanel(p.id) });
  }

  // switches that only live inside panels
  toggle('v:mesh', 'Polygonansicht', 'Polygone & Punkte', () => meshView.on, v => (meshView.on = v), 'mesh', 'mesh wireframe dreiecke vertices');
  toggle('v:mesh-points', 'Polygonansicht: Eckpunkte', 'Polygone & Punkte', () => meshView.points, v => (meshView.points = v), 'mesh', 'vertices punkte');
  toggle('v:mesh-tris', 'Polygonansicht: Dreiecke der Flächen', 'Polygone & Punkte', () => meshView.triangles, v => (meshView.triangles = v), 'mesh', 'triangles');
  toggle('v:mesh-soft', 'Polygonansicht: Weiche Kanten', 'Polygone & Punkte', () => meshView.soft, v => (meshView.soft = v), 'mesh', 'soft edges');
  toggle('v:backedges', 'Rückseitige Kanten', 'Stile', () => ed.model.settings.style.backEdges, v => (ed.model.settings.style.backEdges = v), 'styles', 'back edges K');
  toggle('ai:fast', 'KI: Schnellmodus', 'KI-Assistent', () => aiConfig.fast, v => (aiConfig.fast = v), 'sparkle', 'fast schnell');
  toggle('ai:autorun', 'KI: Code automatisch ausführen', 'KI-Assistent', () => aiConfig.autoRun, v => (aiConfig.autoRun = v), 'sparkle', 'autorun');

  // components: people, built-in library, components of this model
  for (const [k, p] of Object.entries(PEOPLE)) {
    out.push({ id: 'person:' + k, label: `Person platzieren: ${p.label}`, group: 'Komponenten', icon: 'person', keywords: 'figur mensch maßstab',
      run: () => (ed.tools.get('place') as PlaceTool).start(personDefinition(ed, k)) });
  }
  for (const b of LIB) out.push({ id: 'lib:' + b.name, label: `${b.name} einfügen`, group: 'Komponenten', icon: 'component', keywords: 'bibliothek komponente', run: () => insertLibrary(ed, b) });
  for (const d of ed.model.definitions.values()) {
    if (!d.isComponent || d.faceMe) continue;
    out.push({ id: 'def:' + d.id, label: `Komponente platzieren: ${d.name}`, group: 'Komponenten', icon: 'component', run: () => (ed.tools.get('place') as PlaceTool).start(d) });
  }

  // materials: those in the model first, then the library (added to the model when picked)
  const choose = (name: string) => { ed.ui.currentMaterial = name; if (ed.ui.tool !== 'paint') ed.setTool('paint'); else ed.refreshStatus(); };
  const inModel = new Set(ed.model.materials.map(m => m.name));
  for (const m of ed.model.materials) out.push({ id: 'm:' + m.name, label: m.name, group: 'Material im Modell', icon: 'materials', kind: 'material', keywords: 'farbe material', run: () => choose(m.name) });
  for (const m of MATERIAL_LIBRARY) {
    if (inModel.has(m.name)) continue;
    out.push({ id: 'ml:' + m.name, label: m.name, group: `Material · ${m.category}`, icon: 'materials', kind: 'material', keywords: `farbe material ${m.texture ?? ''} ${m.note ?? ''}`,
      run: () => { let n = m.name; ed.commit('Material hinzufügen', () => { n = new ScriptApi(ed, ed.model.root).ensureMaterial(m.name); }); choose(n); } });
  }

  // scenes and tags
  for (const sc of ed.model.scenes) out.push({ id: 'sc:' + sc.id, label: `Szene: ${sc.name}`, group: 'Szenen', icon: 'scenes', run: () => applyScene(ed, sc) });
  for (const t of ed.model.tags) {
    out.push({ id: 'tag:' + t.name, label: `Tag sichtbar: ${t.name}`, group: 'Tags', icon: 'tags', checked: () => t.visible, run: () => ed.commit('Tag-Sichtbarkeit', () => { t.visible = !t.visible; }) });
  }

  // objects in the model (top level): select and zoom to them
  let n = 0;
  for (const i of ed.model.root.instances.values()) {
    if (++n > 400) break;
    const name = i.name || i.def.name;
    out.push({ id: 'obj:' + i.id, label: name, group: i.def.isComponent ? 'Objekt · Komponente' : 'Objekt · Gruppe', icon: i.def.isComponent ? 'component' : 'group', kind: 'object',
      keywords: i.def.name, run: () => { if (ed.activePath.length) ed.exitContext(); ed.select([{ kind: 'instance', id: i.id }]); zoomSelection(ed); ed.redraw(); } });
  }
  return out;
}

// ------------------------------------------------------------ fuzzy matching

/** VS Code-like fuzzy match: all query characters in order; bonus for word starts and runs. null = no match. */
export function fuzzy(query: string, text: string): { score: number; hits: number[] } | null {
  const q = query.toLowerCase(), t = text.toLowerCase();
  if (!q) return { score: 0, hits: [] };
  const direct = t.indexOf(q);
  if (direct >= 0) {
    const start = direct === 0 || /[\s\-_/:·(]/.test(t[direct - 1]);
    return { score: 1000 - direct + (start ? 300 : 0) - t.length * 0.5, hits: [...Array(q.length).keys()].map(k => direct + k) };
  }
  const hits: number[] = []; let score = 0, ti = 0, prev = -2;
  for (const ch of q) {
    if (ch === ' ') continue;
    let found = -1;
    // prefer the next word start, otherwise the next occurrence
    for (let k = ti; k < t.length; k++) if (t[k] === ch && (k === 0 || /[\s\-_/:·(]/.test(t[k - 1]))) { found = k; break; }
    const next = t.indexOf(ch, ti);
    if (found < 0 || (next >= 0 && next === prev + 1)) found = next;
    if (found < 0) return null;
    score += found === prev + 1 ? 12 : (found === 0 || /[\s\-_/:·(]/.test(t[found - 1])) ? 9 : 1;
    hits.push(found); prev = found; ti = found + 1;
  }
  return { score: score - t.length * 0.2, hits };
}

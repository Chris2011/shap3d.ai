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
  toggleRulers: 'lineal ruler maße mm cm', toggleGrid: 'raster grid gitter boden ebene unendlich mm cm', togglePeopleSize: 'höhe figur person maß', toggleAxes: 'achsen axes', toggleShadows: 'schatten shadows sonne',
  xray: 'röntgen xray durchsichtig transparent', zoomExtents: 'alles zeigen fit zoom',
  tour: 'hilfe einführung tour wizard', managePlugins: 'plugin erweiterung addon extension', commandPalette: 'palette befehle suchen',
};

const GROUP_ICON: Record<string, string> ={ Datei: 'file', Bearbeiten: 'select', Ansicht: 'display', Kamera: 'camera', Volumenkörper: 'solid', Zeichnen: 'line', Werkzeuge: 'tape', Plugins: 'plugin' };

export const paletteItems = (editor: Editor): PaletteItem[] => {
  const out: PaletteItem[] = [];
  const toggle = (id: string, label: string, group: string, get: () => boolean, set: (value: boolean) => void, icon = 'display', keywords = '') =>
    out.push({ id, label, group, icon, keywords, checked: get, run: () => { set(!get()); editor.invalidate(); editor.redraw(); } });

  // tools
  for (const tool of Object.values(TOOL_INFO)) {
    if (tool.id === 'place') continue;
    out.push({ id: 't:' + tool.id, label: tool.name, group: 'Werkzeug', icon: tool.icon, shortcut: tool.key, keywords: 'werkzeug tool ' + tool.id, run: () => editor.setTool(tool.id) });
  }
  out.push({ id: 't:text3d', label: '3D-Text', group: 'Werkzeug', icon: 'text3d', keywords: 'schrift text', run: () => { editor.ui.dialog = { kind: 'text3d' }; } });

  // commands (menus)
  for (const command of COMMANDS) {
    out.push({
      id: 'c:' + command.id, label: command.label, group: command.group, icon: command.icon ?? GROUP_ICON[command.group] ?? 'chevron', shortcut: command.shortcut, keywords: `${command.id} ${SYNONYMS[command.id] ?? ''} ${command.keywords ?? ''}`,
      checked: command.checked ? () => !!command.checked!(editor) : undefined,
      enabled: command.enabled ? () => command.enabled!(editor) : undefined,
      run: () => runCommand(editor, command.id),
    });
  }

  // panels
  for (const panel of PANEL_INFO.filter(candidate => candidate.tile !== false)) { // tile-less (plugin) panels come with their own command
    out.push({ id: 'p:' + panel.id, label: panel.label, group: 'Panel', icon: panel.icon, keywords: 'panel fenster öffnen ' + panel.id, checked: () => openPanel.value === panel.id, run: () => togglePanel(panel.id) });
  }

  // switches that only live inside panels
  toggle('v:mesh', 'Polygonansicht', 'Polygone & Punkte', () => meshView.on, value => (meshView.on = value), 'mesh', 'mesh wireframe dreiecke vertices');
  toggle('v:mesh-points', 'Polygonansicht: Eckpunkte', 'Polygone & Punkte', () => meshView.points, value => (meshView.points = value), 'mesh', 'vertices punkte');
  toggle('v:mesh-tris', 'Polygonansicht: Dreiecke der Flächen', 'Polygone & Punkte', () => meshView.triangles, value => (meshView.triangles = value), 'mesh', 'triangles');
  toggle('v:mesh-soft', 'Polygonansicht: Weiche Kanten', 'Polygone & Punkte', () => meshView.soft, value => (meshView.soft = value), 'mesh', 'soft edges');
  toggle('v:backedges', 'Rückseitige Kanten', 'Stile', () => editor.model.settings.style.backEdges, value => (editor.model.settings.style.backEdges = value), 'styles', 'back edges K');

  // components: people, built-in library, components of this model
  for (const [key, person] of Object.entries(PEOPLE)) {
    out.push({ id: 'person:' + key, label: `Person platzieren: ${person.label}`, group: 'Komponenten', icon: 'person', keywords: 'figur mensch maßstab',
      run: () => (editor.tools.get('place') as PlaceTool).start(personDefinition(editor, key)) });
  }
  for (const item of LIB) out.push({ id: 'lib:' + item.name, label: `${item.name} einfügen`, group: 'Komponenten', icon: 'component', keywords: 'bibliothek komponente', run: () => insertLibrary(editor, item) });
  for (const definition of editor.model.definitions.values()) {
    if (!definition.isComponent || definition.faceMe) continue;
    out.push({ id: 'def:' + definition.id, label: `Komponente platzieren: ${definition.name}`, group: 'Komponenten', icon: 'component', run: () => (editor.tools.get('place') as PlaceTool).start(definition) });
  }

  // materials: those in the model first, then the library (added to the model when picked)
  const choose = (name: string) => { editor.ui.currentMaterial = name; if (editor.ui.tool !== 'paint') editor.setTool('paint'); else editor.refreshStatus(); };
  const inModel = new Set(editor.model.materials.map(material => material.name));
  for (const material of editor.model.materials) out.push({ id: 'm:' + material.name, label: material.name, group: 'Material im Modell', icon: 'materials', kind: 'material', keywords: 'farbe material', run: () => choose(material.name) });
  for (const material of MATERIAL_LIBRARY) {
    if (inModel.has(material.name)) continue;
    out.push({ id: 'ml:' + material.name, label: material.name, group: `Material · ${material.category}`, icon: 'materials', kind: 'material', keywords: `farbe material ${material.texture ?? ''} ${material.note ?? ''}`,
      run: () => { let materialName = material.name; editor.commit('Material hinzufügen', () => { materialName = new ScriptApi(editor, editor.model.root).ensureMaterial(material.name); }); choose(materialName); } });
  }

  // scenes and tags
  for (const scene of editor.model.scenes) out.push({ id: 'sc:' + scene.id, label: `Szene: ${scene.name}`, group: 'Szenen', icon: 'scenes', run: () => applyScene(editor, scene) });
  for (const tag of editor.model.tags) {
    out.push({ id: 'tag:' + tag.name, label: `Tag sichtbar: ${tag.name}`, group: 'Tags', icon: 'tags', checked: () => tag.visible, run: () => editor.commit('Tag-Sichtbarkeit', () => { tag.visible = !tag.visible; }) });
  }

  // objects in the model (top level): select and zoom to them
  let count = 0;
  for (const instance of editor.model.root.instances.values()) {
    if (++count > 400) break;
    const name = instance.name || instance.definition.name;
    out.push({ id: 'obj:' + instance.id, label: name, group: instance.definition.isComponent ? 'Objekt · Komponente' : 'Objekt · Gruppe', icon: instance.definition.isComponent ? 'component' : 'group', kind: 'object',
      keywords: instance.definition.name, run: () => { if (editor.activePath.length) editor.exitContext(); editor.select([{ kind: 'instance', id: instance.id }]); zoomSelection(editor); editor.redraw(); } });
  }
  return out;
};

// ------------------------------------------------------------ fuzzy matching

/** VS Code-like fuzzy match: all query characters in order; bonus for word starts and runs. null = no match. */
export const fuzzy = (query: string, text: string): { score: number; hits: number[] } | null => {
  const needle = query.toLowerCase(), haystack = text.toLowerCase();
  if (!needle) return { score: 0, hits: [] };
  const direct = haystack.indexOf(needle);
  if (direct >= 0) {
    const start = direct === 0 || /[\s\-_/:·(]/.test(haystack[direct - 1]);
    return { score: 1000 - direct + (start ? 300 : 0) - haystack.length * 0.5, hits: [...Array(needle.length).keys()].map(k => direct + k) };
  }
  const hits: number[] = []; let score = 0, textIndex = 0, prev = -2, scattered = 0;
  const wordStart = (k: number) => k === 0 || /[\s\-_/:·(]/.test(haystack[k - 1]);
  for (const char of needle) {
    if (char === ' ') continue;
    let found = -1;
    // prefer the next word start, otherwise the next occurrence
    for (let k = textIndex; k < haystack.length; k++) if (haystack[k] === char && wordStart(k)) { found = k; break; }
    const next = haystack.indexOf(char, textIndex);
    if (found < 0 || (next >= 0 && next === prev + 1)) found = next;
    if (found < 0) return null;
    const run = found === prev + 1, start = wordStart(found);
    if (!run && !start) scattered++;
    score += run ? 12 : start ? 9 : 1;
    hits.push(found); prev = found; textIndex = found + 1;
  }
  if (scattered > 1) return null;
  return { score: score - haystack.length * 0.2, hits };
};

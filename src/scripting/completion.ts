import type { Editor } from '../engine/editor';
import { API_CATALOG, type ApiEntry } from './catalog';
import { MATERIAL_LIBRARY, MATERIAL_CATEGORIES } from '../core/materialLibrary';
import { TEXTURES } from '../core/textures';
import { findScriptLanguage, type CompletionKind, type CompletionProvider, type ScriptCompletion } from './languages';

/**
 * Code completion for the script editor: JavaScript (s3d API, handles, options, values), JSON
 * (types, keys, values) and plugin languages (their own `completions`). No parser – a forward scan
 * finds strings, comments and open brackets, the rest are small backward/forward reads.
 */
export interface CompletionItem extends ScriptCompletion { kind: CompletionKind; /** caret position inside `insert` (default: its end) */ caret?: number }
export type CompletionContext = 'member' | 'option' | 'value' | 'string' | 'identifier' | 'key' | 'language';
export interface CompletionResult { from: number; to: number; word: string; context: CompletionContext; items: CompletionItem[] }

// ---------------------------------------------------------------- values contributed by plugins
interface ValueSource { option: string; values: () => (string | ScriptCompletion)[] }
const VALUE_SOURCES: ValueSource[] = [];

/** Suggestions for an option value (`{ font: '…' }` in JavaScript, `"font": "…"` in JSON) – e.g. the fonts of the 3D-text plugin. */
export const registerCompletionValues = (option: string, values: () => (string | ScriptCompletion)[]) => {
  const source = { option, values };
  VALUE_SOURCES.push(source);
  return () => { const index = VALUE_SOURCES.indexOf(source); if (index >= 0) VALUE_SOURCES.splice(index, 1); };
};

// ---------------------------------------------------------------- completions for plugin languages
const LANGUAGE_PROVIDERS: { language: string; provider: CompletionProvider }[] = [];

/** Suggestions for a script language registered by a plugin (e.g. OpenSCAD's keywords) – several providers per language add up. */
export const registerLanguageCompletions = (language: string, provider: CompletionProvider) => {
  if (['js', 'json', 'obj'].includes(language)) throw new Error(`Für „${language}“ bringt der Editor eigene Vorschläge mit`);
  const entry = { language, provider };
  LANGUAGE_PROVIDERS.push(entry);
  return () => { const index = LANGUAGE_PROVIDERS.indexOf(entry); if (index >= 0) LANGUAGE_PROVIDERS.splice(index, 1); };
};

const toItem =(candidate: string | ScriptCompletion, kind: CompletionKind): CompletionItem => (typeof candidate === 'string' ? { label: candidate, kind } : { ...candidate, kind: candidate.kind ?? kind });

// ---------------------------------------------------------------- fuzzy ranking
/** 0/1 = prefix (exact case first), 2 = start of a word part, 3 = substring, 4 = letters in order; -1 = no match */
const matchScore = (label: string, word: string): number => {
  if (!word) return 0;
  const lower = label.toLowerCase(), query = word.toLowerCase();
  if (lower.startsWith(query)) return label.startsWith(word) ? 0 : 1;
  for (let i = 1; i < label.length; i++) {
    const boundary = /[\s_\-:.]/.test(label[i - 1]) || (/[a-z]/.test(label[i - 1]) && /[A-Z]/.test(label[i]));
    if (boundary && lower.startsWith(query, i)) return 2;
  }
  // a single letter only matches the start of a word – otherwise nearly everything would
  if (query.length < 2) return -1;
  if (lower.includes(query)) return 3;
  if (lower[0] !== query[0]) return -1;
  let position = 0;
  for (const char of query) { position = lower.indexOf(char, position); if (position < 0) return -1; position++; }
  return 4;
};

const rank = (items: CompletionItem[], word: string) => items
  .map((item, order) => ({ item, order, score: matchScore(item.label, word) }))
  .filter(entry => entry.score >= 0)
  .sort((a, b) => a.score - b.score || a.order - b.order)
  .slice(0, 200)
  .map(entry => entry.item);

// ---------------------------------------------------------------- scanning
interface Frame { char: string; index: number; commas: number }
interface Scan { stack: Frame[]; openToClose: Map<number, number>; closeToOpen: Map<number, number>; string: { quote: string; start: number } | null; comment: boolean }

/** Walks the code up to `end`: open brackets (with their comma count), bracket pairs, and whether `end` is in a string or comment. */
const scan = (code: string, end: number, json: boolean): Scan => {
  const result: Scan = { stack: [], openToClose: new Map(), closeToOpen: new Map(), string: null, comment: false };
  let i = 0;
  while (i < end) {
    const char = code[i];
    if (!json && char === '/' && code[i + 1] === '/') {
      const lineEnd = code.indexOf('\n', i);
      if (lineEnd < 0 || lineEnd >= end) { result.comment = true; return result; }
      i = lineEnd; continue;
    }
    if (!json && char === '/' && code[i + 1] === '*') {
      const close = code.indexOf('*/', i + 2);
      if (close < 0 || close + 2 > end) { result.comment = true; return result; }
      i = close + 2; continue;
    }
    if (char === '"' || (!json && (char === "'" || char === '`'))) {
      let j = i + 1;
      while (j < end && code[j] !== char && !(char !== '`' && code[j] === '\n')) j += code[j] === '\\' ? 2 : 1;
      if (j >= end) { result.string = { quote: char, start: i }; return result; }
      i = code[j] === '\n' ? j : j + 1; // an unterminated string ends with its line
      continue;
    }
    if (char === '(' || char === '[' || char === '{') result.stack.push({ char, index: i, commas: 0 });
    else if (char === ')' || char === ']' || char === '}') {
      const frame = result.stack.pop();
      if (frame) { result.openToClose.set(frame.index, i); result.closeToOpen.set(i, frame.index); }
    } else if (char === ',' && result.stack.length) result.stack[result.stack.length - 1].commas++;
    i++;
  }
  return result;
};

const IDENT_CHAR = /[\w$À-ɏ]/;
const identBefore = (code: string, offset: number) => { let start = offset; while (start > 0 && IDENT_CHAR.test(code[start - 1])) start--; return code.slice(start, offset); };
/** index of the last non-whitespace character before `index` (-1 if none) */
const prevSignificant = (code: string, index: number) => { let i = index - 1; while (i >= 0 && /\s/.test(code[i])) i--; return i; };
/** the key in front of a colon: `material:` or `"material":` */
const keyBefore = (code: string, colonIndex: number) => /["'`]?([\w$]+)["'`]?\s*$/.exec(code.slice(Math.max(0, colonIndex - 60), colonIndex))?.[1] ?? '';
/** end of the string the cursor is in: after its closing quote on the same line, or the cursor itself */
const stringEnd = (code: string, offset: number, quote: string) => {
  for (let i = offset; i < code.length; i++) {
    if (code[i] === '\\') { i++; continue; }
    if (code[i] === quote) return i + 1;
    if (code[i] === '\n' && quote !== '`') return offset;
  }
  return offset;
};

interface Segment { name: string; call: boolean }
/** reads `a.b(…).c` backwards from `end` (exclusive) */
const readChainBackward = (code: string, end: number, state: Scan): Segment[] | null => {
  const segments: Segment[] = [];
  let i = end;
  for (;;) {
    while (i > 0 && /\s/.test(code[i - 1])) i--;
    let call = false;
    if (code[i - 1] === ')') {
      const open = state.closeToOpen.get(i - 1); if (open == null) return null;
      i = open; call = true;
      while (i > 0 && /\s/.test(code[i - 1])) i--;
    }
    let start = i; while (start > 0 && IDENT_CHAR.test(code[start - 1])) start--;
    const name = code.slice(start, i);
    if (!name || /^\d/.test(name)) return null;
    segments.unshift({ name, call });
    i = start;
    while (i > 0 && /\s/.test(code[i - 1])) i--;
    if (code[i - 1] === '.') { i--; continue; }
    return segments;
  }
};
/** reads `a.b(…).c` forwards from `start` (right side of a declaration) */
const readChainForward = (code: string, start: number, state: Scan): Segment[] | null => {
  const segments: Segment[] = [];
  let i = start;
  const skip = () => { while (i < code.length && /\s/.test(code[i])) i++; };
  for (;;) {
    skip();
    const match = /^[A-Za-z_$][\w$]*/.exec(code.slice(i, i + 80)); if (!match) return segments.length ? segments : null;
    i += match[0].length; skip();
    let call = false;
    if (code[i] === '(') { const close = state.openToClose.get(i); if (close == null) return null; call = true; i = close + 1; skip(); }
    segments.push({ name: match[0], call });
    if (code[i] === '.') { i++; continue; }
    return segments;
  }
};

// ---------------------------------------------------------------- the s3d API and its handles
const API_NAMES = ['s3d', 'su', 'fw'];
type ValueType = 'api' | 'group' | 'face' | 'component' | 'math' | 'console';
interface ApiMethod { name: string; signature: string; entry?: ApiEntry; returns?: string; description?: string }

/** ScriptApi members that have no entry of their own in the API reference */
const API_EXTRAS: ApiMethod[] = [
  { name: 'point', signature: 's3d.point(x, y, z)', returns: 'Punkt', description: 'Punkt [x, y, z] – dasselbe wie ein Array.' },
  { name: 'meters', signature: 's3d.meters(x)', returns: 'Zahl', description: 'Meter (Zahlen sind ohnehin Meter).' },
  { name: 'length', signature: "s3d.length('50cm')", returns: 'Zahl', description: 'Länge mit Einheit in Meter umrechnen.' },
  { name: 'warn', signature: 's3d.warn(…)', description: 'Warnung in die Konsole schreiben.' },
  { name: 'pushpull', signature: 's3d.pushpull(fläche, abstand)', returns: 'Deckfläche', description: 'Wie fläche.pushpull(abstand).' },
  { name: 'textures', signature: 's3d.textures()', returns: 'Namen', description: 'Namen der Texturen für s3d.material(…, { texture }).' },
  { name: 'polyline', signature: 's3d.polyline(punkte, geschlossen)', returns: 'Fläche', description: 'Linienzug; geschlossen und eben entsteht eine Fläche.' },
  { name: 'zoomExtents', signature: 's3d.zoomExtents()', description: 'Nach dem Skript auf alles zoomen.' },
];

/** every `s3d.<name>(` the API reference documents, including the ones plugins add at runtime */
const apiMethods = () => {
  const methods = new Map<string, ApiMethod>();
  for (const entry of API_CATALOG) {
    for (const part of entry.signature.split(/\s{2,}/)) {
      for (const match of part.matchAll(/\bs3d\.(\w+)\s*\(/g)) {
        if (!methods.has(match[1])) methods.set(match[1], { name: match[1], signature: part.trim(), entry, returns: entry.returns, description: entry.desc });
      }
    }
  }
  for (const extra of API_EXTRAS) if (!methods.has(extra.name)) methods.set(extra.name, extra);
  return methods;
};

interface Member { name: string; call: boolean; signature: string; description: string; returns?: ValueType; detail?: string }
const GROUP_MEMBERS: Member[] = [
  { name: 'move', call: true, signature: 'g.move([dx, dy, dz])', description: 'Um einen Versatz verschieben.', returns: 'group', detail: 'Gruppe' },
  { name: 'moveTo', call: true, signature: 'g.moveTo([x, y, z])', description: 'Den Ursprung an einen Punkt setzen.', returns: 'group', detail: 'Gruppe' },
  { name: 'rotate', call: true, signature: "g.rotate(grad, achse = 'z', zentrum?)", description: "Drehen um eine Achse ('x', 'y', 'z' oder Vektor), standardmäßig um den Ursprung der Gruppe.", returns: 'group', detail: 'Gruppe' },
  { name: 'scale', call: true, signature: 'g.scale(faktor | [fx, fy, fz], zentrum?)', description: 'Gleichmäßig oder je Achse skalieren.', returns: 'group', detail: 'Gruppe' },
  { name: 'material', call: true, signature: 'g.material(name)', description: 'Material für die ganze Gruppe.', returns: 'group', detail: 'Gruppe' },
  { name: 'tag', call: true, signature: 'g.tag(name)', description: 'Tag (Ebene) zuweisen – wird bei Bedarf angelegt.', returns: 'group', detail: 'Gruppe' },
  { name: 'hide', call: true, signature: 'g.hide()', description: 'Ausblenden.', returns: 'group', detail: 'Gruppe' },
  { name: 'copy', call: true, signature: 'g.copy([dx, dy, dz])', description: 'Kopie mit Versatz – gibt die Kopie zurück.', returns: 'group', detail: 'Gruppe' },
  { name: 'explode', call: true, signature: 'g.explode()', description: 'In lose Geometrie auflösen. Gibt die Anzahl der Teile zurück.', detail: 'Zahl' },
  { name: 'ref', call: true, signature: 'g.ref()', description: 'Verweis { kind, id } auf die Instanz.' },
  { name: 'name', call: false, signature: 'g.name', description: 'Name der Gruppe oder Komponente.', detail: 'Text' },
  { name: 'entities', call: false, signature: 'g.entities', description: 'Die Geometrie in der Gruppe.' },
];
const FACE_MEMBERS: Member[] = [
  { name: 'pushpull', call: true, signature: 'fläche.pushpull(abstand)', description: 'Zu einem Körper ziehen. Bei liegenden Flächen ist positiv immer nach oben.', returns: 'face', detail: 'Deckfläche' },
  { name: 'extrude', call: true, signature: "fläche.extrude(abstand, richtung = 'z')", description: "Wie pushpull, aber in eine feste Richtung: 'x', 'y', 'z', '-x', '-y', '-z' oder Vektor.", returns: 'face', detail: 'Deckfläche' },
  { name: 'offset', call: true, signature: 'fläche.offset(abstand)', description: 'Innere Kontur in die Fläche zeichnen.', returns: 'face', detail: 'Fläche' },
  { name: 'followMe', call: true, signature: 'fläche.followMe(pfadPunkte, geschlossen)', description: 'Profil entlang eines Pfades führen.', returns: 'face', detail: 'Fläche' },
  { name: 'material', call: true, signature: 'fläche.material(name)', description: 'Material der Vorderseite.', returns: 'face', detail: 'Fläche' },
  { name: 'backMaterial', call: true, signature: 'fläche.backMaterial(name)', description: 'Material der Rückseite.', returns: 'face', detail: 'Fläche' },
  { name: 'reverse', call: true, signature: 'fläche.reverse()', description: 'Fläche umdrehen.', returns: 'face', detail: 'Fläche' },
  { name: 'ref', call: true, signature: 'fläche.ref()', description: 'Verweis { kind, id } auf die Fläche.' },
  { name: 'area', call: false, signature: 'fläche.area', description: 'Flächeninhalt in m².', detail: 'Zahl' },
  { name: 'normal', call: false, signature: 'fläche.normal', description: 'Normale [x, y, z].', detail: 'Vektor' },
  { name: 'exists', call: false, signature: 'fläche.exists', description: 'Gibt es die Fläche noch?', detail: 'ja/nein' },
];
const COMPONENT_MEMBERS: Member[] = [
  { name: 'place', call: true, signature: 'komponente.place(ort, drehGrad, skalierung)', description: 'Eine Kopie der Komponente platzieren.', returns: 'group', detail: 'Gruppe' },
  { name: 'def', call: false, signature: 'komponente.def', description: 'Die Komponenten-Definition.' },
];
const MATH_MEMBERS: Member[] = ['PI', 'sin', 'cos', 'tan', 'atan2', 'sqrt', 'abs', 'min', 'max', 'round', 'floor', 'ceil', 'hypot', 'pow', 'random', 'sign']
  .map(name => ({ name, call: name !== 'PI', signature: `Math.${name}${name === 'PI' ? '' : '(…)'}`, description: name === 'PI' ? 'π = 3,14159…' : 'JavaScript-Mathematik.' }));
const CONSOLE_MEMBERS: Member[] = ['log', 'warn', 'error', 'info'].map(name => ({ name, call: true, signature: `console.${name}(…)`, description: 'Schreibt in die Konsole unter dem Editor.' }));
const MEMBERS: Record<Exclude<ValueType, 'api'>, Member[]> = { group: GROUP_MEMBERS, face: FACE_MEMBERS, component: COMPONENT_MEMBERS, math: MATH_MEMBERS, console: CONSOLE_MEMBERS };

const returnsType = (returns?: string): ValueType | null => {
  if (!returns) return null;
  if (/^Gruppe/.test(returns)) return 'group';
  if (/Fläche/.test(returns)) return 'face';
  if (/place/.test(returns)) return 'component';
  return null;
};

interface JsContext { code: string; offset: number; state: Scan }

const identifierType = (name: string, context: JsContext, depth: number): ValueType | null => {
  if (API_NAMES.includes(name)) return 'api';
  if (name === 'Math') return 'math';
  if (name === 'console') return 'console';
  if (depth > 4) return null;
  const escaped = name.replace(/\$/g, '\\$');
  const before = context.code.slice(0, context.offset);
  // the callback of s3d.group / s3d.component gets the API: s3d.group('Tisch', api => { api.… })
  if (new RegExp(`\\.(?:group|component)\\s*\\([^()]*?,\\s*\\(?\\s*${escaped}\\s*\\)?\\s*=>`).test(before)) return 'api';
  let declaration: RegExpExecArray | null = null;
  const pattern = new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=\\s*`, 'g');
  for (let match; (match = pattern.exec(before));) declaration = match;
  if (!declaration) return null;
  const chain = readChainForward(context.code, declaration.index + declaration[0].length, context.state);
  return chain ? resolveChain(chain, context, depth + 1) : null;
};

const resolveChain = (segments: Segment[], context: JsContext, depth = 0): ValueType | null => {
  const [first, ...rest] = segments;
  let type = first.call ? null : identifierType(first.name, context, depth);
  for (const segment of rest) {
    if (!type) return null;
    if (type === 'api') { type = segment.call ? returnsType(apiMethods().get(segment.name)?.returns) : null; continue; }
    const member = MEMBERS[type].find(candidate => candidate.name === segment.name);
    type = member && member.call === segment.call ? member.returns ?? null : null;
  }
  return type;
};

/** `name()` with the caret between the brackets – unless a bracket follows already */
const callInsert = (name: string, code: string, to: number) => (code[to] === '(' ? { insert: name } : { insert: `${name}()`, caret: name.length + 1 });

const memberItems = (type: ValueType, code: string, to: number): CompletionItem[] => {
  if (type === 'api') {
    const items: CompletionItem[] = [...apiMethods().values()].map(method => ({
      label: method.name, kind: 'method', ...callInsert(method.name, code, to),
      detail: method.returns ?? method.entry?.category, signature: method.signature, description: method.description, example: method.entry?.example,
    }));
    items.push({ label: 'THREE', kind: 'property', detail: 'three.js', description: 'Die Bibliothek three.js (Vector3, Matrix4 …).' });
    return items;
  }
  return MEMBERS[type].map(member => ({
    label: member.name, kind: member.call ? 'method' : 'property', ...(member.call ? callInsert(member.name, code, to) : {}),
    detail: member.detail, signature: member.signature, description: member.description,
  }));
};

// ---------------------------------------------------------------- option keys and values
const OPTION_INFO: Record<string, string> = {
  material: 'Materialname – fertige Materialien gehen direkt über ihren Namen.', backMaterial: 'Material der Rückseite.',
  name: 'Name der Gruppe.', group: 'false = lose Geometrie statt einer Gruppe.', segments: 'Anzahl der Seiten bzw. Segmente.',
  sides: 'Anzahl der Seiten der Grundfläche.', endRadius: 'Radius am Ende (0 = Spitze).', normal: "Richtung, in die die Fläche zeigt ('x', 'y', 'z' oder Vektor).",
  steps: 'Anzahl der Stufen.', rise: 'Stufenhöhe.', run: 'Stufentiefe.', width: 'Breite.', at: 'Position [x, y, z].', size: 'Größe.',
  yUp: 'true = Y ist oben (OBJ, LLaMA-Mesh).', smooth: 'Kanten flacher als dieser Winkel (Grad) werden geglättet.',
  opacity: 'Deckkraft 0–1.', texture: 'Prozedurale Textur.', faceStyle: 'Flächendarstellung.', xray: 'true = Röntgen.', edges: 'Kanten zeigen.',
  depth: 'Tiefe der Extrusion (0 = flach).', upright: 'true = aufrecht stehend.', filled: 'false = nur Umriss.', font: 'Schrift.',
  type: 'Objekttyp.', radius: 'Radius.', height: 'Höhe.', children: 'Liste der Objekte in der Gruppe.', points: 'Punkte [[x, y, z], …].',
  faces: 'Flächen als Listen von Punktnummern (ab 0).', count: 'Anzahl der Kopien.', offset: 'Versatz [dx, dy, dz].', object: 'Das Objekt, das wiederholt wird.',
  direction: 'Richtung [x, y, z].', text: 'Text.', from: 'Startpunkt [x, y, z].', to: 'Endpunkt [x, y, z].', rotate: 'Drehung { angle, axis, center }.',
  scale: 'Skalierung (Zahl oder [fx, fy, fz]).', move: 'Verschieben um [dx, dy, dz].', tag: 'Tag (Ebene).', pushpull: 'Danach um diesen Abstand ziehen.',
  closed: 'true = geschlossener Linienzug.', plane: "Ebene 'xy', 'xz' oder 'yz'.", angle: 'Winkel in Grad.', axis: "Achse 'x', 'y', 'z' oder Vektor.", center: 'Drehpunkt [x, y, z].',
  clear: 'true = Modell vorher leeren.', materials: 'Eigene Materialien { "Name": "#rrggbb" }.', objects: 'Liste der Objekte.', view: 'Ansicht nach dem Lauf.', zoomExtents: 'false = nicht auf alles zoomen.',
};
const BOOLEAN_KEYS = ['group', 'yUp', 'upright', 'filled', 'xray', 'edges', 'skirt', 'closed', 'clear', 'zoomExtents'];
/** methods whose options also take `group: false` */
const GROUP_OPTION = ['box', 'cylinder', 'cylinderBetween'];

const optionKeys = (method: ApiMethod): string[] => {
  const match = /\{([^{}]*)\}[^{}]*$/.exec(method.signature);
  if (!match || match[1].includes('…')) return [];
  const keys = match[1].split(',').map(key => key.trim().replace(/[?:=\s].*$/, '')).filter(key => /^\w+$/.test(key));
  if (method.returns === 'Gruppe' && keys.length && !keys.includes('name')) keys.push('name');
  if (GROUP_OPTION.includes(method.name)) keys.push('group');
  return keys;
};

const plainValues = (values: string[], descriptions: Record<string, string> = {}): CompletionItem[] => values.map(value => ({ label: value, kind: 'value', description: descriptions[value] }));
const AXES = () => plainValues(['x', 'y', 'z'], { x: 'X – rot', y: 'Y – grün', z: 'Z – blau (oben)' });
const DIRECTIONS = () => plainValues(['x', 'y', 'z', '-x', '-y', '-z']);
const PLANES = () => plainValues(['xy', 'xz', 'yz'], { xy: 'liegend', xz: 'stehend, Blick von vorn', yz: 'stehend, Blick von der Seite' });
const VIEWS = () => plainValues(['iso', 'top', 'front', 'back', 'left', 'right', 'bottom'], { iso: 'Isometrisch', top: 'Oben', front: 'Vorne', back: 'Hinten', left: 'Links', right: 'Rechts', bottom: 'Unten' });
const FACE_STYLES = () => plainValues(['textured', 'shaded', 'monochrome', 'hiddenline', 'wireframe'], { textured: 'Mit Texturen', shaded: 'Schattiert', monochrome: 'Einfarbig', hiddenline: 'Verdeckte Linien', wireframe: 'Drahtgitter' });
const BOOLEANS = (): CompletionItem[] => [{ label: 'true', kind: 'keyword' }, { label: 'false', kind: 'keyword' }];
const textureItems = (): CompletionItem[] => Object.entries(TEXTURES).map(([id, label]) => ({ label: id, kind: 'value', detail: label }));
const categoryItems = (): CompletionItem[] => MATERIAL_CATEGORIES.map(category => ({ label: category, kind: 'value', detail: 'Kategorie' }));
const tagItems = (editor?: Editor): CompletionItem[] => (editor?.model.tags ?? []).map(tag => ({ label: tag.name, kind: 'value', detail: tag.visible ? 'Tag' : 'Tag (ausgeblendet)', color: tag.color }));

/** the ready-made materials and the ones in the current model, with their colour */
const materialItems = (editor?: Editor): CompletionItem[] => {
  const library = new Set(MATERIAL_LIBRARY.map(material => material.name));
  const modelMaterials = editor?.model.materials ?? [];
  const inModel = new Set(modelMaterials.map(material => material.name));
  const items: CompletionItem[] = modelMaterials.filter(material => !library.has(material.name)).map(material => ({
    label: material.name, kind: 'material', color: material.color, detail: 'Im Modell',
    description: material.texture ? `Eigenes Material mit Textur „${TEXTURES[material.texture as keyof typeof TEXTURES] ?? material.texture}“.` : 'Eigenes Material in diesem Modell.',
  }));
  for (const material of MATERIAL_LIBRARY) items.push({
    label: material.name, kind: 'material', color: material.color, detail: inModel.has(material.name) ? `${material.category} · im Modell` : material.category,
    description: [material.note, material.texture ? `Textur „${TEXTURES[material.texture]}“` : '', material.opacity != null && material.opacity < 1 ? `Deckkraft ${Math.round(material.opacity * 100)} %` : ''].filter(Boolean).join(' · ') || undefined,
  });
  return items;
};

const registryValues = (key: string) => VALUE_SOURCES.filter(source => source.option === key).flatMap(source => { try { return source.values().map(value => toItem(value, 'value')); } catch { return []; } });

const optionValues = (key: string, editor?: Editor): CompletionItem[] => {
  if (key === 'material' || key === 'backMaterial') return materialItems(editor);
  if (key === 'texture') return textureItems();
  if (key === 'normal' || key === 'axis') return AXES();
  if (key === 'faceStyle') return FACE_STYLES();
  if (key === 'plane') return PLANES();
  if (key === 'view') return VIEWS();
  if (key === 'tag') return tagItems(editor);
  if (BOOLEAN_KEYS.includes(key)) return BOOLEANS();
  return registryValues(key);
};

/** `'50` → '50mm', '50cm', '50m' */
const unitValues = (content: string): CompletionItem[] => {
  const match = /^(-?\d+(?:[.,]\d+)?)([a-z]*)$/i.exec(content); if (!match) return [];
  const UNITS: Record<string, string> = { mm: 'Millimeter', cm: 'Zentimeter', m: 'Meter' };
  return Object.entries(UNITS).map(([unit, label]) => ({ label: match[1] + unit, kind: 'unit', detail: label, description: 'Überall, wo eine Länge erwartet wird, gehen Strings mit Einheit.' }));
};

// ---------------------------------------------------------------- JavaScript
/** the API method whose options object the frame is: `s3d.cylinder(…, { | })` */
const optionsMethod = (code: string, frameIndex: number, context: JsContext): ApiMethod | null => {
  const { stack } = context.state;
  const before = prevSignificant(code, stack[frameIndex].index);
  if (code[before] !== '(' && code[before] !== ',') return null;
  const parent = stack[frameIndex - 1]; if (!parent || parent.char !== '(') return null;
  const chain = readChainBackward(code, parent.index, context.state); if (!chain || chain.length < 2) return null;
  if (resolveChain(chain.slice(0, -1), context) !== 'api') return null;
  return apiMethods().get(chain[chain.length - 1].name) ?? null;
};

/** values for a string argument: `.material('|')`, `s3d.view('|')`, `.extrude(1, '|')` … */
const argumentValues = (code: string, frame: Frame, context: JsContext, editor?: Editor): CompletionItem[] => {
  const chain = readChainBackward(code, frame.index, context.state); if (!chain) return [];
  const method = chain[chain.length - 1].name, index = frame.commas;
  const receiver = chain.length > 1 ? resolveChain(chain.slice(0, -1), context) : null;
  if (receiver === 'api') {
    if (method === 'material' && index === 0) return materialItems(editor);
    if (method === 'materials' && index === 0) return categoryItems();
    if (method === 'tag' && index === 0) return tagItems(editor);
    if (method === 'view' && index === 0) return VIEWS();
    if (method === 'rect' && index === 3) return PLANES();
    if ((method === 'polygon' && index === 3) || (method === 'arc' && index === 5)) return AXES();
    return [];
  }
  // unknown receivers (loop variables …) still get materials for .material('…')
  if ((method === 'material' || method === 'backMaterial') && index === 0 && receiver !== 'component') return materialItems(editor);
  if (method === 'tag' && index === 0) return tagItems(editor);
  if (method === 'rotate' && index === 1) return AXES();
  if (method === 'extrude' && index === 1) return DIRECTIONS();
  return [];
};

const JS_KEYWORDS = ['const', 'let', 'for', 'of', 'if', 'else', 'function', 'return', 'new', 'true', 'false', 'null', 'while', 'break', 'continue'];

const identifierItems = (context: JsContext): CompletionItem[] => {
  const items: CompletionItem[] = [
    { label: 's3d', kind: 'variable', detail: 'Skript-API', description: 'Die Skript-API von Shap3D.ai – Körper, Flächen, Gruppen, Materialien, Ansicht.' },
    { label: 'Math', kind: 'variable', detail: 'JavaScript', description: 'Mathematik: Math.sin, Math.cos, Math.PI …' },
    { label: 'THREE', kind: 'variable', detail: 'three.js', description: 'Die Bibliothek three.js (Vector3, Matrix4 …).' },
    { label: 'console', kind: 'variable', detail: 'JavaScript', description: 'console.log(…) schreibt in die Konsole unter dem Editor.' },
  ];
  const seen = new Set(items.map(item => item.label));
  const before = context.code.slice(0, context.offset);
  for (const match of before.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    if (seen.has(match[1])) continue; seen.add(match[1]);
    const type = identifierType(match[1], context, 0);
    items.push({ label: match[1], kind: 'variable', detail: type === 'group' ? 'Gruppe' : type === 'face' ? 'Fläche' : type === 'component' ? 'Komponente' : 'Variable' });
  }
  for (const keyword of JS_KEYWORDS) items.push({ label: keyword, kind: 'keyword' });
  return items;
};

const completeJs = (code: string, offset: number, editor?: Editor): CompletionResult | null => {
  const state = scan(code, offset, false);
  if (state.comment) return null;
  const context: JsContext = { code, offset, state };
  const top = state.stack.length - 1, frame = state.stack[top];

  if (state.string) {
    const { quote, start } = state.string;
    const content = code.slice(start + 1, offset), to = stringEnd(code, offset, quote);
    const before = prevSignificant(code, start);
    let values: CompletionItem[] = [];
    if (frame?.char === '{' && code[before] === ':') { if (optionsMethod(code, top, context)) values = optionValues(keyBefore(code, before), editor); }
    else if (frame?.char === '(' && (code[before] === '(' || code[before] === ',')) values = argumentValues(code, frame, context, editor);
    values = values.filter(item => item.kind !== 'keyword');
    if (!values.length) values = unitValues(content);
    if (!values.length) return null;
    const items = values.map(item => ({ ...item, insert: quote + (item.insert ?? item.label) + quote, caret: undefined }));
    return { from: start, to, word: content, context: 'string', items: rank(items, content) };
  }

  const word = identBefore(code, offset), from = offset - word.length;
  if (/^\d/.test(word)) return null;
  const before = prevSignificant(code, from), previous = code[before];
  if (previous === '.') {
    const chain = readChainBackward(code, before, state); if (!chain) return null;
    const type = resolveChain(chain, context); if (!type) return null;
    return { from, to: offset, word, context: 'member', items: rank(memberItems(type, code, offset), word) };
  }
  if (frame?.char === '{') {
    const method = optionsMethod(code, top, context);
    if (method && (previous === '{' || previous === ',')) {
      const used = new Set([...code.slice(frame.index, from).matchAll(/([\w$]+)\s*:/g)].map(match => match[1]));
      const items: CompletionItem[] = optionKeys(method).filter(key => !used.has(key)).map(key => ({
        label: key, kind: 'option', insert: /^\s*:/.test(code.slice(offset)) ? key : `${key}: `, detail: method.name, description: OPTION_INFO[key], signature: method.signature,
      }));
      return items.length ? { from, to: offset, word, context: 'option', items: rank(items, word) } : null;
    }
    if (method && previous === ':') {
      const values = optionValues(keyBefore(code, before), editor);
      const items = values.map(item => ({ ...item, insert: item.kind === 'keyword' ? item.label : `'${item.insert ?? item.label}'` }));
      if (items.length) return { from, to: offset, word, context: 'value', items: rank(items, word) };
    }
  }
  if (/\b(?:const|let|var|function)\s+$/.test(code.slice(Math.max(0, from - 12), from))) return null;
  return { from, to: offset, word, context: 'identifier', items: rank(identifierItems(context), word) };
};

// ---------------------------------------------------------------- JSON
const JSON_NODES: Record<string, { label: string; keys: string[] }> = {
  box: { label: 'Quader', keys: ['at', 'size', 'name', 'material', 'group'] },
  cylinder: { label: 'Zylinder', keys: ['at', 'radius', 'height', 'segments', 'name', 'material', 'group'] },
  sphere: { label: 'Kugel', keys: ['at', 'radius', 'segments', 'name', 'material'] },
  rect: { label: 'Rechteck', keys: ['at', 'size', 'plane', 'pushpull', 'material'] },
  circle: { label: 'Kreis', keys: ['at', 'radius', 'segments', 'normal', 'pushpull'] },
  polygon: { label: 'Vieleck', keys: ['at', 'radius', 'sides', 'normal', 'pushpull'] },
  face: { label: 'Fläche aus Punkten', keys: ['points', 'material', 'pushpull'] },
  line: { label: 'Linienzug', keys: ['points', 'closed'] },
  polyhedron: { label: 'Flächen aus Punktliste', keys: ['points', 'faces', 'material'] },
  text3d: { label: '3D-Text (Plugin)', keys: ['text', 'at', 'size', 'depth', 'material', 'upright', 'filled', 'font'] },
  group: { label: 'Gruppe', keys: ['name', 'children'] },
  array: { label: 'Reihe von Kopien', keys: ['count', 'offset', 'object'] },
  guide: { label: 'Hilfslinie / -punkt', keys: ['at', 'direction'] },
  label: { label: 'Beschriftung', keys: ['at', 'text'] },
  dimension: { label: 'Bemaßung', keys: ['from', 'to', 'offset'] },
};
/** keys every node that becomes a group understands */
const JSON_GROUP_KEYS = ['material', 'rotate', 'scale', 'move', 'tag'];
const JSON_GROUP_TYPES = ['box', 'cylinder', 'sphere', 'text3d', 'group'];
const JSON_ROOT_KEYS = ['objects', 'materials', 'clear', 'view', 'zoomExtents'];
const JSON_ROTATE_KEYS = ['angle', 'axis', 'center'];

const text3dActive = () => apiMethods().has('text3d');

/** the text of an object without its nested objects and arrays – to find its own keys and "type" */
const ownText = (code: string, openIndex: number) => {
  let depth = 0, out = '';
  for (let i = openIndex; i < code.length; i++) {
    const char = code[i];
    if (char === '"') {
      let j = i + 1; while (j < code.length && code[j] !== '"' && code[j] !== '\n') j += code[j] === '\\' ? 2 : 1;
      if (depth === 1) out += code.slice(i, j + 1);
      i = j; continue;
    }
    if (char === '{' || char === '[') { depth++; continue; }
    if (char === '}' || char === ']') { depth--; if (depth === 0) break; continue; }
    if (depth === 1) out += char;
  }
  return out;
};

/** the key an object or array sits under: `"objects": [ { | } ]` → objects */
const jsonParentKey = (code: string, stack: Frame[], index: number): string => {
  const before = prevSignificant(code, stack[index].index);
  if (code[before] === ':') return keyBefore(code, before);
  if ((code[before] === '[' || code[before] === ',') && stack[index - 1]?.char === '[') return jsonParentKey(code, stack, index - 1);
  return '';
};

const jsonKeys = (code: string, state: Scan): string[] => {
  const top = state.stack.length - 1;
  if (top === 0) return JSON_ROOT_KEYS;
  const parent = jsonParentKey(code, state.stack, top);
  if (parent === 'rotate') return JSON_ROTATE_KEYS;
  if (parent !== 'objects' && parent !== 'children' && parent !== 'object') return [];
  const type = /"type"\s*:\s*"(\w+)"/.exec(ownText(code, state.stack[top].index))?.[1];
  const node = type ? JSON_NODES[type] : undefined;
  if (!node) return ['type', ...new Set(Object.values(JSON_NODES).flatMap(candidate => candidate.keys)), ...JSON_GROUP_KEYS];
  return [...node.keys, ...(JSON_GROUP_TYPES.includes(type!) ? JSON_GROUP_KEYS.filter(key => !node.keys.includes(key)) : [])];
};

const jsonValues = (key: string, editor?: Editor): CompletionItem[] => {
  if (key === 'type') return Object.entries(JSON_NODES).filter(([type]) => type !== 'text3d' || text3dActive()).map(([type, node]) => ({ label: type, kind: 'type', detail: node.label, description: `Schlüssel: ${node.keys.join(', ')}` }));
  return optionValues(key, editor);
};

const completeJson = (code: string, offset: number, editor?: Editor): CompletionResult | null => {
  const state = scan(code, offset, true);
  const frame = state.stack[state.stack.length - 1]; if (!frame) return null;
  const inString = !!state.string;
  const from = state.string ? state.string.start : offset - identBefore(code, offset).length;
  const word = state.string ? code.slice(from + 1, offset) : code.slice(from, offset);
  const to = state.string ? stringEnd(code, offset, '"') : offset;
  const before = prevSignificant(code, from), previous = code[before];
  if (frame.char === '{' && (previous === '{' || previous === ',')) {
    const used = new Set([...ownText(code, frame.index).matchAll(/"(\w+)"\s*:/g)].map(match => match[1]));
    const colonFollows = /^\s*:/.test(code.slice(to));
    const items: CompletionItem[] = jsonKeys(code, state).filter(key => !used.has(key)).map(key => ({ label: key, kind: 'option', insert: colonFollows ? `"${key}"` : `"${key}": `, description: OPTION_INFO[key] }));
    return items.length ? { from, to, word, context: 'key', items: rank(items, word) } : null;
  }
  if (previous === ':') {
    const values = jsonValues(keyBefore(code, before), editor).filter(item => !inString || item.kind !== 'keyword');
    const items = values.map(item => ({ ...item, insert: item.kind === 'keyword' ? item.label : `"${item.insert ?? item.label}"` }));
    return items.length ? { from, to, word, context: inString ? 'string' : 'value', items: rank(items, word) } : null;
  }
  return null;
};

// ---------------------------------------------------------------- plugin languages
const completeLanguage = (lang: string, code: string, offset: number): CompletionResult | null => {
  const providers = LANGUAGE_PROVIDERS.filter(entry => entry.language === lang);
  if (!providers.length || !findScriptLanguage(lang)) return null;
  const lineStart = code.lastIndexOf('\n', offset - 1) + 1;
  if (code.slice(lineStart, offset).includes('//')) return null;
  const word = identBefore(code, offset);
  if (/^\d/.test(word)) return null;
  const items = providers.flatMap(({ provider }) => { try { return provider({ code, offset, word }); } catch (error) { console.error(error); return []; } })
    .map(candidate => toItem(candidate, 'keyword'));
  return { from: offset - word.length, to: offset, word, context: 'language', items: rank(items, word) };
};

/** Suggestions at `offset` – null when there is nothing to complete there. */
export const complete = (lang: string, code: string, offset: number, editor?: Editor): CompletionResult | null => {
  if (lang === 'js') return completeJs(code, offset, editor);
  if (lang === 'json') return completeJson(code, offset, editor);
  if (lang === 'obj') return null;
  return completeLanguage(lang, code, offset);
};

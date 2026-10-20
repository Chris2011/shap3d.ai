import { t, localize, hasMessage, messagesOf, SOURCE_LANGUAGE } from '../i18n';
import type { Editor } from '../engine/editor';
import { API_CATALOG, categoryLabel, type ApiEntry } from './catalog';
import { MATERIAL_LIBRARY, MATERIAL_CATEGORIES, categoryLabel as materialCategoryLabel } from '../core/materialLibrary';
import { TEXTURES } from '../core/textures';
import { findScriptLanguage, type CompletionKind, type CompletionProvider, type ScriptCompletion } from './languages';

/**
 * Code completion for the script editor: JavaScript (s3d API, handles, options, values), JSON
 * (types, keys, values) and plugin languages (their own `completions`). No parser – a forward scan
 * finds strings, comments and open brackets, the rest are small backward/forward reads.
 */
export interface CompletionItem extends ScriptCompletion {
  kind: CompletionKind;
  /** caret position inside `insert` (default: its end) */ caret?: number;
}
export type CompletionContext = 'member' | 'option' | 'value' | 'string' | 'identifier' | 'key' | 'language';
export interface CompletionResult {
  from: number;
  to: number;
  word: string;
  context: CompletionContext;
  items: CompletionItem[];
}

// ---------------------------------------------------------------- values contributed by plugins
interface ValueSource {
  option: string;
  values: () => (string | ScriptCompletion)[];
}
const VALUE_SOURCES: ValueSource[] = [];

/** Suggestions for an option value (`{ font: '…' }` in JavaScript, `"font": "…"` in JSON) – e.g. the fonts of the 3D-text plugin. */
export const registerCompletionValues = (option: string, values: () => (string | ScriptCompletion)[]) => {
  const source = { option, values };
  VALUE_SOURCES.push(source);
  return () => {
    const index = VALUE_SOURCES.indexOf(source);
    if (index >= 0) {
      VALUE_SOURCES.splice(index, 1);
    }
  };
};

// ---------------------------------------------------------------- completions for plugin languages
const LANGUAGE_PROVIDERS: { language: string; provider: CompletionProvider }[] = [];

/** Suggestions for a script language registered by a plugin (e.g. OpenSCAD's keywords) – several providers per language add up. */
export const registerLanguageCompletions = (language: string, provider: CompletionProvider) => {
  if (['js', 'json', 'obj'].includes(language)) {
    throw new Error(t('completion.ownSuggestions', { language }));
  }
  const entry = { language, provider };
  LANGUAGE_PROVIDERS.push(entry);
  return () => {
    const index = LANGUAGE_PROVIDERS.indexOf(entry);
    if (index >= 0) {
      LANGUAGE_PROVIDERS.splice(index, 1);
    }
  };
};

const toItem = (candidate: string | ScriptCompletion, kind: CompletionKind): CompletionItem =>
  typeof candidate === 'string' ? { label: candidate, kind } : { ...candidate, kind: candidate.kind ?? kind };

// ---------------------------------------------------------------- fuzzy ranking
/** 0/1 = prefix (exact case first), 2 = start of a word part, 3 = substring, 4 = letters in order; -1 = no match */
const matchScore = (label: string, word: string): number => {
  if (!word) {
    return 0;
  }
  const lower = label.toLowerCase(),
    query = word.toLowerCase();
  if (lower.startsWith(query)) {
    return label.startsWith(word) ? 0 : 1;
  }
  for (let i = 1; i < label.length; i++) {
    const boundary = /[\s_\-:.]/.test(label[i - 1]) || (/[a-z]/.test(label[i - 1]) && /[A-Z]/.test(label[i]));
    if (boundary && lower.startsWith(query, i)) {
      return 2;
    }
  }
  // a single letter only matches the start of a word – otherwise nearly everything would
  if (query.length < 2) {
    return -1;
  }
  if (lower.includes(query)) {
    return 3;
  }
  if (lower[0] !== query[0]) {
    return -1;
  }
  let position = 0;
  for (const char of query) {
    position = lower.indexOf(char, position);
    if (position < 0) {
      return -1;
    }
    position++;
  }
  return 4;
};

const rank = (items: CompletionItem[], word: string) =>
  items
    .map((item, order) => ({ item, order, score: matchScore(item.label, word) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.order - b.order)
    .slice(0, 200)
    .map((entry) => entry.item);

// ---------------------------------------------------------------- scanning
interface Frame {
  char: string;
  index: number;
  commas: number;
}
interface Scan {
  stack: Frame[];
  openToClose: Map<number, number>;
  closeToOpen: Map<number, number>;
  string: { quote: string; start: number } | null;
  comment: boolean;
}

/** Walks the code up to `end`: open brackets (with their comma count), bracket pairs, and whether `end` is in a string or comment. */
const scan = (code: string, end: number, json: boolean): Scan => {
  const result: Scan = { stack: [], openToClose: new Map(), closeToOpen: new Map(), string: null, comment: false };
  let i = 0;
  while (i < end) {
    const char = code[i];
    if (!json && char === '/' && code[i + 1] === '/') {
      const lineEnd = code.indexOf('\n', i);
      if (lineEnd < 0 || lineEnd >= end) {
        result.comment = true;
        return result;
      }
      i = lineEnd;
      continue;
    }
    if (!json && char === '/' && code[i + 1] === '*') {
      const close = code.indexOf('*/', i + 2);
      if (close < 0 || close + 2 > end) {
        result.comment = true;
        return result;
      }
      i = close + 2;
      continue;
    }
    if (char === '"' || (!json && (char === "'" || char === '`'))) {
      let j = i + 1;
      // oxlint-disable-next-line no-unmodified-loop-condition -- `char` is the fixed quote; `j` advances
      while (j < end && code[j] !== char && !(char !== '`' && code[j] === '\n')) {
        j += code[j] === '\\' ? 2 : 1;
      }
      if (j >= end) {
        result.string = { quote: char, start: i };
        return result;
      }
      i = code[j] === '\n' ? j : j + 1; // an unterminated string ends with its line
      continue;
    }
    if (char === '(' || char === '[' || char === '{') {
      result.stack.push({ char, index: i, commas: 0 });
    } else if (char === ')' || char === ']' || char === '}') {
      const frame = result.stack.pop();
      if (frame) {
        result.openToClose.set(frame.index, i);
        result.closeToOpen.set(i, frame.index);
      }
    } else if (char === ',' && result.stack.length) {
      result.stack[result.stack.length - 1].commas++;
    }
    i++;
  }
  return result;
};

const IDENT_CHAR = /[\w$À-ɏ]/;
const identBefore = (code: string, offset: number) => {
  let start = offset;
  while (start > 0 && IDENT_CHAR.test(code[start - 1])) {
    start--;
  }
  return code.slice(start, offset);
};
/** index of the last non-whitespace character before `index` (-1 if none) */
const prevSignificant = (code: string, index: number) => {
  let i = index - 1;
  while (i >= 0 && /\s/.test(code[i])) {
    i--;
  }
  return i;
};
/** the key in front of a colon: `material:` or `"material":` */
const keyBefore = (code: string, colonIndex: number) =>
  /["'`]?([\w$]+)["'`]?\s*$/.exec(code.slice(Math.max(0, colonIndex - 60), colonIndex))?.[1] ?? '';
/** end of the string the cursor is in: after its closing quote on the same line, or the cursor itself */
const stringEnd = (code: string, offset: number, quote: string) => {
  for (let i = offset; i < code.length; i++) {
    if (code[i] === '\\') {
      i++;
      continue;
    }
    if (code[i] === quote) {
      return i + 1;
    }
    if (code[i] === '\n' && quote !== '`') {
      return offset;
    }
  }
  return offset;
};

interface Segment {
  name: string;
  call: boolean;
}
/** reads `a.b(…).c` backwards from `end` (exclusive) */
const readChainBackward = (code: string, end: number, state: Scan): Segment[] | null => {
  const segments: Segment[] = [];
  let i = end;
  for (;;) {
    while (i > 0 && /\s/.test(code[i - 1])) {
      i--;
    }
    let call = false;
    if (code[i - 1] === ')') {
      const open = state.closeToOpen.get(i - 1);
      if (open == null) {
        return null;
      }
      i = open;
      call = true;
      while (i > 0 && /\s/.test(code[i - 1])) {
        i--;
      }
    }
    let start = i;
    while (start > 0 && IDENT_CHAR.test(code[start - 1])) {
      start--;
    }
    const name = code.slice(start, i);
    if (!name || /^\d/.test(name)) {
      return null;
    }
    segments.unshift({ name, call });
    i = start;
    while (i > 0 && /\s/.test(code[i - 1])) {
      i--;
    }
    if (code[i - 1] === '.') {
      i--;
      continue;
    }
    return segments;
  }
};
/** reads `a.b(…).c` forwards from `start` (right side of a declaration) */
const readChainForward = (code: string, start: number, state: Scan): Segment[] | null => {
  const segments: Segment[] = [];
  let i = start;
  const skip = () => {
    while (i < code.length && /\s/.test(code[i])) {
      i++;
    }
  };
  for (;;) {
    skip();
    const match = /^[A-Za-z_$][\w$]*/.exec(code.slice(i, i + 80));
    if (!match) {
      return segments.length ? segments : null;
    }
    i += match[0].length;
    skip();
    let call = false;
    if (code[i] === '(') {
      const close = state.openToClose.get(i);
      if (close == null) {
        return null;
      }
      call = true;
      i = close + 1;
      skip();
    }
    segments.push({ name: match[0], call });
    if (code[i] === '.') {
      i++;
      continue;
    }
    return segments;
  }
};

// ---------------------------------------------------------------- the s3d API and its handles
const API_NAMES = ['s3d', 'su', 'fw'];
type ValueType = 'api' | 'group' | 'face' | 'component' | 'math' | 'console';
/** returns/description may be message keys (API_EXTRAS); returnsKey is the untranslated return value for the type checks */
interface ApiMethod {
  name: string;
  signature: string;
  entry?: ApiEntry;
  returns?: string;
  returnsKey?: string;
  description?: string;
}

/** ScriptApi members that have no entry of their own in the API reference */
// i18n-ignore-start – signatures are part of the s3d API
const API_EXTRAS: ApiMethod[] = [
  { name: 'point', signature: 's3d.point(x, y, z)', returns: 'api.returns.punkt', description: 'completion.api.point' },
  { name: 'meters', signature: 's3d.meters(x)', returns: 'api.returns.zahl', description: 'completion.api.meters' },
  { name: 'length', signature: "s3d.length('50cm')", returns: 'api.returns.zahl', description: 'completion.api.length' },
  { name: 'warn', signature: 's3d.warn(…)', description: 'completion.api.warn' },
  {
    name: 'pushpull',
    signature: 's3d.pushpull(fläche, abstand)',
    returns: 'api.returns.deckflaeche',
    description: 'completion.api.pushpull',
  },
  { name: 'textures', signature: 's3d.textures()', returns: 'api.returns.namen', description: 'completion.api.textures' },
  {
    name: 'polyline',
    signature: 's3d.polyline(punkte, geschlossen)',
    returns: 'api.returns.flaeche',
    description: 'completion.api.polyline',
  },
  { name: 'zoomExtents', signature: 's3d.zoomExtents()', description: 'completion.api.zoomExtents' },
];

// i18n-ignore-end

/** every `s3d.<name>(` the API reference documents, including the ones plugins add at runtime */
const apiMethods = () => {
  const methods = new Map<string, ApiMethod>();
  for (const entry of API_CATALOG) {
    for (const part of entry.signature.split(/\s{2,}/)) {
      for (const match of part.matchAll(/\bs3d\.(\w+)\s*\(/g)) {
        if (!methods.has(match[1])) {
          methods.set(match[1], {
            name: match[1],
            signature: part.trim(),
            entry,
            returns: entry.returns,
            returnsKey: entry.returnsKey ?? entry.returns,
            description: entry.desc,
          });
        }
      }
    }
  }
  for (const extra of API_EXTRAS) {
    if (!methods.has(extra.name)) {
      methods.set(extra.name, {
        ...extra,
        returnsKey: extra.returns,
        returns: extra.returns && localize(extra.returns),
        description: localize(extra.description),
      });
    }
  }
  return methods;
};

/** description and detail are message keys */
interface Member {
  name: string;
  call: boolean;
  signature: string;
  description: string;
  returns?: ValueType;
  detail?: string;
}
const GROUP_MEMBERS: Member[] = [
  {
    name: 'move',
    call: true,
    signature: 'g.move([dx, dy, dz])',
    description: 'completion.members.group.move',
    returns: 'group',
    detail: 'completion.types.gruppe',
  },
  {
    name: 'moveTo',
    call: true,
    signature: 'g.moveTo([x, y, z])',
    description: 'completion.members.group.moveTo',
    returns: 'group',
    detail: 'completion.types.gruppe',
  },
  {
    name: 'rotate',
    call: true,
    signature: "g.rotate(grad, achse = 'z', zentrum?)",
    description: 'completion.members.group.rotate',
    returns: 'group',
    detail: 'completion.types.gruppe',
  },
  {
    name: 'scale',
    call: true,
    signature: 'g.scale(faktor | [fx, fy, fz], zentrum?)',
    description: 'completion.members.group.scale',
    returns: 'group',
    detail: 'completion.types.gruppe',
  },
  {
    name: 'material',
    call: true,
    signature: 'g.material(name)',
    description: 'completion.members.group.material',
    returns: 'group',
    detail: 'completion.types.gruppe',
  },
  {
    name: 'tag',
    call: true,
    signature: 'g.tag(name)',
    description: 'completion.members.group.tag',
    returns: 'group',
    detail: 'completion.types.gruppe',
  },
  {
    name: 'hide',
    call: true,
    signature: 'g.hide()',
    description: 'completion.members.group.hide',
    returns: 'group',
    detail: 'completion.types.gruppe',
  },
  {
    name: 'copy',
    call: true,
    signature: 'g.copy([dx, dy, dz])',
    description: 'completion.members.group.copy',
    returns: 'group',
    detail: 'completion.types.gruppe',
  },
  {
    name: 'explode',
    call: true,
    signature: 'g.explode()',
    description: 'completion.members.group.explode',
    detail: 'completion.types.zahl',
  },
  { name: 'ref', call: true, signature: 'g.ref()', description: 'completion.members.group.ref' },
  { name: 'name', call: false, signature: 'g.name', description: 'completion.members.group.name', detail: 'completion.types.text' },
  { name: 'entities', call: false, signature: 'g.entities', description: 'completion.members.group.entities' },
];
// i18n-ignore-start – signatures are part of the s3d API
const FACE_MEMBERS: Member[] = [
  {
    name: 'pushpull',
    call: true,
    signature: 'fläche.pushpull(abstand)',
    description: 'completion.members.face.pushpull',
    returns: 'face',
    detail: 'completion.types.deckflaeche',
  },
  {
    name: 'extrude',
    call: true,
    signature: "fläche.extrude(abstand, richtung = 'z')",
    description: 'completion.members.face.extrude',
    returns: 'face',
    detail: 'completion.types.deckflaeche',
  },
  {
    name: 'offset',
    call: true,
    signature: 'fläche.offset(abstand)',
    description: 'completion.members.face.offset',
    returns: 'face',
    detail: 'completion.types.flaeche',
  },
  {
    name: 'followMe',
    call: true,
    signature: 'fläche.followMe(pfadPunkte, geschlossen)',
    description: 'completion.members.face.followMe',
    returns: 'face',
    detail: 'completion.types.flaeche',
  },
  {
    name: 'material',
    call: true,
    signature: 'fläche.material(name)',
    description: 'completion.members.face.material',
    returns: 'face',
    detail: 'completion.types.flaeche',
  },
  {
    name: 'backMaterial',
    call: true,
    signature: 'fläche.backMaterial(name)',
    description: 'completion.members.face.backMaterial',
    returns: 'face',
    detail: 'completion.types.flaeche',
  },
  {
    name: 'reverse',
    call: true,
    signature: 'fläche.reverse()',
    description: 'completion.members.face.reverse',
    returns: 'face',
    detail: 'completion.types.flaeche',
  },
  { name: 'ref', call: true, signature: 'fläche.ref()', description: 'completion.members.face.ref' },
  { name: 'area', call: false, signature: 'fläche.area', description: 'completion.members.face.area', detail: 'completion.types.zahl' },
  {
    name: 'normal',
    call: false,
    signature: 'fläche.normal',
    description: 'completion.members.face.normal',
    detail: 'completion.types.vektor',
  },
  {
    name: 'exists',
    call: false,
    signature: 'fläche.exists',
    description: 'completion.members.face.exists',
    detail: 'completion.types.jaNein',
  },
];
// i18n-ignore-end
const COMPONENT_MEMBERS: Member[] = [
  {
    name: 'place',
    call: true,
    signature: 'komponente.place(ort, drehGrad, skalierung)',
    description: 'completion.members.component.place',
    returns: 'group',
    detail: 'completion.types.gruppe',
  },
  { name: 'def', call: false, signature: 'komponente.def', description: 'completion.members.component.def' },
];
const MATH_MEMBERS: Member[] = [
  'PI',
  'sin',
  'cos',
  'tan',
  'atan2',
  'sqrt',
  'abs',
  'min',
  'max',
  'round',
  'floor',
  'ceil',
  'hypot',
  'pow',
  'random',
  'sign',
].map((name) => ({
  name,
  call: name !== 'PI',
  signature: `Math.${name}${name === 'PI' ? '' : '(…)'}`,
  description: name === 'PI' ? 'completion.math.pi' : 'completion.math.function',
}));
const CONSOLE_MEMBERS: Member[] = ['log', 'warn', 'error', 'info'].map((name) => ({
  name,
  call: true,
  signature: `console.${name}(…)`,
  description: 'completion.console',
}));
const MEMBERS: Record<Exclude<ValueType, 'api'>, Member[]> = {
  group: GROUP_MEMBERS,
  face: FACE_MEMBERS,
  component: COMPONENT_MEMBERS,
  math: MATH_MEMBERS,
  console: CONSOLE_MEMBERS,
};

/** source (English) text of a return value given as key – plugins may also give plain German or English text */
const sourceText = (text?: string) => (text && hasMessage(text) ? messagesOf(SOURCE_LANGUAGE)[text] : text);

const returnsType = (key?: string): ValueType | null => {
  const returns = sourceText(key);
  if (!returns) {
    return null;
  }
  if (/^(Group|Gruppe)/.test(returns)) {
    return 'group';
  } // i18n-ignore – plain texts from plugins may be German
  if (/face|Fläche/i.test(returns)) {
    return 'face';
  } // i18n-ignore – plain texts from plugins may be German
  if (/place/.test(returns)) {
    return 'component';
  }
  return null;
};

interface JsContext {
  code: string;
  offset: number;
  state: Scan;
}

const identifierType = (name: string, context: JsContext, depth: number): ValueType | null => {
  if (API_NAMES.includes(name)) {
    return 'api';
  }
  if (name === 'Math') {
    return 'math';
  }
  if (name === 'console') {
    return 'console';
  }
  if (depth > 4) {
    return null;
  }
  const escaped = name.replace(/\$/g, '\\$');
  const before = context.code.slice(0, context.offset);
  // the callback of s3d.group / s3d.component gets the API: s3d.group('Tisch', api => { api.… })
  if (new RegExp(`\\.(?:group|component)\\s*\\([^()]*?,\\s*\\(?\\s*${escaped}\\s*\\)?\\s*=>`).test(before)) {
    return 'api';
  }
  let declaration: RegExpExecArray | null = null;
  const pattern = new RegExp(`\\b(?:const|let|var)\\s+${escaped}\\s*=\\s*`, 'g');
  for (let match; (match = pattern.exec(before));) {
    declaration = match;
  }
  if (!declaration) {
    return null;
  }
  const chain = readChainForward(context.code, declaration.index + declaration[0].length, context.state);
  return chain ? resolveChain(chain, context, depth + 1) : null;
};

const resolveChain = (segments: Segment[], context: JsContext, depth = 0): ValueType | null => {
  const [first, ...rest] = segments;
  let type = first.call ? null : identifierType(first.name, context, depth);
  for (const segment of rest) {
    if (!type) {
      return null;
    }
    if (type === 'api') {
      type = segment.call ? returnsType(apiMethods().get(segment.name)?.returnsKey) : null;
      continue;
    }
    const member = MEMBERS[type].find((candidate) => candidate.name === segment.name);
    type = member && member.call === segment.call ? (member.returns ?? null) : null;
  }
  return type;
};

/** `name()` with the caret between the brackets – unless a bracket follows already */
const callInsert = (name: string, code: string, to: number) =>
  code[to] === '(' ? { insert: name } : { insert: `${name}()`, caret: name.length + 1 };

const memberItems = (type: ValueType, code: string, to: number): CompletionItem[] => {
  if (type === 'api') {
    const items: CompletionItem[] = [...apiMethods().values()].map((method) => ({
      label: method.name,
      kind: 'method',
      ...callInsert(method.name, code, to),
      detail: method.returns ?? (method.entry && categoryLabel(method.entry.category)),
      signature: method.signature,
      description: method.description,
      example: method.entry?.example,
    }));
    items.push({ label: 'THREE', kind: 'property', detail: 'three.js', description: t('completion.three') });
    return items;
  }
  return MEMBERS[type].map((member) => ({
    label: member.name,
    kind: member.call ? 'method' : 'property',
    ...(member.call ? callInsert(member.name, code, to) : {}),
    detail: member.detail && t(member.detail),
    signature: member.signature,
    description: t(member.description),
  }));
};

// ---------------------------------------------------------------- option keys and values
/** what an option does: message `completion.options.<key>` */
const optionInfo = (key: string) => (hasMessage(`completion.options.${key}`) ? t(`completion.options.${key}`) : undefined);

const BOOLEAN_KEYS = ['group', 'yUp', 'upright', 'filled', 'xray', 'edges', 'skirt', 'closed', 'clear', 'zoomExtents'];
/** methods whose options also take `group: false` */
const GROUP_OPTION = ['box', 'cylinder', 'cylinderBetween'];

const optionKeys = (method: ApiMethod): string[] => {
  const match = /\{([^{}]*)\}[^{}]*$/.exec(method.signature);
  if (!match || match[1].includes('…')) {
    return [];
  }
  const keys = match[1]
    .split(',')
    .map((key) => key.trim().replace(/[?:=\s].*$/, ''))
    .filter((key) => /^\w+$/.test(key));
  if (/^(Group|Gruppe)$/.test(sourceText(method.returnsKey) ?? '') && keys.length && !keys.includes('name')) {
    keys.push('name');
  } // i18n-ignore – plain texts from plugins may be German
  if (GROUP_OPTION.includes(method.name)) {
    keys.push('group');
  }
  return keys;
};

const plainValues = (values: string[], descriptions: Record<string, string> = {}): CompletionItem[] =>
  values.map((value) => ({ label: value, kind: 'value', description: descriptions[value] }));
const AXES = () => plainValues(['x', 'y', 'z'], { x: t('completion.axes.x'), y: t('completion.axes.y'), z: t('completion.axes.z') });
const DIRECTIONS = () => plainValues(['x', 'y', 'z', '-x', '-y', '-z']);
const PLANES = () =>
  plainValues(['xy', 'xz', 'yz'], { xy: t('completion.planes.xy'), xz: t('completion.planes.xz'), yz: t('completion.planes.yz') });
const VIEWS = () =>
  plainValues(['iso', 'top', 'front', 'back', 'left', 'right', 'bottom'], {
    iso: t('completion.views.iso'),
    top: t('commands.view-top'),
    front: t('commands.view-front'),
    back: t('commands.view-back'),
    left: t('commands.view-left'),
    right: t('commands.view-right'),
    bottom: t('commands.view-bottom'),
  });
const FACE_STYLES = () =>
  plainValues(['textured', 'shaded', 'monochrome', 'hiddenline', 'wireframe'], {
    textured: t('completion.faceStyles.textured'),
    shaded: t('commands.style-shaded'),
    monochrome: t('completion.faceStyles.monochrome'),
    hiddenline: t('commands.style-hiddenline'),
    wireframe: t('commands.style-wireframe'),
  });
const BOOLEANS = (): CompletionItem[] => [
  { label: 'true', kind: 'keyword' },
  { label: 'false', kind: 'keyword' },
];
const textureItems = (): CompletionItem[] => Object.entries(TEXTURES).map(([id, label]) => ({ label: id, kind: 'value', detail: label }));
const categoryItems = (): CompletionItem[] =>
  MATERIAL_CATEGORIES.map((category) => ({ label: category, kind: 'value', detail: t('completion.category') }));
const tagItems = (editor?: Editor): CompletionItem[] =>
  (editor?.model.tags ?? []).map((tag) => ({
    label: tag.name,
    kind: 'value',
    detail: tag.visible ? t('completion.tag') : t('completion.tagHidden'),
    color: tag.color,
  }));

/** the ready-made materials and the ones in the current model, with their colour */
const materialItems = (editor?: Editor): CompletionItem[] => {
  const library = new Set(MATERIAL_LIBRARY.map((material) => material.name));
  const modelMaterials = editor?.model.materials ?? [];
  const inModel = new Set(modelMaterials.map((material) => material.name));
  const items: CompletionItem[] = modelMaterials
    .filter((material) => !library.has(material.name))
    .map((material) => ({
      label: material.name,
      kind: 'material',
      color: material.color,
      detail: t('completion.inModel'),
      description: material.texture
        ? t('completion.ownMaterialTexture', { texture: TEXTURES[material.texture as keyof typeof TEXTURES] ?? material.texture })
        : t('completion.ownMaterial'),
    }));
  for (const material of MATERIAL_LIBRARY) {
    items.push({
      label: material.name,
      kind: 'material',
      color: material.color,
      detail: inModel.has(material.name)
        ? t('completion.categoryInModel', { category: materialCategoryLabel(material.category) })
        : materialCategoryLabel(material.category),
      description:
        [
          material.note,
          material.texture ? t('completion.texture', { texture: TEXTURES[material.texture] }) : '',
          material.opacity != null && material.opacity < 1 ? t('completion.opacity', { percent: Math.round(material.opacity * 100) }) : '',
        ]
          .filter(Boolean)
          .join(' · ') || undefined,
    });
  }
  return items;
};

const registryValues = (key: string) =>
  VALUE_SOURCES.filter((source) => source.option === key).flatMap((source) => {
    try {
      return source.values().map((value) => toItem(value, 'value'));
    } catch {
      return [];
    }
  });

const optionValues = (key: string, editor?: Editor): CompletionItem[] => {
  if (key === 'material' || key === 'backMaterial') {
    return materialItems(editor);
  }
  if (key === 'texture') {
    return textureItems();
  }
  if (key === 'normal' || key === 'axis') {
    return AXES();
  }
  if (key === 'faceStyle') {
    return FACE_STYLES();
  }
  if (key === 'plane') {
    return PLANES();
  }
  if (key === 'view') {
    return VIEWS();
  }
  if (key === 'tag') {
    return tagItems(editor);
  }
  if (BOOLEAN_KEYS.includes(key)) {
    return BOOLEANS();
  }
  return registryValues(key);
};

/** `'50` → '50mm', '50cm', '50m' */
const unitValues = (content: string): CompletionItem[] => {
  const match = /^(-?\d+(?:[.,]\d+)?)([a-z]*)$/i.exec(content);
  if (!match) {
    return [];
  }
  const UNITS: Record<string, string> = { mm: t('units.millimetres'), cm: t('units.centimetres'), m: t('units.metres') };
  return Object.entries(UNITS).map(([unit, label]) => ({
    label: match[1] + unit,
    kind: 'unit',
    detail: label,
    description: t('completion.units'),
  }));
};

// ---------------------------------------------------------------- JavaScript
/** the API method whose options object the frame is: `s3d.cylinder(…, { | })` */
const optionsMethod = (code: string, frameIndex: number, context: JsContext): ApiMethod | null => {
  const { stack } = context.state;
  const before = prevSignificant(code, stack[frameIndex].index);
  if (code[before] !== '(' && code[before] !== ',') {
    return null;
  }
  const parent = stack[frameIndex - 1];
  if (!parent || parent.char !== '(') {
    return null;
  }
  const chain = readChainBackward(code, parent.index, context.state);
  if (!chain || chain.length < 2) {
    return null;
  }
  if (resolveChain(chain.slice(0, -1), context) !== 'api') {
    return null;
  }
  return apiMethods().get(chain[chain.length - 1].name) ?? null;
};

/** values for a string argument: `.material('|')`, `s3d.view('|')`, `.extrude(1, '|')` … */
const argumentValues = (code: string, frame: Frame, context: JsContext, editor?: Editor): CompletionItem[] => {
  const chain = readChainBackward(code, frame.index, context.state);
  if (!chain) {
    return [];
  }
  const method = chain[chain.length - 1].name,
    index = frame.commas;
  const receiver = chain.length > 1 ? resolveChain(chain.slice(0, -1), context) : null;
  if (receiver === 'api') {
    if (method === 'material' && index === 0) {
      return materialItems(editor);
    }
    if (method === 'materials' && index === 0) {
      return categoryItems();
    }
    if (method === 'tag' && index === 0) {
      return tagItems(editor);
    }
    if (method === 'view' && index === 0) {
      return VIEWS();
    }
    if (method === 'rect' && index === 3) {
      return PLANES();
    }
    if ((method === 'polygon' && index === 3) || (method === 'arc' && index === 5)) {
      return AXES();
    }
    return [];
  }
  // unknown receivers (loop variables …) still get materials for .material('…')
  if ((method === 'material' || method === 'backMaterial') && index === 0 && receiver !== 'component') {
    return materialItems(editor);
  }
  if (method === 'tag' && index === 0) {
    return tagItems(editor);
  }
  if (method === 'rotate' && index === 1) {
    return AXES();
  }
  if (method === 'extrude' && index === 1) {
    return DIRECTIONS();
  }
  return [];
};

const JS_KEYWORDS = [
  'const',
  'let',
  'for',
  'of',
  'if',
  'else',
  'function',
  'return',
  'new',
  'true',
  'false',
  'null',
  'while',
  'break',
  'continue',
];

const identifierItems = (context: JsContext): CompletionItem[] => {
  const items: CompletionItem[] = [
    { label: 's3d', kind: 'variable', detail: t('completion.scriptApi'), description: t('completion.s3d') },
    { label: 'Math', kind: 'variable', detail: 'JavaScript', description: t('completion.mathObject') },
    { label: 'THREE', kind: 'variable', detail: 'three.js', description: t('completion.three') },
    { label: 'console', kind: 'variable', detail: 'JavaScript', description: t('completion.consoleObject') },
  ];
  const seen = new Set(items.map((item) => item.label));
  const before = context.code.slice(0, context.offset);
  for (const match of before.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    if (seen.has(match[1])) {
      continue;
    }
    seen.add(match[1]);
    const type = identifierType(match[1], context, 0);
    items.push({
      label: match[1],
      kind: 'variable',
      detail:
        type === 'group'
          ? t('names.group')
          : type === 'face'
            ? t('entityInfo.face')
            : type === 'component'
              ? t('names.component')
              : t('completion.kinds.variable'),
    });
  }
  for (const keyword of JS_KEYWORDS) {
    items.push({ label: keyword, kind: 'keyword' });
  }
  return items;
};

const completeJs = (code: string, offset: number, editor?: Editor): CompletionResult | null => {
  const state = scan(code, offset, false);
  if (state.comment) {
    return null;
  }
  const context: JsContext = { code, offset, state };
  const top = state.stack.length - 1,
    frame = state.stack[top];

  if (state.string) {
    const { quote, start } = state.string;
    const content = code.slice(start + 1, offset),
      to = stringEnd(code, offset, quote);
    const before = prevSignificant(code, start);
    let values: CompletionItem[] = [];
    if (frame?.char === '{' && code[before] === ':') {
      if (optionsMethod(code, top, context)) {
        values = optionValues(keyBefore(code, before), editor);
      }
    } else if (frame?.char === '(' && (code[before] === '(' || code[before] === ',')) {
      values = argumentValues(code, frame, context, editor);
    }
    values = values.filter((item) => item.kind !== 'keyword');
    if (!values.length) {
      values = unitValues(content);
    }
    if (!values.length) {
      return null;
    }
    const items = values.map((item) => ({ ...item, insert: quote + (item.insert ?? item.label) + quote, caret: undefined }));
    return { from: start, to, word: content, context: 'string', items: rank(items, content) };
  }

  const word = identBefore(code, offset),
    from = offset - word.length;
  if (/^\d/.test(word)) {
    return null;
  }
  const before = prevSignificant(code, from),
    previous = code[before];
  if (previous === '.') {
    const chain = readChainBackward(code, before, state);
    if (!chain) {
      return null;
    }
    const type = resolveChain(chain, context);
    if (!type) {
      return null;
    }
    return { from, to: offset, word, context: 'member', items: rank(memberItems(type, code, offset), word) };
  }
  if (frame?.char === '{') {
    const method = optionsMethod(code, top, context);
    if (method && (previous === '{' || previous === ',')) {
      const used = new Set([...code.slice(frame.index, from).matchAll(/([\w$]+)\s*:/g)].map((match) => match[1]));
      const items: CompletionItem[] = optionKeys(method)
        .filter((key) => !used.has(key))
        .map((key) => ({
          label: key,
          kind: 'option',
          insert: /^\s*:/.test(code.slice(offset)) ? key : `${key}: `,
          detail: method.name,
          description: optionInfo(key),
          signature: method.signature,
        }));
      return items.length ? { from, to: offset, word, context: 'option', items: rank(items, word) } : null;
    }
    if (method && previous === ':') {
      const values = optionValues(keyBefore(code, before), editor);
      const items = values.map((item) => ({ ...item, insert: item.kind === 'keyword' ? item.label : `'${item.insert ?? item.label}'` }));
      if (items.length) {
        return { from, to: offset, word, context: 'value', items: rank(items, word) };
      }
    }
  }
  if (/\b(?:const|let|var|function)\s+$/.test(code.slice(Math.max(0, from - 12), from))) {
    return null;
  }
  return { from, to: offset, word, context: 'identifier', items: rank(identifierItems(context), word) };
};

// ---------------------------------------------------------------- JSON
/** label = message key */
const JSON_NODES: Record<string, { label: string; keys: string[] }> = {
  box: { label: 'completion.json.box', keys: ['at', 'size', 'name', 'material', 'group'] },
  cylinder: { label: 'completion.json.cylinder', keys: ['at', 'radius', 'height', 'segments', 'name', 'material', 'group'] },
  sphere: { label: 'completion.json.sphere', keys: ['at', 'radius', 'segments', 'name', 'material'] },
  rect: { label: 'completion.json.rect', keys: ['at', 'size', 'plane', 'pushpull', 'material'] },
  circle: { label: 'completion.json.circle', keys: ['at', 'radius', 'segments', 'normal', 'pushpull'] },
  polygon: { label: 'completion.json.polygon', keys: ['at', 'radius', 'sides', 'normal', 'pushpull'] },
  face: { label: 'completion.json.face', keys: ['points', 'material', 'pushpull'] },
  line: { label: 'completion.json.line', keys: ['points', 'closed'] },
  polyhedron: { label: 'completion.json.polyhedron', keys: ['points', 'faces', 'material'] },
  text3d: { label: 'completion.json.text3d', keys: ['text', 'at', 'size', 'depth', 'material', 'upright', 'filled', 'font'] },
  group: { label: 'completion.json.group', keys: ['name', 'children'] },
  array: { label: 'completion.json.array', keys: ['count', 'offset', 'object'] },
  guide: { label: 'completion.json.guide', keys: ['at', 'direction'] },
  label: { label: 'completion.json.label', keys: ['at', 'text'] },
  dimension: { label: 'completion.json.dimension', keys: ['from', 'to', 'offset'] },
};
/** keys every node that becomes a group understands */
const JSON_GROUP_KEYS = ['material', 'rotate', 'scale', 'move', 'tag'];
const JSON_GROUP_TYPES = ['box', 'cylinder', 'sphere', 'text3d', 'group'];
const JSON_ROOT_KEYS = ['objects', 'materials', 'clear', 'view', 'zoomExtents'];
const JSON_ROTATE_KEYS = ['angle', 'axis', 'center'];

const text3dActive = () => apiMethods().has('text3d');

/** the text of an object without its nested objects and arrays – to find its own keys and "type" */
const ownText = (code: string, openIndex: number) => {
  let depth = 0,
    out = '';
  for (let i = openIndex; i < code.length; i++) {
    const char = code[i];
    if (char === '"') {
      let j = i + 1;
      while (j < code.length && code[j] !== '"' && code[j] !== '\n') {
        j += code[j] === '\\' ? 2 : 1;
      }
      if (depth === 1) {
        out += code.slice(i, j + 1);
      }
      i = j;
      continue;
    }
    if (char === '{' || char === '[') {
      depth++;
      continue;
    }
    if (char === '}' || char === ']') {
      depth--;
      if (depth === 0) {
        break;
      }
      continue;
    }
    if (depth === 1) {
      out += char;
    }
  }
  return out;
};

/** the key an object or array sits under: `"objects": [ { | } ]` → objects */
const jsonParentKey = (code: string, stack: Frame[], index: number): string => {
  const before = prevSignificant(code, stack[index].index);
  if (code[before] === ':') {
    return keyBefore(code, before);
  }
  if ((code[before] === '[' || code[before] === ',') && stack[index - 1]?.char === '[') {
    return jsonParentKey(code, stack, index - 1);
  }
  return '';
};

const jsonKeys = (code: string, state: Scan): string[] => {
  const top = state.stack.length - 1;
  if (top === 0) {
    return JSON_ROOT_KEYS;
  }
  const parent = jsonParentKey(code, state.stack, top);
  if (parent === 'rotate') {
    return JSON_ROTATE_KEYS;
  }
  if (parent !== 'objects' && parent !== 'children' && parent !== 'object') {
    return [];
  }
  const type = /"type"\s*:\s*"(\w+)"/.exec(ownText(code, state.stack[top].index))?.[1];
  const node = type ? JSON_NODES[type] : undefined;
  if (!node) {
    return ['type', ...new Set(Object.values(JSON_NODES).flatMap((candidate) => candidate.keys)), ...JSON_GROUP_KEYS];
  }
  return [...node.keys, ...(JSON_GROUP_TYPES.includes(type!) ? JSON_GROUP_KEYS.filter((key) => !node.keys.includes(key)) : [])];
};

const jsonValues = (key: string, editor?: Editor): CompletionItem[] => {
  if (key === 'type') {
    return Object.entries(JSON_NODES)
      .filter(([type]) => type !== 'text3d' || text3dActive())
      .map(([type, node]) => ({
        label: type,
        kind: 'type',
        detail: t(node.label),
        description: t('completion.jsonKeys', { keys: node.keys.join(', ') }),
      }));
  }
  return optionValues(key, editor);
};

const completeJson = (code: string, offset: number, editor?: Editor): CompletionResult | null => {
  const state = scan(code, offset, true);
  const frame = state.stack[state.stack.length - 1];
  if (!frame) {
    return null;
  }
  const inString = !!state.string;
  const from = state.string ? state.string.start : offset - identBefore(code, offset).length;
  const word = state.string ? code.slice(from + 1, offset) : code.slice(from, offset);
  const to = state.string ? stringEnd(code, offset, '"') : offset;
  const before = prevSignificant(code, from),
    previous = code[before];
  if (frame.char === '{' && (previous === '{' || previous === ',')) {
    const used = new Set([...ownText(code, frame.index).matchAll(/"(\w+)"\s*:/g)].map((match) => match[1]));
    const colonFollows = /^\s*:/.test(code.slice(to));
    const items: CompletionItem[] = jsonKeys(code, state)
      .filter((key) => !used.has(key))
      .map((key) => ({ label: key, kind: 'option', insert: colonFollows ? `"${key}"` : `"${key}": `, description: optionInfo(key) }));
    return items.length ? { from, to, word, context: 'key', items: rank(items, word) } : null;
  }
  if (previous === ':') {
    const values = jsonValues(keyBefore(code, before), editor).filter((item) => !inString || item.kind !== 'keyword');
    const items = values.map((item) => ({ ...item, insert: item.kind === 'keyword' ? item.label : `"${item.insert ?? item.label}"` }));
    return items.length ? { from, to, word, context: inString ? 'string' : 'value', items: rank(items, word) } : null;
  }
  return null;
};

// ---------------------------------------------------------------- plugin languages
const completeLanguage = (lang: string, code: string, offset: number): CompletionResult | null => {
  const providers = LANGUAGE_PROVIDERS.filter((entry) => entry.language === lang);
  if (!providers.length || !findScriptLanguage(lang)) {
    return null;
  }
  const lineStart = code.lastIndexOf('\n', offset - 1) + 1;
  if (code.slice(lineStart, offset).includes('//')) {
    return null;
  }
  const word = identBefore(code, offset);
  if (/^\d/.test(word)) {
    return null;
  }
  const items = providers
    .flatMap(({ provider }) => {
      try {
        return provider({ code, offset, word });
      } catch (error) {
        console.error(error);
        return [];
      }
    })
    .map((candidate) => toItem(candidate, 'keyword'));
  return { from: offset - word.length, to: offset, word, context: 'language', items: rank(items, word) };
};

/** Suggestions at `offset` – null when there is nothing to complete there. */
export const complete = (lang: string, code: string, offset: number, editor?: Editor): CompletionResult | null => {
  if (lang === 'js') {
    return completeJs(code, offset, editor);
  }
  if (lang === 'json') {
    return completeJson(code, offset, editor);
  }
  if (lang === 'obj') {
    return null;
  }
  return completeLanguage(lang, code, offset);
};

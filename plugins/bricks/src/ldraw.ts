/**
 * Reads the LDraw format: parts (text files with triangles, quads and references to other files) and models (files
 * that say which part goes where, in which colour). Pure functions – the worker fetches the files. What is in a file
 * comes from outside: references are checked before anything is asked for, and limits stop what would never end.
 */

/** one LDraw unit in metres */
const LDU = 0.0004;
const CELL = 20;
const PLATE = 8;
const MAX_DEPTH = 24;
export const MAX_FACES = 80000;
/** more than the largest sets in the collections this reads */
export const MAX_PLACEMENTS = 30000;
const MAX_VISITS = 200000;

export class LdrawError extends Error {
  code: 'notFound' | 'tooLarge' | 'noGeometry';
  constructor(code: 'notFound' | 'tooLarge' | 'noGeometry') {
    super(code);
    this.code = code;
  }
}

/** what can be asked for: a part number the user typed or a source named */
export const isPartNumber = (value: string) => /^[a-z0-9][a-z0-9_-]{0,39}$/i.test(value);

/** how a file is named in small letters with forward slashes; packed files name the library's folders, others do not */
const fileKey = (reference: string) =>
  reference
    .trim()
    .toLowerCase()
    .replaceAll('\\', '/')
    .replace(/^(parts|p)\//, '');

/** a reference in a file as a path below the library, or null when it tries anything else */
export const cleanReference = (reference: string) => {
  const path = fileKey(reference);
  return /^[a-z0-9_][a-z0-9_\-./ ]*\.(dat|ldr)$/.test(path) && !path.includes('..') && !path.includes('//') ? path : null;
};

const tokensOf = (line: string) => line.trim().split(/\s+/);

/** the files a file refers to */
export const referencesOf = (text: string) => {
  const found = new Set<string>();
  for (const line of text.split('\n')) {
    if (line.trimStart().startsWith('1 ')) {
      const path = cleanReference(tokensOf(line).slice(14).join(' '));
      if (path) {
        found.add(path);
      }
    }
  }
  return [...found];
};

/** names of protected brands stay out of the plugin's texts, also when they come with a source's data */
export const neutralTitle = (title: string) =>
  title
    .replace(/\b(lego|duplo|technic|bionicle|mindstorms)\b[®™]?\s*/gi, '')
    .replace(/\bminifig(ure)?\b/gi, 'Figure') // i18n-ignore – a word in a source's English titles
    .replace(/\s+/g, ' ')
    .trim();

export interface LdrawHeader {
  title: string;
  author: string;
  license: string;
}

export const headerOf = (text: string): LdrawHeader => {
  const lines = text.split('\n').map((line) => line.trim());
  const title = lines.find((line) => /^0\s+(?!Name:|Author:|!|\/\/|FILE\b|NOFILE\b|BFC\b|ROTATION\b|STEP\b)\S/i.test(line)) ?? '';
  const value = (prefix: string) =>
    lines
      .find((line) => line.startsWith(prefix))
      ?.slice(prefix.length)
      .trim() ?? '';
  return {
    title: neutralTitle(title.replace(/^0\s+/, '').slice(0, 120)),
    author: value('0 Author:').slice(0, 120),
    license: value('0 !LICENSE').slice(0, 120),
  };
};

// a transformation as LDraw writes it: x y z, then the 3 × 3 matrix by rows
export type Transform = [number, number, number, number, number, number, number, number, number, number, number, number];
const IDENTITY: Transform = [0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1];

const apply = (m: Transform, x: number, y: number, z: number): [number, number, number] => [
  m[0] + m[3] * x + m[4] * y + m[5] * z,
  m[1] + m[6] * x + m[7] * y + m[8] * z,
  m[2] + m[9] * x + m[10] * y + m[11] * z,
];

const combine = (a: Transform, b: Transform): Transform => {
  const [x, y, z] = apply(a, b[0], b[1], b[2]);
  const at = (row: number, col: number) => a[3 + row * 3] * b[3 + col] + a[4 + row * 3] * b[6 + col] + a[5 + row * 3] * b[9 + col];
  return [x, y, z, at(0, 0), at(0, 1), at(0, 2), at(1, 0), at(1, 1), at(1, 2), at(2, 0), at(2, 1), at(2, 2)];
};

const mirrors = (m: Transform) =>
  m[3] * (m[7] * m[11] - m[8] * m[10]) - m[4] * (m[6] * m[11] - m[8] * m[9]) + m[5] * (m[6] * m[10] - m[7] * m[9]) < 0;

export interface PartMesh {
  vertices: [number, number, number][];
  faces: number[][];
  /** cells along x and y */
  w: number;
  d: number;
  /** from its underside to where the next brick stands, in metres */
  height: number;
  /** what was added to the part's own coordinates (in metres, Z up) to centre it – a model places parts by those */
  origin: [number, number, number];
}

/**
 * All faces of a part with its files, in metres with Z up, standing on z = 0 and centred. Winding follows the
 * library's own rules (BFC), so faces show their fronts wherever a file has them.
 */
export const flattenPart = (main: string, files: ReadonlyMap<string, string>): PartMesh => {
  const raw: [number, number, number][] = [];
  const known = new Map<string, number>();
  const faces: number[][] = [];

  const indexOf = (point: [number, number, number]) => {
    const key = point.map((value) => Math.round(value * 1000)).join();
    let index = known.get(key);
    if (index === undefined) {
      index = raw.length;
      known.set(key, index);
      raw.push(point);
    }
    return index;
  };

  const walk = (path: string, transform: Transform, inverted: boolean, depth: number) => {
    const text = files.get(path);
    if (text === undefined || depth > MAX_DEPTH) {
      return;
    }
    let clockwise = false;
    let invertNext = false;
    for (const line of text.split('\n')) {
      const tokens = tokensOf(line);
      const type = tokens[0];
      if (type === '0') {
        if (tokens[1] === 'BFC') {
          const words = tokens.slice(2);
          if (words.includes('INVERTNEXT')) {
            invertNext = true;
          } else if (words.includes('CW')) {
            clockwise = true;
          } else if (words.includes('CCW')) {
            clockwise = false;
          }
        }
      } else if (type === '1') {
        const numbers = tokens.slice(2, 14).map(Number);
        const reference = cleanReference(tokens.slice(14).join(' '));
        if (reference && numbers.length === 12 && numbers.every(Number.isFinite)) {
          const next = combine(transform, numbers as Transform);
          walk(reference, next, inverted !== invertNext, depth + 1);
        }
        invertNext = false;
      } else if (type === '3' || type === '4') {
        const count = Number(type);
        const numbers = tokens.slice(2, 2 + count * 3).map(Number);
        if (numbers.length === count * 3 && numbers.every(Number.isFinite)) {
          const loop = Array.from({ length: count }, (_, i) =>
            indexOf(apply(transform, numbers[i * 3], numbers[i * 3 + 1], numbers[i * 3 + 2])),
          );
          // the winding the library means, seen through everything above this file
          const reverse = (clockwise !== inverted) !== mirrors(transform);
          faces.push(reverse ? loop.reverse() : loop);
          if (faces.length > MAX_FACES) {
            throw new LdrawError('tooLarge');
          }
        }
      }
    }
  };
  walk(main, IDENTITY, false, 0);
  if (!faces.length) {
    throw new LdrawError('noGeometry');
  }

  const range = (axis: 0 | 1 | 2) => {
    let low = Infinity;
    let high = -Infinity;
    for (const point of raw) {
      low = Math.min(low, point[axis]);
      high = Math.max(high, point[axis]);
    }
    return [low, high];
  };
  const [x0, x1] = range(0);
  const [y0, y1] = range(1);
  const [z0, z1] = range(2);
  const middleX = (x0 + x1) / 2;
  const middleZ = (z0 + z1) / 2;
  // bricks have their origin where the next one stands, the studs rise above it; other parts count as a whole
  const stack = y0 <= 0 && y1 > 0 ? y1 : y1 - y0;
  return {
    // LDraw's Y points down: x, z, -y is a turn, not a mirror, so faces keep their fronts
    vertices: raw.map(([x, y, z]) => [(x - middleX) * LDU, (z - middleZ) * LDU, (y1 - y) * LDU]),
    faces,
    w: Math.max(1, Math.round((x1 - x0) / CELL)),
    d: Math.max(1, Math.round((z1 - z0) / CELL)),
    height: Math.max(1, Math.round(stack / PLATE)) * PLATE * LDU,
    origin: [-middleX * LDU, -middleZ * LDU, y1 * LDU],
  };
};

// ------------------------------------------------------------ models

/** a colour as the plugin keeps it: "#rrggbb", with two more digits when it lets light through */
const FALLBACK_COLOR = '#a3a5a8';

/** the colour table of a file: code to colour */
export const parseColours = (text: string) => {
  const colours = new Map<string, string>();
  for (const line of text.split('\n')) {
    const found = /^\s*0\s+!COLOUR\s+\S+\s+CODE\s+(\d+)\s+VALUE\s+#([0-9a-f]{6})\b/i.exec(line);
    if (found) {
      const alpha = /\bALPHA\s+(\d+)/i.exec(line);
      const opacity = alpha ? Math.min(255, Number(alpha[1])) : 255;
      colours.set(found[1], `#${found[2].toLowerCase()}${opacity < 255 ? opacity.toString(16).padStart(2, '0') : ''}`);
    }
  }
  return colours;
};

/** code 16 and 24 mean "the colour of what holds me"; a code can also spell the colour out */
const resolveColour = (code: string, inherited: string, colours: ReadonlyMap<string, string>) => {
  if (code === '16' || code === '24') {
    return inherited;
  }
  const direct = /^0x2([0-9a-f]{6})$/i.exec(code);
  return direct ? `#${direct[1].toLowerCase()}` : (colours.get(code) ?? FALLBACK_COLOR);
};

const isPartSection = (name: string, text: string) =>
  name.endsWith('.dat') || /^\s*0\s+!LDRAW_ORG\s+(Unofficial_)?(Part|Subpart|Primitive|48_Primitive|8_Primitive|Shortcut)\b/im.test(text);

const hasPlacements = (text: string) => /^\s*1\s/m.test(text);

/** the name of what a file holds before its first FILE line */
const UNNAMED = ' ';

export interface SplitModel {
  /** the file the model starts from */
  main: string;
  models: Map<string, string>;
  /** parts that came inside the file */
  parts: Map<string, string>;
}

/**
 * Takes a model file apart. Several files can sit in one ("0 FILE name"); the first model among them is the whole.
 * Packed files start with a colour table and the model right after it, without a FILE line.
 */
export const splitModel = (text: string): SplitModel => {
  const sections: [string, string[]][] = [[UNNAMED, []]];
  for (const line of text.split('\n')) {
    const file = /^\s*0\s+FILE\s+(.+?)\s*$/i.exec(line);
    if (file) {
      sections.push([fileKey(file[1]), []]);
    } else if (!/^\s*0\s+NOFILE\b/i.test(line)) {
      sections[sections.length - 1][1].push(line);
    }
  }
  const models = new Map<string, string>();
  const parts = new Map<string, string>();
  let main = '';
  for (const [name, lines] of sections) {
    const lastColour = name === UNNAMED ? lines.reduce((last, line, index) => (/^\s*0\s+!COLOUR\b/i.test(line) ? index : last), -1) : -1;
    const body = lines.slice(lastColour + 1).join('\n');
    if (isPartSection(name, body)) {
      parts.set(name, body);
    } else if (hasPlacements(body)) {
      models.set(name, body);
      main ||= name;
    }
  }
  return { main, models, parts };
};

export interface Placement {
  /** a path below the library */
  part: string;
  color: string;
  transform: Transform;
}

/** every part of a model with where it goes, through all its sub-models */
export const collectPlacements = ({ main, models }: SplitModel, colours: ReadonlyMap<string, string>) => {
  const placements: Placement[] = [];
  let visits = 0;
  const walk = (name: string, transform: Transform, color: string, depth: number) => {
    const text = models.get(name);
    if (text === undefined || depth > MAX_DEPTH) {
      return;
    }
    for (const line of text.split('\n')) {
      const tokens = tokensOf(line);
      if (tokens[0] !== '1') {
        continue;
      }
      if (++visits > MAX_VISITS || placements.length > MAX_PLACEMENTS) {
        throw new LdrawError('tooLarge');
      }
      const numbers = tokens.slice(2, 14).map(Number);
      if (numbers.length !== 12 || !numbers.every(Number.isFinite)) {
        continue;
      }
      const reference = tokens.slice(14).join(' ');
      const next = combine(transform, numbers as Transform);
      const here = resolveColour(tokens[1], color, colours);
      if (models.has(fileKey(reference))) {
        walk(fileKey(reference), next, here, depth + 1);
      } else {
        const part = cleanReference(reference);
        if (part) {
          placements.push({ part, color: here, transform: next });
        }
      }
    }
  };
  walk(main, IDENTITY, FALLBACK_COLOR, 0);
  if (!placements.length) {
    throw new LdrawError('noGeometry');
  }
  return placements;
};

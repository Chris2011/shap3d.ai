import * as THREE from 'three';
import { shallowReactive } from 'vue';
import { FontLoader, type Font as TypefaceFont } from 'three/examples/jsm/loaders/FontLoader.js';
// free fonts (SIL OFL 1.1) from Fontsource – only the URL is imported, the file loads when the font is picked
import robotoUrl from '@fontsource/roboto/files/roboto-latin-400-normal.woff?url';
import robotoBoldUrl from '@fontsource/roboto/files/roboto-latin-700-normal.woff?url';
import playfairUrl from '@fontsource/playfair-display/files/playfair-display-latin-400-normal.woff?url';
import playfairBoldUrl from '@fontsource/playfair-display/files/playfair-display-latin-700-normal.woff?url';
import bebasUrl from '@fontsource/bebas-neue/files/bebas-neue-latin-400-normal.woff?url';
import fredokaUrl from '@fontsource/fredoka/files/fredoka-latin-700-normal.woff?url';
import pacificoUrl from '@fontsource/pacifico/files/pacifico-latin-400-normal.woff?url';
import lobsterUrl from '@fontsource/lobster/files/lobster-latin-400-normal.woff?url';
import blackOpsUrl from '@fontsource/black-ops-one/files/black-ops-one-latin-400-normal.woff?url';
import orbitronUrl from '@fontsource/orbitron/files/orbitron-latin-700-normal.woff?url';
import pressStartUrl from '@fontsource/press-start-2p/files/press-start-2p-latin-400-normal.woff?url';
import jetbrainsUrl from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff?url';
import caveatUrl from '@fontsource/caveat/files/caveat-latin-700-normal.woff?url';
import { t, hasMessage } from '../../../i18n';

/** One font the 3D text can use: a three.js typeface (built in) or a TTF/OTF/WOFF file. */
export interface TextFont {
  id: string;
  label: string;
  /** for grouping in the font list (shown as `text3d.categories.<category>`) */
  category: 'sans' | 'serif' | 'display' | 'script' | 'special' | 'custom';
  /** typeface JSON (loaded on demand) … */
  typeface?: () => Promise<unknown>;
  /** … or a font file */
  url?: string;
  file?: Blob;
}

export const CUSTOM_CATEGORY = 'custom';
/** shown name of a font category */
export const categoryLabel = (category: string) => t(`text3d.categories.${category}`);
/** shown name of a font: `text3d.fonts.<id>` where the name has a description ("Bold", "rounded" …), otherwise its own name */
export const fontLabel = (font: TextFont) => (hasMessage(`text3d.fonts.${font.id}`) ? t(`text3d.fonts.${font.id}`) : font.label);

export const BUILTIN_FONTS: TextFont[] = [
  {
    id: 'helvetiker',
    label: 'Helvetiker',
    category: 'sans',
    typeface: () => import('./fonts/helvetiker_regular.typeface.json').then((module) => module.default),
  },
  {
    id: 'helvetiker_bold',
    label: 'Helvetiker Bold',
    category: 'sans',
    typeface: () => import('./fonts/helvetiker_bold.typeface.json').then((module) => module.default),
  },
  { id: 'roboto', label: 'Roboto', category: 'sans', url: robotoUrl },
  { id: 'roboto_bold', label: 'Roboto Bold', category: 'sans', url: robotoBoldUrl },
  {
    id: 'optimer',
    label: 'Optimer',
    category: 'serif',
    typeface: () => import('./fonts/optimer_regular.typeface.json').then((module) => module.default),
  },
  { id: 'playfair', label: 'Playfair Display', category: 'serif', url: playfairUrl },
  { id: 'playfair_bold', label: 'Playfair Display Bold', category: 'serif', url: playfairBoldUrl },
  { id: 'bebas', label: 'Bebas Neue', category: 'display', url: bebasUrl },
  { id: 'fredoka', label: 'Fredoka', category: 'display', url: fredokaUrl },
  { id: 'blackops', label: 'Black Ops One', category: 'display', url: blackOpsUrl },
  { id: 'pacifico', label: 'Pacifico', category: 'script', url: pacificoUrl },
  { id: 'lobster', label: 'Lobster', category: 'script', url: lobsterUrl },
  { id: 'caveat', label: 'Caveat', category: 'script', url: caveatUrl },
  { id: 'orbitron', label: 'Orbitron', category: 'special', url: orbitronUrl },
  { id: 'pressstart', label: 'Press Start 2P', category: 'special', url: pressStartUrl },
  { id: 'jetbrains', label: 'JetBrains Mono', category: 'special', url: jetbrainsUrl },
];

/** all fonts – the built-in ones plus the user's own (kept in the plugin's file storage) */
export const FONTS = shallowReactive<TextFont[]>([...BUILTIN_FONTS]);
export const DEFAULT_FONT = 'helvetiker';
export const findFont = (id: string) => FONTS.find((font) => font.id === id);

// ------------------------------------------------------------ loading
/** a ready font: turns a text into flat outlines (THREE.Shape, y up, in metres) */
interface LoadedFont {
  shapes: (text: string, size: number) => THREE.Shape[];
}

const loaded = new Map<string, LoadedFont>();
const loading = new Map<string, Promise<LoadedFont>>();

interface OpenTypeCommand {
  type: 'M' | 'L' | 'Q' | 'C' | 'Z';
  x: number;
  y: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}
interface OpenTypeFont {
  unitsPerEm: number;
  ascender: number;
  descender: number;
  getPath: (text: string, x: number, y: number, fontSize: number) => { commands: OpenTypeCommand[] };
}

/** Outlines from a TTF/OTF/WOFF font. Contours whose winding matches the glyph's largest contour are outlines, the others holes. */
const fromOpenType = (font: OpenTypeFont): LoadedFont => ({
  shapes: (text, size) => {
    const lineHeight = ((font.ascender - font.descender) / font.unitsPerEm) * size * 1.15;
    const shapes: THREE.Shape[] = [];
    text.split('\n').forEach((line, row) => {
      // opentype paths are y-down – mirror back so the text reads upright
      const commands = font.getPath(line, 0, 0, size).commands;
      const contours: THREE.Path[] = [];
      let current: THREE.Path | null = null;
      for (const command of commands) {
        if (command.type === 'M') {
          current = new THREE.Path();
          current.moveTo(command.x, -command.y);
          contours.push(current);
        } else if (!current) {
          continue;
        } else if (command.type === 'L') {
          current.lineTo(command.x, -command.y);
        } else if (command.type === 'Q') {
          current.quadraticCurveTo(command.x1, -command.y1, command.x, -command.y);
        } else if (command.type === 'C') {
          current.bezierCurveTo(command.x1, -command.y1, command.x2, -command.y2, command.x, -command.y);
        } else if (command.type === 'Z') {
          current.closePath();
        }
      }
      shapes.push(...shapesFromContours(contours, -row * lineHeight));
    });
    return shapes;
  },
});

/** Sorts contours into outlines with their holes (by containment, so TrueType and CFF winding both work). */
const shapesFromContours = (contours: THREE.Path[], offsetY: number): THREE.Shape[] => {
  const loops = contours
    .map((path) => path.getPoints(8).map((point) => new THREE.Vector2(point.x, point.y + offsetY)))
    .filter((points) => points.length >= 3);
  const area = (points: THREE.Vector2[]) => THREE.ShapeUtils.area(points);
  const inside = (point: THREE.Vector2, polygon: THREE.Vector2[]) => {
    let hit = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i],
        b = polygon[j];
      if (a.y > point.y !== b.y > point.y && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) {
        hit = !hit;
      }
    }
    return hit;
  };
  // a loop is a hole if it lies inside an odd number of other loops
  const depth = loops.map(
    (loop, index) =>
      loops.filter((other, otherIndex) => otherIndex !== index && Math.abs(area(other)) > Math.abs(area(loop)) && inside(loop[0], other))
        .length,
  );
  const shapes: THREE.Shape[] = [];
  loops.forEach((loop, index) => {
    if (depth[index] % 2 === 1) {
      return;
    }
    const shape = new THREE.Shape(area(loop) < 0 ? [...loop].reverse() : loop);
    // holes: one level deeper and inside this outline
    loops.forEach((hole, holeIndex) => {
      if (depth[holeIndex] === depth[index] + 1 && inside(hole[0], loop)) {
        shape.holes.push(new THREE.Path(area(hole) > 0 ? [...hole].reverse() : hole));
      }
    });
    shapes.push(shape);
  });
  return shapes;
};

const fromTypeface = (font: TypefaceFont): LoadedFont => ({ shapes: (text, size) => font.generateShapes(text, size) });

/** Loads a font (once); later calls return the same promise. */
export const loadFont = (id: string): Promise<LoadedFont> => {
  const ready = loaded.get(id);
  if (ready) {
    return Promise.resolve(ready);
  }
  const pending = loading.get(id);
  if (pending) {
    return pending;
  }
  const font = findFont(id);
  if (!font) {
    return Promise.reject(new Error(t('text3d.errors.unknownFont', { id, available: FONTS.map((candidate) => candidate.id).join(', ') })));
  }
  const promise = (async () => {
    let result: LoadedFont;
    if (font.typeface) {
      result = fromTypeface(new FontLoader().parse((await font.typeface()) as any));
    } else {
      const buffer = font.file
        ? await font.file.arrayBuffer()
        : await fetch(font.url!).then((response) => {
            if (!response.ok) {
              throw new Error(t('text3d.errors.fontNotFound', { name: fontLabel(font) }));
            }
            return response.arrayBuffer();
          });
      const opentype = await import('opentype.js');
      result = fromOpenType(opentype.parse(buffer) as unknown as OpenTypeFont);
    }
    loaded.set(id, result);
    return result;
  })();
  loading.set(id, promise);
  promise.catch(() => loading.delete(id));
  return promise;
};

/** the font if it is already loaded (scripts run synchronously – the plugin loads fonts before a script runs) */
export const loadedFont = (id: string) => loaded.get(id);

/** Forgets a font (e.g. a removed custom font). */
export const forgetFont = (id: string) => {
  loaded.delete(id);
  loading.delete(id);
};

/** Loads the font into the browser as a CSS font, for the preview in the dialog. */
const cssLoaded = new Map<string, Promise<string>>();
export const previewFamily = (font: TextFont): Promise<string> => {
  if (!font.url && !font.file) {
    return Promise.resolve('Helvetica, Arial, sans-serif');
  }
  let pending = cssLoaded.get(font.id);
  if (!pending) {
    const family = `s3d-text-${font.id.replace(/[^\w-]/g, '_')}`;
    pending = (async () => {
      const source = font.file ? await font.file.arrayBuffer() : `url(${font.url})`;
      const face = new FontFace(family, source);
      await face.load();
      document.fonts.add(face);
      return `"${family}"`;
    })();
    cssLoaded.set(font.id, pending);
  }
  return pending;
};

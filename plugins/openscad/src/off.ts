import type * as THREE from 'three';
import type { PluginMaterial } from '../../../src/plugins/types';
import { t } from './i18n';

export interface FaceColor {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

/** what OpenSCAD built: positions in OpenSCAD units, faces as vertex indices, a material per face */
export interface ScadMesh {
  vertices: [number, number, number][];
  faces: number[][];
  faceMaterials: (string | null)[];
  materials: Record<string, PluginMaterial>;
}

export type ConsoleLine = { kind: 'log' | 'warn' | 'error'; text: string };

/**
 * Parses OFF text (OpenSCAD's export) into vertices and faces. Line based, because OpenSCAD
 * appends a colour to every face ("3 0 7 23 249 215 44" = triangle 0-7-23 in RGB 249/215/44).
 */
export const parseOff = (text: string) => {
  const rows = text
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter(Boolean)
    .map((line) => line.split(/\s+/));
  const header = rows.shift();
  if (!header || !/^C?OFF$/.test(header[0])) {
    throw new Error(t('openscad.errors.noOff'));
  }
  const counts = header.length > 1 ? header.slice(1) : (rows.shift() ?? []); // "OFF 8 6 0" or "OFF" + "8 6 0"
  const vertexCount = +counts[0];
  const faceCount = +counts[1];
  const vertices = rows.slice(0, vertexCount).map((row): [number, number, number] => [+row[0], +row[1], +row[2]]);
  const faceRows = rows.slice(vertexCount, vertexCount + faceCount);
  const faces = faceRows.map((row) => row.slice(1, 1 + +row[0]).map(Number));
  // colour after the indices: "r g b" or "r g b a", 0–255 (OpenSCAD writes it with the Manifold kernel only)
  const colors = faceRows.map((row): FaceColor | null => {
    const values = row.slice(1 + +row[0]).map(Number);
    return values.length >= 3 ? { red: values[0], green: values[1], blue: values[2], alpha: values[3] ?? 255 } : null;
  });
  return { vertices, faces, colors };
};

/** OpenSCAD's colour for parts without color() – they get no material. */
const DEFAULT_COLOR = '249,215,44';

/** CSS colour names by hex value, so color("red") becomes the material "OpenSCAD red" */
const COLOR_NAMES = new Map<number, string>();

/**
 * Turns the face colours into material names and definitions. Parts without color() keep no
 * material (they follow the group's or the default material). Same colour = same material.
 * The names are model content and stay the same in every language.
 */
export const materialsFromColors = (colors: (FaceColor | null)[], three: typeof THREE) => {
  if (!COLOR_NAMES.size) {
    for (const [name, hex] of Object.entries(three.Color.NAMES)) {
      if (!COLOR_NAMES.has(hex)) {
        COLOR_NAMES.set(hex, name);
      }
    }
  }
  const materials: Record<string, PluginMaterial> = {};
  const faceMaterials = colors.map((color) => {
    if (!color || `${color.red},${color.green},${color.blue}` === DEFAULT_COLOR) {
      return null;
    }
    const hexValue = (color.red << 16) | (color.green << 8) | color.blue;
    const hex = '#' + hexValue.toString(16).padStart(6, '0');
    const opacity = Math.round((color.alpha / 255) * 100) / 100;
    const name = `OpenSCAD ${COLOR_NAMES.get(hexValue) ?? hex}${opacity < 1 ? ` ${Math.round(opacity * 100)} %` : ''}`;
    materials[name] ??= { color: hex, opacity };
    return name;
  });
  return { faceMaterials, materials };
};

/** OpenSCAD's stderr → script console lines (statistics are left out). OpenSCAD's own messages stay in English. */
export const consoleLines = (lines: string[]): ConsoleLine[] =>
  lines.flatMap((line): ConsoleLine[] => {
    const text = line.trim();
    if (text.startsWith('ECHO:')) {
      return [{ kind: 'log', text: text.replace(/^ECHO:\s*/, '') }];
    }
    if (/^(WARNING|DEPRECATED):/.test(text)) {
      return [{ kind: 'warn', text }];
    }
    if (/^(ERROR|TRACE):/.test(text) || text.startsWith("Can't parse")) {
      return [{ kind: 'error', text }];
    }
    return [];
  });

import type * as THREE from 'three';
import type { PluginMaterial } from '../../../src/plugins/types';

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

/** what the worker makes of OpenSCAD's OFF file (compileWorker.js) */
export interface OffArrays {
  positions: Float64Array;
  faceSizes: Int32Array;
  faceIndices: Int32Array;
  /** red, green, blue, alpha per face, 0–255; -1 = no colour */
  colors: Int16Array;
}

export const meshFromArrays = ({ positions, faceSizes, faceIndices, colors }: OffArrays) => {
  const vertices = new Array<[number, number, number]>(positions.length / 3);
  for (let i = 0; i < vertices.length; i++) {
    vertices[i] = [positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]];
  }
  const faces = new Array<number[]>(faceSizes.length);
  const faceColors = new Array<FaceColor | null>(faceSizes.length);
  let cursor = 0;
  for (let i = 0; i < faces.length; i++) {
    faces[i] = Array.from(faceIndices.subarray(cursor, cursor + faceSizes[i]));
    cursor += faceSizes[i];
    faceColors[i] =
      colors[i * 4] < 0 ? null : { red: colors[i * 4], green: colors[i * 4 + 1], blue: colors[i * 4 + 2], alpha: colors[i * 4 + 3] };
  }
  return { vertices, faces, colors: faceColors };
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

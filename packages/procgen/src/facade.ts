import { meshBuilder, type MeshBuilder } from './builder';
import { hash2 } from './noise';
import type { Plane } from './paving';

/**
 * Facades: windows, frames, sills, shutters, balconies and a ground floor with shop windows and a door, laid on
 * a wall as geometry in front of it (nothing is cut out of the wall). Each window draws its variation – lit or
 * dark glass, shutters, a balcony, sometimes left out – from hashes of its column and floor, so the same seed
 * gives the same facade.
 */

export interface FacadeOptions {
  /** storey height (m) */
  floorHeight: number;
  /** a higher ground floor (m) – 0 = like the other floors */
  groundFloor: number;
  /** shop windows and a door on the ground floor */
  shops: boolean;
  windowWidth: number;
  windowHeight: number;
  /** wall between windows (m) */
  spacing: number;
  /** height of the window sill above the floor (m) */
  sill: number;
  /** wall kept free at both ends (m) */
  margin: number;
  /** 0 … 1: share of windows with a balcony (in vertical stacks) */
  balconies: number;
  /** 0 … 1: share of windows with shutters */
  shutters: number;
  /** 0 … 1: share of lit windows */
  lit: number;
  /** 0 … 1: how many windows are left out (blind wall) */
  gaps: number;
  seed: number;
}

export const FACADE_DEFAULTS: FacadeOptions = {
  floorHeight: 3,
  groundFloor: 3.6,
  shops: true,
  windowWidth: 1.2,
  windowHeight: 1.5,
  spacing: 1.3,
  sill: 0.9,
  margin: 0.6,
  balconies: 0.3,
  shutters: 0.25,
  lit: 0.25,
  gaps: 0.05,
  seed: 1,
};

/** the materials a facade uses – names are model content */
export interface FacadeMaterials {
  frame: string;
  glass: string;
  litGlass: string;
  shutter: string;
  balcony: string;
  railing: string;
  door: string;
}

/** a window opening: frame round it, glass in it, a sill below */
const addWindow = (
  builder: MeshBuilder,
  u0: number,
  v0: number,
  u1: number,
  v1: number,
  glass: string,
  materials: FacadeMaterials,
  sill: boolean,
) => {
  const frame = 0.07,
    depth = 0.06;
  builder.box(u0 - frame, v0 - frame, 0, u1 + frame, v0, depth, materials.frame);
  builder.box(u0 - frame, v1, 0, u1 + frame, v1 + frame, depth, materials.frame);
  builder.box(u0 - frame, v0, 0, u0, v1, depth, materials.frame);
  builder.box(u1, v0, 0, u1 + frame, v1, depth, materials.frame);
  // a mullion in wider windows
  if (u1 - u0 > 1) {
    const middle = (u0 + u1) / 2;
    builder.box(middle - 0.03, v0, 0, middle + 0.03, v1, depth * 0.6, materials.frame);
  }
  builder.quad(u0, v0, u1, v1, 0.01, glass);
  if (sill) {
    builder.box(u0 - frame - 0.04, v0 - frame - 0.05, 0, u1 + frame + 0.04, v0 - frame, 0.12, materials.frame);
  }
};

/**
 * The facade of a wall `width` × `height` (m) in the plane's coordinates (u along, v up, h out of the wall).
 * `fits(u0, v0, u1, v1)` says whether a rectangle lies on the wall (gable walls, odd outlines).
 */
export const facadeMesh = (
  plane: Plane,
  width: number,
  height: number,
  options: FacadeOptions,
  materials: FacadeMaterials,
  fits: (u0: number, v0: number, u1: number, v1: number) => boolean = () => true,
) => {
  const builder = meshBuilder(plane);
  const seed = options.seed;
  const bay = options.windowWidth + options.spacing;
  const usable = width - 2 * options.margin;
  const columns = Math.max(0, Math.floor((usable + options.spacing) / bay));
  const start = (width - (columns * bay - options.spacing)) / 2;
  const ground = options.groundFloor > 0 ? options.groundFloor : options.floorHeight;
  const floors = Math.max(0, Math.floor((height - ground) / options.floorHeight + 0.15));
  const chance = (column: number, floor: number, salt: number) => hash2(column, floor, seed * 97 + salt);

  // the ground floor: shop windows and a door in the middle, or a door and windows like above
  if (columns > 0) {
    const doorColumn = Math.floor(columns / 2);
    for (let column = 0; column < columns; column++) {
      const u0 = start + column * bay,
        u1 = u0 + options.windowWidth;
      if (column === doorColumn) {
        const doorWidth = Math.min(options.windowWidth, 1.2);
        const doorStart = (u0 + u1) / 2 - doorWidth / 2;
        if (fits(doorStart, 0, doorStart + doorWidth, Math.min(2.3, ground - 0.2))) {
          builder.box(doorStart - 0.08, 0, 0, doorStart + doorWidth + 0.08, Math.min(2.4, ground - 0.1), 0.05, materials.frame);
          builder.box(doorStart, 0, 0.05, doorStart + doorWidth, Math.min(2.3, ground - 0.2), 0.07, materials.door);
        }
        continue;
      }
      if (options.shops) {
        // shop windows reach down to a low plinth and span the whole bay
        const s0 = u0 - options.spacing * 0.35,
          s1 = u1 + options.spacing * 0.35;
        const top = Math.min(ground - 0.5, 3);
        if (fits(s0, 0.4, s1, top)) {
          addWindow(builder, s0, 0.4, s1, top, chance(column, -1, 3) < 0.5 ? materials.litGlass : materials.glass, materials, false);
          builder.box(s0 - 0.1, top + 0.15, 0, s1 + 0.1, top + 0.5, 0.08, materials.shutter);
        }
      } else {
        const v0 = options.sill,
          v1 = Math.min(ground - 0.3, options.sill + options.windowHeight);
        if (fits(u0, v0, u1, v1)) {
          addWindow(builder, u0, v0, u1, v1, materials.glass, materials, true);
        }
      }
    }
  }

  // the upper floors
  for (let floor = 0; floor < floors; floor++) {
    const base = ground + floor * options.floorHeight;
    for (let column = 0; column < columns; column++) {
      if (chance(column, floor, 1) < options.gaps) {
        continue;
      }
      const u0 = start + column * bay,
        u1 = u0 + options.windowWidth;
      // balconies come in vertical stacks: the column decides, the floor only rarely leaves one out
      const balcony = chance(column, 0, 5) < options.balconies && chance(column, floor, 6) > 0.12;
      const v0 = base + (balcony ? 0.05 : options.sill),
        v1 = base + options.sill + options.windowHeight;
      if (v1 > height - 0.3 || !fits(u0 - 0.1, v0 - 0.1, u1 + 0.1, v1 + 0.1)) {
        continue;
      }
      const glass = chance(column, floor, 2) < options.lit ? materials.litGlass : materials.glass;
      addWindow(builder, u0, v0, u1, v1, glass, materials, !balcony);
      if (balcony) {
        const b0 = u0 - 0.45,
          b1 = u1 + 0.45,
          reach = 1.1;
        builder.box(b0, base - 0.18, 0, b1, base, reach, materials.balcony);
        // a railing on the three open sides
        builder.box(b0, base, reach - 0.04, b1, base + 1, reach, materials.railing);
        builder.box(b0, base, 0, b0 + 0.04, base + 1, reach - 0.04, materials.railing);
        builder.box(b1 - 0.04, base, 0, b1, base + 1, reach - 0.04, materials.railing);
      } else if (chance(column, floor, 4) < options.shutters) {
        // open shutters beside the window
        const shutter = options.windowWidth / 2;
        builder.box(u0 - 0.07 - shutter, v0, 0.02, u0 - 0.07, v1, 0.05, materials.shutter);
        builder.box(u1 + 0.07, v0, 0.02, u1 + 0.07 + shutter, v1, 0.05, materials.shutter);
      }
    }
    // a thin cornice between the floors
    if (fits(0, base - 0.12, width, base)) {
      builder.box(0, base - 0.12, 0, width, base, 0.04, materials.frame);
    }
  }
  return builder;
};

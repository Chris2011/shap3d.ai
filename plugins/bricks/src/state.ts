import { reactive } from 'vue';
import { DEFAULT_COLOR } from './colors';

/** where a brick would go now */
export interface Preview {
  x: number;
  y: number;
  z: number;
  /** cells along x and y as it is turned now */
  w: number;
  d: number;
  height: number;
  rotation: number;
  collides: boolean;
}

/** What the panel and the tool share. */
export interface BrickState {
  /** the part id that follows the pointer until the tool is stopped */
  placing: string | null;
  color: string;
  /** quarter turns (R) of the brick being placed or moved, in degrees */
  turn: number;
  /** plates above or below where it would come to rest (Page Up, Page Down) */
  lift: number;
  preview: Preview | null;
  /** bumped when the tool changed something the panel shows */
  revision: number;
}

let state: BrickState | null = null;

/** the shared state – made on first use (after activate, when the app's Vue is there) */
export const useBrickState = () => {
  state ??= reactive<BrickState>({ placing: null, color: DEFAULT_COLOR, turn: 0, lift: 0, preview: null, revision: 0 });
  return state;
};

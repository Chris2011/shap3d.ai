import { reactive } from 'vue';
import type { ObjectKind } from './kinds';
import type { NavGrid } from './nav';

/** what the panels and the tools share */
interface LevelState {
  /** the kind being placed (the tool shows it at the pointer), null = none */
  placing: ObjectKind | null;
  /** degrees around z the next object faces (R turns it) */
  turn: number;
  /** bumped after the plugin changed something, so the panels read the model again */
  revision: number;
  /** the blockout piece the block tool draws, and the settings of new pieces */
  block: {
    kind: 'room' | 'corridor' | 'stairs';
    floor: number;
    height: number;
    ceiling: boolean;
    width: number;
    rise: number;
  };
  /** the walking grid while it is shown (raw – not reactive) and the model's revision it was built for */
  nav: { grid: NavGrid; revision: number } | null;
}

// made on first use – the app's Vue (behind `vue` in the package build) is only there once the plugin is active
let state: LevelState | null = null;

export const useLevelState = () =>
  (state ??= reactive<LevelState>({
    placing: null,
    turn: 0,
    revision: 0,
    block: { kind: 'room', floor: 0, height: 3, ceiling: false, width: 2, rise: 3 },
    nav: null,
  }) as LevelState);

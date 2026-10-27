import { reactive } from 'vue';
import type { Params } from './catalog';
import type { WallView } from './room';
import type { SnapResult } from './snap';

/** What the panel and the tool share: the piece being placed, quarter turns, what is shown. */
export interface PlannerState {
  /** a catalog piece that follows the pointer until it is placed */
  placing: { item: string; params: Params } | null;
  /** extra quarter turns (R) of the piece being placed or moved */
  turn: number;
  /** where the piece would go now */
  preview: SnapResult | null;
  /** room dimensions and distances in the viewport */
  showMeasures: boolean;
  /** which walls are shown – "front": all but those between the camera and the room */
  walls: WallView;
  /** the room that is worked on (several may stand side by side) */
  roomId: string | null;
  /** the floor of a maisonette that is worked on: new pieces go there; on the lower one the upper floor is hidden */
  level: number;
  /** bumped when the tool changed something the panel shows */
  revision: number;
}

let state: PlannerState | null = null;

/** the shared state – made on first use (after activate, when the app's Vue is there) */
export const usePlannerState = () => {
  state ??= reactive<PlannerState>({
    placing: null,
    turn: 0,
    preview: null,
    showMeasures: true,
    walls: 'front',
    level: 0,
    roomId: null,
    revision: 0,
  });
  return state;
};

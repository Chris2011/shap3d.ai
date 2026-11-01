import { reactive } from 'vue';

/** a key picked in the dope sheet or the graph editor: what it belongs to, its channel and its frame */
export interface PickedKey {
  owner: string;
  channel: string;
  frame: number;
}

/** what the panel, the timeline and the drawing share */
interface AnimationState {
  /** the frame shown (whole while editing, between frames while playing slowly) */
  frame: number;
  playing: boolean;
  /** plays back and forth again from the start */
  loop: boolean;
  /** keys every change of a group's place at the frame shown (Blender's auto-keying) */
  autoKey: boolean;
  /** the 3D view looks through the animation's camera (the shot's at this frame) */
  lookThrough: boolean;
  /** the timeline at the bottom of the 3D view, and its view: dope sheet or graph editor */
  timeline: boolean;
  timelineView: 'dope' | 'graph';
  /** rows the dope sheet shows opened up into their channels */
  expanded: Record<string, boolean>;
  picked: PickedKey[];
  /** channels the graph editor shows: "<owner>|<channel>" */
  graphChannels: string[];
  /** what the 3D view shows besides the model: the paths things move along, the cameras */
  show: { paths: boolean; cameras: boolean };
  /** a video or image sequence being rendered: what it does and how far it is (0 … 1) */
  rendering: { phase: 'frames' | 'video' | 'zip'; progress: number } | null;
  /** bumped after the plugin changed the animation, so the panels read it again */
  revision: number;
  /** what has been tried this session – the guide ticks its steps off with it */
  learned: { keyed: boolean; played: boolean; scrubbed: boolean; graph: boolean; camera: boolean; rendered: boolean };
}

// made on first use – the app's Vue (behind `vue` in the package build) is only there once the plugin is active
let state: AnimationState | null = null;

export const useAnimationState = () =>
  (state ??= reactive<AnimationState>({
    frame: 1,
    playing: false,
    loop: true,
    autoKey: false,
    lookThrough: false,
    timeline: false,
    timelineView: 'dope',
    expanded: {},
    picked: [],
    graphChannels: [],
    show: { paths: true, cameras: true },
    rendering: null,
    revision: 0,
    learned: { keyed: false, played: false, scrubbed: false, graph: false, camera: false, rendered: false },
  }) as AnimationState);

/** notes that something was tried (for the guide) */
export const learn = (what: keyof AnimationState['learned']) => {
  useAnimationState().learned[what] = true;
};

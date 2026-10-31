import { reactive } from 'vue';

export type SimStatus = 'stopped' | 'loading' | 'running' | 'paused';

/** what the panel, the tools and the drawing share */
interface PhysicsState {
  status: SimStatus;
  /** seconds simulated since the start (or the moment of the timeline shown) */
  time: number;
  /** how far the timeline goes (seconds), and the moment of it shown while it is dragged (null: the simulation's now) */
  recorded: number;
  scrub: number | null;
  /** a video being recorded: its seconds so far */
  recording: { seconds: number } | null;
  /** what the running simulation holds */
  counts: { bodies: number; joints: number; particles: number };
  /** the last error (Rapier could not load …) */
  error: string;
  /** motor targets changed while it runs (not saved): "<instance id>:<joint index>" → degrees or metres */
  drive: Record<string, number>;
  /** what the 3D view shows besides the bodies */
  show: { joints: boolean; forces: boolean; flow: boolean; trails: boolean };
  /** bumped after the plugin changed something, so the panel reads the model again */
  revision: number;
  /** what has been tried this session – the guide ticks its steps off with it */
  learned: { started: boolean; stepped: boolean; reset: boolean; pulled: boolean; kept: boolean };
}

// made on first use – the app's Vue (behind `vue` in the package build) is only there once the plugin is active
let state: PhysicsState | null = null;

export const usePhysicsState = () =>
  (state ??= reactive<PhysicsState>({
    status: 'stopped',
    time: 0,
    recorded: 0,
    scrub: null,
    recording: null,
    counts: { bodies: 0, joints: 0, particles: 0 },
    error: '',
    drive: {},
    show: { joints: true, forces: true, flow: true, trails: true },
    revision: 0,
    learned: { started: false, stepped: false, reset: false, pulled: false, kept: false },
  }) as PhysicsState);

/** notes that something was tried (for the guide) */
export const learn = (what: keyof PhysicsState['learned']) => {
  usePhysicsState().learned[what] = true;
};

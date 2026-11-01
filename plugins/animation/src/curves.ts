import { STEPPED, type Interpolation, type Key, type Track } from './data';

/**
 * Keyframe curves: the value of a track at any frame (also between frames – a render at another frame rate or slow
 * motion), the handles of smooth keys, and adding, moving and removing keys. Like Blender's F-curves: a key holds,
 * goes straight or along a Bézier curve to the next; before the first and after the last key the value stays – or
 * the keyed part repeats (cycle).
 */

/** auto handles: as steep as the line between the neighbours, flat at a peak or a dip and at the ends */
const autoSlope = (keys: Key[], index: number) => {
  const previous = keys[index - 1];
  const next = keys[index + 1];
  const key = keys[index];
  if (!previous || !next) {
    return 0;
  }
  const peak = (key.value >= previous.value && key.value >= next.value) || (key.value <= previous.value && key.value <= next.value);
  if (peak) {
    return 0;
  }
  let slope = (next.value - previous.value) / (next.frame - previous.frame);
  // clamped: the handles do not overshoot the neighbours' values
  const reachLeft = ((key.frame - previous.frame) / 3) * slope;
  const reachRight = ((next.frame - key.frame) / 3) * slope;
  const roomLeft = key.value - previous.value;
  const roomRight = next.value - key.value;
  if (Math.abs(reachLeft) > Math.abs(roomLeft)) {
    slope *= Math.abs(roomLeft / reachLeft);
  }
  if (Math.abs(reachRight) > Math.abs(roomRight)) {
    slope *= Math.abs(roomRight / reachRight);
  }
  return slope;
};

/** a key's handles, relative to it: [frames, value] back and forward */
export const handlesOf = (keys: Key[], index: number): { left: [number, number]; right: [number, number] } => {
  const key = keys[index];
  const before = index > 0 ? (key.frame - keys[index - 1].frame) / 3 : 1;
  const after = index < keys.length - 1 ? (keys[index + 1].frame - key.frame) / 3 : 1;
  if (key.handle === 'free' && key.left && key.right) {
    return { left: key.left, right: key.right };
  }
  const slope = autoSlope(keys, index);
  return { left: [-before, -before * slope], right: [after, after * slope] };
};

/** a point on a cubic Bézier curve */
const bezier = (p0: number, p1: number, p2: number, p3: number, t: number) => {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
};

const bounceOut = (t: number) => {
  const n = 7.5625;
  const d = 2.75;
  if (t < 1 / d) {
    return n * t * t;
  }
  if (t < 2 / d) {
    return n * (t -= 1.5 / d) * t + 0.75;
  }
  if (t < 2.5 / d) {
    return n * (t -= 2.25 / d) * t + 0.9375;
  }
  return n * (t -= 2.625 / d) * t + 0.984375;
};

/** the easings: 0 … 1 in, 0 … 1 out (back and elastic leave that range on the way) */
const EASINGS: Partial<Record<Interpolation, (t: number) => number>> = {
  linear: (t) => t,
  'ease-in': (t) => t * t * t,
  'ease-out': (t) => 1 - Math.pow(1 - t, 3),
  'ease-in-out': (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  back: (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  bounce: bounceOut,
  elastic: (t) => (t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
};

/** the value between two keys */
const between = (keys: Key[], index: number, frame: number) => {
  const from = keys[index];
  const to = keys[index + 1];
  const span = to.frame - from.frame;
  if (from.interp === 'constant' || span <= 0) {
    return from.value;
  }
  const t = (frame - from.frame) / span;
  if (from.interp !== 'bezier') {
    return from.value + (to.value - from.value) * (EASINGS[from.interp] ?? EASINGS.linear!)(t);
  }
  // the handles may not reach past the other key in time, or the curve would turn back on itself
  const out = handlesOf(keys, index).right;
  const into = handlesOf(keys, index + 1).left;
  const outFrames = Math.min(Math.max(out[0], 0), span);
  const intoFrames = Math.min(Math.max(-into[0], 0), span);
  const outScale = out[0] ? outFrames / out[0] : 0;
  const intoScale = into[0] ? intoFrames / -into[0] : 0;
  const x1 = from.frame + outFrames;
  const y1 = from.value + out[1] * outScale;
  const x2 = to.frame - intoFrames;
  const y2 = to.value + into[1] * intoScale;
  // the curve's parameter for this frame: x grows with it, so halving finds it
  let low = 0;
  let high = 1;
  let middle = t;
  for (let step = 0; step < 30; step++) {
    middle = (low + high) / 2;
    if (bezier(from.frame, x1, x2, to.frame, middle) < frame) {
      low = middle;
    } else {
      high = middle;
    }
  }
  return bezier(from.value, y1, y2, to.value, middle);
};

/** the track's value at a frame (frames between whole ones too) */
export const evaluate = (track: Track, frame: number, channel = ''): number => {
  const keys = track.keys;
  if (!keys.length) {
    return 0;
  }
  const first = keys[0];
  const last = keys[keys.length - 1];
  if (track.cycle && last.frame > first.frame) {
    const length = last.frame - first.frame;
    frame = first.frame + ((((frame - first.frame) % length) + length) % length);
  }
  if (frame <= first.frame) {
    return first.value;
  }
  if (frame >= last.frame) {
    return last.value;
  }
  // the key before the frame (keys are sorted)
  let index = 0;
  while (index < keys.length - 2 && keys[index + 1].frame <= frame) {
    index++;
  }
  if (STEPPED.has(channel)) {
    return keys[index].value;
  }
  return between(keys, index, frame);
};

const sortKeys = (track: Track) => track.keys.sort((a, b) => a.frame - b.frame);

/** sets a key at a frame (replaces one there); new keys are smooth, or hold on stepped channels */
export const setKey = (track: Track, frame: number, value: number, channel = '', interp?: Interpolation) => {
  const existing = track.keys.find((key) => Math.abs(key.frame - frame) < 1e-6);
  if (existing) {
    existing.value = value;
    if (interp) {
      existing.interp = interp;
    }
    return existing;
  }
  const key: Key = { frame, value, interp: interp ?? (STEPPED.has(channel) ? 'constant' : 'bezier') };
  track.keys.push(key);
  sortKeys(track);
  return key;
};

export const removeKeyAt = (track: Track, frame: number) => {
  track.keys = track.keys.filter((key) => Math.abs(key.frame - frame) >= 1e-6);
};

/**
 * moves the keys at these frames by `delta` frames (whole frames); a key that lands on another one replaces it
 */
export const moveKeys = (track: Track, frames: number[], delta: number) => {
  const moving = track.keys.filter((key) => frames.some((frame) => Math.abs(key.frame - frame) < 1e-6));
  const staying = track.keys.filter((key) => !moving.includes(key));
  for (const key of moving) {
    key.frame += delta;
  }
  track.keys = [...staying.filter((key) => !moving.some((moved) => Math.abs(moved.frame - key.frame) < 1e-6)), ...moving];
  sortKeys(track);
};

/** the smallest and largest value the curve reaches between its first and last key (for the graph editor) */
export const curveRange = (track: Track, channel = '') => {
  const keys = track.keys;
  if (!keys.length) {
    return { min: 0, max: 1 };
  }
  let min = Infinity;
  let max = -Infinity;
  const first = keys[0].frame;
  const last = keys[keys.length - 1].frame;
  const steps = Math.max(1, Math.min(400, Math.ceil(last - first)));
  for (let step = 0; step <= steps; step++) {
    const value = evaluate(track, first + ((last - first) * step) / steps, channel);
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min, max };
};

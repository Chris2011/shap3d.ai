import { removeKeyAt, setKey } from './curves';
import type { Tracks } from './data';
import { editObjects, editScene, tracksOf } from './keying';
import { findInstance } from './scene';
import { t } from './runtime';
import { learn } from './state';

/**
 * What the panel's fields do: show whether a channel is keyed at the frame, key it to a value, and the diamond's
 * click – a key at this frame goes, else the value shown is keyed (as in Blender).
 */

export type Status = 'none' | 'animated' | 'keyed';

export const statusOf = (tracks: Tracks | undefined | null, channel: string, frame: number): Status => {
  const track = tracks?.[channel];
  if (!track?.keys.length) {
    return 'none';
  }
  return track.keys.some((key) => Math.abs(key.frame - frame) < 1e-6) ? 'keyed' : 'animated';
};

/** keys channels of an owner ("obj:<id>", "cam:<id>", "sun", "light:<id>", "mat:<name>") to values at a frame */
export const keyValues = (owner: string, frame: number, values: Record<string, number>) => {
  const change = (tracks: Tracks) => {
    for (const [channel, value] of Object.entries(values)) {
      setKey((tracks[channel] ??= { keys: [] }), frame, value, channel);
    }
  };
  if (owner.startsWith('obj:')) {
    const instance = findInstance(Number(owner.slice(4)))?.instance;
    if (instance) {
      editObjects(t('animation.undo.key'), [instance], (animation) => change(animation.tracks));
    }
  } else {
    editScene(t('animation.undo.key'), (scene) => {
      const tracks = tracksOf(scene, owner);
      if (tracks) {
        change(tracks);
      }
    });
  }
  learn('keyed');
};

/** the diamond: removes the keys at this frame if there are, else keys the values shown */
export const toggleKeys = (owner: string, frame: number, values: Record<string, number>, keyed: boolean) => {
  if (!keyed) {
    keyValues(owner, frame, values);
    return;
  }
  const change = (tracks: Tracks) => {
    for (const channel of Object.keys(values)) {
      const track = tracks[channel];
      if (track) {
        removeKeyAt(track, frame);
        if (!track.keys.length) {
          delete tracks[channel];
        }
      }
    }
  };
  if (owner.startsWith('obj:')) {
    const instance = findInstance(Number(owner.slice(4)))?.instance;
    if (instance) {
      editObjects(t('animation.undo.delete'), [instance], (animation) => change(animation.tracks));
    }
  } else {
    editScene(t('animation.undo.delete'), (scene) => {
      const tracks = tracksOf(scene, owner);
      if (tracks) {
        change(tracks);
      }
    });
  }
};

/** colours as the colour field wants them and back (channels 0 … 1) */
export const toHex = (r: number, g: number, b: number) =>
  `#${[r, g, b]
    .map((part) =>
      Math.round(Math.min(1, Math.max(0, part)) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
export const fromHex = (hex: string) => {
  const part = (at: number) => parseInt(hex.slice(at, at + 2), 16) / 255;
  return { r: part(1), g: part(3), b: part(5) };
};

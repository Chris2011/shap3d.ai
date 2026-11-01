import { currentScene } from './apply';
import type { Track } from './data';
import { t } from './runtime';
import { animatedNodes } from './scene';

/**
 * The rows of the dope sheet and the graph editor: every animated thing (groups, cameras, the sun, lights, materials)
 * with its keyed channels, in the order Blender lists them – objects first.
 */

export interface ChannelRow {
  channel: string;
  label: string;
  track: Track;
  /** the colour of its curve in the graph editor */
  colour: string;
}

export interface OwnerRow {
  owner: string;
  label: string;
  kind: 'object' | 'camera' | 'sun' | 'light' | 'material';
  channels: ChannelRow[];
}

/** curve colours like Blender's: x red, y green, z blue – the rest from a list */
const COLOURS: Record<string, string> = {
  x: '#e03131',
  y: '#2f9e44',
  z: '#1c7ed6',
  rx: '#f76707',
  ry: '#74b816',
  rz: '#1098ad',
  sx: '#c2255c',
  sy: '#5c940d',
  sz: '#3b5bdb',
  tx: '#e8590c',
  ty: '#37b24d',
  tz: '#4263eb',
  r: '#fa5252',
  g: '#40c057',
  b: '#339af0',
  opacity: '#868e96',
  visible: '#495057',
  lens: '#7048e8',
  path: '#d6336c',
  hour: '#f59f00',
  daylight: '#fab005',
  intensity: '#f08c00',
};

/** the channel's name for people: "X position", "Lens" … */
export const channelLabel = (kind: OwnerRow['kind'], channel: string) =>
  t(`animation.channels.${kind === 'camera' || kind === 'light' ? `${kind}.` : ''}${channel}`);

const ORDER = [
  'x',
  'y',
  'z',
  'rx',
  'ry',
  'rz',
  'sx',
  'sy',
  'sz',
  'tx',
  'ty',
  'tz',
  'lens',
  'path',
  'visible',
  'r',
  'g',
  'b',
  'opacity',
  'intensity',
  'hour',
  'daylight',
];

const channelRows = (kind: OwnerRow['kind'], tracks: Partial<Record<string, Track>>): ChannelRow[] =>
  Object.entries(tracks)
    .filter((entry): entry is [string, Track] => !!entry[1]?.keys.length)
    .sort(([a], [b]) => ORDER.indexOf(a) - ORDER.indexOf(b))
    .map(([channel, track]) => ({ channel, label: channelLabel(kind, channel), track, colour: COLOURS[channel] ?? '#868e96' }));

export const ownerRows = (): OwnerRow[] => {
  const scene = currentScene();
  const rows: OwnerRow[] = [];
  for (const node of animatedNodes()) {
    rows.push({
      owner: `obj:${node.instance.id}`,
      label: node.instance.name || node.instance.definition.name,
      kind: 'object',
      channels: channelRows('object', node.animation.tracks),
    });
  }
  for (const camera of scene.cameras) {
    rows.push({ owner: `cam:${camera.id}`, label: camera.name, kind: 'camera', channels: channelRows('camera', camera.tracks) });
  }
  const sun = channelRows('sun', scene.sun.tracks);
  if (sun.length) {
    rows.push({ owner: 'sun', label: t('animation.sun.title'), kind: 'sun', channels: sun });
  }
  for (const light of scene.lights) {
    rows.push({ owner: `light:${light.id}`, label: light.name, kind: 'light', channels: channelRows('light', light.tracks) });
  }
  for (const [name, entry] of Object.entries(scene.materials)) {
    const channels = channelRows('material', entry.tracks);
    if (channels.length) {
      rows.push({ owner: `mat:${name}`, label: t('animation.material.row', { name }), kind: 'material', channels });
    }
  }
  return rows;
};

import type { PluginMesh } from '../../../src/plugins/types';

/**
 * The kinds of level objects: what they look like in the model (a small, recognisable shape around their origin –
 * the point that is placed), their colour, the properties a game engine reads, and the actions that triggers and
 * pickups set off on other objects (open a door, switch the camera, let enemies come …).
 */

export type ObjectKind =
  | 'spawn'
  | 'enemy'
  | 'waypoint'
  | 'trigger'
  | 'hazard'
  | 'soundzone'
  | 'pickup'
  | 'door'
  | 'savepoint'
  | 'camera'
  | 'jumppad'
  | 'teleporter'
  | 'light';

/** the groups the panel shows the kinds in */
export type KindGroup = 'actors' | 'volumes' | 'items' | 'world';

export type PropValue = string | number | boolean;

export interface PropSpec {
  name: string;
  /** text, number, a switch, a colour, one of `options`, or the id of another level object (of the kinds in `targets`) */
  type: 'text' | 'number' | 'boolean' | 'color' | 'choice' | 'target';
  default: PropValue;
  options?: string[];
  targets?: ObjectKind[];
}

export interface KindSpec {
  kind: ObjectKind;
  group: KindGroup;
  colour: string;
  /** opacity of its material (volumes are see-through) */
  opacity: number;
  /** width, depth and height of its shape at scale 1 (m) – a volume is scaled to the space it covers */
  size: [number, number, number];
  /** a volume: its size is what it watches (changed with the Scale tool) */
  volume?: boolean;
  /** how high above the clicked surface it is placed (a camera hangs under the ceiling) */
  lift?: number;
  /** it sets off actions on other objects (when entered, picked up …) */
  actions?: boolean;
  props: PropSpec[];
  /** its shape around the origin (z up, facing +x) – faces in `material`, details in `accent` */
  mesh: (material: string, accent: string) => PluginMesh;
}

// ------------------------------------------------------------ actions

export type ActionKind =
  | 'open'
  | 'close'
  | 'unlock'
  | 'lock'
  | 'enable'
  | 'disable'
  | 'spawn'
  | 'camera'
  | 'teleport'
  | 'sound'
  | 'message';

export interface LevelAction {
  do: ActionKind;
  /** the id of the object it works on */
  target?: string;
  /** a sound's name, a message's text */
  value?: string;
}

export interface ActionSpec {
  do: ActionKind;
  /** the kinds it works on – 'any' for every level object, none for actions without a target */
  targets?: ObjectKind[] | 'any';
  /** it takes a text (a sound, a message) */
  value?: boolean;
}

export const ACTIONS: ActionSpec[] = [
  { do: 'open', targets: ['door'] },
  { do: 'close', targets: ['door'] },
  { do: 'unlock', targets: ['door'] },
  { do: 'lock', targets: ['door'] },
  { do: 'enable', targets: 'any' },
  { do: 'disable', targets: 'any' },
  { do: 'spawn', targets: ['enemy'] },
  { do: 'camera', targets: ['camera'] },
  { do: 'teleport', targets: ['teleporter'] },
  { do: 'sound', value: true },
  { do: 'message', value: true },
];

export const actionSpec = (kind: ActionKind) => ACTIONS.find((spec) => spec.do === kind)!;

/** the actions as stored: only known ones, with the fields they take */
export const cleanActions = (value: unknown): LevelAction[] =>
  (Array.isArray(value) ? value : []).flatMap((entry) => {
    const spec = ACTIONS.find((candidate) => candidate.do === entry?.do);
    if (!spec) {
      return [];
    }
    return [
      {
        do: spec.do,
        ...(spec.targets ? { target: typeof entry.target === 'string' ? entry.target : '' } : {}),
        ...(spec.value ? { value: typeof entry.value === 'string' ? entry.value : '' } : {}),
      },
    ];
  });

// ------------------------------------------------------------ shapes

type Vertex = [number, number, number];

const shape = () => {
  const mesh: PluginMesh = { vertices: [], faces: [], faceMaterials: [] };
  /** a face from points, counter-clockwise seen from outside */
  const face = (points: Vertex[], material: string) => {
    const start = mesh.vertices.length;
    mesh.vertices.push(...points);
    mesh.faces.push(points.map((_, index) => start + index));
    mesh.faceMaterials!.push(material);
  };
  /** a face seen from both sides (a flag, an arrow standing up) */
  const sheet = (points: Vertex[], material: string) => {
    face(points, material);
    face([...points].reverse(), material);
  };
  /** an upright prism with `sides` corners (a cylinder with few sides) */
  const prism = (x: number, y: number, radius: number, z0: number, z1: number, sides: number, material: string) => {
    const ring = (z: number): Vertex[] =>
      Array.from({ length: sides }, (_, index) => {
        const angle = (index / sides) * Math.PI * 2;
        return [x + Math.cos(angle) * radius, y + Math.sin(angle) * radius, z];
      });
    const bottom = ring(z0),
      top = ring(z1);
    face([...bottom].reverse(), material);
    face(top, material);
    for (let index = 0; index < sides; index++) {
      const next = (index + 1) % sides;
      face([bottom[index], bottom[next], top[next], top[index]], material);
    }
  };
  const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, material: string) => {
    const corner = (x: number, y: number, z: number): Vertex => [x, y, z];
    face([corner(x0, y0, z0), corner(x0, y1, z0), corner(x1, y1, z0), corner(x1, y0, z0)], material);
    face([corner(x0, y0, z1), corner(x1, y0, z1), corner(x1, y1, z1), corner(x0, y1, z1)], material);
    face([corner(x0, y0, z0), corner(x1, y0, z0), corner(x1, y0, z1), corner(x0, y0, z1)], material);
    face([corner(x1, y1, z0), corner(x0, y1, z0), corner(x0, y1, z1), corner(x1, y1, z1)], material);
    face([corner(x0, y1, z0), corner(x0, y0, z0), corner(x0, y0, z1), corner(x0, y1, z1)], material);
    face([corner(x1, y0, z0), corner(x1, y1, z0), corner(x1, y1, z1), corner(x1, y0, z1)], material);
  };
  /** an arrow lying flat on a disc, pointing the way the object faces (+x) */
  const arrow = (z: number, length: number, material: string) =>
    face(
      [
        [length * 0.3, -length * 0.3, z],
        [length, 0, z],
        [length * 0.3, length * 0.3, z],
      ],
      material,
    );
  return { mesh, face, sheet, prism, box, arrow };
};

/** a person's place: a disc on the ground, an arrow the way it faces and a post as high as a person */
const standMesh =
  (radius: number, post: number) =>
  (material: string, accent: string): PluginMesh => {
    const { mesh, prism, arrow } = shape();
    prism(0, 0, radius, 0, 0.04, 16, material);
    prism(0, 0, post, 0.04, 1.8, 8, material);
    arrow(0.05, radius + 0.3, accent);
    return mesh;
  };

/** a volume: a box standing on the ground, centred on its origin – scaled to the space it watches */
const volumeMesh =
  ([width, depth, height]: [number, number, number]) =>
  (material: string): PluginMesh => {
    const { mesh, box } = shape();
    box(-width / 2, -depth / 2, 0, width / 2, depth / 2, height, material);
    return mesh;
  };

/** a pickup: a diamond floating above the ground */
const pickupMesh = (material: string) => {
  const { mesh, face } = shape();
  const [top, bottom]: Vertex[] = [
    [0, 0, 0.75],
    [0, 0, 0.25],
  ];
  const ring: Vertex[] = [
    [0.25, 0, 0.5],
    [0, 0.25, 0.5],
    [-0.25, 0, 0.5],
    [0, -0.25, 0.5],
  ];
  ring.forEach((corner, index) => {
    const next = ring[(index + 1) % ring.length];
    face([corner, next, top], material);
    face([next, corner, bottom], material);
  });
  return mesh;
};

/** a waypoint: a post with a flag pointing the way it faces (+x) */
const waypointMesh = (material: string, accent: string) => {
  const { mesh, sheet, prism } = shape();
  prism(0, 0, 0.2, 0, 0.03, 12, material);
  prism(0, 0, 0.03, 0.03, 1.6, 6, material);
  sheet(
    [
      [0.03, 0, 1.6],
      [0.45, 0, 1.45],
      [0.03, 0, 1.3],
    ],
    accent,
  );
  return mesh;
};

/** a door: frame and leaf in the plane x = 0, 1 m wide and 2.1 m high – it opens towards +x */
const doorMesh = (material: string, accent: string) => {
  const { mesh, box } = shape();
  box(-0.06, -0.56, 0, 0.06, -0.5, 2.16, accent);
  box(-0.06, 0.5, 0, 0.06, 0.56, 2.16, accent);
  box(-0.06, -0.5, 2.1, 0.06, 0.5, 2.16, accent);
  box(-0.025, -0.5, 0, 0.025, 0.5, 2.1, material);
  return mesh;
};

/** a save point: a desk with a typewriter-like box on it */
const savepointMesh = (material: string, accent: string) => {
  const { mesh, box } = shape();
  box(-0.3, -0.25, 0, 0.3, 0.25, 0.8, material);
  box(-0.18, -0.15, 0.8, 0.18, 0.15, 0.95, accent);
  return mesh;
};

/** a fixed camera: a body with a lens looking along +x, hung from its mount above */
const cameraMesh = (material: string, accent: string) => {
  const { mesh, box, prism } = shape();
  box(-0.25, -0.1, -0.12, 0.15, 0.1, 0.12, material);
  box(-0.03, -0.02, 0.12, 0.03, 0.02, 0.3, accent);
  // the lens: a short prism lying along +x, made from an upright one turned by hand
  const start = mesh.vertices.length;
  prism(0, 0, 0.07, 0.15, 0.3, 8, accent);
  for (let index = start; index < mesh.vertices.length; index++) {
    const [x, y, z] = mesh.vertices[index];
    mesh.vertices[index] = [z, y, -x];
  }
  return mesh;
};

/** a jump pad: a flat disc with an arrow standing up */
const jumppadMesh = (material: string, accent: string) => {
  const { mesh, prism, sheet } = shape();
  prism(0, 0, 0.6, 0, 0.08, 20, material);
  sheet(
    [
      [-0.12, 0, 0.08],
      [0.12, 0, 0.08],
      [0.12, 0, 0.5],
      [0.25, 0, 0.5],
      [0, 0, 0.8],
      [-0.25, 0, 0.5],
      [-0.12, 0, 0.5],
    ],
    accent,
  );
  return mesh;
};

/** a light: a bulb with a small cap above it – a spot's shines along +x, tilted by its pitch */
const lightMesh = (material: string, accent: string) => {
  const { mesh, face, prism } = shape();
  const ring: Vertex[] = [
    [0.12, 0, 0],
    [0, 0.12, 0],
    [-0.12, 0, 0],
    [0, -0.12, 0],
  ];
  const [top, bottom]: Vertex[] = [
    [0, 0, 0.14],
    [0, 0, -0.14],
  ];
  ring.forEach((corner, index) => {
    const next = ring[(index + 1) % ring.length];
    face([corner, next, top], material);
    face([next, corner, bottom], material);
  });
  prism(0, 0, 0.06, 0.14, 0.24, 8, accent);
  return mesh;
};

/** a teleporter: a disc on the ground and a see-through column above it */
const teleporterMesh = (material: string, accent: string) => {
  const { mesh, prism } = shape();
  prism(0, 0, 0.6, 0, 0.06, 20, accent);
  prism(0, 0, 0.5, 0.06, 2.2, 20, material);
  return mesh;
};

export const KINDS: Record<ObjectKind, KindSpec> = {
  spawn: {
    kind: 'spawn',
    group: 'actors',
    colour: '#2f9e44',
    opacity: 1,
    size: [0.9, 0.9, 1.8],
    props: [{ name: 'team', type: 'text', default: 'player' }],
    mesh: standMesh(0.45, 0.12),
  },
  enemy: {
    kind: 'enemy',
    group: 'actors',
    colour: '#c92a2a',
    opacity: 1,
    size: [0.9, 0.9, 1.8],
    props: [
      { name: 'type', type: 'text', default: 'zombie' },
      { name: 'count', type: 'number', default: 1 },
      { name: 'when', type: 'choice', default: 'start', options: ['start', 'action'] },
      { name: 'path', type: 'text', default: '' },
    ],
    mesh: standMesh(0.45, 0.2),
  },
  waypoint: {
    kind: 'waypoint',
    group: 'actors',
    colour: '#ae3ec9',
    opacity: 1,
    size: [0.45, 0.4, 1.6],
    props: [
      { name: 'path', type: 'text', default: 'patrol' },
      { name: 'order', type: 'number', default: 1 },
      { name: 'wait', type: 'number', default: 0 },
    ],
    mesh: waypointMesh,
  },
  trigger: {
    kind: 'trigger',
    group: 'volumes',
    colour: '#f08c00',
    opacity: 0.3,
    size: [2, 2, 2],
    volume: true,
    actions: true,
    props: [
      { name: 'on', type: 'choice', default: 'enter', options: ['enter', 'leave', 'use'] },
      { name: 'once', type: 'boolean', default: true },
    ],
    mesh: volumeMesh([2, 2, 2]),
  },
  hazard: {
    kind: 'hazard',
    group: 'volumes',
    colour: '#e03131',
    opacity: 0.3,
    size: [2, 2, 1],
    volume: true,
    props: [
      { name: 'damage', type: 'number', default: 10 },
      { name: 'kill', type: 'boolean', default: false },
    ],
    mesh: volumeMesh([2, 2, 1]),
  },
  soundzone: {
    kind: 'soundzone',
    group: 'volumes',
    colour: '#0c8599',
    opacity: 0.2,
    size: [4, 4, 3],
    volume: true,
    props: [
      { name: 'sound', type: 'text', default: 'ambience' },
      { name: 'volume', type: 'number', default: 1 },
      { name: 'reverb', type: 'choice', default: 'none', options: ['none', 'room', 'hall', 'cave'] },
    ],
    mesh: volumeMesh([4, 4, 3]),
  },
  pickup: {
    kind: 'pickup',
    group: 'items',
    colour: '#1c7ed6',
    opacity: 1,
    size: [0.5, 0.5, 0.75],
    actions: true,
    props: [
      { name: 'item', type: 'text', default: 'coin' },
      { name: 'amount', type: 'number', default: 1 },
      { name: 'respawn', type: 'number', default: 0 },
    ],
    mesh: pickupMesh,
  },
  door: {
    kind: 'door',
    group: 'items',
    colour: '#8d6e63',
    opacity: 1,
    size: [0.12, 1.12, 2.16],
    props: [
      { name: 'opens', type: 'choice', default: 'swing', options: ['swing', 'slide', 'up'] },
      { name: 'startsOpen', type: 'boolean', default: false },
      { name: 'locked', type: 'boolean', default: false },
      { name: 'key', type: 'text', default: '' },
    ],
    mesh: doorMesh,
  },
  savepoint: {
    kind: 'savepoint',
    group: 'items',
    colour: '#5f3dc4',
    opacity: 1,
    size: [0.6, 0.5, 0.95],
    props: [{ name: 'label', type: 'text', default: '' }],
    mesh: savepointMesh,
  },
  camera: {
    kind: 'camera',
    group: 'world',
    colour: '#495057',
    opacity: 1,
    size: [0.55, 0.2, 0.42],
    lift: 2.6,
    props: [
      { name: 'pitch', type: 'number', default: -30 },
      { name: 'fov', type: 'number', default: 50 },
      { name: 'start', type: 'boolean', default: false },
    ],
    mesh: cameraMesh,
  },
  jumppad: {
    kind: 'jumppad',
    group: 'world',
    colour: '#2b8a3e',
    opacity: 1,
    size: [1.2, 1.2, 0.8],
    props: [
      { name: 'height', type: 'number', default: 6 },
      { name: 'distance', type: 'number', default: 8 },
    ],
    mesh: jumppadMesh,
  },
  teleporter: {
    kind: 'teleporter',
    group: 'world',
    colour: '#3bc9db',
    opacity: 0.35,
    size: [1.2, 1.2, 2.2],
    props: [{ name: 'target', type: 'target', default: '', targets: ['teleporter'] }],
    mesh: teleporterMesh,
  },
  light: {
    kind: 'light',
    group: 'world',
    colour: '#fab005',
    opacity: 1,
    size: [0.24, 0.24, 0.38],
    lift: 2.4,
    props: [
      { name: 'type', type: 'choice', default: 'point', options: ['point', 'spot'] },
      { name: 'color', type: 'color', default: '#ffd8a8' },
      { name: 'intensity', type: 'number', default: 1 },
      { name: 'range', type: 'number', default: 8 },
      { name: 'angle', type: 'number', default: 35 },
      { name: 'pitch', type: 'number', default: -90 },
      { name: 'on', type: 'boolean', default: true },
      { name: 'flicker', type: 'boolean', default: false },
      { name: 'shadows', type: 'boolean', default: false },
    ],
    mesh: lightMesh,
  },
};

export const KIND_LIST = Object.values(KINDS);

export const KIND_GROUPS: KindGroup[] = ['actors', 'volumes', 'items', 'world'];

export const isKind = (value: unknown): value is ObjectKind => typeof value === 'string' && value in KINDS;

/** the properties of a kind with their defaults, overwritten by the given ones that fit */
export const propsFor = (kind: ObjectKind, given: Record<string, unknown> = {}) =>
  Object.fromEntries(
    KINDS[kind].props.map((spec) => {
      const value = given[spec.name];
      const fits = typeof value === typeof spec.default && (spec.type !== 'choice' || spec.options!.includes(value as string));
      return [spec.name, fits ? (value as PropValue) : spec.default];
    }),
  ) as Record<string, PropValue>;

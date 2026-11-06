/** Building footprints from OpenStreetMap, raised to their height. */

const LEVEL = 3;
const DEFAULT_LEVELS = 3;
const EARTH = 6371000;

export interface Footprint {
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}
export type Point = { x: number; y: number };
/** three.js's ShapeUtils, handed in by the caller: the triangles of a ring, and its signed area */
export interface Triangulator {
  triangulate: (ring: Point[]) => number[][];
  area: (ring: Point[]) => number;
}

const heightOf = (tags: Record<string, string> = {}) => {
  const height = Number.parseFloat(tags.height);
  if (height > 0) {
    return height;
  }
  const levels = Number.parseFloat(tags['building:levels']);
  return (levels > 0 ? levels : DEFAULT_LEVELS) * LEVEL;
};

/** the footprints as a binary STL in metres, Z up. shortcut: no holes and no multi-part buildings (OSM relations), which most buildings are not */
export const buildingsToStl = (ways: Footprint[], lat: number, lon: number, { triangulate, area }: Triangulator) => {
  const metresX = (Math.PI / 180) * EARTH * Math.cos((lat * Math.PI) / 180);
  const metresY = (Math.PI / 180) * EARTH;
  const triangles: number[] = [];
  const add = (a: number[], b: number[], c: number[]) => triangles.push(...a, ...b, ...c);
  for (const way of ways) {
    const ring = way.geometry?.map((node) => ({ x: (node.lon - lon) * metresX, y: (node.lat - lat) * metresY })) ?? [];
    // OSM closes a way by repeating its first node
    if (ring.length > 1 && ring[0].x === ring[ring.length - 1].x && ring[0].y === ring[ring.length - 1].y) {
      ring.pop();
    }
    if (ring.length < 3) {
      continue;
    }
    if (area(ring) < 0) {
      ring.reverse();
    }
    const height = heightOf(way.tags);
    for (const [a, b, c] of triangulate(ring)) {
      add([ring[a].x, ring[a].y, height], [ring[b].x, ring[b].y, height], [ring[c].x, ring[c].y, height]);
      add([ring[a].x, ring[a].y, 0], [ring[c].x, ring[c].y, 0], [ring[b].x, ring[b].y, 0]);
    }
    ring.forEach((a, index) => {
      const b = ring[(index + 1) % ring.length];
      add([a.x, a.y, 0], [b.x, b.y, 0], [b.x, b.y, height]);
      add([a.x, a.y, 0], [b.x, b.y, height], [a.x, a.y, height]);
    });
  }
  const count = triangles.length / 9;
  const bytes = new ArrayBuffer(84 + count * 50);
  const view = new DataView(bytes);
  view.setUint32(80, count, true);
  for (let triangle = 0; triangle < count; triangle++) {
    // a zero normal: readers work it out from the corners
    const at = 84 + triangle * 50 + 12;
    for (let value = 0; value < 9; value++) {
      view.setFloat32(at + value * 4, triangles[triangle * 9 + value], true);
    }
  }
  return { bytes, count };
};

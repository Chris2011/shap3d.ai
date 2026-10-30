import type { Course, Point2 } from './routes';

/**
 * Where a new road meets roads built already. A road that runs into another one ends at its edge – the end cut
 * along that edge, its height ramped to the other road's – and a road that crosses another one is split into two
 * pieces, one on each side. A road that starts or ends where another one ends simply goes on from it. The corners
 * between the two roads are filled with rounded patches (fillets). Plain geometry in the grid's coordinates.
 */

/** a road's course as kept on its terrain – with the surface's height along it and half its width */
export interface RoadCourse extends Course {
  /** the surface's height at each point of the line (roads built before junctions existed have none) */
  levels?: number[];
  /** half the width of the surface (m) */
  half?: number;
}

/** a road built already, as a later road meets it */
interface Carriageway {
  line: Point2[];
  levels: number[];
  half: number;
}

/** a stretch of the new road between junctions – `start` and `end` are its cut ends (right edge, left edge) */
export interface RoadPiece {
  line: Point2[];
  levels: number[];
  /** how much higher the right edge lies than the middle (the left edge as much lower) – where the road meets a
   * sloping road at a slant, its end tilts with it */
  tilts: number[];
  start?: [Point2, Point2];
  end?: [Point2, Point2];
}

/** a corner between the new road and another one, to be rounded off */
export interface JunctionCorner {
  corner: Point2;
  /** along the other road's edge, away from the new road */
  away: Point2;
  /** along the new road's edge, away from the other road */
  back: Point2;
  /** the surface's height at the corner, along `away` and along `back` (one radius away) */
  level: number;
  awayLevel: number;
  backLevel: number;
  radius: number;
}

/** how far before a junction the new road starts to follow the other road's height (m) */
const RAMP = 10;

const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

const unit = ([x, y]: Point2): Point2 => {
  const length = Math.hypot(x, y) || 1;
  return [x / length, y / length];
};

/** the normal on the right of a direction */
const rightOf = ([x, y]: Point2): Point2 => [y, -x];

const dot = (a: Point2, b: Point2) => a[0] * b[0] + a[1] * b[1];

/** a road's course as a carriageway – older courses without heights take the ground's (a road lies 0.12 m above it) */
export const carriagewayOf = (course: RoadCourse, groundAt: (x: number, y: number) => number): Carriageway => ({
  line: course.line,
  levels: course.levels?.length === course.line.length ? course.levels : course.line.map(([x, y]) => groundAt(x, y) + 0.12),
  // reach = half + max(2, 1.6 · half) / 2
  half: course.half ?? (course.reach >= 2.25 ? course.reach / 1.8 : course.reach - 1),
});

/** the end of a carriageway within reach of a point: the end and the way the carriageway runs out there */
const endNear = (existing: Carriageway[], [x, y]: Point2) => {
  for (const way of existing) {
    const wayLast = way.line.length - 1;
    for (const wayEnd of [0, wayLast]) {
      const [endX, endY] = way.line[wayEnd];
      if (Math.hypot(x - endX, y - endY) <= way.half * 1.2) {
        const neighbour = way.line[wayEnd === 0 ? 1 : wayLast - 1];
        return { way, wayEnd, out: unit([endX - neighbour[0], endY - neighbour[1]]) };
      }
    }
  }
  return null;
};

/**
 * Where a road's way is searched to when it starts or ends at another road's end: a little out along that road's
 * direction, so the way found comes in straight – the end itself is added after (null: not at a road's end).
 */
export const approachOf = (end: Point2, existing: Carriageway[], width: number): Point2 | null => {
  const near = endNear(existing, end);
  if (!near) {
    return null;
  }
  const [x, y] = near.way.line[near.wayEnd];
  const lead = Math.max(4, width * 1.5) * 2;
  return [x + near.out[0] * lead, y + near.out[1] * lead];
};

/**
 * A road's rough line (before it is rounded) that starts or ends at another road's end: moved onto that end, with
 * a point a few metres on in the way the other road ran out – so it leaves the old road straight and bends after.
 */
export const leadIn = (points: Point2[], existing: Carriageway[], width: number): Point2[] => {
  const line = points.map((point) => [...point] as Point2);
  const lead = Math.max(4, width * 1.5);
  for (const atStart of [true, false]) {
    const end = atStart ? 0 : line.length - 1;
    const near = endNear(existing, line[end]);
    if (!near) {
      continue;
    }
    const [x, y] = near.way.line[near.wayEnd];
    const next = line[atStart ? 1 : line.length - 2];
    const reach = Math.min(lead, Math.hypot(next[0] - x, next[1] - y) * 0.4);
    line[end] = [x, y];
    line.splice(atStart ? 1 : line.length - 1, 0, [x + near.out[0] * reach, y + near.out[1] * reach]);
  }
  return line;
};

/** where a point is nearest to a carriageway: how far, the height and direction there, and whether it is beyond its ends */
const nearestOn = ({ line, levels }: Carriageway, x: number, y: number) => {
  let best = { distance: Infinity, level: levels[0], direction: [1, 0] as Point2, beyond: false };
  for (let index = 1; index < line.length; index++) {
    const [ax, ay] = line[index - 1],
      [bx, by] = line[index];
    const lengthSq = (bx - ax) ** 2 + (by - ay) ** 2;
    if (!lengthSq) {
      continue;
    }
    const raw = ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / lengthSq;
    const along = clamp(raw, 0, 1);
    const distance = Math.hypot(x - ax - (bx - ax) * along, y - ay - (by - ay) * along);
    if (distance < best.distance) {
      best = {
        distance,
        level: levels[index - 1] + (levels[index] - levels[index - 1]) * along,
        direction: unit([bx - ax, by - ay]),
        beyond: (index === 1 && raw < 0) || (index === line.length - 1 && raw > 1),
      };
    }
  }
  return best;
};

/** is a spot on the carriageway's surface? (a road's surface ends square, so not beyond its ends) */
const onSurface = (way: Carriageway, x: number, y: number) => {
  const nearest = nearestOn(way, x, y);
  return nearest.distance < way.half - 0.01 && !nearest.beyond;
};

/**
 * Meets the roads built already: returns the new road's line (its ends moved onto an old road's end where they
 * join one), its heights ramped to the old roads' at the junctions, the pieces to lay and the corners to round off.
 */
export const meetRoads = (points: Point2[], heights: number[], half: number, existing: Carriageway[]) => {
  const line = points.map((point) => [...point] as Point2);
  const last = line.length - 1;
  const targets: { at: number; level: number }[] = [];
  const corners: JunctionCorner[] = [];
  const radius = clamp(half * 1.2, 1, 3);

  // ends that join an old road's end go on from it: the same point, height and end cut
  const sections: (Point2[] | undefined)[] = [undefined, undefined];
  const joined: (Carriageway | undefined)[] = [undefined, undefined];
  [0, last].forEach((end, which) => {
    const near = endNear(existing, line[end]);
    if (!near) {
      return;
    }
    const [x, y] = near.way.line[near.wayEnd];
    line[end] = [x, y];
    joined[which] = near.way;
    const across = rightOf(near.out);
    const next = line[end === 0 ? 1 : last - 1];
    const direction = unit(end === 0 ? [next[0] - x, next[1] - y] : [x - next[0], y - next[1]]);
    const side = dot(across, rightOf(direction)) >= 0 ? half : -half;
    sections[which] = [
      [x + across[0] * side, y + across[1] * side],
      [x - across[0] * side, y - across[1] * side],
    ];
    targets.push({ at: end, level: near.way.levels[near.wayEnd] });
  });

  // how far along the line each point is
  const arcs = line.map(() => 0);
  for (let index = 1; index <= last; index++) {
    arcs[index] = arcs[index - 1] + Math.hypot(line[index][0] - line[index - 1][0], line[index][1] - line[index - 1][1]);
  }
  const arcTargets = targets.map(({ at, level }) => ({ arc: arcs[at], level }));

  // the points on an old road's surface (the old road a joined end goes on from does not count at that end)
  const hits = line.map(([x, y], index) =>
    existing.findIndex((way) => !((index < 3 && way === joined[0]) || (index > last - 3 && way === joined[1])) && onSurface(way, x, y)),
  );

  // where the line enters or leaves an old road's surface – found to a few centimetres by halving the step
  const cuts: {
    index: number;
    entering: boolean;
    at: Point2;
    arc: number;
    level: number;
    tilt: number;
    section: [Point2, Point2];
    way: Carriageway;
    edge: Point2;
    travel: Point2;
  }[] = [];
  for (let index = 0; index < last; index++) {
    const entering = hits[index] === -1 && hits[index + 1] !== -1;
    const leaving = hits[index] !== -1 && hits[index + 1] === -1;
    if (!entering && !leaving) {
      continue;
    }
    const way = existing[entering ? hits[index + 1] : hits[index]];
    const [ax, ay] = line[index],
      [bx, by] = line[index + 1];
    let outside = entering ? 0 : 1,
      inside = entering ? 1 : 0;
    for (let round = 0; round < 12; round++) {
      const middle = (outside + inside) / 2;
      if (onSurface(way, ax + (bx - ax) * middle, ay + (by - ay) * middle)) {
        inside = middle;
      } else {
        outside = middle;
      }
    }
    const at: Point2 = [ax + (bx - ax) * outside, ay + (by - ay) * outside];
    const nearest = nearestOn(way, at[0], at[1]);
    // the end cut runs along the old road's edge – no flatter than about 20°, else the cut grows too long
    const travel = unit([bx - ax, by - ay]);
    let edge = nearest.direction;
    let slant = dot(edge, rightOf(travel));
    if (slant < 0) {
      edge = [-edge[0], -edge[1]];
      slant = -slant;
    }
    const reach = half / Math.max(slant, 0.35);
    const section: [Point2, Point2] = [
      [at[0] + edge[0] * reach, at[1] + edge[1] * reach],
      [at[0] - edge[0] * reach, at[1] - edge[1] * reach],
    ];
    // the old road falls along its edge – the cut end tilts with it
    const tilt = (nearestOn(way, ...section[0]).level - nearestOn(way, ...section[1]).level) / 2;
    const arc = arcs[index] + Math.hypot(at[0] - ax, at[1] - ay);
    cuts.push({ index, entering, at, arc, level: nearest.level, tilt, section, way, edge, travel });
    arcTargets.push({ arc, level: nearest.level });
  }

  // the heights ramp to the old roads' over the last metres before each junction
  const levels = heights.map((height, index) =>
    arcTargets.reduce((level, target) => {
      const weight = clamp(1 - Math.abs(arcs[index] - target.arc) / RAMP, 0, 1);
      return level + (target.level - level) * weight * weight * (3 - 2 * weight);
    }, height),
  );
  // the tilt fades out over a few metres into the road's own piece
  const fade = half * 3;
  const tiltAt = (arc: number) =>
    cuts.reduce((sum, cut) => {
      const into = cut.entering ? cut.arc - arc : arc - cut.arc;
      return into < -1e-6 ? sum : sum + cut.tilt * clamp(1 - into / fade, 0, 1);
    }, 0);
  const levelAt = (arc: number) => {
    const after = arcs.findIndex((value) => value >= arc);
    if (after <= 0) {
      return levels[after === 0 ? 0 : last];
    }
    const share = (arc - arcs[after - 1]) / (arcs[after] - arcs[after - 1] || 1);
    return levels[after - 1] + (levels[after] - levels[after - 1]) * share;
  };

  // the pieces between the junctions, and the corners at each cut
  const pieces: RoadPiece[] = [];
  let piece: RoadPiece | null =
    hits[0] === -1 ? { line: [], levels: [], tilts: [], start: sections[0] as [Point2, Point2] | undefined } : null;
  let cutIndex = 0;
  for (let index = 0; index <= last; index++) {
    if (piece && hits[index] === -1) {
      piece.line.push(line[index]);
      piece.levels.push(levels[index]);
      piece.tilts.push(tiltAt(arcs[index]));
    }
    const cut = cuts[cutIndex]?.index === index ? cuts[cutIndex++] : undefined;
    if (!cut) {
      continue;
    }
    if (cut.entering && piece) {
      piece.line.push(cut.at);
      piece.levels.push(cut.level);
      piece.tilts.push(cut.tilt);
      piece.end = cut.section;
      pieces.push(piece);
      piece = null;
    } else if (!cut.entering) {
      piece = { line: [cut.at], levels: [cut.level], tilts: [cut.tilt], start: cut.section };
    }
    const back: Point2 = cut.entering ? [-cut.travel[0], -cut.travel[1]] : cut.travel;
    cut.section.forEach((corner, which) => {
      const away: Point2 = which === 0 ? cut.edge : [-cut.edge[0], -cut.edge[1]];
      corners.push({
        corner,
        away,
        back,
        level: cut.level + (which === 0 ? cut.tilt : -cut.tilt),
        awayLevel: nearestOn(cut.way, corner[0] + away[0] * radius, corner[1] + away[1] * radius).level,
        backLevel: (() => {
          const arc = cut.arc + (cut.entering ? -radius : radius);
          return levelAt(arc) + (which === 0 ? tiltAt(arc) : -tiltAt(arc));
        })(),
        radius,
      });
    });
  }
  if (piece) {
    if (sections[1]) {
      piece.end = sections[1] as [Point2, Point2];
    }
    pieces.push(piece);
  }
  return { line, levels, pieces: pieces.filter((stretch) => stretch.line.length >= 2), corners };
};

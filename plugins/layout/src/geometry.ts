import {
  newId,
  type ArcElement,
  type LayoutElement,
  type LayoutPage,
  type LineElement,
  type PathElement,
  type RectElement,
} from './document';

/**
 * 2D drafting on lines, like LayOut's tools: trim a piece between intersections, extend an end to the next
 * line, round (fillet) or cut (chamfer) the corner of two lines. Rectangles count as four lines for cutting
 * and extending; *Explode* turns one into lines that the tools can change.
 */

export interface Point {
  x: number;
  y: number;
}
type Segment = [Point, Point];

const EPSILON = 1e-9;

const segmentOf = (line: LineElement): Segment => [
  { x: line.x1, y: line.y1 },
  { x: line.x2, y: line.y2 },
];

export const rectEdges = (rect: RectElement): Segment[] => {
  const a = { x: rect.x, y: rect.y },
    b = { x: rect.x + rect.w, y: rect.y },
    c = { x: rect.x + rect.w, y: rect.y + rect.h },
    d = { x: rect.x, y: rect.y + rect.h };
  return [
    [a, b],
    [b, c],
    [c, d],
    [d, a],
  ];
};

const pathSegments = (path: PathElement): Segment[] => {
  const points = path.points.map(([x, y]) => ({ x, y }));
  const segments = points.slice(1).map((point, i): Segment => [points[i], point]);
  return path.closed && points.length > 2 ? [...segments, [points[points.length - 1], points[0]]] : segments;
};

/** the four lines of a rectangle (Explode) */
export const explodeRect = (rect: RectElement): LineElement[] =>
  rectEdges(rect).map(([start, end]) => ({ id: newId(), type: 'line', x1: start.x, y1: start.y, x2: end.x, y2: end.y }));

/** every segment on the page that other lines can be cut at or extended to, except the line itself */
const cutters = (page: LayoutPage, except: string): Segment[] =>
  page.elements.flatMap((element) =>
    element.id === except
      ? []
      : element.type === 'line'
        ? [segmentOf(element)]
        : element.type === 'rect'
          ? rectEdges(element)
          : element.type === 'path'
            ? pathSegments(element)
            : [],
  );

/** where the line through a → b meets segment c → d: t along a → b (any value), u along c → d (0 … 1) */
const intersect = (a: Point, b: Point, c: Point, d: Point) => {
  const rx = b.x - a.x,
    ry = b.y - a.y,
    sx = d.x - c.x,
    sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  if (Math.abs(denominator) < EPSILON) {
    return null; // parallel
  }
  const t = ((c.x - a.x) * sy - (c.y - a.y) * sx) / denominator;
  const u = ((c.x - a.x) * ry - (c.y - a.y) * rx) / denominator;
  return u >= -EPSILON && u <= 1 + EPSILON ? t : null;
};

const pointAt = (a: Point, b: Point, t: number): Point => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });

/** position of `point` along a → b (0 at a, 1 at b) */
const parameterOf = (a: Point, b: Point, point: Point) => {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  return ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1);
};

/**
 * Trim: removes the piece of `line` around `click` that lies between its neighbouring intersections.
 * Returns the lines that stay (none, one or two).
 */
export const trimLine = (page: LayoutPage, line: LineElement, click: Point): LineElement[] => {
  const [a, b] = segmentOf(line);
  const cuts = cutters(page, line.id)
    .map(([c, d]) => intersect(a, b, c, d))
    .filter((t): t is number => t != null && t > 1e-6 && t < 1 - 1e-6)
    .sort((first, second) => first - second);
  const at = parameterOf(a, b, click);
  const before = [...cuts].reverse().find((t) => t < at);
  const after = cuts.find((t) => t > at);
  const piece = (from: number, to: number): LineElement => {
    const start = pointAt(a, b, from),
      end = pointAt(a, b, to);
    return { ...line, id: newId(), x1: start.x, y1: start.y, x2: end.x, y2: end.y };
  };
  const kept: LineElement[] = [];
  if (before != null) {
    kept.push(piece(0, before));
  }
  if (after != null) {
    kept.push(piece(after, 1));
  }
  // keep the original id on the first piece, so the selection and undo labels stay with it
  if (kept.length) {
    kept[0].id = line.id;
  }
  return kept;
};

/** Extend: moves the end of `line` nearer to `click` up to the next line or rectangle edge it would meet. */
export const extendLine = (page: LayoutPage, line: LineElement, click: Point): LineElement | null => {
  const [a, b] = segmentOf(line);
  const fromEnd = parameterOf(a, b, click) > 0.5;
  const hits = cutters(page, line.id)
    .map(([c, d]) => intersect(a, b, c, d))
    .filter((t): t is number => t != null && (fromEnd ? t > 1 + 1e-6 : t < -1e-6));
  if (!hits.length) {
    return null;
  }
  const t = fromEnd ? Math.min(...hits) : Math.max(...hits);
  const point = pointAt(a, b, t);
  return fromEnd ? { ...line, x2: point.x, y2: point.y } : { ...line, x1: point.x, y1: point.y };
};

/**
 * Fillet (radius > 0) or chamfer: joins two lines at their corner. Each line keeps the part on the side
 * where it was clicked; the corner becomes an arc (fillet), a short line (chamfer) or – with 0 – a sharp corner.
 */
export const joinCorner = (
  first: { line: LineElement; click: Point },
  second: { line: LineElement; click: Point },
  size: number,
  kind: 'fillet' | 'chamfer',
): { lines: [LineElement, LineElement]; corner: LineElement | ArcElement | null } | null => {
  const [a1, b1] = segmentOf(first.line);
  const [a2, b2] = segmentOf(second.line);
  const t = lineIntersection(a1, b1, a2, b2);
  if (t == null) {
    return null; // parallel lines have no corner
  }
  const corner = pointAt(a1, b1, t);
  /** unit vector from the corner along a line towards where it was clicked, and how long that part is */
  const keptDirection = (a: Point, b: Point, click: Point) => {
    const far = Math.hypot(a.x - corner.x, a.y - corner.y) > Math.hypot(b.x - corner.x, b.y - corner.y) ? a : b;
    const towards = (click.x - corner.x) * (far.x - corner.x) + (click.y - corner.y) * (far.y - corner.y) >= 0 ? far : far === a ? b : a;
    const length = Math.hypot(towards.x - corner.x, towards.y - corner.y);
    return { direction: { x: (towards.x - corner.x) / (length || 1), y: (towards.y - corner.y) / (length || 1) }, end: towards, length };
  };
  const one = keptDirection(a1, b1, first.click);
  const two = keptDirection(a2, b2, second.click);
  const cosine = one.direction.x * two.direction.x + one.direction.y * two.direction.y;
  const angle = Math.acos(Math.max(-1, Math.min(1, cosine)));
  if (angle < 1e-3 || Math.PI - angle < 1e-3) {
    return null;
  }
  // how far from the corner the lines end
  const cut = kind === 'fillet' ? size / Math.tan(angle / 2) : size;
  if (cut > one.length - 1e-6 || cut > two.length - 1e-6) {
    return null; // the radius or distance is too big for these lines
  }
  const tangent1 = { x: corner.x + one.direction.x * cut, y: corner.y + one.direction.y * cut };
  const tangent2 = { x: corner.x + two.direction.x * cut, y: corner.y + two.direction.y * cut };
  const lines: [LineElement, LineElement] = [
    { ...first.line, x1: one.end.x, y1: one.end.y, x2: tangent1.x, y2: tangent1.y },
    { ...second.line, x1: two.end.x, y1: two.end.y, x2: tangent2.x, y2: tangent2.y },
  ];
  if (size <= 0) {
    return { lines, corner: null };
  }
  if (kind === 'chamfer') {
    return { lines, corner: { id: newId(), type: 'line', x1: tangent1.x, y1: tangent1.y, x2: tangent2.x, y2: tangent2.y } };
  }
  // the arc's centre lies on the bisector
  const bisector = { x: one.direction.x + two.direction.x, y: one.direction.y + two.direction.y };
  const bisectorLength = Math.hypot(bisector.x, bisector.y) || 1;
  const distance = size / Math.sin(angle / 2);
  const center = { x: corner.x + (bisector.x / bisectorLength) * distance, y: corner.y + (bisector.y / bisectorLength) * distance };
  const angleOf = (point: Point) => (Math.atan2(point.y - center.y, point.x - center.x) * 180) / Math.PI;
  let start = angleOf(tangent1),
    end = angleOf(tangent2);
  // the short way round
  const sweep = (((end - start) % 360) + 360) % 360;
  if (sweep > 180) {
    [start, end] = [end, start];
  }
  return { lines, corner: { id: newId(), type: 'arc', cx: center.x, cy: center.y, r: size, start, end } };
};

/** where two (infinite) lines meet, as t along the first – for corners whose lines do not reach each other */
const lineIntersection = (a: Point, b: Point, c: Point, d: Point) => {
  const rx = b.x - a.x,
    ry = b.y - a.y,
    sx = d.x - c.x,
    sy = d.y - c.y;
  const denominator = rx * sy - ry * sx;
  return Math.abs(denominator) < EPSILON ? null : ((c.x - a.x) * sy - (c.y - a.y) * sx) / denominator;
};

/** SVG path of an arc (clockwise from start to end) */
export const arcPath = (arc: { cx: number; cy: number; r: number; start: number; end: number }) => {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const sweep = (((arc.end - arc.start) % 360) + 360) % 360 || 360;
  const from = { x: arc.cx + arc.r * Math.cos(radians(arc.start)), y: arc.cy + arc.r * Math.sin(radians(arc.start)) };
  const to = { x: arc.cx + arc.r * Math.cos(radians(arc.end)), y: arc.cy + arc.r * Math.sin(radians(arc.end)) };
  const round = (value: number) => Number(value.toFixed(3));
  if (sweep >= 359.999) {
    // a full turn: two halves
    const half = { x: arc.cx - (from.x - arc.cx), y: arc.cy - (from.y - arc.cy) };
    return `M${round(from.x)} ${round(from.y)}A${round(arc.r)} ${round(arc.r)} 0 0 1 ${round(half.x)} ${round(half.y)}A${round(arc.r)} ${round(arc.r)} 0 0 1 ${round(from.x)} ${round(from.y)}`;
  }
  return `M${round(from.x)} ${round(from.y)}A${round(arc.r)} ${round(arc.r)} 0 ${sweep > 180 ? 1 : 0} 1 ${round(to.x)} ${round(to.y)}`;
};

// ------------------------------------------------------------ arcs, offset, split and join

const degrees = (radians: number) => (radians * 180) / Math.PI;

/**
 * The arc from `start` to `end` that passes through `through` (2-point arc with its bulge, 3 points on a circle).
 * Null when the points lie on one line.
 */
export const arcThroughPoints = (start: Point, end: Point, through: Point) => {
  const d = 2 * (start.x * (end.y - through.y) + end.x * (through.y - start.y) + through.x * (start.y - end.y));
  if (Math.abs(d) < 1e-9) {
    return null;
  }
  const square = (point: Point) => point.x * point.x + point.y * point.y;
  const cx = (square(start) * (end.y - through.y) + square(end) * (through.y - start.y) + square(through) * (start.y - end.y)) / d;
  const cy = (square(start) * (through.x - end.x) + square(end) * (start.x - through.x) + square(through) * (end.x - start.x)) / d;
  const r = Math.hypot(start.x - cx, start.y - cy);
  const angle = (point: Point) => degrees(Math.atan2(point.y - cy, point.x - cx));
  const from = angle(start),
    to = angle(end),
    via = angle(through);
  // clockwise from `from`: does the way to `to` pass `via`? otherwise draw the other way round
  const clockwise = (a: number, b: number) => (((b - a) % 360) + 360) % 360;
  const passes = clockwise(from, via) <= clockwise(from, to);
  return passes ? { cx, cy, r, start: from, end: to } : { cx, cy, r, start: to, end: from };
};

/** the angle (degrees, clockwise, 0 = right) from `center` to `point` */
export const angleTo = (center: Point, point: Point) => degrees(Math.atan2(point.y - center.y, point.x - center.x));

/**
 * Offset: a copy of the element moved outwards (or inwards when clicked inside) by `distance` – lines to the
 * side of `click`, shapes around their centre.
 */
export const offsetElement = (element: LayoutElement, distance: number, click: Point): LayoutElement | null => {
  switch (element.type) {
    case 'line': {
      const dx = element.x2 - element.x1,
        dy = element.y2 - element.y1;
      const length = Math.hypot(dx, dy) || 1;
      const normal = { x: dy / length, y: -dx / length };
      const side = (click.x - element.x1) * normal.x + (click.y - element.y1) * normal.y >= 0 ? 1 : -1;
      const shift = { x: normal.x * distance * side, y: normal.y * distance * side };
      return {
        ...element,
        id: newId(),
        x1: element.x1 + shift.x,
        y1: element.y1 + shift.y,
        x2: element.x2 + shift.x,
        y2: element.y2 + shift.y,
      };
    }
    case 'rect': {
      const inside = click.x > element.x && click.x < element.x + element.w && click.y > element.y && click.y < element.y + element.h;
      const amount = inside ? -distance : distance;
      if (element.w + 2 * amount <= 0 || element.h + 2 * amount <= 0) {
        return null;
      }
      const radius = element.corners === 'rounded' && element.radius ? Math.max(0, element.radius + amount) : element.radius;
      return {
        ...element,
        id: newId(),
        x: element.x - amount,
        y: element.y - amount,
        w: element.w + 2 * amount,
        h: element.h + 2 * amount,
        radius,
      };
    }
    case 'circle':
    case 'polygon':
    case 'arc': {
      const inside = Math.hypot(click.x - element.cx, click.y - element.cy) < element.r;
      const r = element.r + (inside ? -distance : distance);
      return r > 0 ? { ...element, id: newId(), r } : null;
    }
    case 'ellipse': {
      const inside = ((click.x - element.cx) / element.rx) ** 2 + ((click.y - element.cy) / element.ry) ** 2 < 1;
      const amount = inside ? -distance : distance;
      return element.rx + amount > 0 && element.ry + amount > 0
        ? { ...element, id: newId(), rx: element.rx + amount, ry: element.ry + amount }
        : null;
    }
    case 'path': {
      // every segment moves along its normal (away from the centre = out); corners meet where the moved segments cross
      const points = element.points.map(([x, y]) => ({ x, y }));
      if (points.length < 2) {
        return null;
      }
      const closedPoints = element.closed ? [...points, points[0]] : points;
      const centre = points.reduce((sum, point) => ({ x: sum.x + point.x / points.length, y: sum.y + point.y / points.length }), {
        x: 0,
        y: 0,
      });
      const outward =
        Math.hypot(click.x - centre.x, click.y - centre.y) > Math.hypot(points[0].x - centre.x, points[0].y - centre.y) ? 1 : -1;
      const segments = closedPoints.slice(1).map((end, i): Segment => {
        const start = closedPoints[i];
        const length = Math.hypot(end.x - start.x, end.y - start.y) || 1;
        let normal = { x: (end.y - start.y) / length, y: -(end.x - start.x) / length };
        const middle = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
        if ((middle.x - centre.x) * normal.x + (middle.y - centre.y) * normal.y < 0) {
          normal = { x: -normal.x, y: -normal.y };
        }
        const shift = { x: normal.x * distance * outward, y: normal.y * distance * outward };
        return [
          { x: start.x + shift.x, y: start.y + shift.y },
          { x: end.x + shift.x, y: end.y + shift.y },
        ];
      });
      const joined: [number, number][] = segments.map(([start], i) => {
        const previous = segments[i - 1] ?? (element.closed ? segments[segments.length - 1] : null);
        if (!previous) {
          return [start.x, start.y];
        }
        const t = lineIntersection(previous[0], previous[1], segments[i][0], segments[i][1]);
        const corner = t == null ? start : pointAt(previous[0], previous[1], t);
        return [corner.x, corner.y];
      });
      if (!element.closed) {
        const last = segments[segments.length - 1][1];
        joined.push([last.x, last.y]);
      }
      return { ...element, id: newId(), points: joined };
    }
    default:
      return null;
  }
};

/** Split: a line at the clicked point into two, a rectangle into its four lines, a path at its nearest corner. */
export const splitElement = (element: LayoutElement, click: Point): LayoutElement[] | null => {
  if (element.type === 'line') {
    const [a, b] = segmentOf(element);
    const t = Math.max(0.01, Math.min(0.99, parameterOf(a, b, click)));
    const point = pointAt(a, b, t);
    return [
      { ...element, x2: point.x, y2: point.y },
      { ...element, id: newId(), x1: point.x, y1: point.y },
    ];
  }
  if (element.type === 'rect' && (!element.corners || element.corners === 'square')) {
    // the rectangle opens at the click: a path from there once around back to it
    const edges = rectEdges(element);
    const distanceTo = ([a, b]: Segment) => {
      const point = pointAt(a, b, Math.max(0, Math.min(1, parameterOf(a, b, click))));
      return Math.hypot(point.x - click.x, point.y - click.y);
    };
    const nearest = edges.reduce((best, edge, i) => (distanceTo(edge) < distanceTo(edges[best]) ? i : best), 0);
    const [a, b] = edges[nearest];
    const cut = pointAt(a, b, Math.max(0.01, Math.min(0.99, parameterOf(a, b, click))));
    const corners = [1, 2, 3, 4].map((step) => edges[(nearest + step) % 4][0]);
    const points = [cut, ...corners, cut].map((point): [number, number] => [point.x, point.y]);
    return [{ id: element.id, type: 'path', points, closed: false, style: element.style, locked: element.locked }];
  }
  if (element.type === 'path' && element.points.length > 2) {
    let nearest = 0;
    element.points.forEach(([x, y], i) => {
      const [nx, ny] = element.points[nearest];
      if (Math.hypot(x - click.x, y - click.y) < Math.hypot(nx - click.x, ny - click.y)) {
        nearest = i;
      }
    });
    if (element.closed) {
      // open the ring at that corner
      return [{ ...element, closed: false, points: [...element.points.slice(nearest), ...element.points.slice(0, nearest + 1)] }];
    }
    if (nearest === 0 || nearest === element.points.length - 1) {
      return null;
    }
    return [
      { ...element, points: element.points.slice(0, nearest + 1) },
      { ...element, id: newId(), points: element.points.slice(nearest) },
    ];
  }
  return null;
};

/** Join: lines and open paths that touch at their ends become one path (closed when the ends meet). */
export const joinElements = (elements: LayoutElement[]): PathElement | null => {
  const pieces = elements.flatMap((element): [number, number][][] =>
    element.type === 'line'
      ? [
          [
            [element.x1, element.y1],
            [element.x2, element.y2],
          ],
        ]
      : element.type === 'path' && !element.closed
        ? [element.points.map(([x, y]) => [x, y] as [number, number])]
        : [],
  );
  if (pieces.length < 2) {
    return null;
  }
  const near = (a: [number, number], b: [number, number]) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.6;
  const chain = pieces.shift()!;
  let grown = true;
  while (pieces.length && grown) {
    grown = false;
    for (let i = 0; i < pieces.length; i++) {
      const piece = pieces[i];
      const head = chain[0],
        tail = chain[chain.length - 1];
      if (near(tail, piece[0])) {
        chain.push(...piece.slice(1));
      } else if (near(tail, piece[piece.length - 1])) {
        chain.push(...[...piece].reverse().slice(1));
      } else if (near(head, piece[piece.length - 1])) {
        chain.unshift(...piece.slice(0, -1));
      } else if (near(head, piece[0])) {
        chain.unshift(...[...piece].reverse().slice(0, -1));
      } else {
        continue;
      }
      pieces.splice(i, 1);
      grown = true;
      break;
    }
  }
  if (pieces.length) {
    return null; // not everything touches
  }
  const closed = chain.length > 3 && near(chain[0], chain[chain.length - 1]);
  return {
    id: newId(),
    type: 'path',
    points: closed ? chain.slice(0, -1) : chain,
    closed,
    style: elements.find((element) => element.style)?.style,
  };
};

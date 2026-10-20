/**
 * Tool cursors (32×32 SVG) modelled on SketchUp Web's look: navy arrows, red pencils and tool
 * symbols, light blue shape badges. All shapes are drawn here (no assets are copied).
 */
const RED = '#e8231f',
  NAVY = '#0e416c',
  WHITE = '#ffffff',
  LBLUE = '#1e9bd7';

const svg = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32" fill="none" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

// red pencil from the hotspot (3,29) to the upper right
const PENCIL = `
  <path d="M3 29 L7 20.5 L22 5.5 L26.5 10 L11.5 25 Z" fill="${WHITE}" stroke="${RED}" stroke-width="1.6"/>
  <path d="M3 29 L7 20.5 L11.5 25 Z" fill="${NAVY}" stroke="${NAVY}" stroke-width="1"/>
  <path d="M19.2 8.3 L23.7 12.8" stroke="${RED}" stroke-width="1.6"/>`;

// small navy arrow with the hotspot at (4,3)
const ARROW = `<path d="M4 3 L4 18.5 L7.8 15 L10.6 21 L13 19.9 L10.3 14 L15.3 13.8 Z" fill="${NAVY}" stroke="${WHITE}" stroke-width="1.1"/>`;

/** Shape badges in the upper left (x/y 1–13) for drawing tools, light blue like SketchUp. */
const HOTSPOT_TOP_LEFT = {
  rect: `<rect x="2" y="2" width="10" height="8" fill="${WHITE}" stroke="${LBLUE}" stroke-width="1.5"/>`,
  rotrect: `<path d="M1.5 7 L6.5 2 L12 7.5 L7 12.5 Z" fill="${WHITE}" stroke="${LBLUE}" stroke-width="1.5"/>`,
  circle: `<circle cx="7" cy="7" r="5" fill="${WHITE}" stroke="${LBLUE}" stroke-width="1.5"/>`,
  polygon: `<path d="M7 1.8 L12.2 5.6 L10.2 11.7 H3.8 L1.8 5.6 Z" fill="${WHITE}" stroke="${LBLUE}" stroke-width="1.5"/>`,
  arc: `<path d="M1.5 10 A5.5 5.5 0 0 1 12.5 10" stroke="${LBLUE}" stroke-width="1.6"/><circle cx="7" cy="10" r="1.2" fill="${LBLUE}"/>`,
  arc2: `<path d="M1.5 11 Q7 0 12.5 11" stroke="${LBLUE}" stroke-width="1.6"/><circle cx="1.5" cy="11" r="1.3" fill="${RED}"/><circle cx="12.5" cy="11" r="1.3" fill="${RED}"/>`,
  arc3: `<path d="M1.5 11 Q7 0 12.5 11" stroke="${LBLUE}" stroke-width="1.6"/><circle cx="1.5" cy="11" r="1.3" fill="${RED}"/><circle cx="7" cy="5.5" r="1.3" fill="${RED}"/><circle cx="12.5" cy="11" r="1.3" fill="${RED}"/>`,
  pie: `<path d="M3 11 L12.5 11 A9.5 9.5 0 0 0 6 2.2 Z" fill="${WHITE}" stroke="${LBLUE}" stroke-width="1.5"/>`,
  freehand: `<path d="M1.5 9 C3.5 3 5.5 12 8 6 S11 2 12.5 5" stroke="${LBLUE}" stroke-width="1.6"/>`,
};

/** Tool badges in the upper right (x/y 16–31) next to the navy arrow. */
const HOTSPOT_TOP_RIGHT = {
  pushpull: `<path d="M16.5 15 L21 12 L30.5 12 L26 15 Z" fill="${WHITE}" stroke="${NAVY}" stroke-width="1.3"/><path d="M16.5 15 V18 H26 V15 M26 18 L30.5 15 V12" stroke="${NAVY}" stroke-width="1.3"/><path d="M23.5 11 V2.5 M20.7 5.3 L23.5 2.5 L26.3 5.3" stroke="${RED}" stroke-width="1.9"/>`,
  scale: `<rect x="17" y="8" width="9" height="9" fill="${WHITE}" stroke="${NAVY}" stroke-width="1.4"/><path d="M21.5 12.5 L30 4 M25.5 4 H30 V8.5" stroke="${RED}" stroke-width="1.7"/>`,
  offset: `<path d="M18 13 A7 7 0 0 1 30 9" stroke="${NAVY}" stroke-width="1.6"/><path d="M21.5 14.5 A4 4 0 0 1 27.8 11.6" stroke="${RED}" stroke-width="1.6"/>`,
  followme: `<path d="M18 16 C18 9 24 10 24 4" stroke="${RED}" stroke-width="1.7"/><path d="M22 2 L28 3.5 L26.8 7.5 L20.8 6 Z" fill="${WHITE}" stroke="${NAVY}" stroke-width="1.3"/>`,
  section: `<path d="M16.5 4 H27 L30.5 7.5 V15 H20 L16.5 11.5 Z" fill="#fff3e0" stroke="#e07000" stroke-width="1.4"/><path d="M20.8 11 L23.5 8.3 L26.2 11" stroke="#e07000" stroke-width="1.4"/>`,
  dimension: `<path d="M17 4v11M30 4v11M17 9.5h13" stroke="${NAVY}" stroke-width="1.4"/><path d="M19.5 7.5 L17 9.5 L19.5 11.5 M27.5 7.5 L30 9.5 L27.5 11.5" stroke="${NAVY}" stroke-width="1.4"/>`,
  text: `<rect x="16.5" y="3" width="14" height="11" fill="${WHITE}" stroke="${NAVY}" stroke-width="1.4"/><path d="M19.5 7h8M19.5 10.5h5" stroke="${RED}" stroke-width="1.5"/>`,
  place: `<path d="M24 2 L30.5 5.5 V13 L24 16.5 L17.5 13 V5.5 Z" fill="${WHITE}" stroke="${NAVY}" stroke-width="1.3"/><path d="M17.5 5.5 L24 9 L30.5 5.5 M24 9 V16.5" stroke="${NAVY}" stroke-width="1.1"/>`,
  poscam: `<circle cx="24" cy="5.5" r="3.2" fill="${WHITE}" stroke="${NAVY}" stroke-width="1.4"/><path d="M24 9 V16 M20.5 16 H27.5" stroke="${NAVY}" stroke-width="1.5"/>`,
};

const pencil = (badge = '') => svg(badge + PENCIL);
const arrow = (badge = '') => svg(badge + ARROW);

interface Cur {
  svg: string;
  x: number;
  y: number;
}
const CURSORS: Record<string, Cur> = {
  select: { x: 4, y: 3, svg: arrow() },
  lasso: {
    x: 4,
    y: 3,
    svg: arrow(
      `<path d="M15 6 C24 1 31 6 29 12 C27 18 18 19 13 16" stroke="${LBLUE}" stroke-width="1.6" stroke-dasharray="2.6 2"/><path d="M13 16 C11 20 14 23 12 28" stroke="${LBLUE}" stroke-width="1.6"/>`,
    ),
  },
  eraser: {
    x: 6,
    y: 27,
    svg: svg(
      `<path d="M6 27 L3.5 22.5 L18.5 7.5 L26.5 15.5 L14 28 Z" fill="${WHITE}" stroke="${NAVY}" stroke-width="1.5"/><path d="M12.5 13.5 L18.5 7.5 L26.5 15.5 L20.5 21.5 Z" fill="${LBLUE}" stroke="${NAVY}" stroke-width="1.5"/><path d="M15 29.5 H29" stroke="${NAVY}" stroke-width="1.4"/>`,
    ),
  },
  paint: {
    x: 5,
    y: 26,
    svg: svg(
      `<path d="M11 9 C11 5 21 5 21 9 L22 22 C22 26 10 26 10 22 Z" fill="${WHITE}" stroke="${NAVY}" stroke-width="1.6"/><ellipse cx="16" cy="9" rx="5" ry="2" fill="${LBLUE}" stroke="${NAVY}" stroke-width="1.3"/><path d="M11.5 9 C7 10 4.5 15 5 26 C8 22 9 17 12 13 Z" fill="${LBLUE}" stroke="${LBLUE}" stroke-width="1"/><path d="M21 12 C26 10 27 6 24 3" stroke="${NAVY}" stroke-width="1.5"/>`,
    ),
  },
  sample: {
    x: 3,
    y: 29,
    svg: svg(
      `<path d="M3 29 L5 23 L17 11 L21 15 L9 27 Z" fill="${WHITE}" stroke="${NAVY}" stroke-width="1.6"/><path d="M15.5 9.5 L22.5 16.5 M18 7 C20 3 25 3 27.5 5.5 C30 8 30 12 25 14 Z" fill="${NAVY}" stroke="${NAVY}" stroke-width="1.6"/><circle cx="4" cy="28" r="1.4" fill="${LBLUE}"/>`,
    ),
  },
  line: { x: 3, y: 29, svg: pencil() },
  freehand: { x: 3, y: 29, svg: pencil(HOTSPOT_TOP_LEFT.freehand) },
  rectangle: { x: 3, y: 29, svg: pencil(HOTSPOT_TOP_LEFT.rect) },
  rotrect: { x: 3, y: 29, svg: pencil(HOTSPOT_TOP_LEFT.rotrect) },
  circle: { x: 3, y: 29, svg: pencil(HOTSPOT_TOP_LEFT.circle) },
  polygon: { x: 3, y: 29, svg: pencil(HOTSPOT_TOP_LEFT.polygon) },
  arc: { x: 3, y: 29, svg: pencil(HOTSPOT_TOP_LEFT.arc) },
  arc2: { x: 3, y: 29, svg: pencil(HOTSPOT_TOP_LEFT.arc2) },
  arc3: { x: 3, y: 29, svg: pencil(HOTSPOT_TOP_LEFT.arc3) },
  pie: { x: 3, y: 29, svg: pencil(HOTSPOT_TOP_LEFT.pie) },
  pushpull: { x: 4, y: 3, svg: arrow(HOTSPOT_TOP_RIGHT.pushpull) },
  offset: { x: 4, y: 3, svg: arrow(HOTSPOT_TOP_RIGHT.offset) },
  scale: { x: 4, y: 3, svg: arrow(HOTSPOT_TOP_RIGHT.scale) },
  followme: { x: 4, y: 3, svg: arrow(HOTSPOT_TOP_RIGHT.followme) },
  section: { x: 4, y: 3, svg: arrow(HOTSPOT_TOP_RIGHT.section) },
  dimension: { x: 4, y: 3, svg: arrow(HOTSPOT_TOP_RIGHT.dimension) },
  text: { x: 4, y: 3, svg: arrow(HOTSPOT_TOP_RIGHT.text) },
  place: { x: 4, y: 3, svg: arrow(HOTSPOT_TOP_RIGHT.place) },
  poscam: { x: 4, y: 3, svg: arrow(HOTSPOT_TOP_RIGHT.poscam) },
  move: {
    x: 16,
    y: 16,
    svg: svg(
      `<path d="M16 4 V28 M4 16 H28" stroke="${WHITE}" stroke-width="5"/><path d="M16 4 V28 M4 16 H28" stroke="${RED}" stroke-width="2.6"/><path d="M11.5 7.5 L16 2 L20.5 7.5 Z M11.5 24.5 L16 30 L20.5 24.5 Z M7.5 11.5 L2 16 L7.5 20.5 Z M24.5 11.5 L30 16 L24.5 20.5 Z" fill="${RED}" stroke="${WHITE}" stroke-width="1"/>`,
    ),
  },
  rotate: {
    x: 16,
    y: 16,
    svg: svg(
      `<path d="M26.5 12.5 A11 11 0 0 0 7.5 9" stroke="${WHITE}" stroke-width="5"/><path d="M5.5 19.5 A11 11 0 0 0 24.5 23" stroke="${WHITE}" stroke-width="5"/><path d="M26.5 12.5 A11 11 0 0 0 7.5 9" stroke="${RED}" stroke-width="2.8"/><path d="M5.5 19.5 A11 11 0 0 0 24.5 23" stroke="${RED}" stroke-width="2.8"/><path d="M3.5 6 L7.5 9.5 L11.5 5.2 Z M28.5 26 L24.5 22.5 L20.5 26.8 Z" fill="${RED}" stroke="${RED}" stroke-width="1.4"/><circle cx="16" cy="16" r="1.4" fill="${NAVY}"/>`,
    ),
  },
  protractor: {
    x: 16,
    y: 22,
    svg: svg(
      `<path d="M3 22 A13 13 0 0 1 29 22 Z" fill="${WHITE}" stroke="${NAVY}" stroke-width="1.7"/><path d="M8 22 A8 8 0 0 1 24 22" stroke="${NAVY}" stroke-width="1.3"/><path d="M16 22 L23.5 12.5" stroke="${RED}" stroke-width="1.7"/><path d="M6 15.5 L8 17 M11 11 L12 13.2 M21 11 L20 13.2 M26 15.5 L24 17" stroke="${NAVY}" stroke-width="1.2"/><circle cx="16" cy="22" r="1.5" fill="${NAVY}"/>`,
    ),
  },
  tape: {
    x: 3,
    y: 29,
    svg: svg(
      `<rect x="11" y="4" width="18" height="17" rx="5" fill="${WHITE}" stroke="${NAVY}" stroke-width="1.8"/><circle cx="20" cy="12.5" r="3.3" fill="${RED}"/><path d="M12.5 19 L4 27.5" stroke="${NAVY}" stroke-width="2.8"/><path d="M3 29 L6.5 25.5" stroke="${NAVY}" stroke-width="2"/>`,
    ),
  },
  orbit: {
    x: 16,
    y: 16,
    svg: svg(
      `<path d="M16 3 V29" stroke="${NAVY}" stroke-width="2.4"/><path d="M28.5 13.5 C30 17 25 21 16 21 S2 17 3.5 13.5" stroke="${WHITE}" stroke-width="5.5"/><path d="M28.5 13.5 C30 17 25 21 16 21 S2 17 3.5 13.5" stroke="${RED}" stroke-width="3.2"/><path d="M8 9.5 C10.5 8.6 13 8.2 16 8.2" stroke="${RED}" stroke-width="3.2"/><path d="M19.5 8.4 C23.5 8.7 26.5 9.8 28 11" stroke="${RED}" stroke-width="3.2"/><path d="M6.5 7 L2.5 11 L8.5 12.5 Z" fill="${RED}" stroke="${RED}" stroke-width="1"/>`,
    ),
  },
  pan: {
    x: 16,
    y: 18,
    svg: svg(
      `<path d="M11 19 V13.5 a1.8 1.8 0 0 1 3.6 0 V18 V11 a1.8 1.8 0 0 1 3.6 0 V18 V12.5 a1.8 1.8 0 0 1 3.6 0 V19 V15.5 a1.8 1.8 0 0 1 3.6 0 V22 c0 5 -3 8.5 -8 8.5 c-3.5 0 -5.5 -1.8 -7.5 -4.8 L7.2 21.6 a1.8 1.8 0 0 1 3 -2 L11 21" fill="${WHITE}" stroke="${NAVY}" stroke-width="1.6"/><path d="M7 5.5 H25" stroke="${RED}" stroke-width="2.2"/><path d="M10 2.5 L6 5.5 L10 8.5 Z M22 2.5 L26 5.5 L22 8.5 Z" fill="${RED}" stroke="${RED}" stroke-width="1"/>`,
    ),
  },
  zoom: {
    x: 12,
    y: 12,
    svg: svg(
      `<circle cx="12" cy="12" r="8.5" fill="${WHITE}" fill-opacity=".85" stroke="${NAVY}" stroke-width="2.2"/><path d="M18.5 18.5 L28.5 28.5" stroke="${NAVY}" stroke-width="3.6"/>`,
    ),
  },
  zoomwindow: {
    x: 3,
    y: 3,
    svg: svg(
      `<rect x="3" y="3" width="15" height="12" stroke="${LBLUE}" stroke-width="1.6" stroke-dasharray="2.5 2"/><circle cx="19" cy="18" r="6.5" fill="${WHITE}" fill-opacity=".85" stroke="${NAVY}" stroke-width="2"/><path d="M23.8 22.8 L29.5 28.5" stroke="${NAVY}" stroke-width="3.2"/>`,
    ),
  },
  lookaround: {
    x: 16,
    y: 16,
    svg: svg(
      `<path d="M3 16 C7 9 11.5 7 16 7 S25 9 29 16 C25 23 20.5 25 16 25 S7 23 3 16 Z" fill="${WHITE}" stroke="${NAVY}" stroke-width="1.8"/><circle cx="16" cy="16" r="5" fill="${LBLUE}"/><circle cx="16" cy="16" r="2.2" fill="${NAVY}"/><path d="M6 8.5 C9 5.5 12 4.5 16 4.5" stroke="${NAVY}" stroke-width="1.8"/>`,
    ),
  },
  walk: {
    x: 15,
    y: 29,
    svg: svg(
      `<circle cx="15" cy="4.5" r="2.6" fill="${NAVY}"/><path d="M14.5 8.5 L12 17 L15.5 21 L17 29 M12 17 L9 22 L6 29 M14 10.5 L18 14 L21 14 M14 10.5 L10.5 12.5 L9.5 16.5" stroke="${NAVY}" stroke-width="2.4"/><path d="M23 9 V29" stroke="${NAVY}" stroke-width="1.5"/><path d="M11 9 L9 13" stroke="${RED}" stroke-width="3"/>`,
    ),
  },
};

const cache = new Map<string, string>();

/** CSS cursor value for a tool (falls back to a crosshair). */
export const toolCursor = (tool: string): string => {
  const hit = cache.get(tool);
  if (hit) {
    return hit;
  }
  const cursor = CURSORS[tool];
  const css = cursor
    ? `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(cursor.svg.replace(/\s+/g, ' '))}") ${cursor.x} ${cursor.y}, crosshair`
    : 'crosshair';
  cache.set(tool, css);
  return css;
};

/** Raw SVG markup (used to preview cursors in the UI). */
export const toolCursorSvg = (tool: string): string | undefined => {
  return CURSORS[tool]?.svg;
};
